import { describe, expect, it } from "vitest";
import type { PublicQuestion, PublicWord } from "../panel/state";
import { renderAudiencePage, renderMcPage, renderModeratorPage, renderPresentPage, renderScreenPage, renderWordScreenPage } from "./panel";

const availableQuestion: PublicQuestion = {
  id: "question-1",
  text: "How do we keep frontend systems understandable?",
  proposedBy: "attendee",
  createdAt: 1,
  votes: 3,
  status: "available",
  votedByCurrentUser: false,
  submittedByCurrentUser: false,
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
  submittedByCurrentUser: false,
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
    expect(html).toContain('data-question-form="true"');
    expect(html).toContain('data-minimum-question-length="8"');
    expect(html).toContain('data-submit-on-enter="true"');
    expect(html).toContain("Live");
    expect(html).toContain("Voted");
    expect(html).toContain('action="/"');
    expect(renderAudiencePage({ mode: "qa", questions: [availableQuestion], words: [] })).toContain('action="/"');
    expect(renderAudiencePage({ mode: "qa", questions: [availableQuestion], words: [] })).not.toContain('action="/vote"');
    expect(renderAudiencePage({ mode: "qa", questions: [availableQuestion], words: [] })).not.toContain('action="/moderate/vote"');
    expect(renderAudiencePage({ mode: "qa", questions: [availableQuestion], words: [] })).toContain('data-live-vote-form="true"');
    expect(
      renderAudiencePage({ mode: "wordcloud", questions: [], words: [approvedWord], wordPrompt: "What should we cover next?" }),
    ).toContain("What should we cover next?");
    expect(renderAudiencePage({ mode: "wordcloud", questions: [], words: [approvedWord] })).toContain("Readable");
    expect(renderAudiencePage({ mode: "wordcloud", questions: [], words: [approvedWord] })).toContain("font-size:");
    expect(renderAudiencePage({ mode: "wordcloud", questions: [], words: [approvedWord] })).toContain('name="word"');
    expect(renderAudiencePage({ mode: "wordcloud", questions: [], words: [approvedWord] })).toContain('data-live-vote-form="true"');
    expect(
      renderAudiencePage({ mode: "qa", questions: [{ ...availableQuestion, submittedByCurrentUser: true }], words: [] }),
    ).not.toContain(">+1</button>");
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
      'action="/moderate/login"',
    );
    expect(
      renderModeratorPage({ mode: "qa", questions: [], words: [], wordCloudEnded: false, auth: { configured: true, role: "moderator" } }),
    ).toContain("No questions to moderate.");
  });

  it("renders a read-only present view for the active attendee mode", () => {
    const questionHtml = renderPresentPage({ mode: "qa", questions: [availableQuestion], words: [] });
    const wordHtml = renderPresentPage({ mode: "wordcloud", questions: [], words: [approvedWord], wordPrompt: "What feels most urgent?" });

    expect(questionHtml).toContain("<title>Present - Future Frontend Panels</title>");
    expect(questionHtml).toContain('<script src="/panel-live.js" type="module"></script>');
    expect(questionHtml).toContain('data-live-src="/present/live"');
    expect(questionHtml).toContain('href="https://qa.futurefrontend.com">qa.futurefrontend.com</a>');
    expect(questionHtml).toContain("How do we keep frontend systems understandable?");
    expect(questionHtml).not.toContain("<form");
    expect(questionHtml).not.toContain(">+1</button>");
    expect(wordHtml).toContain('href="https://qa.futurefrontend.com">qa.futurefrontend.com</a>');
    expect(wordHtml).toContain("Readable");
    expect(wordHtml).toContain("What feels most urgent?");
    expect(wordHtml).toContain("font-size:");
    expect(wordHtml).not.toContain("<form");
    expect(wordHtml).not.toContain('name="wordId"');
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
      wordPrompt: "What word describes the platform?",
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
    expect(moderatorHtml).toContain('data-live-src="/moderate/live"');
    expect(moderatorHtml).toContain('action="/moderate/mode"');
    expect(moderatorHtml).toContain('name="mode" value="qa"');
    expect(moderatorHtml).toContain('name="mode" value="wordcloud"');
    expect(moderatorHtml).toContain('action="/moderate/vote"');
    expect(moderatorHtml).toContain('data-live-vote-form="true"');
    expect(moderatorHtml).toContain('action="/moderate"');
    expect(moderatorHtml).toContain("Add moderator question");
    expect(moderatorHtml).toContain('<summary class="inline-flex h-10 cursor-pointer');
    expect(moderatorHtml).toContain(">Edit</summary>");
    expect(moderatorHtml).toContain('action="/moderate/edit"');
    expect(moderatorHtml).toContain(">Save</button>");
    expect(moderatorHtml).toContain('action="/moderate/hide"');
    expect(moderatorHtml).toContain(">Hide</button>");
    expect(moderatorHtml).toContain("border-app-line bg-white text-app-text-soft hover:text-app-text");
    expect(moderatorHtml).toContain("Hidden");
    expect(moderatorHtml).toContain(">Reset</button>");
    expect(moderatorHtml).not.toContain('action="/moderate/words/approve"');
    expect(wordModeratorHtml).toContain('action="/moderate/words/approve"');
    expect(wordModeratorHtml).toContain('action="/moderate/words/merge"');
    expect(wordModeratorHtml).toContain('action="/moderate/words/prompt"');
    expect(wordModeratorHtml).toContain("What word describes the platform?");
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
    expect(moderatorHtml).toContain('action="/moderate/approve"');
    expect(moderatorHtml).not.toContain('action="/moderate/vote"');
    expect(renderAudiencePage({ mode: "qa", questions: [pendingQuestion], words: [] })).toContain("Under consideration");
    expect(renderAudiencePage({ mode: "qa", questions: [pendingQuestion], words: [] })).not.toContain('action="/vote"');
  });

  it("renders word cloud attendee and screen views", () => {
    const wordHtml = renderAudiencePage({ mode: "wordcloud", questions: [], words: [approvedWord], notice: "Word counted." });

    expect(wordHtml).toContain("<title>Future Frontend Panels</title>");
    expect(wordHtml).toContain('<script src="/panel-live.js" type="module"></script>');
    expect(wordHtml).toContain('data-live-src="/live"');
    expect(wordHtml).toContain("Word counted.");
    expect(wordHtml).toContain('action="/"');
    expect(wordHtml).not.toContain('action="/vote"');
    expect(wordHtml).toContain("Readable");
    expect(wordHtml).toContain('aria-label="Vote for Readable, 4 votes"');
    expect(wordHtml).toContain("transform:rotate");
    expect(
      renderAudiencePage({ mode: "wordcloud", questions: [], words: [{ ...approvedWord, submittedByCurrentUser: true }] }),
    ).not.toContain('name="wordId"');
    expect(renderAudiencePage({ mode: "wordcloud", questions: [], words: [pendingWord] })).toContain("Under consideration");
    expect(renderAudiencePage({ mode: "wordcloud", questions: [], words: [pendingWord] })).not.toContain('name="wordId"');
    expect(renderWordScreenPage([approvedWord], "What should we remember?")).toContain("Readable");
    expect(renderWordScreenPage([approvedWord], "What should we remember?")).toContain("What should we remember?");
    expect(renderWordScreenPage([approvedWord])).toContain("min-h-[72vh]");
    expect(renderWordScreenPage([approvedWord])).toContain('data-live-src="/words/screen/live"');
    expect(renderWordScreenPage([approvedWord])).not.toContain('http-equiv="refresh"');
    expect(renderWordScreenPage([])).toContain("Waiting.");
  });

  it("renders the screen waiting state and active question state", () => {
    expect(renderScreenPage(undefined)).toContain("Waiting.");
    expect(renderScreenPage(activeQuestion)).toContain("How do we keep frontend systems understandable?");
    expect(renderScreenPage(activeQuestion)).toContain('<script src="/panel-live.js" type="module"></script>');
    expect(renderScreenPage(activeQuestion)).toContain('data-live-src="/screen/live"');
    expect(renderScreenPage(activeQuestion)).not.toContain('http-equiv="refresh"');
  });
});
