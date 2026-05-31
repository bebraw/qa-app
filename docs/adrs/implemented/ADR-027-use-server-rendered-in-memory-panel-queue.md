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
- a typed external polling module for attendee, operator, and word-screen fragments
- anonymous attendee cookies for one-vote-per-question and one-vote-per-word behavior
- IP-based throttling for question, word, and vote submissions
- signed MC and moderator role cookies
- `AUTH_SECRET`, `MC_PASSCODE`, and `MODERATOR_PASSCODE` environment variables for privileged access

Question and word-cloud state is coordinated through the default `PanelRoom` Durable Object. The room defaults to QA mode, and missing or invalid mode values fall back to QA. Attendee-submitted questions remain pending until a moderator approves them; approved questions become visible on already-open attendee and MC pages through lightweight polling fragments. Moderator queues use the same polling module to show pending submissions, vote counts, word-cloud changes, and moderation state from other requests. Duplicate submitted words increment the existing pending or approved entry, and approved words become visible on already-open attendee word and word-screen pages through the same polling module. Moderators can approve, hide, merge, and end word clouds. Ending a word cloud stops attendee and screen visibility but keeps the word data visible to the moderator until reset. A moderator reset clears the room state explicitly.

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
- IP throttling is room-local and best-effort; it is not a full abuse-control system.
- Realtime behavior is polling-based, not push-based, and only reflects the Worker state reached by the polling request.
- The question screen still refreshes by HTML refresh rather than live push updates.

**Neutral:**

- SSE can replace polling later without changing the Durable Object room as the source of truth.

## Alternatives Considered

### Keep using Slido or another hosted service

This was rejected for the current conference because budget is a primary constraint and the needed workflow is narrow.

### Keep Worker-local in-memory state

This was rejected because deployed multiplayer behavior can split across Worker isolates. Worker-local state is still useful as a test fallback, but the deployed app needs a single room authority.

### Use KV or D1 directly

This was rejected because the panel needs coordination semantics around votes, moderation, active question selection, and rate-limit buckets. A Durable Object is a closer match for a single live room.

### Use SSE immediately

This was deferred because SSE improves delivery latency but does not by itself solve shared state across isolates. The Durable Object room is the required source of truth; SSE can be layered on later.

### Build a client-side single-page app

This was rejected because the interaction model is simple enough for server-rendered forms, and the repo already enforces a typed boundary for browser code instead of inline scripts.
