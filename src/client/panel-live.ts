const pollIntervalMs = 2_000;
const eventsPath = "/events";
const panelStateEvent = "panel-state";
const enterSubmitTextareas = new WeakSet<HTMLTextAreaElement>();

interface LiveRegion extends HTMLElement {
  readonly dataset: DOMStringMap & {
    readonly liveSrc?: string;
    readonly liveRefreshWhenFocused?: string;
  };
}

export function startLiveUpdates(root: ParentNode = document): void {
  bindSubmitOnEnter(root);

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
