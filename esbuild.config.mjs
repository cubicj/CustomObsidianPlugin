import esbuild from "esbuild";
import process from "process";
import builtins from "module";
import { copyPluginFiles, printPluginDeployPlan } from "./build/windows-plugin-target.mjs";

const mode = process.argv[2] ?? "watch";
const prod = mode === "production";
const copiesToVault = mode === "watch:windows";

const copyToVault = {
  name: "copy-to-vault",
  setup(build) {
    build.onEnd((result) => {
      if (result.errors.length > 0) return;
      copyPluginFiles("dev:windows");
    });
  },
};

if (mode === "copy:windows") {
  copyPluginFiles("copy:windows");
  process.exit(0);
}

if (mode === "watch:windows") {
  printPluginDeployPlan("dev:windows");
}

const context = await esbuild.context({
  entryPoints: ["src/main.ts"],
  bundle: true,
  external: [
    "obsidian",
    "electron",
    "@codemirror/*",
    "@lezer/*",
    ...builtins.builtinModules,
  ],
  format: "cjs",
  target: "es2022",
  logLevel: "info",
  sourcemap: prod ? false : "inline",
  treeShaking: true,
  outfile: "main.js",
  minify: prod,
  plugins: copiesToVault ? [copyToVault] : [],
});

if (prod) {
  await context.rebuild();
  process.exit(0);
} else {
  await context.watch();
}
