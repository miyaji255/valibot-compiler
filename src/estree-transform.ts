import type { NodeMap, Program } from "estree";
import type { RollupAstNode } from "rollup";

export type AstNode = {
  [K in keyof NodeMap]: RollupAstNode<NodeMap[K]>;
}[keyof NodeMap];

export interface TransformOut {
  code: string;
  changed: boolean;
}

type ImportInfo = {
  named: Map<string, string>;
  namespaces: Set<string>;
};

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
            : (specifier.imported.value as string);
        named.set(specifier.local.name, imported);
      } else if (specifier.type === "ImportNamespaceSpecifier") {
        namespaces.add(specifier.local.name);
      }
    }
  }

  return { named, namespaces };
}

export function transformWithEstree(code: string, ast: AstNode): TransformOut {
  if (ast.type !== "Program") return { code, changed: false };

  const imports = collectValibotImports(ast);
  if (imports.named.size === 0 && imports.namespaces.size === 0) {
    return { code, changed: false };
  }

  // TODO: implement transform logic here
  throw new Error("Not implemented");
}
