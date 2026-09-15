import { Badge } from "@/components/ui/badge";
import { STATUS_LABELS, type CaseStatus } from "@/lib/roles";

const TONE: Record<CaseStatus, string> = {
  draft: "bg-muted text-muted-foreground",
  pending_review: "bg-accent text-accent-foreground",
  published: "bg-primary text-primary-foreground",
  archived: "bg-secondary text-secondary-foreground",
};

export function StatusBadge({ status }: { status: string }) {
  const key = (status as CaseStatus) in STATUS_LABELS ? (status as CaseStatus) : null;
  return (
    <Badge className={`rounded-sm border-0 font-medium ${key ? TONE[key] : "bg-muted"}`}>
      {key ? STATUS_LABELS[key] : status}
    </Badge>
  );
}

export function SealedBadge() {
  return (
    <Badge className="rounded-sm border-0 bg-seal font-medium text-seal-foreground">Sealed</Badge>
  );
}
