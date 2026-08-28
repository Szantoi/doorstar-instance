import { cp, mkdir } from "node:fs/promises";
import { fileURLToPath } from "node:url";

const sourceDirectory = new URL("../src/web/static/", import.meta.url);
const targetDirectory = new URL("../dist/web/static/", import.meta.url);

await mkdir(fileURLToPath(targetDirectory), { recursive: true });
await cp(fileURLToPath(sourceDirectory), fileURLToPath(targetDirectory), {
  recursive: true,
  force: true,
});
