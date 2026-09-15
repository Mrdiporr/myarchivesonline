import { createFileRoute, Link } from "@tanstack/react-router";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Judicial Archive — Court Records & Proceedings" },
      {
        name: "description",
        content:
          "Secure registry for court judgments, rulings, orders and daily session records, with role-based access and a tamper-evident audit trail.",
      },
      { property: "og:title", content: "Judicial Archive — Court Records & Proceedings" },
      {
        property: "og:description",
        content:
          "Secure registry for court judgments, rulings, orders and daily session records, with role-based access and a tamper-evident audit trail.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: Landing,
});

function Landing() {
  return (
    <div className="flex min-h-screen flex-col bg-background">
      <header className="border-b border-border">
        <div className="mx-auto flex max-w-5xl items-center justify-between px-6 py-5">
          <span className="font-display text-lg tracking-tight">Judicial Archive</span>
          <Link
            to="/auth"
            className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
          >
            Staff sign in
          </Link>
        </div>
      </header>

      <main className="mx-auto flex w-full max-w-5xl flex-1 flex-col justify-center px-6 py-20">
        <p className="text-xs uppercase tracking-[0.2em] text-muted-foreground">
          Registry of record
        </p>
        <h1 className="mt-4 max-w-3xl font-display text-4xl leading-tight text-foreground sm:text-5xl">
          Judgments, rulings, orders and daily proceedings — held under seal and account.
        </h1>
        <p className="mt-6 max-w-2xl text-base leading-relaxed text-muted-foreground">
          This registry is restricted to court staff. Every entry is indexed by suit number and
          subject matter, moved through review and publication by the officers entitled to do so,
          and written to an append-only audit trail that cannot be altered after the fact.
        </p>
        <div className="mt-10 flex flex-wrap gap-3">
          <Link
            to="/auth"
            className="rounded-md bg-primary px-5 py-2.5 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
          >
            Sign in to the registry
          </Link>
        </div>

        <dl className="mt-16 grid gap-8 border-t border-border pt-10 sm:grid-cols-3">
          {[
            ["Manual, verified entry", "Metadata is entered and checked by clerks — never inferred."],
            ["Role-based clearance", "Clerks, judges and administrators see and do only what their office allows."],
            ["Tamper-evident record", "Each audit entry is chained to the one before it."],
          ].map(([title, body]) => (
            <div key={title}>
              <dt className="font-display text-base text-foreground">{title}</dt>
              <dd className="mt-2 text-sm leading-relaxed text-muted-foreground">{body}</dd>
            </div>
          ))}
        </dl>
      </main>

      <footer className="border-t border-border">
        <div className="mx-auto max-w-5xl px-6 py-6 text-xs text-muted-foreground">
          Access is logged. Sealed matters are restricted to authorised officers.
        </div>
      </footer>
    </div>
  );
}
