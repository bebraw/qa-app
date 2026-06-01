# ADR-030: Bound Attendee AI Assistance

**Status:** Proposed

**Date:** 2026-06-01

## Context

The panel app currently gives attendees a low-friction anonymous workflow: open the root page, ask a question or submit a word, vote, and leave. Moderator approval is the trust boundary for public visibility, and the implementation intentionally stays server-rendered and lightweight.

An agentic attendee interface could improve question quality and reduce duplicate submissions, but it also changes the attendee experience from a direct form into an AI-mediated workflow. That would introduce latency, provider cost, privacy review, prompt-injection and abuse surfaces, failure modes during a live event, and unclear responsibility for generated text.

The current architecture also treats attendee identity as anonymous and abuse-resistant rather than authenticated. Any AI feature that inspects or rewrites attendee text must preserve that expectation and must not require sign-in, persistent profiles, or a new client application shell.

## Decision

We will not replace the attendee question form with a general-purpose agentic interface.

If AI is added for attendees, it must be bounded assistance around the existing form workflow:

- The attendee remains the actor who chooses what to submit.
- The default attendee action still posts through `/`.
- AI output may suggest clearer wording, shorter wording, or related existing questions before submission.
- AI output must not auto-submit, auto-vote, approve, hide, merge, select, or otherwise mutate panel state.
- The interface must keep a plain non-AI submission path available.
- Moderator approval remains required before attendee-submitted questions or words appear in public surfaces.
- AI provider configuration, data handling, failure behavior, rate limits, and fallback behavior must be documented before implementation.

The preferred first AI surface is moderator-side assistance, such as clustering similar questions, suggesting merges, flagging unclear or risky items, and proposing queue ordering while leaving final decisions to the moderator. If attendee assistance is implemented first, it should start as a question-coach affordance rather than a chat-style agent.

## Trigger

We are considering whether an agentic interface would make sense for attendees. The question makes the AI boundary explicit before implementation so the project can preserve the live-event workflow and avoid accidentally turning a small panel tool into a broader AI chat product.

## Consequences

**Positive:**

- Preserves the anonymous, quick attendee workflow that fits a conference QR-code use case.
- Keeps existing moderation responsibility intact.
- Allows targeted AI value where it is most useful: clearer questions, duplicate reduction, and moderator load reduction.
- Avoids giving generated output direct authority over room state.
- Keeps the initial implementation compatible with server-rendered forms and progressive enhancement.

**Negative:**

- Attendees do not get a conversational assistant that can guide them through the whole event experience.
- Duplicate detection or wording help may still require provider calls, rate limits, and privacy review.
- The system may feel less novel than a fully agentic attendee interface.
- Moderator-side AI may help operators more than attendees directly.

**Neutral:**

- Any accepted AI feature will need a matching feature-spec update and tests before implementation.
- Any provider choice will need a separate implementation decision if it introduces lasting architectural constraints.
- A non-AI fallback remains part of the product contract.

## Alternatives Considered

### Full attendee agent

This would present attendees with a chat-like agent that can ask clarifying questions, generate submissions, decide whether to vote instead of ask, and potentially navigate the event workflow.

This was rejected for now because it adds cost, latency, product complexity, and moderation ambiguity to the highest-volume surface of the app. It also risks making a live event interaction slower than the current direct form.

### Attendee question coach

This would let attendees draft a question and optionally ask for clearer or shorter wording before they submit. The attendee would explicitly accept or edit the suggestion.

This remains acceptable as the first attendee-facing AI feature because it improves question quality without changing authority over submission or moderation.

### Duplicate and related-question suggestions

This would compare a draft question with existing approved or pending-visible questions and suggest voting for a related item instead of submitting a duplicate.

This remains acceptable if implemented with clear privacy handling and graceful fallback. It reduces moderator load, but it must not expose pending submissions across attendee identities.

### Moderator-side agent

This would assist the moderator by clustering similar questions, suggesting merges, flagging unclear or risky submissions, and proposing a queue order.

This is the preferred first AI surface because it improves operational flow while keeping privileged decisions behind the existing moderator boundary.

### No AI assistance

This would keep the current direct form and manual moderation workflow.

This remains valid if the event budget, privacy requirements, or reliability constraints make provider-backed assistance unattractive.
