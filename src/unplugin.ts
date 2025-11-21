import type { AstNode } from "rollup";
import { createUnplugin } from "unplugin";
import type { AstNode as UnionAstNode } from "./estree-transform.js";
import { transformWithEstree } from "./estree-transform.js";
import { CACHE_MODULE_ID, CacheStore } from "./cache-store.js";
export interface ValibotCompilerOptions {
  exts?: string[];
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
    const cacheStore = new CacheStore(CACHE_MODULE_ID);

    return {
      name: "unplugin-valibot-compiler",
      enforce: "pre",
      buildStart() {
        cacheStore.reset();
      },
      resolveId(id: string) {
        if (id === CACHE_MODULE_ID) {
          return id;
        }
        return null;
      },
      load(id: string) {
        if (id !== CACHE_MODULE_ID) return null;
        cacheStore.markLoaded();
        return cacheStore.toModuleSource();
      },
      transform: {
        filter: {
          id: new RegExp(
            `(${exts.map((e) => e.replaceAll(/(?=(\^|\$|\\|\.|\*|\+|\(|\)|\[|\]|\{|\}|\|))/g, "\\")).join("|")})$`,
            "g",
          ),
          code: /import\s+.*\s+from\s+['"]valibot['"]/,
        },
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
          const result = transformWithEstree(code, ast as UnionAstNode, {
            cacheModuleId: CACHE_MODULE_ID,
            sourceId: id,
          });
          cacheStore.register(result.cacheEntries, this);
          if (!result.changed) return null;
          return { code: result.code, map: result.map ?? null };
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
