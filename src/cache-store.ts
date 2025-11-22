export const CACHE_MODULE_ID = "valibot-compiler:cache";

import type { CacheDependency, CacheModuleEntry } from "./estree-transform.js";

export class CacheStore {
  #entriesByKey = new Map<string, CacheModuleEntry>();
  #entriesByIdentifier = new Map<string, CacheModuleEntry>();
  #cacheModuleId: string;

  constructor(cacheModuleId: string) {
    this.#cacheModuleId = cacheModuleId;
  }

  register(entries: CacheModuleEntry[]): void {
    for (const entry of entries) {
      if (this.#entriesByKey.has(entry.key)) continue;
      this.#entriesByKey.set(entry.key, entry);
      this.#entriesByIdentifier.set(entry.identifier, entry);
    }
  }

  getEntry(identifier: string): CacheModuleEntry | undefined {
    return this.#entriesByIdentifier.get(identifier);
  }

  getModuleSource(identifier: string): string | null {
    const entry = this.#entriesByIdentifier.get(identifier);
    if (!entry) return null;
    const calleeImport = `import { ${entry.callee} } from "valibot";`;
    const dependencyImports: string[] = [];
    for (const dependency of entry.dependencies) {
      if (dependency.kind === "cache") {
        dependencyImports.push(
          `import ${dependency.identifier} from "${this.#cacheModuleId}/${dependency.identifier}";`,
        );
        continue;
      }
      const importPath = dependency.source;
      if (dependency.isNamespace) {
        dependencyImports.push(
          `import * as ${dependency.local} from "${importPath}";`,
        );
      } else if (dependency.imported === null) {
        dependencyImports.push(
          `import ${dependency.local} from "${importPath}";`,
        );
      } else if (dependency.imported === dependency.local) {
        dependencyImports.push(
          `import { ${dependency.imported} } from "${importPath}";`,
        );
      } else {
        dependencyImports.push(
          `import { ${dependency.imported} as ${dependency.local} } from "${importPath}";`,
        );
      }
    }
    const imports = [calleeImport, ...dependencyImports].filter(Boolean).join("\n");
    return `${imports}\n\nexport default ${entry.expression};\n`;
  }

  reset(): void {
    this.#entriesByKey.clear();
    this.#entriesByIdentifier.clear();
  }
}
