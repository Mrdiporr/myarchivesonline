import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { toast } from "sonner";

import { CaseForm, type CaseFormValues } from "@/components/app/CaseForm";
import { ErrorNotice, StaffShell } from "@/components/app/StaffShell";
import { SealedBadge, StatusBadge } from "@/components/app/StatusBadge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { createCase, listCases } from "@/lib/cases.functions";
import {
  CASE_STATUSES,
  DOCUMENT_TYPES,
  DOCUMENT_TYPE_LABELS,
  STATUS_LABELS,
  isSeniorRole,
  type CaseStatus,
  type DocumentType,
} from "@/lib/roles";

export const Route = createFileRoute("/_authenticated/cases/")({
  head: () => ({
    meta: [
      { title: "Case register — Judicial Archive" },
      {
        name: "description",
        content:
          "Search and filter the court register by title, suit number, subject matter, status and date.",
      },
      { property: "og:title", content: "Case register — Judicial Archive" },
      {
        property: "og:description",
        content:
          "Search and filter the court register by title, suit number, subject matter, status and date.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: CasesPage,
});

const PAGE_SIZE = 20;

function CasesPage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const fetchCases = useServerFn(listCases);
  const create = useServerFn(createCase);

  const [search, setSearch] = useState("");
  const [status, setStatus] = useState<CaseStatus | "all">("all");
  const [documentType, setDocumentType] = useState<DocumentType | "all">("all");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [page, setPage] = useState(1);
  const [creating, setCreating] = useState(false);

  const filters = {
    search,
    status: status === "all" ? null : status,
    documentType: documentType === "all" ? null : documentType,
    from: from || null,
    to: to || null,
    page,
    pageSize: PAGE_SIZE,
  };

  const cases = useQuery({
    queryKey: ["cases", filters],
    queryFn: () => fetchCases({ data: filters }),
  });

  const createMutation = useMutation({
    mutationFn: (values: CaseFormValues) => create({ data: values }),
    onSuccess: (result) => {
      toast.success("Case entered as a draft.");
      queryClient.invalidateQueries({ queryKey: ["cases"] });
      queryClient.invalidateQueries({ queryKey: ["dashboard"] });
      navigate({ to: "/cases/$caseId", params: { caseId: result.row.id } });
    },
    onError: (error) =>
      toast.error(error instanceof Error ? error.message : "The case could not be entered."),
  });

  const roles = cases.data?.roles ?? [];
  const total = cases.data?.total ?? 0;
  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  return (
    <StaffShell roles={roles}>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="font-display text-2xl tracking-tight text-foreground">Case register</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            {total} matter{total === 1 ? "" : "s"} visible to you.
          </p>
        </div>
        <Button onClick={() => setCreating((v) => !v)}>
          {creating ? "Close entry form" : "Enter a new case"}
        </Button>
      </div>

      {creating ? (
        <section className="mt-6 rounded-lg border border-border bg-card p-5">
          <h2 className="font-display text-base text-foreground">New case</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            All metadata is entered manually and checked before submission for review.
          </p>
          <div className="mt-4">
            <CaseForm
              submitLabel="Enter case"
              busy={createMutation.isPending}
              canSeal={isSeniorRole(roles)}
              onSubmit={(values) => createMutation.mutate(values)}
              onCancel={() => setCreating(false)}
            />
          </div>
        </section>
      ) : null}

      <section className="mt-6 grid gap-4 rounded-lg border border-border bg-card p-5 sm:grid-cols-2 lg:grid-cols-5">
        <div className="space-y-2 lg:col-span-2">
          <Label htmlFor="search">Search</Label>
          <Input
            id="search"
            placeholder="Title, suit number or subject"
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setPage(1);
            }}
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="status">Status</Label>
          <Select
            value={status}
            onValueChange={(value) => {
              setStatus(value as CaseStatus | "all");
              setPage(1);
            }}
          >
            <SelectTrigger id="status">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All statuses</SelectItem>
              {CASE_STATUSES.map((s) => (
                <SelectItem key={s} value={s}>
                  {STATUS_LABELS[s]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-2">
          <Label htmlFor="type">Document type</Label>
          <Select
            value={documentType}
            onValueChange={(value) => {
              setDocumentType(value as DocumentType | "all");
              setPage(1);
            }}
          >
            <SelectTrigger id="type">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All types</SelectItem>
              {DOCUMENT_TYPES.map((t) => (
                <SelectItem key={t} value={t}>
                  {DOCUMENT_TYPE_LABELS[t]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="grid grid-cols-2 gap-2">
          <div className="space-y-2">
            <Label htmlFor="from">From</Label>
            <Input
              id="from"
              type="date"
              value={from}
              onChange={(e) => {
                setFrom(e.target.value);
                setPage(1);
              }}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="to">To</Label>
            <Input
              id="to"
              type="date"
              value={to}
              onChange={(e) => {
                setTo(e.target.value);
                setPage(1);
              }}
            />
          </div>
        </div>
      </section>

      {cases.isError ? (
        <div className="mt-6">
          <ErrorNotice error={cases.error} />
        </div>
      ) : null}

      <section className="mt-6 overflow-hidden rounded-lg border border-border bg-card">
        {cases.isLoading ? (
          <p className="p-5 text-sm text-muted-foreground">Loading the register…</p>
        ) : (cases.data?.rows.length ?? 0) === 0 ? (
          <p className="p-5 text-sm text-muted-foreground">No matters match these filters.</p>
        ) : (
          <table className="w-full text-left text-sm">
            <thead className="border-b border-border text-xs uppercase tracking-wide text-muted-foreground">
              <tr>
                <th className="px-5 py-3 font-medium">Case</th>
                <th className="px-5 py-3 font-medium">Suit number</th>
                <th className="px-5 py-3 font-medium">Type</th>
                <th className="px-5 py-3 font-medium">Delivered</th>
                <th className="px-5 py-3 font-medium">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {cases.data?.rows.map((row) => (
                <tr key={row.id} className="hover:bg-muted/40">
                  <td className="px-5 py-3">
                    <Link
                      to="/cases/$caseId"
                      params={{ caseId: row.id }}
                      className="font-medium text-foreground underline-offset-4 hover:underline"
                    >
                      {row.case_title}
                    </Link>
                    <p className="mt-1 text-xs text-muted-foreground">{row.subject_matter}</p>
                  </td>
                  <td className="px-5 py-3 text-muted-foreground">{row.suit_number}</td>
                  <td className="px-5 py-3 text-muted-foreground">
                    {DOCUMENT_TYPE_LABELS[row.document_type as DocumentType] ?? row.document_type}
                  </td>
                  <td className="px-5 py-3 text-muted-foreground">{row.date_delivered ?? "—"}</td>
                  <td className="px-5 py-3">
                    <div className="flex flex-wrap items-center gap-2">
                      {row.is_sealed ? <SealedBadge /> : null}
                      <StatusBadge status={row.status} />
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>

      <div className="mt-4 flex items-center justify-between text-sm text-muted-foreground">
        <span>
          Page {page} of {pages}
        </span>
        <div className="flex gap-2">
          <Button
            size="sm"
            variant="outline"
            disabled={page <= 1}
            onClick={() => setPage((p) => Math.max(1, p - 1))}
          >
            Previous
          </Button>
          <Button
            size="sm"
            variant="outline"
            disabled={page >= pages}
            onClick={() => setPage((p) => p + 1)}
          >
            Next
          </Button>
        </div>
      </div>
    </StaffShell>
  );
}
