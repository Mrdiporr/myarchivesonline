import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";

import { ErrorNotice, StaffShell } from "@/components/app/StaffShell";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { listStaff, setStaffRole } from "@/lib/roles.functions";
import { getMyAccess } from "@/lib/session.functions";
import { ROLE_LABELS, type AppRole } from "@/lib/roles";

export const Route = createFileRoute("/_authenticated/admin/roles")({
  head: () => ({
    meta: [
      { title: "Staff roles — Judicial Archive" },
      {
        name: "description",
        content: "Administrators assign clerk, judge and administrator roles to registry staff.",
      },
      { property: "og:title", content: "Staff roles — Judicial Archive" },
      {
        property: "og:description",
        content: "Administrators assign clerk, judge and administrator roles to registry staff.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: RolesPage,
});

const ROLES: AppRole[] = ["administrator", "judge", "clerk"];

function RolesPage() {
  const queryClient = useQueryClient();
  const access = useQuery({ queryKey: ["access"], queryFn: () => useAccessFn() });
  const fetchStaff = useServerFn(listStaff);
  const changeRole = useServerFn(setStaffRole);

  const staff = useQuery({ queryKey: ["staff"], queryFn: () => fetchStaff({}) });

  const roleMutation = useMutation({
    mutationFn: (input: { userId: string; role: AppRole }) => changeRole({ data: input }),
    onSuccess: () => {
      toast.success("Role updated.");
      queryClient.invalidateQueries({ queryKey: ["staff"] });
    },
    onError: (error) =>
      toast.error(error instanceof Error ? error.message : "The role could not be changed."),
  });

  return (
    <StaffShell roles={access.data?.roles ?? []} name={access.data?.fullName}>
      <h1 className="font-display text-2xl tracking-tight text-foreground">Staff roles</h1>
      <p className="mt-2 text-sm text-muted-foreground">
        Roles decide who may publish, archive and open sealed matters. Changes are audited.
      </p>

      {staff.isError ? (
        <div className="mt-6">
          <ErrorNotice error={staff.error} />
        </div>
      ) : null}

      {staff.isLoading ? (
        <p className="mt-6 text-sm text-muted-foreground">Loading staff…</p>
      ) : staff.data ? (
        <section className="mt-6 overflow-hidden rounded-lg border border-border bg-card">
          <table className="w-full text-left text-sm">
            <thead className="border-b border-border text-xs uppercase tracking-wide text-muted-foreground">
              <tr>
                <th className="px-5 py-3 font-medium">Officer</th>
                <th className="px-5 py-3 font-medium">Email</th>
                <th className="px-5 py-3 font-medium">Role</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {staff.data.staff.map((member) => (
                <tr key={member.id}>
                  <td className="px-5 py-3 text-foreground">
                    {member.full_name || "Name not recorded"}
                    {member.id === staff.data.selfId ? (
                      <span className="ml-2 text-xs text-muted-foreground">(you)</span>
                    ) : null}
                  </td>
                  <td className="px-5 py-3 text-muted-foreground">{member.email}</td>
                  <td className="px-5 py-3">
                    <Select
                      value={member.roles[0] ?? ""}
                      disabled={roleMutation.isPending}
                      onValueChange={(value) =>
                        roleMutation.mutate({ userId: member.id, role: value as AppRole })
                      }
                    >
                      <SelectTrigger className="w-48">
                        <SelectValue placeholder="No role assigned" />
                      </SelectTrigger>
                      <SelectContent>
                        {ROLES.map((role) => (
                          <SelectItem key={role} value={role}>
                            {ROLE_LABELS[role]}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      ) : null}
    </StaffShell>
  );
}

function useAccessFn() {
  return getMyAccess({});
}
