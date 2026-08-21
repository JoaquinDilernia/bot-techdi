# BOT-TECHDI — Design Spec

Date: 2026-08-21
Status: Approved by user, pending implementation plan

## Context

TECHDI is Joaquin's own business, selling software solutions/automations
(including bot products like this one). TECHDI is starting outbound sales
(3 people on the team today, may grow) and needs its own WhatsApp/Instagram
chatbot CRM to unify the channel with prospects and clients.

Rather than build from scratch, this project clones **BOT-ALTORANCHO**
(`BOT-ALTORANCHO/`) — the most complete/current bot in the family — and
strips/adapts it for TECHDI's different business (B2B services, not
e-commerce).

Sibling projects for reference:
- `BOT-GINEZA` — original bot, flat 2-agent escalation, no departments,
  has Tienda Nube integration.
- `BOT-ALTORANCHO` — clone of Gineza for a large e-commerce client. Added
  dynamic multi-department escalation, Odoo integration, stock by branch,
  notifications, quick replies, templates, cost tracking, user management UI.
  `BOT-ALTORANCHO/CONTEXT_NUEVO_BOT.md` documents its own original
  clone-from-Gineza checklist — useful background, not a spec for this project.

## Purpose of the TECHDI bot

Unlike Gineza/AR (single business type: retail e-commerce), TECHDI's bot
serves two distinct conversation types through the same channel:
- **Leads / preventa**: inbound interest (organic now, paid ads planned
  later) that needs qualifying and routing to close a sale.
- **Soporte pre/post-venta**: existing clients with questions or issues.

Both funnel to human escalation across 3 people today (team may grow).

## Scope for this phase

Duplicate BOT-ALTORANCHO and adapt it. Explicitly OUT of scope for this
phase (deferred to a later iteration):
- Ad-source tracking (Meta Ads `ctwa_clid`, campaign attribution) — no
  fields or plumbing added now, added later when paid ads actually start.
- Populating the Knowledge Base with real TECHDI service/pricing content —
  marketing/product will load this later via the KB and Config screens.
  KB ships empty/placeholder.
- Final visual branding (logo, brand colors) — ships with a neutral
  placeholder theme, easy to swap later.

## What gets removed from the AR codebase

E-commerce specific, not applicable to TECHDI:
- `server/src/services/odoo.service.js`
- `server/src/services/tiendanube.service.js`
- `server/src/routes/tiendanube.routes.js`
- Any Odoo/TiendaNube fields/branches inside `customer.service.js`,
  `bot.service.js`, `claude.service.js`
- Corresponding `.env` vars (`TIENDANUBE_*`, Odoo proxy vars)
- Corresponding `package.json` dependencies

Explicitly requested cuts:
- `server/src/services/notifications.service.js`
- `server/src/routes/notifications.routes.js`
- `client/src/pages/Notifications.jsx` (+ its CSS module)

AR-specific business logic that doesn't generalize:
- Stock-by-branch / local store logic (Belgrano, Las Lomas, Alcorta)
- Any AR-specific urgency keywords / escalation copy in
  `claude.service.js`

## What stays as-is (generic across any client)

Backend: `auth.service.js`, `conversation.service.js`, `firebase.service.js`,
`knowledge.service.js`, `label.service.js`, `meta.service.js`,
`quickreply.service.js`, `template.service.js`, `transcription.service.js`,
`inactivity.service.js` (hourly cron, closes idle bot-only conversations),
`webhook.routes.js`, `auth.routes.js`, `config.routes.js`, `costs.routes.js`,
`knowledge.routes.js`, `label.routes.js`, `quickreply.routes.js`,
`stats.routes.js`, `template.routes.js`.

Frontend: `Login`, `Dashboard`, `Conversations`, `KnowledgeBase`, `Labels`,
`Config`, `QuickReplies`, `Templates`, `Simulator`, `Stats`, `Costs`,
`Profile`, `Users` (AR's existing user-management screen is reused as-is
for TECHDI's team).

## What gets adapted

### Escalation model — "Áreas" (configurable from admin, not hardcoded)

AR's dynamic department engine already supports admin-driven CRUD of
escalation targets (add/rename/remove, assign agents) without a code
deploy. TECHDI wants that same configurability, just without AR's
e-commerce-specific department logic. So the engine is **kept and
simplified**, not removed and hardcoded:

- `department.service.js` / `department.routes.js` / `Departments.jsx`
  are kept, renamed conceptually to "Áreas", stripped of any
  branch/Odoo-specific fields.
- Firestore collection `bot-techdi_areas`: `{ id, name, active, order }`.
- Firestore collection `bot-techdi_agents`: each agent gets `areaIds: []`
  (an agent may belong to more than one area — e.g. one person covering
  both leads and soporte).
- `conversations` documents get `assignedAreaId` (replaces AR's
  `departmentId`) + `assignedTo` (specific agent), same shape as today.
- Bot marker stays dynamic: `[ESCALAR_{AREA_ID}]`, parsed the same way
  `bot.service.js` already parses `[ESCALAR_{DEPT_ID}]` today — no
  structural change to the parser, only to what feeds it.
  `[ESCALAR]` (unassigned/urgent) is kept as a fallback.
- Seed data: two areas out of the box — "Preventa/Leads" and "Soporte" —
  but fully editable/expandable from the admin UI going forward.

### `claude.service.js`

- New system prompt / personality for TECHDI (B2B software/automation
  sales + support, not retail).
- `ESCALATION_INSTRUCTIONS` rewritten to teach the bot the two seeded
  areas and when to use each, in the same dynamic-from-Firestore style
  AR already uses (no hardcoded department names in the prompt-building
  code itself).

### `customer.service.js`

- Simplified: drop TiendaNube order enrichment. Keeps contact identity
  and conversation history only.

## Infra, credentials, deploy

| Item | Decision |
|---|---|
| Repo | New: `github.com/JoaquinDilernia/bot-techdi`. Copy AR's code, drop `.git`, fresh `git init` — no shared history with AR. |
| Firebase | Same project `pedidos-lett-2` (shared with Gineza/AR). New collections prefixed `bot-techdi_` (agents, conversations, knowledge_base, labels, config, areas, quickreplies, templates). |
| Anthropic | Same `ANTHROPIC_API_KEY` (shared account). |
| Meta | **New** app in Meta for Developers — new WhatsApp Business number + Instagram. `.env.example` documents `META_VERIFY_TOKEN`, `WHATSAPP_TOKEN`, `WHATSAPP_PHONE_NUMBER_ID`, `INSTAGRAM_PAGE_ID`, `INSTAGRAM_TOKEN`. Webhook route is already generic in AR (no e-commerce coupling) — reused unchanged. |
| Auth | New `JWT_SECRET`. 3 agent accounts seeded (exact names/emails/passwords to be provided at implementation time, not part of this spec). |
| Deploy | New Railway project (backend) + new Vercel project (frontend), separate from AR's. |
| Branding | Placeholder/neutral theme in `client/src/index.css` (`--color-*` vars), `brandName` = "TechDI" in the sidebar. Swappable later once real brand assets exist. |

## Verification plan

- Run locally (`npm run dev` in `server` and `client`).
- Exercise a simulated conversation via `Simulator.jsx`, confirm an
  `[ESCALAR_{AREA_ID}]` marker flips `humanMode` and the conversation
  shows up in the inbox filtered by that area.
- Confirm cleanup is complete: `grep -ri "tiendanube\|odoo" .` (excluding
  `node_modules`/`.git`) returns nothing in the new repo.
- Confirm `Notifications` and `Departments`-as-e-commerce routes/pages are
  gone (404 / not rendered), and the renamed "Áreas" admin screen works
  for add/edit/assign.

## Explicitly deferred (next iteration, not this spec)

- Ad-source / campaign attribution tracking for leads (Meta Ads
  `ctwa_clid`, UTM-equivalent) — will be designed when paid ads actually
  start running.
- Real KB content and final branding — owned by marketing/product,
  loaded through the admin UI this project ships.
