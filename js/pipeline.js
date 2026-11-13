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

  // dentro de uma fase com etapas em paralelo, a que depende de outra da mesma fase vai para uma sub-coluna à direita dela
  // (ex.: Verify = gate | revisores em paralelo). Devolve { id: nível } e o total de níveis da fase.
  function levels(cfg, col) {
    const ids = new Set(col.steps.map((s) => s.id)), lv = {};
    const of = (id, seen = new Set()) => {
      if (id in lv) return lv[id];
      if (seen.has(id)) return 0; seen.add(id);
      const deps = ((cfg.steps[id] || {}).needs || []).filter((n) => ids.has(n));
      return (lv[id] = deps.length ? 1 + Math.max(...deps.map((n) => of(n, seen))) : 0);
    };
    col.steps.forEach((s) => of(s.id));
    const n = Math.max(0, ...Object.values(lv)) + 1, count = {};
    Object.values(lv).forEach((v) => { count[v] = (count[v] || 0) + 1; });
    // só abre sub-colunas quando alguma delas tem etapas em paralelo (gate -> revisores); cadeia simples fica empilhada
    if (Math.max(0, ...Object.values(count)) < 2) { Object.keys(lv).forEach((k) => { lv[k] = 0; }); return { lv, n: 1 }; }
    return { lv, n };
  }
  const CARD_W = 170, LV_GAP = 64;
  const gridCols = (ns) => ns.map((n) => `${CARD_W * n + LV_GAP * (n - 1)}px`).join(" ");


  const NS = "http://www.w3.org/2000/svg";
  const svgEl = (tag, attrs) => { const n = document.createElementNS(NS, tag); for (const k in attrs) n.setAttribute(k, attrs[k]); return n; };

  // etapa anterior que está no perfil (pula as que ficaram de fora)
  function parents(cfg, on, id, seen = new Set()) {
    const out = [];
    if (!(cfg.steps[id].needs || []).length) { // etapa sem "needs": segue a ordem do perfil
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
    const ask = st.id === "intake" ? "triar a <issue#N>" : st.id === "gate" ? "rodar os testes (lint, tipos, testes, build) da <issue#N>" : "executar a etapa " + label + " da <issue#N>";
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
    const grid = el("div", "pp__grid pp__grid--flow");
    const widths = cols.map((c) => levels(cfg, c).n);
    if (widths.some((n) => n > 1)) grid.style.gridTemplateColumns = gridCols(widths);
    cols.forEach((c) => {
      const col = el("div", "pp__col");
      const head = el("div", "pp__head"); head.append(el("b", null, c.label), el("span", null, "coluna " + c.column));
      const list = el("div", "pp__steps");
      const L = levels(cfg, c);
      if (L.n > 1) { list.classList.add("pp__steps--lv"); list.style.gridTemplateColumns = `repeat(${L.n}, minmax(0, 1fr))`; list.style.columnGap = "64px"; }
      const subs = Array.from({ length: L.n }, () => { const d = el("div", "pp__sub"); if (L.n > 1) list.append(d); return d; });
      c.steps.forEach((s) => {
        const b = el("div", "pp__step" + (on.has(s.id) ? " is-on" : "") + (s.extra ? " is-extra" : ""));
        const sub = el("small", null, s.extra ? "CI" : mark(s) + who(s) + ((s.run || {}).model ? " · " + s.run.model : "")); sub.title = sub.textContent;
        b.append(el("strong", null, s.label || s.id), sub);
        b.dataset.step = s.id;
        if (!s.extra) { b.tabIndex = 0; b.setAttribute("role", "button"); b.classList.add("is-click"); const open = () => info(cfg, s, on.has(s.id)); b.addEventListener("click", open); b.addEventListener("keydown", (e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); open(); } }); }
        (L.n > 1 ? subs[L.lv[s.id]] : list).append(b);
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

    // tarefas alinhadas com as fases: os cards vêm de trabalhos/ + eventos do hook (refreshTasks)
    const board = el("section", "pp__board");
    board.append(el("h2", "pp__title", "Tarefas"));
    const how = el("p", "pp__hint", "");
    how.innerHTML = "O card não guarda estado: a cada ~3 s a tela o recalcula. <strong>Por onde passou</strong> vem dos arquivos em <code>trabalhos/&lt;repo&gt;-issue-N/</code> (a 1ª linha de cada um é o veredito, ex.: <code>ACCEPT</code>). <strong>Rodando agora</strong> vem do hook (<code>.aes/activity.json</code>). <strong>Para onde vai</strong> e <strong>a coluna</strong> vêm do ciclo (veredito → próxima etapa, esperar o autor ou encerrar; campo <code>phase</code> da etapa). Se o hook atrasar, os arquivos continuam dizendo o estado correto.";
    const note = el("p", "pp__hint", ""); board.append(how, note);
    const bgrid = el("div", "pp__grid pp__grid--flow"); // mesmas colunas do desenho, para alinhar
    if (grid.style.gridTemplateColumns) bgrid.style.gridTemplateColumns = grid.style.gridTemplateColumns;
    if (widths.some((n) => n > 1)) bgrid.style.gridTemplateColumns = gridCols(widths);
    const taskCols = new Map();
    cols.forEach((c) => {
      const col = el("div", "pp__col");
      const head = el("div", "pp__head"); head.append(el("b", null, c.label), el("span", null, "coluna " + c.column));
      const body = el("div", "pp__cards"); col.append(head, body);
      taskCols.set(c.id, body); bgrid.append(col);
    });
    board.append(bgrid); root.append(board);
    ctx = { cfg, on, order: profile.steps.filter((id) => cfg.steps[id]), taskCols, note, fromProject: !!(list && list.length) };
    lastKey = ""; refreshTasks();
  }

  // ---------- tarefas: arquivos em trabalhos/<repo>-issue-<N>/ + eventos do hook (.aes/activity.json) ----------
  let ctx = null, lastKey = "";
  const first = (t) => String(t || "").split("\n")[0].trim();
  const verdictOf = (t) => { const m = first(t).match(/^[A-Z][A-Z _-]*:\s*([A-Z][A-Z-]*)/); return m ? m[1] : ""; };
  async function dirAt(h, parts) { let d = h; for (const p of parts) d = await d.getDirectoryHandle(p); return d; }
  async function readInfo(h, path) { // { text, mtime } ou null
    const a = path.split("/");
    try { const f = await (await (await dirAt(h, a.slice(0, -1))).getFileHandle(a[a.length - 1])).getFile(); return { text: await f.text(), mtime: f.lastModified }; }
    catch (e) { return null; }
  }
  async function readableHandle() {
    const h = await getHandle(); if (!h) return null;
    try { if (h.queryPermission && (await h.queryPermission({ mode: "read" })) !== "granted") return null; } catch (e) { return null; }
    return h;
  }
  const RUN_MAX_MS = 30 * 60 * 1000; // um "rodando" sem fim registrado vira "travado" depois disso
  const agentOf = (st) => String((st.run || {}).agent || "").split(/[\s(]/)[0];

  async function scanTasks(h) {
    const { cfg, order } = ctx;
    const events = (await readInfo(h, ".aes/activity.json").then((i) => { try { return JSON.parse(i.text).events || []; } catch (e) { return []; } }).catch(() => []));
    const stepOfAgent = {}; order.forEach((id) => { const a = agentOf(cfg.steps[id]); if (a) stepOfAgent[a] = id; });
    const tasks = new Map();
    const get = (n) => { if (!tasks.has(n)) tasks.set(n, { issue: n, repo: "", dir: "", title: "", steps: {}, files: [] }); return tasks.get(n); };
    try {
      const d = await dirAt(h, ["trabalhos"]);
      for await (const e of d.values()) {
        const m = e.kind === "directory" && e.name.match(/^(.+)-issue-(\d+)$/); if (!m) continue;
        const t = get(Number(m[2])); t.repo = m[1]; t.dir = "trabalhos/" + e.name;
        for await (const f of e.values()) if (f.kind === "file" && f.name.endsWith(".md")) t.files.push(f.name);
        t.files.sort();
      }
    } catch (e) { /* sem trabalhos/ ainda */ }
    for (const ev of events) if (ev.action === "factory.step_started" && ev.issue) get(ev.issue);
    const now = Date.now();
    for (const t of tasks.values()) {
      for (const id of order) {
        const w = cfg.steps[id].writes;
        const st = { id, state: "pending", verdict: "" };
        if (t.dir && w && !/[{}]/.test(w)) {
          const f = await readInfo(h, t.dir + "/" + w);
          if (f) { st.state = "done"; st.verdict = verdictOf(f.text); if (!t.title && id === "prd") t.title = first(f.text.split("\n").find((l) => /^#\s/.test(l)) || "").replace(/^#\s*(PRD:\s*)?/, "").replace(/\s*\(issue\s*#?\d+\)\s*$/i, ""); }
          else if (t.files.includes(w.replace(/\.md$/, "") + ".questions.md") && !t.files.includes(w.replace(/\.md$/, "") + ".answers.md")) st.state = "waiting";
        }
        const agent = agentOf(cfg.steps[id]);
        const started = events.find((e) => e.action === "factory.step_started" && e.issue === t.issue && e.agent === agent);
        if (started) {
          const ts = Date.parse(started.timestamp);
          const ended = events.some((e) => Date.parse(e.timestamp) > ts && ((e.action === "factory.step_finished" && e.agent === agent) || e.action === "claude.responded"));
          if (!ended && now - ts < RUN_MAX_MS) st.state = "running";
        }
        t.steps[id] = st;
      }
      // fase do card: etapa rodando; senão a da última etapa com saída (ou a da próxima, se o veredito for @next)
      const run = order.find((id) => t.steps[id].state === "running");
      let idx = -1; order.forEach((id, i) => { if (t.steps[id].state !== "pending") idx = i; });
      t.flag = "";
      if (run) t.phase = cfg.steps[run].phase;
      else if (idx < 0) t.phase = cfg.steps[order[0]].phase;
      else {
        const id = order[idx], st = t.steps[id], dest = st.state === "done" ? (cfg.steps[id].next || {})[st.verdict] : "";
        if (st.state === "waiting") t.flag = "aguardando sua resposta";
        else if (dest === "@wait-author") t.flag = "perguntou ao autor";
        else if (dest === "@rejected") t.flag = "rejeitado";
        else if (dest === "@human") t.flag = "sua decisão";
        else if (dest === "@done") t.flag = "concluída";
        t.phase = cfg.steps[dest === "@next" && order[idx + 1] ? order[idx + 1] : id].phase;
      }
      t.live = !!run;
    }
    return [...tasks.values()].sort((a, b) => b.issue - a.issue);
  }

  const MARK = { done: "✓", running: "◐", waiting: "⏸", pending: "○" };
  function taskCard(t) {
    const card = el("div", "pp__card is-click" + (t.live ? " is-live" : "") + (t.flag === "rejeitado" ? " is-off" : ""));
    card.tabIndex = 0; card.setAttribute("role", "button");
    const top = el("div", "pp__top"); if (t.live) top.append(el("span", "pp__pulse"));
    top.append(el("span", "pp__num", "#" + t.issue + (t.repo ? " · " + t.repo : "")));
    if (t.flag) top.append(el("span", "pp__flag", t.flag));
    card.append(top, el("div", "pp__ctitle", t.title || "Issue #" + t.issue));
    const ul = el("div", "pp__mini");
    ctx.order.forEach((id) => {
      const st = t.steps[id], row = el("div", "pp__mrow is-" + st.state);
      row.append(el("i", null, MARK[st.state]), el("span", null, ctx.cfg.steps[id].label || id), el("small", null, st.state === "running" ? "rodando" : st.verdict || ""));
      ul.append(row);
    });
    card.append(ul);
    const open = () => openTask(t);
    card.addEventListener("click", open);
    card.addEventListener("keydown", (e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); open(); } });
    return card;
  }

  async function refreshTasks() {
    if (!ctx) return;
    const h = await readableHandle();
    if (!h) { ctx.note.textContent = "Conecte a pasta do projeto (Preferences) para acompanhar as tarefas."; ctx.taskCols.forEach((b) => b.replaceChildren()); lastKey = ""; return; }
    if (!ctx.fromProject) { ctx.note.textContent = ""; }
    let tasks; try { tasks = await scanTasks(h); } catch (e) { return; }
    const key = JSON.stringify(tasks.map((t) => [t.issue, t.phase, t.flag, t.live, t.title, t.files.length, ctx.order.map((id) => t.steps[id].state + t.steps[id].verdict)]));
    if (key === lastKey) return; lastKey = key;
    ctx.note.textContent = tasks.length ? "" : "Nenhuma tarefa ainda. Rode no Claude Code, por exemplo: @intake triar a issue 3";
    ctx.taskCols.forEach((b) => b.replaceChildren());
    tasks.forEach((t) => { const body = ctx.taskCols.get(t.phase) || [...ctx.taskCols.values()][0]; body.append(taskCard(t)); });
  }

  // gaveta com os .md da tarefa
  async function openTask(t) {
    const h = await readableHandle(); if (!h || !t.dir) return;
    const dlg = el("dialog", "pp__dlg pp__dlg--wide");
    const head = el("div", "pp__dhead"); const tt = el("div"); tt.append(el("h3", null, t.title || "Issue #" + t.issue), el("small", null, t.dir));
    const x = el("button", "pp__close", "×"); x.type = "button"; x.setAttribute("aria-label", "Fechar"); x.addEventListener("click", () => dlg.close());
    head.append(tt, x);
    const body = el("div", "pp__tbody"), nav = el("nav", "pp__tfiles"), doc = el("article", "pp__tdoc"); body.append(nav, doc);
    dlg.append(head, body); dlg.addEventListener("click", (e) => { if (e.target === dlg) dlg.close(); }); dlg.addEventListener("close", () => dlg.remove());
    document.body.append(dlg); dlg.showModal();
    const show = async (f, btn) => {
      nav.querySelectorAll("button").forEach((b) => b.classList.toggle("is-on", b === btn));
      const i = await readInfo(h, t.dir + "/" + f); const text = i ? i.text : "";
      doc.replaceChildren(window.renderMarkdown ? window.renderMarkdown(text) : Object.assign(el("pre"), { textContent: text }));
    };
    t.files.forEach((f, n) => { const b = el("button", null, f); b.type = "button"; b.addEventListener("click", () => show(f, b)); nav.append(b); if (n === 0) show(f, b); });
    if (!t.files.length) doc.textContent = "Nenhum arquivo .md ainda.";
  }

  // atualiza com a aba Pipeline aberta (como a página Activity)
  const visible = () => ctx && !document.hidden && location.hash === "#/pipeline" && !root.closest("[hidden]");
  setInterval(() => { if (visible()) refreshTasks(); }, 3000);

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
  load();
})();
