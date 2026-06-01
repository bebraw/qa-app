# ADR-027: Use a Durable Object Panel Room

**Status:** Implemented

**Date:** 2026-05-31

## Context

Future Frontend needs a small audience-question app for conference panels, including both moderated questions and lightweight word-cloud prompts. Attendee, MC, moderator, and word-screen pages should update when other people submit, approve, or vote on content, without requiring a hard refresh. The app also needs multiplayer behavior across Worker isolates, so a question or word approved through one request must become visible through the same authoritative room state.

The near-term requirement is low budget and operational simplicity. Attendees should not need accounts, and the UI should work well on mobile phones. MC and moderator access still needs a trust boundary, but the system does not currently need complex analytics or a separate historical database.

## Decision

We will build the app as a server-rendered Cloudflare Worker backed by one SQLite-backed Durable Object room.

The app uses:

- plain HTML forms and redirects for state-changing actions
- `PANEL_ROOM`, a Cloudflare Durable Object binding to the exported `PanelRoom` class
- a typed external live-update module for attendee, present, operator, question-screen, and word-screen fragments
- a Durable Object server-sent event stream at `/events` for room state-change notifications, with interval polling retained as a fallback
- anonymous attendee cookies for one-vote-per-question and one-vote-per-word behavior
- IP-based throttling for question, word, and vote submissions
- separate signed MC and moderator role cookies
- `AUTH_SECRET`, `MC_PASSCODE`, and `MODERATOR_PASSCODE` environment variables for privileged access

Question and word-cloud state is coordinated through the default `PanelRoom` Durable Object. The room defaults to QA mode, and missing or invalid mode values fall back to QA. All regular-attendee actions post to `/`, with the active room mode and submitted form fields deciding whether the action asks, submits, or votes. The `/present` view mirrors the active attendee mode as a read-only presentation surface. Attendee-submitted questions and words remain pending until a moderator approves them, and submitters can see their own pending submissions as under consideration. Submitters cannot vote for questions or words they submitted. State-changing POST requests persist the updated room state, then broadcast a server-sent `panel-state` event to already-open views. The client module responds by refreshing the same server-rendered HTML fragments used by the polling fallback. Approved questions become visible on already-open attendee, present, and MC pages through these live fragments. Moderator queues use the same module to show pending submissions, vote counts, word-cloud changes, and moderation state from other requests. Duplicate submitted words increment the existing pending or approved entry, and approved words become visible on already-open attendee root, present, and word-screen pages through the same module. Question screens use a live fragment instead of HTML meta refresh. Moderators can approve, hide, merge, and end word clouds. Ending a word cloud stops attendee and screen visibility but keeps the word data visible to the moderator until reset. A moderator reset clears the room state explicitly.

The MC and moderator cookies use different names while retaining signed role payloads. This lets one browser keep `/mc` and `/moderate` tabs authenticated at the same time without allowing one role cookie to satisfy the other role boundary.

Anonymous attendee cookies are an abuse-resistance convenience, not authentication. They prevent accidental repeat voting in one browser session and support submitter-only pending views, but attendees can reset identity by clearing cookies, using private browsing, switching browsers, or using another device. IP throttling remains a best-effort flood control and must not be treated as durable person identity because conference networks commonly put many attendees behind one address.

## Trigger

The project is no longer only a starter Worker. It now hosts a real conference workflow with role-specific behavior, anonymous user input, moderation, and an audience display surface.

## Consequences

**Positive:**

- The app stays small, dependency-free, and deploys with native Cloudflare primitives.
- One Durable Object room gives attendees, MC, moderator, and screens a shared state authority across Worker isolates.
- The core form workflow remains server-rendered, while attendee and word-screen surfaces get automatic updates through a small typed client asset.
- Attendees can ask questions and submit word-cloud words anonymously without a sign-up funnel.
- Moderator approval prevents attendee questions and word-cloud entries from appearing directly in public surfaces.
- MC and moderator roles have a concrete access boundary.

**Negative:**

- The first implementation uses one hard-coded default room instead of a multi-room event model.
- Anonymous attendee identity is resettable by users and is not a strong one-person-one-vote guarantee.
- IP throttling is room-local and best-effort; it is not a full abuse-control system.
- Server-sent events keep one open connection per browser tab that has live regions.
- If the event stream is unavailable, updates fall back to the polling interval rather than being purely push-based.

**Neutral:**

- The client still refreshes server-rendered fragments instead of receiving serialized state over the event stream.

## Alternatives Considered

### Keep using Slido or another hosted service

This was rejected for the current conference because budget is a primary constraint and the needed workflow is narrow.

### Keep Worker-local in-memory state

This was rejected because deployed multiplayer behavior can split across Worker isolates. Worker-local state is still useful as a test fallback, but the deployed app needs a single room authority.

### Use KV or D1 directly

This was rejected because the panel needs coordination semantics around votes, moderation, active question selection, and rate-limit buckets. A Durable Object is a closer match for a single live room.

### Keep polling only

This was accepted for the first implementation because it was simpler, but it made updates feel delayed by the polling interval and left the question screen on a slower HTML refresh. The Durable Object room remains the source of truth, and SSE is now layered on top as the primary invalidation mechanism.

### Build a client-side single-page app

This was rejected because the interaction model is simple enough for server-rendered forms, and the repo already enforces a typed boundary for browser code instead of inline scripts.

### Sign attendee cookies

This was deferred because signing would prevent forged attendee IDs but would not stop cookie deletion from creating a new identity. It is useful hardening if attendee IDs become externally visible or trusted by additional surfaces, but it does not provide one-person-one-vote semantics by itself.

### Bind attendee identity to IP or user-agent

This was rejected for the current event because shared venue networks, NAT, VPNs, and mobile network changes can block legitimate attendees or split one attendee across identities. IP is kept as throttling input only.

### Issue join tokens or require authentication

This was rejected for the current lightweight flow because QR, seat, check-in, magic-link, or account-based identity adds operational setup and changes the anonymous attendee experience. It remains the right direction if a future event needs stronger one-person-one-vote guarantees.
