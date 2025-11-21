// @ts-check
import { defineConfig } from "rollup";
import ValibotCompiler from "./dist/unplugin.js";

export default defineConfig({
  input: "temp/file.js",
  plugins: [ValibotCompiler.rollup({})],
});
