// 构建：把 src/main.js（含 Three.js 依赖）打成一个自包含的 index.html。
// 用法：node build.mjs
import { execFileSync } from "node:child_process";
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = dirname(fileURLToPath(import.meta.url));
mkdirSync(join(root, ".build"), { recursive: true });

execFileSync(
  "npx",
  [
    "--yes",
    "esbuild@0.24.0",
    "src/main.js",
    "--bundle",
    "--format=iife",
    "--minify",
    "--target=es2020",
    "--alias:three=./vendor/three.module.js",
    "--outfile=.build/bundle.js",
  ],
  { cwd: root, stdio: "inherit", shell: true }
);

const bundle = readFileSync(join(root, ".build", "bundle.js"), "utf8")
  .replace(/<\/script/gi, "<\\/script");

const template = readFileSync(join(root, "src", "index.html"), "utf8");
writeFileSync(join(root, "index.html"), template.replace("/*BUNDLE*/", () => bundle));

console.log(`built index.html (${(bundle.length / 1024).toFixed(0)} KB script)`);
