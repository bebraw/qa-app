import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  chooseActiveQuestion,
  clearPanelStateForTests,
  getActivePublicQuestion,
  hideQuestion,
  listAudienceQuestions,
  listMcQuestions,
  listModeratorQuestions,
  markActiveQuestionDone,
  proposeQuestion,
  resetPanel,
  voteForQuestion,
} from "./state";

describe("panel state", () => {
  beforeEach(() => {
    clearPanelStateForTests();
    vi.spyOn(globalThis.crypto, "randomUUID").mockReturnValue("00000000-0000-4000-8000-000000000001");
  });

  it("adds, sorts, and de-duplicates votes for available questions", () => {
    const first = proposeQuestion({
      text: "What should teams stop doing with frontend architecture?",
      role: "attendee",
      clientId: "attendee-1",
      ipAddress: "198.51.100.1",
      now: 1,
    });
    vi.mocked(globalThis.crypto.randomUUID).mockReturnValue("00000000-0000-4000-8000-000000000002");
    const second = proposeQuestion({
      text: "How should designers and developers share ownership?",
      role: "moderator",
      clientId: "moderator-1",
      ipAddress: "198.51.100.2",
      now: 2,
    });

    expect(first.ok).toBe(true);
    expect(second.ok).toBe(true);
    expect(voteForQuestion({ id: second.question?.id ?? "", clientId: "attendee-2", ipAddress: "198.51.100.3", now: 3 })).toBe(true);
    expect(voteForQuestion({ id: second.question?.id ?? "", clientId: "attendee-2", ipAddress: "198.51.100.3", now: 4 })).toBe(false);

    expect(listAudienceQuestions("attendee-2").map((question) => [question.text, question.votes, question.votedByCurrentUser])).toEqual([
      ["How should designers and developers share ownership?", 2, true],
      ["What should teams stop doing with frontend architecture?", 1, false],
    ]);
  });

  it("rate limits question submissions by IP address", () => {
    const submissions = Array.from({ length: 4 }, (_, index) =>
      proposeQuestion({
        text: `Question number ${index} with enough detail`,
        role: "attendee",
        clientId: `attendee-${index}`,
        ipAddress: "203.0.113.1",
        now: index,
      }),
    );

    expect(submissions.map((result) => result.ok)).toEqual([true, true, true, false]);
    expect(submissions[3]?.message).toBe("Please wait before adding another question.");
  });

  it("rejects short questions and releases rate-limit buckets after their window", () => {
    expect(
      proposeQuestion({
        text: "why",
        role: "attendee",
        clientId: "attendee-1",
        ipAddress: "203.0.113.1",
        now: 1,
      }),
    ).toEqual({ ok: false, message: "Question is too short." });
    expect(
      proposeQuestion({
        text: "12345678",
        role: "attendee",
        clientId: "attendee-1",
        ipAddress: "203.0.113.1",
        now: 1,
      }).ok,
    ).toBe(true);
    const longQuestion = proposeQuestion({
      text: `   ${"What should frontend teams document? ".repeat(12)}   `,
      role: "attendee",
      clientId: "attendee-long",
      ipAddress: "203.0.113.10",
      now: 2,
    }).question;
    expect(longQuestion?.text).toHaveLength(220);
    expect(longQuestion?.text.startsWith(" ")).toBe(false);
    expect(longQuestion?.text).not.toContain("  ");

    for (let index = 0; index < 3; index += 1) {
      expect(
        proposeQuestion({
          text: `Question with enough detail ${index}`,
          role: "attendee",
          clientId: `attendee-${index}`,
          ipAddress: "203.0.113.2",
          now: index,
        }).ok,
      ).toBe(true);
    }

    expect(
      proposeQuestion({
        text: "Different IP should not share a throttle bucket",
        role: "attendee",
        clientId: "attendee-other",
        ipAddress: "203.0.113.3",
        now: 4,
      }).ok,
    ).toBe(true);

    expect(
      proposeQuestion({
        text: "Question after the window should be accepted",
        role: "attendee",
        clientId: "attendee-4",
        ipAddress: "203.0.113.2",
        now: 60_001,
      }).ok,
    ).toBe(true);
  });

  it("rejects invalid, hidden, done, and over-limit votes", () => {
    const question = proposeQuestion({
      text: "Which tooling choices create the most leverage?",
      role: "attendee",
      clientId: "attendee-1",
      ipAddress: "198.51.100.1",
      now: 1,
    }).question;

    expect(voteForQuestion({ id: "missing", clientId: "attendee-2", ipAddress: "198.51.100.3", now: 2 })).toBe(false);
    expect(hideQuestion(question?.id ?? "")).toBe(true);
    expect(voteForQuestion({ id: question?.id ?? "", clientId: "attendee-2", ipAddress: "198.51.100.3", now: 3 })).toBe(false);
    expect(chooseActiveQuestion(question?.id ?? "")).toBe(false);
    expect(hideQuestion("missing")).toBe(false);

    clearPanelStateForTests();
    const doneQuestion = proposeQuestion({
      text: "What should be treated as production ready?",
      role: "attendee",
      clientId: "attendee-1",
      ipAddress: "198.51.100.1",
      now: 1,
    }).question;
    expect(chooseActiveQuestion(doneQuestion?.id ?? "")).toBe(true);
    expect(markActiveQuestionDone()).toBe(true);
    expect(voteForQuestion({ id: doneQuestion?.id ?? "", clientId: "attendee-2", ipAddress: "198.51.100.3", now: 4 })).toBe(false);
    expect(hideQuestion(doneQuestion?.id ?? "")).toBe(false);
    expect(markActiveQuestionDone()).toBe(false);

    clearPanelStateForTests();
    const limitedQuestion = proposeQuestion({
      text: "What should the room vote on?",
      role: "attendee",
      clientId: "attendee-1",
      ipAddress: "198.51.100.1",
      now: 1,
    }).question;
    for (let index = 0; index < 80; index += 1) {
      expect(
        voteForQuestion({
          id: limitedQuestion?.id ?? "",
          clientId: `attendee-${index + 2}`,
          ipAddress: "198.51.100.80",
          now: index,
        }),
      ).toBe(true);
    }
    expect(
      voteForQuestion({
        id: limitedQuestion?.id ?? "",
        clientId: "attendee-other-ip",
        ipAddress: "198.51.100.81",
        now: 82,
      }),
    ).toBe(true);
    expect(voteForQuestion({ id: limitedQuestion?.id ?? "", clientId: "attendee-99", ipAddress: "198.51.100.80", now: 81 })).toBe(false);
  });

  it("moves active, hidden, done, and reset questions through moderator and MC workflows", () => {
    const question = proposeQuestion({
      text: "Which platform bets are worth making now?",
      role: "attendee",
      clientId: "attendee-1",
      ipAddress: "198.51.100.1",
      now: 1,
    }).question;
    expect(question).toBeDefined();

    expect(chooseActiveQuestion(question?.id ?? "")).toBe(true);
    expect(getActivePublicQuestion()?.text).toBe("Which platform bets are worth making now?");
    expect(listMcQuestions("mc-1")[0]?.status).toBe("active");

    vi.mocked(globalThis.crypto.randomUUID).mockReturnValue("00000000-0000-4000-8000-000000000002");
    const nextQuestion = proposeQuestion({
      text: "Which architecture bets should come next?",
      role: "attendee",
      clientId: "attendee-3",
      ipAddress: "198.51.100.3",
      now: 3,
    }).question;
    expect(chooseActiveQuestion(nextQuestion?.id ?? "")).toBe(true);
    expect(listMcQuestions("mc-1").map((entry) => entry.status)).toEqual(["active", "available"]);
    expect(listAudienceQuestions("attendee-1")[0]?.status).toBe("active");
    expect(markActiveQuestionDone()).toBe(true);
    expect(getActivePublicQuestion()).toBeUndefined();
    expect(listAudienceQuestions("attendee-1")).toHaveLength(1);
    expect(listModeratorQuestions("moderator-1").some((entry) => entry.status === "done")).toBe(false);
    expect(chooseActiveQuestion(nextQuestion?.id ?? "")).toBe(false);

    resetPanel();
    const hidden = proposeQuestion({
      text: "Question that should not be shown to the room",
      role: "attendee",
      clientId: "attendee-2",
      ipAddress: "198.51.100.2",
      now: 2,
    }).question;

    expect(hideQuestion(hidden?.id ?? "")).toBe(true);
    expect(listAudienceQuestions("attendee-2")).toEqual([]);
    expect(listMcQuestions("mc-1")).toEqual([]);
    expect(listModeratorQuestions("moderator-1")).toHaveLength(1);

    resetPanel();
    expect(listModeratorQuestions("moderator-1")).toEqual([]);
  });
});
