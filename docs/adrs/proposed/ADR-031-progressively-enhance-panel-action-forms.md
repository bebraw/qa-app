# ADR-031: Progressively Enhance Panel Action Forms

**Status:** Proposed

**Date:** 2026-06-08

## Context

The panel app is server-rendered and currently keeps state-changing actions as normal HTML forms with POST/redirect fallbacks. Live fragments already let attendee, present, MC, moderator, question-screen, and word-screen views update after room state changes. Voting has also been enhanced so a vote can submit through `fetch` and refresh the visible fragments without a full page navigation.

The same friction remains on other frequent panel actions. Moderator approval, hiding, word approval, MC question selection, and marking a question done all redirect after POST even though the user usually wants to remain on the same operational surface. These actions are good candidates for the same live-fragment refresh model, but login, logout, reset, and other high-context transitions should remain ordinary navigations.

The app should preserve the lightweight template shape: no client framework, no serialized client-side state store, no inline browser scripts, and no dependency added only to make forms feel live.

## Decision

We will generalize live action handling from vote-only forms to selected server-rendered action forms.

The client module will support a reusable marker such as `data-live-action-form`. Forms with that marker will:

- remain normal POST forms for no-JS and failed-fetch fallbacks
- submit with `fetch` when JavaScript is available
- refresh existing `[data-live-region][data-live-src]` fragments after a successful response
- force-refresh the local focused region when the action affects the currently focused queue
- fall back to `form.submit()` when the request fails or returns an unexpected status

Only low-risk operational actions should use the marker by default:

- attendee question and word votes
- moderator question approve and hide
- moderator word approve, hide, merge, vote, and end
- MC select question and mark active question done
- moderator question edit after save

Actions that should remain normal navigations unless a later decision changes them:

- MC and moderator login
- logout
- panel reset
- moderator mode switching
- attendee question and word submissions that need redirect notices, until notice rendering has an explicit reusable contract

Any action that needs user-facing feedback without navigation must either render that feedback in a live fragment or use a small shared notice helper in the client module. Notice handling should be added deliberately instead of each form inventing local behavior.

## Trigger

Voting was enhanced to avoid a full page refresh. That exposed the broader question of which other panel actions should feel live and which should remain ordinary form navigations.

## Consequences

**Positive:**

- Frequent operator actions can feel immediate without replacing the server-rendered architecture.
- No-JS and failed-fetch fallbacks remain intact because every enhanced action is still a real form.
- The same live-fragment endpoints remain the only browser update mechanism.
- MC and moderator workflows can stay focused on the queue instead of bouncing through full page reloads.

**Negative:**

- The client module gets more responsibility and needs focused tests for fallback behavior.
- Some action results that currently rely on redirect notices need a separate notice contract before they can be safely enhanced.
- A successful `fetch` followed by fragment refresh can hide browser-level navigation feedback, so failed states must be handled carefully.

**Neutral:**

- This does not change the Durable Object room model or the server-side source of truth.
- Forms still use their existing POST routes and authorization checks.
- Live action enhancement is opt-in per form, not automatic for every POST.

## Alternatives Considered

### Keep vote-only enhancement

This preserves the smallest client surface, but leaves repeated MC and moderator actions with unnecessary full page reloads even though the app already has live fragments.

### Enhance every POST form automatically

This was rejected because login, logout, reset, mode switching, and notice-heavy submissions have different UX and safety requirements. Treating every POST as a live action would blur important transitions and make destructive actions feel too casual.

### Build a client-side state model

This was rejected because the current architecture intentionally uses server-rendered fragments and Durable Object state. A client state model would add more moving parts than the panel workflow needs.

### Add endpoint-specific JSON APIs

This was rejected for now because existing form routes already encode the workflow and authorization checks. Refreshing server-rendered fragments keeps the browser contract simple and avoids duplicating view logic in JSON handlers.
