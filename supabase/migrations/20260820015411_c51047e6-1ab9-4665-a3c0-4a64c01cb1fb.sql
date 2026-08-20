CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TYPE public.app_role AS ENUM ('administrator', 'judge', 'clerk');

CREATE TABLE public.profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  full_name VARCHAR(256) NOT NULL DEFAULT '',
  email VARCHAR(320) NOT NULL DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, UPDATE ON public.profiles TO authenticated;
GRANT ALL ON public.profiles TO service_role;
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

CREATE TABLE public.user_roles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role public.app_role NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, role)
);
GRANT SELECT ON public.user_roles TO authenticated;
GRANT ALL ON public.user_roles TO service_role;
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.has_role(_user_id UUID, _role public.app_role)
RETURNS BOOLEAN LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role = _role);
$$;

CREATE OR REPLACE FUNCTION public.is_staff(_user_id UUID)
RETURNS BOOLEAN LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = _user_id);
$$;

CREATE OR REPLACE FUNCTION public.can_view_sealed(_user_id UUID)
RETURNS BOOLEAN LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = _user_id AND role IN ('administrator','judge')
  );
$$;

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE first_user BOOLEAN;
BEGIN
  INSERT INTO public.profiles (id, full_name, email)
  VALUES (NEW.id, COALESCE(NEW.raw_user_meta_data->>'full_name', ''), COALESCE(NEW.email, ''))
  ON CONFLICT (id) DO NOTHING;

  SELECT NOT EXISTS (SELECT 1 FROM public.user_roles) INTO first_user;
  INSERT INTO public.user_roles (user_id, role)
  VALUES (NEW.id, CASE WHEN first_user THEN 'administrator'::public.app_role ELSE 'clerk'::public.app_role END)
  ON CONFLICT DO NOTHING;
  RETURN NEW;
END;
$$;

CREATE TRIGGER on_auth_user_created
AFTER INSERT ON auth.users
FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

CREATE OR REPLACE FUNCTION public.touch_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path = public AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END;
$$;

CREATE POLICY "profiles readable by staff" ON public.profiles
  FOR SELECT TO authenticated USING (public.is_staff(auth.uid()));
CREATE POLICY "own profile update" ON public.profiles
  FOR UPDATE TO authenticated USING (id = auth.uid()) WITH CHECK (id = auth.uid());
CREATE TRIGGER profiles_touch BEFORE UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

CREATE POLICY "roles readable by staff" ON public.user_roles
  FOR SELECT TO authenticated USING (public.is_staff(auth.uid()));
CREATE POLICY "admins manage roles" ON public.user_roles
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'administrator'))
  WITH CHECK (public.has_role(auth.uid(), 'administrator'));

-- ================= CASES =================
CREATE TABLE public.cases (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  case_title VARCHAR(512) NOT NULL,
  suit_number VARCHAR(128) NOT NULL UNIQUE,
  normalized_suit_number VARCHAR(128) NOT NULL UNIQUE,
  date_delivered DATE NULL,
  subject_matter VARCHAR(256) NOT NULL,
  document_type VARCHAR(64) NOT NULL CHECK (document_type IN ('judgment','ruling','order','case_file')),
  status VARCHAR(32) NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','pending_review','published','archived')),
  is_sealed BOOLEAN NOT NULL DEFAULT FALSE,
  created_by UUID NOT NULL REFERENCES auth.users(id),
  updated_by UUID NULL REFERENCES auth.users(id),
  deleted_at TIMESTAMPTZ NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_cases_normalized_suit ON public.cases (normalized_suit_number);
CREATE INDEX idx_cases_subject_matter ON public.cases (subject_matter);
CREATE INDEX idx_cases_document_type ON public.cases (document_type);
CREATE INDEX idx_cases_status ON public.cases (status);
CREATE INDEX idx_cases_date_delivered ON public.cases (date_delivered DESC);
CREATE INDEX idx_cases_title_trgm ON public.cases (lower(case_title));

GRANT SELECT, INSERT, UPDATE, DELETE ON public.cases TO authenticated;
GRANT ALL ON public.cases TO service_role;
ALTER TABLE public.cases ENABLE ROW LEVEL SECURITY;

CREATE POLICY "staff read cases" ON public.cases FOR SELECT TO authenticated
USING (
  public.is_staff(auth.uid())
  AND deleted_at IS NULL
  AND (is_sealed = FALSE OR public.can_view_sealed(auth.uid()) OR created_by = auth.uid())
);
CREATE POLICY "staff create cases" ON public.cases FOR INSERT TO authenticated
WITH CHECK (public.is_staff(auth.uid()) AND created_by = auth.uid() AND status = 'draft');
CREATE POLICY "authorized update cases" ON public.cases FOR UPDATE TO authenticated
USING (
  public.is_staff(auth.uid())
  AND deleted_at IS NULL
  AND (public.can_view_sealed(auth.uid()) OR (created_by = auth.uid() AND status = 'draft'))
)
WITH CHECK (public.is_staff(auth.uid()));
CREATE POLICY "admins delete cases" ON public.cases FOR DELETE TO authenticated
USING (public.has_role(auth.uid(), 'administrator'));

CREATE TRIGGER cases_touch BEFORE UPDATE ON public.cases
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- ================= PROCEEDINGS =================
CREATE TABLE public.case_proceedings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  case_id UUID NOT NULL REFERENCES public.cases(id) ON DELETE CASCADE,
  session_date DATE NOT NULL,
  presiding_judge VARCHAR(256) NOT NULL,
  summary_notes TEXT NULL,
  status VARCHAR(32) NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','published')),
  created_by UUID NOT NULL REFERENCES auth.users(id),
  deleted_at TIMESTAMPTZ NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (case_id, session_date)
);
CREATE INDEX idx_proceedings_case_date ON public.case_proceedings (case_id, session_date DESC);
CREATE INDEX idx_proceedings_judge ON public.case_proceedings (lower(presiding_judge));

GRANT SELECT, INSERT, UPDATE, DELETE ON public.case_proceedings TO authenticated;
GRANT ALL ON public.case_proceedings TO service_role;
ALTER TABLE public.case_proceedings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "staff read proceedings" ON public.case_proceedings FOR SELECT TO authenticated
USING (
  deleted_at IS NULL
  AND EXISTS (SELECT 1 FROM public.cases c WHERE c.id = case_id)
);
CREATE POLICY "staff create proceedings" ON public.case_proceedings FOR INSERT TO authenticated
WITH CHECK (
  public.is_staff(auth.uid()) AND created_by = auth.uid()
  AND EXISTS (SELECT 1 FROM public.cases c WHERE c.id = case_id)
);
CREATE POLICY "authorized update proceedings" ON public.case_proceedings FOR UPDATE TO authenticated
USING (
  deleted_at IS NULL
  AND (public.can_view_sealed(auth.uid()) OR (created_by = auth.uid() AND status = 'draft'))
  AND EXISTS (SELECT 1 FROM public.cases c WHERE c.id = case_id)
)
WITH CHECK (public.is_staff(auth.uid()));
CREATE POLICY "admins delete proceedings" ON public.case_proceedings FOR DELETE TO authenticated
USING (public.has_role(auth.uid(), 'administrator'));

CREATE TRIGGER proceedings_touch BEFORE UPDATE ON public.case_proceedings
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- ================= DOCUMENT FILES =================
CREATE TABLE public.document_files (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  attachable_type VARCHAR(256) NOT NULL CHECK (attachable_type IN ('Case','CaseProceeding')),
  attachable_id UUID NOT NULL,
  original_filename VARCHAR(255) NOT NULL,
  storage_path VARCHAR(512) NOT NULL,
  mime_type VARCHAR(128) NOT NULL,
  file_hash CHAR(64) NOT NULL,
  file_size BIGINT NOT NULL CHECK (file_size > 0),
  created_by UUID NOT NULL REFERENCES auth.users(id),
  deleted_at TIMESTAMPTZ NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_document_files_hash ON public.document_files (file_hash);
CREATE INDEX idx_document_files_attachable ON public.document_files (attachable_type, attachable_id);

GRANT SELECT, INSERT, UPDATE ON public.document_files TO authenticated;
GRANT ALL ON public.document_files TO service_role;
ALTER TABLE public.document_files ENABLE ROW LEVEL SECURITY;

CREATE POLICY "staff read files" ON public.document_files FOR SELECT TO authenticated
USING (
  deleted_at IS NULL AND (
    (attachable_type = 'Case' AND EXISTS (SELECT 1 FROM public.cases c WHERE c.id = attachable_id))
    OR (attachable_type = 'CaseProceeding' AND EXISTS (SELECT 1 FROM public.case_proceedings p WHERE p.id = attachable_id))
  )
);
CREATE POLICY "staff create files" ON public.document_files FOR INSERT TO authenticated
WITH CHECK (public.is_staff(auth.uid()) AND created_by = auth.uid());
CREATE POLICY "authorized soft delete files" ON public.document_files FOR UPDATE TO authenticated
USING (public.can_view_sealed(auth.uid()) OR created_by = auth.uid())
WITH CHECK (public.is_staff(auth.uid()));

-- ================= AUDIT CHAIN =================
CREATE TABLE public.audit_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NULL REFERENCES auth.users(id) ON DELETE SET NULL,
  action VARCHAR(64) NOT NULL,
  target_type VARCHAR(128) NOT NULL,
  target_id UUID NOT NULL,
  ip_address VARCHAR(45) NOT NULL DEFAULT 'unknown',
  user_agent TEXT NULL,
  metadata JSONB NULL,
  previous_hash CHAR(64) NULL,
  current_hash CHAR(64) NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_audit_created_at ON public.audit_events (created_at DESC);
CREATE INDEX idx_audit_user ON public.audit_events (user_id);
CREATE INDEX idx_audit_action ON public.audit_events (action);
CREATE INDEX idx_audit_target ON public.audit_events (target_type, target_id);

GRANT SELECT ON public.audit_events TO authenticated;
GRANT ALL ON public.audit_events TO service_role;
ALTER TABLE public.audit_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "admins read audit" ON public.audit_events FOR SELECT TO authenticated
USING (public.has_role(auth.uid(), 'administrator'));
-- no INSERT/UPDATE/DELETE policies: writes only through append_audit_event()

-- Canonicalization: sha256 over
-- id | user_id | action | target_type | target_id | created_at(ISO µs UTC) | metadata(compact jsonb text) | previous_hash
CREATE OR REPLACE FUNCTION public.append_audit_event(
  _action VARCHAR(64),
  _target_type VARCHAR(128),
  _target_id UUID,
  _ip_address VARCHAR(45) DEFAULT 'unknown',
  _user_agent TEXT DEFAULT NULL,
  _metadata JSONB DEFAULT NULL
) RETURNS UUID
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  _id UUID := gen_random_uuid();
  _now TIMESTAMPTZ := clock_timestamp();
  _prev CHAR(64);
  _canon TEXT;
  _hash CHAR(64);
BEGIN
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
$$;
GRANT EXECUTE ON FUNCTION public.append_audit_event(VARCHAR, VARCHAR, UUID, VARCHAR, TEXT, JSONB) TO authenticated, service_role;

-- Immutability backstop
CREATE OR REPLACE FUNCTION public.audit_events_immutable()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  RAISE EXCEPTION 'audit_events is append-only and immutable';
END;
$$;
CREATE TRIGGER audit_events_no_update BEFORE UPDATE ON public.audit_events
  FOR EACH ROW EXECUTE FUNCTION public.audit_events_immutable();
CREATE TRIGGER audit_events_no_delete BEFORE DELETE ON public.audit_events
  FOR EACH ROW EXECUTE FUNCTION public.audit_events_immutable();

-- Chain verification helper (admins only, enforced in application layer + here)
CREATE OR REPLACE FUNCTION public.verify_audit_chain(_limit INT DEFAULT 500)
RETURNS TABLE (id UUID, created_at TIMESTAMPTZ, valid BOOLEAN)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT public.has_role(auth.uid(), 'administrator') THEN
    RAISE EXCEPTION 'forbidden';
  END IF;
  RETURN QUERY
  WITH ordered AS (
    SELECT e.*, LAG(e.current_hash) OVER (ORDER BY e.created_at, e.id) AS expected_prev
    FROM public.audit_events e
    ORDER BY e.created_at DESC, e.id DESC
    LIMIT _limit
  )
  SELECT o.id, o.created_at,
    (encode(digest(concat_ws('|',
      o.id::text, COALESCE(o.user_id::text,''), o.action, o.target_type, o.target_id::text,
      to_char(o.created_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"'),
      COALESCE(o.metadata::text,''), COALESCE(o.previous_hash,'')
    ), 'sha256'), 'hex') = o.current_hash)
    AND (o.expected_prev IS NULL OR o.expected_prev = o.previous_hash) AS valid
  FROM ordered o
  ORDER BY o.created_at DESC;
END;
$$;
GRANT EXECUTE ON FUNCTION public.verify_audit_chain(INT) TO authenticated, service_role;

-- ================= DOMAIN EVENT QUEUE (future AI/OCR extension point) =================
CREATE TABLE public.domain_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_name VARCHAR(64) NOT NULL,
  target_type VARCHAR(128) NOT NULL,
  target_id UUID NOT NULL,
  payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  status VARCHAR(32) NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','processing','completed','failed')),
  attempts INT NOT NULL DEFAULT 0,
  last_error TEXT NULL,
  available_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  processed_at TIMESTAMPTZ NULL,
  created_by UUID NULL REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_domain_events_pending ON public.domain_events (status, available_at);
CREATE INDEX idx_domain_events_target ON public.domain_events (target_type, target_id);

GRANT SELECT ON public.domain_events TO authenticated;
GRANT ALL ON public.domain_events TO service_role;
ALTER TABLE public.domain_events ENABLE ROW LEVEL SECURITY;
CREATE POLICY "admins read domain events" ON public.domain_events FOR SELECT TO authenticated
USING (public.has_role(auth.uid(), 'administrator'));

CREATE OR REPLACE FUNCTION public.emit_domain_event(
  _event_name VARCHAR(64),
  _target_type VARCHAR(128),
  _target_id UUID,
  _payload JSONB DEFAULT '{}'::jsonb
) RETURNS UUID
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _id UUID;
BEGIN
  INSERT INTO public.domain_events (event_name, target_type, target_id, payload, created_by)
  VALUES (_event_name, _target_type, _target_id, COALESCE(_payload, '{}'::jsonb), auth.uid())
  RETURNING id INTO _id;
  RETURN _id;
END;
$$;
GRANT EXECUTE ON FUNCTION public.emit_domain_event(VARCHAR, VARCHAR, UUID, JSONB) TO authenticated, service_role;