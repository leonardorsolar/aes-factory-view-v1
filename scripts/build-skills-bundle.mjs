// Empacota template/ em js/skills-bundle.js: o navegador não lê pastas do repo quando a página abre por file://.
// Tudo é instalado na PASTA CENTRAL (js/home.js), nunca nos apps.
//   managed  → sempre sobrescrito (agentes, skills, hooks, hook do Activity): é a Factory que mantém
//   seed     → só criado se faltar (memória, ciclos, contexto): o usuário e os agentes editam
//   claudeMd → trecho do CLAUDE.md entre marcadores (o resto do arquivo é preservado)
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
const read = (p) => readFileSync(join(root, p), "utf8");

const bundle = {
  skills: pack("template/skills", ".claude/skills"),
  agents: pack("template/agents", ".claude/agents"),
  hooks: pack("template/hooks", ".claude/hooks"),
  files: { ".aes/activity-hook.mjs": read("scripts/activity-hook.mjs") },
  seed: {
    ...pack("template/memory", ".claude/memory"),
    ...pack("template/cycles", ".claude/cycles"),
    "contexto/contexto.md": read("template/contexto.md"),
  },
  claudeMd: read("template/CLAUDE.md"),
};
writeFileSync(join(root, "js", "skills-bundle.js"),
  "// GERADO por scripts/build-skills-bundle.mjs — não edite à mão.\nwindow.SCAN_BUNDLE = " + JSON.stringify(bundle) + ";\n");
const n = (o) => Object.keys(o).length;
console.log("skills:", n(bundle.skills), "agents:", n(bundle.agents), "hooks:", n(bundle.hooks), "files:", n(bundle.files), "seed:", n(bundle.seed));
