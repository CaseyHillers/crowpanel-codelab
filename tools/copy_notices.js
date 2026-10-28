import { copyFile, mkdir } from "node:fs/promises";

await mkdir("dist/notices", { recursive: true });
await copyFile("LICENSE", "dist/LICENSE.txt");
for (const [dependency, filename] of [
  ["esptool-js", "LICENSE"],
  ["pako", "LICENSE"],
  ["atob-lite", "LICENSE.md"],
  ["@codemirror/autocomplete", "LICENSE"],
  ["@codemirror/commands", "LICENSE"],
  ["@codemirror/lang-python", "LICENSE"],
  ["@codemirror/language", "LICENSE"],
  ["@codemirror/state", "LICENSE"],
  ["@codemirror/streamparser", "LICENSE"],
  ["@codemirror/view", "LICENSE"],
  ["@lezer/common", "LICENSE"],
  ["@lezer/highlight", "LICENSE"],
  ["@lezer/lr", "LICENSE"],
  ["@lezer/python", "LICENSE"],
  ["@marijn/find-cluster-break", "LICENSE"],
  ["crelt", "LICENSE"],
  ["style-mod", "LICENSE"],
  ["w3c-keyname", "LICENSE"],
]) {
  const noticeName = dependency.replace("@", "").replaceAll("/", "-");
  await copyFile(`node_modules/${dependency}/${filename}`, `dist/notices/${noticeName}.txt`);
}
await copyFile("site/vendor-notices.md", "dist/notices/workshop.md");
