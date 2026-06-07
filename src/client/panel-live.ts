const pollIntervalMs = 2_000;
const eventsPath = "/events";
const panelStateEvent = "panel-state";

interface LiveRegion extends HTMLElement {
  readonly dataset: DOMStringMap & {
    readonly liveSrc?: string;
    readonly liveRefreshWhenFocused?: string;
  };
}

export function startLiveUpdates(root: ParentNode = document): void {
  const regions = [...root.querySelectorAll<LiveRegion>("[data-live-region][data-live-src]")];

  subscribeToPanelEvents(regions);

  for (const region of regions) {
    void refreshRegion(region);
    globalThis.setInterval(() => {
      void refreshRegion(region);
    }, pollIntervalMs);
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
  }
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
