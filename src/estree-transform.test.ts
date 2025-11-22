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

    expect(result.code).toContain(
      `import ${stringEntry.identifier} from "${CACHE_ID}/${stringEntry.identifier}";`,
    );
    expect(result.code).toContain(
      `import ${numberEntry.identifier} from "${CACHE_ID}/${numberEntry.identifier}";`,
    );
    expect(result.code).toContain(
      `const username = ${stringEntry.identifier};`,
    );
    expect(result.code).toContain(`return ${numberEntry.identifier};`);
    expect(result.map).not.toBeNull();
    expect(result.code).toMatchInlineSnapshot(`
      "
      import { string, number } from "valibot";
      import String__2db2ebb4 from "valibot-compiler:cache/String__2db2ebb4";
      import Number__c7ca7cc6 from "valibot-compiler:cache/Number__c7ca7cc6";

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

  test("caches calls that reference const valibot schemas", () => {
    const source = `
import { array, object, string } from "valibot";

const Comment = object({ body: string() });
const Blog = object({ comments: array(Comment) });
`;

    const result = runTransform(source);

    const objectEntry = result.cacheEntries.find(
      (entry) => entry.callee === "object",
    );
    const arrayEntry = result.cacheEntries.find(
      (entry) => entry.callee === "array",
    );

    expect(objectEntry).toBeDefined();
    expect(arrayEntry).toBeDefined();
    expect(arrayEntry?.dependencies).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          kind: "cache",
          identifier: objectEntry?.identifier,
        }),
      ]),
    );
  });

  test("imports identifier dependencies from other modules", () => {
    const source = `
import { array } from "valibot";
import { Comment } from "./comment";

export const Blog = array(Comment);
`;

    const result = runTransform(source);

    expect(result.changed).toBe(true);
    expect(result.cacheEntries).toHaveLength(1);
    const [arrayEntry] = result.cacheEntries;
    expect(arrayEntry.dependencies).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          kind: "import",
          source: "./comment",
          imported: "Comment",
          local: "Comment",
        }),
      ]),
    );
    expect(result.code).toContain("Blog = Array__");
  });

  test("keeps imported identifiers inside object arguments", () => {
    const source = `
import { object } from "valibot";
import { User } from "./user";

export const Blog = object({
  author: User,
});
`;

    const result = runTransform(source);

    expect(result.changed).toBe(true);
    const [objectEntry] = result.cacheEntries;
    expect(objectEntry.dependencies).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          kind: "import",
          source: "./user",
          imported: "User",
          local: "User",
        }),
      ]),
    );
    expect(result.code).toContain("Blog = Object__");
  });

  test("caches transform/check with pure inline functions", () => {
    const source = `
import { string, transform, check } from "valibot";

const base = string();
export const trimmed = transform(base, (value) => value.trim());
export const nonEmpty = check(base, (value) => value.length > 0, "empty");
`;

    const result = runTransform(source);

    expect(result.changed).toBe(true);
    const stringEntry = result.cacheEntries.find(
      (entry) => entry.callee === "string",
    );
    const transformEntry = result.cacheEntries.find(
      (entry) => entry.callee === "transform",
    );
    const checkEntry = result.cacheEntries.find(
      (entry) => entry.callee === "check",
    );

    expect(stringEntry).toBeDefined();
    expect(transformEntry?.dependencies).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          kind: "cache",
          identifier: stringEntry?.identifier,
        }),
      ]),
    );
    expect(checkEntry?.dependencies).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          kind: "cache",
          identifier: stringEntry?.identifier,
        }),
      ]),
    );

    expect(result.code).toContain("trimmed = Transform__");
    expect(result.code).toContain("nonEmpty = Check__");
  });

  test("caches transform with global function identifier", () => {
    const source = `
import * as v from "valibot";

export const t = v.transform(String);
`;

    const result = runTransform(source);

    expect(result.changed).toBe(true);
    const transformEntry = result.cacheEntries.find(
      (entry) => entry.callee === "transform",
    );
    expect(transformEntry).toBeDefined();
    expect(transformEntry?.dependencies).toEqual([]);
    expect(result.code).toContain("t = Transform__");
  });

  test("caches transform with nested member access in callback", () => {
    const source = `
import { transform, object, string, array } from "valibot";

const Comment = object({ articleId: string() });
const Article = object({
  articleId: string(),
  comments: array(Comment),
});

export const validated = transform(
  Article,
  (article) => article.comments.every((comment) => comment.articleId === article.articleId),
);
`;

    const result = runTransform(source);

    expect(result.changed).toBe(true);
    const transformEntry = result.cacheEntries.find(
      (entry) => entry.callee === "transform",
    );
    expect(transformEntry).toBeDefined();
    expect(transformEntry?.dependencies).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          kind: "cache",
        }),
      ]),
    );
    expect(result.code).toContain("validated = Transform__");
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
