import { beforeEach, describe, expect, it } from "vitest";
import type { PanelEnv } from "./panel/auth";
import { clearPanelStateForTests } from "./panel/state";
import worker, { handleRequest } from "./worker";
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
    expect(submitResponse.headers.get("location")).toContain("Question+added");

    const pageResponse = await handleRequest(new Request("http://example.com/"));
    const page = await pageResponse.text();
    expect(page).toContain("What does durable frontend architecture mean in practice?");
    expect(page).toContain("+1");

    const questionId = /name="questionId" value="([^"]+)"/u.exec(page)?.[1] ?? "";
    const attendeeCookie = pageResponse.headers.get("set-cookie") ?? "";
    const voteResponse = await handleRequest(
      new Request("http://example.com/vote", {
        method: "POST",
        headers: { "content-type": "application/x-www-form-urlencoded", cookie: attendeeCookie },
        body: new URLSearchParams({ questionId }),
      }),
    );
    expect(voteResponse.status).toBe(303);
    expect(voteResponse.headers.get("location")).toBe("/");
    await expect(
      handleRequest(new Request("http://example.com/", { headers: { cookie: attendeeCookie } })).then((response) => response.text()),
    ).resolves.toContain("Voted");
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
      routes: ["/", "/mc", "/moderator", "/screen", "/api/health"],
    });
  });

  it("protects MC and moderator views with signed passcode cookies", async () => {
    const protectedMcResponse = await handleRequest(new Request("http://example.com/mc"), env);
    await expect(protectedMcResponse.text()).resolves.toContain("Enter the panel passcode.");

    const loginResponse = await handleRequest(
      new Request("http://example.com/mc/login", {
        method: "POST",
        headers: { "content-type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({ passcode: "mc-passcode" }),
      }),
      env,
    );
    const authCookie = loginResponse.headers.get("set-cookie") ?? "";

    expect(loginResponse.status).toBe(303);
    expect(loginResponse.headers.get("location")).toBe("/mc");
    expect(authCookie).toContain("panel_auth=");
    expect(authCookie).not.toContain("Secure");

    const secureLoginResponse = await handleRequest(
      new Request("https://example.com/mc/login", {
        method: "POST",
        headers: { "content-type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({ passcode: "mc-passcode" }),
      }),
      env,
    );
    expect(secureLoginResponse.headers.get("set-cookie")).toContain("Secure");

    const mcResponse = await handleRequest(new Request("http://example.com/mc", { headers: { cookie: authCookie } }), env);
    await expect(mcResponse.text()).resolves.toContain("Panel queue");

    const logoutResponse = await handleRequest(
      new Request("http://example.com/logout", { method: "POST", headers: { cookie: authCookie } }),
      env,
    );
    expect(logoutResponse.headers.get("location")).toBe("/");
    expect(logoutResponse.headers.get("set-cookie")).toContain("Max-Age=0");
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
    const moderatorCookie = moderatorLogin.headers.get("set-cookie") ?? "";
    const moderatorPage = await handleRequest(new Request("http://example.com/moderator", { headers: { cookie: moderatorCookie } }), env);
    const moderatorHtml = await moderatorPage.text();
    const questionId = /name="questionId" value="([^"]+)"/u.exec(moderatorHtml)?.[1] ?? "";

    expect(questionId).not.toBe("");

    const mcLogin = await handleRequest(
      new Request("http://example.com/mc/login", {
        method: "POST",
        headers: { "content-type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({ passcode: "mc-passcode" }),
      }),
      env,
    );
    const mcCookie = mcLogin.headers.get("set-cookie") ?? "";

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
      "Questions will appear here.",
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
    const moderatorCookie = moderatorLogin.headers.get("set-cookie") ?? "";
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
    await expect(response.text()).resolves.toContain("--color-app-canvas:#f3eee6");
  });
});
