import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { toast } from "sonner";

import { ErrorNotice, StaffShell } from "@/components/app/StaffShell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { listAuditEvents, verifyAuditChain, type AuditRow } from "@/lib/audit.functions";

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const TARGET_TYPES = ["Case", "CaseProceeding", "DocumentFile", "User", "Role", "System"] as const;

const TARGET_TYPE_LABELS: Record<(typeof TARGET_TYPES)[number], string> = {
  Case: "Case",
  CaseProceeding: "Session record",
  DocumentFile: "Document",
  User: "User",
  Role: "Role",
  System: "System",
};

export const Route = createFileRoute("/_authenticated/admin/audit")({
  validateSearch: (search: Record<string, unknown>) => ({
    case: typeof search.case === "string" ? search.case : undefined,
  }),
  head: () => ({
    meta: [
      { title: "Audit trail — Judicial Archive" },
      {
        name: "description",
        content:
          "Inspect the tamper-evident audit ledger, filter events by case, actor or action, and verify the cryptographic hash chain.",
      },
      { property: "og:title", content: "Audit trail — Judicial Archive" },
      {
        property: "og:description",
        content:
          "Inspect the tamper-evident audit ledger, filter events by case, actor or action, and verify the cryptographic hash chain.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: AuditPage,
});

function MetadataList({ rows }: { rows: Array<[string, unknown]> }) {
  return (
    <dl className="grid gap-x-6 gap-y-2 sm:grid-cols-2">
      {rows.map(([key, value]) => (
        <div key={key} className="min-w-0">
          <dt className="text-xs uppercase tracking-wide text-muted-foreground">{key}</dt>
          <dd className="truncate text-sm text-foreground" title={String(value)}>
            {typeof value === "object" && value !== null ? JSON.stringify(value) : String(value)}
          </dd>
        </div>
      ))}
    </dl>
  );
}

function flattenMetadata(row: AuditRow): Array<[string, unknown]> {
  const meta = (row.metadata ?? {}) as Record<string, unknown>;
  const rest = Object.entries(meta).filter(([k]) => k !== "actor_id");
  const entries: Array<[string, unknown]> = [["Entry ID", row.id]];
  if (meta.actor_id) entries.push(["Actor", meta.actor_id]);
  entries.push(...rest);
  entries.push(["Previous hash", row.previous_hash ?? "— (chain origin)"]);
  entries.push(["Current hash", row.current_hash]);
  return entries;
}

function AuditPage() {
  const { case: caseParam } = Route.useSearch();
  const navigate = Route.useNavigate();
  const queryClient = useQueryClient();

  const caseFilter = caseParam && UUID_PATTERN.test(caseParam) ? caseParam : undefined;

  const [targetType, setTargetType] = useState<string>("all");
  const [actionQuery, setActionQuery] = useState("");

  const fetchEvents = useServerFn(listAuditEvents);
  const runChainCheck = useServerFn(verifyAuditChain);

  const events = useQuery({
    queryKey: ["audit", { targetId: caseFilter ?? null, targetType, actionQuery }],
    queryFn: () =>
      fetchEvents({
        data: {
          targetId: caseFilter ?? undefined,
          targetType: targetType === "all" ? undefined : targetType,
          action: actionQuery.trim() ? actionQuery.trim() : undefined,
          limit: 100,
        },
      }),
    placeholderData: keepPreviousData,
  });

  const chain = useQuery({
    queryKey: ["audit-chain"],
    queryFn: () => runChainCheck({ data: { limit: 500 } }),
  });

  const chainMutation = useMutation({
    mutationFn: () => runChainCheck({ data: { limit: 500 } }),
    onSuccess: (result) => {
      queryClient.setQueryData(["audit-chain"], result);
      toast.success(
        result.intact
          ? `Chain verified — ${result.checked} linked entries intact.`
          : `Chain broken at ${result.broken.length} entr${result.broken.length === 1 ? "y" : "ies"}.`,
      );
    },
    onError: (error) =>
      toast.error(error instanceof Error ? error.message : "The chain could not be verified."),
  });

  const rows = events.data?.rows ?? [];
  const expandedId = rows.length > 0 ? (rows[0]!.id as string) : "";

  return (
    <StaffShell roles={[]}>
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="font-display text-2xl tracking-tight text-foreground">Audit trail</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            Every workflow change is chained into a tamper-evident ledger. Verify the chain to
            confirm no entry has been altered or removed.
          </p>
        </div>
        <Button onClick={() => chainMutation.mutate()} disabled={chainMutation.isPending}>
          {chainMutation.isPending
            ? "Verifying…"
            : chain.isPending
              ? "Loading…"
              : "Verify hash chain"}
        </Button>
      </div>

      {chain.data ? (
        <section
          className={
            chain.data.intact
              ? "mt-6 rounded-lg border border-border bg-card p-5"
              : "mt-6 rounded-lg border border-destructive/40 bg-destructive/5 p-5"
          }
        >
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
            <h2 className="font-display text-base text-foreground">
              {chain.data.intact ? "Chain intact" : "Chain broken"}
            </h2>
            <span className="text-sm text-muted-foreground">
              {chain.data.checked} linked {chain.data.checked === 1 ? "entry" : "entries"} checked
              {chain.data.checked === 0 ? " (no entries in the ledger yet)" : ""}
            </span>
          </div>
          {!chain.data.intact && chain.data.broken.length > 0 ? (
            <p className="mt-2 text-sm text-destructive">
              Entries whose link to their predecessor does not hold: {chain.data.broken.join(", ")}.
              Treat the ledger as compromised and investigate immediately.
            </p>
          ) : null}
        </section>
      ) : chain.isError ? (
        <div className="mt-6">
          <ErrorNotice error={chain.error} />
        </div>
      ) : null}

      <section className="mt-6 flex flex-wrap items-end gap-3">
        <div className="w-56">
          <label className="mb-1 block text-xs uppercase tracking-wide text-muted-foreground">
            Record type
          </label>
          <Select value={targetType} onValueChange={setTargetType}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All record types</SelectItem>
              {TARGET_TYPES.map((type) => (
                <SelectItem key={type} value={type}>
                  {TARGET_TYPE_LABELS[type]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="w-64">
          <label className="mb-1 block text-xs uppercase tracking-wide text-muted-foreground">
            Action contains
          </label>
          <Input
            value={actionQuery}
            onChange={(event) => setActionQuery(event.target.value)}
            placeholder="e.g. case.publish"
          />
        </div>
        {caseFilter ? (
          <div className="flex items-end gap-2">
            <div>
              <label className="mb-1 block text-xs uppercase tracking-wide text-muted-foreground">
                Filtered to case
              </label>
              <p className="text-sm text-foreground">{caseFilter}</p>
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={() => navigate({ to: "/admin/audit", search: {} })}
            >
              Clear
            </Button>
          </div>
        ) : null}
      </section>

      {events.isError ? (
        <div className="mt-6">
          <ErrorNotice error={events.error} />
        </div>
      ) : null}

      {events.isLoading ? (
        <p className="mt-6 text-sm text-muted-foreground">Loading the ledger…</p>
      ) : rows.length === 0 ? (
        <p className="mt-6 text-sm text-muted-foreground">
          No audit entries match these filters.
        </p>
      ) : (
        <section className="mt-6 overflow-hidden rounded-lg border border-border bg-card">
          <table className="w-full text-left text-sm">
            <thead className="border-b border-border text-xs uppercase tracking-wide text-muted-foreground">
              <tr>
                <th className="px-5 py-3 font-medium">When</th>
                <th className="px-5 py-3 font-medium">Action</th>
                <th className="px-5 py-3 font-medium">Record</th>
                <th className="px-5 py-3 font-medium">Source</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {rows.map((row) => (
                <tr key={row.id} className="align-top">
                  <td className="whitespace-nowrap px-5 py-3 text-muted-foreground">
                    {new Date(row.created_at).toLocaleString()}
                  </td>
                  <td className="px-5 py-3 font-medium text-foreground">{row.action}</td>
                  <td className="px-5 py-3 text-muted-foreground">
                    {TARGET_TYPE_LABELS[row.target_type as keyof typeof TARGET_TYPE_LABELS] ??
                      row.target_type}
                    {caseFilter && row.target_id === caseFilter ? (
                      <Link
                        to="/cases/$caseId"
                        params={{ caseId: row.target_id }}
                        className="ml-2 underline-offset-4 hover:underline"
                      >
                        Open case
                      </Link>
                    ) : null}
                  </td>
                  <td className="px-5 py-3 text-muted-foreground">{row.ip_address}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      )}

      {rows[expandedIdIndex(rows)] ? (
        <section className="mt-6 rounded-lg border border-border bg-card p-5">
          <h2 className="font-display text-base text-foreground">Entry detail — newest entry</h2>
          <p className="mt-1 text-xs text-muted-foreground">
            Actor, transition metadata and the hash links that bind this entry to the previous one.
          </p>
          <div className="mt-4">
            <MetadataList rows={flattenMetadata(rows[expandedIdIndex(rows)]!)} />
          </div>
        </section>
      ) : null}
    </StaffShell>
  );
}

function expandedIdIndex(rows: AuditRow[]): number {
  return 0;
}
