import { beforeEach, describe, expect, it } from "vitest";
import type { PanelEnv } from "./panel/auth";
import { clearPanelStateForTests } from "./panel/state";
import worker, { PanelRoom, handleRequest, type PanelWorkerEnv } from "./worker";
import { ensureGeneratedStylesheet } from "./test-support";

ensureGeneratedStylesheet();

const env: PanelEnv = {
  AUTH_SECRET: "test-secret",
  MC_PASSCODE: "mc-passcode",
  MODERATOR_PASSCODE: "mod-passcode",
};

describe("worker", () => {
  beforeEach(() => {
    clearPanelStateForTests();
  });

  it("renders the attendee question page", async () => {
    const response = await handleRequest(new Request("http://example.com/"));

    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toContain("text/html");
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(response.headers.get("set-cookie")).toContain("panel_attendee=");

    const body = await response.text();
    expect(body).toContain("Future Frontend");
    expect(body).toContain("Ask a question");
    expect(body).toContain("No questions yet.");
  });

  it("accepts anonymous questions and votes once per attendee", async () => {
    const submitResponse = await handleRequest(
      new Request("http://example.com/", {
        method: "POST",
        headers: { "content-type": "application/x-www-form-urlencoded", "cf-connecting-ip": "198.51.100.1" },
        body: new URLSearchParams({ question: "What does durable frontend architecture mean in practice?" }),
      }),
    );

    expect(submitResponse.status).toBe(303);
    expect(submitResponse.headers.get("location")).toContain("Question+sent");
    const submitterCookie = cookieHeaderFromResponse(submitResponse);

    await expect(handleRequest(new Request("http://example.com/")).then((response) => response.text())).resolves.not.toContain(
      "What does durable frontend architecture mean in practice?",
    );
    const submitterPageResponse = await handleRequest(new Request("http://example.com/", { headers: { cookie: submitterCookie } }));
    const submitterPage = await submitterPageResponse.text();
    expect(submitterPage).toContain("What does durable frontend architecture mean in practice?");
    expect(submitterPage).toContain("Under consideration");
    expect(submitterPage).not.toContain('action="/vote"');

    const moderatorLogin = await handleRequest(
      new Request("http://example.com/moderator/login", {
        method: "POST",
        headers: { "content-type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({ passcode: "mod-passcode" }),
      }),
      env,
    );
    const moderatorCookie = cookieHeaderFromResponse(moderatorLogin);
    const moderatorHtml = await handleRequest(
      new Request("http://example.com/moderator", { headers: { cookie: moderatorCookie } }),
      env,
    ).then((response) => response.text());
    const questionId = /name="questionId" value="([^"]+)"/u.exec(moderatorHtml)?.[1] ?? "";
    expect(moderatorHtml).toContain("Under consideration");
    await handleRequest(
      new Request("http://example.com/moderator/approve", {
        method: "POST",
        headers: { "content-type": "application/x-www-form-urlencoded", cookie: moderatorCookie },
        body: new URLSearchParams({ questionId }),
      }),
      env,
    );
    await expect(handleRequest(new Request("http://example.com/questions/live")).then((response) => response.text())).resolves.toContain(
      "What does durable frontend architecture mean in practice?",
    );
    await expect(
      handleRequest(new Request("http://example.com/moderator/questions/live", { headers: { cookie: moderatorCookie } }), env).then(
        (response) => response.text(),
      ),
    ).resolves.toContain("What does durable frontend architecture mean in practice?");

    const mcLogin = await handleRequest(
      new Request("http://example.com/mc/login", {
        method: "POST",
        headers: { "content-type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({ passcode: "mc-passcode" }),
      }),
      env,
    );
    const mcCookie = cookieHeaderFromResponse(mcLogin);
    await expect(
      handleRequest(new Request("http://example.com/mc/live", { headers: { cookie: mcCookie } }), env).then((response) => response.text()),
    ).resolves.toContain("What does durable frontend architecture mean in practice?");

    const voterCookie = cookieHeaderFromResponse(await handleRequest(new Request("http://example.com/")));
    const voteResponse = await handleRequest(
      new Request("http://example.com/vote", {
        method: "POST",
        headers: { "content-type": "application/x-www-form-urlencoded", cookie: voterCookie },
        body: new URLSearchParams({ questionId }),
      }),
    );
    expect(voteResponse.status).toBe(303);
    expect(voteResponse.headers.get("location")).toBe("/");
    await expect(
      handleRequest(new Request("http://example.com/", { headers: { cookie: voterCookie } })).then((response) => response.text()),
    ).resolves.toContain("Voted");
    await expect(
      handleRequest(new Request("http://example.com/moderator/questions/live", { headers: { cookie: moderatorCookie } }), env).then(
        (response) => response.text(),
      ),
    ).resolves.toContain('class="text-2xl font-semibold leading-none">2</span>');
  });

  it("accepts words, lets moderator approve and end the cloud", async () => {
    const moderatorLogin = await handleRequest(
      new Request("http://example.com/moderator/login", {
        method: "POST",
        headers: { "content-type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({ passcode: "mod-passcode" }),
      }),
      env,
    );
    const moderatorCookie = cookieHeaderFromResponse(moderatorLogin);
    await handleRequest(
      new Request("http://example.com/moderator/mode", {
        method: "POST",
        headers: { "content-type": "application/x-www-form-urlencoded", cookie: moderatorCookie },
        body: new URLSearchParams({ mode: "wordcloud" }),
      }),
      env,
    );
    const firstResponse = await handleRequest(
      new Request("http://example.com/", {
        method: "POST",
        headers: { "content-type": "application/x-www-form-urlencoded", "cf-connecting-ip": "198.51.100.10" },
        body: new URLSearchParams({ word: "Great!" }),
      }),
    );
    const duplicateResponse = await handleRequest(
      new Request("http://example.com/", {
        method: "POST",
        headers: { "content-type": "application/x-www-form-urlencoded", "cf-connecting-ip": "198.51.100.11" },
        body: new URLSearchParams({ word: "great" }),
      }),
    );

    expect(firstResponse.headers.get("location")).toContain("Word+added");
    expect(firstResponse.headers.get("location")).toContain("/");
    expect(duplicateResponse.headers.get("location")).toContain("Word+counted");
    await expect(handleRequest(new Request("http://example.com/words")).then((response) => response.status)).resolves.toBe(404);
    await expect(handleRequest(new Request("http://example.com/")).then((response) => response.text())).resolves.toContain("No words yet.");

    const moderatorPage = await handleRequest(new Request("http://example.com/moderator", { headers: { cookie: moderatorCookie } }), env);
    const moderatorHtml = await moderatorPage.text();
    const wordId = /name="wordId" value="([^"]+)"/u.exec(moderatorHtml)?.[1] ?? "";

    expect(moderatorHtml).toContain("Great!");
    expect(moderatorHtml).not.toContain("Add moderator question");
    expect(wordId).not.toBe("");

    await handleRequest(
      new Request("http://example.com/moderator/words/approve", {
        method: "POST",
        headers: { "content-type": "application/x-www-form-urlencoded", cookie: moderatorCookie },
        body: new URLSearchParams({ wordId }),
      }),
      env,
    );
    const wordPage = await handleRequest(new Request("http://example.com/"));
    const wordHtml = await wordPage.text();
    const attendeeCookie = cookieHeaderFromResponse(wordPage);
    expect(wordHtml).toContain("Great!");
    expect(wordHtml).toContain('aria-label="Vote for Great!, 2 votes"');
    await expect(handleRequest(new Request("http://example.com/live")).then((response) => response.text())).resolves.toContain(
      'aria-label="Vote for Great!, 2 votes"',
    );
    await expect(
      handleRequest(new Request("http://example.com/moderator/words/live", { headers: { cookie: moderatorCookie } }), env).then(
        (response) => response.text(),
      ),
    ).resolves.toContain("Great!");
    await expect(handleRequest(new Request("http://example.com/words/screen/live")).then((response) => response.text())).resolves.toContain(
      "Great!",
    );

    await handleRequest(
      new Request("http://example.com/vote", {
        method: "POST",
        headers: { "content-type": "application/x-www-form-urlencoded", cookie: attendeeCookie },
        body: new URLSearchParams({ wordId }),
      }),
    );
    await handleRequest(
      new Request("http://example.com/vote", {
        method: "POST",
        headers: { "content-type": "application/x-www-form-urlencoded", cookie: attendeeCookie },
        body: new URLSearchParams({ wordId }),
      }),
    );
    await expect(
      handleRequest(new Request("http://example.com/", { headers: { cookie: attendeeCookie } })).then((response) => response.text()),
    ).resolves.toContain('aria-label="Vote for Great!, 3 votes"');
    await expect(handleRequest(new Request("http://example.com/words/screen")).then((response) => response.text())).resolves.toContain(
      "Great!",
    );

    await handleRequest(
      new Request("http://example.com/moderator/words/end", { method: "POST", headers: { cookie: moderatorCookie } }),
      env,
    );
    await expect(handleRequest(new Request("http://example.com/words/screen")).then((response) => response.text())).resolves.toContain(
      "Waiting.",
    );
    await expect(
      handleRequest(new Request("http://example.com/moderator", { headers: { cookie: moderatorCookie } }), env).then((response) =>
        response.text(),
      ),
    ).resolves.toContain("Great!");
  });

  it("lets moderator switch the attendee root between QA and wordcloud modes", async () => {
    const moderatorLogin = await handleRequest(
      new Request("http://example.com/moderator/login", {
        method: "POST",
        headers: { "content-type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({ passcode: "mod-passcode" }),
      }),
      env,
    );
    const moderatorCookie = cookieHeaderFromResponse(moderatorLogin);

    await expect(handleRequest(new Request("http://example.com/")).then((response) => response.text())).resolves.toContain(
      "Ask a question",
    );

    const modeResponse = await handleRequest(
      new Request("http://example.com/moderator/mode", {
        method: "POST",
        headers: { "content-type": "application/x-www-form-urlencoded", cookie: moderatorCookie },
        body: new URLSearchParams({ mode: "wordcloud" }),
      }),
      env,
    );
    expect(modeResponse.status).toBe(303);
    expect(modeResponse.headers.get("location")).toBe("/moderator");
    await expect(handleRequest(new Request("http://example.com/live")).then((response) => response.text())).resolves.toContain("Add word");
    await expect(
      handleRequest(new Request("http://example.com/moderator/live", { headers: { cookie: moderatorCookie } }), env).then((response) =>
        response.text(),
      ),
    ).resolves.toContain("No words yet.");

    const wordResponse = await handleRequest(
      new Request("http://example.com/", {
        method: "POST",
        headers: { "content-type": "application/x-www-form-urlencoded", "cf-connecting-ip": "198.51.100.41" },
        body: new URLSearchParams({ word: "Mode" }),
      }),
    );
    expect(wordResponse.headers.get("location")).toContain("Word+added");

    const moderatorWordHtml = await handleRequest(
      new Request("http://example.com/moderator", { headers: { cookie: moderatorCookie } }),
      env,
    ).then((response) => response.text());
    expect(moderatorWordHtml).toContain("Mode");
    expect(moderatorWordHtml).not.toContain("No questions to moderate.");

    const getModeResponse = await handleRequest(
      new Request("http://example.com/moderator/mode?mode=qa", { headers: { cookie: moderatorCookie } }),
      env,
    );
    expect(getModeResponse.status).toBe(404);
    await expect(handleRequest(new Request("http://example.com/live")).then((response) => response.text())).resolves.toContain("Add word");

    const getQueryResponse = await handleRequest(
      new Request("http://example.com/moderator?mode=qa", { headers: { cookie: moderatorCookie } }),
      env,
    );
    expect(getQueryResponse.status).toBe(200);
    await expect(handleRequest(new Request("http://example.com/live")).then((response) => response.text())).resolves.toContain("Add word");

    await handleRequest(
      new Request("http://example.com/moderator/mode", {
        method: "POST",
        headers: { "content-type": "application/x-www-form-urlencoded", cookie: moderatorCookie },
        body: new URLSearchParams({ mode: "qa" }),
      }),
      env,
    );
    await expect(handleRequest(new Request("http://example.com/live")).then((response) => response.text())).resolves.toContain(
      "Ask a question",
    );
  });

  it("routes panel state through the durable object room binding", async () => {
    const storage = new Map<string, unknown>();
    let room = createTestPanelRoom(storage);
    const durableEnv: PanelWorkerEnv = {
      ...env,
      PANEL_ROOM: {
        idFromName: () => "default",
        get: () => ({ fetch: async (request) => await room.fetch(request) }),
      },
    };

    await handleRequest(
      new Request("http://example.com/", {
        method: "POST",
        headers: { "content-type": "application/x-www-form-urlencoded", "cf-connecting-ip": "198.51.100.31" },
        body: new URLSearchParams({ question: "Can everyone see the same approved queue now?" }),
      }),
      durableEnv,
    );
    clearPanelStateForTests();
    room = createTestPanelRoom(storage);

    const moderatorLogin = await handleRequest(
      new Request("http://example.com/moderator/login", {
        method: "POST",
        headers: { "content-type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({ passcode: "mod-passcode" }),
      }),
      durableEnv,
    );
    const moderatorCookie = cookieHeaderFromResponse(moderatorLogin);
    const moderatorHtml = await handleRequest(
      new Request("http://example.com/moderator", { headers: { cookie: moderatorCookie } }),
      durableEnv,
    ).then((response) => response.text());

    expect(moderatorHtml).toContain("Can everyone see the same approved queue now?");
    expect(moderatorHtml).toContain("Under consideration");
  });

  it("redirects unknown posts and protected actions safely", async () => {
    const unknownPost = await handleRequest(new Request("http://example.com/missing", { method: "POST" }));
    expect(unknownPost.status).toBe(404);

    const unconfiguredLogin = await handleRequest(
      new Request("http://example.com/mc/login", {
        method: "POST",
        headers: { "content-type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({ passcode: "mc-passcode" }),
      }),
    );
    expect(unconfiguredLogin.headers.get("location")).toContain("Role+access+is+not+configured");
    expect(unconfiguredLogin.headers.get("location")).toContain("/mc");

    const wrongLogin = await handleRequest(
      new Request("http://example.com/mc/login", {
        method: "POST",
        headers: { "content-type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({ passcode: "wrong" }),
      }),
      env,
    );
    expect(wrongLogin.headers.get("location")).toContain("Passcode+not+accepted");
    expect(wrongLogin.headers.get("location")).toContain("/mc");

    for (let index = 0; index < 8; index += 1) {
      await handleRequest(
        new Request("http://example.com/mc/login", {
          method: "POST",
          headers: { "content-type": "application/x-www-form-urlencoded", "cf-connecting-ip": "203.0.113.90" },
          body: new URLSearchParams({ passcode: "wrong" }),
        }),
        env,
      );
    }
    const throttledLogin = await handleRequest(
      new Request("http://example.com/mc/login", {
        method: "POST",
        headers: { "content-type": "application/x-www-form-urlencoded", "cf-connecting-ip": "203.0.113.90" },
        body: new URLSearchParams({ passcode: "mc-passcode" }),
      }),
      env,
    );
    expect(throttledLogin.headers.get("location")).toContain("Please+wait+before+trying+again");

    const otherIpLogin = await handleRequest(
      new Request("http://example.com/mc/login", {
        method: "POST",
        headers: { "content-type": "application/x-www-form-urlencoded", "cf-connecting-ip": "203.0.113.91" },
        body: new URLSearchParams({ passcode: "mc-passcode" }),
      }),
      env,
    );
    expect(cookieHeaderFromResponse(otherIpLogin)).toContain("panel_auth_mc=");

    const mcAction = await handleRequest(new Request("http://example.com/mc/select", { method: "POST" }), env);
    expect(mcAction.headers.get("location")).toContain("Sign+in+first");
    expect(mcAction.headers.get("location")).toContain("/mc");

    const moderatorAction = await handleRequest(new Request("http://example.com/moderator/reset", { method: "POST" }), env);
    expect(moderatorAction.headers.get("location")).toContain("Sign+in+first");
    expect(moderatorAction.headers.get("location")).toContain("/moderator");
  });

  it("returns a JSON health response", async () => {
    const response = await handleRequest(new Request("http://example.com/api/health"));

    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toContain("application/json");
    await expect(response.json()).resolves.toEqual({
      ok: true,
      name: "vibe-template-worker",
      routes: ["/", "/mc", "/moderator", "/screen", "/words/screen", "/api/health"],
    });
  });

  it("protects MC and moderator views with signed passcode cookies", async () => {
    const protectedMcResponse = await handleRequest(new Request("http://example.com/mc"), env);
    await expect(protectedMcResponse.text()).resolves.toContain('action="/mc/login"');

    const loginResponse = await handleRequest(
      new Request("http://example.com/mc/login", {
        method: "POST",
        headers: { "content-type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({ passcode: "mc-passcode" }),
      }),
      env,
    );
    const loginCookies = readSetCookies(loginResponse.headers);
    const authCookie = cookieHeaderFromSetCookies(loginCookies);

    expect(loginResponse.status).toBe(303);
    expect(loginResponse.headers.get("location")).toBe("/mc");
    expect(loginCookies).toEqual(
      expect.arrayContaining([expect.stringContaining("panel_attendee="), expect.stringContaining("panel_auth_mc=")]),
    );
    expect(loginCookies.find((cookie) => cookie.startsWith("panel_auth_mc="))).not.toContain("Secure");

    const secureLoginResponse = await handleRequest(
      new Request("https://example.com/mc/login", {
        method: "POST",
        headers: { "content-type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({ passcode: "mc-passcode" }),
      }),
      env,
    );
    expect(readSetCookies(secureLoginResponse.headers).find((cookie) => cookie.startsWith("panel_auth_mc="))).toContain("Secure");

    const moderatorLoginResponse = await handleRequest(
      new Request("http://example.com/moderator/login", {
        method: "POST",
        headers: { "content-type": "application/x-www-form-urlencoded", cookie: authCookie },
        body: new URLSearchParams({ passcode: "mod-passcode" }),
      }),
      env,
    );
    const sharedBrowserCookie = cookieHeaderFromSetCookies([...loginCookies, ...readSetCookies(moderatorLoginResponse.headers)]);

    const mcResponse = await handleRequest(new Request("http://example.com/mc", { headers: { cookie: sharedBrowserCookie } }), env);
    await expect(mcResponse.text()).resolves.toContain("Queue");

    const moderatorResponse = await handleRequest(
      new Request("http://example.com/moderator", { headers: { cookie: sharedBrowserCookie } }),
      env,
    );
    await expect(moderatorResponse.text()).resolves.toContain("Moderator");

    const logoutResponse = await handleRequest(
      new Request("http://example.com/logout", { method: "POST", headers: { cookie: sharedBrowserCookie } }),
      env,
    );
    expect(logoutResponse.headers.get("location")).toBe("/");
    expect(readSetCookies(logoutResponse.headers)).toEqual(
      expect.arrayContaining([
        expect.stringMatching(/^panel_auth_mc=.*Max-Age=0/u),
        expect.stringMatching(/^panel_auth_moderator=.*Max-Age=0/u),
      ]),
    );
  });

  it("lets moderator hide questions and MC select the screen question", async () => {
    await handleRequest(
      new Request("http://example.com/", {
        method: "POST",
        headers: { "content-type": "application/x-www-form-urlencoded", "cf-connecting-ip": "198.51.100.1" },
        body: new URLSearchParams({ question: "Which standards are ready for production use?" }),
      }),
    );
    const moderatorLogin = await handleRequest(
      new Request("http://example.com/moderator/login", {
        method: "POST",
        headers: { "content-type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({ passcode: "mod-passcode" }),
      }),
      env,
    );
    const moderatorCookie = cookieHeaderFromResponse(moderatorLogin);
    const moderatorPage = await handleRequest(new Request("http://example.com/moderator", { headers: { cookie: moderatorCookie } }), env);
    const moderatorHtml = await moderatorPage.text();
    const questionId = /name="questionId" value="([^"]+)"/u.exec(moderatorHtml)?.[1] ?? "";

    expect(questionId).not.toBe("");
    await handleRequest(
      new Request("http://example.com/moderator/approve", {
        method: "POST",
        headers: { "content-type": "application/x-www-form-urlencoded", cookie: moderatorCookie },
        body: new URLSearchParams({ questionId }),
      }),
      env,
    );

    const mcLogin = await handleRequest(
      new Request("http://example.com/mc/login", {
        method: "POST",
        headers: { "content-type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({ passcode: "mc-passcode" }),
      }),
      env,
    );
    const mcCookie = cookieHeaderFromResponse(mcLogin);

    await handleRequest(
      new Request("http://example.com/mc/select", {
        method: "POST",
        headers: { "content-type": "application/x-www-form-urlencoded", cookie: mcCookie },
        body: new URLSearchParams({ questionId }),
      }),
      env,
    );
    const selectedResponse = await handleRequest(new Request("http://example.com/mc", { headers: { cookie: mcCookie } }), env);
    await expect(selectedResponse.text()).resolves.toContain("Live");
    await expect(handleRequest(new Request("http://example.com/screen")).then((response) => response.text())).resolves.toContain(
      "Which standards are ready for production use?",
    );

    const doneResponse = await handleRequest(
      new Request("http://example.com/mc/done", { method: "POST", headers: { cookie: mcCookie } }),
      env,
    );
    expect(doneResponse.headers.get("location")).toBe("/mc");
    await expect(handleRequest(new Request("http://example.com/screen")).then((response) => response.text())).resolves.toContain(
      "Waiting.",
    );

    await handleRequest(
      new Request("http://example.com/moderator", {
        method: "POST",
        headers: { "content-type": "application/x-www-form-urlencoded", cookie: moderatorCookie, "cf-connecting-ip": "198.51.100.2" },
        body: new URLSearchParams({ question: "Moderator seed question for the next panel?" }),
      }),
      env,
    );
    const resetResponse = await handleRequest(
      new Request("http://example.com/moderator/reset", { method: "POST", headers: { cookie: moderatorCookie } }),
      env,
    );
    expect(resetResponse.headers.get("location")).toContain("Panel+reset");
    await expect(handleRequest(new Request("http://example.com/")).then((response) => response.text())).resolves.toContain(
      "No questions yet.",
    );
  });

  it("lets the moderator vote and hide a question", async () => {
    await handleRequest(
      new Request("http://example.com/", {
        method: "POST",
        headers: { "content-type": "application/x-www-form-urlencoded", "cf-connecting-ip": "198.51.100.1" },
        body: new URLSearchParams({ question: "What should be hidden from the public queue?" }),
      }),
    );
    const moderatorLogin = await handleRequest(
      new Request("http://example.com/moderator/login", {
        method: "POST",
        headers: { "content-type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({ passcode: "mod-passcode" }),
      }),
      env,
    );
    const moderatorCookie = cookieHeaderFromResponse(moderatorLogin);
    const moderatorPage = await handleRequest(new Request("http://example.com/moderator", { headers: { cookie: moderatorCookie } }), env);
    const questionId = /name="questionId" value="([^"]+)"/u.exec(await moderatorPage.text())?.[1] ?? "";

    const voteResponse = await handleRequest(
      new Request("http://example.com/moderator/vote", {
        method: "POST",
        headers: { "content-type": "application/x-www-form-urlencoded", cookie: moderatorCookie },
        body: new URLSearchParams({ questionId }),
      }),
      env,
    );
    expect(voteResponse.status).toBe(303);

    const hideResponse = await handleRequest(
      new Request("http://example.com/moderator/hide", {
        method: "POST",
        headers: { "content-type": "application/x-www-form-urlencoded", cookie: moderatorCookie },
        body: new URLSearchParams({ questionId }),
      }),
      env,
    );
    expect(hideResponse.status).toBe(303);
    await expect(handleRequest(new Request("http://example.com/")).then((response) => response.text())).resolves.not.toContain(
      "What should be hidden from the public queue?",
    );

    const missingModeratorRoute = await handleRequest(
      new Request("http://example.com/moderator/missing", { method: "POST", headers: { cookie: moderatorCookie } }),
      env,
    );
    expect(missingModeratorRoute.status).toBe(404);
  });

  it("returns a not found page for unknown routes", async () => {
    const response = await handleRequest(new Request("http://example.com/missing"));

    expect(response.status).toBe(404);
    expect(response.headers.get("cache-control")).toBe("no-store");

    const body = await response.text();
    expect(body).toContain("Not Found");
    expect(body).toContain("/missing");
  });

  it("exposes the same behavior through the worker fetch entrypoint", async () => {
    const response = await worker.fetch(new Request("http://example.com/api/health"));

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({ ok: true });
  });

  it("serves generated styles", async () => {
    const response = await handleRequest(new Request("http://example.com/styles.css"));

    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toContain("text/css");
    expect(response.headers.get("cache-control")).toBe("no-store");
    await expect(response.text()).resolves.toContain("--color-app-canvas:#fff");
  });

  it("serves the generated live-update script", async () => {
    const response = await handleRequest(new Request("http://example.com/panel-live.js"));

    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toBe("text/javascript; charset=utf-8");
    expect(response.headers.get("cache-control")).toBe("no-store");
  });

  it("serves the bundled Finlandica font", async () => {
    const response = await handleRequest(new Request("http://example.com/fonts/FinlandicaHeadline-Regular.ttf"));

    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toBe("font/ttf");
    expect(response.headers.get("cache-control")).toBe("public, max-age=31536000, immutable");
    expect((await response.arrayBuffer()).byteLength).toBeGreaterThan(100_000);
  });
});

function readSetCookies(headers: Headers): string[] {
  const headersWithSetCookie = headers as Headers & { readonly getSetCookie?: () => string[] };
  const setCookies = headersWithSetCookie.getSetCookie?.();

  if (setCookies) {
    return setCookies;
  }

  return (headers.get("set-cookie") ?? "").split(/,\s*(?=[^;,]+=)/u).filter(Boolean);
}

function cookieHeaderFromSetCookies(setCookies: readonly string[]): string {
  return setCookies.map((cookie) => cookie.split(";")[0]).join("; ");
}

function cookieHeaderFromResponse(response: Response): string {
  return cookieHeaderFromSetCookies(readSetCookies(response.headers));
}

function createTestPanelRoom(storage: Map<string, unknown>): PanelRoom {
  return new PanelRoom(
    {
      storage: {
        get: async <T>(key: string): Promise<T | undefined> => storage.get(key) as T | undefined,
        put: async <T>(key: string, value: T): Promise<void> => {
          storage.set(key, value);
        },
      },
    },
    env,
  );
}
