-- 1. Case proceedings: require staff + sealed-case visibility
DROP POLICY IF EXISTS "staff read proceedings" ON public.case_proceedings;
CREATE POLICY "staff read proceedings" ON public.case_proceedings
FOR SELECT TO authenticated
USING (
  deleted_at IS NULL
  AND public.is_staff(auth.uid())
  AND EXISTS (
    SELECT 1 FROM public.cases c
    WHERE c.id = case_proceedings.case_id
      AND c.deleted_at IS NULL
      AND (c.is_sealed = false OR public.can_view_sealed(auth.uid()) OR c.created_by = auth.uid())
  )
);

DROP POLICY IF EXISTS "authorized update proceedings" ON public.case_proceedings;
CREATE POLICY "authorized update proceedings" ON public.case_proceedings
FOR UPDATE TO authenticated
USING (
  deleted_at IS NULL
  AND public.is_staff(auth.uid())
  AND (public.can_view_sealed(auth.uid()) OR (created_by = auth.uid() AND status = 'draft'))
  AND EXISTS (
    SELECT 1 FROM public.cases c
    WHERE c.id = case_proceedings.case_id
      AND c.deleted_at IS NULL
      AND (c.is_sealed = false OR public.can_view_sealed(auth.uid()) OR c.created_by = auth.uid())
  )
)
WITH CHECK (public.is_staff(auth.uid()));

-- 2. Document files: require staff + sealed-case visibility
CREATE OR REPLACE FUNCTION public.can_access_attachable(_type character varying, _id uuid)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT CASE
    WHEN NOT public.is_staff(auth.uid()) THEN false
    WHEN _type = 'Case' THEN EXISTS (
      SELECT 1 FROM public.cases c
      WHERE c.id = _id AND c.deleted_at IS NULL
        AND (c.is_sealed = false OR public.can_view_sealed(auth.uid()) OR c.created_by = auth.uid())
    )
    WHEN _type = 'CaseProceeding' THEN EXISTS (
      SELECT 1 FROM public.case_proceedings p
      JOIN public.cases c ON c.id = p.case_id
      WHERE p.id = _id AND p.deleted_at IS NULL AND c.deleted_at IS NULL
        AND (c.is_sealed = false OR public.can_view_sealed(auth.uid()) OR c.created_by = auth.uid())
    )
    ELSE false
  END;
$$;

DROP POLICY IF EXISTS "staff read files" ON public.document_files;
CREATE POLICY "staff read files" ON public.document_files
FOR SELECT TO authenticated
USING (
  deleted_at IS NULL
  AND public.can_access_attachable(attachable_type, attachable_id)
);

DROP POLICY IF EXISTS "staff create files" ON public.document_files;
CREATE POLICY "staff create files" ON public.document_files
FOR INSERT TO authenticated
WITH CHECK (
  public.is_staff(auth.uid())
  AND created_by = auth.uid()
  AND public.can_access_attachable(attachable_type, attachable_id)
);

DROP POLICY IF EXISTS "authorized soft delete files" ON public.document_files;
CREATE POLICY "authorized soft delete files" ON public.document_files
FOR UPDATE TO authenticated
USING (
  public.can_access_attachable(attachable_type, attachable_id)
  AND (public.can_view_sealed(auth.uid()) OR created_by = auth.uid())
)
WITH CHECK (public.is_staff(auth.uid()));

-- 3. Storage policies for the private case-documents bucket
DROP POLICY IF EXISTS "case docs staff read" ON storage.objects;
CREATE POLICY "case docs staff read" ON storage.objects
FOR SELECT TO authenticated
USING (
  bucket_id = 'case-documents'
  AND EXISTS (
    SELECT 1 FROM public.document_files df
    WHERE df.storage_path = storage.objects.name
      AND df.deleted_at IS NULL
      AND public.can_access_attachable(df.attachable_type, df.attachable_id)
  )
);

DROP POLICY IF EXISTS "case docs staff upload" ON storage.objects;
CREATE POLICY "case docs staff upload" ON storage.objects
FOR INSERT TO authenticated
WITH CHECK (
  bucket_id = 'case-documents'
  AND public.is_staff(auth.uid())
  AND owner = auth.uid()
);

DROP POLICY IF EXISTS "case docs owner update" ON storage.objects;
CREATE POLICY "case docs owner update" ON storage.objects
FOR UPDATE TO authenticated
USING (
  bucket_id = 'case-documents'
  AND public.is_staff(auth.uid())
  AND (owner = auth.uid() OR public.has_role(auth.uid(), 'administrator'))
)
WITH CHECK (bucket_id = 'case-documents' AND public.is_staff(auth.uid()));

DROP POLICY IF EXISTS "case docs admin delete" ON storage.objects;
CREATE POLICY "case docs admin delete" ON storage.objects
FOR DELETE TO authenticated
USING (
  bucket_id = 'case-documents'
  AND public.has_role(auth.uid(), 'administrator')
);

-- 4. Audit/event functions: not callable by clients (server/service_role only)
REVOKE ALL ON FUNCTION public.append_audit_event(character varying, character varying, uuid, character varying, text, jsonb) FROM anon, authenticated, public;
REVOKE ALL ON FUNCTION public.emit_domain_event(character varying, character varying, uuid, jsonb) FROM anon, authenticated, public;
REVOKE ALL ON FUNCTION public.verify_audit_chain(integer) FROM anon, authenticated, public;
GRANT EXECUTE ON FUNCTION public.append_audit_event(character varying, character varying, uuid, character varying, text, jsonb) TO service_role;
GRANT EXECUTE ON FUNCTION public.emit_domain_event(character varying, character varying, uuid, jsonb) TO service_role;
GRANT EXECUTE ON FUNCTION public.verify_audit_chain(integer) TO service_role;

-- Keep RLS helper functions callable (needed by policies), scoped to needed roles
REVOKE ALL ON FUNCTION public.can_access_attachable(character varying, uuid) FROM anon, public;
GRANT EXECUTE ON FUNCTION public.can_access_attachable(character varying, uuid) TO authenticated, service_role;

-- 5. Validate audit input inside the function itself (defence in depth)
CREATE OR REPLACE FUNCTION public.append_audit_event(_action character varying, _target_type character varying, _target_id uuid, _ip_address character varying DEFAULT 'unknown'::character varying, _user_agent text DEFAULT NULL::text, _metadata jsonb DEFAULT NULL::jsonb)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  _id UUID := gen_random_uuid();
  _now TIMESTAMPTZ := clock_timestamp();
  _prev CHAR(64);
  _canon TEXT;
  _hash CHAR(64);
BEGIN
  IF current_setting('role', true) NOT IN ('service_role') AND session_user <> 'postgres' THEN
    RAISE EXCEPTION 'forbidden';
  END IF;

  IF _action IS NULL OR length(_action) = 0 OR length(_action) > 64 THEN
    RAISE EXCEPTION 'invalid action';
  END IF;
  IF _target_type NOT IN ('Case','CaseProceeding','DocumentFile','User','Role','System') THEN
    RAISE EXCEPTION 'invalid target_type';
  END IF;
  IF _target_id IS NULL THEN
    RAISE EXCEPTION 'invalid target_id';
  END IF;
  IF _ip_address IS NOT NULL AND length(_ip_address) > 64 THEN
    RAISE EXCEPTION 'invalid ip_address';
  END IF;
  IF _user_agent IS NOT NULL AND length(_user_agent) > 512 THEN
    _user_agent := left(_user_agent, 512);
  END IF;

  PERFORM pg_advisory_xact_lock(hashtext('public.audit_events'));
  SELECT current_hash INTO _prev FROM public.audit_events ORDER BY created_at DESC, id DESC LIMIT 1;
  _canon := concat_ws('|',
    _id::text,
    COALESCE(auth.uid()::text, ''),
    _action,
    _target_type,
    _target_id::text,
    to_char(_now AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"'),
    COALESCE(_metadata::text, ''),
    COALESCE(_prev, '')
  );
  _hash := encode(digest(_canon, 'sha256'), 'hex');
  INSERT INTO public.audit_events (id, user_id, action, target_type, target_id, ip_address, user_agent, metadata, previous_hash, current_hash, created_at)
  VALUES (_id, auth.uid(), _action, _target_type, _target_id, COALESCE(_ip_address,'unknown'), _user_agent, _metadata, _prev, _hash, _now);
  RETURN _id;
END;
$function$;