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
    const html = renderAudiencePage({ questions: [activeQuestion], notice: "Question added." });

    expect(html).not.toContain("Stryker was here!");
    expect(html).toContain("<title>Future Frontend Panels</title>");
    expect(html).toContain('<script src="/panel-live.js" type="module"></script>');
    expect(html).toContain('data-live-src="/questions/live"');
    expect(html).toContain("bg-app-canvas text-app-text");
    expect(html).toContain("Question added.");
    expect(html).toContain("How do we keep frontend systems understandable?");
    expect(html).toContain("Live");
    expect(html).toContain("Voted");
    expect(html).toContain('action="/"');
    expect(renderAudiencePage({ questions: [availableQuestion] })).toContain('action="/vote"');
    expect(renderAudiencePage({ questions: [availableQuestion] })).not.toContain('action="/moderator/vote"');
  });

  it("renders protected role login setup states", () => {
    expect(renderMcPage({ questions: [], auth: { configured: false } })).toContain("Set AUTH_SECRET and MC_PASSCODE");
    expect(renderModeratorPage({ questions: [], auth: { configured: false } })).toContain("Set AUTH_SECRET and MODERATOR_PASSCODE");
    expect(renderMcPage({ questions: [], auth: { configured: true } })).not.toContain("Set AUTH_SECRET");
    expect(renderModeratorPage({ questions: [], auth: { configured: true } })).toContain('action="/moderator/login"');
    expect(renderModeratorPage({ questions: [], auth: { configured: true, role: "moderator" } })).toContain("No questions to moderate.");
  });

  it("renders MC and moderator queues with role-specific actions", () => {
    const mcHtml = renderMcPage({ questions: [availableQuestion], auth: { configured: true, role: "mc" } });
    const moderatorHtml = renderModeratorPage({
      questions: [availableQuestion, hiddenQuestion],
      words: [approvedWord, pendingWord],
      wordCloudEnded: true,
      auth: { configured: true, role: "moderator" },
    });

    expect(mcHtml).toContain('action="/mc/select"');
    expect(mcHtml).toContain('action="/mc/done"');
    expect(mcHtml).toContain(">Ask</button>");
    expect(mcHtml).toContain("bg-app-text text-white hover:bg-app-accent-strong");
    expect(moderatorHtml).toContain('action="/moderator/vote"');
    expect(moderatorHtml).toContain('action="/moderator"');
    expect(moderatorHtml).toContain("Add moderator question");
    expect(moderatorHtml).toContain('action="/moderator/hide"');
    expect(moderatorHtml).toContain(">Hide</button>");
    expect(moderatorHtml).toContain("border-app-line bg-white text-app-text-soft hover:text-app-text");
    expect(moderatorHtml).toContain("Hidden");
    expect(moderatorHtml).toContain('action="/moderator/words/approve"');
    expect(moderatorHtml).toContain('action="/moderator/words/merge"');
    expect(moderatorHtml).toContain("Ended");
    expect(moderatorHtml).toContain(">Reset</button>");
    expect(moderatorHtml).not.toContain("Stryker was here!");
  });

  it("renders pending question approval controls for moderator", () => {
    const moderatorHtml = renderModeratorPage({
      questions: [pendingQuestion],
      auth: { configured: true, role: "moderator" },
    });

    expect(moderatorHtml).toContain("Pending question");
    expect(moderatorHtml).toContain("Pending");
    expect(moderatorHtml).toContain('action="/moderator/approve"');
    expect(moderatorHtml).not.toContain('action="/moderator/vote"');
  });

  it("renders word cloud attendee and screen views", () => {
    const wordHtml = renderWordPage({ words: [approvedWord], notice: "Word counted." });

    expect(wordHtml).toContain("<title>Words - Future Frontend Panels</title>");
    expect(wordHtml).toContain('<script src="/panel-live.js" type="module"></script>');
    expect(wordHtml).toContain('data-live-src="/words/live"');
    expect(wordHtml).toContain("Word counted.");
    expect(wordHtml).toContain('action="/words"');
    expect(wordHtml).toContain('action="/words/vote"');
    expect(wordHtml).toContain("Readable 4");
    expect(renderWordScreenPage([approvedWord])).toContain("Readable");
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
