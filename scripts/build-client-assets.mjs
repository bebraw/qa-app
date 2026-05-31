import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import ts from "typescript";

const inputPath = "src/client/panel-live.ts";
const outputPath = ".generated/panel-live.client.js";
const source = await readFile(inputPath, "utf8");
const result = ts.transpileModule(source, {
  compilerOptions: {
    module: ts.ModuleKind.ES2022,
    target: ts.ScriptTarget.ES2022,
    strict: true,
  },
  fileName: inputPath,
});

await mkdir(dirname(outputPath), { recursive: true });
await writeFile(join(outputPath), result.outputText, "utf8");
