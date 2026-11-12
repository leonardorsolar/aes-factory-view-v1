// Testa a troca de ciclos aes-cycle (js/cycle-json.js) com os JSON reais de aes-simple-ai-software-factory/docs/templates/cycles.
// Uso: node scripts/test-cycle-json.mjs [pasta-com-json]
import { createRequire } from "node:module";
import { readdirSync, readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import assert from "node:assert/strict";
const require = createRequire(import.meta.url);
require("../js/cycle-md.js"); require("../js/cycle-json.js");
const M = globalThis.CycleMd, J = globalThis.CycleJson;
// o id do ciclo é o nome do arquivo .md, não vai dentro dele
const viaMd = (cy) => ({ ...M.parse(M.serialize(cy)), id: cy.id });
const STEP_KEYS = new Set(["phase", "label", "run", "prompt", "reads", "writes", "next", "after", "group", "needs", "starts_round", "required", "confirm", "port", "description"]);

// 1) ida e volta sintética
const c = M.parse("# T\nAprovação: manual\nFases: A, B\n\n## A\n\n### Um\n- id: um\n- executa: skill s1\n- no agente: ag\n- lê: x.md\n- grava: um.md\n- aprovação: sim\n- vereditos: DONE → dois; BLOCKED → @humano\n\n## B\n\n### Dois\n- id: dois\n- executa: comando npm test\n- grava: dois.md\n- aprovação: não\n- vereditos: FAIL → um; DONE → @fim\n");
const { pack, warnings } = J.toPack(c);
assert.deepEqual(J.validate(pack), []);
assert.equal(pack.steps.um.run.skill, "s1"); assert.equal(pack.steps.um.run.agent, "ag");
assert.equal(pack.steps.um.next.DONE, "@next"); assert.equal(pack.steps.um.next.BLOCKED, "@human");
assert.equal(pack.steps.dois.run.script, "npm test"); assert.equal(pack.steps.dois.next.DONE, "@done"); assert.equal(pack.steps.dois.next.FAIL, "um");
assert.equal(pack.steps.um.confirm, true); assert.deepEqual(warnings, []);
const back = J.fromPack(pack, pack.cycle.default_profile);
assert.deepEqual(back.steps.map((s) => [s.id, s.kind, s.ref, s.agent, s.next]), c.steps.map((s) => [s.id, s.kind, s.ref, s.agent, s.next]));
assert.deepEqual(viaMd(back), back, "md ida e volta");

// 2) os JSON reais
const dir = process.argv[2] || "/home/solar/Documentos/00-Github/0comparacao/aes-simple-ai-software-factory/docs/templates/cycles";
if (!existsSync(dir)) console.log("(pasta de exemplos não encontrada: " + dir + ")");
else for (const f of readdirSync(dir).filter((n) => n.endsWith(".json"))) {
  const p0 = JSON.parse(readFileSync(join(dir, f), "utf8"));
  assert.deepEqual(J.validate(p0), [], f);
  for (const pr of J.profiles(p0)) {
    const cy = J.fromPack(p0, pr.id);
    assert.equal(cy.steps.length, pr.count, f + " perfil " + pr.id);
    cy.steps.forEach((s) => s.next && Object.values(s.next).forEach((d) => assert.ok(d.startsWith("@") || cy.steps.some((x) => x.id === d), f + ": destino solto " + d)));
    assert.deepEqual(viaMd(cy), cy, f + ": md ida e volta");
    const out = J.toPack(cy);
    assert.deepEqual(J.validate(out.pack), [], f);
    Object.values(out.pack.steps).forEach((st) => Object.keys(st).forEach((k) => assert.ok(STEP_KEYS.has(k), f + ": chave fora do formato: " + k)));
    const again = J.fromPack(out.pack, out.pack.cycle.default_profile);
    assert.deepEqual(again, cy, f + ": importar → exportar → importar é igual");
  }
  // perfil padrão: as mesmas etapas, na mesma ordem, com os mesmos executores, leituras e saídas
  const def = p0.cycle.default_profile, cy = J.fromPack(p0, def), want = p0.profiles[def].steps;
  assert.deepEqual(J.toPack(cy).pack.profiles[J.toPack(cy).pack.cycle.default_profile].steps, want, f + ": ordem das etapas");
  const o = J.toPack(cy).pack;
  // needs só vale entre etapas do perfil (as outras estão desligadas)
  want.forEach((k) => {
    ["run", "reads", "writes", "label", "required", "after", "prompt", "description"].forEach((fld) => assert.deepEqual(o.steps[k][fld], p0.steps[k][fld], f + ": " + k + "." + fld));
    const needs = (p0.steps[k].needs || []).filter((n) => want.includes(n));
    assert.deepEqual(o.steps[k].needs, needs.length ? needs : undefined, f + ": " + k + ".needs");
  });
  console.log("ok:", f, "→", J.profiles(p0).map((x) => x.id || "todas").join("/"));
}
console.log("ok: cycle-json");
