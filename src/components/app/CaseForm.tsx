import { useState } from "react";

import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { DOCUMENT_TYPES, DOCUMENT_TYPE_LABELS, type DocumentType } from "@/lib/roles";

export type CaseFormValues = {
  case_title: string;
  suit_number: string;
  subject_matter: string;
  document_type: DocumentType;
  date_delivered: string | null;
  is_sealed: boolean;
};

export function CaseForm({
  initial,
  submitLabel,
  busy,
  canSeal,
  onSubmit,
  onCancel,
}: {
  initial?: Partial<CaseFormValues>;
  submitLabel: string;
  busy?: boolean;
  canSeal: boolean;
  onSubmit: (values: CaseFormValues) => void;
  onCancel?: () => void;
}) {
  const [values, setValues] = useState<CaseFormValues>({
    case_title: initial?.case_title ?? "",
    suit_number: initial?.suit_number ?? "",
    subject_matter: initial?.subject_matter ?? "",
    document_type: initial?.document_type ?? "judgment",
    date_delivered: initial?.date_delivered ?? "",
    is_sealed: initial?.is_sealed ?? false,
  });

  function set<K extends keyof CaseFormValues>(key: K, value: CaseFormValues[K]) {
    setValues((prev) => ({ ...prev, [key]: value }));
  }

  return (
    <form
      className="grid gap-4 sm:grid-cols-2"
      onSubmit={(event) => {
        event.preventDefault();
        onSubmit({ ...values, date_delivered: values.date_delivered || null });
      }}
    >
      <div className="space-y-2 sm:col-span-2">
        <Label htmlFor="case_title">Case title</Label>
        <Input
          id="case_title"
          value={values.case_title}
          onChange={(e) => set("case_title", e.target.value)}
          required
          minLength={3}
        />
      </div>
      <div className="space-y-2">
        <Label htmlFor="suit_number">Suit number</Label>
        <Input
          id="suit_number"
          value={values.suit_number}
          onChange={(e) => set("suit_number", e.target.value)}
          required
        />
      </div>
      <div className="space-y-2">
        <Label htmlFor="subject_matter">Subject matter</Label>
        <Input
          id="subject_matter"
          value={values.subject_matter}
          onChange={(e) => set("subject_matter", e.target.value)}
          required
        />
      </div>
      <div className="space-y-2">
        <Label htmlFor="document_type">Document type</Label>
        <Select
          value={values.document_type}
          onValueChange={(value) => set("document_type", value as DocumentType)}
        >
          <SelectTrigger id="document_type">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {DOCUMENT_TYPES.map((type) => (
              <SelectItem key={type} value={type}>
                {DOCUMENT_TYPE_LABELS[type]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <div className="space-y-2">
        <Label htmlFor="date_delivered">Date delivered</Label>
        <Input
          id="date_delivered"
          type="date"
          value={values.date_delivered ?? ""}
          onChange={(e) => set("date_delivered", e.target.value)}
        />
      </div>
      <div className="flex items-center gap-2 sm:col-span-2">
        <Checkbox
          id="is_sealed"
          checked={values.is_sealed}
          disabled={!canSeal}
          onCheckedChange={(checked) => set("is_sealed", checked === true)}
        />
        <Label htmlFor="is_sealed" className="font-normal">
          Seal this matter
          {canSeal ? "" : " (only administrators and judges may seal)"}
        </Label>
      </div>
      <div className="flex gap-2 sm:col-span-2">
        <Button type="submit" disabled={busy}>
          {busy ? "Saving…" : submitLabel}
        </Button>
        {onCancel ? (
          <Button type="button" variant="outline" onClick={onCancel}>
            Cancel
          </Button>
        ) : null}
      </div>
    </form>
  );
}
