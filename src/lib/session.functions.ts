import { createServerFn } from "@tanstack/react-start";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import type { AppRole } from "@/lib/roles";

export const getMyAccess = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const [{ data: roleRows }, { data: profile }] = await Promise.all([
      context.supabase.from("user_roles").select("role").eq("user_id", context.userId),
      context.supabase.from("profiles").select("*").eq("id", context.userId).maybeSingle(),
    ]);

    return {
      userId: context.userId,
      roles: (roleRows ?? []).map((r) => r.role as AppRole),
      fullName: profile?.full_name ?? "",
      email: profile?.email ?? "",
    };
  });
