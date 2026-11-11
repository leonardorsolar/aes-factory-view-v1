// Formato de um ciclo em Markdown (.claude/cycles/<id>.md) e do arquivo de agente (.claude/agents/<nome>.md).
// Sem motor: o Claude Code segue o roteiro; esta página só lê e grava esses arquivos.
//
//   # Bug simples                      ← nome do ciclo
//   Descrição: bug pequeno, 1 arquivo
//   Aprovação: stop_at_pr              ← manual | stop_at_pr | auto
//   Fases: Discover, Design, Build     ← colunas, na ordem (opcional; sem isso valem as 6 padrão)
//
//   ## Discover                        ← coluna (fase)
//   ### Intake                         ← card (etapa)
//   - id: intake
//   - executa: agente intake           ← agente | skill | comando | humano
//   - no agente: doc-writer            ← (só skill) agente dentro do qual a skill roda; opcional
//   - lê: issue.md, prd.md             ← o que a etapa lê (entrada)
//   - grava: intake.md
//   - status: READY_FOR_SPEC           ← status que a entrega libera
//   - aprovação: sim                   ← sim = para e espera você
//   - vereditos: DONE → spec; BLOCKED → @humano
(function () {
  "use strict";
  const root = typeof window !== "undefined" ? window : globalThis;

  const PHASES = ["Discover", "Design", "Build", "Verify", "Deliver", "Operate"];
  const KINDS = { agente: "agent", skill: "skill", comando: "command", humano: "human" };
  const KIND_LABEL = { agent: "agente", skill: "skill", command: "comando", human: "humano" };
  const APPROVALS = { manual: "Manual", stop_at_pr: "Para no PR", auto: "Automático" };

  const slug = (s) => String(s || "").trim().toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");

  const blank = () => ({ id: "", label: "", description: "", approval: "stop_at_pr", steps: [] });

  function parse(text) {
    const c = blank(); let phase = null, step = null;
    String(text || "").split(/\r?\n/).forEach((raw) => {
      const line = raw.trimEnd();
      let m;
      if ((m = /^###\s+(.+)$/.exec(line))) {
        step = { id: "", label: m[1].trim(), phase: phase || PHASES[0], kind: "", ref: "", agent: "", reads: [], writes: "", status: "", approve: false, next: {} };
        c.steps.push(step);
      } else if ((m = /^##\s+(.+)$/.exec(line))) { phase = m[1].trim(); step = null; }
      else if ((m = /^#\s+(.+)$/.exec(line))) { c.label = m[1].trim(); }
      else if (step && (m = /^-\s*([^:]+):\s*(.*)$/.exec(line))) {
        const k = m[1].trim().toLowerCase(), v = m[2].trim();
        if (k === "id") step.id = slug(v);
        else if (k === "executa") {
          const w = v.split(/\s+/), kind = KINDS[(w[0] || "").toLowerCase()];
          if (kind) { step.kind = kind; step.ref = w.slice(1).join(" "); }
        }
        else if (k === "no agente") step.agent = slug(v);
        else if (k === "lê" || k === "le") step.reads = v.split(",").map((x) => x.trim()).filter(Boolean);
        else if (k === "grava") step.writes = v;
        else if (k === "status") step.status = v;
        else if (k === "aprovação" || k === "aprovacao") step.approve = /^(sim|true|s)$/i.test(v);
        else if (k === "vereditos") v.split(";").forEach((p) => {
          const r = /^\s*([A-Za-z0-9_-]+)\s*(?:→|->)\s*(\S+)\s*$/.exec(p);
          if (r) step.next[r[1].toUpperCase()] = r[2];
        });
      } else if (!step && !phase) {
        if ((m = /^Descri[çc][ãa]o:\s*(.*)$/i.exec(line))) c.description = m[1].trim();
        else if ((m = /^Aprova[çc][ãa]o:\s*(\S+)/i.exec(line)) && APPROVALS[m[1]]) c.approval = m[1];
        else if ((m = /^Fases:\s*(.*)$/i.exec(line))) { const l = m[1].split(",").map((x) => x.trim()).filter(Boolean); if (l.length) c.phases = l; }
      }
    });
    const seen = new Set();
    c.steps.forEach((s) => {
      let id = s.id || slug(s.label) || "etapa", base = id, n = 2;
      while (seen.has(id)) id = base + "-" + n++;
      s.id = id; seen.add(id);
    });
    return c;
  }

  function serialize(c) {
    const phases = c.phases && c.phases.length ? c.phases.slice() : PHASES.slice();
    c.steps.forEach((s) => { if (!phases.includes(s.phase)) phases.push(s.phase); });
    const out = ["# " + (c.label || c.id || "Novo ciclo")];
    if (c.description) out.push("Descrição: " + c.description);
    out.push("Aprovação: " + (c.approval || "stop_at_pr"));
    if (c.phases && c.phases.length) out.push("Fases: " + c.phases.join(", "));
    phases.forEach((p) => {
      const list = c.steps.filter((s) => s.phase === p);
      if (!list.length) return;
      out.push("", "## " + p);
      list.forEach((s) => {
        out.push("", "### " + (s.label || s.id), "- id: " + s.id);
        if (s.kind) out.push("- executa: " + KIND_LABEL[s.kind] + (s.ref ? " " + s.ref : ""));
        if (s.kind === "skill" && s.agent) out.push("- no agente: " + s.agent);
        if (s.reads && s.reads.length) out.push("- lê: " + s.reads.join(", "));
        if (s.writes) out.push("- grava: " + s.writes);
        if (s.status) out.push("- status: " + s.status);
        out.push("- aprovação: " + (s.approve ? "sim" : "não"));
        const nx = Object.entries(s.next || {});
        if (nx.length) out.push("- vereditos: " + nx.map(([v, d]) => v + " → " + d).join("; "));
      });
    });
    return out.join("\n") + "\n";
  }

  // ---- agente (.claude/agents/<nome>.md): frontmatter + prompt ----
  function parseAgent(text) {
    const a = { name: "", description: "", model: "", tools: [], body: "" };
    const m = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/.exec(String(text || ""));
    if (!m) { a.body = String(text || ""); return a; }
    m[1].split(/\r?\n/).forEach((l) => {
      const r = /^([A-Za-z_-]+):\s*(.*)$/.exec(l); if (!r) return;
      const k = r[1].toLowerCase(), v = r[2].trim();
      if (k === "name") a.name = v;
      else if (k === "description") a.description = v;
      else if (k === "model") a.model = v;
      else if (k === "tools") a.tools = v.split(",").map((t) => t.trim()).filter(Boolean);
    });
    a.body = m[2].replace(/^\n+/, "");
    return a;
  }
  function serializeAgent(a) {
    const fm = ["---", "name: " + a.name, "description: " + String(a.description || "").replace(/\r?\n/g, " ")];
    if (a.tools && a.tools.length) fm.push("tools: " + a.tools.join(", "));
    if (a.model) fm.push("model: " + a.model);
    fm.push("---", "");
    return fm.join("\n") + "\n" + String(a.body || "").trim() + "\n";
  }

  root.CycleMd = { PHASES, KIND_LABEL, APPROVALS, slug, blank, parse, serialize, parseAgent, serializeAgent };
})();
