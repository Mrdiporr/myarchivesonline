import type { Database } from "@/integrations/supabase/types";

export type AppRole = Database["public"]["Enums"]["app_role"];

export const CASE_STATUSES = ["draft", "pending_review", "published", "archived"] as const;
export type CaseStatus = (typeof CASE_STATUSES)[number];

export const DOCUMENT_TYPES = ["judgment", "ruling", "order", "case_file"] as const;
export type DocumentType = (typeof DOCUMENT_TYPES)[number];

export const STATUS_LABELS: Record<CaseStatus, string> = {
  draft: "Draft",
  pending_review: "Pending review",
  published: "Published",
  archived: "Archived",
};

export const DOCUMENT_TYPE_LABELS: Record<DocumentType, string> = {
  judgment: "Judgment",
  ruling: "Ruling",
  order: "Order",
  case_file: "Case file",
};

export const ROLE_LABELS: Record<AppRole, string> = {
  administrator: "Administrator",
  judge: "Judge",
  clerk: "Clerk",
};

export function isSeniorRole(roles: AppRole[]): boolean {
  return roles.includes("administrator") || roles.includes("judge");
}
