import { afterEach, describe, expect, it, vi } from "vitest";
import { refreshRegion, startLiveUpdates } from "./panel-live";

interface TestRegion extends HTMLElement {
  dataset: DOMStringMap & {
    liveSrc?: string;
  };
  innerHTML: string;
}

function createRegion(liveSrc = "/questions/live", innerHTML = "old"): TestRegion {
  return {
    dataset: { liveSrc },
    innerHTML,
  } as TestRegion;
}

describe("panel live updates", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("polls marked live regions immediately and on an interval", async () => {
    const region = createRegion();
    const root = {
      querySelectorAll: vi.fn<ParentNode["querySelectorAll"]>(() => [region] as unknown as NodeListOf<Element>),
    } as unknown as ParentNode;
    const fetch = vi.fn<typeof globalThis.fetch>(async () => new Response("new"));
    const setInterval = vi.fn<typeof globalThis.setInterval>();
    vi.stubGlobal("fetch", fetch);
    vi.stubGlobal("setInterval", setInterval);
    vi.stubGlobal("document", { hidden: false });

    startLiveUpdates(root);

    expect(root.querySelectorAll).toHaveBeenCalledWith("[data-live-region][data-live-src]");
    expect(fetch).toHaveBeenCalledWith("/questions/live", {
      headers: { accept: "text/html" },
      cache: "no-store",
    });
    expect(setInterval).toHaveBeenCalledWith(expect.any(Function), 2_000);
    await vi.waitFor(() => {
      expect(region.innerHTML).toBe("new");
    });
  });

  it("skips hidden documents, missing sources, failed responses, and unchanged HTML", async () => {
    const region = createRegion(undefined, "old");
    const fetch = vi.fn<typeof globalThis.fetch>(async () => new Response("new", { status: 500 }));
    vi.stubGlobal("fetch", fetch);
    vi.stubGlobal("document", { hidden: true });

    await refreshRegion(region);
    expect(fetch).not.toHaveBeenCalled();

    region.dataset.liveSrc = "/questions/live";
    vi.stubGlobal("document", { hidden: false });
    await refreshRegion(region);
    expect(region.innerHTML).toBe("old");

    fetch.mockResolvedValueOnce(new Response("old"));
    let assignmentCount = 0;
    let html = "old";
    Object.defineProperty(region, "innerHTML", {
      get: () => html,
      set: (value: string) => {
        assignmentCount += 1;
        html = value;
      },
    });
    await refreshRegion(region);
    expect(region.innerHTML).toBe("old");
    expect(assignmentCount).toBe(0);
  });

  it("skips regions while focus is inside them", async () => {
    const region = {
      ...createRegion("/moderator/questions/live", "old"),
      contains: vi.fn(() => true),
    } as unknown as TestRegion;
    const activeElement = {} as Element;
    const fetch = vi.fn<typeof globalThis.fetch>(async () => new Response("new"));
    vi.stubGlobal("fetch", fetch);
    vi.stubGlobal("Element", class TestElement {});
    Object.setPrototypeOf(activeElement, Element.prototype);
    vi.stubGlobal("document", { activeElement, hidden: false });

    await refreshRegion(region);

    expect(region.contains).toHaveBeenCalledWith(activeElement);
    expect(fetch).not.toHaveBeenCalled();
  });

  it("uses the interval callback to refresh regions", async () => {
    const region = createRegion();
    const root = {
      querySelectorAll: vi.fn<ParentNode["querySelectorAll"]>(() => [region] as unknown as NodeListOf<Element>),
    } as unknown as ParentNode;
    const fetch = vi.fn<typeof globalThis.fetch>(async () => new Response("interval"));
    const setInterval = vi.fn<typeof globalThis.setInterval>();
    vi.stubGlobal("fetch", fetch);
    vi.stubGlobal("setInterval", setInterval);
    vi.stubGlobal("document", { hidden: false });

    startLiveUpdates(root);
    const callback = setInterval.mock.calls[0]?.[0];
    expect(callback).toEqual(expect.any(Function));
    region.innerHTML = "old";
    if (typeof callback === "function") {
      callback();
    }

    await vi.waitFor(() => {
      expect(region.innerHTML).toBe("interval");
    });
  });
});
