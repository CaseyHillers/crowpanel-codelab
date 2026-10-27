import { copyFile, mkdir } from "node:fs/promises";

await mkdir("dist/notices", { recursive: true });
await copyFile("LICENSE", "dist/LICENSE.txt");
for (const [dependency, filename] of [
  ["esptool-js", "LICENSE"],
  ["pako", "LICENSE"],
  ["atob-lite", "LICENSE.md"],
]) {
  await copyFile(`node_modules/${dependency}/${filename}`, `dist/notices/${dependency}.txt`);
}
await copyFile("site/vendor-notices.md", "dist/notices/workshop.md");
