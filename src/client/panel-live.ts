const pollIntervalMs = 2_000;
const eventsPath = "/events";
const panelStateEvent = "panel-state";
const enterSubmitTextareas = new WeakSet<HTMLTextAreaElement>();
const validatedQuestionForms = new WeakSet<HTMLFormElement>();
const liveNoticeClass = "rounded-lg border border-app-line bg-white px-4 py-3 text-sm font-semibold text-app-text-soft shadow-panel";

interface LiveRegion extends HTMLElement {
  readonly dataset: DOMStringMap & {
    readonly liveSrc?: string;
    readonly liveRefreshWhenFocused?: string;
  };
}

export function startLiveUpdates(root: ParentNode = document): void {
  bindSubmitOnEnter(root);
  bindQuestionValidation(root);

  const regions = [...root.querySelectorAll<LiveRegion>("[data-live-region][data-live-src]")];

  subscribeToPanelEvents(regions);

  for (const region of regions) {
    void refreshRegion(region);
    globalThis.setInterval(() => {
      void refreshRegion(region);
    }, pollIntervalMs);
  }
}

export function bindSubmitOnEnter(root: ParentNode = document): void {
  if (typeof root.querySelectorAll !== "function") {
    return;
  }

  const textareas = [...root.querySelectorAll<HTMLTextAreaElement>("textarea[data-submit-on-enter]")];

  for (const textarea of textareas) {
    if (typeof textarea.addEventListener !== "function" || enterSubmitTextareas.has(textarea)) {
      continue;
    }

    textarea.addEventListener("keydown", submitFormOnEnter);
    enterSubmitTextareas.add(textarea);
  }
}

export async function refreshRegion(region: LiveRegion): Promise<void> {
  const source = region.dataset.liveSrc;

  if (!source || document.hidden || shouldPreserveFocusedRegion(region)) {
    return;
  }

  const response = await fetch(source, {
    headers: { accept: "text/html" },
    cache: "no-store",
  });

  if (!response.ok) {
    return;
  }

  const html = await response.text();
  const nextHtml = preserveLiveNotice(region, html);

  if (region.innerHTML !== nextHtml) {
    region.innerHTML = nextHtml;
    bindSubmitOnEnter(region);
    bindQuestionValidation(region);
  }
}

export function bindQuestionValidation(root: ParentNode = document): void {
  if (typeof root.querySelectorAll !== "function") {
    return;
  }

  const forms = [...root.querySelectorAll<HTMLFormElement>("form[data-question-form]")];

  for (const form of forms) {
    if (typeof form.addEventListener !== "function" || validatedQuestionForms.has(form)) {
      continue;
    }

    form.addEventListener("submit", validateQuestionForm);
    validatedQuestionForms.add(form);
  }
}

function submitFormOnEnter(event: KeyboardEvent): void {
  if (event.key !== "Enter" || event.shiftKey || event.altKey || event.ctrlKey || event.metaKey || event.isComposing) {
    return;
  }

  event.preventDefault();
  const target = event.currentTarget;

  if (typeof HTMLTextAreaElement === "undefined" || !(target instanceof HTMLTextAreaElement)) {
    return;
  }

  const form = target.form;

  if (!form) {
    return;
  }

  if (typeof form.requestSubmit === "function") {
    form.requestSubmit();
    return;
  }

  form.submit();
}

function validateQuestionForm(event: SubmitEvent): void {
  const target = event.currentTarget;

  if (typeof HTMLFormElement === "undefined" || !(target instanceof HTMLFormElement)) {
    return;
  }

  const textarea = target.querySelector<HTMLTextAreaElement>('textarea[name="question"]');
  const minimumLength = Number.parseInt(target.dataset.minimumQuestionLength ?? "", 10);

  if (!textarea || !Number.isFinite(minimumLength) || normalizeQuestionText(textarea.value).length >= minimumLength) {
    removeLocalNotice(target);
    return;
  }

  event.preventDefault();
  renderLocalNotice(target, "Question is too short.");
}

function renderLocalNotice(form: HTMLFormElement, message: string): void {
  const existingNotice = findReusableNotice(form);
  if (existingNotice) {
    existingNotice.dataset.liveNotice = "true";
    existingNotice.dataset.localNotice = "true";
    existingNotice.textContent = message;
    return;
  }

  const notice = form.ownerDocument.createElement("p");
  notice.className = liveNoticeClass;
  notice.dataset.liveNotice = "true";
  notice.dataset.localNotice = "true";
  notice.textContent = message;
  form.before(notice);
}

function removeLocalNotice(form: HTMLFormElement): void {
  findLocalNotice(form)?.remove();
}

function findReusableNotice(form: HTMLFormElement): HTMLElement | null {
  return findLocalNotice(form) ?? findScopedNotice(form, "[data-live-notice]");
}

function findLocalNotice(form: HTMLFormElement): HTMLElement | null {
  if (typeof HTMLElement === "undefined") {
    return null;
  }

  const previousElement = form.previousElementSibling;
  if (previousElement instanceof HTMLElement && previousElement.dataset.localNotice === "true") {
    return previousElement;
  }

  return findScopedNotice(form, "[data-live-notice][data-local-notice]");
}

function findScopedNotice(form: HTMLFormElement, selector: string): HTMLElement | null {
  if (typeof HTMLElement === "undefined") {
    return null;
  }

  const scope = typeof form.closest === "function" ? (form.closest("[data-live-region]") ?? form.parentElement) : form.parentElement;
  const notice = scope?.querySelector(selector);

  return notice instanceof HTMLElement ? notice : null;
}

function normalizeQuestionText(text: string): string {
  return text.replaceAll(/\s+/g, " ").trim();
}

if (typeof document !== "undefined") {
  startLiveUpdates();
}

function subscribeToPanelEvents(regions: readonly LiveRegion[]): void {
  if (regions.length === 0 || typeof EventSource === "undefined") {
    return;
  }

  const events = new EventSource(eventsPath);
  events.addEventListener(panelStateEvent, () => {
    refreshRegions(regions);
  });
}

function refreshRegions(regions: readonly LiveRegion[]): void {
  for (const region of regions) {
    void refreshRegion(region);
  }
}

function focusedWithin(region: LiveRegion): boolean {
  if (typeof Element === "undefined") {
    return false;
  }

  const activeElement = document.activeElement;
  return activeElement instanceof Element && region.contains(activeElement);
}

function shouldPreserveFocusedRegion(region: LiveRegion): boolean {
  return region.dataset.liveRefreshWhenFocused !== "true" && focusedWithin(region);
}

function preserveLiveNotice(region: LiveRegion, html: string): string {
  if (typeof DOMParser === "undefined") {
    return html;
  }

  const currentNotice = region.querySelector("[data-live-notice]");
  if (!currentNotice) {
    return html;
  }

  const parser = new DOMParser();
  const nextDocument = parser.parseFromString(`<section>${html}</section>`, "text/html");
  const nextRoot = nextDocument.body.firstElementChild;

  if (!nextRoot || nextRoot.querySelector("[data-live-notice]")) {
    return html;
  }

  nextRoot.insertBefore(currentNotice.cloneNode(true), nextRoot.firstChild);
  return nextRoot.innerHTML;
}
