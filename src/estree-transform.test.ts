import { describe, expect, test } from "vitest";
import {
  type AstNode,
  type TransformOut,
  transformWithEstree,
} from "./estree-transform.js";
import { parseAst } from "rollup/dist/shared/parseAst.js";

const CACHE_ID = "valibot-compiler:cache";

function parseToAst(code: string): AstNode {
  // parseAst mirrors the plugin context `this.parse` behavior and preserves start/end offsets
  return parseAst(code);
}

function runTransform(code: string): TransformOut {
  const ast = parseToAst(code);
  return transformWithEstree(code, ast, {
    cacheModuleId: CACHE_ID,
    sourceId: "input.ts",
  });
}

describe("transformWithEstree", () => {
  test("collects valibot calls and rewrites them to cache identifiers", () => {
    const source = `
import { string, number } from "valibot";
const username = string({ message: "required" });
function build() {
  return number();
}
`;

    const result = runTransform(source);

    expect(result.changed).toBe(true);
    expect(result.cacheEntries).toHaveLength(2);

    const [stringEntry, numberEntry] = result.cacheEntries;
    expect(stringEntry.callee).toBe("string");
    expect(numberEntry.callee).toBe("number");

    const expectedImport = `import { ${stringEntry.identifier}, ${numberEntry.identifier} } from "${CACHE_ID}";`;
    expect(result.code).toContain(expectedImport);
    expect(result.code).toContain(
      `const username = ${stringEntry.identifier};`,
    );
    expect(result.code).toContain(`return ${numberEntry.identifier};`);
    expect(result.map).not.toBeNull();
    expect(result.code).toMatchInlineSnapshot(`
      "
      import { string, number } from "valibot";import { String__2db2ebb4, Number__c7ca7cc6 } from "valibot-compiler:cache";

      const username = String__2db2ebb4;
      function build() {
        return Number__c7ca7cc6;
      }
      "
    `);
  });

  test("skips transformation when valibot imports are shadowed", () => {
    const source = `
import { string } from "valibot";
const string = () => "shadowed";
const result = string();
`;

    const result = runTransform(source);

    expect(result.changed).toBe(false);
    expect(result.cacheEntries).toHaveLength(0);
    expect(result.code).toBe(source);
  });

  test("returns unchanged when no valibot imports exist", () => {
    const source = `
const value = 1;
function square(x) {
  return x * x;
}
`;

    const result = runTransform(source);

    expect(result.changed).toBe(false);
    expect(result.cacheEntries).toHaveLength(0);
    expect(result.code).toBe(source);
  });
});
