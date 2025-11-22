import { build } from "esbuild";
import ValibotCompiler from "../src/unplugin.ts";
import { spawnSync } from "node:child_process";

await build({
  entryPoints: [
    `${import.meta.dirname}/test_data/deep/schema.ts`,
    `${import.meta.dirname}/test_data/many_features/schema.ts`,
    `${import.meta.dirname}/test_data/optional_nullable/schema.ts`,
    `${import.meta.dirname}/test_data/wide/schema.ts`,
    `${import.meta.dirname}/test_data/real/schema.ts`,
  ],
  bundle: true,
  outdir: `${import.meta.dirname}/test_data`,
  platform: "node",
  format: "esm",
  external: ["valibot"],
  splitting: false,
  treeShaking: true,
  plugins: [ValibotCompiler.esbuild({})],
});

function runRunner(modulePath: string): {
  rss: number;
  heapUsed: number;
  external: number;
} {
  const child = spawnSync(process.execPath, [
    "--expose-gc",
    "--experimental-strip-types",
    "--no-warnings=ExperimentalWarning",
    `${import.meta.dirname}/memory-bench.child.ts`,
    modulePath,
  ]);
  if (child.status !== 0) {
    console.error(child.stderr.toString());
    throw new Error(`Process exited with code ${child.status}`);
  }
  return JSON.parse(child.stdout.toString());
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
    name: "Real | without Compile",
    module: "test_data/real/schema.ts",
  },
  {
    name: "Real | with Compile",
    module: "test_data/real/schema.js",
  },
];

const results = tasks.map((task) => {
  const memoryUsage = runRunner(`${import.meta.dirname}/${task.module}`);
  return {
    name: task.name,
    "rss (bytes)": memoryUsage.rss,
    "heap Used (bytes)": memoryUsage.heapUsed,
    "external (bytes)": memoryUsage.external,
  };
});

console.table(results);
