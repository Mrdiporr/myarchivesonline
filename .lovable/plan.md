# Case Workflow Server Actions + Admin Interface

The backend (database, roles, sealed-case rules, audit trail) is already in place. Nothing of the app itself exists yet — the home page is still the starter placeholder. This step builds the workflow actions and the full staff interface on top of the existing backend.

## Workflow actions

Five server-side actions, each authorising the signed-in user, validating input, writing the change, and appending a tamper-evident audit entry:

- **Create case** — title, suit number, subject matter, document type, date delivered, sealed flag. Starts as Draft. Rejects duplicate suit numbers with a clear message.
- **Edit case** — editable while Draft (own case) or by administrators/judges; refuses edits to archived cases.
- **Submit for review** — Draft to Pending Review, author or authorised staff only.
- **Publish** — Pending Review to Published, administrators and judges only.
- **Archive** — Published to Archived, administrators only.

Allowed transitions are enforced on the server, not in the interface. Every action records who did what, when, and against which case; the audit chain stays unbroken. Each action also emits a workflow event so future automated processing can attach without changing this logic.

## Screens

- **Sign in** page (email + password, plus Google), and a gate so all staff screens require sign-in.
- **Dashboard** — counts by status, cases awaiting review, recent activity, and quick links. This becomes the app's landing screen for signed-in staff; the public home page keeps a brief cover with a sign-in prompt.
- **Cases list** — searchable by title/suit number/subject, filterable by status, document type, and date range, sorted and paged, with sealed cases marked and hidden from anyone without clearance.
- **Case detail** — full metadata, status badge, workflow buttons (only the ones the person may actually use), a document panel for uploading and downloading files stored in the private archive, and the case's proceedings timeline.
- **Proceedings timeline** — chronological session entries per case with session date, presiding judge, and notes; add and edit sessions, each with its own attachments.
- **Role administration** — administrators only: list of staff with their role, and role changes; a non-administrator cannot reach or use it.

Anything that cannot be done safely will say so plainly rather than pretending to succeed.

## Technical notes

- Server functions in `src/lib/*.functions.ts` using `createServerFn` + `requireSupabaseAuth`; user-scoped writes go through the request-scoped client so RLS applies. `src/start.ts` already attaches the bearer token.
- Audit and event helpers (`append_audit_event`, `emit_domain_event`) are revoked from client roles, so they are invoked from inside handlers via the service-role client (`await import('@/integrations/supabase/client.server')`) after the caller and transition have been authorised.
- Statuses follow the existing check constraints: cases `draft | pending_review | published | archived`, proceedings `draft | published`; document types `judgment | ruling | order | case_file`.
- Role reads via `has_role`/`is_staff`; the role admin page verifies `administrator` server-side before any change and writes to `user_roles`.
- File uploads: SHA-256 hash + size computed client-side, object stored in the private `case-documents` bucket under a case-scoped path, then registered in `document_files`; downloads use short-lived signed URLs from a server function.
- Routes: public `/` and `/auth`; `_authenticated/` gate with `dashboard`, `cases`, `cases/$caseId`, `admin/roles`. Reads use route loaders + TanStack Query; each route gets its own head metadata.
- Design: restrained judicial/records aesthetic (deep ink navy, parchment neutrals, serif display headings) via semantic tokens in `src/styles.css` — no hardcoded colour utilities.
