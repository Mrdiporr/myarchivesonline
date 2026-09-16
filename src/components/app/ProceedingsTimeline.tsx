import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { toast } from "sonner";

import { DocumentPanel } from "@/components/app/DocumentPanel";
import { ErrorNotice } from "@/components/app/StaffShell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  createProceeding,
  listProceedings,
  updateProceeding,
  type ProceedingRow,
} from "@/lib/proceedings.functions";
import { isSeniorRole, type AppRole } from "@/lib/roles";

type Draft = { session_date: string; presiding_judge: string; summary_notes: string };

const empty: Draft = { session_date: "", presiding_judge: "", summary_notes: "" };

export function ProceedingsTimeline({
  caseId,
  roles,
  userId,
  canRecord,
}: {
  caseId: string;
  roles: AppRole[];
  userId: string;
  canRecord: boolean;
}) {
  const queryClient = useQueryClient();
  const queryKey = ["proceedings", caseId];
  const list = useServerFn(listProceedings);
  const create = useServerFn(createProceeding);
  const update = useServerFn(updateProceeding);

  const [adding, setAdding] = useState(false);
  const [draft, setDraft] = useState<Draft>(empty);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editDraft, setEditDraft] = useState<Draft>(empty);
  const [openDocs, setOpenDocs] = useState<string | null>(null);

  const proceedings = useQuery({
    queryKey,
    queryFn: () => list({ data: { caseId } }),
  });

  const createMutation = useMutation({
    mutationFn: () =>
      create({
        data: {
          case_id: caseId,
          session_date: draft.session_date,
          presiding_judge: draft.presiding_judge,
          summary_notes: draft.summary_notes || null,
        },
      }),
    onSuccess: () => {
      toast.success("Session recorded.");
      setDraft(empty);
      setAdding(false);
      queryClient.invalidateQueries({ queryKey });
    },
    onError: (error) =>
      toast.error(error instanceof Error ? error.message : "The session could not be recorded."),
  });

  const updateMutation = useMutation({
    mutationFn: (input: { id: string; status?: "draft" | "published"; values: Draft }) =>
      update({
        data: {
          id: input.id,
          ...(input.status ? { status: input.status } : {}),
          session_date: input.values.session_date,
          presiding_judge: input.values.presiding_judge,
          summary_notes: input.values.summary_notes || null,
        },
      }),
    onSuccess: () => {
      toast.success("Session updated.");
      setEditingId(null);
      queryClient.invalidateQueries({ queryKey });
    },
    onError: (error) =>
      toast.error(error instanceof Error ? error.message : "The session could not be updated."),
  });

  const senior = isSeniorRole(roles);
  const rows = proceedings.data?.rows ?? [];

  function canEdit(row: ProceedingRow) {
    return senior || (row.created_by === userId && row.status === "draft");
  }

  function DraftFields({
    values,
    onChange,
    idPrefix,
  }: {
    values: Draft;
    onChange: (next: Draft) => void;
    idPrefix: string;
  }) {
    return (
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor={`${idPrefix}-date`}>Session date</Label>
          <Input
            id={`${idPrefix}-date`}
            type="date"
            value={values.session_date}
            onChange={(e) => onChange({ ...values, session_date: e.target.value })}
            required
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor={`${idPrefix}-judge`}>Presiding judge</Label>
          <Input
            id={`${idPrefix}-judge`}
            value={values.presiding_judge}
            onChange={(e) => onChange({ ...values, presiding_judge: e.target.value })}
            required
          />
        </div>
        <div className="space-y-2 sm:col-span-2">
          <Label htmlFor={`${idPrefix}-notes`}>Summary notes</Label>
          <Textarea
            id={`${idPrefix}-notes`}
            rows={4}
            value={values.summary_notes}
            onChange={(e) => onChange({ ...values, summary_notes: e.target.value })}
          />
        </div>
      </div>
    );
  }

  return (
    <section className="rounded-lg border border-border bg-card p-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="font-display text-base text-foreground">Proceedings timeline</h2>
        {canRecord ? (
          <Button size="sm" variant="outline" onClick={() => setAdding((v) => !v)}>
            {adding ? "Close" : "Record a session"}
          </Button>
        ) : null}
      </div>

      {proceedings.isError ? (
        <div className="mt-4">
          <ErrorNotice error={proceedings.error} />
        </div>
      ) : null}

      {adding ? (
        <form
          className="mt-4 space-y-3 rounded-md border border-border bg-background p-4"
          onSubmit={(event) => {
            event.preventDefault();
            createMutation.mutate();
          }}
        >
          <DraftFields values={draft} onChange={setDraft} idPrefix="new" />
          <Button type="submit" size="sm" disabled={createMutation.isPending}>
            {createMutation.isPending ? "Saving…" : "Save session"}
          </Button>
        </form>
      ) : null}

      {proceedings.isLoading ? (
        <p className="mt-4 text-sm text-muted-foreground">Loading sessions…</p>
      ) : rows.length === 0 ? (
        <p className="mt-4 text-sm text-muted-foreground">No sessions recorded for this case.</p>
      ) : (
        <ol className="mt-5 space-y-5 border-l border-border pl-5">
          {rows.map((row) => (
            <li key={row.id} className="relative">
              <span className="absolute -left-[27px] top-1.5 h-2.5 w-2.5 rounded-full bg-primary" />
              <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
                <p className="font-display text-sm text-foreground">{row.session_date}</p>
                <p className="text-sm text-muted-foreground">Before {row.presiding_judge}</p>
                <span className="text-xs uppercase tracking-wide text-muted-foreground">
                  {row.status === "published" ? "Published" : "Draft"}
                </span>
              </div>
              {editingId === row.id ? (
                <form
                  className="mt-3 space-y-3 rounded-md border border-border bg-background p-4"
                  onSubmit={(event) => {
                    event.preventDefault();
                    updateMutation.mutate({ id: row.id, values: editDraft });
                  }}
                >
                  <DraftFields values={editDraft} onChange={setEditDraft} idPrefix={row.id} />
                  <div className="flex gap-2">
                    <Button type="submit" size="sm" disabled={updateMutation.isPending}>
                      Save changes
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      onClick={() => setEditingId(null)}
                    >
                      Cancel
                    </Button>
                  </div>
                </form>
              ) : (
                <>
                  {row.summary_notes ? (
                    <p className="mt-2 whitespace-pre-line text-sm leading-relaxed text-foreground">
                      {row.summary_notes}
                    </p>
                  ) : (
                    <p className="mt-2 text-sm text-muted-foreground">No notes recorded.</p>
                  )}
                  <div className="mt-3 flex flex-wrap gap-2">
                    {canEdit(row) ? (
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => {
                          setEditingId(row.id);
                          setEditDraft({
                            session_date: row.session_date,
                            presiding_judge: row.presiding_judge,
                            summary_notes: row.summary_notes ?? "",
                          });
                        }}
                      >
                        Edit
                      </Button>
                    ) : null}
                    {senior && row.status === "draft" ? (
                      <Button
                        size="sm"
                        onClick={() =>
                          updateMutation.mutate({
                            id: row.id,
                            status: "published",
                            values: {
                              session_date: row.session_date,
                              presiding_judge: row.presiding_judge,
                              summary_notes: row.summary_notes ?? "",
                            },
                          })
                        }
                      >
                        Publish session
                      </Button>
                    ) : null}
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => setOpenDocs(openDocs === row.id ? null : row.id)}
                    >
                      {openDocs === row.id ? "Hide attachments" : "Attachments"}
                    </Button>
                  </div>
                  {openDocs === row.id ? (
                    <div className="mt-3">
                      <DocumentPanel
                        attachableType="CaseProceeding"
                        attachableId={row.id}
                        title="Session attachments"
                        canUpload={canEdit(row)}
                      />
                    </div>
                  ) : null}
                </>
              )}
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}
