import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import type { Database } from "@/integrations/supabase/types";
import { CASE_STATUSES, DOCUMENT_TYPES, type AppRole } from "@/lib/roles";

export type CaseRow = Database["public"]["Tables"]["cases"]["Row"];

type AuthedSupabase = Parameters<typeof rolesOf>[0];

async function rolesOf(
  supabase: { from: (t: "user_roles") => any },
  userId: string,
): Promise<AppRole[]> {
  const { data, error } = await supabase
    .from("user_roles")
    .select("role")
    .eq("user_id", userId);
  if (error) throw new Error("Could not verify your access level.");
  return (data ?? []).map((r: { role: AppRole }) => r.role);
}

function senior(roles: AppRole[]) {
  return roles.includes("administrator") || roles.includes("judge");
}

function normalizeSuit(value: string) {
  return value.toUpperCase().replace(/[^A-Z0-9]/g, "");
}

const caseFields = {
  case_title: z.string().trim().min(3, "Case title is too short").max(300),
  suit_number: z.string().trim().min(2, "Suit number is required").max(100),
  subject_matter: z.string().trim().min(2, "Subject matter is required").max(300),
  document_type: z.enum(DOCUMENT_TYPES),
  date_delivered: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, "Use a valid date")
    .nullish()
    .transform((v) => v ?? null),
  is_sealed: z.boolean().optional().default(false),
};

const createSchema = z.object(caseFields);
const updateSchema = z.object({ id: z.string().uuid(), ...caseFields });
const idSchema = z.object({ id: z.string().uuid() });

const listSchema = z.object({
  search: z.string().trim().max(200).optional().default(""),
  status: z.enum(CASE_STATUSES).nullish(),
  documentType: z.enum(DOCUMENT_TYPES).nullish(),
  from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullish(),
  to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullish(),
  page: z.number().int().min(1).max(1000).optional().default(1),
  pageSize: z.number().int().min(5).max(100).optional().default(20),
});

export const listCases = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => listSchema.parse(data ?? {}))
  .handler(async ({ data, context }) => {
    const roles = await rolesOf(context.supabase as AuthedSupabase, context.userId);
    if (roles.length === 0) throw new Error("Your account has no court role assigned yet.");

    let query = context.supabase
      .from("cases")
      .select("*", { count: "exact" })
      .is("deleted_at", null);

    const search = data.search.replace(/[%,()]/g, " ").trim();
    if (search) {
      query = query.or(
        `case_title.ilike.%${search}%,suit_number.ilike.%${search}%,subject_matter.ilike.%${search}%`,
      );
    }
    if (data.status) query = query.eq("status", data.status);
    if (data.documentType) query = query.eq("document_type", data.documentType);
    if (data.from) query = query.gte("date_delivered", data.from);
    if (data.to) query = query.lte("date_delivered", data.to);

    const start = (data.page - 1) * data.pageSize;
    const { data: rows, count, error } = await query
      .order("updated_at", { ascending: false })
      .range(start, start + data.pageSize - 1);

    if (error) throw new Error(error.message);
    return { rows: (rows ?? []) as CaseRow[], total: count ?? 0, roles };
  });

export const getCase = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => idSchema.parse(data))
  .handler(async ({ data, context }) => {
    const roles = await rolesOf(context.supabase as AuthedSupabase, context.userId);
    if (roles.length === 0) throw new Error("Your account has no court role assigned yet.");

    const { data: row, error } = await context.supabase
      .from("cases")
      .select("*")
      .eq("id", data.id)
      .is("deleted_at", null)
      .maybeSingle();

    if (error) throw new Error(error.message);
    if (!row) throw new Error("This case does not exist, or you are not cleared to view it.");
    return { row: row as CaseRow, roles, userId: context.userId };
  });

export const createCase = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => createSchema.parse(data))
  .handler(async ({ data, context }) => {
    const roles = await rolesOf(context.supabase as AuthedSupabase, context.userId);
    if (roles.length === 0) throw new Error("Only court staff can create cases.");
    if (data.is_sealed && !senior(roles)) {
      throw new Error("Only administrators and judges can seal a case.");
    }

    const { data: row, error } = await context.supabase
      .from("cases")
      .insert({
        case_title: data.case_title,
        suit_number: data.suit_number,
        normalized_suit_number: normalizeSuit(data.suit_number),
        subject_matter: data.subject_matter,
        document_type: data.document_type,
        date_delivered: data.date_delivered,
        is_sealed: data.is_sealed ?? false,
        status: "draft",
        created_by: context.userId,
      })
      .select()
      .single();

    if (error) {
      if (error.code === "23505") {
        throw new Error("A case with this suit number already exists.");
      }
      throw new Error(error.message);
    }

    const { recordAudit, emitDomainEvent } = await import("./audit.server");
    await recordAudit({
      action: "case.created",
      targetType: "Case",
      targetId: row.id,
      actorId: context.userId,
      metadata: { suit_number: row.suit_number, document_type: row.document_type },
    });
    await emitDomainEvent({
      eventName: "case.created",
      targetType: "Case",
      targetId: row.id,
      payload: { status: row.status },
    });

    return { row: row as CaseRow };
  });

export const updateCase = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => updateSchema.parse(data))
  .handler(async ({ data, context }) => {
    const roles = await rolesOf(context.supabase as AuthedSupabase, context.userId);
    if (roles.length === 0) throw new Error("Only court staff can edit cases.");

    const { data: existing, error: readError } = await context.supabase
      .from("cases")
      .select("*")
      .eq("id", data.id)
      .is("deleted_at", null)
      .maybeSingle();
    if (readError) throw new Error(readError.message);
    if (!existing) throw new Error("This case does not exist, or you are not cleared to view it.");

    if (existing.status === "archived") {
      throw new Error("Archived cases are read-only.");
    }
    const isOwnDraft = existing.created_by === context.userId && existing.status === "draft";
    if (!senior(roles) && !isOwnDraft) {
      throw new Error("You can only edit your own case while it is still a draft.");
    }
    if (data.is_sealed !== existing.is_sealed && !senior(roles)) {
      throw new Error("Only administrators and judges can change the sealed status.");
    }

    const { data: row, error } = await context.supabase
      .from("cases")
      .update({
        case_title: data.case_title,
        suit_number: data.suit_number,
        normalized_suit_number: normalizeSuit(data.suit_number),
        subject_matter: data.subject_matter,
        document_type: data.document_type,
        date_delivered: data.date_delivered,
        is_sealed: data.is_sealed ?? existing.is_sealed,
        updated_by: context.userId,
      })
      .eq("id", data.id)
      .select()
      .single();

    if (error) {
      if (error.code === "23505") throw new Error("A case with this suit number already exists.");
      throw new Error(error.message);
    }

    const { recordAudit, emitDomainEvent } = await import("./audit.server");
    await recordAudit({
      action: "case.updated",
      targetType: "Case",
      targetId: row.id,
      actorId: context.userId,
      metadata: { suit_number: row.suit_number },
    });
    await emitDomainEvent({
      eventName: "case.updated",
      targetType: "Case",
      targetId: row.id,
      payload: { status: row.status },
    });

    return { row: row as CaseRow };
  });

async function runTransition(args: {
  context: { supabase: AuthedSupabase & { from: any }; userId: string };
  id: string;
  from: string[];
  to: string;
  action: string;
  allow: (roles: AppRole[], caseRow: CaseRow, userId: string) => boolean;
  denied: string;
  wrongState: string;
}) {
  const { context } = args;
  const roles = await rolesOf(context.supabase as AuthedSupabase, context.userId);
  if (roles.length === 0) throw new Error("Your account has no court role assigned yet.");

  const { data: existing, error: readError } = await context.supabase
    .from("cases")
    .select("*")
    .eq("id", args.id)
    .is("deleted_at", null)
    .maybeSingle();
  if (readError) throw new Error(readError.message);
  if (!existing) throw new Error("This case does not exist, or you are not cleared to view it.");

  const caseRow = existing as CaseRow;
  if (!args.from.includes(caseRow.status)) throw new Error(args.wrongState);
  if (!args.allow(roles, caseRow, context.userId)) throw new Error(args.denied);

  const { data: row, error } = await context.supabase
    .from("cases")
    .update({ status: args.to, updated_by: context.userId })
    .eq("id", args.id)
    .eq("status", caseRow.status)
    .select()
    .single();
  if (error) throw new Error(error.message);

  const { recordAudit, emitDomainEvent } = await import("./audit.server");
  await recordAudit({
    action: args.action,
    targetType: "Case",
    targetId: args.id,
    actorId: context.userId,
    metadata: { from: caseRow.status, to: args.to, suit_number: caseRow.suit_number },
  });
  await emitDomainEvent({
    eventName: args.action,
    targetType: "Case",
    targetId: args.id,
    payload: { from: caseRow.status, to: args.to },
  });

  return { row: row as CaseRow };
}

export const submitCaseForReview = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => idSchema.parse(data))
  .handler(async ({ data, context }) =>
    runTransition({
      context: context as any,
      id: data.id,
      from: ["draft"],
      to: "pending_review",
      action: "case.submitted_for_review",
      allow: (roles, row, userId) => senior(roles) || row.created_by === userId,
      denied: "Only the case author or a senior officer can submit this case for review.",
      wrongState: "Only draft cases can be submitted for review.",
    }),
  );

export const publishCase = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => idSchema.parse(data))
  .handler(async ({ data, context }) =>
    runTransition({
      context: context as any,
      id: data.id,
      from: ["pending_review"],
      to: "published",
      action: "case.published",
      allow: (roles) => senior(roles),
      denied: "Only administrators and judges can publish a case.",
      wrongState: "Only cases pending review can be published.",
    }),
  );

export const archiveCase = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => idSchema.parse(data))
  .handler(async ({ data, context }) =>
    runTransition({
      context: context as any,
      id: data.id,
      from: ["published"],
      to: "archived",
      action: "case.archived",
      allow: (roles) => roles.includes("administrator"),
      denied: "Only administrators can archive a case.",
      wrongState: "Only published cases can be archived.",
    }),
  );

export const getDashboard = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const roles = await rolesOf(context.supabase as AuthedSupabase, context.userId);
    if (roles.length === 0) throw new Error("Your account has no court role assigned yet.");

    const counts: Record<string, number> = {};
    for (const status of CASE_STATUSES) {
      const { count } = await context.supabase
        .from("cases")
        .select("id", { count: "exact", head: true })
        .is("deleted_at", null)
        .eq("status", status);
      counts[status] = count ?? 0;
    }

    const { data: awaiting } = await context.supabase
      .from("cases")
      .select("*")
      .is("deleted_at", null)
      .eq("status", "pending_review")
      .order("updated_at", { ascending: false })
      .limit(6);

    const { data: recent } = await context.supabase
      .from("cases")
      .select("*")
      .is("deleted_at", null)
      .order("updated_at", { ascending: false })
      .limit(8);

    const { count: sessionCount } = await context.supabase
      .from("case_proceedings")
      .select("id", { count: "exact", head: true })
      .is("deleted_at", null);

    return {
      counts,
      awaiting: (awaiting ?? []) as CaseRow[],
      recent: (recent ?? []) as CaseRow[],
      sessionCount: sessionCount ?? 0,
      roles,
    };
  });
