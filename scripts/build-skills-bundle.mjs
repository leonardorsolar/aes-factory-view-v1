// Empacota template/skills e template/agents em js/skills-bundle.js:
// o navegador não lê pastas do repo quando a página abre por file://.
// Uso: node scripts/build-skills-bundle.mjs   (rode de novo depois de editar template/)
import { readdirSync, readFileSync, writeFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(fileURLToPath(import.meta.url), "..", "..");
const SKIP = new Set(["__pycache__", "jobs", "tasks", ".DS_Store", "node_modules"]);
const walk = (dir) => readdirSync(dir).filter((n) => !SKIP.has(n)).flatMap((n) => {
  const p = join(dir, n);
  return statSync(p).isDirectory() ? walk(p) : [p];
});
const pack = (srcDir, destPrefix) =>
  Object.fromEntries(walk(join(root, srcDir)).map((p) => [
    destPrefix + "/" + relative(join(root, srcDir), p).split("\\").join("/"),
    readFileSync(p, "utf8"),
  ]));

const bundle = {
  skills: pack("template/skills", ".claude/skills"),
  agents: pack("template/agents", ".claude/agents"),
};
writeFileSync(join(root, "js", "skills-bundle.js"),
  "// GERADO por scripts/build-skills-bundle.mjs — não edite à mão.\nwindow.SCAN_BUNDLE = " + JSON.stringify(bundle) + ";\n");
console.log("skills:", Object.keys(bundle.skills).length, "agents:", Object.keys(bundle.agents).length);
