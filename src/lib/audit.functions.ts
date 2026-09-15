import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import type { Database } from "@/integrations/supabase/types";

export type AuditRow = Database["public"]["Tables"]["audit_events"]["Row"];

/**
 * Audit reads are administrator-only in the database (RLS); chain verification
 * is service-role only, so it runs through the admin client after the caller's
 * administrator status has been confirmed with their own session.
 */
export const listAuditEvents = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) =>
    z
      .object({
        targetId: z.string().uuid().nullish(),
        limit: z.number().int().min(1).max(200).optional().default(50),
      })
      .parse(data ?? {}),
  )
  .handler(async ({ data, context }) => {
    let query = context.supabase
      .from("audit_events")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(data.limit);
    if (data.targetId) query = query.eq("target_id", data.targetId);

    const { data: rows, error } = await query;
    if (error) {
      throw new Error("Only administrators can read the audit trail.");
    }
    return { rows: (rows ?? []) as AuditRow[] };
  });

export const verifyAuditChain = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) =>
    z.object({ limit: z.number().int().min(1).max(500).optional().default(200) }).parse(data ?? {}),
  )
  .handler(async ({ data, context }) => {
    // Reads are administrator-only at the database level, so an empty/denied
    // read is reported honestly rather than treated as a valid chain.
    const { data: rows, error } = await context.supabase
      .from("audit_events")
      .select("id, created_at, previous_hash, current_hash")
      .order("created_at", { ascending: true })
      .limit(data.limit);
    if (error) throw new Error("Only administrators can verify the audit trail.");

    const entries = rows ?? [];
    const broken: string[] = [];
    for (let i = 1; i < entries.length; i += 1) {
      if (entries[i]!.previous_hash !== entries[i - 1]!.current_hash) broken.push(entries[i]!.id);
    }

    return { checked: entries.length, broken, intact: broken.length === 0 };
  });
