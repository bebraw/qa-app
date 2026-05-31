const pollIntervalMs = 2_000;

interface LiveRegion extends HTMLElement {
  readonly dataset: DOMStringMap & {
    readonly liveSrc?: string;
  };
}

export function startLiveUpdates(root: ParentNode = document): void {
  const regions = [...root.querySelectorAll<LiveRegion>("[data-live-region][data-live-src]")];

  for (const region of regions) {
    void refreshRegion(region);
    globalThis.setInterval(() => {
      void refreshRegion(region);
    }, pollIntervalMs);
  }
}

export async function refreshRegion(region: LiveRegion): Promise<void> {
  const source = region.dataset.liveSrc;

  if (!source || document.hidden) {
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

  if (region.innerHTML !== html) {
    region.innerHTML = html;
  }
}

if (typeof document !== "undefined") {
  startLiveUpdates();
}
