// Troca de ciclos no formato "aes-cycle" (JSON v1), o mesmo de aes-simple-ai-software-factory/docs/templates/cycles.
//   toPack(ciclo)            → { pack, warnings }   para exportar
//   fromPack(pack, perfil)   → ciclo                para importar (o perfil escolhe quais etapas entram)
//   validate(pack)           → [erros]
//   profiles(pack)           → [{ id, label, count }]
// Diferenças entre os dois mundos (por isso há avisos):
//   · destinos: @fim ↔ @done, @humano ↔ @human; "@next" = a etapa seguinte; @wait-author e @rejected viram @humano e @fim
//   · "comando" ↔ run.script; "aprovação humana" ↔ confirm: true; "ci" vira humano
//   · o que este app não edita (description, prompt, after, group, needs, required, port, starts_round, model, resume) é guardado em
//     step.x e devolvido na exportação, para o ciclo voltar igual
//   · status e perfis/roteamento extras não existem no formato: status se perde; só um perfil é exportado
(function () {
  "use strict";
  const root = typeof window !== "undefined" ? window : globalThis;
  const M = root.CycleMd;

  const COLUMN = { discover: "To Do", design: "In Progress", build: "In Progress", verify: "In Review", deliver: "In Review", operate: "Done" };
  const MODES = {
    manual: { label: "Manual: aprovo cada etapa", pause_after: "all" },
    stop_at_pr: { label: "Para no PR", pause_after: ["pr"] },
    auto: { label: "Automático: o approver faz o merge", pause_after: [] },
  };
  const DEST_OUT = { "@fim": "@done", "@humano": "@human" };
  const DEST_IN = { "@done": "@fim", "@human": "@humano", "@wait-author": "@humano", "@rejected": "@fim" };
  const EXTRA = ["description", "prompt", "after", "group", "required", "port", "starts_round"]; // copiados como estão
  const us = (s) => String(s).replace(/-/g, "_");
  const dash = (s) => String(s).replace(/_/g, "-");
  const phaseId = (name) => us(M.slug(name)) || "fase";

  function validate(pack) {
    const e = [];
    if (!pack || typeof pack !== "object" || Array.isArray(pack)) return ["o arquivo não é um objeto JSON"];
    if (pack.format !== "aes-cycle") e.push('format deve ser "aes-cycle" (veio ' + JSON.stringify(pack.format) + ")");
    if (pack.version !== 1) e.push("version " + JSON.stringify(pack.version) + " não é suportada (só 1)");
    if (!pack.cycle || !pack.cycle.id) e.push("falta cycle.id");
    if (!pack.steps || typeof pack.steps !== "object" || !Object.keys(pack.steps).length) e.push("o ciclo não tem etapas");
    return e;
  }

  function profiles(pack) {
    const out = Object.entries(pack.profiles || {}).map(([id, p]) => ({ id, label: p.label || id, count: (p.steps || []).filter((k) => pack.steps[k]).length }));
    out.push({ id: "", label: "Todas as etapas", count: Object.keys(pack.steps).length });
    return out;
  }

  // ---------- importar ----------
  function fromPack(pack, profileId) {
    const keys = Object.keys(pack.steps);
    const list = profileId && pack.profiles && pack.profiles[profileId] ? pack.profiles[profileId].steps || [] : keys;
    const order = list.filter((k) => pack.steps[k]), inSet = new Set(order);
    const phaseLabel = {}; (pack.phases || []).forEach((p) => { phaseLabel[p.id] = p.label || p.id; });
    const label = (id) => phaseLabel[id] || String(id).charAt(0).toUpperCase() + String(id).slice(1);
    const dest = (d, i) => {
      if (d === "@next") return order[i + 1] ? dash(order[i + 1]) : "@fim";
      if (DEST_IN[d]) return DEST_IN[d];
      if (pack.steps[d]) { if (inSet.has(d)) return dash(d); const after = keys.slice(keys.indexOf(d) + 1).find((k) => inSet.has(k)); return after ? dash(after) : "@fim"; }
      return "@humano";
    };
    const steps = order.map((k, i) => {
      const st = pack.steps[k], run = st.run || {}, x = {};
      let kind = "", ref = "", agent = "";
      if (run.skill) { kind = "skill"; ref = run.skill; agent = run.agent ? M.slug(run.agent) : ""; }
      else if (run.agent) { kind = "agent"; ref = run.agent; }
      else if (run.script) { kind = "command"; ref = run.script; }
      else if (run.human || run.ci) { kind = "human"; if (run.ci) x.ci = true; }
      if (run.model) x.model = run.model;
      if (run.resume) x.resume = true;
      EXTRA.forEach((f) => { if (st[f] !== undefined && st[f] !== false) x[f] = st[f]; });
      const needs = (st.needs || []).filter((n) => inSet.has(n)).map(dash); if (needs.length) x.needs = needs;
      const next = {}; Object.entries(st.next || {}).forEach(([v, d]) => { next[String(v).toUpperCase()] = dest(d, i); });
      const s = { id: dash(k), label: st.label || k, phase: label(st.phase), kind, ref, agent, reads: (st.reads || []).slice(), writes: st.writes || "", status: "", approve: !!st.confirm, next };
      if (Object.keys(x).length) s.x = x;
      return s;
    });
    const phases = (pack.phases || []).map((p) => p.label || p.id);
    steps.forEach((s) => { if (!phases.includes(s.phase)) phases.push(s.phase); });
    const c = pack.cycle;
    return { id: dash(c.id), label: c.label || c.id, description: c.description || "", approval: M.APPROVALS[c.approval] ? c.approval : "stop_at_pr", phases: phases.length ? phases : M.PHASES.slice(), steps };
  }

  // ---------- exportar ----------
  function toPack(c) {
    const warnings = [], ids = c.steps.map((s) => s.id);
    const phases = [], pid = {};
    (c.phases && c.phases.length ? c.phases : M.PHASES).forEach((name) => {
      let id = phaseId(name), n = 2; while (phases.some((p) => p.id === id)) id = phaseId(name) + "_" + n++;
      pid[name] = id; phases.push({ id, label: name, column: COLUMN[id] || "In Progress" });
    });
    c.steps.forEach((s) => { if (!pid[s.phase]) { const id = phaseId(s.phase); pid[s.phase] = id; phases.push({ id, label: s.phase, column: "In Progress" }); } });
    const steps = {};
    c.steps.forEach((s, i) => {
      const x = s.x || {}, run = {}, nxt = c.steps[i + 1], name = s.label || s.id;
      if (s.kind === "agent") run.agent = s.ref;
      else if (s.kind === "skill") { run.skill = s.ref; if (s.agent) run.agent = s.agent; }
      else if (s.kind === "command") run.script = s.ref;
      else if (s.kind === "human") { if (x.ci) run.ci = true; else run.human = true; }
      else { run.human = true; warnings.push(`"${name}" não tem quem execute: exportada como humano`); }
      if ((s.kind === "agent" || s.kind === "skill" || s.kind === "command") && !s.ref) warnings.push(`"${name}" não tem nome de ${M.KIND_LABEL[s.kind]}`);
      if (x.model) run.model = x.model;
      if (x.resume) run.resume = true;
      const next = {};
      Object.entries(s.next || {}).forEach(([v, d]) => { next[v] = DEST_OUT[d] || (nxt && d === nxt.id ? "@next" : ids.includes(d) ? us(d) : d); });
      if (!Object.keys(next).length) { next.DONE = nxt ? "@next" : "@done"; next.BLOCKED = "@human"; }
      const o = { phase: pid[s.phase], label: s.label || s.id };
      if (x.description) o.description = x.description;
      o.run = run;
      if (x.prompt) o.prompt = x.prompt;
      if (s.reads && s.reads.length) o.reads = s.reads.slice();
      if (s.writes) o.writes = s.writes; else { o.writes = us(s.id) + ".md"; warnings.push(`"${name}" não grava arquivo: usei ${o.writes}`); }
      o.next = next;
      ["after", "group"].forEach((f) => { if (x[f] !== undefined) o[f] = x[f]; });
      if (x.needs && x.needs.length) o.needs = x.needs.map(us);
      ["required", "port", "starts_round"].forEach((f) => { if (x[f] !== undefined) o[f] = x[f]; });
      if (s.approve) o.confirm = true;
      if (s.status) warnings.push(`o status de "${name}" não existe no formato aes-cycle e ficou de fora`);
      steps[us(s.id)] = o;
    });
    const id = us(M.slug(c.id || c.label)) || "ciclo", mode = M.APPROVALS[c.approval] ? c.approval : "stop_at_pr";
    const pack = {
      format: "aes-cycle", version: 1,
      cycle: { id, label: c.label || id, description: c.description || "", approval: mode, default_profile: id },
      phases, approval_modes: { [mode]: MODES[mode] }, steps,
      profiles: { [id]: { label: c.label || id, steps: Object.keys(steps) } },
    };
    return { pack, warnings };
  }

  root.CycleJson = { validate, profiles, fromPack, toPack };
})();
