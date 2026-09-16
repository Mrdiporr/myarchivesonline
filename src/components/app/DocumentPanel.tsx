import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useRef, useState } from "react";
import { toast } from "sonner";

import { ErrorNotice } from "@/components/app/StaffShell";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import {
  ALLOWED_MIME_TYPES,
  DOCUMENT_BUCKET,
  getDocumentDownloadUrl,
  listDocuments,
  registerDocument,
  removeDocument,
} from "@/lib/documents.functions";

async function sha256Hex(file: File): Promise<string> {
  const buffer = await file.arrayBuffer();
  const digest = await crypto.subtle.digest("SHA-256", buffer);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

function formatSize(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function DocumentPanel({
  attachableType,
  attachableId,
  title = "Documents",
  canUpload,
}: {
  attachableType: "Case" | "CaseProceeding";
  attachableId: string;
  title?: string;
  canUpload: boolean;
}) {
  const queryClient = useQueryClient();
  const inputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);

  const list = useServerFn(listDocuments);
  const register = useServerFn(registerDocument);
  const download = useServerFn(getDocumentDownloadUrl);
  const remove = useServerFn(removeDocument);

  const queryKey = ["documents", attachableType, attachableId];
  const documents = useQuery({
    queryKey,
    queryFn: () => list({ data: { attachable_type: attachableType, attachable_id: attachableId } }),
  });

  const removeMutation = useMutation({
    mutationFn: (id: string) => remove({ data: { id } }),
    onSuccess: () => {
      toast.success("File removed from this record.");
      queryClient.invalidateQueries({ queryKey });
    },
    onError: (error) => toast.error(error instanceof Error ? error.message : "Removal failed."),
  });

  async function handleFile(file: File) {
    if (!(file.type in ALLOWED_MIME_TYPES)) {
      toast.error("Only PDF and DOCX files may be filed.");
      return;
    }
    setUploading(true);
    try {
      const hash = await sha256Hex(file);
      const path = `${attachableType}/${attachableId}/${crypto.randomUUID()}-${file.name.replace(
        /[^\w.\- ]/g,
        "_",
      )}`;

      const { error: uploadError } = await supabase.storage
        .from(DOCUMENT_BUCKET)
        .upload(path, file, { contentType: file.type, upsert: false });
      if (uploadError) throw uploadError;

      await register({
        data: {
          attachable_type: attachableType,
          attachable_id: attachableId,
          original_filename: file.name,
          storage_path: path,
          mime_type: file.type as keyof typeof ALLOWED_MIME_TYPES,
          file_hash: hash,
          file_size: file.size,
        },
      });

      toast.success(`${file.name} filed with its SHA-256 fingerprint.`);
      queryClient.invalidateQueries({ queryKey });
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "The file could not be filed.");
    } finally {
      setUploading(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  }

  async function openFile(id: string) {
    try {
      const result = await download({ data: { id } });
      window.open(result.url, "_blank", "noopener");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "The file could not be opened.");
    }
  }

  const rows = documents.data?.rows ?? [];

  return (
    <section className="rounded-lg border border-border bg-card p-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="font-display text-base text-foreground">{title}</h2>
        {canUpload ? (
          <div>
            <input
              ref={inputRef}
              type="file"
              className="hidden"
              accept=".pdf,.docx,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
              onChange={(event) => {
                const file = event.target.files?.[0];
                if (file) void handleFile(file);
              }}
            />
            <Button size="sm" disabled={uploading} onClick={() => inputRef.current?.click()}>
              {uploading ? "Filing…" : "File a PDF or DOCX"}
            </Button>
          </div>
        ) : null}
      </div>

      {documents.isError ? (
        <div className="mt-4">
          <ErrorNotice error={documents.error} />
        </div>
      ) : null}

      {documents.isLoading ? (
        <p className="mt-4 text-sm text-muted-foreground">Loading files…</p>
      ) : rows.length === 0 ? (
        <p className="mt-4 text-sm text-muted-foreground">No documents filed against this record.</p>
      ) : (
        <ul className="mt-4 divide-y divide-border">
          {rows.map((doc) => (
            <li key={doc.id} className="flex flex-wrap items-center gap-3 py-3">
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium text-foreground">
                  {doc.original_filename}
                </p>
                <p className="mt-1 text-xs text-muted-foreground">
                  {ALLOWED_MIME_TYPES[doc.mime_type as keyof typeof ALLOWED_MIME_TYPES] ??
                    doc.mime_type}{" "}
                  · {formatSize(Number(doc.file_size))} · SHA-256 {doc.file_hash.slice(0, 16)}…
                </p>
              </div>
              <Button size="sm" variant="outline" onClick={() => openFile(doc.id)}>
                Download
              </Button>
              {canUpload ? (
                <Button
                  size="sm"
                  variant="ghost"
                  disabled={removeMutation.isPending}
                  onClick={() => removeMutation.mutate(doc.id)}
                >
                  Remove
                </Button>
              ) : null}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
