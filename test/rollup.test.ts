import fs from "node:fs";
import path from "node:path";

import { describe, expect, test } from "vitest";
import {
  type OutputChunk,
  rollup as rollupBuild,
  type Plugin,
} from "rollup";

import { ValibotCompiler } from "../src/unplugin.js";

describe("unplugin integration (rollup)", () => {
  test("multifile build", async () => {
    const outDir = `${import.meta.dirname}/cases/multifile/rollup`;
    fs.rmSync(outDir, { recursive: true, force: true });

    const bundle = await rollupBuild({
      input: `${import.meta.dirname}/cases/multifile/Blog.ts`,
      external: ["valibot"],
      plugins: [resolveTs(), ValibotCompiler.rollup({})],
    });

    const { output } = await bundle.write({
      dir: outDir,
      format: "esm",
      exports: "auto",
    });

    const blogChunk = output.find(
      (chunk): chunk is OutputChunk =>
        chunk.type === "chunk" &&
        typeof chunk.facadeModuleId === "string" &&
        chunk.facadeModuleId.endsWith("Blog.ts"),
    );
    expect(blogChunk).toBeTruthy();
    if (blogChunk) {
      expect(blogChunk.code).toContain("String__");
      expect(blogChunk.code).toContain("Pipe__");
      expect(blogChunk.code).not.toContain("v.string(");
      expect(blogChunk.code).not.toContain("v.nanoid(");
    }

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
