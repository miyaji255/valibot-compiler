import { build } from "esbuild";
import ValibotCompiler from "../src/unplugin.ts";
import { spawnSync } from "node:child_process";

await build({
  entryPoints: [
    `${import.meta.dirname}/test_data/deep/schema.ts`,
    `${import.meta.dirname}/test_data/many_features/schema.ts`,
    `${import.meta.dirname}/test_data/optional_nullable/schema.ts`,
    `${import.meta.dirname}/test_data/wide/schema.ts`,
    `${import.meta.dirname}/test_data/simple/schema.ts`,
  ],
  bundle: true,
  outdir: `${import.meta.dirname}/test_data`,
  platform: "node",
  format: "esm",
  external: ["valibot"],
  splitting: false,
  plugins: [ValibotCompiler.esbuild({})],
});

function runRunner(modulePath: string): {
  rss: number;
  heapTotal: number;
  heapUsed: number;
  external: number;
} {
  const process = spawnSync("node", [
    "--expose-gc",
    "--experimental-strip-types",
    "--no-warnings=ExperimentalWarning",
    `${import.meta.dirname}/memory-bench.child.ts`,
    modulePath,
  ]);
  if (process.status !== 0) {
    console.error(process.stderr.toString());
    throw new Error(`Process exited with code ${process.status}`);
  }
  return JSON.parse(process.stdout.toString());
}

const tasks: {
  name: string;
  module: string;
}[] = [
  {
    name: "Deep | without Compile",
    module: "test_data/deep/schema.ts",
  },
  {
    name: "Deep | with Compile",
    module: "test_data/deep/schema.js",
  },
  {
    name: "Many Features | without Compile",
    module: "test_data/many_features/schema.ts",
  },
  {
    name: "Many Features | with Compile",
    module: "test_data/many_features/schema.js",
  },
  {
    name: "Optional Nullable | without Compile",
    module: "test_data/optional_nullable/schema.ts",
  },
  {
    name: "Optional Nullable | with Compile",
    module: "test_data/optional_nullable/schema.js",
  },
  {
    name: "Wide | without Compile",
    module: "test_data/wide/schema.ts",
  },
  {
    name: "Wide | with Compile",
    module: "test_data/wide/schema.js",
  },
  {
    name: "Simple | without Compile",
    module: "test_data/simple/schema.ts",
  },
  {
    name: "Simple | with Compile",
    module: "test_data/simple/schema.js",
  },
];

const results = tasks.map((task) => {
  const memoryUsage = runRunner(`${import.meta.dirname}/${task.module}`);
  return {
    name: task.name,
    ...memoryUsage,
  };
});

console.table(results);
