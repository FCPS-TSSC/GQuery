import resolve from "@rollup/plugin-node-resolve";
import commonjs from "@rollup/plugin-commonjs";
import typescript from "@rollup/plugin-typescript";
import { dts } from "rollup-plugin-dts";

export default [
  {
    input: "src/index.ts",
    output: {
      file: "dist/bundle.js",
      format: "es",
      sourcemap: true,
      interop: "esModule",
      name: "GQuery",
    },
    plugins: [
      resolve(),
      commonjs(),
      typescript({
        compilerOptions: { downlevelIteration: true },
        outputToFilesystem: true,
      }),
    ],
    external: ["google-apps-script"],
  },
  {
    input: "src/index.ts",
    output: {
      file: "dist/bundle.global.js",
      format: "iife",
      sourcemap: true,
      interop: "esModule",
      name: "GQuery",
    },
    plugins: [
      resolve(),
      commonjs(),
      typescript({
        compilerOptions: { downlevelIteration: true },
        outputToFilesystem: true,
      }),
    ],
    external: ["google-apps-script"],
  },
  {
    input: "dist/types/index.d.ts",
    output: [{ file: "dist/bundle.d.ts", format: "es" }],
    plugins: [dts()],
  },
  {
    input: "dist/types/index.d.ts",
    output: [{ file: "dist/bundle.global.d.ts", format: "es" }],
    plugins: [dts()],
  },
];
