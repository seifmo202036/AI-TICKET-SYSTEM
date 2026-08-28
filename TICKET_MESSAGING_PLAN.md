# Ticket Messaging Implementation Plan

## Objective

Allow a ticket's customer and its currently assigned agent to exchange text
messages now, with private image attachments and real-time notifications added
in later milestones.

The target relationship is:

```text
ticket
  -> message
       -> attachment
```

This means an attachment belongs to one specific message rather than directly
to a ticket.

## Architecture and rules

```text
Customer / assigned agent
        |
        | POST /api/v1/tickets/:ticketId/messages
        v
Express API
  - authentication
  - ticket authorization
  - request validation
        |
        +-- text ------------> PostgreSQL
        |
        +-- image -----------> private S3 object
                                  |
                                  +--> metadata -> PostgreSQL
        v
Message created
        |
        +-- later: WebSocket notification
```

### Authorization and ticket-state policy

| Actor / state | Triaging | Open | Assigned | Resolved | Closed |
| --- | --- | --- | --- | --- | --- |
| Owning customer: read | Yes | Yes | Yes | Yes | Yes |
| Owning customer: send | Yes | Yes | Yes | Yes | No |
| Assigned agent: read | No | No | Yes | Yes | Yes |
| Assigned agent: send | No | No | Yes | Yes | No |
| Any other customer or agent | No | No | No | No | No |

An agent must be the ticket's `assigned_agent_id`; being authenticated or able
to view the open-ticket queue is not sufficient to access its conversation.
The service layer owns these checks, not the repository.

### Initial HTTP contract

Text-only `POST /api/v1/tickets/:ticketId/messages` requests continue to
accept JSON:

```json
{ "body": "The issue is still happening." }
```

It returns `201` with a new, camelCase message object:

```json
{
  "message": {
    "id": "94",
    "ticketId": "22",
    "sender": { "id": "15", "userName": "seif", "role": "customer" },
    "body": "The issue is still happening.",
    "attachments": [],
    "createdAt": "2026-08-27T12:00:00.000Z"
  }
}
```

Image requests use `multipart/form-data` with an optional `body` text field and
at most one `image` field. A message must include text, an image, or both.
Images are private JPEG, PNG, or WebP objects capped at 5 MB; the API stores
only their S3 keys and returns short-lived signed URLs.

`GET /api/v1/tickets/:ticketId/messages?limit=50&beforeId=180` returns the
authorized conversation. The database query may fetch newest-first for cursor
pagination, but the API returns messages in chronological order for display.
`limit` defaults to 50 and has an explicit maximum.

## Progress snapshot

- **Status:** Milestone 6 client integration is complete and awaiting review.
  Real-time delivery has not started.
- **Completed:** Schema migrations, text messaging, private image uploads,
  attachment retrieval, and API verification.
- **Next milestone:** Add real-time delivery only after the client UI review.

### Completed discovery

- [x] Confirmed the existing `ticket_messages` table already has `ticket_id`,
  `sender_id`, `body`, and `created_at`.
- [x] Confirmed the existing message index is `(ticket_id, created_at)`.
- [x] Confirmed the existing `ticket_attachments` table incorrectly points to
  `ticket_id`, so it needs redesigning before image support.
- [x] Confirmed no ticket-message module, handlers, repository operations, or
  endpoint tests exist yet.
- [x] Documented the authorization and closed-ticket rules above.

## Manageable task list

### Milestone 0 — confirm scope and migration safety

- [x] Confirmed text messaging is the first delivery. Image attachments follow
  once both HTTP text endpoints are complete.
- [x] Checked the currently configured database: `ticket_messages` has zero
  rows and `ticket_attachments` has zero rows.
- [x] Confirmed that the current database needs no attachment-data backfill.
- [x] Chosen the safe migration approach: retain historical migrations and add
  the next forward migration (`008_*`) with a matching down migration.
- [x] **Review gate:** approved Milestone 0 before any schema, endpoint, or
  dependency changes begin.

**Done when:** the database change has a safe, approved migration path.

### Milestone 1 — reshape the persistence model for attachments

- [x] Make `ticket_messages.body` nullable.
- [x] Replace its non-blank constraint so non-null bodies still cannot be blank.
- [x] Rebuild `ticket_attachments` to use `message_id`, `s3_key`, `mime_type`,
  `file_size_bytes`, and `created_at`.
- [x] Add the foreign key `ticket_attachments.message_id -> ticket_messages.id`
  with `ON DELETE CASCADE`.
- [x] Restrict attachment MIME types to JPEG, PNG, and WebP.
- [x] Add/check the positive file-size and non-blank S3-key constraints.
- [x] Replace the message index with `(ticket_id, created_at, id)` and add
  `ticket_attachments(message_id)`.
- [x] Apply the migration to the configured development database and verify
  both up and down migrations.
- [x] **Review gate:** approved Milestone 1 before message API implementation
  begins.

**Done when:** the schema permits text-only, image-only, and text-plus-image
messages, but does not permit invalid attachment metadata.

### Milestone 2 — build the text-only message domain

- [x] Create `src/modules/ticket-messages/` with types, validation,
  repository, service, controller, and focused tests.
- [x] Add `CreateMessageInput` validation: strict JSON, trimmed non-empty
  `body`, maximum 2,000 characters.
- [x] Implement a shared service authorization helper: customer owns the ticket
  **or** agent is its assigned agent.
- [x] Make the helper return `404 TICKET_NOT_FOUND` for absent/soft-deleted
  tickets and `403 FORBIDDEN` for unauthorized users.
- [x] Implement `createMessage(ticketId, senderId, role, input)` using a ticket
  row lock. Reject closed tickets with `409 TICKET_CLOSED` before inserting.
- [x] Implement repository insertion into `ticket_messages`, with a mapping
  from database snake_case to the public camelCase message shape.
- [x] Add the POST handler to the existing ticket router with authentication but
  without a static role middleware; the service must make the dynamic decision.
- [x] Run focused validation, service, and controller tests; run TypeScript type
  checking and linting.
- [x] **Review gate:** approved Milestone 2 before conversation retrieval begins.

**Done when:** the customer and assigned agent can reliably create text
messages, and no other account can create one.

### Milestone 3 — retrieve the conversation

- [x] Add validated query parameters: `limit` (default 50, capped) and optional
  positive-integer `beforeId`.
- [x] Implement `getMessages(ticketId, userId, role, query)` using the same
  ticket authorization rules as POST.
- [x] Query message rows with safe cursor pagination and deterministic ordering
  by `created_at` and `id`.
- [x] Join only safe sender data: user ID, username, and role; never return an
  email address or password-related data.
- [x] Add the GET handler before the generic `GET /:ticketId` route.
- [x] Return the page in chronological display order plus pagination metadata
  (for example `nextBeforeId` when another page exists).
- [x] Run focused validation, service, and controller tests; run TypeScript type
  checking, linting, and Prettier verification.
- [x] **Review gate:** approved Milestone 3 before the full text API verification
  suite begins.

**Done when:** authorized participants see a stable, correctly ordered
conversation and everyone else receives no conversation data.

### Milestone 4 — prove the text API

- [x] Add unit tests for body and query validation, including trimming and
  bounds.
- [x] Add service tests for customer and assigned-agent authorization.
- [x] Add service tests for other customers, unassigned agents, and agents
  assigned to a different ticket.
- [x] Add service tests for missing and closed tickets, including the write lock
  / rollback path.
- [x] Add controller tests for `201`, `200`, and mapped error responses.
- [x] Add Playwright API tests for both endpoints, participant visibility, and
  cursor ordering.
- [x] Run TypeScript type checking, linting, all unit tests, and the complete
  e2e suite. No failures remain.
- [x] **Review gate:** approved Milestone 4 before image-upload implementation
  begins.

**Done when:** all text-messaging rules pass locally through the repository's
Vitest and Playwright setup.

### Milestone 5 — add private screenshot uploads

- [x] Choose and configure the S3-compatible storage client and environment
  variables without committing credentials.
- [x] Add multipart handling that accepts at most one `image` field per message.
- [x] Allow only `image/jpeg`, `image/png`, and `image/webp`; cap size at 5 MB.
- [x] Expand validation to allow text-only, image-only, or both, and reject an
  empty message with `400 EMPTY_MESSAGE`.
- [x] Generate an opaque object key such as
  `tickets/<ticketId>/messages/<uuid>.png`; store the key, never a signed URL.
- [x] Add a forward migration that makes attachment file-size metadata required
  and stores it as `BIGINT`.
- [x] Authorize the sender before upload whenever possible.
- [x] Upload to the private bucket, then create the message and attachment rows
  in one PostgreSQL transaction.
- [x] If the database transaction fails after upload, delete the uploaded object
  as compensation and surface the original failure.
- [x] Extend GET messages to load attachments and convert each stored S3 key to
  a short-lived signed image URL.
- [x] Add tests for text-only, image-only, text-plus-image, invalid MIME type,
  oversized files, S3 failures, and DB-compensation cleanup.
- [ ] **Review gate:** approve Milestone 5 before client UI or real-time work
  begins.

**Done when:** private images are attached to the correct message, authorized
readers receive temporary URLs, and orphaned uploads are cleaned up on DB
failure.

### Milestone 6 — client integration and future real-time delivery

- [x] Add a ticket conversation panel that fetches messages, renders sender and
  timestamp information, and posts new text messages.
- [x] Add upload UI, progress/error states, image previews, and accessible
  labels once Milestone 5 is complete.
- [x] Define read-only closed-ticket UI behavior.
- [ ] **Review gate:** approve the client UI before real-time delivery begins.
- [ ] Add a WebSocket or server-sent-event notification only after the HTTP API
  is fully tested; it should notify participants of a successfully persisted
  message, not replace persistence.

**Done when:** the ticket UI consumes the tested HTTP API, and real-time updates
are an additive enhancement.

## Change log

| Date | Progress |
| --- | --- |
| 2026-08-27 | Created this plan. Completed repository/schema discovery and documented the target authorization policy. No production code or database changes have been made. |
| 2026-08-27 | Completed Milestone 0. The currently configured database contains zero message and attachment rows; a forward `008_*` migration is safe. Paused for review before making any implementation change. |
| 2026-08-27 | Completed Milestone 1. Applied `008_restructure_ticket_message_attachments.sql` to the configured development database and verified its down migration inside a transaction that was rolled back. Paused before API implementation. |
| 2026-08-27 | Completed Milestone 2. Added the transactional text-only `POST /api/v1/tickets/:ticketId/messages` flow with ticket-participant authorization. `npm.cmd run typecheck`, `npm.cmd run lint`, and 22 focused Vitest tests pass. Paused before GET conversation work. |
| 2026-08-27 | Completed Milestone 3. Added `GET /api/v1/tickets/:ticketId/messages` with participant authorization, cursor pagination, and chronological response ordering. `npm.cmd run typecheck`, `npm.cmd run lint`, Prettier, and 39 focused Vitest tests pass. Paused before the full verification suite. |
| 2026-08-27 | Completed Milestone 4. Added message API e2e coverage and corrected the e2e seeded-user mapping. Type checking, linting, all 197 Vitest tests, and all 53 Playwright API tests pass. Paused before image-upload work. |
| 2026-08-28 | Completed Milestone 5. Added private S3-compatible image uploads, multipart validation, attachment persistence, signed image URLs, and S3 cleanup when the database transaction fails. Applied migration `009_require_ticket_message_attachment_size.sql`; verified its down migration inside a rolled-back transaction. All 207 Vitest tests and all 54 Playwright API tests pass. Paused before client UI or real-time work. |
| 2026-08-28 | Completed the Milestone 6 client UI portion. Added customer and assigned-agent conversation panels, chronological pagination, text and image composition, image previews, upload/error states, and closed-ticket read-only behavior. The client production build passes. Paused before real-time delivery. |

## Working notes

- The existing project uses Vitest and Playwright, so this plan uses those tools
  rather than Jest/Supertest.
- The text-only API can be delivered before Milestone 1 because the current
  `body NOT NULL` schema supports it. Complete Milestone 1 before accepting
  image-only messages.
- Do not modify already-applied migrations 003, 004, or 006. A forward migration
  keeps deployed databases and migration history consistent.
