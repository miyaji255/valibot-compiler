import MagicString, { type SourceMap } from "magic-string";
import hashSum from "hash-sum";
import { CONTINUE, EXIT, SKIP, visit as visitEstree } from "estree-util-visit";
import type {
  CallExpression,
  ChainExpression,
  Expression,
  Identifier,
  ImportDeclaration,
  Node,
  Literal,
  NodeMap,
  Program,
  Property,
  SimpleCallExpression,
  TemplateLiteral,
  Pattern,
  Declaration,
  BaseNode,
  Statement,
} from "estree";
import type { RollupAstNode as RollupAstNodePrimitive } from "rollup";
// Omit<T, OmittedEstreeKeys> & AstNodeLocation;
type RollupAstNode<T extends BaseNode | BaseNode[] | null | undefined> =
  T extends object
    ? {
        [K in keyof T]: T[K] extends BaseNode | null | undefined
          ? RollupAstNode<T[K]>
          : T[K] extends BaseNode[] | null | undefined
            ? RollupAstNode<T[K]>
            : T[K];
      }
    : T;
export type AstNode = RollupAstNode<Node>;

export interface TransformConfig {
  cacheModuleId: string;
  sourceId?: string;
}

export interface CacheModuleEntry {
  key: string;
  identifier: string;
  callee: string;
  expression: string;
  dependencies: string[];
}

export interface TransformOut {
  code: string;
  changed: boolean;
  cacheEntries: CacheModuleEntry[];
  map: SourceMap | null;
}

type ImportInfo = {
  named: Map<string, string>;
  namespaces: Set<string>;
};

type WithRange = {
  start?: number | null;
  end?: number | null;
};

type ProcessedCallMap = WeakMap<AstNode, CacheModuleEntry | null>;

function isProgram(node: AstNode): node is RollupAstNode<Program> {
  return node.type === "Program";
}

function getStart(node: AstNode): number | null {
  const withRange = node as AstNode & WithRange;
  return typeof withRange.start === "number" ? withRange.start : null;
}

function getEnd(node: AstNode): number | null {
  const withRange = node as AstNode & WithRange;
  return typeof withRange.end === "number" ? withRange.end : null;
}

function collectValibotImports(program: RollupAstNode<Program>): ImportInfo {
  const named = new Map<string, string>();
  const namespaces = new Set<string>();

  for (const statement of program.body) {
    if (statement.type !== "ImportDeclaration") continue;
    if (statement.source.value !== "valibot") continue;
    for (const specifier of statement.specifiers) {
      if (specifier.type === "ImportSpecifier") {
        const imported =
          specifier.imported.type === "Identifier"
            ? specifier.imported.name
            : String(specifier.imported.value);
        named.set(specifier.local.name, imported);
      } else if (specifier.type === "ImportNamespaceSpecifier") {
        namespaces.add(specifier.local.name);
      }
    }
  }

  return { named, namespaces };
}

function unwrapExpression(node: Expression): Expression {
  let current: Expression = node;
  while (true) {
    const typeLabel = (current as { type?: unknown }).type;
    if (
      typeLabel === "TSAsExpression" ||
      typeLabel === "TSTypeAssertion" ||
      typeLabel === "TSNonNullExpression"
    ) {
      const candidate = current as { expression?: Expression };
      if (candidate.expression) {
        current = candidate.expression;
        continue;
      }
    }
    if (typeLabel === "ChainExpression") {
      const chain = current as ChainExpression & { expression: Expression };
      return chain.expression;
    }
    return current;
  }
}

type CalleeInfo = {
  exported: string;
};

function resolveValibotCallee(
  call: RollupAstNode<CallExpression>,
  imports: ImportInfo,
): CalleeInfo | null {
  if (call.callee.type === "Identifier") {
    const exported = imports.named.get(call.callee.name);
    return exported ? { exported } : null;
  }
  if (
    call.callee.type === "MemberExpression" &&
    !call.callee.computed &&
    call.callee.object.type === "Identifier" &&
    call.callee.property.type === "Identifier"
  ) {
    if (!imports.namespaces.has(call.callee.object.name)) return null;
    return { exported: call.callee.property.name };
  }
  return null;
}

function isValibotCallExpression(
  node: AstNode,
  imports: ImportInfo,
): node is RollupAstNode<CallExpression> {
  if (node.type !== "CallExpression") return false;
  const call = node as RollupAstNode<CallExpression> & { optional?: boolean };
  if (call.optional) return false;
  return resolveValibotCallee(call, imports) !== null;
}

function createIdentifier(base: string, hash: string): string {
  const sanitizedBase = base.replace(/[^A-Za-z0-9_$]/g, "_");
  const capitalized =
    sanitizedBase.length > 0
      ? `${sanitizedBase[0].toUpperCase()}${sanitizedBase.slice(1)}`
      : "Valibot";
  const sanitizedHash = hash.replace(/[^A-Za-z0-9_$]/g, "_");
  let identifier = `${capitalized}__${sanitizedHash}`;
  if (!/^[A-Za-z_$]/u.test(identifier)) {
    identifier = `V_${identifier}`;
  }
  return identifier;
}

function serializeLiteral(literal: Literal): string | null {
  const regexInfo = (
    literal as unknown as {
      regex?: { pattern?: string; flags?: string };
    }
  ).regex;
  if (regexInfo) {
    const pattern = regexInfo.pattern ?? "";
    const flags = regexInfo.flags ?? "";
    return `regex:/${pattern}/${flags}`;
  }
  if (literal.value === undefined) return null;
  if (typeof literal.value === "object" && literal.value !== null) return null;
  return `literal:${typeof literal.value}:${String(literal.value)}`;
}

function serializeTemplateLiteral(literal: TemplateLiteral): string | null {
  if (literal.expressions.length > 0) return null;
  const cooked = literal.quasis[0]?.value.cooked ?? "";
  return `template:${cooked}`;
}

function serializePropertyKey(property: Property): string | null {
  if (property.computed) return null;
  if (property.key.type === "Identifier") {
    return `key:${property.key.name}`;
  }
  if (property.key.type === "Literal") {
    const value = property.key.value;
    if (value === undefined) return null;
    return `key:${String(value)}`;
  }
  return null;
}

function computeArgumentSnippet(
  magic: MagicString,
  node: AstNode,
): string | null {
  const start = getStart(node);
  const end = getEnd(node);
  if (start === null || end === null) return null;
  return magic.slice(start, end);
}

function buildCallKey(callee: string, parts: string[]): string {
  return `${callee}|${parts.join("|")}`;
}

function normalizeArgumentForKey(
  expr: Expression,
  context: CallProcessingContext,
  dependencies: Set<string>,
): string | null {
  const unwrapped = unwrapExpression(expr);
  if (isValibotCallExpression(unwrapped as AstNode, context.imports)) {
    const nested = ensureCacheEntry(
      unwrapped as RollupAstNode<CallExpression>,
      context,
    );
    if (!nested) return null;
    dependencies.add(nested.identifier);
    return nested.key;
  }
  switch (unwrapped.type) {
    case "Literal":
      return serializeLiteral(unwrapped);
    case "TemplateLiteral":
      return serializeTemplateLiteral(unwrapped);
    case "ArrayExpression": {
      const result: string[] = [];
      for (const element of unwrapped.elements) {
        if (!element) {
          result.push("hole");
          continue;
        }
        if (element.type === "SpreadElement") return null;
        const normalized = normalizeArgumentForKey(
          element,
          context,
          dependencies,
        );
        if (!normalized) return null;
        result.push(normalized);
      }
      return `array:[${result.join(",")}]`;
    }
    case "ObjectExpression": {
      const entries: string[] = [];
      for (const property of unwrapped.properties) {
        if (property.type !== "Property") return null;
        if (property.method || property.computed || property.shorthand) {
          return null;
        }
        const key = serializePropertyKey(property);
        if (!key) return null;
        const value = property.value;
        if (
          value.type !== "Literal" &&
          value.type !== "TemplateLiteral" &&
          value.type !== "ArrayExpression" &&
          value.type !== "ObjectExpression" &&
          value.type !== "CallExpression"
        ) {
          return null;
        }
        const normalized = normalizeArgumentForKey(
          value,
          context,
          dependencies,
        );
        if (!normalized) return null;
        entries.push(`${key}=${normalized}`);
      }
      return `object:{${entries.join(",")}}`;
    }
    default:
      return null;
  }
}

type CallProcessingContext = {
  magic: MagicString;
  imports: ImportInfo;
  processed: ProcessedCallMap;
  entriesByKey: Map<string, CacheModuleEntry>;
  entriesOrdered: CacheModuleEntry[];
};

function renderArgumentExpression(
  expr: Expression,
  context: CallProcessingContext,
  dependencies: Set<string>,
): string | null {
  const unwrapped = unwrapExpression(expr);

  if (isValibotCallExpression(unwrapped as AstNode, context.imports)) {
    const nested = ensureCacheEntry(
      unwrapped as RollupAstNode<CallExpression>,
      context,
    );
    if (!nested) return null;
    dependencies.add(nested.identifier);
    return nested.identifier;
  }

  switch (unwrapped.type) {
    case "ArrayExpression": {
      const parts: string[] = [];
      for (const element of unwrapped.elements) {
        if (element === null) return null;
        if (element.type === "SpreadElement") return null;
        const rendered = renderArgumentExpression(
          element as Expression,
          context,
          dependencies,
        );
        if (!rendered) return null;
        parts.push(rendered);
      }
      return `[${parts.join(", ")}]`;
    }
    case "ObjectExpression": {
      const parts: string[] = [];
      for (const property of unwrapped.properties) {
        if (property.type !== "Property") return null;
        if (property.method || property.computed || property.shorthand) {
          return null;
        }
        const key = property.key.type === "Identifier"
          ? property.key.name
          : property.key.type === "Literal" && property.key.value !== undefined
            ? JSON.stringify(property.key.value)
            : null;
        if (!key) return null;
        const rendered = renderArgumentExpression(
          property.value as Expression,
          context,
          dependencies,
        );
        if (!rendered) return null;
        parts.push(`${key}: ${rendered}`);
      }
      return `{ ${parts.join(", ")} }`;
    }
    case "Identifier":
      return unwrapped.name;
    default: {
      const snippet = computeArgumentSnippet(
        context.magic,
        expr as unknown as AstNode,
      );
      return snippet;
    }
  }
}

function ensureCacheEntry(
  call: RollupAstNode<CallExpression>,
  context: CallProcessingContext,
): CacheModuleEntry | null {
  const existing = context.processed.get(call);
  if (existing !== undefined) {
    return existing;
  }
  const calleeInfo = resolveValibotCallee(call, context.imports);
  if (!calleeInfo) {
    context.processed.set(call, null);
    return null;
  }

  const argumentExpressions: string[] = [];
  const keyParts: string[] = [];
  const dependencySet = new Set<string>();

  for (const rawArg of call.arguments) {
    if (rawArg.type === "SpreadElement") {
      context.processed.set(call, null);
      return null;
    }
    const argument = unwrapExpression(rawArg as Expression);

    const rendered = renderArgumentExpression(
      argument,
      context,
      dependencySet,
    );
    if (rendered === null) {
      context.processed.set(call, null);
      return null;
    }

    const normalized = normalizeArgumentForKey(
      argument,
      context,
      dependencySet,
    );
    if (!normalized) {
      context.processed.set(call, null);
      return null;
    }

    argumentExpressions.push(rendered);
    keyParts.push(normalized);
  }

  const key = buildCallKey(calleeInfo.exported, keyParts);
  let entry = context.entriesByKey.get(key);
  if (!entry) {
    const hash = hashSum(key);
    const identifier = createIdentifier(calleeInfo.exported, hash);
    const expression = `${calleeInfo.exported}(${argumentExpressions.join(", ")})`;
    entry = {
      key,
      identifier,
      callee: calleeInfo.exported,
      expression,
      dependencies: Array.from(dependencySet),
    };
    context.entriesByKey.set(key, entry);
    context.entriesOrdered.push(entry);
  }
  context.processed.set(call, entry);
  return entry;
}

type CacheImportInfo = {
  node: RollupAstNode<ImportDeclaration>;
  hasDefault: boolean;
  defaultLocal: string | null;
  namespaceLocal: string | null;
  named: Set<string>;
};

function analyseCacheImport(
  program: RollupAstNode<Program>,
  cacheModuleId: string,
): CacheImportInfo | null {
  for (const statement of program.body) {
    if (statement.type !== "ImportDeclaration") continue;
    if (statement.source.value !== cacheModuleId) continue;
    const importNode = statement as RollupAstNode<ImportDeclaration>;
    const named = new Set<string>();
    let defaultLocal: string | null = null;
    let namespaceLocal: string | null = null;
    let hasDefault = false;

    for (const specifier of importNode.specifiers) {
      if (specifier.type === "ImportSpecifier") {
        named.add(specifier.local.name);
      } else if (specifier.type === "ImportDefaultSpecifier") {
        hasDefault = true;
        defaultLocal = specifier.local.name;
      } else if (specifier.type === "ImportNamespaceSpecifier") {
        namespaceLocal = specifier.local.name;
      }
    }

    return {
      node: importNode,
      hasDefault,
      defaultLocal,
      namespaceLocal,
      named,
    };
  }
  return null;
}

function findLastImportEnd(program: RollupAstNode<Program>): number {
  let position = 0;
  for (const statement of program.body) {
    if (statement.type !== "ImportDeclaration") break;
    const end = getEnd(statement as unknown as AstNode);
    if (end !== null && end > position) {
      position = end;
    }
  }
  return position;
}

function renderCacheImport(
  info: CacheImportInfo,
  names: string[],
  cacheModuleId: string,
): string {
  const parts: string[] = [];
  if (info.hasDefault && info.defaultLocal) {
    parts.push(info.defaultLocal);
  }
  if (info.namespaceLocal) {
    parts.push(`* as ${info.namespaceLocal}`);
  }
  if (names.length > 0) {
    parts.push(`{ ${names.join(", ")} }`);
  }
  if (parts.length === 0) {
    return `import "${cacheModuleId}";`;
  }
  return `import ${parts.join(", ")} from "${cacheModuleId}";`;
}

function renderNewCacheImport(names: string[], cacheModuleId: string): string {
  if (names.length === 0) {
    return "";
  }
  return `import { ${names.join(", ")} } from "${cacheModuleId}";\n`;
}

function getSymbolsFromPattern(
  pattern: RollupAstNode<Pattern>,
  symbols: Set<string>,
): void {
  switch (pattern.type) {
    case "Identifier":
      symbols.add(pattern.name);
      break;
    case "ObjectPattern":
      for (const prop of pattern.properties) {
        if (prop.type === "RestElement") {
          getSymbolsFromPattern(prop.argument, symbols);
        } else if (prop.type === "Property") {
          getSymbolsFromPattern(prop.value, symbols);
        }
      }
      break;
    case "ArrayPattern":
      for (const element of pattern.elements) {
        if (element) {
          if (element.type === "RestElement") {
            getSymbolsFromPattern(element.argument, symbols);
          } else {
            getSymbolsFromPattern(element, symbols);
          }
        }
      }
      break;
    case "RestElement":
      getSymbolsFromPattern(pattern.argument, symbols);
      break;
    case "AssignmentPattern":
      getSymbolsFromPattern(pattern.left, symbols);
      break;
  }
}

function collectDeclaredSymbolsFromStatements(
  statements: RollupAstNode<Statement>[],
  symbols: Set<string>,
): void {
  for (const statement of statements) {
    if (statement.type === "VariableDeclaration") {
      for (const decl of statement.declarations)
        getSymbolsFromPattern(decl.id, symbols);
    } else if (statement.type === "FunctionDeclaration") {
      symbols.add(statement.id.name);
    } else if (statement.type === "ClassDeclaration") {
      symbols.add(statement.id.name);
    }
  }
}

export function transformWithEstree(
  code: string,
  ast: AstNode,
  config: TransformConfig,
): TransformOut {
  if (!isProgram(ast)) {
    return { code, changed: false, cacheEntries: [], map: null };
  }

  const imports = collectValibotImports(ast);
  if (imports.named.size === 0 && imports.namespaces.size === 0) {
    return { code, changed: false, cacheEntries: [], map: null };
  }

  const valibotSymbols = new Set<string>([
    ...imports.named.keys(),
    ...imports.namespaces,
  ]);

  // 重複宣言チェック
  let hasCollision = false;
  visitEstree(ast, {
    enter: (node) => {
      const rollupNode = node as AstNode;
      switch (rollupNode.type) {
        case "VariableDeclarator": {
          const names = new Set<string>();
          getSymbolsFromPattern(rollupNode.id as RollupAstNode<Pattern>, names);
          for (const name of names) {
            if (valibotSymbols.has(name)) {
              hasCollision = true;
              return EXIT;
            }
          }
          break;
        }
        case "FunctionDeclaration":
        case "ClassDeclaration": {
          const id = (rollupNode as { id: Identifier | null }).id;
          if (id && valibotSymbols.has(id.name)) {
            hasCollision = true;
            return EXIT;
          }
          break;
        }
        case "FunctionExpression":
        case "ArrowFunctionExpression": {
          for (const param of rollupNode.params) {
            const names = new Set<string>();
            getSymbolsFromPattern(param, names);
            for (const name of names) {
              if (valibotSymbols.has(name)) {
                hasCollision = true;
                return EXIT;
              }
            }
          }
          break;
        }
        case "CatchClause": {
          const param = rollupNode.param;
          if (param) {
            const names = new Set<string>();
            getSymbolsFromPattern(param, names);
            for (const name of names) {
              if (valibotSymbols.has(name)) {
                hasCollision = true;
                return EXIT;
              }
            }
          }
          break;
        }
        case "ForInStatement":
        case "ForOfStatement": {
          const left = rollupNode.left;
          if (left && left.type !== "VariableDeclaration") {
            const names = new Set<string>();
            getSymbolsFromPattern(left as RollupAstNode<Pattern>, names);
            for (const name of names) {
              if (valibotSymbols.has(name)) {
                hasCollision = true;
                return EXIT;
              }
            }
          }
          break;
        }
      }
      return CONTINUE;
    },
  });
  if (hasCollision) {
    return { code, changed: false, cacheEntries: [], map: null };
  }

  const magic = new MagicString(code);
  const processed: ProcessedCallMap = new WeakMap();
  const entriesByKey = new Map<string, CacheModuleEntry>();
  const entriesOrdered: CacheModuleEntry[] = [];
  const replacements: { start: number; end: number; identifier: string }[] = [];
  const replacedNodes = new WeakSet<AstNode>();

  const context: CallProcessingContext = {
    magic,
    imports,
    processed,
    entriesByKey,
    entriesOrdered,
  };

  visitEstree(ast, {
    enter: (node) => {
      const rollupNode = node as AstNode;
      if (isValibotCallExpression(rollupNode, imports)) {
        const call = rollupNode as RollupAstNode<CallExpression>;
        const entry = ensureCacheEntry(call, context);
        if (entry && !replacedNodes.has(rollupNode)) {
          const start = getStart(rollupNode);
          const end = getEnd(rollupNode);
          if (start !== null && end !== null) {
            replacements.push({ start, end, identifier: entry.identifier });
            replacedNodes.add(rollupNode);
          }
        }
        return entry ? SKIP : CONTINUE;
      }
      return CONTINUE;
    },
  });

  if (entriesOrdered.length === 0 || replacements.length === 0) {
    return { code, changed: false, cacheEntries: [], map: null };
  }

  // 置換を後ろから実施
  replacements
    .sort((a, b) => b.start - a.start)
    .forEach((replacement) => {
      magic.overwrite(
        replacement.start,
        replacement.end,
        replacement.identifier,
      );
    });

  const importCode = entriesOrdered
    .map(
      (entry) =>
        `import ${entry.identifier} from "${config.cacheModuleId}/${entry.identifier}";`,
    )
    .join("\n");
  if (importCode.length > 0) {
    const insertPos = findLastImportEnd(ast);
    magic.appendLeft(insertPos, `\n${importCode}\n`);
  }

  const map = magic.generateMap({
    hires: true,
    source: config.sourceId,
  });

  return {
    code: magic.toString(),
    changed: true,
    cacheEntries: entriesOrdered,
    map,
  };
}
