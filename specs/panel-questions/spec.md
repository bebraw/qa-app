# Feature: Panel Questions

## Blueprint

### Context

Future Frontend sessions need a low-budget replacement for hosted audience-question tools. Attendees should be able to ask questions, respond to a moderator-defined word-cloud prompt, submit word-cloud words, and vote without sign-in, while the MC and moderator need protected views for approving, selecting, hiding, merging, ending, and resetting content during a conference panel.

The implementation should stay lightweight enough to run inside the existing Worker template without adding a client framework or third-party service.

### Architecture

- **Entry points:** `src/worker.ts` routes panel requests and forwards panel state routes to the `PanelRoom` Durable Object when the `PANEL_ROOM` binding is available.
- **State model:** `src/panel/state.ts` stores questions, word-cloud entries, word-cloud prompt text, votes, active selection, hidden status, done status, ended word-cloud status, and rate-limit buckets for the active room.
- **Auth model:** `src/panel/auth.ts` signs separate MC and moderator role cookies with `AUTH_SECRET`; MC and moderator passcodes come from `MC_PASSCODE` and `MODERATOR_PASSCODE`.
- **Views:** `src/views/panel.ts` renders server-side HTML for attendee, present, MC, moderator, and audience-screen views.
- **Visual system:** Panel views use black-and-white UI tokens, the bundled Finlandica Headline font, and compact labels instead of explanatory helper text.
- **Client behavior:** Regular attendee interaction stays rooted at `/`: asking questions, submitting words, and voting all post back to `/` and redirect back to `/`. The `/present` view mirrors the active attendee mode without write controls. MC and moderator forms post to their role-specific routes. Attendee, present, MC, moderator, question-screen, and word-screen views also load the typed `/panel-live.js` module, which subscribes to Durable Object server-sent events from `/events` and refreshes HTML fragments immediately after room state changes. The module keeps interval polling as a fallback so already-open pages still update if the event stream is unavailable.
- **Mode model:** The shared room defaults to QA mode. Moderator mode actions must use authenticated POST requests to `/moderate/mode` with `qa` or `wordcloud`; missing or invalid mode values fall back to QA.
- **Persistence:** Panel state is coordinated through a SQLite-backed Cloudflare Durable Object room so attendees, MC, moderator, and screen views share one authoritative state across Worker isolates. Ended word-cloud data remains visible to the moderator until reset for lightweight analytics review.
- **Rate limiting:** Question and word creation are throttled by Cloudflare client IP when `cf-connecting-ip` is present and by a shared local fallback otherwise. Vote submissions are also throttled by that client IP key, and each anonymous attendee cookie can vote once per question or approved word. Failed MC and moderator login attempts are throttled by role and client IP.

### Anonymous Identity Limits

Anonymous attendee identity is a lightweight abuse-resistance mechanism, not authentication. The `panel_attendee` cookie lets the app prevent accidental repeat votes and hide submitter-only pending entries from other browser sessions, but attendees can reset that identity by clearing cookies, switching browsers, using private browsing, or using another device.

IP throttling is only a backstop for flooding. It must not be treated as a durable person identity because conference Wi-Fi, NAT, VPNs, and mobile network changes can make many attendees share one IP or make one attendee appear from several IPs.

Options for stronger controls:

- **Signed attendee cookies:** Prevents forged attendee IDs, but deleting the cookie still creates a new identity.
- **IP or IP plus user-agent binding:** Raises the cost of casual resets, but can block legitimate attendees on shared networks and adds privacy-sensitive coupling.
- **Per-IP per-question or per-word vote caps:** Limits large-scale abuse from one network address, but risks suppressing votes from a venue NAT.
- **Short-lived join tokens:** QR, seat, or check-in tokens make reset abuse harder while keeping the UI mostly anonymous, but add operational setup.
- **Real authentication:** Gives the strongest identity boundary, but changes the low-friction attendee workflow and is out of scope for the current lightweight panel app.

### Anti-Patterns

- Do not require attendee authentication for asking or voting.
- Do not add separate regular-attendee action routes for new panel functionality; route those interactions through `/`.
- Do not put MC or moderator passcodes in source files.
- Do not add inline browser JavaScript to make the queue feel live.
- Do not bypass the `PanelRoom` Durable Object for panel state in deployed multiplayer flows.
- Do not expose hidden or done questions to attendees or the audience screen.
- Do not expose pending word-cloud entries to non-submitting attendees or the audience screen, and do not expose hidden word-cloud entries to attendees or the audience screen.

## Contract

### Definition of Done

- [ ] `GET /` renders the attendee question view.
- [ ] `/` follows the moderator-selected room mode, showing QA in QA mode and word submissions in wordcloud mode.
- [ ] Regular attendee submissions and votes post to `/` for every attendee-facing mode.
- [ ] Attendees can add anonymous questions that remain pending until moderator approval.
- [ ] Attendees can submit the question textarea with Return without inserting a newline.
- [ ] Attendees can see their own pending questions as under consideration while those questions wait for moderator approval.
- [ ] Attendee validation notices remain visible after live fragment refreshes.
- [ ] Too-short question notices appear in-place without submitting the form or refreshing the page.
- [ ] Attendees can submit anonymous word-cloud words.
- [ ] Attendees can see their own pending word-cloud words as under consideration while those words wait for moderator approval.
- [ ] Attendees can vote once per question and can vote on multiple questions.
- [ ] Attendees can vote once per approved word-cloud word and can vote on multiple words.
- [ ] Approved word-cloud entries render as a centered word cloud where higher-count words are visually larger.
- [ ] Question creation is IP-throttled to reduce flooding.
- [ ] Duplicate submitted words auto-increment the matching pending or approved word instead of creating another moderation item.
- [ ] `GET /mc` requires the MC passcode and lets the MC select the active question or mark it done.
- [ ] `GET /moderate` requires the moderator passcode and lets the moderator approve, add, vote on, hide, merge, end, and reset content.
- [ ] `GET /present` shows the active attendee-mode questions or approved words without forms or vote controls.
- [ ] Moderator mode defaults to QA and can switch between QA and word-cloud mode without 404s.
- [ ] `/moderate` shows question moderation only in QA mode and word-cloud moderation only in wordcloud mode.
- [ ] Moderators can define a word-cloud audience question while in wordcloud mode.
- [ ] The word-cloud audience question appears on attendee, present, and word-screen word-cloud views.
- [ ] MC and moderator queues show new submissions and vote counts without a manual browser refresh.
- [ ] The MC queue keeps polling while focus is inside its action area so newly approved questions still appear for the MC.
- [ ] `GET /screen` shows only the currently active question selected by the MC.
- [ ] Already-open question screens update without a manual browser refresh when the MC selects or clears the active question.
- [ ] `GET /words/screen` shows only approved word-cloud entries while the word cloud is open.
- [ ] Approved word-cloud entries appear on already-open attendee root and word-screen pages without a manual browser refresh.
- [ ] Deployed panel state is coordinated through the `PANEL_ROOM` Durable Object binding.
- [ ] The feature is covered by unit tests and browser-visible smoke tests.

### Regression Guardrails

- Anonymous attendee identity must be cookie-based and must not require a login flow.
- Anonymous attendee identity must be documented as abuse-resistant rather than abuse-proof.
- Regular attendee forms must use `/` as their action route; role, screen, asset, API, and live-fragment routes may remain separate.
- Plain Return in a question textarea must submit the form, while modified Return key combinations must not force submission.
- Question forms must block too-short submissions client-side with the same minimum length as the server guard, while preserving server-side validation as the authoritative fallback.
- MC and moderator role cookies must be signed with `AUTH_SECRET` and use separate cookie names so both roles can stay signed in in different tabs of the same browser.
- Role views must remain inaccessible when passcodes or `AUTH_SECRET` are not configured.
- Repeated failed MC and moderator passcode attempts must be throttled by role and client IP.
- Client IP rate limits must not trust user-supplied forwarding headers such as `x-forwarded-for`.
- Missing or invalid moderator mode values must resolve to QA mode.
- GET requests must not change moderator-selected mode or any other panel state.
- Word-cloud controls must not be visible in `/moderate` while the room is in QA mode.
- Question moderation controls must not be visible in `/moderate` while the room is in wordcloud mode.
- Word-cloud prompt changes must require moderator authentication and must be cleared by panel reset.
- Hidden and done questions must not appear in the attendee queue.
- Pending questions must not appear in other attendee queues, the MC queue, or the question screen.
- Pending questions may appear only to the submitting attendee and must not be votable before approval.
- Attendees must not be able to vote for questions or word-cloud words they submitted.
- Approved questions must appear on already-open attendee question pages without a manual browser refresh.
- Approved questions and words must appear on already-open present pages without a manual browser refresh.
- Attendee notices, including short-question validation messages, must not be removed by the immediate live-fragment refresh that follows page load.
- MC and moderator queues must update when other attendees submit, vote, or when another operator changes moderation state.
- The Durable Object room must emit server-sent events after state-changing POST requests, and clients must keep polling as a fallback.
- Focus on an MC queue action must not prevent the MC queue from receiving live updates.
- Pending word-cloud entries may appear only to submitting attendees and must not appear to other attendees or the word screen; hidden word-cloud entries must not appear in the attendee root word-cloud view or word screen.
- Approved word-cloud entries must appear on already-open attendee root and word-screen pages without a manual browser refresh.
- Word-cloud layout must weight approved words by total count instead of rendering every word at the same visual size.
- Panel state routes must use the `PANEL_ROOM` Durable Object binding when it is configured.
- Moderator word merges must support exact normalized matches and manually chosen variants such as different casing, punctuation, or alternate words.
- Ending word-cloud mode must stop attendee/screen visibility while keeping data visible to the moderator until reset.
- The screen view must not show anything except the active question or an empty waiting state.
- The panel UI must stay monochrome and use the local Finlandica font route instead of a remote font service.
- Resetting the panel must clear all questions.
- Resetting the panel must clear word-cloud entries, the word-cloud prompt, and ended word-cloud state.

### Verification

- **Automated tests:** `src/panel/*.test.ts`, `src/worker.test.ts`, and `src/worker.e2e.ts`.
- **Quality gate:** Run `npm run quality:gate` before treating implementation changes as ready.
- **Local CI:** Run `npm run ci:local` after the full quality gate for non-documentation changes.

### Scenarios

**Scenario: Attendee asks and votes**

- Given: the panel app is open
- When: an attendee enters a valid question and presses Return
- Then: the question appears in the moderator queue as under consideration, appears as under consideration for the submitting attendee, and does not receive a submitter vote

**Scenario: Moderator approves an attendee question**

- Given: an attendee question is pending
- When: the moderator approves it
- Then: the question appears in attendee queues, including already-open attendee pages after the live poll updates

**Scenario: Attendee submits a short question**

- Given: the panel app is open
- When: an attendee submits a question that is below the minimum length
- Then: the short-question notice appears in-place without a page refresh and remains visible even after the attendee page live fragment refreshes

**Scenario: Attendee voting is limited**

- Given: a question is visible
- When: the same attendee votes more than once
- Then: only the first vote is counted

**Scenario: Attendee submits a duplicate word**

- Given: a word-cloud entry already exists as pending or approved
- When: another attendee submits the same normalized word
- Then: the existing entry count increments without creating a separate approval item

**Scenario: Moderator sets a word-cloud prompt**

- Given: the moderator has switched the room to wordcloud mode
- When: the moderator defines the audience question
- Then: attendee, present, and word-screen word-cloud views show that question above the word submission or word cloud

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
