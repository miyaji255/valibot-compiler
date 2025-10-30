import type { AstNode } from "rollup";
import { createUnplugin } from "unplugin";
import type { AstNode as UnionAstNode } from "./estree-transform.js";
import { transformWithEstree } from "./estree-transform.js";

export interface ValibotCompilerOptions {
  exts?: string[];
}

function shouldProcess(id: string, exts: string[]): boolean {
  return exts.some((ext) => id.endsWith(ext));
}

export const ValibotCompiler = createUnplugin(
  (options: ValibotCompilerOptions = {}) => {
    const exts = options.exts ?? [
      ".ts",
      ".tsx",
      ".mts",
      ".cts",
      ".js",
      ".jsx",
      ".mjs",
      ".cjs",
    ];

    return {
      name: "unplugin-valibot-compiler",
      enforce: "pre",
      transform: {
        filter: new RegExp(
          `(${exts.map((e) => e.replaceAll(/(?=(\^|\$|\\|\.|\*|\+|\(|\)|\[|\]|\{|\}|\|))/g, "\\")).join("|")})$`,
          "g",
        ),
        handler: function (code, id) {
          let ast: AstNode;
          try {
            ast = this.parse(code);
          } catch (error) {
            this.warn?.(
              `[valibot-compiler] Failed to parse ${id}: ${
                error instanceof Error ? error.message : String(error)
              }`,
            );
            return null;
          }
          const result = transformWithEstree(code, ast as UnionAstNode);
          if (!result.changed) return null;
          return { code: result.code, map: null };
        },
      },
    };
  },
);

export const rollup = ValibotCompiler.rollup;
export const vite = ValibotCompiler.vite;
export const webpack = ValibotCompiler.webpack;
export const esbuild = ValibotCompiler.esbuild;

export default ValibotCompiler;
