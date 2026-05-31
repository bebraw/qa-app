import finlandicaRegularFont from "./fonts/FinlandicaHeadline-Regular.ttf";
import { createHealthResponse } from "./api/health";
import { exampleRoutes } from "./app-routes";
import {
  createLogoutCookies,
  createRoleCookie,
  getClientIp,
  getOrCreateAttendeeId,
  passcodeMatches,
  readAuthState,
  rolePasscodeConfigured,
  type PanelEnv,
} from "./panel/auth";
import {
  approveQuestion,
  approveWord,
  chooseActiveQuestion,
  clearFailedLoginAttempts,
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
  loadPanelState,
  mergeWord,
  markActiveQuestionDone,
  proposeQuestion,
  recordFailedLoginAttempt,
  resetPanel,
  serializePanelState,
  setPanelMode,
  submitWord,
  voteForQuestion,
  voteForWord,
  wordCloudEnded,
  type PanelMode,
  type SerializedPanelState,
} from "./panel/state";
import { renderNotFoundPage } from "./views/not-found";
import {
  renderAudienceModeContent,
  renderAudiencePage,
  renderAudienceQuestionsContent,
  renderMcQuestionsContent,
  renderMcPage,
  renderModeratorQuestionsContent,
  renderModeratorModeContent,
  renderModeratorWordsContent,
  renderModeratorPage,
  renderScreenPage,
  renderWordScreenContent,
  renderWordScreenPage,
} from "./views/panel";
import { cssResponse, fontResponse, htmlResponse, jsResponse, redirectResponse } from "./views/shared";

interface PanelDurableObjectId {}

interface PanelDurableObjectStub {
  readonly fetch: (request: Request) => Promise<Response>;
}

interface PanelDurableObjectNamespace {
  readonly idFromName: (name: string) => PanelDurableObjectId;
  readonly get: (id: PanelDurableObjectId) => PanelDurableObjectStub;
}

interface DurableObjectStorage {
  readonly get: <T>(key: string) => Promise<T | undefined>;
  readonly put: <T>(key: string, value: T) => Promise<void>;
}

interface DurableObjectState {
  readonly storage: DurableObjectStorage;
}

export interface PanelWorkerEnv extends PanelEnv {
  readonly PANEL_ROOM?: PanelDurableObjectNamespace;
}

const panelStateStorageKey = "panel-state";

export default {
  async fetch(request: Request, env?: PanelWorkerEnv): Promise<Response> {
    return await handleRequest(request, env ?? {});
  },
};

export class PanelRoom {
  private hydrated = false;

  constructor(
    private readonly state: DurableObjectState,
    private readonly env: PanelWorkerEnv,
  ) {}

  async fetch(request: Request): Promise<Response> {
    await this.hydrate();
    const response = await handleRequest(request, this.env, false);

    if (changesPanelState(request)) {
      await this.state.storage.put(panelStateStorageKey, serializePanelState());
    }

    return response;
  }

  private async hydrate(): Promise<void> {
    if (this.hydrated) {
      return;
    }

    loadPanelState(await this.state.storage.get<SerializedPanelState>(panelStateStorageKey));
    this.hydrated = true;
  }
}

export async function handleRequest(request: Request, env: PanelWorkerEnv = {}, routeToDurableObject = true): Promise<Response> {
  const url = new URL(request.url);

  if (url.pathname === "/styles.css") {
    return cssResponse(await loadStylesheet());
  }

  if (url.pathname === "/panel-live.js") {
    return jsResponse(await loadClientScript());
  }

  if (url.pathname === "/fonts/FinlandicaHeadline-Regular.ttf") {
    return fontResponse(await loadFinlandicaFont());
  }

  if (routeToDurableObject && shouldUsePanelRoom(url.pathname, request.method) && env.PANEL_ROOM) {
    return await fetchPanelRoom(request, env.PANEL_ROOM);
  }

  if (request.method === "POST") {
    return await handlePost(request, env);
  }

  const attendee = getOrCreateAttendeeId(request);
  const attendeeCookieHeaders = cookieHeaders(attendee.cookie);

  if (url.pathname === "/") {
    return htmlResponse(
      renderAudiencePage({
        mode: getPanelMode(),
        questions: listAudienceQuestions(attendee.id),
        words: listAudienceWords(attendee.id),
        notice: url.searchParams.get("notice") ?? undefined,
      }),
      200,
      attendeeCookieHeaders,
    );
  }

  if (url.pathname === "/live") {
    return htmlResponse(
      renderAudienceModeContent({
        mode: getPanelMode(),
        questions: listAudienceQuestions(attendee.id),
        words: listAudienceWords(attendee.id),
      }),
    );
  }

  if (url.pathname === "/questions/live") {
    return htmlResponse(renderAudienceQuestionsContent(listAudienceQuestions(attendee.id)));
  }

  if (url.pathname === "/mc") {
    const auth = await readAuthState(request, env);
    return htmlResponse(
      renderMcPage({
        mode: getPanelMode(),
        questions: listMcQuestions(attendee.id),
        words: listAudienceWords(attendee.id),
        wordCloudEnded: wordCloudEnded(),
        auth,
        notice: url.searchParams.get("notice") ?? undefined,
      }),
      200,
      attendeeCookieHeaders,
    );
  }

  if (url.pathname === "/mc/live") {
    const auth = await readAuthState(request, env);

    if (auth.role !== "mc") {
      return htmlResponse("", 403);
    }

    return htmlResponse(renderMcQuestionsContent(listMcQuestions(attendee.id)));
  }

  if (url.pathname === "/moderator") {
    const auth = await readAuthState(request, env);

    return htmlResponse(
      renderModeratorPage({
        mode: getPanelMode(),
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

  if (url.pathname === "/moderator/live") {
    const auth = await readAuthState(request, env);

    if (auth.role !== "moderator") {
      return htmlResponse("", 403);
    }

    return htmlResponse(
      renderModeratorModeContent({
        mode: getPanelMode(),
        questions: listModeratorQuestions(attendee.id),
        words: listModeratorWords(attendee.id),
        wordCloudEnded: wordCloudEnded(),
        auth,
      }),
    );
  }

  if (url.pathname === "/moderator/questions/live") {
    const auth = await readAuthState(request, env);

    if (auth.role !== "moderator") {
      return htmlResponse("", 403);
    }

    return htmlResponse(renderModeratorQuestionsContent(listModeratorQuestions(attendee.id)));
  }

  if (url.pathname === "/moderator/words/live") {
    const auth = await readAuthState(request, env);

    if (auth.role !== "moderator") {
      return htmlResponse("", 403);
    }

    return htmlResponse(renderModeratorWordsContent(listModeratorWords(attendee.id), wordCloudEnded()));
  }

  if (url.pathname === "/screen") {
    return htmlResponse(renderScreenPage(getActivePublicQuestion()));
  }

  if (url.pathname === "/words/screen") {
    return htmlResponse(renderWordScreenPage(listScreenWords()));
  }

  if (url.pathname === "/words/screen/live") {
    return htmlResponse(renderWordScreenContent(listScreenWords()));
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
    const formData = await request.formData();
    const ipAddress = getClientIp(request);

    if (getPanelMode() === "wordcloud") {
      const wordId = getFormValue(formData, "wordId");

      if (wordId) {
        voteForWord({ id: wordId, clientId: attendee.id, ipAddress });
        return redirectResponse("/", cookieHeader);
      }

      const result = submitWord({
        text: getFormValue(formData, "word"),
        clientId: attendee.id,
        ipAddress,
      });
      return redirectResponse(withNotice("/", result.message), cookieHeader);
    }

    const questionId = getFormValue(formData, "questionId");

    if (questionId) {
      voteForQuestion({ id: questionId, clientId: attendee.id, ipAddress });
      return redirectResponse("/", cookieHeader);
    }

    const result = proposeQuestion({
      text: getFormValue(formData, "question"),
      role: "attendee",
      clientId: attendee.id,
      ipAddress,
    });
    return redirectResponse(withNotice("/", result.message), cookieHeader);
  }

  if (url.pathname === "/mc/login") {
    return await login(request, env, "mc", "/mc", cookieHeader);
  }

  if (url.pathname === "/moderator/login") {
    return await login(request, env, "moderator", "/moderator", cookieHeader);
  }

  if (url.pathname === "/logout") {
    const headers = new Headers();
    for (const cookie of createLogoutCookies(isSecureRequest(request))) {
      headers.append("set-cookie", cookie);
    }
    return redirectResponse("/", headers);
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
  const ipAddress = getClientIp(request);

  if (isLoginRateLimited({ role, ipAddress })) {
    return redirectResponse(withNotice(redirectPath, "Please wait before trying again."), headers);
  }

  if (!(await passcodeMatches(role, getFormValue(formData, "passcode"), env))) {
    if (recordFailedLoginAttempt({ role, ipAddress })) {
      return redirectResponse(withNotice(redirectPath, "Please wait before trying again."), headers);
    }

    return redirectResponse(withNotice(redirectPath, "Passcode not accepted."), headers);
  }

  clearFailedLoginAttempts({ role, ipAddress });

  const responseHeaders = new Headers(headers);
  responseHeaders.append("set-cookie", await createRoleCookie(role, env, isSecureRequest(request)));
  return redirectResponse(redirectPath, responseHeaders);
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

  if (url.pathname === "/moderator/approve") {
    const formData = await request.formData();
    approveQuestion(getFormValue(formData, "questionId"));
    return redirectResponse("/moderator", headers);
  }

  if (url.pathname === "/moderator/mode") {
    const formData = await request.formData();
    setPanelMode(readPanelMode(getFormValue(formData, "mode")));
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

function cookieHeaders(cookie: string | undefined): Headers {
  const headers = new Headers();

  if (cookie) {
    headers.append("set-cookie", cookie);
  }

  return headers;
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

async function loadClientScript(): Promise<string> {
  if (typeof process !== "undefined" && process.release?.name === "node") {
    const { readFile } = await import("node:fs/promises");
    return await readFile(new URL("../.generated/panel-live.client.js", import.meta.url), "utf8");
  }

  const script = await import("../.generated/panel-live.client.js");
  return script.default;
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

function shouldUsePanelRoom(pathname: string, method: string): boolean {
  if (method === "POST") {
    return true;
  }

  return (
    pathname === "/" ||
    pathname === "/live" ||
    pathname === "/questions/live" ||
    pathname === "/mc" ||
    pathname === "/mc/live" ||
    pathname === "/moderator" ||
    pathname === "/moderator/live" ||
    pathname === "/moderator/questions/live" ||
    pathname === "/moderator/words/live" ||
    pathname === "/screen" ||
    pathname === "/words/screen" ||
    pathname === "/words/screen/live"
  );
}

function changesPanelState(request: Request): boolean {
  return request.method === "POST";
}

async function fetchPanelRoom(request: Request, namespace: PanelDurableObjectNamespace): Promise<Response> {
  const id = namespace.idFromName("default");
  return await namespace.get(id).fetch(request);
}

function readPanelMode(value: string): PanelMode {
  return value === "wordcloud" ? "wordcloud" : "qa";
}
