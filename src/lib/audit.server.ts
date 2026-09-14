// Server-only audit + domain-event helpers.
// `append_audit_event` / `emit_domain_event` are revoked from client roles, so
// they are invoked here with the service-role client after the caller has
// already been authorised inside a server function handler.
import { getRequest } from "@tanstack/react-start/server";

import { supabaseAdmin } from "@/integrations/supabase/client.server";
import type { Json } from "@/integrations/supabase/types";

export type AuditTargetType =
  | "Case"
  | "CaseProceeding"
  | "DocumentFile"
  | "User"
  | "Role"
  | "System";

function requestMeta(): { ip: string; userAgent: string | undefined } {
  try {
    const request = getRequest();
    const headers = request?.headers;
    const ip =
      headers?.get("cf-connecting-ip") ??
      headers?.get("x-forwarded-for")?.split(",")[0]?.trim() ??
      "unknown";
    return { ip: ip.slice(0, 64), userAgent: headers?.get("user-agent") ?? undefined };
  } catch {
    return { ip: "unknown", userAgent: undefined };
  }
}

/**
 * Appends a tamper-evident audit entry. The chained hash is computed in the
 * database; the acting user is carried in metadata because the service-role
 * session has no auth.uid().
 */
export async function recordAudit(input: {
  action: string;
  targetType: AuditTargetType;
  targetId: string;
  actorId: string;
  metadata?: Record<string, unknown>;
}): Promise<void> {
  const { ip, userAgent } = requestMeta();
  const metadata = { ...(input.metadata ?? {}), actor_id: input.actorId };

  const { error } = await supabaseAdmin.rpc("append_audit_event", {
    _action: input.action,
    _target_type: input.targetType,
    _target_id: input.targetId,
    _ip_address: ip,
    _user_agent: userAgent,
    _metadata: metadata as Json,
  });

  if (error) {
    // Never mask the caller's successful write, but make the gap visible.
    console.error("[audit] append_audit_event failed", error.message);
  }
}

/** Queues a workflow event for future processing pipelines. */
export async function emitDomainEvent(input: {
  eventName: string;
  targetType: AuditTargetType;
  targetId: string;
  payload?: Record<string, unknown>;
}): Promise<void> {
  const { error } = await supabaseAdmin.rpc("emit_domain_event", {
    _event_name: input.eventName,
    _target_type: input.targetType,
    _target_id: input.targetId,
    _payload: (input.payload ?? {}) as Json,
  });
  if (error) console.error("[events] emit_domain_event failed", error.message);
}
