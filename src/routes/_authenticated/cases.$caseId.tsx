import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute, Link, useParams } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { toast } from "sonner";

import { CaseForm, type CaseFormValues } from "@/components/app/CaseForm";
import { DocumentPanel } from "@/components/app/DocumentPanel";
import { ProceedingsTimeline } from "@/components/app/ProceedingsTimeline";
import { ErrorNotice, StaffShell } from "@/components/app/StaffShell";
import { SealedBadge, StatusBadge } from "@/components/app/StatusBadge";
import { Button } from "@/components/ui/button";
import {
  archiveCase,
  getCase,
  publishCase,
  submitCaseForReview,
  updateCase,
} from "@/lib/cases.functions";
import {
  DOCUMENT_TYPE_LABELS,
  isSeniorRole,
  type DocumentType,
} from "@/lib/roles";

export const Route = createFileRoute("/_authenticated/cases/$caseId")({
  head: () => ({
    meta: [
      { title: "Case record — Judicial Archive" },
      {
        name: "description",
        content:
          "Full case metadata, workflow actions, filed documents and the proceedings timeline.",
      },
      { property: "og:title", content: "Case record — Judicial Archive" },
      {
        property: "og:description",
        content:
          "Full case metadata, workflow actions, filed documents and the proceedings timeline.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: CaseDetail,
});

function CaseDetail() {
  const { caseId } = useParams({ from: "/_authenticated/cases/$caseId" });
  const queryClient = useQueryClient();

  const fetchCase = useServerFn(getCase);
  const update = useServerFn(updateCase);
  const submit = useServerFn(submitCaseForReview);
  const publish = useServerFn(publishCase);
  const archive = useServerFn(archiveCase);

  const [editing, setEditing] = useState(false);

  const detail = useQuery({
    queryKey: ["case", caseId],
    queryFn: () => fetchCase({ data: { id: caseId } }),
  });

  function refresh() {
    queryClient.invalidateQueries({ queryKey: ["case", caseId] });
    queryClient.invalidateQueries({ queryKey: ["cases"] });
    queryClient.invalidateQueries({ queryKey: ["dashboard"] });
  }

  const updateMutation = useMutation({
    mutationFn: (values: CaseFormValues) => update({ data: { id: caseId, ...values } }),
    onSuccess: () => {
      toast.success("Case metadata updated.");
      setEditing(false);
      refresh();
    },
    onError: (error) =>
      toast.error(error instanceof Error ? error.message : "The case could not be updated."),
  });

  function transition(label: string, fn: (input: { data: { id: string } }) => Promise<unknown>) {
    return async () => {
      try {
        await fn({ data: { id: caseId } });
        toast.success(label);
        refresh();
      } catch (error) {
        toast.error(error instanceof Error ? error.message : "That step could not be completed.");
      }
    };
  }

  const row = detail.data?.row;
  const roles = detail.data?.roles ?? [];
  const userId = detail.data?.userId ?? "";
  const senior = isSeniorRole(roles);
  const isAdmin = roles.includes("administrator");
  const canEdit =
    !!row && row.status !== "archived" && (senior || (row.created_by === userId && row.status === "draft"));

  return (
    <StaffShell roles={roles}>
      <Link
        to="/cases"
        className="text-sm text-muted-foreground underline-offset-4 hover:underline"
      >
        ← Back to the register
      </Link>

      {detail.isError ? (
        <div className="mt-6">
          <ErrorNotice error={detail.error} />
        </div>
      ) : null}

      {detail.isLoading ? (
        <p className="mt-6 text-sm text-muted-foreground">Loading the case record…</p>
      ) : row ? (
        <>
          <div className="mt-4 flex flex-wrap items-start justify-between gap-4">
            <div>
              <h1 className="font-display text-2xl tracking-tight text-foreground">
                {row.case_title}
              </h1>
              <p className="mt-2 text-sm text-muted-foreground">
                {row.suit_number} · {row.subject_matter}
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              {row.is_sealed ? <SealedBadge /> : null}
              <StatusBadge status={row.status} />
            </div>
          </div>

          <section className="mt-6 rounded-lg border border-border bg-card p-5">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <h2 className="font-display text-base text-foreground">Record details</h2>
              {canEdit ? (
                <Button size="sm" variant="outline" onClick={() => setEditing((v) => !v)}>
                  {editing ? "Close" : "Edit metadata"}
                </Button>
              ) : null}
            </div>

            {editing ? (
              <div className="mt-4">
                <CaseForm
                  submitLabel="Save changes"
                  busy={updateMutation.isPending}
                  canSeal={senior}
                  initial={{
                    case_title: row.case_title,
                    suit_number: row.suit_number,
                    subject_matter: row.subject_matter,
                    document_type: row.document_type as DocumentType,
                    date_delivered: row.date_delivered,
                    is_sealed: row.is_sealed,
                  }}
                  onSubmit={(values) => updateMutation.mutate(values)}
                  onCancel={() => setEditing(false)}
                />
              </div>
            ) : (
              <dl className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                {[
                  ["Document type", DOCUMENT_TYPE_LABELS[row.document_type as DocumentType] ?? row.document_type],
                  ["Date delivered", row.date_delivered ?? "Not recorded"],
                  ["Entered", new Date(row.created_at).toLocaleString()],
                  ["Last updated", new Date(row.updated_at).toLocaleString()],
                ].map(([label, value]) => (
                  <div key={label}>
                    <dt className="text-xs uppercase tracking-wide text-muted-foreground">
                      {label}
                    </dt>
                    <dd className="mt-1 text-sm text-foreground">{value}</dd>
                  </div>
                ))}
              </dl>
            )}

            <div className="mt-6 flex flex-wrap gap-2 border-t border-border pt-4">
              {row.status === "draft" && (senior || row.created_by === userId) ? (
                <Button size="sm" onClick={transition("Submitted for review.", submit)}>
                  Submit for review
                </Button>
              ) : null}
              {row.status === "pending_review" && senior ? (
                <Button size="sm" onClick={transition("Case published.", publish)}>
                  Publish
                </Button>
              ) : null}
              {row.status === "published" && isAdmin ? (
                <Button size="sm" variant="outline" onClick={transition("Case archived.", archive)}>
                  Archive
                </Button>
              ) : null}
              {row.status === "archived" ? (
                <p className="text-sm text-muted-foreground">
                  This matter is archived and held read-only.
                </p>
              ) : null}
            </div>
          </section>

          <div className="mt-6 space-y-6">
            <DocumentPanel
              attachableType="Case"
              attachableId={row.id}
              title="Filed documents"
              canUpload={row.status !== "archived" && roles.length > 0}
            />
            <ProceedingsTimeline
              caseId={row.id}
              roles={roles}
              userId={userId}
              canRecord={row.status !== "archived" && roles.length > 0}
            />
          </div>
        </>
      ) : null}
    </StaffShell>
  );
}
