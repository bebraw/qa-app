# Feature: Panel Questions

## Blueprint

### Context

Future Frontend sessions need a low-budget replacement for hosted audience-question tools. Attendees should be able to ask questions, submit word-cloud words, and vote without sign-in, while the MC and moderator need protected views for selecting, hiding, merging, ending, and resetting content during a conference panel.

The first implementation should stay lightweight enough to run inside the existing Worker template without adding a database, client framework, or third-party service.

### Architecture

- **Entry points:** `src/worker.ts` routes panel requests.
- **State model:** `src/panel/state.ts` stores questions, word-cloud entries, votes, active selection, hidden status, done status, ended word-cloud status, and in-memory rate-limit buckets.
- **Auth model:** `src/panel/auth.ts` signs role cookies with `AUTH_SECRET`; MC and moderator passcodes come from `MC_PASSCODE` and `MODERATOR_PASSCODE`.
- **Views:** `src/views/panel.ts` renders server-side HTML for attendee, MC, moderator, and audience-screen views.
- **Visual system:** Panel views use black-and-white UI tokens, the bundled Finlandica Headline font, and compact labels instead of explanatory helper text.
- **Client behavior:** No browser JavaScript is required. Forms post to Worker routes and redirect back to the relevant view.
- **Persistence:** Panel state is intentionally in-memory for this version. It resets when the Worker isolate restarts and is not a multi-instance durable store. Ended word-cloud data remains visible to the moderator until reset for lightweight analytics review.
- **Rate limiting:** Question and word creation are throttled by client IP. Vote submissions are also throttled by IP, and each anonymous attendee cookie can vote once per question or approved word.

### Anti-Patterns

- Do not require attendee authentication for asking or voting.
- Do not put MC or moderator passcodes in source files.
- Do not add inline browser JavaScript to make the queue feel live.
- Do not treat in-memory state as durable conference history.
- Do not expose hidden or done questions to attendees or the audience screen.
- Do not expose pending or hidden word-cloud entries to attendees or the audience screen.

## Contract

### Definition of Done

- [ ] `GET /` renders the attendee question view.
- [ ] Attendees can add anonymous questions.
- [ ] Attendees can submit anonymous word-cloud words.
- [ ] Attendees can vote once per question and can vote on multiple questions.
- [ ] Attendees can vote once per approved word-cloud word and can vote on multiple words.
- [ ] Question creation is IP-throttled to reduce flooding.
- [ ] Duplicate submitted words auto-increment the matching pending or approved word instead of creating another moderation item.
- [ ] `GET /mc` requires the MC passcode and lets the MC select the active question or mark it done.
- [ ] `GET /moderator` requires the moderator passcode and lets the moderator add, vote on, hide, merge, end, and reset content.
- [ ] `GET /screen` shows only the currently active question selected by the MC.
- [ ] `GET /words/screen` shows only approved word-cloud entries while the word cloud is open.
- [ ] The feature is covered by unit tests and browser-visible smoke tests.

### Regression Guardrails

- Anonymous attendee identity must be cookie-based and must not require a login flow.
- MC and moderator role cookies must be signed with `AUTH_SECRET`.
- Role views must remain inaccessible when passcodes or `AUTH_SECRET` are not configured.
- Hidden and done questions must not appear in the attendee queue.
- Pending and hidden word-cloud entries must not appear in the attendee word view or word screen.
- Moderator word merges must support exact normalized matches and manually chosen variants such as different casing, punctuation, or alternate words.
- Ending word-cloud mode must stop attendee/screen visibility while keeping data visible to the moderator until reset.
- The screen view must not show anything except the active question or an empty waiting state.
- The panel UI must stay monochrome and use the local Finlandica font route instead of a remote font service.
- Resetting the panel must clear all questions.
- Resetting the panel must clear word-cloud entries and ended word-cloud state.

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

**Scenario: Attendee submits a duplicate word**

- Given: a word-cloud entry already exists as pending or approved
- When: another attendee submits the same normalized word
- Then: the existing entry count increments without creating a separate approval item

**Scenario: Moderator merges word variants**

- Given: the moderator sees variants such as `great`, `Great`, `great!`, or `awesome`
- When: the moderator merges a variant into a target word
- Then: the counts combine under one moderator-visible entry

**Scenario: Word cloud ends**

- Given: approved words are visible on the word screen
- When: the moderator ends word-cloud mode
- Then: the word screen returns to waiting and the moderator can still review the word data until reset

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
