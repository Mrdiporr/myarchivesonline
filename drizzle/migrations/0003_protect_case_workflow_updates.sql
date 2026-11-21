DROP POLICY IF EXISTS "authorized update cases" ON public.cases;
DROP POLICY IF EXISTS "authorized update proceedings" ON public.case_proceedings;
REVOKE UPDATE ON TABLE public.cases FROM authenticated;
REVOKE UPDATE ON TABLE public.case_proceedings FROM authenticated;