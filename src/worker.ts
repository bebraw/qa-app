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
import { createPanelState, defaultPanelState, type PanelMode, type PanelStateApi, type SerializedPanelState } from "./panel/state";
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
  renderPresentModeContent,
  renderPresentPage,
  renderScreenContent,
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

interface LiveClient {
  readonly writer: WritableStreamDefaultWriter<Uint8Array>;
}

export interface PanelWorkerEnv extends PanelEnv {
  readonly PANEL_ROOM?: PanelDurableObjectNamespace;
}

const panelStateStorageKey = "panel-state";
const panelEventsPath = "/events";
const panelStateEvent = "panel-state";
const encoder = new TextEncoder();

export default {
  async fetch(request: Request, env?: PanelWorkerEnv): Promise<Response> {
    return await handleRequest(request, env ?? {});
  },
};

export class PanelRoom {
  private hydrated = false;
  private readonly liveClients = new Set<LiveClient>();
  private readonly panelState = createPanelState();

  constructor(
    private readonly state: DurableObjectState,
    private readonly env: PanelWorkerEnv,
  ) {}

  async fetch(request: Request): Promise<Response> {
    await this.hydrate();
    const url = new URL(request.url);

    if (url.pathname === panelEventsPath) {
      return await this.createEventsResponse(request);
    }

    const response = await handleRequest(request, this.env, false, this.panelState);

    if (changesPanelState(request)) {
      await this.state.storage.put(panelStateStorageKey, this.panelState.serializePanelState());
      this.broadcastPanelStateChanged();
    }

    return response;
  }

  private createEventsResponse(request: Request): Response {
    const { readable, writable } = new TransformStream<Uint8Array, Uint8Array>();
    const client: LiveClient = { writer: writable.getWriter() };
    this.liveClients.add(client);

    request.signal.addEventListener(
      "abort",
      () => {
        void this.closeLiveClient(client);
      },
      { once: true },
    );

    void this.writeLiveClient(client, ": connected\n\n");

    return new Response(readable, {
      headers: {
        "cache-control": "no-store",
        "content-type": "text/event-stream; charset=utf-8",
      },
    });
  }

  private broadcastPanelStateChanged(): void {
    for (const client of this.liveClients) {
      void this.writeLiveClient(client, `event: ${panelStateEvent}\ndata: changed\n\n`);
    }
  }

  private async writeLiveClient(client: LiveClient, message: string): Promise<void> {
    try {
      await client.writer.write(encoder.encode(message));
    } catch {
      this.liveClients.delete(client);
    }
  }

  private async closeLiveClient(client: LiveClient): Promise<void> {
    this.liveClients.delete(client);

    try {
      await client.writer.close();
    } catch {
      // The browser may already have closed the stream.
    }
  }

  private async hydrate(): Promise<void> {
    if (this.hydrated) {
      return;
    }

    this.panelState.loadPanelState(await this.state.storage.get<SerializedPanelState>(panelStateStorageKey));
    this.hydrated = true;
  }
}

export async function handleRequest(
  request: Request,
  env: PanelWorkerEnv = {},
  routeToDurableObject = true,
  panelState: PanelStateApi = defaultPanelState,
): Promise<Response> {
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

  if (url.pathname === panelEventsPath) {
    return new Response(null, { status: 204, headers: { "cache-control": "no-store" } });
  }

  if (request.method === "POST") {
    return await handlePost(request, env, panelState);
  }

  const attendee = getOrCreateAttendeeId(request);
  const attendeeCookieHeaders = cookieHeaders(attendee.cookie);

  if (url.pathname === "/") {
    return htmlResponse(
      renderAudiencePage({
        mode: panelState.getPanelMode(),
        questions: panelState.listAudienceQuestions(attendee.id),
        words: panelState.listAudienceWords(attendee.id),
        wordPrompt: getVisibleWordPrompt(panelState),
        notice: url.searchParams.get("notice") ?? undefined,
      }),
      200,
      attendeeCookieHeaders,
    );
  }

  if (url.pathname === "/live") {
    return htmlResponse(
      renderAudienceModeContent({
        mode: panelState.getPanelMode(),
        questions: panelState.listAudienceQuestions(attendee.id),
        words: panelState.listAudienceWords(attendee.id),
        wordPrompt: getVisibleWordPrompt(panelState),
      }),
    );
  }

  if (url.pathname === "/questions/live") {
    return htmlResponse(renderAudienceQuestionsContent(panelState.listAudienceQuestions(attendee.id)));
  }

  if (url.pathname === "/present") {
    return htmlResponse(
      renderPresentPage({
        mode: panelState.getPanelMode(),
        questions: panelState.listAudienceQuestions(""),
        words: panelState.listAudienceWords(""),
        wordPrompt: getVisibleWordPrompt(panelState),
      }),
    );
  }

  if (url.pathname === "/present/live") {
    return htmlResponse(
      renderPresentModeContent({
        mode: panelState.getPanelMode(),
        questions: panelState.listAudienceQuestions(""),
        words: panelState.listAudienceWords(""),
        wordPrompt: getVisibleWordPrompt(panelState),
      }),
    );
  }

  if (url.pathname === "/mc") {
    const auth = await readAuthState(request, env);
    return htmlResponse(
      renderMcPage({
        mode: panelState.getPanelMode(),
        questions: panelState.listMcQuestions(attendee.id),
        words: panelState.listAudienceWords(attendee.id),
        wordPrompt: getVisibleWordPrompt(panelState),
        wordCloudEnded: panelState.wordCloudEnded(),
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

    return htmlResponse(renderMcQuestionsContent(panelState.listMcQuestions(attendee.id)));
  }

  if (url.pathname === "/moderate") {
    const auth = await readAuthState(request, env);

    return htmlResponse(
      renderModeratorPage({
        mode: panelState.getPanelMode(),
        questions: panelState.listModeratorQuestions(attendee.id),
        words: panelState.listModeratorWords(attendee.id),
        wordPrompt: panelState.getWordPrompt(),
        wordCloudEnded: panelState.wordCloudEnded(),
        auth,
        notice: url.searchParams.get("notice") ?? undefined,
      }),
      200,
      attendeeCookieHeaders,
    );
  }

  if (url.pathname === "/moderate/live") {
    const auth = await readAuthState(request, env);

    if (auth.role !== "moderator") {
      return htmlResponse("", 403);
    }

    return htmlResponse(
      renderModeratorModeContent({
        mode: panelState.getPanelMode(),
        questions: panelState.listModeratorQuestions(attendee.id),
        words: panelState.listModeratorWords(attendee.id),
        wordPrompt: panelState.getWordPrompt(),
        wordCloudEnded: panelState.wordCloudEnded(),
        auth,
      }),
    );
  }

  if (url.pathname === "/moderate/questions/live") {
    const auth = await readAuthState(request, env);

    if (auth.role !== "moderator") {
      return htmlResponse("", 403);
    }

    return htmlResponse(renderModeratorQuestionsContent(panelState.listModeratorQuestions(attendee.id)));
  }

  if (url.pathname === "/moderate/words/live") {
    const auth = await readAuthState(request, env);

    if (auth.role !== "moderator") {
      return htmlResponse("", 403);
    }

    return htmlResponse(renderModeratorWordsContent(panelState.listModeratorWords(attendee.id), panelState.wordCloudEnded()));
  }

  if (url.pathname === "/screen") {
    return htmlResponse(renderScreenPage(panelState.getActivePublicQuestion()));
  }

  if (url.pathname === "/screen/live") {
    return htmlResponse(renderScreenContent(panelState.getActivePublicQuestion()));
  }

  if (url.pathname === "/words/screen") {
    return htmlResponse(renderWordScreenPage(panelState.listScreenWords(), getVisibleWordPrompt(panelState)));
  }

  if (url.pathname === "/words/screen/live") {
    return htmlResponse(renderWordScreenContent(panelState.listScreenWords(), getVisibleWordPrompt(panelState)));
  }

  if (url.pathname === "/api/health") {
    return createHealthResponse(exampleRoutes.map((route) => route.path));
  }

  return htmlResponse(renderNotFoundPage(url.pathname), 404);
}

async function handlePost(request: Request, env: PanelEnv, panelState: PanelStateApi): Promise<Response> {
  const url = new URL(request.url);
  const attendee = getOrCreateAttendeeId(request);
  const cookieHeader = cookieHeaders(attendee.cookie);

  if (url.pathname === "/") {
    const formData = await request.formData();
    const ipAddress = getClientIp(request);

    if (panelState.getPanelMode() === "wordcloud") {
      const wordId = getFormValue(formData, "wordId");

      if (wordId) {
        panelState.voteForWord({ id: wordId, clientId: attendee.id, ipAddress });
        return redirectResponse("/", cookieHeader);
      }

      const result = panelState.submitWord({
        text: getFormValue(formData, "word"),
        clientId: attendee.id,
        ipAddress,
      });
      return redirectResponse(withNotice("/", result.message), cookieHeader);
    }

    const questionId = getFormValue(formData, "questionId");

    if (questionId) {
      panelState.voteForQuestion({ id: questionId, clientId: attendee.id, ipAddress });
      return redirectResponse("/", cookieHeader);
    }

    const result = panelState.proposeQuestion({
      text: getFormValue(formData, "question"),
      role: "attendee",
      clientId: attendee.id,
      ipAddress,
    });
    return redirectResponse(withNotice("/", result.message), cookieHeader);
  }

  if (url.pathname === "/mc/login") {
    return await login(request, env, panelState, "mc", "/mc", cookieHeader);
  }

  if (url.pathname === "/moderate/login") {
    return await login(request, env, panelState, "moderator", "/moderate", cookieHeader);
  }

  if (url.pathname === "/logout") {
    const headers = new Headers();
    for (const cookie of createLogoutCookies(isSecureRequest(request))) {
      headers.append("set-cookie", cookie);
    }
    return redirectResponse("/", headers);
  }

  if (url.pathname.startsWith("/mc/")) {
    return await handleMcAction(request, env, panelState, cookieHeader);
  }

  if (url.pathname === "/moderate" || url.pathname.startsWith("/moderate/")) {
    return await handleModeratorAction(request, env, panelState, attendee.id, cookieHeader);
  }

  return htmlResponse(renderNotFoundPage(url.pathname), 404);
}

async function login(
  request: Request,
  env: PanelEnv,
  panelState: PanelStateApi,
  role: "mc" | "moderator",
  redirectPath: string,
  headers: HeadersInit,
): Promise<Response> {
  if (!rolePasscodeConfigured(role, env)) {
    return redirectResponse(withNotice(redirectPath, "Role access is not configured."), headers);
  }

  const formData = await request.formData();
  const ipAddress = getClientIp(request);

  if (panelState.isLoginRateLimited({ role, ipAddress })) {
    return redirectResponse(withNotice(redirectPath, "Please wait before trying again."), headers);
  }

  if (!(await passcodeMatches(role, getFormValue(formData, "passcode"), env))) {
    if (panelState.recordFailedLoginAttempt({ role, ipAddress })) {
      return redirectResponse(withNotice(redirectPath, "Please wait before trying again."), headers);
    }

    return redirectResponse(withNotice(redirectPath, "Passcode not accepted."), headers);
  }

  panelState.clearFailedLoginAttempts({ role, ipAddress });

  const responseHeaders = new Headers(headers);
  responseHeaders.append("set-cookie", await createRoleCookie(role, env, isSecureRequest(request)));
  return redirectResponse(redirectPath, responseHeaders);
}

async function handleMcAction(request: Request, env: PanelEnv, panelState: PanelStateApi, headers: HeadersInit): Promise<Response> {
  const auth = await readAuthState(request, env);

  if (auth.role !== "mc") {
    return redirectResponse(withNotice("/mc", "Sign in first."), headers);
  }

  const url = new URL(request.url);

  if (url.pathname === "/mc/select") {
    const formData = await request.formData();
    panelState.chooseActiveQuestion(getFormValue(formData, "questionId"));
    return redirectResponse("/mc", headers);
  }

  if (url.pathname === "/mc/done") {
    panelState.markActiveQuestionDone();
    return redirectResponse("/mc", headers);
  }

  return htmlResponse(renderNotFoundPage(url.pathname), 404);
}

async function handleModeratorAction(
  request: Request,
  env: PanelEnv,
  panelState: PanelStateApi,
  attendeeId: string,
  headers: HeadersInit,
): Promise<Response> {
  const auth = await readAuthState(request, env);

  if (auth.role !== "moderator") {
    return redirectResponse(withNotice("/moderate", "Sign in first."), headers);
  }

  const url = new URL(request.url);

  if (url.pathname === "/moderate") {
    const result = panelState.proposeQuestion({
      text: getFormValue(await request.formData(), "question"),
      role: "moderator",
      clientId: attendeeId,
      ipAddress: getClientIp(request),
    });
    return redirectResponse(withNotice("/moderate", result.message), headers);
  }

  if (url.pathname === "/moderate/vote") {
    const formData = await request.formData();
    panelState.voteForQuestion({
      id: getFormValue(formData, "questionId"),
      clientId: attendeeId,
      ipAddress: getClientIp(request),
    });
    return redirectResponse("/moderate", headers);
  }

  if (url.pathname === "/moderate/hide") {
    const formData = await request.formData();
    panelState.hideQuestion(getFormValue(formData, "questionId"));
    return redirectResponse("/moderate", headers);
  }

  if (url.pathname === "/moderate/approve") {
    const formData = await request.formData();
    panelState.approveQuestion(getFormValue(formData, "questionId"));
    return redirectResponse("/moderate", headers);
  }

  if (url.pathname === "/moderate/edit") {
    const formData = await request.formData();
    const result = panelState.editQuestion(getFormValue(formData, "questionId"), getFormValue(formData, "question"));
    return redirectResponse(withNotice("/moderate", result.message), headers);
  }

  if (url.pathname === "/moderate/mode") {
    const formData = await request.formData();
    panelState.setPanelMode(readPanelMode(getFormValue(formData, "mode")));
    return redirectResponse("/moderate", headers);
  }

  if (url.pathname === "/moderate/words/approve") {
    const formData = await request.formData();
    panelState.approveWord(getFormValue(formData, "wordId"));
    return redirectResponse("/moderate", headers);
  }

  if (url.pathname === "/moderate/words/vote") {
    const formData = await request.formData();
    panelState.voteForWord({
      id: getFormValue(formData, "wordId"),
      clientId: attendeeId,
      ipAddress: getClientIp(request),
    });
    return redirectResponse("/moderate", headers);
  }

  if (url.pathname === "/moderate/words/hide") {
    const formData = await request.formData();
    panelState.hideWord(getFormValue(formData, "wordId"));
    return redirectResponse("/moderate", headers);
  }

  if (url.pathname === "/moderate/words/merge") {
    const formData = await request.formData();
    panelState.mergeWord(getFormValue(formData, "wordId"), getFormValue(formData, "target"));
    return redirectResponse("/moderate", headers);
  }

  if (url.pathname === "/moderate/words/prompt") {
    const formData = await request.formData();
    panelState.setWordPrompt(getFormValue(formData, "prompt"));
    return redirectResponse(withNotice("/moderate", "Word question set."), headers);
  }

  if (url.pathname === "/moderate/words/end") {
    panelState.endWordCloud();
    return redirectResponse(withNotice("/moderate", "Word cloud ended."), headers);
  }

  if (url.pathname === "/moderate/reset") {
    panelState.resetPanel();
    return redirectResponse(withNotice("/moderate", "Panel reset."), headers);
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
    pathname === panelEventsPath ||
    pathname === "/live" ||
    pathname === "/questions/live" ||
    pathname === "/present" ||
    pathname === "/present/live" ||
    pathname === "/mc" ||
    pathname === "/mc/live" ||
    pathname === "/moderate" ||
    pathname === "/moderate/live" ||
    pathname === "/moderate/questions/live" ||
    pathname === "/moderate/words/live" ||
    pathname === "/screen" ||
    pathname === "/screen/live" ||
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

function getVisibleWordPrompt(panelState: PanelStateApi): string {
  return panelState.wordCloudEnded() ? "" : panelState.getWordPrompt();
}
