# Mailing List Public Subscription Pages — Design

Date: 2026-05-05
Status: Draft, awaiting approval before implementation

## 1. Goal

Allow an admin to associate any mailing list with a public, unauthenticated
subscription page. New subscribers go through a double-opt-in flow:

1. Visitor submits name + email on the public page.
2. Service emails a confirmation link.
3. Visitor clicks the link → becomes a list member.
4. Service emails the new member a welcome message containing a permanent
   unsubscribe link.
5. Optionally, the list creator is notified that a new member confirmed.

Defaults are adequate for all four user-facing surfaces (page, confirmation
email, welcome email, creator-notice email), but each can be replaced
entirely per-list using the same HTML editor used by the compose-mail view.

## 2. Decisions (locked)

| Topic | Decision |
|---|---|
| Public URL | `/subscribe/<appId>/<slug>` (per-list slug chosen by admin) |
| Default state | Opt-in per list; admin enables "Public subscription page" toggle |
| Creator identity | New `createdBy` + `creatorEmail` columns on `MailingList`, captured at create time, editable on list settings |
| Override storage | Reuse `Template` model; add `kind` enum + nullable `mailingListId`. Campaign templates remain `kind = 'campaign'` |
| Token model | Random opaque tokens stored in DB. Confirm token TTL = 48 h. Unsubscribe token permanent per member |

## 3. Schema changes (Prisma)

```prisma
model MailingList {
  id                  Int                 @id @default(autoincrement())
  appId               String
  name                String              @db.VarChar(128)
  createdAt           DateTime            @default(now())
  // NEW
  createdBy           String?             @db.VarChar(128)   // JWT sub of admin
  creatorEmail        String?             @db.VarChar(254)   // editable; receives optional notice
  subscribePageEnabled Boolean            @default(false)
  subscribeSlug       String?             @db.VarChar(64)    // unique per appId when set
  notifyCreatorOnJoin Boolean             @default(false)
  // existing relations
  app                 App                 @relation(fields: [appId], references: [id], onDelete: Cascade)
  members             MailingListMember[]
  pendingSubscriptions PendingSubscription[]
  subscribeTemplates  Template[]          @relation("MailingListTemplates")

  @@unique([appId, name], map: "MailingList_appId_name_key")
  @@unique([appId, subscribeSlug], map: "MailingList_appId_slug_key")
  @@index([appId], map: "MailingList_appId_idx")
}

model MailingListMember {
  id                Int         @id @default(autoincrement())
  listId            Int
  name              String      @default("") @db.VarChar(64)
  email             String      @db.VarChar(254)
  createdAt         DateTime    @default(now())
  // NEW
  unsubscribeToken  String?     @unique @db.VarChar(64)  // null for admin-added members; lazily generated on first need
  confirmedAt       DateTime?                            // null = added by admin (legacy), set when added via subscribe flow
  list              MailingList @relation(fields: [listId], references: [id], onDelete: Cascade)

  @@unique([listId, email], map: "MailingListMember_list_email_key")
  @@index([listId], map: "MailingListMember_listId_idx")
}

// NEW
model PendingSubscription {
  id          Int         @id @default(autoincrement())
  listId      Int
  email       String      @db.VarChar(254)
  name        String      @default("") @db.VarChar(64)
  token       String      @unique @db.VarChar(64)
  createdAt   DateTime    @default(now())
  expiresAt   DateTime
  list        MailingList @relation(fields: [listId], references: [id], onDelete: Cascade)

  @@unique([listId, email], map: "PendingSubscription_list_email_key")
  @@index([expiresAt])
}

model Template {
  // existing columns…
  // NEW
  kind          TemplateKind  @default(CAMPAIGN)
  mailingListId Int?
  mailingList   MailingList?  @relation("MailingListTemplates", fields: [mailingListId], references: [id], onDelete: Cascade)

  @@index([appId, kind], map: "Template_appId_kind_idx")
  @@index([mailingListId, kind], map: "Template_listId_kind_idx")
}

enum TemplateKind {
  CAMPAIGN          // existing campaign / compose templates
  SUBSCRIBE_PAGE    // public subscription page HTML
  CONFIRM_EMAIL     // double-opt-in email
  WELCOME_EMAIL     // sent on confirmation
  CREATOR_NOTICE    // sent to creatorEmail when notifyCreatorOnJoin
}
```

Backfill migration:
- `Template.kind = 'CAMPAIGN'` for all existing rows.
- `MailingList.createdBy = NULL`, `creatorEmail = NULL` (editable later).
- Existing `MailingListMember` rows get `confirmedAt = NULL`, `unsubscribeToken = NULL`. Token is generated lazily the first time we need a link for that member (e.g. when they're sent any list email).

The compose-mail UI already lists templates via `GET /api/templates`; that
endpoint will be filtered to `kind = 'CAMPAIGN'` so per-list overrides
never appear in the campaign picker.

## 4. Backend modules

```
src/modules/mailinglists/
  service.ts        // existing, extended
  routes.ts         // existing admin routes, extended
  subscribeService.ts  // NEW: pending, confirm, welcome, unsubscribe logic
  subscribeRoutes.ts   // NEW: public page, submit, confirm, unsubscribe
  defaults.ts          // NEW: default HTML for page + 3 emails
  tokens.ts            // NEW: 32-byte random token generator
```

### 4.1 Admin endpoints (authenticated, scoped to appId)

| Method | Path | Purpose |
|---|---|---|
| GET    | `/mailing-lists/:id/subscribe-settings`        | Read settings + override-template ids/content |
| PUT    | `/mailing-lists/:id/subscribe-settings`        | Update enabled, slug, notifyCreatorOnJoin, creatorEmail |
| PUT    | `/mailing-lists/:id/templates/:kind`           | Upsert per-list HTML override (kind ∈ subscribe_page \| confirm_email \| welcome_email \| creator_notice). Body: `{ subject?, content }` |
| DELETE | `/mailing-lists/:id/templates/:kind`           | Revert to default |
| GET    | `/mailing-lists/:id/pending-subscriptions`     | (Optional, useful UX) list & purge expired |

`PUT subscribe-settings` validates slug: `^[a-z0-9][a-z0-9-]{1,63}$`,
unique within the app.

### 4.2 Public endpoints (no auth)

| Method | Path | Purpose |
|---|---|---|
| GET    | `/subscribe/:appId/:slug`                       | Render subscription page (HTML) |
| POST   | `/subscribe/:appId/:slug`                       | Accept `{name, email}`; create or refresh pending row; send confirm email; render "check your inbox" |
| GET    | `/subscribe/confirm/:token`                     | Validate token + TTL; create member; send welcome email; optionally send creator notice; render confirmation page |
| GET    | `/subscribe/unsubscribe/:token`                 | Validate; show confirm-unsubscribe page (GET-then-POST to satisfy email-client prefetch) |
| POST   | `/subscribe/unsubscribe/:token`                 | Delete member; render goodbye page |

All public routes are rate-limited (Fastify rate-limit plugin if present;
otherwise simple in-memory limiter keyed by IP+slug).

### 4.3 Email rendering

Each email kind has a default HTML body in `defaults.ts`. Mustache vars
available to all overrides: `{{listName}}`, `{{appName}}`,
`{{memberName}}`, `{{memberEmail}}`. Page-specific extras:

- subscribe_page: `{{submitUrl}}`, `{{csrfToken}}` (form posts back to itself; CSRF is a hidden input that mirrors a same-page nonce; not security-critical given public page, but blocks trivial cross-site abuse)
- confirm_email: `{{confirmUrl}}`
- welcome_email: `{{unsubscribeUrl}}`
- creator_notice: `{{memberName}}`, `{{memberEmail}}`, `{{listAdminUrl}}`

Sender + From address come from the existing SMTP resolution chain
(`/api/smtp-from` logic) so subscription emails align with the rest of the
service.

## 5. Frontend admin UI

The mailing-lists admin view (`src/frontend/main.ts` mailing-lists view)
gains a per-list "Subscription page" panel:

- **Toggle:** "Enable public subscription page"
- **Slug** input (auto-suggested from name; live availability check)
- **Public URL preview** with copy button: `https://host/subscribe/<appId>/<slug>`
- **Notify creator on join** toggle + **Creator email** input
- Four "Customize…" buttons (Page, Confirmation email, Welcome email,
  Creator-notice email). Each opens the existing compose HTML editor in a
  modal preloaded with the current override content (or the default if
  none). Saving calls `PUT /mailing-lists/:id/templates/:kind`. A "Reset
  to default" button calls `DELETE`.
- Pending subscriptions count (small badge) with a link to the optional
  pending-subscriptions admin sub-view.

The existing compose HTML editor component is reused as-is — only the
save/load callbacks differ.

## 6. Flow details

```
[visitor opens /subscribe/app1/news]
        │
        ▼
GET → render subscribe_page (override or default), inject hidden form
       fields for csrfToken
        │
        ▼
POST {name,email} → validate → upsert PendingSubscription
       (regenerate token, refresh expiresAt; idempotent for same email)
       → send confirm_email with confirmUrl=/subscribe/confirm/<token>
       → render "check your inbox" (same template, swapped body)
        │
        ▼
GET /subscribe/confirm/<token>
   ├── token missing/expired → render error page (default or override)
   └── token ok →
         create MailingListMember (or update name if email pre-existed)
         set confirmedAt = now, generate unsubscribeToken
         delete PendingSubscription row
         send welcome_email with unsubscribeUrl
         if notifyCreatorOnJoin && creatorEmail → send creator_notice
         render success page
```

Unsubscribe is the inverse: GET shows a confirm screen (to dodge
mail-client URL prefetch deletions), POST deletes the member.

## 7. Cleanup

A small periodic task (added to the existing worker tick or a separate
`PendingSubscription.expiresAt < now` sweep) deletes expired pending rows.
Cheap, no separate cron required.

## 8. Tests

- Unit: token generation, slug validation, default rendering with all vars.
- Integration: full double-opt-in flow against an in-memory SMTP capture.
- Integration: per-list override is used when present; default when absent.
- Integration: campaign-template picker excludes non-CAMPAIGN kinds.
- Security: rate limit on POST `/subscribe/:appId/:slug`; expired token rejected; unsubscribe token can't be reused after delete.

## 9. Out of scope (YAGNI)

- Subscriber preferences (HTML vs text, frequency).
- Multiple subscription pages per list.
- Public archive of past campaigns.
- Captcha (can be added later behind a config flag if abuse appears).
