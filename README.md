# Court Ledger

# AGENT DIRECTIVE: Agency-Grade Judicial Document Archive & Case Proceedings System

## CONTEXT & ROLE
You are an elite Lead Software Engineer building a mission-critical, enterprise-grade module: the **Judicial Document Archive & Case Proceedings System**.

This system handles sensitive court documents (Judgments, Rulings, Orders) and Daily Session Transcripts. It relies strictly on **manual data entry, strict multi-field indexing, robust Role-Based Access Control (RBAC), state-machine workflows, and tamper-evident audit trails**.

> **SCOPE CONSTRAINT:** Do NOT build automated OCR engines, AI metadata extractors, or automated text pre-processors. All AI features are deferred to future phases. However, all database schemas and service classes MUST expose clean extension interfaces (e.g., event listeners and queue hooks) to attach future pipeline services without refactoring core logic.

## IMPLEMENTATION EXPECTATIONS
Build this as a production-minded application, not a static mockup. Use the platform's supported full-stack architecture and PostgreSQL/Supabase capabilities where appropriate. Translate the supplied schema into the project's native migration/data-access architecture rather than treating the SQL as merely illustrative. Preserve strict integrity constraints, UUID identifiers, foreign keys, soft deletes, indexes, file hashes, and audit-chain fields. Do not weaken security or replace server-side authorization with UI-only checks.

Before implementing, inspect the generated project and establish a coherent domain architecture. Implement the core application end-to-end, including database schema/migrations, authentication, authorization, document/file handling, case management, proceedings, workflows, audit logging, search/filtering, and a premium professional UI. Do not fabricate completed backend behavior in the UI. If a capability cannot safely be completed in the current environment, expose it honestly as unavailable rather than simulating success.

## DATABASE SCHEMA (POSTGRESQL)
Implement the following domain model with strict integrity constraints, foreign key cascades where specified, soft deletes, timestamps, and explicit indexes. Adapt syntax to the project's migration system while preserving semantics:

### Core Cases
- id UUID primary key with generated UUID
- case_title VARCHAR(512) NOT NULL
- suit_number VARCHAR(128) NOT NULL UNIQUE
- normalized_suit_number VARCHAR(128) NOT NULL UNIQUE; normalize by removing spaces/special characters for matching
- date_delivered DATE NULL
- subject_matter VARCHAR(256) NOT NULL
- document_type VARCHAR(64) constrained to judgment, ruling, order, case_file
- status VARCHAR(32) constrained to draft, pending_review, published, archived; default draft
- is_sealed BOOLEAN NOT NULL DEFAULT FALSE
- created_by UUID NOT NULL referencing users
- updated_by UUID NULL referencing users
- deleted_at timestamp NULL
- created_at/updated_at timestamptz defaults
- index for normalized_suit_number, subject_matter, document_type, status

### Case Proceedings / Daily Session Transcripts
- id UUID primary key
- case_id UUID NOT NULL references cases ON DELETE CASCADE
- session_date DATE NOT NULL
- presiding_judge VARCHAR(256) NOT NULL
- summary_notes TEXT NULL
- status constrained to draft/published; default draft
- created_by UUID NOT NULL referencing users
- deleted_at timestamp NULL
- created_at/updated_at timestamptz
- unique(case_id, session_date)
- index(case_id, session_date DESC)

### Document File Storage Registry
- id UUID primary key
- attachable_type VARCHAR(256) NOT NULL for polymorphic association to Case or CaseProceeding
- attachable_id UUID NOT NULL
- original_filename VARCHAR(255) NOT NULL
- storage_path VARCHAR(512) NOT NULL
- mime_type VARCHAR(128) NOT NULL
- file_hash CHAR(64) NOT NULL for SHA-256 integrity/deduplication
- file_size BIGINT NOT NULL
- created_by UUID NOT NULL referencing users
- deleted_at timestamp NULL
- created_at timestamptz
- index(file_hash)

### Cryptographically Chained Immutable Audit Trail
- id UUID primary key
- user_id UUID NULL referencing users
- action VARCHAR(64) NOT NULL, examples CASE_CREATED, PROCEEDING_ADDED, FILE_VIEWED, FILE_DOWNLOADED
- target_type VARCHAR(128) NOT NULL
- target_id UUID NOT NULL
- ip_address VARCHAR(45) NOT NULL
- user_agent TEXT NULL
- metadata JSONB NULL
- previous_hash CHAR(64) NULL
- current_hash CHAR(64) NOT NULL, computed as SHA-256 over canonicalized id + user_id + action + target_id + timestamp + previous_hash (include any additional immutable fields only if documented consistently)
- created_at timestamptz

## REQUIRED FUNCTIONAL AREAS

### 1. Authentication & RBAC
Implement secure authentication and server-side authorization. At minimum support roles appropriate to:
- Administrator
- Judge/Magistrate
- Clerk/Authorized Staff

Enforce ownership/access permissions on the backend. Sealed cases must receive stricter access treatment. Do not rely on hiding UI controls.

### 2. Case Archive
Provide:
- create case
- edit draft case
- submit for review
- publish
- archive
- view case
- case metadata form
- document attachment
- sealed-case indicator
- status/state transitions with invalid transitions rejected

Required case metadata: Case Title, Suit Number, Date Delivered, Subject Matter, Document Type.

### 3. Proceedings / Daily Session Transcripts
Provide a chronological case proceedings timeline with:
- session date
- presiding judge
- summary notes
- transcript/document attachment
- draft/published state
- uniqueness enforcement for one session per case/date
- chronological retrieval

### 4. File Management
Support secure upload and storage for PDF and DOCX at minimum. Validate MIME/type and reasonable size limits. Calculate SHA-256 on upload. Detect exact duplicates by hash where appropriate. Store files privately and serve them through authorized application paths rather than exposing raw storage URLs. Preserve original filenames.

### 5. Search & Retrieval
Implement high-quality server-backed search/filtering over:
- case title
- suit number and normalized suit number
- date delivered/date ranges
- subject matter
- document type
- case status
- sealed state according to permissions
- presiding judge
- proceedings/session date

Provide pagination, useful empty states, clear result cards/table presentation, and fast retrieval. Full-text document-content search/OCR is explicitly deferred; do not fake it.

### 6. Workflow / State Machine
Implement explicit transitions rather than arbitrary status edits.

Cases:
DRAFT -> PENDING_REVIEW -> PUBLISHED -> ARCHIVED
with appropriate authorized transitions and rejection/error handling where applicable.

Proceedings:
DRAFT -> PUBLISHED

Record workflow actions in the audit trail.

### 7. Audit Trail
Every sensitive mutation/access action should create an audit event, including authentication/security events where practical, case creation/update/status changes, proceeding creation/update/status changes, file upload/view/download/delete/restore, permission changes, and sealed-case access.

Audit records must be tamper-evident through the previous_hash/current_hash chain. Centralize audit creation in a service/hook so application code cannot silently bypass it. Document chain semantics and ensure deterministic canonicalization before hashing.

Provide an administrator-facing audit viewer with filters by actor, action, target, and date. Do not provide ordinary users with destructive audit editing/deletion capabilities.

### 8. Future AI/Automation Extension Points
Do NOT implement OCR, AI extraction, automatic metadata inference, or automated preprocessing in this phase.

However, architect clean extension points such as:
- document uploaded event
- file attached event
- case created/approved event
- processing queue interface
- document analysis service interface/stub
- metadata enrichment event

Future AI services must be able to subscribe/process asynchronously without rewriting the Case, File, Workflow, or Audit domains.

## UI/UX REQUIREMENTS
Build a premium, restrained judicial/institutional interface. Prioritize clarity, hierarchy, accessibility, responsiveness, information density appropriate for professional users, and trustworthy visual language over decorative effects.

Include:
- authenticated dashboard
- global search
- cases list
- case detail page
- create/edit case forms
- proceedings timeline
- secure document panel
- review/workflow status indicators
- audit viewer for administrators
- user/role administration for administrators
- clear sealed-case warnings
- empty/loading/error states
- confirmation for destructive actions

The UI should make the application feel like a serious professional archive, not a generic CRUD starter.

## ENGINEERING QUALITY BAR
- Strong typing throughout.
- Centralized validation and authorization.
- Reusable domain/service components.
- No duplicated business rules between UI and backend.
- No hard-coded fake records presented as real data.
- Robust error handling.
- Secure file handling.
- Transactional workflow/status changes where needed.
- Database constraints must backstop application validation.
- Indexes must match real query patterns.
- Avoid unnecessary complexity/microservices.
- Preserve clean boundaries so future AI/OCR ingestion can be attached later.

## DELIVERABLE
Implement the application in the project. Then verify the implementation against the requirements: database/domain integrity, authentication/RBAC, state transitions, secure file handling, search/filtering, proceedings, audit-chain behavior, and future extension points. Fix material issues you discover before declaring the phase complete. Provide a concise implementation report listing what was implemented, any environment limitations, and any genuinely remaining gaps. Do not claim functionality that was not actually implemented.

This project was built with [Lovable](https://lovable.dev).

**Live app**: https://myarchivesonline.lovable.app

## Build with Lovable

Continue developing this project in the [Lovable editor](https://lovable.dev/projects/7ff39b4c-3050-4dd6-aa99-193f2748b0e9).

- **Ship faster**: describe what you want to build and Lovable handles the code.
- **Stay in sync**: every change made in Lovable is committed straight to this repository.
- **Full ownership**: this code is yours. Push to `main` on GitHub and your changes sync back into Lovable, ready for your next prompt.

## Development

Prefer working locally? You need Node.js and npm — [install with nvm](https://github.com/nvm-sh/nvm#installing-and-updating).

```sh
git clone <this-repository-url>
cd <repository-name>
npm i
npm run dev
```
