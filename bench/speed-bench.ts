import DeepSchema from "./test_data/deep/schema.ts";
import * as DeepData from "./test_data/deep/data.ts";
import ManyFeaturesSchema from "./test_data/many_features/schema.ts";
import * as ManyFeaturesData from "./test_data/many_features/data.ts";
import OptionalNullableSchema from "./test_data/optional_nullable/schema.ts";
import * as OptionalNullableData from "./test_data/optional_nullable/data.ts";
import WideSchema from "./test_data/wide/schema.ts";
import * as WideData from "./test_data/wide/data.ts";
import SimpleSchema from "./test_data/simple/schema.ts";
import * as SimpleData from "./test_data/simple/data.ts";
import { safeParse } from "valibot";
import { Bench } from "tinybench";
import { build } from "esbuild";
import ValibotCompiler from "../src/unplugin.ts";

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

const DeepSchemaCompiled = await import("./test_data/deep/schema.js");
const ManyFeaturesSchemaCompiled = await import(
  "./test_data/many_features/schema.js"
);
const OptionalNullableSchemaCompiled = await import(
  "./test_data/optional_nullable/schema.js"
);
const WideSchemaCompiled = await import("./test_data/wide/schema.js");
const SimpleSchemaCompiled = await import("./test_data/simple/schema.js");

const bench = new Bench();

bench.add("Deep Schema - Valid Data | without Compile", () => {
  safeParse(DeepSchema, DeepData.valid);
});
bench.add("Deep Schema - Valid Data | with Compile", () => {
  safeParse(DeepSchemaCompiled.default, DeepData.valid);
});

bench.add("Many Features - Valid Data | without Compile", () => {
  safeParse(ManyFeaturesSchema, ManyFeaturesData.valid);
});
bench.add("Many Features - Valid Data | with Compile", () => {
  safeParse(ManyFeaturesSchemaCompiled.default, ManyFeaturesData.valid);
});

bench.add("Optional Nullable - Valid Data | without Compile", () => {
  safeParse(OptionalNullableSchema, OptionalNullableData.valid.data);
});
bench.add("Optional Nullable - Valid Data | with Compile", () => {
  safeParse(
    OptionalNullableSchemaCompiled.default,
    OptionalNullableData.valid.data,
  );
});

bench.add("Wide Schema - Valid Data | without Compile", () => {
  safeParse(WideSchema, WideData.valid);
});
bench.add("Wide Schema - Valid Data | with Compile", () => {
  safeParse(WideSchemaCompiled.default, WideData.valid);
});

bench.add("Simple Schema - Valid Data | without Compile", () => {
  safeParse(SimpleSchema, SimpleData.valid);
});
bench.add("Simple Schema - Valid Data | with Compile", () => {
  safeParse(SimpleSchemaCompiled.default, SimpleData.valid);
});

await bench.run();
console.table(bench.table());
