import { describe, expect, test, vi } from "vitest";
import { build } from "esbuild";

import { ValibotCompiler } from "../src/unplugin.js";

describe("unplugin integration", () => {
  test("multifile build", async () => {
    const res = await build({
      entryPoints: [`${import.meta.dirname}/cases/multifile/Blog.ts`],
      bundle: true,
      format: "esm",
      external: ["valibot"],
      outdir: `${import.meta.dirname}/cases/multifile/esbuild`,
      plugins: [ValibotCompiler.esbuild({})],
    });
  });
});
