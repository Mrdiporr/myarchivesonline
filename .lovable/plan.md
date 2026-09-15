# Judicial Archive: Staff Screens, Document Panel, End-to-End Walkthrough

The backend (database, roles, sealed-case rules, audit trail) and the case/session workflow actions are already in place. What remains is the file-handling and role actions, the whole staff interface, and a real end-to-end run.

## Remaining server-side actions

- **Document handling** — register an uploaded file against a case or a session (original filename, storage path, MIME type, SHA-256 hash, size), list files, issue a short-lived download link, and soft-delete a file. Only PDF and DOCX accepted; the fingerprint is computed in the browser before upload so it reflects the exact bytes stored. Each action records an audit entry.
- **Role administration** — list staff with their current role and change a role. Administrator status is verified on the server before anything is written; every change is audited.

## Screens

- **Sign in** — email and password plus Google, and a gate so every staff screen requires sign-in.
- **Home** — brief public cover with a sign-in prompt (replaces the starter page).
- **Dashboard** — counts by status, cases awaiting review, recent activity, session total, quick links.
- **Cases list** — search by title, suit number or subject; filter by status, document type and date range; paged; sealed cases marked, and never shown to anyone without clearance. Includes the new-case form.
- **Case detail** — full metadata, status badge, only the workflow buttons the signed-in person may actually use, edit form, document panel (upload, download, remove), and the proceedings timeline.
- **Proceedings timeline** — chronological session entries per case (session date, presiding judge, notes), add and edit, each with its own attachments.
- **Role administration** — administrators only; a non-administrator cannot reach it or use it.

Anything that cannot be done safely says so plainly rather than pretending to succeed.

## Verification walkthrough

After the screens are built I sign in as a staff account and drive one real case through the interface: create it, submit it for review, publish it, archive it, upload a PDF and a DOCX to it, then read back the audit trail and confirm the entries and their tamper-evident chain are intact. I report exactly what I observed, including anything that failed.

## Technical notes

- `src/lib/documents.functions.ts` and `src/lib/roles.functions.ts` using `createServerFn` + `requireSupabaseAuth`; user-scoped reads/writes through the request-scoped client so RLS applies. Signed URLs and privileged role writes use the service-role client inside handlers after authorisation.
- Uploads go to the private `case-documents` bucket at `<attachable_type>/<attachable_id>/<uuid>-<filename>`, then are registered in `document_files`; hash via `crypto.subtle.digest('SHA-256')`.
- Routes: public `/` and `/auth`; `_authenticated/` gate with `dashboard`, `cases`, `cases/$caseId`, `admin/roles`. Reads use route loaders plus TanStack Query; each route gets its own head metadata.
- Design: restrained judicial/records aesthetic (deep ink navy, parchment neutrals, serif display headings) via semantic tokens in `src/styles.css` — no hardcoded colour utilities.
- Audit chain verification is administrator-only and service-role executed, so it is read through a server function.
