declare module "rollup/dist/shared/parseAst.js" {
  import type { AstNode } from "../estree-transform";

  export interface RollupParseOptions {
    allowReturnOutsideFunction?: boolean;
    jsx?: boolean;
  }

  export function parseAst(
    input: string,
    options?: RollupParseOptions,
  ): AstNode;
}
