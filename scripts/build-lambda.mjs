// Bundles the Lambda into build/lambda: index.mjs (+ source map), an executable run.sh for the
// Lambda Web Adapter, and web/ (the built SPA) when web/dist exists. Run via `npm run build:lambda`.
import { existsSync } from "node:fs";
import { chmod, copyFile, cp, mkdir, readdir, rm, stat } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { build } from "esbuild";

const root = fileURLToPath(new URL("..", import.meta.url));
const out = join(root, "build", "lambda");
const webDist = join(root, "web", "dist");

// CJS dependencies (express and friends) call require/__dirname, which do not exist in ESM output.
const banner = [
  'import { createRequire as __havenCreateRequire } from "node:module";',
  'import { fileURLToPath as __havenFileURLToPath } from "node:url";',
  'import { dirname as __havenDirname } from "node:path";',
  "const require = __havenCreateRequire(import.meta.url);",
  "const __filename = __havenFileURLToPath(import.meta.url);",
  "const __dirname = __havenDirname(__filename);",
].join("\n");

await rm(out, { recursive: true, force: true });
await mkdir(out, { recursive: true });

const result = await build({
  entryPoints: [join(root, "src", "lambda", "main.ts")],
  outfile: join(out, "index.mjs"),
  bundle: true,
  // Everything is bundled, @aws-sdk included: the runtime's preinstalled SDK version drifts.
  external: [],
  platform: "node",
  target: "node22",
  format: "esm",
  mainFields: ["module", "main"],
  sourcemap: true,
  sourcesContent: false,
  legalComments: "none",
  banner: { js: banner },
  metafile: true,
  logLevel: "warning",
});

await copyFile(join(root, "src", "lambda", "run.sh"), join(out, "run.sh"));
// The adapter execs run.sh as the handler; without the execute bit init fails with EACCES.
await chmod(join(out, "run.sh"), 0o755);

if (existsSync(webDist)) {
  await cp(webDist, join(out, "web"), { recursive: true });
} else {
  console.warn("web/dist not found: bundling without the web app (run the web build first)");
}

async function dirBytes(dir) {
  let total = 0;
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    total += entry.isDirectory() ? await dirBytes(path) : (await stat(path)).size;
  }
  return total;
}

const mb = (bytes) => `${(bytes / 1024 / 1024).toFixed(2)} MB`;
const bundleBytes = (await stat(join(out, "index.mjs"))).size;

// Largest packages by bundled bytes, to catch an accidental heavy import.
const [, bundle] = Object.entries(result.metafile.outputs).find(([file]) => file.endsWith("index.mjs"));
const byPackage = new Map();
for (const [file, info] of Object.entries(bundle.inputs)) {
  const match = file.match(/node_modules\/((?:@[^/]+\/)?[^/]+)/);
  const name = match ? match[1] : "(app)";
  byPackage.set(name, (byPackage.get(name) ?? 0) + info.bytesInOutput);
}
const top = [...byPackage.entries()].sort((a, b) => b[1] - a[1]).slice(0, 8);

console.log(`build/lambda/index.mjs ${mb(bundleBytes)} (build/lambda total ${mb(await dirBytes(out))})`);
for (const [name, bytes] of top) console.log(`  ${name.padEnd(40)} ${mb(bytes)}`);
