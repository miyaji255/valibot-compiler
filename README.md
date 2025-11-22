# valibot-compiler

An **unplugin** that precomputes repeated `valibot` schema calls at build time and injects cached references to speed up bundles across Rollup, Vite, esbuild, and Webpack.

> [!WARNING]
> This is an experimental project. Do not use it in production.

## Features
- Works across bundlers via `unplugin`.
- Generates one virtual module per cached valibot call (e.g. `valibot-compiler:cache/String__abcd1234`).
- Handles TS/JS entry files by default (`.ts`, `.tsx`, `.mts`, `.cts`, `.js`, `.jsx`, `.mjs`, `.cjs`).
- Safe fallback: skips transformation if valibot imports are shadowed.

## Installation

```bash
pnpm add -D valibot-compiler
# or
npm i -D valibot-compiler
```

## Usage

### Rollup
```ts
// rollup.config.ts
import { defineConfig } from "rollup";
import { ValibotCompiler } from "valibot-compiler";

export default defineConfig({
  input: "src/main.ts",
  plugins: [ValibotCompiler.rollup({})],
});
```

### Vite
```ts
// vite.config.ts
import { defineConfig } from "vite";
import { ValibotCompiler } from "valibot-compiler";

export default defineConfig({
  plugins: [ValibotCompiler.vite({})],
});
```

### esbuild
```ts
import { build } from "esbuild";
import { ValibotCompiler } from "valibot-compiler";

await build({
  entryPoints: ["src/main.ts"],
  bundle: true,
  plugins: [ValibotCompiler.esbuild({})],
});
```

### Webpack
```js
// webpack.config.js
const { ValibotCompiler } = require("valibot-compiler");

module.exports = {
  entry: "./src/main.ts",
  plugins: [ValibotCompiler.webpack({})],
};
```

## Options

```ts
type ValibotCompilerOptions = {
  /** File extensions to transform. Defaults to common TS/JS variants. */
  exts?: string[];
};
```

## How it works
The plugin walks valibot call expressions, computes deterministic identifiers, and replaces calls with imports from virtual modules such as `valibot-compiler:cache/Foo__abcd1234`. Each virtual module exports the computed expression as a default export and imports its dependencies (other cache identifiers) to stay tree-shake friendly.

## Development
- Build: `pnpm build`
- Test: `pnpm test`
- Focused run: `pnpm vitest run test/rollup.test.ts`

## License
MIT
