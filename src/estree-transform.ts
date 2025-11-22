import MagicString, { type SourceMap } from "magic-string";
import hashSum from "hash-sum";
import { CONTINUE, EXIT, SKIP, visit as visitEstree } from "estree-util-visit";
import type {
  CallExpression,
  ChainExpression,
  Expression,
  Identifier,
  Node,
  Literal,
  Program,
  Property,
  TemplateLiteral,
  Pattern,
  BaseNode,
  VariableDeclaration,
  VariableDeclarator,
  ImportDeclaration,
  ArrowFunctionExpression,
  FunctionExpression,
} from "estree";

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
  dependencies: CacheDependency[];
  sourceId?: string;
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

type ImportBinding = {
  local: string;
  source: string;
  type: "named" | "default" | "namespace";
  imported: string | null;
};

export type CacheDependency =
  | { kind: "cache"; identifier: string }
  | {
      kind: "import";
      source: string;
      imported: string | null;
      isNamespace: boolean;
      local: string;
    };

const SAFE_GLOBAL_IDENTIFIERS = new Set([
  "String",
  "Number",
  "Boolean",
  "BigInt",
  "Date",
  "RegExp",
  "Array",
  "Object",
  "JSON",
  "Math",
  "parseInt",
  "parseFloat",
  "encodeURI",
  "decodeURI",
  "encodeURIComponent",
  "decodeURIComponent",
]);

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

function collectImportBindings(
  program: RollupAstNode<Program>,
): Map<string, ImportBinding> {
  const bindings = new Map<string, ImportBinding>();

  for (const statement of program.body) {
    if (statement.type !== "ImportDeclaration") continue;
    for (const specifier of statement.specifiers) {
      if (specifier.type === "ImportSpecifier") {
        const imported =
          specifier.imported.type === "Identifier"
            ? specifier.imported.name
            : String(specifier.imported.value);
        bindings.set(specifier.local.name, {
          local: specifier.local.name,
          source: String(statement.source.value),
          type: "named",
          imported,
        });
      } else if (specifier.type === "ImportDefaultSpecifier") {
        bindings.set(specifier.local.name, {
          local: specifier.local.name,
          source: String(statement.source.value),
          type: "default",
          imported: null,
        });
      } else if (specifier.type === "ImportNamespaceSpecifier") {
        bindings.set(specifier.local.name, {
          local: specifier.local.name,
          source: String(statement.source.value),
          type: "namespace",
          imported: null,
        });
      }
    }
  }

  return bindings;
}

function collectConstBindings(
  program: RollupAstNode<Program>,
): Map<string, RollupAstNode<Expression>> {
  const bindings = new Map<string, RollupAstNode<Expression>>();

  for (const statement of program.body) {
    const declaration =
      statement.type === "VariableDeclaration"
        ? (statement as RollupAstNode<VariableDeclaration>)
        : statement.type === "ExportNamedDeclaration" &&
            statement.declaration &&
            statement.declaration.type === "VariableDeclaration"
          ? (statement.declaration as RollupAstNode<VariableDeclaration>)
          : null;
    if (!declaration || declaration.kind !== "const") continue;
    for (const declarator of declaration.declarations) {
      if (
        declarator.type !== "VariableDeclarator" ||
        declarator.id.type !== "Identifier" ||
        !declarator.init
      ) {
        continue;
      }
      const init = declarator.init as RollupAstNode<Expression>;
      bindings.set(declarator.id.name, init);
    }
  }

  return bindings;
}

function collectPatternNames(pattern: RollupAstNode<Pattern>, names: Set<string>): void {
  switch (pattern.type) {
    case "Identifier":
      names.add(pattern.name);
      break;
    case "ObjectPattern":
      for (const prop of pattern.properties) {
        if (prop.type === "RestElement") {
          collectPatternNames(prop.argument as RollupAstNode<Pattern>, names);
        } else if (prop.type === "Property") {
          collectPatternNames(prop.value as RollupAstNode<Pattern>, names);
        }
      }
      break;
    case "ArrayPattern":
      for (const element of pattern.elements) {
        if (!element) continue;
        collectPatternNames(element as RollupAstNode<Pattern>, names);
      }
      break;
    case "RestElement":
      collectPatternNames(pattern.argument as RollupAstNode<Pattern>, names);
      break;
    case "AssignmentPattern":
      collectPatternNames(pattern.left as RollupAstNode<Pattern>, names);
      break;
  }
}

function isBindingIdentifier(
  node: RollupAstNode<Identifier>,
  parent: AstNode | undefined,
): boolean {
  if (!parent) return false;
  switch (parent.type) {
    case "VariableDeclarator":
      return (parent as VariableDeclarator).id === node;
    case "FunctionDeclaration":
    case "FunctionExpression":
      return (parent as { id: Identifier | null }).id === node;
    case "ClassDeclaration":
    case "ClassExpression":
      return (parent as { id: Identifier | null }).id === node;
    case "ImportSpecifier":
    case "ImportDefaultSpecifier":
    case "ImportNamespaceSpecifier":
      return true;
    case "Property":
      return (parent as Property).key === node && !(parent as Property).computed;
    case "MemberExpression":
      return (parent as { property: AstNode; computed: boolean }).property ===
        node && !(parent as { computed: boolean }).computed
        ? true
        : false;
    case "LabeledStatement":
      return (parent as { label: Identifier }).label === node;
    case "CatchClause":
      return (parent as { param: AstNode | null }).param === node;
    case "AssignmentPattern":
      return (parent as { left: AstNode }).left === node;
    default:
      return false;
  }
}

function isMemberPropertyIdentifier(
  node: RollupAstNode<Identifier>,
  context: CallProcessingContext,
  initialParent: AstNode | undefined,
): boolean {
  let current: AstNode | undefined =
    context.parentMap.get(node as unknown as AstNode) ?? initialParent;
  while (current) {
    if (
      current.type === "MemberExpression" &&
      (current as unknown as { property: AstNode; computed: boolean }).property ===
        node &&
      !(current as unknown as { computed: boolean }).computed
    ) {
      return true;
    }
    current = context.parentMap.get(current as unknown as AstNode);
  }
  return false;
}

function isParamIdentifier(
  node: RollupAstNode<Identifier>,
  context: CallProcessingContext,
): boolean {
  let current: AstNode | undefined = context.parentMap.get(
    node as unknown as AstNode,
  );
  while (current) {
    if (
      current.type === "FunctionExpression" ||
      current.type === "ArrowFunctionExpression" ||
      current.type === "FunctionDeclaration"
    ) {
      const names = new Set<string>();
      const func = current as {
        params: Pattern[];
        id?: Identifier | null;
      };
      for (const param of func.params) {
        collectPatternNames(param as RollupAstNode<Pattern>, names);
      }
      if (func.id) names.add(func.id.name);
      if (names.has(node.name)) return true;
    }
    current = context.parentMap.get(current as unknown as AstNode);
  }
  return false;
}

function gatherFunctionDependencies(
  fn: RollupAstNode<ArrowFunctionExpression | FunctionExpression>,
  context: CallProcessingContext,
  dependencies: Map<string, CacheDependency>,
): boolean {
  const scopeStack: Set<string>[] = [];

function enterFunction(
  func: RollupAstNode<ArrowFunctionExpression | FunctionExpression>,
): void {
  const names = new Set<string>();
  if (func.type === "FunctionExpression" && func.id) {
    names.add(func.id.name);
  }
  for (const param of func.params) {
    collectPatternNames(param as RollupAstNode<Pattern>, names);
  }
  scopeStack.push(names);
}

  function exitFunction(): void {
    scopeStack.pop();
  }

  function isDeclared(name: string): boolean {
    for (let i = scopeStack.length - 1; i >= 0; i -= 1) {
      if (scopeStack[i].has(name)) return true;
    }
    return false;
  }

  function walk(node: AstNode, parent?: AstNode): boolean {
    if (
      node.type === "FunctionExpression" ||
      node.type === "ArrowFunctionExpression"
    ) {
      const func = node as RollupAstNode<
        ArrowFunctionExpression | FunctionExpression
      >;
      enterFunction(func);
      // traverse body
      const bodyNodes =
        func.body && func.body.type === "BlockStatement"
          ? func.body.body
          : [func.body as unknown as AstNode];
      for (const stmt of bodyNodes) {
        if (!walk(stmt as AstNode, func as AstNode)) return false;
      }
      exitFunction();
      return true;
    }

    switch (node.type) {
      case "VariableDeclarator": {
        const declarator = node as RollupAstNode<VariableDeclarator>;
        collectPatternNames(declarator.id as RollupAstNode<Pattern>, scopeStack[scopeStack.length - 1]);
        if (declarator.init) {
          if (!walk(declarator.init as AstNode, node as AstNode)) return false;
        }
        return true;
      }
      case "FunctionDeclaration": {
        const fnNode = node as { id: Identifier | null };
        if (fnNode.id) {
          scopeStack[scopeStack.length - 1].add(fnNode.id.name);
        }
        // do not traverse into separate function scopes
        return true;
      }
      case "ClassDeclaration": {
        const classNode = node as { id: Identifier | null };
        if (classNode.id) {
          scopeStack[scopeStack.length - 1].add(classNode.id.name);
        }
        return true;
      }
      case "Identifier": {
        const idNode = node as RollupAstNode<Identifier>;
        const actualParent =
          context.parentMap.get(idNode as unknown as AstNode) ?? parent;
        if (
          isBindingIdentifier(idNode, actualParent) ||
          isMemberPropertyIdentifier(idNode, context, actualParent)
        ) {
          return true;
        }
        if (isParamIdentifier(idNode, context)) return true;
        if (isDeclared(idNode.name)) return true;
        const resolved = resolveIdentifierReference(
          idNode,
          context,
          dependencies,
        );
        if (!resolved) return false;
        return true;
      }
      default: {
        // traverse children generically
        let shouldContinue = true;
        visitEstree(node as BaseNode, {
          enter(child, _index, _parent) {
            if (child === node) return CONTINUE;
            if (!walk(child as AstNode, node as AstNode)) {
              shouldContinue = false;
              return EXIT;
            }
            return CONTINUE;
          },
        });
        return shouldContinue;
      }
    }
  }

  enterFunction(fn);
  const bodyNodes =
    fn.body && fn.body.type === "BlockStatement"
      ? fn.body.body
      : [fn.body as unknown as AstNode];
  for (const stmt of bodyNodes) {
    if (!walk(stmt as AstNode, fn as AstNode)) {
      exitFunction();
      return false;
    }
  }
  exitFunction();
  return true;
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
  dependencies: Map<string, CacheDependency>,
): string | null {
  const unwrapped = unwrapExpression(expr);
  if (isValibotCallExpression(unwrapped as AstNode, context.imports)) {
    const nested = ensureCacheEntry(
      unwrapped as RollupAstNode<CallExpression>,
      context,
    );
    if (!nested) return null;
    addDependency(dependencies, {
      kind: "cache",
      identifier: nested.identifier,
    });
    return nested.key;
  }
  switch (unwrapped.type) {
    case "Literal":
      return serializeLiteral(unwrapped);
    case "TemplateLiteral":
      return serializeTemplateLiteral(unwrapped);
    case "Identifier": {
      const resolved = resolveIdentifierReference(
        unwrapped,
        context,
        dependencies,
      );
      if (!resolved) return null;
      return `identifier:${resolved.key}`;
    }
    case "ArrowFunctionExpression":
    case "FunctionExpression": {
      const fn = unwrapped as RollupAstNode<
        ArrowFunctionExpression | FunctionExpression
      >;
      const ok = gatherFunctionDependencies(fn, context, dependencies);
      if (!ok) return null;
      const snippet = computeArgumentSnippet(
        context.magic,
        fn as unknown as AstNode,
      );
      if (!snippet) return null;
      return `fn:${hashSum(snippet)}`;
    }
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
          value.type !== "CallExpression" &&
          value.type !== "Identifier" &&
          value.type !== "ArrowFunctionExpression" &&
          value.type !== "FunctionExpression"
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

function buildParentMap(root: AstNode): WeakMap<AstNode, AstNode> {
  const map = new WeakMap<AstNode, AstNode>();
  const stack: AstNode[] = [root];
  while (stack.length > 0) {
    const node = stack.pop() as AstNode;
    for (const key of Object.keys(node as object)) {
      const value = (node as Record<string, unknown>)[key];
      if (!value) continue;
      if (Array.isArray(value)) {
        for (const item of value) {
          if (
            item &&
            typeof item === "object" &&
            "type" in (item as Record<string, unknown>)
          ) {
            map.set(item as AstNode, node);
            stack.push(item as AstNode);
          }
        }
      } else if (
        typeof value === "object" &&
        "type" in (value as Record<string, unknown>)
      ) {
        map.set(value as AstNode, node);
        stack.push(value as AstNode);
      }
    }
  }
  return map;
}

type CallProcessingContext = {
  magic: MagicString;
  imports: ImportInfo;
  processed: ProcessedCallMap;
  entriesByKey: Map<string, CacheModuleEntry>;
  entriesOrdered: CacheModuleEntry[];
  parentMap: WeakMap<AstNode, AstNode>;
  importBindings: Map<string, ImportBinding>;
  constBindings: Map<string, RollupAstNode<Expression>>;
  identifierEntries: Map<string, CacheModuleEntry>;
};

function dependencyKey(dependency: CacheDependency): string {
  if (dependency.kind === "cache") {
    return `cache:${dependency.identifier}`;
  }
  const imported =
    dependency.imported === null ? "default" : dependency.imported;
  const namespace = dependency.isNamespace ? "namespace" : "named";
  return `import:${dependency.source}:${imported}:${namespace}:${dependency.local}`;
}

function addDependency(
  dependencies: Map<string, CacheDependency>,
  dependency: CacheDependency,
): void {
  dependencies.set(dependencyKey(dependency), dependency);
}

function resolveIdentifierReference(
  identifier: Identifier,
  context: CallProcessingContext,
  dependencies: Map<string, CacheDependency>,
): { key: string; rendered: string } | null {
  const name = identifier.name;

  const cachedEntry = context.identifierEntries.get(name);
  if (cachedEntry) {
    addDependency(dependencies, { kind: "cache", identifier: cachedEntry.identifier });
    return { key: cachedEntry.key, rendered: cachedEntry.identifier };
  }

  const constInit = context.constBindings.get(name);
  if (constInit) {
    const normalizedInit = unwrapExpression(
      constInit as unknown as Expression,
    );
    if (
      normalizedInit.type === "CallExpression" &&
      isValibotCallExpression(normalizedInit as AstNode, context.imports)
    ) {
      const entry = ensureCacheEntry(
        normalizedInit as RollupAstNode<CallExpression>,
        context,
      );
      if (entry) {
        context.identifierEntries.set(name, entry);
        addDependency(dependencies, {
          kind: "cache",
          identifier: entry.identifier,
        });
        return { key: entry.key, rendered: entry.identifier };
      }
    }
  }

  const binding = context.importBindings.get(name);
  if (binding) {
    const dependency: CacheDependency = {
      kind: "import",
      source: binding.source,
      imported: binding.imported,
      isNamespace: binding.type === "namespace",
      local: binding.local,
    };
    addDependency(dependencies, dependency);
    const importKey = `import:${binding.source}:${
      binding.imported ?? "default"
    }:${binding.type}`;
    return { key: importKey, rendered: binding.local };
  }

  if (SAFE_GLOBAL_IDENTIFIERS.has(name)) {
    return { key: `global:${name}`, rendered: name };
  }

  return null;
}

function renderArgumentExpression(
  expr: Expression,
  context: CallProcessingContext,
  dependencies: Map<string, CacheDependency>,
): string | null {
  const unwrapped = unwrapExpression(expr);

  if (isValibotCallExpression(unwrapped as AstNode, context.imports)) {
    const nested = ensureCacheEntry(
      unwrapped as RollupAstNode<CallExpression>,
      context,
    );
    if (!nested) return null;
    addDependency(dependencies, {
      kind: "cache",
      identifier: nested.identifier,
    });
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
        const key =
          property.key.type === "Identifier"
            ? property.key.name
            : property.key.type === "Literal" &&
                property.key.value !== undefined
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
    case "ArrowFunctionExpression":
    case "FunctionExpression": {
      const fn = unwrapped as RollupAstNode<
        ArrowFunctionExpression | FunctionExpression
      >;
      const ok = gatherFunctionDependencies(fn, context, dependencies);
      if (!ok) return null;
      const snippet = computeArgumentSnippet(
        context.magic,
        fn as unknown as AstNode,
      );
      return snippet;
    }
    case "Identifier":
      return resolveIdentifierReference(
        unwrapped,
        context,
        dependencies,
      )?.rendered ?? null;
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
  const calleeName = calleeInfo.exported;

  const argumentExpressions: string[] = [];
  const keyParts: string[] = [];
  const dependencySet = new Map<string, CacheDependency>();

  for (const rawArg of call.arguments) {
    if (rawArg.type === "SpreadElement") {
      context.processed.set(call, null);
      return null;
    }
    const argument = unwrapExpression(rawArg as Expression);

    const rendered = renderArgumentExpression(argument, context, dependencySet);
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
      dependencies: Array.from(dependencySet.values()),
    };
    context.entriesByKey.set(key, entry);
    context.entriesOrdered.push(entry);
  }

  const parent = context.parentMap.get(call as AstNode);
  if (
    parent &&
    parent.type === "VariableDeclarator" &&
    parent.id.type === "Identifier"
  ) {
    const declaration = context.parentMap.get(parent as AstNode);
    if (
      declaration &&
      declaration.type === "VariableDeclaration" &&
      (declaration as VariableDeclaration).kind === "const"
    ) {
      context.identifierEntries.set(parent.id.name, entry);
    }
  }

  context.processed.set(call, entry);
  return entry;
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

function patternContainsValibot(
  pattern: RollupAstNode<Pattern>,
  valibotSymbols: Set<string>,
): boolean {
  switch (pattern.type) {
    case "Identifier":
      return valibotSymbols.has(pattern.name);
    case "ObjectPattern":
      return pattern.properties.some((prop) => {
        if (prop.type === "RestElement") {
          return patternContainsValibot(prop.argument, valibotSymbols);
        }
        if (prop.type === "Property") {
          return patternContainsValibot(prop.value, valibotSymbols);
        }
        return false;
      });
    case "ArrayPattern":
      return (
        pattern.elements.some((element) => {
          if (!element) return false;
          if (element.type === "RestElement") {
            return patternContainsValibot(element.argument, valibotSymbols);
          }
          return patternContainsValibot(element, valibotSymbols);
        }) ?? false
      );
    case "RestElement":
      return patternContainsValibot(pattern.argument, valibotSymbols);
    case "AssignmentPattern":
      return patternContainsValibot(pattern.left, valibotSymbols);
    default:
      return false;
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
  const importBindings = collectImportBindings(ast);
  const constBindings = collectConstBindings(ast);
  const parentMap = buildParentMap(ast as AstNode);
  if (imports.named.size === 0 && imports.namespaces.size === 0) {
    return { code, changed: false, cacheEntries: [], map: null };
  }

  const valibotSymbols = new Set<string>([
    ...imports.named.keys(),
    ...imports.namespaces,
  ]);

  // 重複宣言チェック
  const hasCollision = (() => {
    let shadowed = false;
    visitEstree(ast, {
      enter: (node) => {
        const rollupNode = node as AstNode;
        switch (rollupNode.type) {
          case "VariableDeclarator":
            if (
              patternContainsValibot(
                rollupNode.id as RollupAstNode<Pattern>,
                valibotSymbols,
              )
            ) {
              shadowed = true;
              return EXIT;
            }
            break;
          case "FunctionDeclaration":
          case "ClassDeclaration": {
            const id = (rollupNode as { id: Identifier | null }).id;
            if (id && valibotSymbols.has(id.name)) {
              shadowed = true;
              return EXIT;
            }
            break;
          }
          case "FunctionExpression":
          case "ArrowFunctionExpression":
            if (
              rollupNode.params.some((param) =>
                patternContainsValibot(
                  param as RollupAstNode<Pattern>,
                  valibotSymbols,
                ),
              )
            ) {
              shadowed = true;
              return EXIT;
            }
            break;
          case "CatchClause":
            if (
              rollupNode.param &&
              patternContainsValibot(
                rollupNode.param as RollupAstNode<Pattern>,
                valibotSymbols,
              )
            ) {
              shadowed = true;
              return EXIT;
            }
            break;
          case "ForInStatement":
          case "ForOfStatement": {
            const left = rollupNode.left;
            if (
              left &&
              left.type !== "VariableDeclaration" &&
              patternContainsValibot(
                left as RollupAstNode<Pattern>,
                valibotSymbols,
              )
            ) {
              shadowed = true;
              return EXIT;
            }
            break;
          }
        }
        return CONTINUE;
      },
    });
    return shadowed;
  })();
  if (hasCollision) {
    return { code, changed: false, cacheEntries: [], map: null };
  }

  const magic = new MagicString(code);
  const processed: ProcessedCallMap = new WeakMap();
  const entriesByKey = new Map<string, CacheModuleEntry>();
  const entriesOrdered: CacheModuleEntry[] = [];
  const replacements: { start: number; end: number; identifier: string }[] = [];
  const replacedNodes = new WeakSet<AstNode>();
  const identifierEntries = new Map<string, CacheModuleEntry>();

  const context: CallProcessingContext = {
    magic,
    imports,
    processed,
    entriesByKey,
    entriesOrdered,
    parentMap,
    importBindings,
    constBindings,
    identifierEntries,
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
    cacheEntries: entriesOrdered.map((entry) => ({
      ...entry,
      sourceId: config.sourceId,
    })),
    map,
  };
}
