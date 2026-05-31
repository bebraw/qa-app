import { describe, expect, it } from "vitest";
import type { PublicQuestion } from "../panel/state";
import { renderAudiencePage, renderMcPage, renderModeratorPage, renderScreenPage } from "./panel";

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

describe("panel views", () => {
  it("renders attendee questions, notices, and voted state", () => {
    const html = renderAudiencePage({ questions: [activeQuestion], notice: "Question added." });

    expect(html).not.toContain("Stryker was here!");
    expect(html).toContain("<title>Future Frontend Panels</title>");
    expect(html).toContain("bg-app-canvas text-app-text");
    expect(html).toContain("Ask or lift up what should be discussed next.");
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
      auth: { configured: true, role: "moderator" },
    });

    expect(mcHtml).toContain('action="/mc/select"');
    expect(mcHtml).toContain('action="/mc/done"');
    expect(mcHtml).toContain(">Ask</button>");
    expect(mcHtml).toContain("bg-app-text text-white hover:bg-app-accent-strong");
    expect(moderatorHtml).toContain('action="/moderator/vote"');
    expect(moderatorHtml).toContain('action="/moderator"');
    expect(moderatorHtml).toContain("Add moderator question");
    expect(moderatorHtml).toContain("Seed question for the panel");
    expect(moderatorHtml).toContain('action="/moderator/hide"');
    expect(moderatorHtml).toContain(">Hide</button>");
    expect(moderatorHtml).toContain("border-red-900/20 bg-red-50 text-red-900 hover:bg-red-100");
    expect(moderatorHtml).toContain("Hidden");
    expect(moderatorHtml).toContain("Reset panel");
    expect(moderatorHtml).not.toContain("Stryker was here!");
  });

  it("renders the screen waiting state and active question state", () => {
    expect(renderScreenPage(undefined)).toContain("Questions will appear here.");
    expect(renderScreenPage(activeQuestion)).toContain("How do we keep frontend systems understandable?");
    expect(renderScreenPage(activeQuestion)).toContain('http-equiv="refresh"');
  });
});
