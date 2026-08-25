const { existsSync, lstatSync, rmSync } = require("node:fs");
const { basename, relative, resolve } = require("node:path");

const projectRoot = resolve(__dirname, "..");
const outputDirectory = resolve(projectRoot, "dist");
const outputRelativePath = relative(projectRoot, outputDirectory);

if (outputRelativePath !== "dist" || basename(outputDirectory) !== "dist") {
  throw new Error("Refusing to clean an unexpected build output directory.");
}

if (existsSync(outputDirectory) && lstatSync(outputDirectory).isSymbolicLink()) {
  throw new Error("Refusing to clean a symbolic-link build output directory.");
}

rmSync(outputDirectory, { recursive: true, force: true });
