# Feature: Panel Questions

## Blueprint

### Context

Future Frontend sessions need a low-budget replacement for hosted audience-question tools. Attendees should be able to ask questions, submit word-cloud words, and vote without sign-in, while the MC and moderator need protected views for approving, selecting, hiding, merging, ending, and resetting content during a conference panel.

The implementation should stay lightweight enough to run inside the existing Worker template without adding a client framework or third-party service.

### Architecture

- **Entry points:** `src/worker.ts` routes panel requests and forwards panel state routes to the `PanelRoom` Durable Object when the `PANEL_ROOM` binding is available.
- **State model:** `src/panel/state.ts` stores questions, word-cloud entries, votes, active selection, hidden status, done status, ended word-cloud status, and rate-limit buckets for the active room.
- **Auth model:** `src/panel/auth.ts` signs separate MC and moderator role cookies with `AUTH_SECRET`; MC and moderator passcodes come from `MC_PASSCODE` and `MODERATOR_PASSCODE`.
- **Views:** `src/views/panel.ts` renders server-side HTML for attendee, MC, moderator, and audience-screen views.
- **Visual system:** Panel views use black-and-white UI tokens, the bundled Finlandica Headline font, and compact labels instead of explanatory helper text.
- **Client behavior:** Regular attendee interaction stays rooted at `/`: asking questions, submitting words, and voting all post back to `/` and redirect back to `/`. MC and moderator forms post to their role-specific routes. Attendee, MC, moderator, and word-screen views also load the typed `/panel-live.js` module, which polls HTML fragments and replaces the relevant list so newly submitted, approved, or voted content appears without a manual refresh.
- **Mode model:** The shared room defaults to QA mode. Moderator mode actions must use authenticated POST requests to `/moderator/mode` with `qa` or `wordcloud`; missing or invalid mode values fall back to QA.
- **Persistence:** Panel state is coordinated through a SQLite-backed Cloudflare Durable Object room so attendees, MC, moderator, and screen views share one authoritative state across Worker isolates. Ended word-cloud data remains visible to the moderator until reset for lightweight analytics review.
- **Rate limiting:** Question and word creation are throttled by Cloudflare client IP when `cf-connecting-ip` is present and by a shared local fallback otherwise. Vote submissions are also throttled by that client IP key, and each anonymous attendee cookie can vote once per question or approved word. Failed MC and moderator login attempts are throttled by role and client IP.

### Anti-Patterns

- Do not require attendee authentication for asking or voting.
- Do not add separate regular-attendee action routes for new panel functionality; route those interactions through `/`.
- Do not put MC or moderator passcodes in source files.
- Do not add inline browser JavaScript to make the queue feel live.
- Do not bypass the `PanelRoom` Durable Object for panel state in deployed multiplayer flows.
- Do not expose hidden or done questions to attendees or the audience screen.
- Do not expose pending or hidden word-cloud entries to attendees or the audience screen.

## Contract

### Definition of Done

- [ ] `GET /` renders the attendee question view.
- [ ] `/` follows the moderator-selected room mode, showing QA in QA mode and word submissions in wordcloud mode.
- [ ] Regular attendee submissions and votes post to `/` for every attendee-facing mode.
- [ ] Attendees can add anonymous questions that remain pending until moderator approval.
- [ ] Attendees can see their own pending questions as under consideration while those questions wait for moderator approval.
- [ ] Attendees can submit anonymous word-cloud words.
- [ ] Attendees can see their own pending word-cloud words as under consideration while those words wait for moderator approval.
- [ ] Attendees can vote once per question and can vote on multiple questions.
- [ ] Attendees can vote once per approved word-cloud word and can vote on multiple words.
- [ ] Approved word-cloud entries render as a centered word cloud where higher-count words are visually larger.
- [ ] Question creation is IP-throttled to reduce flooding.
- [ ] Duplicate submitted words auto-increment the matching pending or approved word instead of creating another moderation item.
- [ ] `GET /mc` requires the MC passcode and lets the MC select the active question or mark it done.
- [ ] `GET /moderator` requires the moderator passcode and lets the moderator approve, add, vote on, hide, merge, end, and reset content.
- [ ] Moderator mode defaults to QA and can switch between QA and word-cloud mode without 404s.
- [ ] `/moderator` shows question moderation only in QA mode and word-cloud moderation only in wordcloud mode.
- [ ] MC and moderator queues show new submissions and vote counts without a manual browser refresh.
- [ ] The MC queue keeps polling while focus is inside its action area so newly approved questions still appear for the MC.
- [ ] `GET /screen` shows only the currently active question selected by the MC.
- [ ] `GET /words/screen` shows only approved word-cloud entries while the word cloud is open.
- [ ] Approved word-cloud entries appear on already-open attendee root and word-screen pages without a manual browser refresh.
- [ ] Deployed panel state is coordinated through the `PANEL_ROOM` Durable Object binding.
- [ ] The feature is covered by unit tests and browser-visible smoke tests.

### Regression Guardrails

- Anonymous attendee identity must be cookie-based and must not require a login flow.
- Regular attendee forms must use `/` as their action route; role, screen, asset, API, and live-fragment routes may remain separate.
- MC and moderator role cookies must be signed with `AUTH_SECRET` and use separate cookie names so both roles can stay signed in in different tabs of the same browser.
- Role views must remain inaccessible when passcodes or `AUTH_SECRET` are not configured.
- Repeated failed MC and moderator passcode attempts must be throttled by role and client IP.
- Client IP rate limits must not trust user-supplied forwarding headers such as `x-forwarded-for`.
- Missing or invalid moderator mode values must resolve to QA mode.
- GET requests must not change moderator-selected mode or any other panel state.
- Word-cloud controls must not be visible in `/moderator` while the room is in QA mode.
- Question moderation controls must not be visible in `/moderator` while the room is in wordcloud mode.
- Hidden and done questions must not appear in the attendee queue.
- Pending questions must not appear in other attendee queues, the MC queue, or the question screen.
- Pending questions may appear only to the submitting attendee and must not be votable before approval.
- Attendees must not be able to vote for questions or word-cloud words they submitted.
- Approved questions must appear on already-open attendee question pages without a manual browser refresh.
- MC and moderator queues must update when other attendees submit, vote, or when another operator changes moderation state.
- Focus on an MC queue action must not prevent the MC queue from receiving live updates.
- Pending and hidden word-cloud entries must not appear in the attendee root word-cloud view or word screen.
- Approved word-cloud entries must appear on already-open attendee root and word-screen pages without a manual browser refresh.
- Word-cloud layout must weight approved words by total count instead of rendering every word at the same visual size.
- Panel state routes must use the `PANEL_ROOM` Durable Object binding when it is configured.
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
- Then: the question appears in the moderator queue as under consideration, appears as under consideration for the submitting attendee, and receives the submitter's initial vote

**Scenario: Moderator approves an attendee question**

- Given: an attendee question is pending
- When: the moderator approves it
- Then: the question appears in attendee queues, including already-open attendee pages after the live poll updates

**Scenario: Attendee voting is limited**

- Given: a question is visible
- When: the same attendee votes more than once
- Then: only the first vote is counted

**Scenario: Attendee submits a duplicate word**

- Given: a word-cloud entry already exists as pending or approved
- When: another attendee submits the same normalized word
- Then: the existing entry count increments without creating a separate approval item

**Scenario: Attendee sees a pending word**

- Given: word-cloud mode is active
- When: an attendee submits a valid word
- Then: the word appears as under consideration only to submitting attendees until moderator approval

**Scenario: Moderator approves a word-cloud entry**

- Given: a word-cloud entry is pending
- When: the moderator approves it
- Then: the word appears in the attendee root word-cloud view and on the word screen, including already-open pages after the live poll updates

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
