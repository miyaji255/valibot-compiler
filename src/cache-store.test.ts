import { describe, expect, test } from "vitest";

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
  test("returns null when no entries are registered", () => {
    const store = new CacheStore(CACHE_MODULE_ID);

    expect(store.getModuleSource("Missing__id")).toBeNull();
  });

  test("serializes a single entry with its dependencies", () => {
    const store = new CacheStore(CACHE_MODULE_ID);
    store.register([
      entry({
        key: "number",
        identifier: "Number__def",
        callee: "number",
        expression: "number(String__abc)",
        dependencies: ["String__abc"],
      }),
      entry({
        key: "string",
        identifier: "String__abc",
        callee: "string",
        expression: "string()",
      }),
    ]);

    expect(store.getModuleSource("Number__def")).toMatchInlineSnapshot(`
      "import { number } from "valibot";
import String__abc from "valibot-compiler:cache/String__abc";

export default number(String__abc);
"
    `);
  });

  test("resets internal state", () => {
    const store = new CacheStore(CACHE_MODULE_ID);
    store.register([entry({ key: "a", identifier: "A" })]);

    store.reset();
    expect(store.getModuleSource("A")).toBeNull();
  });
});
