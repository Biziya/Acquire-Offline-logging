import { afterAll, beforeAll } from "vitest";

/*
 * jsdom does no layout, so every element measures 0 × 0 and a virtualized
 * table would render no rows. Give elements a desktop-sized box for the
 * duration of the calling test file.
 */
export function stubDesktopViewport(width = 1280, height = 600) {
  const original = {
    width: Object.getOwnPropertyDescriptor(HTMLElement.prototype, "offsetWidth"),
    height: Object.getOwnPropertyDescriptor(HTMLElement.prototype, "offsetHeight"),
  };

  beforeAll(() => {
    Object.defineProperty(HTMLElement.prototype, "offsetWidth", {
      configurable: true,
      get: () => width,
    });
    Object.defineProperty(HTMLElement.prototype, "offsetHeight", {
      configurable: true,
      get: () => height,
    });
  });

  afterAll(() => {
    if (original.width)
      Object.defineProperty(HTMLElement.prototype, "offsetWidth", original.width);
    if (original.height)
      Object.defineProperty(HTMLElement.prototype, "offsetHeight", original.height);
  });
}
