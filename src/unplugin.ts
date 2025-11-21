import type { AstNode } from "rollup";
import { createUnplugin } from "unplugin";
import type {
  AstNode as UnionAstNode,
  CacheModuleEntry,
} from "./estree-transform.js";
import { transformWithEstree } from "./estree-transform.js";

const CACHE_MODULE_ID = "valibot-compiler:cache";

type CacheStore = {
  register(entries: CacheModuleEntry[], ctx: unknown): void;
  toModuleSource(): string;
  reset(): void;
  markLoaded(): void;
};

function createCacheStore(): CacheStore {
  const entriesByKey = new Map<string, CacheModuleEntry>();
  const entriesByIdentifier = new Map<string, CacheModuleEntry>();
  const valibotImports = new Set<string>();
  let moduleLoaded = false;

  const topoSort = (): CacheModuleEntry[] => {
    const ordered: CacheModuleEntry[] = [];
    const visiting = new Set<string>();
    const visited = new Set<string>();

    const visit = (entry: CacheModuleEntry): void => {
      if (visited.has(entry.identifier)) return;
      if (visiting.has(entry.identifier)) return;
      visiting.add(entry.identifier);
      for (const dependency of entry.dependencies) {
        const depEntry = entriesByIdentifier.get(dependency);
        if (depEntry) visit(depEntry);
      }
      visiting.delete(entry.identifier);
      visited.add(entry.identifier);
      ordered.push(entry);
    };

    for (const entry of entriesByKey.values()) {
      visit(entry);
    }

    return ordered;
  };

  const register = (
    entries: CacheModuleEntry[],
    ctx: unknown,
  ): void => {
    let added = false;
    for (const entry of entries) {
      if (entriesByKey.has(entry.key)) continue;
      entriesByKey.set(entry.key, entry);
      entriesByIdentifier.set(entry.identifier, entry);
      valibotImports.add(entry.callee);
      added = true;
    }
    if (added && moduleLoaded) {
      (ctx as { invalidate?: (id: string) => void }).invalidate?.(CACHE_MODULE_ID);
    }
  };

  const toModuleSource = (): string => {
    if (entriesByIdentifier.size === 0) {
      return "// Generated valibot cache\nexport {}\n";
    }
    const imports = Array.from(valibotImports).sort();
    const importBlock = imports.length > 0
      ? `import { ${imports.join(", ")} } from "valibot";\n\n`
      : "";
    const ordered = topoSort();
    const lines = ordered.map(
      (entry) => `export const ${entry.identifier} = ${entry.expression};`,
    );
    return `${importBlock}${lines.join("\n")}\n`;
  };

  const reset = (): void => {
    entriesByKey.clear();
    entriesByIdentifier.clear();
    valibotImports.clear();
    moduleLoaded = false;
  };

  const markLoaded = (): void => {
    moduleLoaded = true;
  };

  return { register, toModuleSource, reset, markLoaded };
}

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
    const cacheStore = createCacheStore();

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
