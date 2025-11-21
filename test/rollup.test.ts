import fs from "node:fs";
import path from "node:path";

import { describe, expect, test } from "vitest";
import { rollup as rollupBuild, type Plugin } from "rollup";

import { ValibotCompiler } from "../src/unplugin.js";

describe("unplugin integration (rollup)", () => {
  test("multifile build", async () => {
    const bundle = await rollupBuild({
      input: `${import.meta.dirname}/cases/multifile/Blog.ts`,
      external: ["valibot"],
      plugins: [resolveTs(), ValibotCompiler.rollup({})],
    });

    const { output } = await bundle.write({
      dir: `${import.meta.dirname}/cases/multifile/rollup`,
      format: "esm",
      exports: "auto",
    });

    expect(output.some((chunk) => chunk.type === "chunk")).toBe(true);

    await bundle.close();
  });
});

function resolveTs(): Plugin {
  return {
    name: "resolve-ts",
    resolveId(source, importer) {
      if (!importer || !source.startsWith(".")) return null;
      const basePath = path.resolve(path.dirname(importer), source);
      const tsCandidates = [`${basePath}.ts`, `${basePath}.tsx`];
      for (const candidate of tsCandidates) {
        if (fs.existsSync(candidate)) return candidate;
      }
      return null;
    },
  };
}
