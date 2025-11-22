import type { AstNode } from "rollup";
import { createUnplugin } from "unplugin";
import path from "node:path";
import type { AstNode as UnionAstNode } from "./estree-transform.ts";
import { transformWithEstree } from "./estree-transform.ts";
import { CACHE_MODULE_ID, CacheStore } from "./cache-store.ts";
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
      resolveId(id: string, importer?: string) {
        if (id === CACHE_MODULE_ID || id.startsWith(`${CACHE_MODULE_ID}/`)) {
          return id;
        }
        if (
          importer &&
          importer.startsWith(`${CACHE_MODULE_ID}/`) &&
          cacheStore.getEntry(importer.slice(CACHE_MODULE_ID.length + 1))
        ) {
          const entry = cacheStore.getEntry(
            importer.slice(CACHE_MODULE_ID.length + 1),
          );
          const baseDir = entry?.sourceId
            ? path.dirname(entry.sourceId)
            : undefined;
          const resolved = baseDir && id.startsWith(".")
            ? path.resolve(baseDir, id)
            : id;
          return { id: resolved };
        }
        return null;
      },
      load(id: string) {
        if (id === CACHE_MODULE_ID) {
          return "// valibot-compiler cache root\nexport {};\n";
        }
        if (id.startsWith(`${CACHE_MODULE_ID}/`)) {
          const identifier = id.slice(CACHE_MODULE_ID.length + 1);
          return cacheStore.getModuleSource(identifier);
        }
        return null;
      },
      transform: {
        filter: {
          id: new RegExp(
            `(${exts
              .map((ext) =>
                ext.replaceAll(
                  /(?=(\^|\$|\\|\.|\*|\+|\(|\)|\[|\]|\{|\}|\|))/g,
                  "\\",
                ),
              )
              .join("|")})$`,
          ),
          code: /import[\s\S]+from\s+['"]valibot['"]/,
        },
        handler: async function (code, id) {
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
          const resolvedEntries = await Promise.all(
            result.cacheEntries.map(async (entry) => {
              const resolvedDependencies = await Promise.all(
                entry.dependencies.map(async (dependency) => {
                  if (
                    dependency.kind === "import" &&
                    dependency.source.startsWith(".")
                  ) {
                    let resolvedId: string | null = null;
                    if (this.resolve) {
                      const resolved = await this.resolve(
                        dependency.source,
                        id,
                      );
                      if (resolved?.id) {
                        resolvedId = resolved.id;
                      }
                    }
                    if (!resolvedId) {
                      resolvedId = path.resolve(
                        path.dirname(id),
                        dependency.source,
                      );
                    }
                    return { ...dependency, source: resolvedId };
                  }
                  return dependency;
                }),
              );
              return { ...entry, dependencies: resolvedDependencies };
            }),
          );
          cacheStore.register(resolvedEntries);
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
