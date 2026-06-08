import { afterEach, describe, expect, it, vi } from "vitest";
import { bindLiveActionForms, bindQuestionValidation, bindSubmitOnEnter, refreshRegion, startLiveUpdates } from "./panel-live";

interface TestRegion extends HTMLElement {
  dataset: DOMStringMap & {
    liveSrc?: string;
    liveRefreshWhenFocused?: string;
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

  it("refreshes regions when the durable object event stream emits a state change", async () => {
    const region = createRegion();
    const root = {
      querySelectorAll: vi.fn<ParentNode["querySelectorAll"]>(() => [region] as unknown as NodeListOf<Element>),
    } as unknown as ParentNode;
    const listeners = new Map<string, EventListenerOrEventListenerObject>();
    const EventSource = vi.fn(function TestEventSource(this: EventSource, url: string) {
      expect(url).toBe("/events");
      Object.assign(this, {
        addEventListener: vi.fn((event: string, listener: EventListenerOrEventListenerObject) => {
          listeners.set(event, listener);
        }),
      });
    });
    const fetch = vi
      .fn<typeof globalThis.fetch>()
      .mockResolvedValueOnce(new Response("initial"))
      .mockResolvedValueOnce(new Response("pushed"));
    vi.stubGlobal("fetch", fetch);
    vi.stubGlobal("setInterval", vi.fn<typeof globalThis.setInterval>());
    vi.stubGlobal("document", { hidden: false });
    vi.stubGlobal("EventSource", EventSource);

    startLiveUpdates(root);
    await vi.waitFor(() => {
      expect(region.innerHTML).toBe("initial");
    });

    const listener = listeners.get("panel-state");
    expect(listener).toEqual(expect.any(Function));
    if (typeof listener === "function") {
      listener(new Event("panel-state"));
    }

    await vi.waitFor(() => {
      expect(region.innerHTML).toBe("pushed");
    });
    expect(fetch).toHaveBeenCalledTimes(2);
  });

  it("keeps polling when event streams are unavailable", async () => {
    const root = {
      querySelectorAll: vi.fn<ParentNode["querySelectorAll"]>(() => [createRegion()] as unknown as NodeListOf<Element>),
    } as unknown as ParentNode;
    const setInterval = vi.fn<typeof globalThis.setInterval>();
    vi.stubGlobal(
      "fetch",
      vi.fn<typeof globalThis.fetch>(async () => new Response("new")),
    );
    vi.stubGlobal("setInterval", setInterval);
    vi.stubGlobal("document", { hidden: false });
    vi.stubGlobal("EventSource", undefined);

    startLiveUpdates(root);

    expect(setInterval).toHaveBeenCalledWith(expect.any(Function), 2_000);
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

  it("preserves a rendered notice when replacing a live region with notice-free HTML", async () => {
    const notice = {
      cloneNode: vi.fn(() => ({ outerHTML: '<p data-live-notice="true">Question is too short.</p>' })),
    };
    const nextRoot = {
      firstChild: {},
      innerHTML: "<form>new</form>",
      querySelector: vi.fn(() => null),
      insertBefore: vi.fn((node: { outerHTML: string }) => {
        nextRoot.innerHTML = `${node.outerHTML}${nextRoot.innerHTML}`;
      }),
    };
    const region = {
      ...createRegion("/live", '<p data-live-notice="true">Question is too short.</p><form>old</form>'),
      querySelector: vi.fn(() => notice),
    } as unknown as TestRegion;
    const DOMParser = vi.fn(function TestDOMParser(this: DOMParser) {
      Object.assign(this, {
        parseFromString: vi.fn(() => ({ body: { firstElementChild: nextRoot } })),
      });
    });
    vi.stubGlobal("DOMParser", DOMParser);
    vi.stubGlobal(
      "fetch",
      vi.fn<typeof globalThis.fetch>(async () => new Response("<form>new</form>")),
    );
    vi.stubGlobal("document", { hidden: false });

    await refreshRegion(region);

    expect(region.querySelector).toHaveBeenCalledWith("[data-live-notice]");
    expect(nextRoot.querySelector).toHaveBeenCalledWith("[data-live-notice]");
    expect(notice.cloneNode).toHaveBeenCalledWith(true);
    expect(region.innerHTML).toBe('<p data-live-notice="true">Question is too short.</p><form>new</form>');
  });

  it("binds inserted form behavior after a live refresh", async () => {
    const textarea = {
      addEventListener: vi.fn(),
    };
    const actionForm = {
      addEventListener: vi.fn(),
    };
    const region = {
      ...createRegion("/live", "old"),
      querySelectorAll: vi.fn((selector: string) => {
        if (selector === "textarea[data-submit-on-enter]") {
          return [textarea];
        }

        if (selector === "form[data-live-action-form]") {
          return [actionForm];
        }

        return [];
      }),
    } as unknown as TestRegion;
    vi.stubGlobal(
      "fetch",
      vi.fn<typeof globalThis.fetch>(async () => new Response("<form>new</form>")),
    );
    vi.stubGlobal("document", { hidden: false });

    await refreshRegion(region);

    expect(region.innerHTML).toBe("<form>new</form>");
    expect(region.querySelectorAll).toHaveBeenCalledWith("textarea[data-submit-on-enter]");
    expect(textarea.addEventListener).toHaveBeenCalledWith("keydown", expect.any(Function));
    expect(region.querySelectorAll).toHaveBeenCalledWith("form[data-live-action-form]");
    expect(actionForm.addEventListener).toHaveBeenCalledWith("submit", expect.any(Function));
  });

  it("posts live action forms and refreshes live regions without navigation", async () => {
    let submitListener: EventListener | undefined;
    const region = createRegion("/questions/live", "old");

    class TestForm {
      readonly method = "post";
      readonly action = "/";
      submit = vi.fn();

      addEventListener(event: string, listener: EventListener): void {
        if (event === "submit") {
          submitListener = listener;
        }
      }

      getAttribute(name: string): string | null {
        return name === "action" ? "/" : null;
      }
    }

    class TestFormData {
      constructor(readonly form: TestForm) {}
    }

    const form = new TestForm();
    const root = {
      querySelectorAll: vi.fn<ParentNode["querySelectorAll"]>(() => [form] as unknown as NodeListOf<Element>),
    } as unknown as ParentNode;
    const document = {
      activeElement: {},
      hidden: false,
      querySelectorAll: vi.fn<ParentNode["querySelectorAll"]>(() => [region] as unknown as NodeListOf<Element>),
    };
    const fetch = vi.fn<typeof globalThis.fetch>().mockResolvedValueOnce(new Response("")).mockResolvedValueOnce(new Response("new votes"));

    vi.stubGlobal("HTMLFormElement", TestForm);
    vi.stubGlobal("FormData", TestFormData);
    vi.stubGlobal("fetch", fetch);
    vi.stubGlobal("document", document);

    bindLiveActionForms(root);

    expect(root.querySelectorAll).toHaveBeenCalledWith("form[data-live-action-form]");
    expect(submitListener).toEqual(expect.any(Function));

    const preventDefault = vi.fn();
    submitListener?.({
      currentTarget: form,
      preventDefault,
    } as unknown as Event);

    await vi.waitFor(() => {
      expect(region.innerHTML).toBe("new votes");
    });
    expect(preventDefault).toHaveBeenCalled();
    expect(fetch).toHaveBeenNthCalledWith(1, "/", {
      method: "post",
      body: expect.any(TestFormData),
      credentials: "same-origin",
      headers: { accept: "text/html" },
      cache: "no-store",
    });
    expect(fetch).toHaveBeenNthCalledWith(2, "/questions/live", {
      headers: { accept: "text/html" },
      cache: "no-store",
    });
    expect(form.submit).not.toHaveBeenCalled();
  });

  it("falls back to normal action form submission when live actions fail", async () => {
    let submitListener: EventListener | undefined;

    class TestForm {
      readonly method = "post";
      readonly action = "/";
      submit = vi.fn();

      addEventListener(_event: string, listener: EventListener): void {
        submitListener = listener;
      }

      getAttribute(name: string): string | null {
        return name === "action" ? "/" : null;
      }
    }

    class TestFormData {
      constructor(readonly form: TestForm) {}
    }

    const form = new TestForm();
    const root = {
      querySelectorAll: vi.fn<ParentNode["querySelectorAll"]>(() => [form] as unknown as NodeListOf<Element>),
    } as unknown as ParentNode;
    const document = {
      querySelectorAll: vi.fn<ParentNode["querySelectorAll"]>(() => [] as unknown as NodeListOf<Element>),
    };

    vi.stubGlobal("HTMLFormElement", TestForm);
    vi.stubGlobal("FormData", TestFormData);
    vi.stubGlobal(
      "fetch",
      vi.fn<typeof globalThis.fetch>(async () => new Response("", { status: 500 })),
    );
    vi.stubGlobal("document", document);

    bindLiveActionForms(root);

    const preventDefault = vi.fn();
    submitListener?.({
      currentTarget: form,
      preventDefault,
    } as unknown as Event);

    await vi.waitFor(() => {
      expect(form.submit).toHaveBeenCalledTimes(1);
    });
    expect(preventDefault).toHaveBeenCalled();
    expect(document.querySelectorAll).not.toHaveBeenCalled();
  });

  it("shows a local notice instead of submitting too-short questions", () => {
    let submitListener: EventListener | undefined;
    const textarea = { value: "Too" };
    const notices: TestElement[] = [];

    class TestElement {
      className = "";
      dataset: Record<string, string> = {};
      textContent = "";

      remove(): void {
        notices.pop();
      }
    }

    class TestForm extends TestElement {
      override readonly dataset = { minimumQuestionLength: "8" };
      previousElementSibling: TestElement | null = null;
      readonly ownerDocument = {
        createElement: vi.fn(() => new TestElement()),
      };

      addEventListener(event: string, listener: EventListener): void {
        if (event === "submit") {
          submitListener = listener;
        }
      }

      before(notice: TestElement): void {
        notices.push(notice);
        this.previousElementSibling = notice;
      }

      querySelector(selector: string): typeof textarea | null {
        return selector === 'textarea[name="question"]' ? textarea : null;
      }
    }

    const form = new TestForm();
    const root = {
      querySelectorAll: vi.fn<ParentNode["querySelectorAll"]>(() => [form] as unknown as NodeListOf<Element>),
    } as unknown as ParentNode;
    vi.stubGlobal("HTMLFormElement", TestForm);
    vi.stubGlobal("HTMLElement", TestElement);

    bindQuestionValidation(root);

    expect(root.querySelectorAll).toHaveBeenCalledWith("form[data-question-form]");
    expect(submitListener).toEqual(expect.any(Function));

    const preventDefault = vi.fn();
    submitListener?.({
      currentTarget: form,
      preventDefault,
    } as unknown as Event);

    expect(preventDefault).toHaveBeenCalled();
    expect(form.ownerDocument.createElement).toHaveBeenCalledWith("p");
    expect(notices[0]?.dataset).toMatchObject({ liveNotice: "true", localNotice: "true" });
    expect(notices[0]?.textContent).toBe("Question is too short.");

    textarea.value = "What now?";
    submitListener?.({
      currentTarget: form,
      preventDefault,
    } as unknown as Event);

    expect(preventDefault).toHaveBeenCalledTimes(1);
    expect(notices).toHaveLength(0);
  });

  it("reuses an existing live notice for repeated too-short questions", () => {
    let submitListener: EventListener | undefined;
    const textarea = { value: "Too" };

    class TestElement {
      dataset: Record<string, string> = {};
      textContent = "";

      querySelector(_selector: string): unknown | null {
        return null;
      }
    }

    const existingNotice = new TestElement();
    existingNotice.dataset.liveNotice = "true";
    existingNotice.textContent = "Question is too short.";

    class TestRegion extends TestElement {
      override querySelector(selector: string): TestElement | null {
        return selector === "[data-live-notice]" || selector === "[data-live-notice][data-local-notice]" ? existingNotice : null;
      }
    }

    class TestForm extends TestElement {
      override readonly dataset = { minimumQuestionLength: "8" };
      previousElementSibling = new TestElement();
      parentElement = new TestRegion();
      readonly ownerDocument = {
        createElement: vi.fn(() => new TestElement()),
      };

      addEventListener(event: string, listener: EventListener): void {
        if (event === "submit") {
          submitListener = listener;
        }
      }

      before(): void {
        throw new Error("repeated short submissions should reuse the existing notice");
      }

      closest(selector: string): TestRegion | null {
        return selector === "[data-live-region]" ? this.parentElement : null;
      }

      override querySelector(selector: string): typeof textarea | null {
        return selector === 'textarea[name="question"]' ? textarea : null;
      }
    }

    const form = new TestForm();
    const root = {
      querySelectorAll: vi.fn<ParentNode["querySelectorAll"]>(() => [form] as unknown as NodeListOf<Element>),
    } as unknown as ParentNode;
    vi.stubGlobal("HTMLFormElement", TestForm);
    vi.stubGlobal("HTMLElement", TestElement);

    bindQuestionValidation(root);

    const preventDefault = vi.fn();
    submitListener?.({
      currentTarget: form,
      preventDefault,
    } as unknown as Event);
    submitListener?.({
      currentTarget: form,
      preventDefault,
    } as unknown as Event);

    expect(preventDefault).toHaveBeenCalledTimes(2);
    expect(form.ownerDocument.createElement).not.toHaveBeenCalled();
    expect(existingNotice.dataset).toMatchObject({ liveNotice: "true", localNotice: "true" });
    expect(existingNotice.textContent).toBe("Question is too short.");
  });

  it("skips regions while focus is inside them", async () => {
    const region = {
      ...createRegion("/moderate/questions/live", "old"),
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

  it("refreshes focused regions that opt in", async () => {
    const region = {
      ...createRegion("/mc/live", "old"),
      contains: vi.fn(() => true),
    } as unknown as TestRegion;
    region.dataset.liveRefreshWhenFocused = "true";
    const activeElement = {} as Element;
    const fetch = vi.fn<typeof globalThis.fetch>(async () => new Response("new"));
    vi.stubGlobal("fetch", fetch);
    vi.stubGlobal("Element", class TestElement {});
    Object.setPrototypeOf(activeElement, Element.prototype);
    vi.stubGlobal("document", { activeElement, hidden: false });

    await refreshRegion(region);

    expect(region.contains).not.toHaveBeenCalled();
    expect(fetch).toHaveBeenCalledWith("/mc/live", {
      headers: { accept: "text/html" },
      cache: "no-store",
    });
    expect(region.innerHTML).toBe("new");
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

  it("submits question textareas on plain Enter and preserves modified Enter keys", () => {
    const form = {
      requestSubmit: vi.fn(),
      submit: vi.fn(),
    };
    let keydownListener: EventListener | undefined;
    class TestTextArea {
      readonly form = form;

      addEventListener(event: string, listener: EventListener): void {
        if (event === "keydown") {
          keydownListener = listener;
        }
      }
    }
    const textarea = new TestTextArea();
    const root = {
      querySelectorAll: vi.fn<ParentNode["querySelectorAll"]>(() => [textarea] as unknown as NodeListOf<Element>),
    } as unknown as ParentNode;
    vi.stubGlobal("HTMLTextAreaElement", TestTextArea);

    bindSubmitOnEnter(root);

    expect(root.querySelectorAll).toHaveBeenCalledWith("textarea[data-submit-on-enter]");
    expect(keydownListener).toEqual(expect.any(Function));

    const preventDefault = vi.fn();
    keydownListener?.({
      altKey: false,
      ctrlKey: false,
      currentTarget: textarea,
      isComposing: false,
      key: "Enter",
      metaKey: false,
      preventDefault,
      shiftKey: false,
    } as unknown as Event);

    expect(preventDefault).toHaveBeenCalled();
    expect(form.requestSubmit).toHaveBeenCalledTimes(1);
    expect(form.submit).not.toHaveBeenCalled();

    keydownListener?.({
      altKey: false,
      ctrlKey: false,
      currentTarget: textarea,
      isComposing: false,
      key: "Enter",
      metaKey: false,
      preventDefault,
      shiftKey: true,
    } as unknown as Event);

    expect(form.requestSubmit).toHaveBeenCalledTimes(1);
  });
});
