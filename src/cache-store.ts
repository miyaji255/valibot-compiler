import type { CacheModuleEntry } from "./estree-transform.js";

export const CACHE_MODULE_ID = "valibot-compiler:cache";

export class CacheStore {
  #entriesByKey = new Map<string, CacheModuleEntry>();
  #entriesByIdentifier = new Map<string, CacheModuleEntry>();
  #valibotImports = new Set<string>();
  #moduleLoaded = false;
  #cacheModuleId: string;

  constructor(cacheModuleId: string) {
    this.#cacheModuleId = cacheModuleId;
  }

  #topoSort(): CacheModuleEntry[] {
    const ordered: CacheModuleEntry[] = [];
    const visiting = new Set<string>();
    const visited = new Set<string>();

    const visit = (entry: CacheModuleEntry): void => {
      if (visited.has(entry.identifier)) return;
      if (visiting.has(entry.identifier)) return;
      visiting.add(entry.identifier);
      for (const dependency of entry.dependencies) {
        const depEntry = this.#entriesByIdentifier.get(dependency);
        if (depEntry) visit(depEntry);
      }
      visiting.delete(entry.identifier);
      visited.add(entry.identifier);
      ordered.push(entry);
    };

    for (const entry of this.#entriesByKey.values()) {
      visit(entry);
    }

    return ordered;
  }

  register(entries: CacheModuleEntry[], ctx: unknown): void {
    let added = false;
    for (const entry of entries) {
      if (this.#entriesByKey.has(entry.key)) continue;
      this.#entriesByKey.set(entry.key, entry);
      this.#entriesByIdentifier.set(entry.identifier, entry);
      this.#valibotImports.add(entry.callee);
      added = true;
    }
    if (added && this.#moduleLoaded) {
      const invalidate = (ctx as { invalidate?: unknown })?.invalidate;
      if (typeof invalidate === "function") {
        invalidate(this.#cacheModuleId);
      }
    }
  }

  toModuleSource(): string {
    if (this.#entriesByIdentifier.size === 0) {
      return "// Generated valibot cache\nexport {}\n";
    }
    const imports = Array.from(this.#valibotImports).sort();
    const importBlock =
      imports.length > 0
        ? `import { ${imports.join(", ")} } from "valibot";\n\n`
        : "";
    const ordered = this.#topoSort();
    const lines = ordered.map(
      (entry) => `export const ${entry.identifier} = ${entry.expression};`,
    );
    return `${importBlock}${lines.join("\n")}\n`;
  }

  reset(): void {
    this.#entriesByKey.clear();
    this.#entriesByIdentifier.clear();
    this.#valibotImports.clear();
    this.#moduleLoaded = false;
  }

  markLoaded(): void {
    this.#moduleLoaded = true;
  }
}
