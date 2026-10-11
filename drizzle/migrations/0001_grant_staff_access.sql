GRANT SELECT, INSERT, UPDATE, DELETE ON public.cases, public.case_proceedings, public.document_files, public.user_roles TO authenticated;
GRANT SELECT, UPDATE ON public.profiles TO authenticated;
GRANT SELECT ON public.audit_events, public.domain_events TO authenticated;
GRANT ALL ON public.cases, public.case_proceedings, public.document_files, public.user_roles, public.profiles, public.audit_events, public.domain_events TO service_role;
GRANT EXECUTE ON FUNCTION public.is_staff(uuid), public.can_view_sealed(uuid) TO authenticated;