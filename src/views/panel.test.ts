import { describe, expect, it } from "vitest";
import type { PublicQuestion, PublicWord } from "../panel/state";
import { renderAudiencePage, renderMcPage, renderModeratorPage, renderScreenPage, renderWordPage, renderWordScreenPage } from "./panel";

const availableQuestion: PublicQuestion = {
  id: "question-1",
  text: "How do we keep frontend systems understandable?",
  proposedBy: "attendee",
  createdAt: 1,
  votes: 3,
  status: "available",
  votedByCurrentUser: false,
};

const activeQuestion: PublicQuestion = {
  ...availableQuestion,
  id: "question-2",
  status: "active",
  votedByCurrentUser: true,
};

const hiddenQuestion: PublicQuestion = {
  ...availableQuestion,
  id: "question-3",
  status: "hidden",
  text: "Hidden question",
};

const pendingQuestion: PublicQuestion = {
  ...availableQuestion,
  id: "question-4",
  status: "pending",
  text: "Pending question",
};

const approvedWord: PublicWord = {
  id: "word-1",
  text: "Readable",
  count: 4,
  status: "approved",
  votedByCurrentUser: false,
};

const pendingWord: PublicWord = {
  ...approvedWord,
  id: "word-2",
  text: "Durable",
  count: 2,
  status: "pending",
};

describe("panel views", () => {
  it("renders attendee questions, notices, and voted state", () => {
    const html = renderAudiencePage({ mode: "qa", questions: [activeQuestion], words: [], notice: "Question added." });

    expect(html).not.toContain("Stryker was here!");
    expect(html).toContain("<title>Future Frontend Panels</title>");
    expect(html).toContain('<script src="/panel-live.js" type="module"></script>');
    expect(html).toContain('data-live-src="/live"');
    expect(html).toContain("bg-app-canvas text-app-text");
    expect(html).toContain("Question added.");
    expect(html).toContain("How do we keep frontend systems understandable?");
    expect(html).toContain("Live");
    expect(html).toContain("Voted");
    expect(html).toContain('action="/"');
    expect(renderAudiencePage({ mode: "qa", questions: [availableQuestion], words: [] })).toContain('action="/vote"');
    expect(renderAudiencePage({ mode: "qa", questions: [availableQuestion], words: [] })).not.toContain('action="/moderator/vote"');
    expect(renderAudiencePage({ mode: "wordcloud", questions: [], words: [approvedWord] })).toContain("Readable");
    expect(renderAudiencePage({ mode: "wordcloud", questions: [], words: [approvedWord] })).toContain("font-size:");
    expect(renderAudiencePage({ mode: "wordcloud", questions: [], words: [approvedWord] })).toContain('name="word"');
  });

  it("renders protected role login setup states", () => {
    expect(renderMcPage({ mode: "qa", questions: [], words: [], wordCloudEnded: false, auth: { configured: false } })).toContain(
      "Set AUTH_SECRET and MC_PASSCODE",
    );
    expect(renderModeratorPage({ mode: "qa", questions: [], words: [], wordCloudEnded: false, auth: { configured: false } })).toContain(
      "Set AUTH_SECRET and MODERATOR_PASSCODE",
    );
    expect(renderMcPage({ mode: "qa", questions: [], words: [], wordCloudEnded: false, auth: { configured: true } })).not.toContain(
      "Set AUTH_SECRET",
    );
    expect(renderModeratorPage({ mode: "qa", questions: [], words: [], wordCloudEnded: false, auth: { configured: true } })).toContain(
      'action="/moderator/login"',
    );
    expect(
      renderModeratorPage({ mode: "qa", questions: [], words: [], wordCloudEnded: false, auth: { configured: true, role: "moderator" } }),
    ).toContain("No questions to moderate.");
  });

  it("renders MC and moderator queues with role-specific actions", () => {
    const mcHtml = renderMcPage({
      mode: "qa",
      questions: [availableQuestion, activeQuestion],
      words: [],
      wordCloudEnded: false,
      auth: { configured: true, role: "mc" },
    });
    const moderatorHtml = renderModeratorPage({
      mode: "qa",
      questions: [availableQuestion, hiddenQuestion],
      words: [],
      wordCloudEnded: false,
      auth: { configured: true, role: "moderator" },
    });
    const wordModeratorHtml = renderModeratorPage({
      mode: "wordcloud",
      questions: [availableQuestion],
      words: [approvedWord, pendingWord],
      wordCloudEnded: true,
      auth: { configured: true, role: "moderator" },
    });

    expect(mcHtml).toContain('action="/mc/select"');
    expect(mcHtml).toContain('action="/mc/done"');
    expect(mcHtml).toContain('<script src="/panel-live.js" type="module"></script>');
    expect(mcHtml).toContain('data-live-src="/mc/live"');
    expect(mcHtml).toContain('data-live-refresh-when-focused="true"');
    expect(mcHtml).toContain(">Ask</button>");
    expect(mcHtml).toContain(">Mark as done</button>");
    expect(mcHtml).toContain('type="submit" disabled>Mark as done</button>');
    expect(mcHtml).toContain('type="submit" >Mark as done</button>');
    expect(mcHtml).toContain("bg-app-text text-white hover:bg-app-accent-strong");
    expect(moderatorHtml).toContain('<script src="/panel-live.js" type="module"></script>');
    expect(moderatorHtml).toContain('data-live-src="/moderator/live"');
    expect(moderatorHtml).toContain('action="/moderator/mode"');
    expect(moderatorHtml).toContain('name="mode" value="qa"');
    expect(moderatorHtml).toContain('name="mode" value="wordcloud"');
    expect(moderatorHtml).toContain('action="/moderator/vote"');
    expect(moderatorHtml).toContain('action="/moderator"');
    expect(moderatorHtml).toContain("Add moderator question");
    expect(moderatorHtml).toContain('action="/moderator/hide"');
    expect(moderatorHtml).toContain(">Hide</button>");
    expect(moderatorHtml).toContain("border-app-line bg-white text-app-text-soft hover:text-app-text");
    expect(moderatorHtml).toContain("Hidden");
    expect(moderatorHtml).toContain(">Reset</button>");
    expect(moderatorHtml).not.toContain('action="/moderator/words/approve"');
    expect(wordModeratorHtml).toContain('action="/moderator/words/approve"');
    expect(wordModeratorHtml).toContain('action="/moderator/words/merge"');
    expect(wordModeratorHtml).toContain("Ended");
    expect(wordModeratorHtml).not.toContain("Add moderator question");
    expect(moderatorHtml).not.toContain("Stryker was here!");
  });

  it("renders pending question approval controls for moderator", () => {
    const moderatorHtml = renderModeratorPage({
      mode: "qa",
      questions: [pendingQuestion],
      words: [],
      wordCloudEnded: false,
      auth: { configured: true, role: "moderator" },
    });

    expect(moderatorHtml).toContain("Pending question");
    expect(moderatorHtml).toContain("Under consideration");
    expect(moderatorHtml).toContain('action="/moderator/approve"');
    expect(moderatorHtml).not.toContain('action="/moderator/vote"');
    expect(renderAudiencePage({ mode: "qa", questions: [pendingQuestion], words: [] })).toContain("Under consideration");
    expect(renderAudiencePage({ mode: "qa", questions: [pendingQuestion], words: [] })).not.toContain('action="/vote"');
  });

  it("renders word cloud attendee and screen views", () => {
    const wordHtml = renderWordPage({ words: [approvedWord], notice: "Word counted." });

    expect(wordHtml).toContain("<title>Words - Future Frontend Panels</title>");
    expect(wordHtml).toContain('<script src="/panel-live.js" type="module"></script>');
    expect(wordHtml).toContain('data-live-src="/words/live"');
    expect(wordHtml).toContain("Word counted.");
    expect(wordHtml).toContain('action="/words"');
    expect(wordHtml).toContain('action="/words/vote"');
    expect(wordHtml).toContain("Readable");
    expect(wordHtml).toContain('aria-label="Vote for Readable, 4 votes"');
    expect(wordHtml).toContain("transform:rotate");
    expect(renderWordScreenPage([approvedWord])).toContain("Readable");
    expect(renderWordScreenPage([approvedWord])).toContain("min-h-[72vh]");
    expect(renderWordScreenPage([approvedWord])).toContain('data-live-src="/words/screen/live"');
    expect(renderWordScreenPage([approvedWord])).not.toContain('http-equiv="refresh"');
    expect(renderWordScreenPage([])).toContain("Waiting.");
  });

  it("renders the screen waiting state and active question state", () => {
    expect(renderScreenPage(undefined)).toContain("Waiting.");
    expect(renderScreenPage(activeQuestion)).toContain("How do we keep frontend systems understandable?");
    expect(renderScreenPage(activeQuestion)).toContain('http-equiv="refresh"');
  });
});
