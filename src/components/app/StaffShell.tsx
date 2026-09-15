import { useQueryClient } from "@tanstack/react-query";
import { Link, useNavigate } from "@tanstack/react-router";
import type { ReactNode } from "react";

import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { ROLE_LABELS, type AppRole } from "@/lib/roles";

type ShellProps = {
  children: ReactNode;
  roles?: AppRole[];
  name?: string;
};

export function StaffShell({ children, roles = [], name }: ShellProps) {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const isAdmin = roles.includes("administrator");

  async function signOut() {
    await queryClient.cancelQueries();
    queryClient.clear();
    await supabase.auth.signOut();
    navigate({ to: "/auth", replace: true });
  }

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b border-border bg-card">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-x-6 gap-y-3 px-6 py-4">
          <Link to="/dashboard" className="font-display text-lg tracking-tight text-foreground">
            Judicial Archive
          </Link>
          <nav className="flex items-center gap-4 text-sm">
            <Link
              to="/dashboard"
              className="text-muted-foreground transition-colors hover:text-foreground"
              activeProps={{ className: "text-foreground font-medium" }}
            >
              Dashboard
            </Link>
            <Link
              to="/cases"
              className="text-muted-foreground transition-colors hover:text-foreground"
              activeProps={{ className: "text-foreground font-medium" }}
            >
              Cases
            </Link>
            {isAdmin ? (
              <Link
                to="/admin/roles"
                className="text-muted-foreground transition-colors hover:text-foreground"
                activeProps={{ className: "text-foreground font-medium" }}
              >
                Staff roles
              </Link>
            ) : null}
          </nav>
          <div className="ml-auto flex items-center gap-3 text-sm">
            <span className="hidden text-muted-foreground sm:inline">
              {name || "Signed in"}
              {roles.length > 0
                ? ` · ${roles.map((r) => ROLE_LABELS[r]).join(", ")}`
                : " · no role assigned"}
            </span>
            <Button variant="outline" size="sm" onClick={signOut}>
              Sign out
            </Button>
          </div>
        </div>
      </header>
      <main className="mx-auto max-w-6xl px-6 py-8">{children}</main>
    </div>
  );
}

export function ErrorNotice({ error }: { error: unknown }) {
  const message = error instanceof Error ? error.message : "Something went wrong.";
  return (
    <div className="rounded-md border border-destructive/40 bg-destructive/5 px-4 py-3 text-sm text-destructive">
      {message}
    </div>
  );
}
