# Feature: Panel Questions

## Blueprint

### Context

Future Frontend sessions need a low-budget replacement for hosted audience-question tools. Attendees should be able to ask and vote without sign-in, while the MC and moderator need protected views for selecting, hiding, and resetting questions during a conference panel.

The first implementation should stay lightweight enough to run inside the existing Worker template without adding a database, client framework, or third-party service.

### Architecture

- **Entry points:** `src/worker.ts` routes panel requests.
- **State model:** `src/panel/state.ts` stores questions, votes, active selection, hidden status, done status, and in-memory rate-limit buckets.
- **Auth model:** `src/panel/auth.ts` signs role cookies with `AUTH_SECRET`; MC and moderator passcodes come from `MC_PASSCODE` and `MODERATOR_PASSCODE`.
- **Views:** `src/views/panel.ts` renders server-side HTML for attendee, MC, moderator, and audience-screen views.
- **Client behavior:** No browser JavaScript is required. Forms post to Worker routes and redirect back to the relevant view.
- **Persistence:** Panel state is intentionally in-memory for this version. It resets when the Worker isolate restarts and is not a multi-instance durable store.
- **Rate limiting:** Question creation is throttled by client IP. Vote submissions are also throttled by IP, and each anonymous attendee cookie can vote once per question.

### Anti-Patterns

- Do not require attendee authentication for asking or voting.
- Do not put MC or moderator passcodes in source files.
- Do not add inline browser JavaScript to make the queue feel live.
- Do not treat in-memory state as durable conference history.
- Do not expose hidden or done questions to attendees or the audience screen.

## Contract

### Definition of Done

- [ ] `GET /` renders the attendee question view.
- [ ] Attendees can add anonymous questions.
- [ ] Attendees can vote once per question and can vote on multiple questions.
- [ ] Question creation is IP-throttled to reduce flooding.
- [ ] `GET /mc` requires the MC passcode and lets the MC select the active question or mark it done.
- [ ] `GET /moderator` requires the moderator passcode and lets the moderator add, vote on, hide, and reset questions.
- [ ] `GET /screen` shows only the currently active question selected by the MC.
- [ ] The feature is covered by unit tests and browser-visible smoke tests.

### Regression Guardrails

- Anonymous attendee identity must be cookie-based and must not require a login flow.
- MC and moderator role cookies must be signed with `AUTH_SECRET`.
- Role views must remain inaccessible when passcodes or `AUTH_SECRET` are not configured.
- Hidden and done questions must not appear in the attendee queue.
- The screen view must not show anything except the active question or an empty waiting state.
- Resetting the panel must clear all questions.

### Verification

- **Automated tests:** `src/panel/*.test.ts`, `src/worker.test.ts`, and `src/worker.e2e.ts`.
- **Quality gate:** Run `npm run quality:gate` before treating implementation changes as ready.
- **Local CI:** Run `npm run ci:local` after the full quality gate for non-documentation changes.

### Scenarios

**Scenario: Attendee asks and votes**

- Given: the panel app is open
- When: an attendee submits a valid question
- Then: the question appears in the attendee queue and receives the submitter's initial vote

**Scenario: Attendee voting is limited**

- Given: a question is visible
- When: the same attendee votes more than once
- Then: only the first vote is counted

**Scenario: MC selects a live question**

- Given: the MC has signed in and questions are available
- When: the MC chooses one question
- Then: `/screen` shows that question as the active panel prompt

**Scenario: MC marks a question done**

- Given: a question is active
- When: the MC marks it done
- Then: the question disappears from attendee and MC queues and the screen returns to the waiting state

**Scenario: Moderator hides a question**

- Given: the moderator has signed in and a question is inappropriate
- When: the moderator hides it
- Then: attendees and the screen cannot see that question

**Scenario: Moderator resets between panels**

- Given: a session has ended
- When: the moderator resets the panel
- Then: all questions are cleared for the next panel
