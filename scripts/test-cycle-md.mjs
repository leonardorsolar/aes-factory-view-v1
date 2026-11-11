// Testa o formato dos ciclos (js/cycle-md.js): ler → gravar → ler dá o mesmo resultado.
// Uso: node scripts/test-cycle-md.mjs
import { createRequire } from "node:module";
import assert from "node:assert/strict";
const require = createRequire(import.meta.url);
require("../js/cycle-md.js");
const M = globalThis.CycleMd;

const src = `# Bug simples
Descrição: bug pequeno, 1 arquivo
Aprovação: stop_at_pr

## Discover

### Intake
- id: intake
- executa: agente orquestrador
- grava: intake.md
- status: READY_FOR_BUILD
- aprovação: não
- vereditos: DONE → build; BLOCKED → @humano

## Build

### Build
- id: build
- executa: skill sdlc-build
- no agente: implementer
- lê: intake.md, issue.md
- grava: build.md
- aprovação: sim
- vereditos: DONE → @fim; FAIL → intake
`;
const c = M.parse(src);
assert.equal(c.label, "Bug simples");
assert.equal(c.approval, "stop_at_pr");
assert.equal(c.steps.length, 2);
assert.deepEqual(c.steps[0].next, { DONE: "build", BLOCKED: "@humano" });
assert.equal(c.steps[1].approve, true);
assert.equal(c.steps[1].kind, "skill");
assert.equal(c.steps[1].ref, "sdlc-build");
assert.equal(c.steps[1].agent, "implementer");
assert.equal(c.steps[0].agent, "");
assert.deepEqual(c.steps[1].reads, ["intake.md", "issue.md"]);
assert.deepEqual(c.steps[0].reads, []);
assert.deepEqual(M.parse(M.serialize(c)), c, "ida e volta");

// ids repetidos e fase desconhecida
const d = M.parse("# X\n\n## Custom\n\n### A\n\n### A\n");
assert.deepEqual(d.steps.map((s) => s.id), ["a", "a-2"]);
assert.equal(d.steps[0].phase, "Custom");
assert.ok(M.serialize(d).includes("## Custom"));

// fases próprias: ordem preservada, inclusive vazias
const f = M.parse("# F\nAprovação: manual\nFases: Ideia, Código, Entrega\n\n## Código\n\n### X\n");
assert.deepEqual(f.phases, ["Ideia", "Código", "Entrega"]);
assert.equal(f.steps[0].phase, "Código");
assert.deepEqual(M.parse(M.serialize(f)), f, "fases ida e volta");
assert.equal(M.parse("# S\n").phases, undefined);

// agente
const a = M.parseAgent("---\nname: architect\ndescription: Desenha a solução\ntools: Read, Grep\nmodel: sonnet\n---\n\nVocê é o arquiteto.\n");
assert.equal(a.name, "architect");
assert.deepEqual(a.tools, ["Read", "Grep"]);
assert.equal(a.body, "Você é o arquiteto.\n");
assert.deepEqual(M.parseAgent(M.serializeAgent(a)), { ...a, body: a.body });
console.log("ok: ciclo e agente");
