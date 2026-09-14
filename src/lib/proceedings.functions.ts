import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import type { Database } from "@/integrations/supabase/types";
import type { AppRole } from "@/lib/roles";

export type ProceedingRow = Database["public"]["Tables"]["case_proceedings"]["Row"];

async function rolesOf(supabase: any, userId: string): Promise<AppRole[]> {
  const { data, error } = await supabase.from("user_roles").select("role").eq("user_id", userId);
  if (error) throw new Error("Could not verify your access level.");
  return (data ?? []).map((r: { role: AppRole }) => r.role);
}

const fields = {
  session_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Use a valid session date"),
  presiding_judge: z.string().trim().min(2, "Presiding judge is required").max(200),
  summary_notes: z
    .string()
    .trim()
    .max(20000)
    .nullish()
    .transform((v) => v ?? null),
};

export const listProceedings = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => z.object({ caseId: z.string().uuid() }).parse(data))
  .handler(async ({ data, context }) => {
    const { data: rows, error } = await context.supabase
      .from("case_proceedings")
      .select("*")
      .eq("case_id", data.caseId)
      .is("deleted_at", null)
      .order("session_date", { ascending: false });
    if (error) throw new Error(error.message);
    return { rows: (rows ?? []) as ProceedingRow[] };
  });

export const createProceeding = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) =>
    z.object({ case_id: z.string().uuid(), ...fields }).parse(data),
  )
  .handler(async ({ data, context }) => {
    const roles = await rolesOf(context.supabase, context.userId);
    if (roles.length === 0) throw new Error("Only court staff can record sessions.");

    const { data: row, error } = await context.supabase
      .from("case_proceedings")
      .insert({
        case_id: data.case_id,
        session_date: data.session_date,
        presiding_judge: data.presiding_judge,
        summary_notes: data.summary_notes,
        status: "draft",
        created_by: context.userId,
      })
      .select()
      .single();

    if (error) {
      if (error.code === "23505") {
        throw new Error("A session for this case on that date already exists.");
      }
      throw new Error(error.message);
    }

    const { recordAudit, emitDomainEvent } = await import("./audit.server");
    await recordAudit({
      action: "proceeding.created",
      targetType: "CaseProceeding",
      targetId: row.id,
      actorId: context.userId,
      metadata: { case_id: data.case_id, session_date: data.session_date },
    });
    await emitDomainEvent({
      eventName: "proceeding.created",
      targetType: "CaseProceeding",
      targetId: row.id,
      payload: { case_id: data.case_id },
    });

    return { row: row as ProceedingRow };
  });

export const updateProceeding = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) =>
    z
      .object({
        id: z.string().uuid(),
        status: z.enum(["draft", "published"]).optional(),
        ...fields,
      })
      .parse(data),
  )
  .handler(async ({ data, context }) => {
    const roles = await rolesOf(context.supabase, context.userId);
    if (roles.length === 0) throw new Error("Only court staff can edit sessions.");

    const { data: existing, error: readError } = await context.supabase
      .from("case_proceedings")
      .select("*")
      .eq("id", data.id)
      .is("deleted_at", null)
      .maybeSingle();
    if (readError) throw new Error(readError.message);
    if (!existing) throw new Error("This session no longer exists, or you cannot access it.");

    const senior = roles.includes("administrator") || roles.includes("judge");
    const ownDraft = existing.created_by === context.userId && existing.status === "draft";
    if (!senior && !ownDraft) {
      throw new Error("You can only edit your own session while it is still a draft.");
    }
    if (data.status === "published" && !senior) {
      throw new Error("Only administrators and judges can publish a session record.");
    }

    const { data: row, error } = await context.supabase
      .from("case_proceedings")
      .update({
        session_date: data.session_date,
        presiding_judge: data.presiding_judge,
        summary_notes: data.summary_notes,
        ...(data.status ? { status: data.status } : {}),
      })
      .eq("id", data.id)
      .select()
      .single();
    if (error) throw new Error(error.message);

    const { recordAudit, emitDomainEvent } = await import("./audit.server");
    await recordAudit({
      action: data.status === "published" ? "proceeding.published" : "proceeding.updated",
      targetType: "CaseProceeding",
      targetId: row.id,
      actorId: context.userId,
      metadata: { case_id: row.case_id, session_date: row.session_date },
    });
    await emitDomainEvent({
      eventName: data.status === "published" ? "proceeding.published" : "proceeding.updated",
      targetType: "CaseProceeding",
      targetId: row.id,
      payload: { case_id: row.case_id },
    });

    return { row: row as ProceedingRow };
  });
