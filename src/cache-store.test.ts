import { describe, expect, test, vi } from "vitest";

import { CACHE_MODULE_ID, CacheStore } from "./cache-store.js";
import type { CacheModuleEntry } from "./estree-transform.js";

const entry = (
  overrides: Partial<CacheModuleEntry> = {},
): CacheModuleEntry => ({
  key: overrides.key ?? "k",
  identifier: overrides.identifier ?? "Id",
  callee: overrides.callee ?? "string",
  expression: overrides.expression ?? "string()",
  dependencies: overrides.dependencies ?? [],
});

describe("CacheStore", () => {
  test("returns an empty module when no entries are registered", () => {
    const store = new CacheStore(CACHE_MODULE_ID);

    expect(store.toModuleSource()).toMatchInlineSnapshot(`
      "// Generated valibot cache
      export {}
      "
    `);
  });

  test("serializes entries in dependency order with sorted imports", () => {
    const store = new CacheStore(CACHE_MODULE_ID);
    const first = entry({
      key: "string",
      identifier: "String__abc",
      callee: "string",
      expression: "string()",
    });
    const second = entry({
      key: "number",
      identifier: "Number__def",
      callee: "number",
      expression: "number(String__abc)",
      dependencies: ["String__abc"],
    });

    // Register out of dependency order to validate topo sort
    store.register([second, first], { invalidate: vi.fn() });

    expect(store.toModuleSource()).toMatchInlineSnapshot(`
      "import { number, string } from "valibot";

      export const String__abc = string();
      export const Number__def = number(String__abc);
      "
    `);
  });

  test("invalidates the cache module when already loaded and new entries arrive", () => {
    const invalidate = vi.fn();
    const store = new CacheStore(CACHE_MODULE_ID);
    store.register([entry({ key: "a", identifier: "A" })], { invalidate });

    store.markLoaded();
    store.register([entry({ key: "b", identifier: "B" })], { invalidate });

    expect(invalidate).toHaveBeenCalledTimes(1);
    expect(invalidate).toHaveBeenCalledWith("valibot-compiler:cache");
  });

  test("resets internal state including load flag", () => {
    const invalidate = vi.fn();
    const store = new CacheStore(CACHE_MODULE_ID);
    store.register([entry({ key: "a", identifier: "A" })], { invalidate });
    store.markLoaded();

    store.reset();
    store.register([entry({ key: "b", identifier: "B" })], { invalidate });

    expect(invalidate).not.toHaveBeenCalled();
    expect(store.toModuleSource()).toMatchInlineSnapshot(`
      "import { string } from "valibot";

      export const B = string();
      "
    `);
  });
});
