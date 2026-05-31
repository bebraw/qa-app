# ADR-027: Use Server-Rendered In-Memory Panel Queue

**Status:** Implemented

**Date:** 2026-05-31

## Context

Future Frontend needs a small audience-question app for conference panels. The main alternatives are continuing to use a hosted service, adding a durable backend such as KV or D1, or building the smallest useful Worker-native version first.

The near-term requirement is low budget and operational simplicity. Attendees should not need accounts, and the UI should work well on mobile phones. MC and moderator access still needs a trust boundary, but the system does not currently need long-term analytics or historical question storage.

## Decision

We will build the first version as a server-rendered Cloudflare Worker app with in-memory state.

The app uses:

- plain HTML forms and redirects instead of client-side JavaScript
- anonymous attendee cookies for one-vote-per-question behavior
- IP-based throttling for question and vote submissions
- signed MC and moderator role cookies
- `AUTH_SECRET`, `MC_PASSCODE`, and `MODERATOR_PASSCODE` environment variables for privileged access

Question state is intentionally ephemeral. A moderator reset clears the panel, and a Worker isolate restart can also clear state.

## Trigger

The project is no longer only a starter Worker. It now hosts a real conference workflow with role-specific behavior, anonymous user input, moderation, and an audience display surface.

## Consequences

**Positive:**

- The app stays small, dependency-free, and easy to deploy.
- The UI remains usable without a client build or browser JavaScript.
- Attendees can ask questions anonymously without a sign-up funnel.
- MC and moderator roles have a concrete access boundary.

**Negative:**

- Questions are not durable across Worker isolate restarts or multi-instance execution.
- In-memory IP throttling is best-effort and not a global abuse-control system.
- The screen view refreshes by HTML refresh rather than live push updates.

**Neutral:**

- A later durable version can preserve the same routes and views while replacing the state module with KV, D1, or Durable Objects.

## Alternatives Considered

### Keep using Slido or another hosted service

This was rejected for the current conference because budget is a primary constraint and the needed workflow is narrow.

### Add Durable Objects, KV, or D1 immediately

This was deferred because durability and cross-isolate consistency are useful but not required for a first local-budget version. Adding storage now would introduce configuration and operational surface before the core workflow is validated.

### Build a client-side single-page app

This was rejected because the interaction model is simple enough for server-rendered forms, and the repo already enforces a typed boundary for browser code instead of inline scripts.
