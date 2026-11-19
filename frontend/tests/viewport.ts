import { afterAll, beforeAll } from "vitest";

/*
 * jsdom does no layout, so every element measures 0 × 0 and a virtualized
 * table would render no rows. Give elements a desktop-sized box for the
 * duration of the calling test file.
 *
 * jsdom also cannot scroll: `scrollTop` stays 0 and `scrollTo` is missing.
 * Both are given a simple stand-in here (the value is kept per element and a
 * `scroll` event fires), so a virtualized table can be scrolled to a row.
 */
export function stubDesktopViewport(width = 1280, height = 600) {
  const keys = ["offsetWidth", "offsetHeight", "clientHeight", "scrollHeight", "scrollTop", "scrollTo"] as const;
  const original = new Map(
    keys.map((key) => [key, Object.getOwnPropertyDescriptor(HTMLElement.prototype, key)]),
  );
  const offsets = new WeakMap<HTMLElement, number>();

  function setScrollTop(element: HTMLElement, value: number) {
    const next = Math.max(0, value);
    if (offsets.get(element) === next) return;
    offsets.set(element, next);
    element.dispatchEvent(new Event("scroll"));
  }

  beforeAll(() => {
    Object.defineProperty(HTMLElement.prototype, "offsetWidth", {
      configurable: true,
      get: () => width,
    });
    Object.defineProperty(HTMLElement.prototype, "offsetHeight", {
      configurable: true,
      get: () => height,
    });
    Object.defineProperty(HTMLElement.prototype, "clientHeight", {
      configurable: true,
      get: () => height,
    });
    // Content height is unknown without layout: large enough for any table.
    Object.defineProperty(HTMLElement.prototype, "scrollHeight", {
      configurable: true,
      get: () => 1_000_000,
    });
    Object.defineProperty(HTMLElement.prototype, "scrollTop", {
      configurable: true,
      get(this: HTMLElement) {
        return offsets.get(this) ?? 0;
      },
      set(this: HTMLElement, value: number) {
        setScrollTop(this, value);
      },
    });
    Object.defineProperty(HTMLElement.prototype, "scrollTo", {
      configurable: true,
      writable: true,
      value(this: HTMLElement, options?: ScrollToOptions | number, y?: number) {
        const top = typeof options === "object" ? options.top : y;
        if (top !== undefined) setScrollTop(this, top);
      },
    });
  });

  afterAll(() => {
    keys.forEach((key) => {
      const descriptor = original.get(key);
      if (descriptor) Object.defineProperty(HTMLElement.prototype, key, descriptor);
      else Reflect.deleteProperty(HTMLElement.prototype, key);
    });
  });
}
