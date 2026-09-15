import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import type { Database } from "@/integrations/supabase/types";

export type DocumentRow = Database["public"]["Tables"]["document_files"]["Row"];

export const DOCUMENT_BUCKET = "case-documents";

export const ALLOWED_MIME_TYPES = {
  "application/pdf": "PDF",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document": "DOCX",
} as const;

const attachable = {
  attachable_type: z.enum(["Case", "CaseProceeding"]),
  attachable_id: z.string().uuid(),
};

export const listDocuments = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => z.object(attachable).parse(data))
  .handler(async ({ data, context }) => {
    const { data: rows, error } = await context.supabase
      .from("document_files")
      .select("*")
      .eq("attachable_type", data.attachable_type)
      .eq("attachable_id", data.attachable_id)
      .is("deleted_at", null)
      .order("created_at", { ascending: false });
    if (error) throw new Error(error.message);
    return { rows: (rows ?? []) as DocumentRow[] };
  });

export const registerDocument = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) =>
    z
      .object({
        ...attachable,
        original_filename: z.string().trim().min(1).max(255),
        storage_path: z.string().trim().min(1).max(500),
        mime_type: z.enum([
          "application/pdf",
          "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        ]),
        file_hash: z.string().regex(/^[a-f0-9]{64}$/, "A SHA-256 fingerprint is required"),
        file_size: z.number().int().positive().max(50 * 1024 * 1024),
      })
      .parse(data),
  )
  .handler(async ({ data, context }) => {
    const { data: row, error } = await context.supabase
      .from("document_files")
      .insert({
        attachable_type: data.attachable_type,
        attachable_id: data.attachable_id,
        original_filename: data.original_filename,
        storage_path: data.storage_path,
        mime_type: data.mime_type,
        file_hash: data.file_hash,
        file_size: data.file_size,
        created_by: context.userId,
      })
      .select()
      .single();

    if (error) throw new Error(error.message);

    const { recordAudit, emitDomainEvent } = await import("./audit.server");
    await recordAudit({
      action: "document.uploaded",
      targetType: "DocumentFile",
      targetId: row.id,
      actorId: context.userId,
      metadata: {
        attachable_type: data.attachable_type,
        attachable_id: data.attachable_id,
        original_filename: data.original_filename,
        file_hash: data.file_hash,
        file_size: data.file_size,
      },
    });
    await emitDomainEvent({
      eventName: "document.uploaded",
      targetType: "DocumentFile",
      targetId: row.id,
      payload: { attachable_type: data.attachable_type, attachable_id: data.attachable_id },
    });

    return { row: row as DocumentRow };
  });

export const getDocumentDownloadUrl = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => z.object({ id: z.string().uuid() }).parse(data))
  .handler(async ({ data, context }) => {
    // RLS decides whether this caller may see the file at all.
    const { data: row, error } = await context.supabase
      .from("document_files")
      .select("*")
      .eq("id", data.id)
      .is("deleted_at", null)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!row) throw new Error("This file no longer exists, or you are not cleared to open it.");

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: signed, error: signError } = await supabaseAdmin.storage
      .from(DOCUMENT_BUCKET)
      .createSignedUrl(row.storage_path, 120, { download: row.original_filename });
    if (signError || !signed?.signedUrl) {
      throw new Error("The archive could not produce a download link for this file.");
    }

    const { recordAudit } = await import("./audit.server");
    await recordAudit({
      action: "document.downloaded",
      targetType: "DocumentFile",
      targetId: row.id,
      actorId: context.userId,
      metadata: { original_filename: row.original_filename },
    });

    return { url: signed.signedUrl, filename: row.original_filename };
  });

export const removeDocument = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => z.object({ id: z.string().uuid() }).parse(data))
  .handler(async ({ data, context }) => {
    const { data: row, error } = await context.supabase
      .from("document_files")
      .update({ deleted_at: new Date().toISOString() })
      .eq("id", data.id)
      .is("deleted_at", null)
      .select()
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!row) throw new Error("You are not permitted to remove this file.");

    const { recordAudit, emitDomainEvent } = await import("./audit.server");
    await recordAudit({
      action: "document.removed",
      targetType: "DocumentFile",
      targetId: row.id,
      actorId: context.userId,
      metadata: { original_filename: row.original_filename },
    });
    await emitDomainEvent({
      eventName: "document.removed",
      targetType: "DocumentFile",
      targetId: row.id,
      payload: { attachable_id: row.attachable_id },
    });

    return { ok: true };
  });
