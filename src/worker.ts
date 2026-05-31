import finlandicaRegularFont from "./fonts/FinlandicaHeadline-Regular.ttf";
import { createHealthResponse } from "./api/health";
import { exampleRoutes } from "./app-routes";
import {
  createLogoutCookie,
  createRoleCookie,
  getClientIp,
  getOrCreateAttendeeId,
  passcodeMatches,
  readAuthState,
  rolePasscodeConfigured,
  type PanelEnv,
} from "./panel/auth";
import {
  approveWord,
  chooseActiveQuestion,
  endWordCloud,
  getActivePublicQuestion,
  hideQuestion,
  hideWord,
  listAudienceQuestions,
  listAudienceWords,
  listMcQuestions,
  listModeratorQuestions,
  listModeratorWords,
  listScreenWords,
  mergeWord,
  markActiveQuestionDone,
  proposeQuestion,
  resetPanel,
  submitWord,
  voteForQuestion,
  voteForWord,
  wordCloudEnded,
} from "./panel/state";
import { renderNotFoundPage } from "./views/not-found";
import {
  renderAudiencePage,
  renderMcPage,
  renderModeratorPage,
  renderScreenPage,
  renderWordPage,
  renderWordScreenPage,
} from "./views/panel";
import { cssResponse, fontResponse, htmlResponse, redirectResponse } from "./views/shared";

export default {
  async fetch(request: Request, env?: PanelEnv): Promise<Response> {
    return await handleRequest(request, env ?? {});
  },
};

export async function handleRequest(request: Request, env: PanelEnv = {}): Promise<Response> {
  const url = new URL(request.url);

  if (url.pathname === "/styles.css") {
    return cssResponse(await loadStylesheet());
  }

  if (url.pathname === "/fonts/FinlandicaHeadline-Regular.ttf") {
    return fontResponse(await loadFinlandicaFont());
  }

  if (request.method === "POST") {
    return await handlePost(request, env);
  }

  const attendee = getOrCreateAttendeeId(request);
  const attendeeCookieHeaders = cookieHeaders(attendee.cookie);

  if (url.pathname === "/") {
    return htmlResponse(
      renderAudiencePage({ questions: listAudienceQuestions(attendee.id), notice: url.searchParams.get("notice") ?? undefined }),
      200,
      attendeeCookieHeaders,
    );
  }

  if (url.pathname === "/words") {
    return htmlResponse(
      renderWordPage({ words: listAudienceWords(attendee.id), notice: url.searchParams.get("notice") ?? undefined }),
      200,
      attendeeCookieHeaders,
    );
  }

  if (url.pathname === "/mc") {
    const auth = await readAuthState(request, env);
    return htmlResponse(
      renderMcPage({ questions: listMcQuestions(attendee.id), auth, notice: url.searchParams.get("notice") ?? undefined }),
      200,
      attendeeCookieHeaders,
    );
  }

  if (url.pathname === "/moderator") {
    const auth = await readAuthState(request, env);
    return htmlResponse(
      renderModeratorPage({
        questions: listModeratorQuestions(attendee.id),
        words: listModeratorWords(attendee.id),
        wordCloudEnded: wordCloudEnded(),
        auth,
        notice: url.searchParams.get("notice") ?? undefined,
      }),
      200,
      attendeeCookieHeaders,
    );
  }

  if (url.pathname === "/screen") {
    return htmlResponse(renderScreenPage(getActivePublicQuestion()));
  }

  if (url.pathname === "/words/screen") {
    return htmlResponse(renderWordScreenPage(listScreenWords()));
  }

  if (url.pathname === "/api/health") {
    return createHealthResponse(exampleRoutes.map((route) => route.path));
  }

  return htmlResponse(renderNotFoundPage(url.pathname), 404);
}

async function handlePost(request: Request, env: PanelEnv): Promise<Response> {
  const url = new URL(request.url);
  const attendee = getOrCreateAttendeeId(request);
  const cookieHeader = cookieHeaders(attendee.cookie);

  if (url.pathname === "/") {
    const result = proposeQuestion({
      text: getFormValue(await request.formData(), "question"),
      role: "attendee",
      clientId: attendee.id,
      ipAddress: getClientIp(request),
    });
    return redirectResponse(withNotice("/", result.message), cookieHeader);
  }

  if (url.pathname === "/words") {
    const result = submitWord({
      text: getFormValue(await request.formData(), "word"),
      clientId: attendee.id,
      ipAddress: getClientIp(request),
    });
    return redirectResponse(withNotice("/words", result.message), cookieHeader);
  }

  if (url.pathname === "/words/vote") {
    const formData = await request.formData();
    voteForWord({
      id: getFormValue(formData, "wordId"),
      clientId: attendee.id,
      ipAddress: getClientIp(request),
    });
    return redirectResponse("/words", cookieHeader);
  }

  if (url.pathname === "/vote") {
    const formData = await request.formData();
    voteForQuestion({
      id: getFormValue(formData, "questionId"),
      clientId: attendee.id,
      ipAddress: getClientIp(request),
    });
    return redirectResponse("/", cookieHeader);
  }

  if (url.pathname === "/mc/login") {
    return await login(request, env, "mc", "/mc", cookieHeader);
  }

  if (url.pathname === "/moderator/login") {
    return await login(request, env, "moderator", "/moderator", cookieHeader);
  }

  if (url.pathname === "/logout") {
    return redirectResponse("/", { "set-cookie": createLogoutCookie(isSecureRequest(request)) });
  }

  if (url.pathname.startsWith("/mc/")) {
    return await handleMcAction(request, env, cookieHeader);
  }

  if (url.pathname === "/moderator" || url.pathname.startsWith("/moderator/")) {
    return await handleModeratorAction(request, env, attendee.id, cookieHeader);
  }

  return htmlResponse(renderNotFoundPage(url.pathname), 404);
}

async function login(
  request: Request,
  env: PanelEnv,
  role: "mc" | "moderator",
  redirectPath: string,
  headers: HeadersInit,
): Promise<Response> {
  if (!rolePasscodeConfigured(role, env)) {
    return redirectResponse(withNotice(redirectPath, "Role access is not configured."), headers);
  }

  const formData = await request.formData();

  if (!(await passcodeMatches(role, getFormValue(formData, "passcode"), env))) {
    return redirectResponse(withNotice(redirectPath, "Passcode not accepted."), headers);
  }

  return redirectResponse(redirectPath, {
    ...headers,
    "set-cookie": await createRoleCookie(role, env, isSecureRequest(request)),
  });
}

async function handleMcAction(request: Request, env: PanelEnv, headers: HeadersInit): Promise<Response> {
  const auth = await readAuthState(request, env);

  if (auth.role !== "mc") {
    return redirectResponse(withNotice("/mc", "Sign in first."), headers);
  }

  const url = new URL(request.url);

  if (url.pathname === "/mc/select") {
    const formData = await request.formData();
    chooseActiveQuestion(getFormValue(formData, "questionId"));
    return redirectResponse("/mc", headers);
  }

  if (url.pathname === "/mc/done") {
    markActiveQuestionDone();
    return redirectResponse("/mc", headers);
  }

  return htmlResponse(renderNotFoundPage(url.pathname), 404);
}

async function handleModeratorAction(request: Request, env: PanelEnv, attendeeId: string, headers: HeadersInit): Promise<Response> {
  const auth = await readAuthState(request, env);

  if (auth.role !== "moderator") {
    return redirectResponse(withNotice("/moderator", "Sign in first."), headers);
  }

  const url = new URL(request.url);

  if (url.pathname === "/moderator") {
    const result = proposeQuestion({
      text: getFormValue(await request.formData(), "question"),
      role: "moderator",
      clientId: attendeeId,
      ipAddress: getClientIp(request),
    });
    return redirectResponse(withNotice("/moderator", result.message), headers);
  }

  if (url.pathname === "/moderator/vote") {
    const formData = await request.formData();
    voteForQuestion({
      id: getFormValue(formData, "questionId"),
      clientId: attendeeId,
      ipAddress: getClientIp(request),
    });
    return redirectResponse("/moderator", headers);
  }

  if (url.pathname === "/moderator/hide") {
    const formData = await request.formData();
    hideQuestion(getFormValue(formData, "questionId"));
    return redirectResponse("/moderator", headers);
  }

  if (url.pathname === "/moderator/words/approve") {
    const formData = await request.formData();
    approveWord(getFormValue(formData, "wordId"));
    return redirectResponse("/moderator", headers);
  }

  if (url.pathname === "/moderator/words/vote") {
    const formData = await request.formData();
    voteForWord({
      id: getFormValue(formData, "wordId"),
      clientId: attendeeId,
      ipAddress: getClientIp(request),
    });
    return redirectResponse("/moderator", headers);
  }

  if (url.pathname === "/moderator/words/hide") {
    const formData = await request.formData();
    hideWord(getFormValue(formData, "wordId"));
    return redirectResponse("/moderator", headers);
  }

  if (url.pathname === "/moderator/words/merge") {
    const formData = await request.formData();
    mergeWord(getFormValue(formData, "wordId"), getFormValue(formData, "target"));
    return redirectResponse("/moderator", headers);
  }

  if (url.pathname === "/moderator/words/end") {
    endWordCloud();
    return redirectResponse(withNotice("/moderator", "Word cloud ended."), headers);
  }

  if (url.pathname === "/moderator/reset") {
    resetPanel();
    return redirectResponse(withNotice("/moderator", "Panel reset."), headers);
  }

  return htmlResponse(renderNotFoundPage(url.pathname), 404);
}

function getFormValue(formData: FormData, name: string): string {
  const value = formData.get(name);
  return typeof value === "string" ? value : "";
}

function withNotice(path: string, notice: string): string {
  const url = new URL(path, "http://local");
  url.searchParams.set("notice", notice);
  return `${url.pathname}${url.search}`;
}

function cookieHeaders(cookie: string | undefined): HeadersInit {
  return cookie ? { "set-cookie": cookie } : {};
}

function isSecureRequest(request: Request): boolean {
  return new URL(request.url).protocol === "https:";
}

async function loadStylesheet(): Promise<string> {
  // Stryker disable next-line ConditionalExpression,OptionalChaining: Environment probe selects Node fs in tests and bundled CSS in Workers.
  if (typeof process !== "undefined" && process.release?.name === "node") {
    const { readFile } = await import("node:fs/promises");
    return await readFile(new URL("../.generated/styles.css", import.meta.url), "utf8");
  }

  const styles = await import("../.generated/styles.css");
  return styles.default;
}

async function loadFinlandicaFont(): Promise<ArrayBuffer> {
  if (finlandicaRegularFont instanceof ArrayBuffer) {
    return finlandicaRegularFont;
  }

  // Vitest resolves non-code assets as file paths; Wrangler's Data rule bundles the font as an ArrayBuffer.
  if (typeof process !== "undefined" && process.release?.name === "node") {
    const { readFile } = await import("node:fs/promises");
    const font = await readFile(new URL("./fonts/FinlandicaHeadline-Regular.ttf", import.meta.url));
    return font.buffer.slice(font.byteOffset, font.byteOffset + font.byteLength);
  }

  throw new Error("Finlandica font asset was not bundled.");
}
