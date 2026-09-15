import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import type { AppRole } from "@/lib/roles";

export type StaffMember = {
  id: string;
  full_name: string;
  email: string;
  roles: AppRole[];
  created_at: string;
};

async function assertAdministrator(supabase: any, userId: string) {
  const { data, error } = await supabase.rpc("has_role", {
    _user_id: userId,
    _role: "administrator",
  });
  if (error) throw new Error("Could not verify your access level.");
  if (!data) throw new Error("Only administrators can manage staff roles.");
}

export const listStaff = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAdministrator(context.supabase, context.userId);

    const [{ data: profiles, error: profileError }, { data: roleRows, error: roleError }] =
      await Promise.all([
        context.supabase.from("profiles").select("*").order("created_at", { ascending: true }),
        context.supabase.from("user_roles").select("user_id, role"),
      ]);
    if (profileError) throw new Error(profileError.message);
    if (roleError) throw new Error(roleError.message);

    const byUser = new Map<string, AppRole[]>();
    for (const row of roleRows ?? []) {
      const list = byUser.get(row.user_id) ?? [];
      list.push(row.role as AppRole);
      byUser.set(row.user_id, list);
    }

    const staff: StaffMember[] = (profiles ?? []).map((p) => ({
      id: p.id,
      full_name: p.full_name,
      email: p.email,
      created_at: p.created_at,
      roles: byUser.get(p.id) ?? [],
    }));

    return { staff, selfId: context.userId };
  });

export const setStaffRole = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) =>
    z
      .object({
        userId: z.string().uuid(),
        role: z.enum(["administrator", "judge", "clerk"]),
      })
      .parse(data),
  )
  .handler(async ({ data, context }) => {
    await assertAdministrator(context.supabase, context.userId);

    if (data.userId === context.userId && data.role !== "administrator") {
      throw new Error("You cannot remove your own administrator role.");
    }

    const { error: clearError } = await context.supabase
      .from("user_roles")
      .delete()
      .eq("user_id", data.userId);
    if (clearError) throw new Error(clearError.message);

    const { error: insertError } = await context.supabase
      .from("user_roles")
      .insert({ user_id: data.userId, role: data.role });
    if (insertError) throw new Error(insertError.message);

    const { recordAudit, emitDomainEvent } = await import("./audit.server");
    await recordAudit({
      action: "role.changed",
      targetType: "Role",
      targetId: data.userId,
      actorId: context.userId,
      metadata: { role: data.role },
    });
    await emitDomainEvent({
      eventName: "role.changed",
      targetType: "Role",
      targetId: data.userId,
      payload: { role: data.role },
    });

    return { ok: true };
  });
