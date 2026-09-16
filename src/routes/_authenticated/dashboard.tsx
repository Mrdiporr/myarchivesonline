import { useQuery } from "@tanstack/react-query";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";

import { ErrorNotice, StaffShell } from "@/components/app/StaffShell";
import { SealedBadge, StatusBadge } from "@/components/app/StatusBadge";
import { getDashboard } from "@/lib/cases.functions";
import { CASE_STATUSES, STATUS_LABELS } from "@/lib/roles";

export const Route = createFileRoute("/_authenticated/dashboard")({
  head: () => ({
    meta: [
      { title: "Registry dashboard — Judicial Archive" },
      {
        name: "description",
        content: "Case counts by status, matters awaiting review and recent registry activity.",
      },
      { property: "og:title", content: "Registry dashboard — Judicial Archive" },
      {
        property: "og:description",
        content: "Case counts by status, matters awaiting review and recent registry activity.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: Dashboard,
});

function Dashboard() {
  const fetchDashboard = useServerFn(getDashboard);
  const dashboard = useQuery({ queryKey: ["dashboard"], queryFn: () => fetchDashboard({}) });

  return (
    <StaffShell roles={dashboard.data?.roles ?? []}>
      <h1 className="font-display text-2xl tracking-tight text-foreground">Registry dashboard</h1>
      <p className="mt-2 text-sm text-muted-foreground">
        Overview of the record as it stands, limited to matters you are cleared to see.
      </p>

      {dashboard.isError ? (
        <div className="mt-6">
          <ErrorNotice error={dashboard.error} />
        </div>
      ) : null}

      {dashboard.isLoading ? (
        <p className="mt-6 text-sm text-muted-foreground">Loading the register…</p>
      ) : dashboard.data ? (
        <>
          <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
            {CASE_STATUSES.map((status) => (
              <div key={status} className="rounded-lg border border-border bg-card p-4">
                <p className="text-xs uppercase tracking-wide text-muted-foreground">
                  {STATUS_LABELS[status]}
                </p>
                <p className="mt-2 font-display text-3xl text-foreground">
                  {dashboard.data.counts[status] ?? 0}
                </p>
              </div>
            ))}
            <div className="rounded-lg border border-border bg-card p-4">
              <p className="text-xs uppercase tracking-wide text-muted-foreground">Sessions</p>
              <p className="mt-2 font-display text-3xl text-foreground">
                {dashboard.data.sessionCount}
              </p>
            </div>
          </div>

          <div className="mt-8 grid gap-6 lg:grid-cols-2">
            <section className="rounded-lg border border-border bg-card p-5">
              <h2 className="font-display text-base text-foreground">Awaiting review</h2>
              {dashboard.data.awaiting.length === 0 ? (
                <p className="mt-3 text-sm text-muted-foreground">Nothing is pending review.</p>
              ) : (
                <ul className="mt-3 divide-y divide-border">
                  {dashboard.data.awaiting.map((row) => (
                    <li key={row.id} className="py-3">
                      <Link
                        to="/cases/$caseId"
                        params={{ caseId: row.id }}
                        className="text-sm font-medium text-foreground underline-offset-4 hover:underline"
                      >
                        {row.case_title}
                      </Link>
                      <p className="mt-1 text-xs text-muted-foreground">{row.suit_number}</p>
                    </li>
                  ))}
                </ul>
              )}
            </section>

            <section className="rounded-lg border border-border bg-card p-5">
              <h2 className="font-display text-base text-foreground">Recent activity</h2>
              {dashboard.data.recent.length === 0 ? (
                <p className="mt-3 text-sm text-muted-foreground">
                  No cases have been entered yet.
                </p>
              ) : (
                <ul className="mt-3 divide-y divide-border">
                  {dashboard.data.recent.map((row) => (
                    <li key={row.id} className="flex flex-wrap items-center gap-2 py-3">
                      <Link
                        to="/cases/$caseId"
                        params={{ caseId: row.id }}
                        className="flex-1 text-sm font-medium text-foreground underline-offset-4 hover:underline"
                      >
                        {row.case_title}
                      </Link>
                      {row.is_sealed ? <SealedBadge /> : null}
                      <StatusBadge status={row.status} />
                    </li>
                  ))}
                </ul>
              )}
            </section>
          </div>

          <div className="mt-8">
            <Link
              to="/cases"
              className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
            >
              Open the case register
            </Link>
          </div>
        </>
      ) : null}
    </StaffShell>
  );
}
