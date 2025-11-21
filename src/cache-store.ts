export const CACHE_MODULE_ID = "valibot-compiler:cache";

import type { CacheModuleEntry } from "./estree-transform.js";

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

  getModuleSource(identifier: string): string | null {
    const entry = this.#entriesByIdentifier.get(identifier);
    if (!entry) return null;
    const calleeImport = `import { ${entry.callee} } from "valibot";`;
    const dependencyImports =
      entry.dependencies.length > 0
        ? entry.dependencies
            .map(
              (dep) => `import ${dep} from "${this.#cacheModuleId}/${dep}";`,
            )
            .join("\n")
        : "";
    const imports = [calleeImport, dependencyImports]
      .filter(Boolean)
      .join("\n");
    return `${imports}\n\nexport default ${entry.expression};\n`;
  }

  reset(): void {
    this.#entriesByKey.clear();
    this.#entriesByIdentifier.clear();
  }
}
