// Aba "Pipeline" (#/pipeline): desenho do ciclo (fases em colunas, etapas em caixas) e, abaixo, o card da tarefa
// alinhado com as mesmas colunas. Lê cycles/fabrica-v3.json; etapas fora do perfil padrão ficam apagadas.
(function () {
  const root = document.querySelector("[data-pipeline-view]");
  if (!root) return;
  const FALLBACK = "cycles/fabrica-v3.json";
  let selected = ""; // ciclo escolhido (nome do arquivo) quando o projeto tem mais de um
  const el = (tag, cls, text) => { const n = document.createElement(tag); if (cls) n.className = cls; if (text != null) n.textContent = text; return n; };
  const who = (s) => { const r = s.run || {}; return r.agent || r.skill || (r.script ? "script" : "CI"); };
  const mark = (s) => (s.run && s.run.agent ? "◆ " : s.run && s.run.skill ? "⚡ " : "");

  function columns(cfg) {
    const cols = cfg.phases.map((p) => ({ id: p.id, label: p.label, column: p.column, steps: [] }));
    Object.entries(cfg.steps).forEach(([id, s]) => { const c = cols.find((x) => x.id === s.phase); if (c) c.steps.push({ id, ...s }); });
    return cols;
  }


  const NS = "http://www.w3.org/2000/svg";
  const svgEl = (tag, attrs) => { const n = document.createElementNS(NS, tag); for (const k in attrs) n.setAttribute(k, attrs[k]); return n; };

  // etapa anterior que está no perfil (pula as que ficaram de fora)
  function parents(cfg, on, id, seen = new Set()) {
    const out = [];
    if (!Object.values(cfg.steps).some((x) => x.needs && x.needs.length)) { // ciclo sem "needs": segue a ordem do perfil
      const order = (cfg.profiles[cfg.cycle.default_profile] || { steps: [] }).steps, i = order.indexOf(id);
      return i > 0 ? [order[i - 1]] : [];
    }
    for (const n of (cfg.steps[id].needs || [])) {
      if (seen.has(n)) continue; seen.add(n);
      if (on.has(n)) out.push(n); else out.push(...parents(cfg, on, n, seen));
    }
    return [...new Set(out)];
  }

  // setas entre etapas (por "needs") e o arco do laço gate -> build, sobre a grade
  function arrows(cfg, on, grid) {
    grid.querySelector(".pp__svg")?.remove();
    const g = grid.getBoundingClientRect();
    const W = grid.scrollWidth, H = grid.scrollHeight;
    const svg = svgEl("svg", { class: "pp__svg", width: W, height: H, viewBox: `0 0 ${W} ${H}` });
    const defs = svgEl("defs", {});
    for (const [id, color] of [["pp-a", "#8a8a8a"], ["pp-l", "#e07a1f"]]) {
      const m = svgEl("marker", { id, viewBox: "0 0 10 10", refX: 9, refY: 5, markerWidth: 7, markerHeight: 7, orient: "auto-start-reverse" });
      m.append(svgEl("path", { d: "M0 0L10 5L0 10z", fill: color })); defs.append(m);
    }
    svg.append(defs);
    const rect = (id) => {
      const n = grid.querySelector(`[data-step="${id}"]`); if (!n) return null;
      const r = n.getBoundingClientRect();
      return { l: r.left - g.left + grid.scrollLeft, r: r.right - g.left + grid.scrollLeft, t: r.top - g.top + grid.scrollTop, b: r.bottom - g.top + grid.scrollTop };
    };
    for (const id of on) {
      if (!cfg.steps[id]) continue;
      const B = rect(id); if (!B) continue;
      for (const pid of parents(cfg, on, id)) {
        const A = rect(pid); if (!A) continue;
        let d;
        if (Math.abs(A.l - B.l) < 4) { const x = (A.l + A.r) / 2; d = `M${x} ${A.b}L${x} ${B.t - 1}`; }
        else { const x1 = A.r, y1 = (A.t + A.b) / 2, x2 = B.l - 1, y2 = (B.t + B.b) / 2, mx = (x1 + x2) / 2; d = `M${x1} ${y1}C${mx} ${y1} ${mx} ${y2} ${x2} ${y2}`; }
        svg.append(svgEl("path", { d, fill: "none", stroke: "#8a8a8a", "stroke-width": 1.5, "stroke-dasharray": "2 5", "stroke-linecap": "round", class: "pp__flow", "marker-end": "url(#pp-a)" }));
      }
    }
    // laços: veredito que devolve a uma etapa anterior (ex.: FAIL -> build); um arco por baixo, do destino de volta à origem
    const order = (cfg.profiles[cfg.cycle.default_profile] || { steps: [] }).steps;
    const loops = [];
    for (const id of on) {
      const nx = cfg.steps[id] && cfg.steps[id].next; if (!nx || typeof nx !== "object") continue;
      for (const t of new Set(Object.values(nx))) if (cfg.steps[t] && on.has(t) && order.indexOf(t) < order.indexOf(id)) loops.push([id, t]);
    }
    const seenL = new Set();
    // vários revisores voltando ao mesmo destino: desenha só o primeiro de cada destino (o gate, quando existe)
    loops.sort((a, b) => (a[0] === "gate" ? -1 : 0) - (b[0] === "gate" ? -1 : 0)).forEach(([f, t]) => {
      if (seenL.has(t)) return; seenL.add(t);
      const from = rect(f), to = rect(t); if (!from || !to) return;
      const x1 = (from.l + from.r) / 2, y1 = from.b, x2 = (to.l + to.r) / 2, y2 = to.b, low = H - 6;
      svg.append(svgEl("path", { d: `M${x1} ${y1}C${x1} ${low} ${x2} ${low} ${x2} ${y2 + 1}`, fill: "none", stroke: "#e07a1f", "stroke-width": 1.6, "stroke-dasharray": "2 5", "stroke-linecap": "round", class: "pp__flow", "marker-end": "url(#pp-l)" }));
    });
    grid.append(svg);
  }

  // comandos para acionar a etapa no Claude Code: agente (@nome) e/ou skill (/nome), com a tarefa como argumento
  function commandsOf(st) {
    const r = st.run || {}, out = [];
    const label = String(st.label || st.id).toLowerCase();
    const agentName = r.agent && String(r.agent).split(/[\s(]/)[0];
    const skillName = r.skill || (String(r.agent || "").match(/skill\s+([\w-]+)/) || [])[1];
    const ask = st.id === "intake" ? "triar a <issue#N>" : "executar a etapa " + label + " da <issue#N>";
    if (agentName) out.push("@" + agentName + " " + ask);
    if (skillName) out.push("/" + skillName + " <issue#N>");
    if (r.script) out.push(r.script + " <issue#N>");
    return out;
  }

  // resumo da etapa
  function info(cfg, s, inProfile) {
    const dlg = el("dialog", "pp__dlg");
    const head = el("div", "pp__dhead");
    const t = el("div"); t.append(el("h3", null, s.label || s.id), el("small", null, "fase " + s.phase + (inProfile ? "" : " · fora do perfil padrão") + (s.required ? " · obrigatória" : "")));
    const x = el("button", "pp__close", "×"); x.type = "button"; x.setAttribute("aria-label", "Fechar"); x.addEventListener("click", () => dlg.close());
    head.append(t, x);
    const body = el("div", "pp__dbody");
    if (s.description) body.append(el("p", null, s.description));
    const r = s.run || {};
    const rows = [
      ["Executa", [r.agent && "agente " + r.agent, r.skill && "skill " + r.skill, r.script && "script " + r.script, r.model && "modelo " + r.model].filter(Boolean).join(" · ") || "CI"],
      ["Lê", (s.reads || []).join(", ")],
      ["Grava", s.writes || ""],
      ["Depende de", (s.needs || []).join(", ")],
      ["Vereditos", s.next && typeof s.next === "object" ? Object.entries(s.next).map(([k, v]) => k + " → " + v).join(" · ") : ""],
    ].filter((rw) => rw[1]);
    const dl = el("dl", "pp__dl");
    rows.forEach(([k, v]) => dl.append(el("dt", null, k), el("dd", null, v)));
    body.append(dl);
    const cmds = commandsOf(s);
    if (cmds.length) {
      body.append(el("div", "pp__ctitle2", "Comandos de uso"));
      cmds.forEach((c) => {
        const row = el("div", "pp__cmd"); row.append(el("code", null, c));
        const b = el("button", "btn pp__copy", "Copiar"); b.type = "button";
        b.addEventListener("click", async () => { try { await navigator.clipboard.writeText(c); b.textContent = "Copiado"; } catch (e) { b.textContent = "Falhou"; } setTimeout(() => { b.textContent = "Copiar"; }, 1500); });
        row.append(b); body.append(row);
      });
    }
    dlg.append(head, body);
    dlg.addEventListener("click", (e) => { if (e.target === dlg) dlg.close(); });
    dlg.addEventListener("close", () => dlg.remove());
    document.body.append(dlg); dlg.showModal();
  }

  function draw(cfg, list, from) {
    const profile = (cfg.profiles || {})[cfg.cycle.default_profile] || { steps: Object.keys(cfg.steps) };
    cfg.profiles = cfg.profiles || {}; if (!cfg.profiles[cfg.cycle.default_profile]) cfg.profiles[cfg.cycle.default_profile] = profile;
    const on = new Set(profile.steps);
    const cols = columns(cfg);
    root.replaceChildren();

    const box = el("section", "pp__diagram");
    const src = el("div", "pp__src");
    if (list && list.length > 1) {
      const sel = el("select", "pp__sel"); list.forEach((c) => { const o = el("option", null, c.name); o.value = c.name; if (c.name === selected) o.selected = true; sel.append(o); });
      sel.addEventListener("change", () => { selected = sel.value; load(); });
      src.append(el("span", null, "Ciclo: "), sel);
    }
    src.append(el("span", "pp__from", "fonte: " + from));
    box.append(el("h2", "pp__title", "Desenho da pipeline - " + (cfg.cycle.label || cfg.cycle.id)), src);
    box.append(el("p", "pp__hint", "Espelha o ciclo do projeto. Cada caixa é uma etapa (clique para ver o resumo); setas mostram a ordem" + (profile.label ? " do perfil “" + profile.label + "”" : "") + "; caixas apagadas ficam fora do perfil."));
    const grid = el("div", "pp__grid");
    cols.forEach((c) => {
      const col = el("div", "pp__col");
      const head = el("div", "pp__head"); head.append(el("b", null, c.label), el("span", null, "coluna " + c.column));
      const list = el("div", "pp__steps");
      c.steps.forEach((s) => {
        const b = el("div", "pp__step" + (on.has(s.id) ? " is-on" : "") + (s.extra ? " is-extra" : ""));
        b.append(el("strong", null, s.label || s.id), el("small", null, s.extra ? "CI" : mark(s) + who(s) + ((s.run || {}).model ? " · " + s.run.model : "")));
        b.dataset.step = s.id;
        if (!s.extra) { b.tabIndex = 0; b.setAttribute("role", "button"); b.classList.add("is-click"); const open = () => info(cfg, s, on.has(s.id)); b.addEventListener("click", open); b.addEventListener("keydown", (e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); open(); } }); }
        list.append(b);
      });
      col.append(head, list); grid.append(col);
    });
    const wrap = el("div", "pp__wrap"); wrap.append(grid);
    box.append(wrap);
    if (cfg.steps.build && cfg.steps.gate) box.append(el("p", "pp__loop", "↺ falha ou mudança, volta ao build (máx. 3)"));
    root.append(box);
    const redraw = () => arrows(cfg, on, grid);
    requestAnimationFrame(redraw);
    if (window.ResizeObserver) new ResizeObserver(redraw).observe(grid);

    // tarefa alinhada com as fases
    const board = el("section", "pp__board");
    board.append(el("h2", "pp__title", "Tarefas"));
    const bgrid = el("div", "pp__grid");
    cols.forEach((c, i) => {
      const col = el("div", "pp__col");
      const head = el("div", "pp__head"); head.append(el("b", null, c.label), el("span", null, c.steps.filter((s) => on.has(s.id)).length + " etapas"));
      col.append(head);
      if (i === 0) {
        const card = el("div", "pp__card");
        card.append(el("div", "pp__num", "#nova"), el("div", "pp__ctitle", "Nova tarefa"), el("div", "pp__meta", "etapa: " + (profile.steps[0] && cfg.steps[profile.steps[0]] ? cfg.steps[profile.steps[0]].label : "—") + " · aguardando início"));
        col.append(card);
      } else col.append(el("div", "pp__empty", "—"));
      bgrid.append(col);
    });
    board.append(bgrid); root.append(board);
  }

  // handle da pasta do projeto (guardado por js/project.js no IndexedDB)
  function getHandle() {
    return new Promise((resolve) => {
      try {
        const req = indexedDB.open("aes", 1);
        req.onupgradeneeded = () => req.result.createObjectStore("handles");
        req.onerror = () => resolve(null);
        req.onsuccess = () => {
          const g = req.result.transaction("handles").objectStore("handles").get("project");
          g.onsuccess = () => resolve(g.result || null); g.onerror = () => resolve(null);
        };
      } catch (e) { resolve(null); }
    });
  }
  // ciclos .json de .claude/cycles/ do projeto conectado: [{ name, cfg }]
  async function projectCycles() {
    const h = await getHandle(); if (!h) return [];
    try { if (h.queryPermission && (await h.queryPermission({ mode: "read" })) !== "granted") return []; } catch (e) { return []; }
    const out = [];
    try {
      const d = await (await h.getDirectoryHandle(".claude")).getDirectoryHandle("cycles");
      for await (const e of d.values()) {
        if (e.kind !== "file" || !e.name.endsWith(".json")) continue;
        try { const cfg = JSON.parse(await (await e.getFile()).text()); if (cfg && cfg.steps && cfg.phases) out.push({ name: e.name.slice(0, -5), cfg }); } catch (x) {}
      }
    } catch (e) {}
    return out.sort((a, b) => a.name.localeCompare(b.name));
  }

  async function load() {
    try {
      const list = await projectCycles();
      let cfg, from = "";
      if (list.length) {
        const pick = list.find((c) => c.name === selected) || list[0];
        selected = pick.name; cfg = pick.cfg; from = ".claude/cycles/" + pick.name + ".json";
        draw(cfg, list, from);
      } else {
        const r = await fetch(FALLBACK); if (!r.ok) throw new Error(r.status);
        draw(await r.json(), [], FALLBACK + " (conecte a pasta do projeto para espelhar os ciclos dele)");
      }
    } catch (e) { root.textContent = "Não foi possível ler o ciclo (conecte a pasta do projeto ou abra o app por um servidor local)."; }
  }
  document.querySelector('[data-pipe-tab="pipeline"]')?.addEventListener("click", load);
  window.addEventListener("aes:project-changed", () => { if (!root.closest("[hidden]")) load(); });
})();
