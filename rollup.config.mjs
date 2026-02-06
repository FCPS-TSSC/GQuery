import resolve from "@rollup/plugin-node-resolve";
import commonjs from "@rollup/plugin-commonjs";
import typescript from "@rollup/plugin-typescript";
import { dts } from "rollup-plugin-dts";


function rollupGasBundler() {
    return {
        name: "rollup-gas-bundler",
        generateBundle(outputOptions, bundle) {
            const bundleName = outputOptions.name;
            if (!bundleName) throw new Error("Set output.name for iife bundling.");

            for (const file of Object.values(bundle)) {
                if (file.type !== "chunk") continue;

                const footerLines = [];
                footerLines.push(
                    ...(file.exports || []).map(
                        (exportedFunction) => `function ${exportedFunction}(...args) { return ${bundleName}.${exportedFunction}(...args); }`
                    )
                );
                file.code += footerLines.join("\n") + "\n";
            }
        }
    };
}

const plugins = [
    resolve({ browser: true, preferBuiltins: false }),
    commonjs(),
    typescript({ tsconfig: "./tsconfig.json" })
];

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
        plugins,
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
        plugins: [...plugins, rollupGasBundler()],
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
