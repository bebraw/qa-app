import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  approveQuestion,
  chooseActiveQuestion,
  clearFailedLoginAttempts,
  clearPanelStateForTests,
  approveWord,
  endWordCloud,
  getActivePublicQuestion,
  getPanelMode,
  hideQuestion,
  hideWord,
  isLoginRateLimited,
  listAudienceQuestions,
  listAudienceWords,
  listMcQuestions,
  listModeratorQuestions,
  listModeratorWords,
  listScreenWords,
  markActiveQuestionDone,
  mergeWord,
  proposeQuestion,
  recordFailedLoginAttempt,
  resetPanel,
  setPanelMode,
  submitWord,
  voteForQuestion,
  voteForWord,
  wordCloudEnded,
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
    expect(voteForQuestion({ id: first.question?.id ?? "", clientId: "attendee-2", ipAddress: "198.51.100.3", now: 5 })).toBe(false);

    expect(listAudienceQuestions("attendee-1").map((question) => [question.text, question.status])).toContainEqual([
      "What should teams stop doing with frontend architecture?",
      "pending",
    ]);
    expect(listAudienceQuestions("attendee-2").map((question) => [question.text, question.votes, question.votedByCurrentUser])).toEqual([
      ["How should designers and developers share ownership?", 1, true],
    ]);
    expect(approveQuestion(first.question?.id ?? "")).toBe(true);
    expect(listAudienceQuestions("attendee-2").map((question) => question.text)).toContain(
      "What should teams stop doing with frontend architecture?",
    );
    expect(voteForQuestion({ id: first.question?.id ?? "", clientId: "attendee-1", ipAddress: "198.51.100.4", now: 6 })).toBe(false);
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

  it("rate limits failed role login attempts by role and IP address", () => {
    const attempts = Array.from({ length: 8 }, (_, index) =>
      recordFailedLoginAttempt({
        role: "moderator",
        ipAddress: "203.0.113.20",
        now: index,
      }),
    );

    expect(attempts).toEqual([false, false, false, false, false, false, false, false]);
    expect(isLoginRateLimited({ role: "moderator", ipAddress: "203.0.113.20", now: 9 })).toBe(true);
    expect(recordFailedLoginAttempt({ role: "mc", ipAddress: "203.0.113.20", now: 10 })).toBe(false);
    expect(recordFailedLoginAttempt({ role: "moderator", ipAddress: "203.0.113.21", now: 10 })).toBe(false);
    expect(isLoginRateLimited({ role: "moderator", ipAddress: "203.0.113.20", now: 600_001 })).toBe(false);

    recordFailedLoginAttempt({ role: "moderator", ipAddress: "203.0.113.22", now: 1 });
    clearFailedLoginAttempts({ role: "moderator", ipAddress: "203.0.113.22" });
    expect(isLoginRateLimited({ role: "moderator", ipAddress: "203.0.113.22", now: 2 })).toBe(false);
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
      role: "moderator",
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
      role: "moderator",
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
      role: "moderator",
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
      role: "moderator",
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
      role: "moderator",
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

  it("keeps attendee questions pending until moderator approval", () => {
    const question = proposeQuestion({
      text: "Should this become visible only after moderation?",
      role: "attendee",
      clientId: "attendee-1",
      ipAddress: "198.51.100.1",
      now: 1,
    }).question;

    expect(question?.status).toBe("pending");
    expect(listAudienceQuestions("attendee-2")).toEqual([]);
    expect(listModeratorQuestions("moderator-1").map((entry) => entry.status)).toEqual(["pending"]);
    expect(chooseActiveQuestion(question?.id ?? "")).toBe(false);
    expect(approveQuestion(question?.id ?? "")).toBe(true);
    expect(approveQuestion(question?.id ?? "")).toBe(false);
    expect(listAudienceQuestions("attendee-2").map((entry) => entry.status)).toEqual(["available"]);
    expect(listAudienceQuestions("attendee-1").map((entry) => [entry.status, entry.submittedByCurrentUser])).toEqual([["available", true]]);
  });

  it("tracks the active panel mode and resets it for the next panel", () => {
    expect(getPanelMode()).toBe("qa");

    setPanelMode("wordcloud");
    expect(getPanelMode()).toBe("wordcloud");

    resetPanel();
    expect(getPanelMode()).toBe("qa");
  });

  it("keeps active questions first even when selected after another question", () => {
    const first = proposeQuestion({
      text: "Which question should stay below the active one?",
      role: "moderator",
      clientId: "moderator-1",
      ipAddress: "198.51.100.1",
      now: 1,
    }).question;
    vi.mocked(globalThis.crypto.randomUUID).mockReturnValue("00000000-0000-4000-8000-000000000002");
    const second = proposeQuestion({
      text: "Which question should become active?",
      role: "moderator",
      clientId: "moderator-1",
      ipAddress: "198.51.100.1",
      now: 2,
    }).question;

    expect(chooseActiveQuestion(second?.id ?? "")).toBe(true);
    expect(listAudienceQuestions("attendee-1").map((entry) => entry.id)).toEqual([second?.id, first?.id]);
  });

  it("auto-increments duplicate words and keeps new words pending", () => {
    const first = submitWord({
      text: "Great!",
      clientId: "attendee-1",
      ipAddress: "198.51.100.1",
      now: 1,
    });
    const duplicate = submitWord({
      text: "great",
      clientId: "attendee-2",
      ipAddress: "198.51.100.2",
      now: 2,
    });
    vi.mocked(globalThis.crypto.randomUUID).mockReturnValue("00000000-0000-4000-8000-000000000002");
    submitWord({
      text: "Alpha",
      clientId: "attendee-2",
      ipAddress: "198.51.100.2",
      now: 3,
    });

    expect(first.ok).toBe(true);
    expect(first.word?.status).toBe("pending");
    expect(duplicate.message).toBe("Word added.");
    expect(duplicate.word?.count).toBe(1);
    expect(listModeratorWords("moderator-1").map((word) => [word.text, word.count, word.status])).toEqual([
      ["Great!", 2, "pending"],
      ["Alpha", 1, "pending"],
    ]);
    expect(listAudienceWords("attendee-1").map((word) => [word.text, word.count, word.status, word.submittedByCurrentUser])).toEqual([
      ["Great!", 1, "pending", true],
    ]);
    expect(listAudienceWords("attendee-2").map((word) => [word.text, word.count, word.status, word.submittedByCurrentUser])).toEqual([
      ["Alpha", 1, "pending", true],
      ["Great!", 1, "pending", true],
    ]);
    expect(listAudienceWords("attendee-3")).toEqual([]);

    expect(approveWord(first.word?.id ?? "")).toBe(true);
    expect(listAudienceWords("attendee-1").map((word) => [word.text, word.count])).toEqual([["Great!", 2]]);
  });

  it("allows only one attendee vote per approved word", () => {
    const word = submitWord({
      text: "Durable",
      clientId: "attendee-1",
      ipAddress: "198.51.100.1",
      now: 1,
    }).word;

    expect(voteForWord({ id: word?.id ?? "", clientId: "attendee-2", ipAddress: "198.51.100.2", now: 2 })).toBe(false);
    expect(approveWord(word?.id ?? "")).toBe(true);
    expect(voteForWord({ id: word?.id ?? "", clientId: "attendee-1", ipAddress: "198.51.100.1", now: 2 })).toBe(false);
    expect(voteForWord({ id: word?.id ?? "", clientId: "attendee-2", ipAddress: "198.51.100.2", now: 3 })).toBe(true);
    expect(voteForWord({ id: word?.id ?? "", clientId: "attendee-2", ipAddress: "198.51.100.2", now: 4 })).toBe(false);

    expect(listAudienceWords("attendee-2").map((entry) => [entry.count, entry.votedByCurrentUser])).toEqual([[2, true]]);
    expect(listAudienceWords("attendee-1").map((entry) => [entry.count, entry.submittedByCurrentUser, entry.votedByCurrentUser])).toEqual([
      [2, true, false],
    ]);
  });

  it("lets moderator merge word variants into one entry", () => {
    const great = submitWord({
      text: "great",
      clientId: "attendee-1",
      ipAddress: "198.51.100.1",
      now: 1,
    }).word;
    vi.mocked(globalThis.crypto.randomUUID).mockReturnValue("00000000-0000-4000-8000-000000000002");
    const awesome = submitWord({
      text: "awesome",
      clientId: "attendee-2",
      ipAddress: "198.51.100.2",
      now: 2,
    }).word;

    expect(approveWord(great?.id ?? "")).toBe(true);
    expect(voteForWord({ id: great?.id ?? "", clientId: "attendee-3", ipAddress: "198.51.100.3", now: 3 })).toBe(true);
    expect(mergeWord(awesome?.id ?? "", "great!")).toBe(true);

    expect(listModeratorWords("moderator-1").map((word) => [word.text, word.count, word.status])).toEqual([["great", 3, "approved"]]);
    expect(mergeWord("missing", "great")).toBe(false);
  });

  it("sorts approved words by count and hides pending words from the screen", () => {
    const first = submitWord({
      text: "Readable",
      clientId: "attendee-1",
      ipAddress: "198.51.100.1",
      now: 1,
    }).word;
    vi.mocked(globalThis.crypto.randomUUID).mockReturnValue("00000000-0000-4000-8000-000000000002");
    const second = submitWord({
      text: "Durable",
      clientId: "attendee-2",
      ipAddress: "198.51.100.2",
      now: 2,
    }).word;
    vi.mocked(globalThis.crypto.randomUUID).mockReturnValue("00000000-0000-4000-8000-000000000003");
    submitWord({
      text: "Pending",
      clientId: "attendee-3",
      ipAddress: "198.51.100.3",
      now: 3,
    });

    expect(approveWord(first?.id ?? "")).toBe(true);
    expect(approveWord(second?.id ?? "")).toBe(true);
    expect(voteForWord({ id: second?.id ?? "", clientId: "attendee-4", ipAddress: "198.51.100.4", now: 4 })).toBe(true);

    expect(listScreenWords().map((word) => word.text)).toEqual(["Durable", "Readable"]);
    expect(listScreenWords().map((word) => word.text)).not.toContain("Pending");
  });

  it("normalizes and truncates word display values", () => {
    const word = submitWord({
      text: `  ${"Long ".repeat(20)}  `,
      clientId: "attendee-1",
      ipAddress: "198.51.100.1",
      now: 1,
    }).word;

    expect(word?.text).toHaveLength(40);
    expect(word?.text.startsWith(" ")).toBe(false);
    expect(word?.text).not.toContain("  ");
    expect(
      submitWord({
        text: "ok",
        clientId: "attendee-2",
        ipAddress: "198.51.100.2",
        now: 2,
      }).ok,
    ).toBe(true);
  });

  it("keeps ended word cloud data visible to moderator until reset", () => {
    const word = submitWord({
      text: "Readable",
      clientId: "attendee-1",
      ipAddress: "198.51.100.1",
      now: 1,
    }).word;

    expect(approveWord(word?.id ?? "")).toBe(true);
    expect(listScreenWords()).toHaveLength(1);
    endWordCloud(2);

    expect(wordCloudEnded()).toBe(true);
    expect(submitWord({ text: "Late", clientId: "attendee-2", ipAddress: "198.51.100.2", now: 3 }).message).toBe("Word cloud ended.");
    expect(voteForWord({ id: word?.id ?? "", clientId: "attendee-2", ipAddress: "198.51.100.2", now: 4 })).toBe(false);
    expect(listAudienceWords("attendee-1")).toEqual([]);
    expect(listScreenWords()).toEqual([]);
    expect(listModeratorWords("moderator-1").map((entry) => entry.text)).toEqual(["Readable"]);

    resetPanel();
    expect(wordCloudEnded()).toBe(false);
    expect(listModeratorWords("moderator-1")).toEqual([]);
  });

  it("hides words and rate limits word submissions", () => {
    const submissions = Array.from({ length: 31 }, (_, index) =>
      submitWord({
        text: `word ${index}`,
        clientId: `attendee-${index}`,
        ipAddress: "203.0.113.20",
        now: index,
      }),
    );

    expect(submissions[30]?.message).toBe("Please wait before adding another word.");
    expect(submitWord({ text: "!", clientId: "attendee-short", ipAddress: "203.0.113.21", now: 1 }).message).toBe("Word is too short.");
    expect(hideWord(submissions[0]?.word?.id ?? "")).toBe(true);
    expect(approveWord(submissions[0]?.word?.id ?? "")).toBe(false);
    expect(hideWord("missing")).toBe(false);
  });
});
