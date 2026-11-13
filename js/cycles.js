// Página "Pipeline": monta ciclos de trabalho como colunas e cards (arrastar, ligar, zoom) e grava Markdown no projeto:
//   .claude/cycles/<id>.md      o ciclo (js/cycle-md.js define o formato)
//   .claude/agents/<nome>.md    o agente de um card
// Sem motor e sem servidor: só lê e grava arquivos da pasta do projeto (File System Access). Geometria, encaixe em
// grade de 16 px, arestas e arrastar vêm do editor de ciclos do aes-simple-ai-software-factory, em versão enxuta.
(function () {
  "use strict";
  const host = document.querySelector("[data-cycles]");
  if (!host || !window.CycleMd) return;
  const M = window.CycleMd;

  const esc = (s) => String(s == null ? "" : s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
  const GRID = 16, CONN = 60, ZMIN = 0.25, ZMAX = 4;
  const COLW = 224, NW = 176, NH = 64, CX = 32, TOP = 64, GAP = 80;
  const snap = (v) => Math.round(v / GRID) * GRID;
  const KICON = { agent: "🤖", skill: "🧩", command: "⚙", human: "👤" };
  const TOOLS = ["Read", "Grep", "Glob", "Edit", "Write", "Bash", "WebSearch", "WebFetch"];
  const MODELS = [["", "herdar do projeto"], ["haiku", "haiku (rotina, barato)"], ["sonnet", "sonnet (equilibrado)"], ["opus", "opus (raciocínio forte)"]];

  let handle = null, files = [], inv = { agents: [], skills: [] }, cur = null, saved = false, dirty = false;
  let pos = {}, view = { x: 24, y: 16, k: 1 }, sel = null, msg = "", bad = false;
  let card = null; // { id, tab, agent }
  let diskText = ""; // conteúdo de .claude/cycles/<ciclo>.md na última leitura/gravação (detecta edição externa)
  let linkTo = null, drag = null, phMenu = null;

  // ---------- pasta do projeto ----------
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
  async function dir(path, create) { let d = handle; for (const p of path.split("/")) d = await d.getDirectoryHandle(p, { create: !!create }); return d; }
  async function readFile(path) { const a = path.split("/"), d = await dir(a.slice(0, -1).join("/")); return (await (await d.getFileHandle(a.pop())).getFile()).text(); }
  async function writeFile(path, text) {
    const a = path.split("/"), d = await dir(a.slice(0, -1).join("/"), true);
    const w = await (await d.getFileHandle(a.pop(), { create: true })).createWritable(); await w.write(text); await w.close();
  }
  async function listCycles() {
    try { const d = await dir(".claude/cycles"), out = []; for await (const e of d.values()) if (e.kind === "file" && e.name.endsWith(".md")) out.push(e.name.slice(0, -3)); return out.sort(); }
    catch (e) { return []; }
  }
  // o que já existe no projeto: agentes (.claude/agents/*.md) e skills (.claude/skills/<nome>/SKILL.md, com references/)
  async function listInventory() {
    const out = { agents: [], skills: [] };
    try { const d = await dir(".claude/agents"); for await (const e of d.values()) if (e.kind === "file" && e.name.endsWith(".md")) out.agents.push({ name: e.name.slice(0, -3), refs: 0 }); } catch (e) {}
    try {
      const d = await dir(".claude/skills");
      for await (const e of d.values()) {
        if (e.kind !== "directory") continue;
        let ok = false, refs = 0;
        try { await e.getFileHandle("SKILL.md"); ok = true; } catch (x) {}
        if (!ok) continue;
        try { const r = await e.getDirectoryHandle("references"); for await (const f of r.values()) if (f.kind === "file") refs++; } catch (x) {}
        out.skills.push({ name: e.name, refs });
      }
    } catch (e) {}
    out.agents.sort((a, b) => a.name.localeCompare(b.name)); out.skills.sort((a, b) => a.name.localeCompare(b.name));
    return out;
  }
  const canWrite = async () => (await handle.queryPermission({ mode: "readwrite" })) === "granted" || (await handle.requestPermission({ mode: "readwrite" })) === "granted";

  // ---------- modelo ----------
  const phases = () => cur.phases;
  const phaseIdx = (p) => Math.max(0, phases().indexOf(p));
  const step = (id) => cur.steps.find((s) => s.id === id);
  const label = (id) => (step(id) || {}).label || id;
  const kindTxt = (s) => (s.kind ? M.KIND_LABEL[s.kind] + (s.ref ? ": " + s.ref : "") + (s.kind === "skill" && s.agent ? " · " + s.agent : "") : "quem executa?");
  const problems = (s) => { const o = []; if (!s.kind) o.push("quem executa?"); if (!s.writes) o.push("o que grava?"); return o; };
  const touch = () => { dirty = true; msg = ""; bad = false; updateStatus(); };
  function updateStatus() {
    const m = host.querySelector("[data-msg]"), b = host.querySelector("[data-save]");
    if (m) { m.textContent = msg || (dirty ? "● alterações não salvas" : saved ? "salvo" : ""); m.classList.toggle("is-err", bad); }
    if (b) b.disabled = !(dirty || !saved);
  }

  const colX = (c) => c * COLW + CX;
  const colOf = (x) => Math.min(phases().length - 1, Math.max(0, Math.floor((x + NW / 2) / COLW)));
  const inCol = (c, except) => cur.steps.filter((s) => s.id !== except && pos[s.id] && colOf(pos[s.id].x) === c);
  const bottomOf = (c, except) => inCol(c, except).reduce((m, s) => Math.max(m, pos[s.id].y + GAP), TOP);
  function layout() {
    Object.keys(pos).forEach((id) => { if (!step(id)) delete pos[id]; });
    cur.steps.forEach((s) => { const c = phaseIdx(s.phase); if (!pos[s.id] || colOf(pos[s.id].x) !== c) pos[s.id] = { x: colX(c), y: bottomOf(c, s.id) }; });
  }
  function unstack(c, first) {
    let min = TOP;
    inCol(c).sort((a, b) => (pos[a.id].y - pos[b.id].y) || (a.id === first ? -1 : b.id === first ? 1 : 0))
      .forEach((s) => { pos[s.id].y = Math.max(snap(pos[s.id].y), min); min = pos[s.id].y + GAP; });
  }
  // a ordem de execução sai do desenho: coluna, depois de cima para baixo
  function syncOrder() {
    const idx = (s) => cur.steps.indexOf(s), y = (s) => (pos[s.id] || { y: 0 }).y;
    cur.steps.sort((a, b) => (phaseIdx(a.phase) - phaseIdx(b.phase)) || (y(a) - y(b)) || (idx(a) - idx(b)));
  }
  function newStep(phase, afterId) {
    let id = "etapa", n = 2; while (step(id)) id = "etapa-" + n++;
    const s = { id, label: "Nova etapa", phase, kind: "", ref: "", agent: "", reads: [], writes: "", status: "", approve: false, next: {} };
    const i = afterId ? cur.steps.indexOf(step(afterId)) : -1;
    if (i >= 0) { const P = pos[afterId]; cur.steps.splice(i + 1, 0, s); pos[id] = { x: P.x, y: P.y + GAP }; unstack(colOf(P.x), id); }
    else cur.steps.push(s);
    return s;
  }
  function removeStep(id) {
    cur.steps = cur.steps.filter((s) => s.id !== id);
    cur.steps.forEach((s) => Object.keys(s.next).forEach((v) => { if (s.next[v] === id) delete s.next[v]; }));
  }
  function renameId(s, to) {
    const old = s.id; to = M.slug(to) || old; if (to === old || step(to)) return;
    s.id = to; if (pos[old]) { pos[to] = pos[old]; delete pos[old]; }
    cur.steps.forEach((x) => Object.keys(x.next).forEach((v) => { if (x.next[v] === old) x.next[v] = to; }));
    if (card && card.id === old) card.id = to; if (sel === old) sel = to;
  }

  // ---------- carregar / criar ----------
  async function openCycle(id) {
    try { diskText = await readFile(".claude/cycles/" + id + ".md"); cur = M.parse(diskText); cur.id = id; saved = true; dirty = false; }
    catch (e) { cur = null; msg = "Não consegui ler " + id + ".md"; bad = true; return; }
    afterLoad();
  }
  function afterLoad() {
    pos = {}; sel = null; card = null;
    if (!cur.phases || !cur.phases.length) cur.phases = M.PHASES.slice();
    cur.steps.forEach((s) => { if (!cur.phases.includes(s.phase)) cur.phases.push(s.phase); });
    layout(); view = { x: 24, y: 16, k: 1 };
  }
  function blankCycle() { cur = M.blank(); cur.label = "Novo ciclo"; cur.id = "novo-ciclo"; saved = false; dirty = true; afterLoad(); }
  function duplicate() {
    const c = JSON.parse(JSON.stringify(cur)); c.label = (c.label || c.id) + " (cópia)"; c.id = M.slug(c.id + "-copia");
    cur = c; saved = false; dirty = true; msg = "Cópia criada: ajuste e clique em Salvar."; bad = false; afterLoad();
  }
  async function save() {
    try {
      if (!(await canWrite())) { msg = "Permissão de escrita negada."; bad = true; return renderBar(); }
      if (!saved) { cur.id = M.slug(cur.label) || cur.id || "ciclo"; if (files.includes(cur.id) && !confirm("Já existe .claude/cycles/" + cur.id + ".md. Substituir?")) return; }
      diskText = M.serialize(cur);
      await writeFile(".claude/cycles/" + cur.id + ".md", diskText);
      saved = true; dirty = false; msg = "Salvo em .claude/cycles/" + cur.id + ".md"; bad = false;
      // grava também o ciclo em JSON (formato aes-cycle) na mesma pasta do projeto
      try {
        if (window.CycleJson) {
          await writeFile(".claude/cycles/" + cur.id + ".json", JSON.stringify(window.CycleJson.toPack(cur).pack, null, 2) + "\n");
          msg = "Salvo em .claude/cycles/" + cur.id + ".md e .json";
        }
      } catch (e) { msg += " (o .json não foi gravado: " + e.message + ")"; bad = true; }
      if (window.Activity) Activity.log("cycle.saved", { title: cur.label || cur.id });
      files = await listCycles(); inv = await listInventory();
    } catch (e) { msg = "Não salvo: " + e.message; bad = true; }
    renderBar();
  }

  // ---------- cabeçalho ----------
  function renderBar() {
    const bar = host.querySelector("[data-bar]"); if (!bar || !cur) return;
    const ids = files.slice(); if (!saved && !ids.includes(cur.id)) ids.unshift(cur.id);
    bar.innerHTML = `<label class="cy__f"><span class="cy__l">Ciclo</span><select class="fs-in" data-sel>${ids.map((i) => `<option value="${esc(i)}"${i === cur.id ? " selected" : ""}>${esc(i)}</option>`).join("")}</select></label>`
      + `<button class="btn" data-new>＋ Novo</button><button class="btn" data-dup>Duplicar</button>`
      + `<button class="btn" data-json-import title="Criar um ciclo a partir de um arquivo .json (formato aes-cycle)">Importar JSON</button><button class="btn" data-json-export title="Baixar este ciclo como .json (formato aes-cycle)">Exportar JSON</button>`
      + `<label class="cy__f cy__f--name"><span class="cy__l">Nome</span><input class="fs-in" data-f="label" value="${esc(cur.label)}" placeholder="Nome do ciclo"></label>`
      + `<label class="cy__f cy__f--desc"><span class="cy__l">Descrição</span><input class="fs-in" data-f="description" value="${esc(cur.description)}" placeholder="Para quem é e o que faz"></label>`
      + `<div class="cy__f"><span class="cy__l">Aprovação</span><div class="cy__seg">${Object.entries(M.APPROVALS).map(([k, v]) => `<button data-mode="${k}" aria-pressed="${cur.approval === k}">${v}</button>`).join("")}</div></div>`
      + `<span class="fs-sp"></span><span class="cy__msg ${bad ? "is-err" : ""}" data-msg>${esc(msg || (dirty ? "● alterações não salvas" : saved ? "salvo" : ""))}</span>`
      + `<button class="btn btn--primary" data-save${dirty || !saved ? "" : " disabled"}>Salvar</button>`;
  }

  // ---------- canvas ----------
  function render() {
    if (!cur) return;
    layout();
    host.innerHTML = `<div class="cy__bar" data-bar></div><div class="cy__stage" data-stage></div>`
      + `<div class="cy__foot">Arraste os cards entre as colunas · bolinha ● liga a outro card (veredito) · duplo clique abre o card · fundo move · Ctrl+roda dá zoom</div>`
      + `<dialog class="cy-dlg" data-card></dialog><dialog class="cy-dlg cy-dlg--sm" data-link></dialog><dialog class="cy-dlg" data-help-dlg></dialog><dialog class="cy-dlg cy-dlg--wide" data-ed-dlg></dialog><dialog class="cy-dlg cy-dlg--wide" data-phase-dlg></dialog><dialog class="cy-dlg cy-dlg--sm" data-phmenu></dialog><dialog class="cy-dlg cy-dlg--sm" data-imp-dlg></dialog><input type="file" accept=".json,application/json" data-json-file hidden>`;
    renderBar(); renderStage(); if (card) renderCard();
  }
  function renderStage() {
    const stage = host.querySelector("[data-stage]"); if (!stage) return;
    const ph = phases(), maxY = cur.steps.reduce((m, s) => Math.max(m, pos[s.id].y + NH), TOP + NH), colH = Math.max(560, maxY + 160);
    const cols = ph.map((p, i) => `<div class="cy-col" style="left:${i * COLW + 8}px;width:${COLW - 16}px;height:${colH}px"><div class="cy-col__h"><strong>${esc(p)}</strong>`
      + `<span class="cy-col__b"><button data-phase-menu="${esc(p)}" title="Renomear, mover ou remover a fase" aria-label="Opções da fase ${esc(p)}">⋯</button><button data-add-phase="${esc(p)}" title="Adicionar etapa em ${esc(p)}">＋</button></span></div></div>`).join("")
      + `<div class="cy-col cy-col--new" style="left:${ph.length * COLW + 8}px;width:${COLW - 16}px;height:${colH}px"><button data-phase-new>＋ Nova fase</button></div>`;
    const nodes = cur.steps.map((s) => {
      const P = pos[s.id], pr = problems(s);
      return `<div class="cy-node ${pr.length ? "is-warn" : "is-ok"}${s.id === sel ? " is-sel" : ""}" data-node="${esc(s.id)}" style="left:${P.x}px;top:${P.y}px" tabindex="0" title="${esc((s.commands ? "Comandos:\n" + s.commands + "\n\n" : "") + "Clique duplo para abrir o card")}">`
        + `<span class="cy-node__ic">${s.kind ? KICON[s.kind] : "＋"}</span><div class="cy-node__t"><strong>${esc(s.label || s.id)}</strong><small>${esc(kindTxt(s))}</small><small>grava ${esc(s.writes || "?")}</small></div>`
        + `<span class="cy-node__st ${pr.length ? "is-warn" : "is-ok"}" title="${esc(pr.join("\n") || "Etapa completa")}">${pr.length ? "!" : "✓"}</span>`
        + (s.approve ? `<span class="cy-node__lock" title="espera sua aprovação">✋</span>` : "")
        + `<button class="cy-node__cfg" data-open="${esc(s.id)}" title="Abrir o card">⚙</button><span class="cy-node__in"></span>`
        + `<span class="cy-node__out" data-handle="${esc(s.id)}" title="Arraste até outro card para criar um veredito"></span>`
        + `<button class="cy-node__plus" data-plus="${esc(s.id)}" title="Adicionar etapa depois desta">＋</button></div>`;
    }).join("");
    const empty = cur.steps.length ? "" : `<div class="cy__empty"><button class="cy__big" data-add-phase="${esc(ph[0])}"><span>＋</span>Adicionar primeira etapa</button></div>`;
    stage.innerHTML = `<div class="cy__vp" data-vp style="width:${(ph.length + 1) * COLW}px;height:${colH}px">${cols}<svg class="cy-edges" width="${ph.length * COLW}" height="${colH + 120}">${edgesSvg()}</svg>${nodes}</div>${empty}`
      + `<div class="cy__zoom"><button data-zoom="-1">−</button><span data-zl>${Math.round(view.k * 100)}%</span><button data-zoom="1">＋</button><button data-fit>⤢</button></div>`;
    applyView();
  }
  function applyView() {
    const stage = host.querySelector("[data-stage]"); if (!stage) return;
    const vp = stage.querySelector("[data-vp]"); if (vp) vp.style.transform = `translate(${view.x}px,${view.y}px) scale(${view.k})`;
    stage.style.backgroundSize = `${GRID * view.k}px ${GRID * view.k}px`; stage.style.backgroundPosition = `${view.x}px ${view.y}px`;
    const l = stage.querySelector("[data-zl]"); if (l) l.textContent = Math.round(view.k * 100) + "%";
  }
  function zoomAt(k, px, py) { const nk = Math.min(ZMAX, Math.max(ZMIN, k)); view.x = px - (px - view.x) * nk / view.k; view.y = py - (py - view.y) * nk / view.k; view.k = nk; applyView(); }
  let needFit = false; // fit pedido com a área escondida (outra página/aba): refaz quando ela voltar a ter tamanho
  function fit() {
    const stage = host.querySelector("[data-stage]"); if (!stage || !cur) return;
    const r = stage.getBoundingClientRect();
    if (r.width < 80 || r.height < 80) { needFit = true; return; }
    needFit = false;
    const w = (phases().length + 1) * COLW, h = cur.steps.reduce((m, s) => Math.max(m, pos[s.id].y + NH + 48), 360);
    const k = Math.min(1.25, Math.max(ZMIN, Math.min((r.width - 32) / w, (r.height - 32) / h))); view = { k, x: Math.max(16, (r.width - w * k) / 2), y: 16 }; applyView();
  }
  const toCanvas = (e) => { const r = host.querySelector("[data-stage]").getBoundingClientRect(); return { x: (e.clientX - r.left - view.x) / view.k, y: (e.clientY - r.top - view.y) / view.k }; };

  function edgePath(A, B) {
    if (colOf(A.x) === colOf(B.x)) {
      const x = A.x + NW / 2;
      if (B.y > A.y) return [`M${x},${A.y + NH} L${x},${B.y - 3}`, x + 6, (A.y + NH + B.y) / 2];
      const lx = A.x - 18; return [`M${A.x},${A.y + NH / 2} C${lx},${A.y + NH / 2} ${lx},${B.y + NH / 2} ${B.x - 3},${B.y + NH / 2}`, lx - 4, (A.y + B.y + NH) / 2];
    }
    if (B.x > A.x) { const x1 = A.x + NW, y1 = A.y + NH / 2, x2 = B.x - 3, y2 = B.y + NH / 2, dx = Math.max(28, (x2 - x1) * 0.45); return [`M${x1},${y1} C${x1 + dx},${y1} ${x2 - dx},${y2} ${x2},${y2}`, (x1 + x2) / 2, (y1 + y2) / 2 - 6]; }
    const x1 = A.x + NW / 2, y1 = A.y + NH, x2 = B.x + NW / 2, y2 = B.y + NH + 3, yb = Math.max(y1, y2) + 56;
    return [`M${x1},${y1} C${x1},${yb} ${x2},${yb} ${x2},${y2}`, (x1 + x2) / 2, yb - 10];
  }
  function edgesSvg() {
    const out = [], ids = cur.steps.map((s) => s.id);
    const t = (x, y, txt, c) => `<text class="cy-e__t ${c || ""}" x="${x}" y="${y}" text-anchor="middle">${esc(txt)}</text>`;
    cur.steps.forEach((s, i) => { const n = cur.steps[i + 1]; if (n) out.push(`<path class="cy-e" d="${edgePath(pos[s.id], pos[n.id])[0]}" marker-end="url(#cy-arr)"/>`); });
    cur.steps.forEach((s, i) => Object.entries(s.next).forEach(([v, d]) => {
      if (!pos[d] || d === s.id || d === ids[i + 1]) return;
      const back = ids.indexOf(d) < i, [p, lx, ly] = edgePath(pos[s.id], pos[d]);
      out.push(`<path class="cy-e ${back ? "is-back" : "is-jump"}" d="${p}" marker-end="url(#${back ? "cy-arr-b" : "cy-arr"})"/>` + t(lx, ly, v + (back ? " · volta" : ""), back ? "is-back" : ""));
    }));
    if (drag && drag.type === "link" && drag.to) { const A = pos[drag.from]; out.push(`<path class="cy-e is-temp" d="M${A.x + NW},${A.y + NH / 2} L${drag.to.x},${drag.to.y}"/>`); }
    return `<defs><marker id="cy-arr" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M0,0 L10,5 L0,10 z" class="cy-e__m"/></marker>`
      + `<marker id="cy-arr-b" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M0,0 L10,5 L0,10 z" class="cy-e__m is-back"/></marker></defs>` + out.join("");
  }
  const redrawEdges = () => { const s = host.querySelector(".cy-edges"); if (s) s.innerHTML = edgesSvg(); };
  function nearest(p, from) {
    let best = null, bd = Infinity;
    cur.steps.forEach((s) => { if (s.id === from) return; const P = pos[s.id], dx = Math.max(P.x - p.x, 0, p.x - (P.x + NW)), dy = Math.max(P.y - p.y, 0, p.y - (P.y + NH)), d = Math.hypot(dx, dy); if (d <= CONN && d < bd) { bd = d; best = s.id; } });
    return best;
  }

  // ---------- card (abas Etapa · Agente · Entrega · Aprovação) ----------
  const helpBtn = (k) => k ? ` <button class="cy-help" data-help="${k}" aria-label="Ajuda: ${esc(HELP[k].title)}" title="${esc(HELP[k].title)}">?</button>` : "";
  const field = (name, help, control, hk) => `<div class="fs-field"><div class="fs-field__t"><div class="fs-field__name">${esc(name)}${helpBtn(hk)}</div>${help ? `<div class="fs-field__help">${help}</div>` : ""}</div><div class="fs-field__c">${control}</div></div>`;
  const opts = (list, curv) => list.map(([v, l]) => `<option value="${esc(v)}"${v === curv ? " selected" : ""}>${esc(l)}</option>`).join("");
  const dest = (d) => (d === "@fim" ? "fim do ciclo" : d === "@humano" ? "espera você" : label(d));
  function renderCard() {
    const d = host.querySelector("[data-card]"), s = card && step(card.id); if (!d || !s) return;
    const keep = [...d.querySelectorAll(".cy-nd__col")].map((c) => c.scrollTop), i = cur.steps.indexOf(s), n = cur.steps.length;
    d.innerHTML = `<div class="fs cy-card cy-nd"><header class="cy-nd__h"><button class="btn" data-card-close>← Voltar ao canvas</button>`
      + `<span class="cy-card__ic">${s.kind ? KICON[s.kind] : "＋"}</span><h3 class="fs-h3">${esc(s.label || s.id)} <code>${esc(s.id)}</code></h3><span class="fs-sp"></span>`
      + `<span class="cy__msg ${card.bad ? "is-err" : ""}">${esc(card.msg || "")}</span><button class="btn" data-ph-open title="Referência de cada fase">? Ajuda</button>`
      + `<button class="btn" data-card-step="-1" title="Etapa anterior"${i <= 0 ? " disabled" : ""}>‹</button><button class="btn" data-card-step="1" title="Próxima etapa"${i >= n - 1 ? " disabled" : ""}>›</button>`
      + `<button class="btn cy-danger" data-del-step>Remover etapa</button></header>`
      + `<div class="cy-nd__body"><section class="cy-nd__col"><h4 class="cy-nd__t">Entrada <span>o que a etapa lê</span></h4>${inHtml(s)}</section>`
      + `<section class="cy-nd__col cy-nd__mid"><h4 class="cy-nd__t">Parâmetros <span>como a etapa roda</span></h4>${midHtml(s)}</section>`
      + `<section class="cy-nd__col"><h4 class="cy-nd__t">Saída <span>o que a etapa grava</span></h4>${outHtml(s)}</section></div></div>`;
    d.querySelectorAll(".cy-nd__col").forEach((c, k) => { c.scrollTop = keep[k] || 0; });
    if (!d.open) d.showModal();
  }
  // ENTRADA: arquivos que a etapa lê, de onde vêm e o que já está disponível antes dela
  function inHtml(s) {
    const idx = cur.steps.indexOf(s), writer = (f) => cur.steps.find((x) => x.writes === f && x.id !== s.id);
    const rows = (s.reads || []).map((f, k) => {
      const w = writer(f), early = w && cur.steps.indexOf(w) < idx, late = w && !early;
      const cls = early ? "is-ok" : late ? "is-warn" : "", tx = early ? "vem de " + (w.label || w.id) : late ? "só é gravado depois, por " + (w.label || w.id) : "entrada externa (demanda, issue, pedido…)";
      return `<li class="${cls}"><span>${early ? "✓" : late ? "!" : "•"}</span><code>${esc(f)}</code><small>${esc(tx)}</small><button class="fs-x" data-read-del="${k}" aria-label="Remover">✕</button></li>`;
    }).join("");
    const avail = [...new Set(cur.steps.slice(0, idx).map((x) => x.writes).filter((f) => f && !(s.reads || []).includes(f)))];
    const cmds = `<div class="cy-nd__sub fs-field__name">Comandos de uso</div><p class="fs-muted">Como chamar esta etapa, ex.: <code>@intake &lt;owner&gt;/&lt;repo&gt;#N</code>. Aparece ao passar o mouse no card.</p><textarea class="fs-in" rows="3" data-s="commands" placeholder="@intake &lt;owner&gt;/&lt;issue#N&gt;">${esc(s.commands || "")}</textarea>`;
    return `<p class="fs-muted cy-nd__p">O agente <strong>só enxerga o que você listar aqui</strong>. A 1ª etapa costuma ler a demanda; as outras leem a entrega da etapa anterior.${helpBtn("reads")}</p>`
      + (rows ? `<ul class="cy-io">${rows}</ul>` : `<p class="fs-muted">Esta etapa ainda não lê nenhum arquivo.</p>`)
      + `<div class="cy-vrow"><input class="fs-in" data-read-new placeholder="arquivo.md"><button class="btn" data-read-add>Adicionar</button></div>`
      + cmds
      + (avail.length ? `<div class="fs-muted cy-nd__sub">Disponíveis antes desta etapa:</div><div class="cy-chips">${avail.map((f) => `<button class="btn" data-read-chip="${esc(f)}">＋ ${esc(f)}</button>`).join("")}</div>` : "");
  }
  // PARÂMETROS: nome, fase, quem executa (agente/skill/comando/humano), vereditos, aprovação
  function midHtml(s) {
    const kinds = [["", "— escolha —"], ["agent", "agente"], ["skill", "skill"], ["command", "comando"], ["human", "humano"]];
    const targets = cur.steps.filter((x) => x.id !== s.id).map((x) => [x.id, x.label || x.id]).concat([["@fim", "fim do ciclo"], ["@humano", "espera você"]]);
    const rows = Object.entries(s.next).map(([v, dst]) => `<div class="cy-vrow"><code>${esc(v)}</code><span>→</span><select class="fs-in" data-vto="${esc(v)}">${opts(targets, dst)}</select><button class="fs-x" data-vdel="${esc(v)}" aria-label="Remover">✕</button></div>`).join("");
    let h = field("Nome", "como aparece no card", `<input class="fs-in" data-s="label" value="${esc(s.label)}">`)
      + field("Identificador", "usado nos vereditos e no arquivo do ciclo", `<input class="fs-in" data-s="id" value="${esc(s.id)}">`)
      + field("Fase", "a coluna do card. Trocar move o card", `<select class="fs-in" data-s="phase">${opts(phases().map((p) => [p, p]), s.phase)}</select>`)
      + field("Quem executa", "agente, skill, comando ou uma pessoa", `<select class="fs-in" data-s="kind">${opts(kinds, s.kind)}</select>`);
    if (s.kind === "agent" || s.kind === "skill") {
      const isA = s.kind === "agent", list = isA ? inv.agents : inv.skills, slug = M.slug(s.ref), item = list.find((x) => x.name === slug);
      const val = item ? slug : (s.ref || card.newRef ? "__new__" : "");
      const choices = [["", list.length ? "— escolha —" : "— nenhum encontrado —"]].concat(list.map((x) => [x.name, x.name + (x.refs ? " · " + x.refs + " referência" + (x.refs > 1 ? "s" : "") : "")])).concat([["__new__", "＋ Criar novo…"]]);
      h += field(isA ? "Agente" : "Skill", `escolha um que já está em <code>.claude/${isA ? "agents</code>" : "skills</code>"} ou crie um novo`,
        `<select class="fs-in" data-pick>${opts(choices, val)}</select>` + (val === "__new__" ? `<input class="fs-in" data-s="ref" value="${esc(s.ref)}" placeholder="nome novo, ex.: ${isA ? "architect" : "aes-create-prd"}">` : "")
        + (item ? `<button class="btn cy-edbtn" data-ed-open>Ver e editar arquivos${item.refs ? " (" + (item.refs + 1) + ")" : ""}</button>` : "")
        + (item && item.refs ? `<span class="fs-muted">Est${isA ? "e agente" : "a skill"} tem a pasta <code>references/</code> com ${item.refs} arquivo(s).</span>` : ""));
    }
    if (s.kind === "skill") {
      const ag = M.slug(s.agent), has = inv.agents.some((x) => x.name === ag);
      const ch = [["", "— nenhum (a sessão principal roda a skill) —"]].concat(inv.agents.map((x) => [x.name, x.name])).concat(ag && !has ? [[ag, ag + " (não encontrado)"]] : []);
      h += field("Rodar dentro de um agente", "opcional: dá contexto isolado, ferramentas restritas e modelo próprio", `<select class="fs-in" data-skill-agent>${opts(ch, ag)}</select>` + (has ? `<button class="btn cy-edbtn" data-ed-open-agent>Ver e editar o agente</button>` : ""), "skillAgent");
    }
    if (s.kind === "command") h += field("Comando", "roda na raiz do projeto", `<input class="fs-in" data-s="ref" value="${esc(s.ref)}" placeholder="ex.: npm test">`);
    if (s.kind === "human") h += `<p class="fs-muted">Esta etapa espera uma pessoa.</p>`;
    if (s.kind === "agent") h += agentHtml(s);
    h += `<div class="fs-field fs-field--col cy-nd__v"><div class="fs-field__name">Vereditos → para onde o fluxo vai${helpBtn("verdicts")}</div><div class="fs-field__help">A 1ª linha da entrega é <code>VERDICT: PALAVRA</code>; a palavra tem de ser uma destas, e cada uma leva a uma etapa. Sem veredito, segue para o próximo card. O agente deve ter a mesma lista no <code>## Entrega</code>.</div>${rows || `<span class="fs-muted">nenhum</span>`}`
      + `<div class="cy-vrow"><input class="fs-in" data-vnew placeholder="NOVO VEREDITO (ex.: FAIL)"><button class="btn" data-vadd>Adicionar</button></div></div>`;
    h += field("Aprovação humana", `o modo do ciclo (${esc(M.APPROVALS[cur.approval])}) está no topo; aqui você marca etapas que sempre esperam você`, `<select class="fs-in" data-s="approve"><option value="no"${s.approve ? "" : " selected"}>segue sozinho</option><option value="yes"${s.approve ? " selected" : ""}>para e espera você</option></select>`);
    return h;
  }
  // SAÍDA: o arquivo gravado, o contrato da 1ª linha, vereditos e quem lê esta saída
  function outHtml(s) {
    const first = Object.keys(s.next)[0] || "DONE", readers = s.writes ? cur.steps.filter((x) => x.id !== s.id && (x.reads || []).includes(s.writes)) : [];
    const vs = Object.entries(s.next).map(([v, dd]) => `<li><code>${esc(v)}</code><small>→ ${esc(dest(dd))}</small></li>`).join("");
    return `<div class="fs-field__name">Arquivo${helpBtn("writes")}</div><input class="fs-in" data-s="writes" value="${esc(s.writes)}" placeholder="ex.: prd.md">`
      + `<p class="fs-muted cy-nd__p">É a prova de que a etapa terminou. A <strong>1ª linha</strong> é <code>VERDICT: PALAVRA</code>; o resto explica.</p>`
      + `<pre class="cy-nd__pre">VERDICT: ${esc(first)}\n(explicação em poucas linhas)</pre>`
      + (vs ? `<ul class="cy-io cy-io--v">${vs}</ul>` : `<p class="fs-muted">Sem vereditos: segue para o próximo card.</p>`)
      + `<div class="cy-nd__sub fs-field__name">Lida por</div>` + (readers.length ? `<div class="cy-chips">${readers.map((x) => `<span class="cy-pill">${esc(x.label || x.id)}</span>`).join("")}</div>` : `<p class="fs-muted">${s.writes ? "Nenhuma etapa lê este arquivo ainda. Adicione-o na Entrada da etapa que precisa dele." : "Defina o arquivo para ver quem o lê."}</p>`)
      + `<div class="cy-nd__sub fs-field__name">Status que a entrega libera${helpBtn("status")}</div><input class="fs-in" data-s="status" value="${esc(s.status)}" placeholder="ex.: READY_FOR_ARCH"><p class="fs-muted">Rótulo do estado da tarefa, ex.: READY_FOR_ARCH → READY_FOR_BUILD → DONE.</p>`;
  }
  function agentHtml(s) {
    const a = card.agent;
    if (!s.ref) return `<p class="fs-muted">Dê um nome ao agente para criar ou carregar o arquivo.</p>`;
    if (!a) return `<div class="cy-vrow"><button class="btn" data-agent-load>Carregar / criar “${esc(M.slug(s.ref))}”</button></div>`;
    return `<hr><h4 class="cy-h4">${a.exists ? "Agente existente" : "Agente novo"} · <code>.claude/agents/${esc(a.name)}.md</code></h4>`
      + field("Descrição", "quando o Claude deve usar este agente", `<input class="fs-in" data-a="description" value="${esc(a.description)}">`)
      + field("Modelo", "", `<select class="fs-in" data-a="model">${opts(MODELS, a.model)}</select>`)
      + `<div class="fs-field fs-field--col"><div class="fs-field__name">Ferramentas</div><div class="fs-field__help">Sem nenhuma marcada o agente herda tudo. Só o implementador precisa de Edit e Bash.</div><div class="cy-tools">${TOOLS.map((t) => `<label><input type="checkbox" data-tool="${t}"${a.tools.includes(t) ? " checked" : ""}> ${t}</label>`).join("")}</div></div>`
      + `<div class="fs-field fs-field--col"><div class="fs-field__name">Instruções (prompt de sistema)</div><textarea class="fs-in cy-ta" data-a="body" rows="10" placeholder="Papel, regras, o que nunca fazer, formato da entrega…">${esc(a.body)}</textarea></div>`
      + `<div class="cy-vrow"><button class="btn btn--primary" data-agent-save>Salvar agente</button><button class="btn" data-agent-prompt>Copiar prompt “agent designer”</button></div>`;
  }
  async function loadAgent(s) {
    const name = M.slug(s.ref);
    try { card.agent = Object.assign(M.parseAgent(await readFile(".claude/agents/" + name + ".md")), { exists: true }); card.agent.name = name; }
    catch (e) { card.agent = { name, description: "", model: "", tools: [], body: "", exists: false }; }
    renderCard();
  }
  function designerPrompt(s) {
    return `Você é um "agent designer". Entreviste-me, uma pergunta por vez, para criar o agente da etapa abaixo e, ao final, grave o arquivo .claude/agents/${M.slug(s.ref || s.label)}.md (frontmatter: name, description, tools, model; corpo: prompt de sistema).\n\n`
      + `Ciclo: ${cur.label}\nEtapa: ${s.label} (coluna ${s.phase})\nEntrega: ${s.writes || "(a definir)"}  ·  status: ${s.status || "(a definir)"}\n\n`
      + `Cubra as 5 partes: cérebro (modelo), contexto (o que ele precisa saber), tarefa, regras (o que nunca fazer) e ferramentas (só o necessário). Peça aprovação antes de gravar.`;
  }

  // ---------- eventos ----------
  const $ = (sel) => host.querySelector(sel);
  function openCard(id) {
    card = { id, agent: null, msg: "", bad: false }; sel = id; const s = step(id); renderCard(); renderStage(); if (s && s.kind === "agent" && s.ref) loadAgent(s);
    // relê .claude/agents e .claude/skills do projeto (podem ter mudado, ex.: depois de "Baixar todas as skills")
    if (handle) listInventory().then((i) => { inv = i; if (card && card.id === id) renderCard(); });
  }
  function closeCard() { const d = $("[data-card]"); card = null; if (d && d.open) d.close(); renderStage(); }
  function syncStep(s) { renderStage(); const h = $(".cy-card__h .fs-h3"); if (h) h.textContent = s.label || s.id; }

  host.addEventListener("click", async (e) => {
    const b = e.target.closest("button"); if (!b || b.disabled) return; const d = b.dataset;
    if ("new" in d) { blankCycle(); msg = ""; render(); requestAnimationFrame(fit); return; }
    if ("dup" in d) { duplicate(); render(); requestAnimationFrame(fit); return; }
    if ("save" in d) { await save(); return; }
    if ("jsonExport" in d) { exportJson(); return; }
    if ("jsonImport" in d) { $("[data-json-file]").click(); return; }
    if ("impGo" in d && imp) { doImport(); return; }
    if ("impCancel" in d) { $("[data-imp-dlg]").close(); imp = null; return; }
    if (d.mode) { cur.approval = d.mode; touch(); renderBar(); return; }
    if (d.zoom) { const r = $("[data-stage]").getBoundingClientRect(); zoomAt(view.k * (d.zoom === "1" ? 1.2 : 1 / 1.2), r.width / 2, r.height / 2); return; }
    if ("fit" in d) { fit(); return; }
    if (d.addPhase) { const s = newStep(d.addPhase, null); touch(); render(); openCard(s.id); return; }
    if (d.plus) { const s = newStep(step(d.plus).phase, d.plus); syncOrder(); touch(); render(); openCard(s.id); return; }
    if (d.open) { openCard(d.open); return; }
    if ("edOpenAgent" in d && card) { const st = step(card.id); if (st && st.agent) openEditor("agent", M.slug(st.agent)); return; }
    if ("edOpen" in d && card) { const st = step(card.id); if (st && st.ref) openEditor(st.kind, M.slug(st.ref)); return; }
    if (ed && "edClose" in d) { if (ed.text !== ed.orig && !confirm("Há alterações não salvas. Fechar mesmo assim?")) return; $("[data-ed-dlg]").close(); ed = null; return; }
    if (ed && d.edFile) { pickFile(d.edFile); return; }
    if (ed && "edSave" in d) { saveEd(); return; }
    if (ed && "edNew" in d) { ed.newOpen = true; renderEd(); const i = $("[data-ed-newname]"); if (i) i.focus(); return; }
    if (ed && "edNewCreate" in d) { createRef(); return; }
    if (d.phaseMenu) { openPhaseMenu(d.phaseMenu); return; }
    if ("phaseNew" in d) { openPhaseMenu(null); return; }
    if ("phsave" in d) { savePhase(); return; }
    if ("phcancel" in d) { $("[data-phmenu]").close(); return; }
    if (d.phmove) { movePhase(Number(d.phmove)); return; }
    if ("phremove" in d) { removePhase(); return; }
    if ("phOpen" in d) { openPhase(); return; }
    if ("phClose" in d) { $("[data-phase-dlg]").close(); return; }
    if (d.ph) { phSel = d.ph; renderPhase(); return; }
    if (d.help) { openHelp(d.help); return; }
    if ("helpClose" in d) { $("[data-help-dlg]").close(); return; }
    if (d.linkV) { const v = d.linkV; commitLink(v); return; }
    if ("linkAdd" in d) { commitLink(($("[data-link-new]").value || "").toUpperCase().replace(/[^A-Z0-9_-]/g, "")); return; }
    if ("linkCancel" in d) { $("[data-link]").close(); linkTo = null; renderStage(); return; }
    if (!card) return;
    if ("cardClose" in d) { closeCard(); return; }
    if (d.cardStep) { const j = cur.steps.indexOf(step(card.id)) + Number(d.cardStep); if (cur.steps[j]) openCard(cur.steps[j].id); return; }
    if ("readAdd" in d || d.readChip) {
      const st = step(card.id), f = d.readChip || ($("[data-read-new]").value || "").trim();
      if (st && f && !(st.reads || []).includes(f)) { st.reads = (st.reads || []).concat(f); touch(); renderCard(); } return;
    }
    if (d.readDel !== undefined && d.readDel !== "") { const st = step(card.id); st.reads.splice(Number(d.readDel), 1); touch(); renderCard(); return; }
    const s = step(card.id); if (!s) return;
    if ("delStep" in d) { removeStep(s.id); touch(); closeCard(); render(); return; }
    if (d.vdel) { delete s.next[d.vdel]; touch(); renderCard(); renderStage(); return; }
    if ("vadd" in d) { const v = ($("[data-vnew]").value || "").toUpperCase().replace(/[^A-Z0-9_-]/g, ""); if (v) { s.next[v] = "@humano"; touch(); renderCard(); renderStage(); } return; }
    if ("agentLoad" in d) { loadAgent(s); return; }
    if ("agentSave" in d) {
      try {
        if (!(await canWrite())) throw new Error("Permissão de escrita negada.");
        const a = card.agent; await writeFile(".claude/agents/" + a.name + ".md", M.serializeAgent(a)); a.exists = true; inv = await listInventory();
        card.msg = "Salvo em .claude/agents/" + a.name + ".md"; card.bad = false; if (window.Activity) Activity.log("agent.saved", { title: a.name });
      } catch (err) { card.msg = err.message; card.bad = true; }
      renderCard(); return;
    }
    if ("agentPrompt" in d) { try { await navigator.clipboard.writeText(designerPrompt(s)); card.msg = "Prompt copiado: cole no Claude Code."; card.bad = false; } catch (err) { card.msg = "Não consegui copiar."; card.bad = true; } renderCard(); }
  });

  const HELP = {
    verdicts: { title: "Vereditos", html: `
      <p><strong>Veredito é o resultado de uma etapa</strong>, uma palavra curta em <strong>MAIÚSCULAS</strong> que diz como ela terminou. Cada veredito leva a um destino: a próxima etapa, uma etapa anterior, o fim do ciclo ou você.</p>
      <h4>Como funciona</h4>
      <ol><li>A etapa grava a sua entrega (ex.: <code>review.md</code>).</li>
      <li>A <strong>1ª linha</strong> do arquivo é o veredito, no formato <code>VERDICT: FAIL</code> (a triagem usa <code>DECISION: ACCEPT</code>). Nenhum texto vem antes dela.</li>
      <li>A palavra tem de ser <strong>exatamente</strong> uma das que você ligou aqui. Se vier outra, o ciclo não sabe para onde ir.</li>
      <li>Sem veredito ligado, o fluxo segue para o próximo card.</li>
      <li><strong>O agente precisa conhecer a mesma lista:</strong> ela fica no <code>## Entrega</code> do <code>.claude/agents/&lt;agente&gt;.md</code> e deve ser idêntica à <code>- vereditos:</code> do ciclo.</li></ol>
      <h4>Tipos comuns</h4>
      <table class="cy-ht"><tr><th>Veredito</th><th>Significa</th><th>Destino típico</th></tr>
      <tr><td><code>DONE</code></td><td>terminou bem</td><td>próxima etapa</td></tr>
      <tr><td><code>APPROVED</code></td><td>revisão aprovou</td><td>próxima etapa ou <code>@fim</code></td></tr>
      <tr><td><code>FAIL</code></td><td>teste ou gate falhou</td><td>volta para Build</td></tr>
      <tr><td><code>CHANGES</code></td><td>revisor pediu mudanças</td><td>volta para Build</td></tr>
      <tr><td><code>BLOCKED</code></td><td>falta algo que só uma pessoa dá</td><td><code>@humano</code></td></tr>
      <tr><td><code>ACCEPT</code></td><td>triagem: vale construir</td><td>próxima etapa</td></tr>
      <tr><td><code>NEEDS-INFO</code></td><td>triagem: falta informação do autor</td><td><code>@humano</code></td></tr>
      <tr><td><code>REJECT</code></td><td>triagem: não vale construir</td><td><code>@fim</code></td></tr></table>
      <p class="fs-muted">Os nomes são livres: crie os seus (ex.: <code>RISCO_ALTO</code>). Use maiúsculas e sem espaços (hífen é aceito, como em <code>NEEDS-INFO</code>).</p>
      <h4>Destinos especiais</h4>
      <ul><li><code>@humano</code>: o ciclo para e espera você.</li><li><code>@fim</code>: o ciclo termina.</li><li>qualquer etapa: o fluxo vai para ela (se for uma etapa anterior, vira um retorno).</li></ul>
      <h4>Exemplo</h4>
      <pre>Etapa: Code review
- vereditos: APPROVED → pr; CHANGES → build; BLOCKED → @humano</pre>
      <p>Se <code>review.md</code> começar com <code>VERDICT: CHANGES</code>, o fluxo volta para <strong>Build</strong>.</p>
      <h4>Como usar</h4>
      <ul><li>Aqui, na aba <strong>Etapa</strong>: digite o nome e clique em Adicionar; depois escolha o destino na lista.</li>
      <li>Ou no canvas: arraste a bolinha <strong>●</strong> do card até outro card e escolha o veredito.</li></ul>
      <h4>Onde visualizar</h4>
      <ul><li><strong>No canvas:</strong> setas tracejadas com o nome do veredito; <span class="cy-or">laranja</span> com "· volta" é um retorno.</li>
      <li><strong>No arquivo:</strong> <code>.claude/cycles/&lt;ciclo&gt;.md</code> (linha <code>- vereditos:</code>) e <code>.claude/cycles/&lt;ciclo&gt;.json</code> (campo <code>next</code>).</li>
      <li><strong>Na entrega:</strong> a 1ª linha do arquivo que a etapa gravou.</li></ul>
      <p class="fs-muted">Criou o agente com a skill <code>criar-agente</code>? Ela já grava esta lista no agente e no ciclo. Se mudar aqui, mude também no <code>## Entrega</code> do agente.</p>` },
  };
  HELP.skillAgent = { title: "Rodar a skill dentro de um agente", html: `
      <p>Uma skill pode ser executada de <strong>dois jeitos</strong>. Este campo escolhe qual.</p>
      <h4>Sem agente (padrão)</h4>
      <ul><li>A <strong>sessão principal</strong> do Claude Code roda a skill (ex.: <code>/aes-create-prd</code>).</li>
      <li>Usa o contexto, as ferramentas e o modelo da sessão.</li>
      <li>É o mais simples. Serve para etapas de documento.</li></ul>
      <h4>Dentro de um agente</h4>
      <ul><li>A skill roda <strong>dentro do agente escolhido</strong>.</li>
      <li><strong>Contexto isolado:</strong> o trabalho da etapa não polui a conversa principal.</li>
      <li><strong>Ferramentas restritas:</strong> só o que o agente permite (ex.: só leitura).</li>
      <li><strong>Modelo próprio:</strong> ex.: <code>opus</code> só no PRD.</li></ul>
      <h4>Quando escolher um agente</h4>
      <ul><li>A etapa edita arquivos ou roda comandos e você quer limitar o poder dela.</li>
      <li>A etapa gera muito texto e deixaria a conversa pesada.</li>
      <li>Você quer um modelo diferente do da sessão.</li></ul>
      <h4>Como fica no arquivo do ciclo</h4>
      <pre>- executa: skill sdlc-intent
- no agente: doc-writer</pre>
      <p class="fs-muted">Na Factory v2 é o mesmo conceito: <code>skill: sdlc-intent</code> junto com <code>agent: ...</code> significa "rode esta skill dentro deste agente". O agente deve existir em <code>.claude/agents/</code>; confira na documentação do Claude Code da sua versão como o agente carrega a skill.</p>` };
  HELP.reads = { title: "Entrada: o que a etapa lê", html: `
      <p><strong>É a lista de arquivos que o agente deve ler antes de começar.</strong> O agente de uma etapa não "lembra" das outras: ele só sabe o que está nestes arquivos.</p>
      <h4>De onde vêm</h4>
      <ul><li><strong>Entrega da etapa anterior:</strong> ex.: o Build lê <code>prd.md</code> e <code>adr.md</code>. Aparece com ✓ e "vem de …".</li>
      <li><strong>Entrada externa:</strong> a demanda que começa o ciclo (issue, pedido, mensagem). Aparece com • .</li>
      <li><span class="cy-or">!</span> <strong>Só é gravado depois:</strong> a etapa lê um arquivo que só existe numa etapa posterior. Reordene ou corrija.</li></ul>
      <h4>Como usar</h4>
      <ul><li>Digite o nome do arquivo e clique em Adicionar, ou use os botões "＋ arquivo" em <em>Disponíveis antes desta etapa</em>.</li>
      <li>Leia só o necessário: menos arquivos, agente mais focado e mais barato.</li></ul>
      <h4>Onde visualizar</h4>
      <ul><li>Aqui, na coluna Entrada; no arquivo do ciclo, linha <code>- lê:</code>; e na coluna Saída da etapa anterior, em "Lida por".</li></ul>` };
  HELP.writes = { title: "Arquivo que a etapa grava", html: `
      <p><strong>É a entrega da etapa:</strong> o arquivo que ela produz e que a próxima etapa lê. É assim que os agentes passam o trabalho um para o outro (handoff), sem depender da memória da conversa.</p>
      <h4>Como funciona</h4>
      <ol><li>A etapa faz o trabalho e grava este arquivo.</li>
      <li>A <strong>1ª linha</strong> é o veredito (veja o <strong>?</strong> de Vereditos), por exemplo <code>VERDICT: DONE</code>.</li>
      <li>O resto é o conteúdo: o PRD, a decisão, o relatório.</li>
      <li>A etapa seguinte lê o arquivo antes de começar.</li></ol>
      <h4>Exemplos</h4>
      <table class="cy-ht"><tr><th>Etapa</th><th>Arquivo</th></tr>
      <tr><td>PRD</td><td><code>prd.md</code></td></tr>
      <tr><td>Arquitetura</td><td><code>adr.md</code></td></tr>
      <tr><td>Build</td><td><code>build.md</code> (resumo do que foi feito)</td></tr>
      <tr><td>Revisão</td><td><code>review.md</code></td></tr>
      <tr><td>Testes</td><td><code>test-report.md</code></td></tr></table>
      <h4>Como usar</h4>
      <ul><li>Um arquivo por etapa, com nome simples e <code>.md</code>.</li>
      <li>Digite só o nome do arquivo. Combine no <code>CLAUDE.md</code> a pasta onde as entregas ficam (por exemplo <code>docs/</code> ou uma pasta por tarefa).</li>
      <li>Sem arquivo definido, o card mostra <span class="cy-or">!</span>: a etapa fica sem entrega para a próxima ler.</li></ul>
      <h4>Onde visualizar</h4>
      <ul><li><strong>No card do canvas:</strong> a linha "grava <code>prd.md</code>".</li>
      <li><strong>No arquivo do ciclo:</strong> <code>.claude/cycles/&lt;ciclo&gt;.md</code>, linha <code>- grava:</code>.</li>
      <li><strong>No projeto:</strong> o próprio arquivo, depois que a etapa rodar.</li></ul>` };
  HELP.status = { title: "Status que a entrega libera", html: `
      <p><strong>É o estado da tarefa depois que a etapa termina:</strong> um rótulo que diz "isto está pronto para o próximo passo". Serve para saber, de relance, em que ponto a tarefa está.</p>
      <h4>Diferença para o veredito</h4>
      <table class="cy-ht"><tr><th></th><th>Veredito</th><th>Status</th></tr>
      <tr><td>Para que serve</td><td>escolhe o <strong>caminho</strong></td><td>descreve o <strong>estado</strong></td></tr>
      <tr><td>Exemplo</td><td><code>FAIL</code> → volta para Build</td><td><code>READY_FOR_BUILD</code></td></tr>
      <tr><td>Onde aparece</td><td>1ª linha da entrega</td><td>campo do ciclo (e, no futuro, <code>state.md</code>)</td></tr></table>
      <h4>Exemplo de sequência</h4>
      <pre>PRD          → status: READY_FOR_ARCH
Arquitetura  → status: READY_FOR_BUILD
Build        → status: READY_FOR_QA
QA           → status: DONE</pre>
      <p>Cada etapa só deve começar quando a anterior liberou o status que ela espera.</p>
      <h4>Como usar</h4>
      <ul><li>Use maiúsculas e <code>_</code>, sem espaços.</li>
      <li>Nomeie pelo que vem a seguir: <code>READY_FOR_&lt;próxima fase&gt;</code>.</li>
      <li>É opcional: se o ciclo for curto, deixe vazio.</li></ul>
      <h4>Onde visualizar</h4>
      <ul><li><strong>No arquivo do ciclo:</strong> <code>.claude/cycles/&lt;ciclo&gt;.md</code>, linha <code>- status:</code>.</li>
      <li><strong>Ainda não aparece no card</strong> do canvas. O acompanhamento "onde estou" (<code>state.md</code>) é uma etapa futura da proposta.</li></ul>` };
  function openHelp(k) {
    const h = HELP[k], d = $("[data-help-dlg]"); if (!h || !d) return;
    d.innerHTML = `<div class="fs cy-card"><header class="cy-card__h"><span class="cy-card__ic">?</span><h3 class="fs-h3">${esc(h.title)}</h3><span class="fs-sp"></span><button class="fs-x" data-help-close aria-label="Fechar">✕</button></header>`
      + `<div class="cy-card__b cy-help-b">${h.html}</div><footer class="cy-card__f"><span class="fs-sp"></span><button class="btn btn--primary" data-help-close>Entendi</button></footer></div>`;
    d.showModal();
  }

  // ---------- editor de arquivos do agente / skill (melhoria contínua) ----------
  let ed = null; // { kind, name, base, files: [rel], cur, text, orig, msg, bad, newOpen }
  const EXT = /\.(md|txt|json|ya?ml|sh|js|mjs|py|html|css)$/i;
  async function walk(d, prefix, depth, out) {
    for await (const e of d.values()) {
      if (e.kind === "file") { if (EXT.test(e.name)) out.push(prefix + e.name); }
      else if (depth < 3) await walk(e, prefix + e.name + "/", depth + 1, out);
    }
  }
  async function listFiles(kind, name) {
    if (kind === "agent") return { base: ".claude/agents/", files: [name + ".md"] };
    const base = ".claude/skills/" + name + "/", out = []; await walk(await dir(base.slice(0, -1)), "", 0, out);
    out.sort((a, b) => (a === "SKILL.md" ? -1 : b === "SKILL.md" ? 1 : a.localeCompare(b))); return { base, files: out };
  }
  async function openEditor(kind, name) {
    try {
      const l = await listFiles(kind, name);
      ed = { kind, name, base: l.base, files: l.files, cur: null, text: "", orig: "", msg: "", bad: false, newOpen: false };
      await pickFile(l.files[0]); $("[data-ed-dlg]").showModal();
    } catch (e) { if (card) { card.msg = "Não consegui abrir os arquivos: " + e.message; card.bad = true; renderCard(); } }
  }
  async function pickFile(rel) {
    if (ed.cur && ed.text !== ed.orig && !confirm("Há alterações não salvas neste arquivo. Descartar?")) return;
    try { ed.text = await readFile(ed.base + rel); } catch (e) { ed.text = ""; ed.msg = "Não consegui ler " + rel; ed.bad = true; }
    ed.cur = rel; ed.orig = ed.text; if (!ed.bad) ed.msg = ""; ed.bad = false; renderEd();
  }
  function renderEd() {
    const d = $("[data-ed-dlg]"); if (!d || !ed) return;
    const dirtyF = ed.text !== ed.orig;
    d.innerHTML = `<div class="fs cy-card cy-ed"><header class="cy-card__h"><span class="cy-card__ic">${ed.kind === "agent" ? "🤖" : "🧩"}</span><div><h3 class="fs-h3">${esc(ed.name)}</h3><div class="fs-muted"><code>${esc(ed.base)}</code></div></div><span class="fs-sp"></span><button class="fs-x" data-ed-close aria-label="Fechar">✕</button></header>`
      + `<div class="cy-ed__body"><aside class="cy-ed__list">${ed.files.map((f) => `<button data-ed-file="${esc(f)}" aria-current="${f === ed.cur}">${esc(f)}</button>`).join("")}`
      + (ed.kind === "skill" ? (ed.newOpen ? `<div class="cy-ed__new"><input class="fs-in" data-ed-newname placeholder="references/nome.md"><button class="btn" data-ed-new-create>Criar</button></div>` : `<button class="cy-ed__add" data-ed-new>＋ Novo arquivo</button>`) : "") + `</aside>`
      + `<div class="cy-ed__main"><div class="cy-ed__path"><code>${esc(ed.base + (ed.cur || ""))}</code>${dirtyF ? ` <span class="cy-ed__dot">● não salvo</span>` : ""}</div><textarea class="fs-in cy-ed__ta" data-ed-text spellcheck="false">${esc(ed.text)}</textarea></div></div>`
      + `<footer class="cy-card__f"><span class="cy__msg ${ed.bad ? "is-err" : ""}">${esc(ed.msg || "As alterações valem para as próximas execuções do Claude Code.")}</span><span class="fs-sp"></span><button class="btn" data-ed-close>Fechar</button><button class="btn btn--primary" data-ed-save${dirtyF ? "" : " disabled"}>Salvar</button></footer></div>`;
  }
  async function saveEd() {
    try {
      if (!(await canWrite())) throw new Error("Permissão de escrita negada.");
      await writeFile(ed.base + ed.cur, ed.text); ed.orig = ed.text; ed.msg = "Salvo: " + ed.base + ed.cur; ed.bad = false;
      if (window.Activity) Activity.log("agent.saved", { title: ed.name + "/" + ed.cur });
      inv = await listInventory();
      if (card && card.agent && ed.kind === "agent") { const st = step(card.id); if (st) loadAgent(st); }
    } catch (e) { ed.msg = e.message; ed.bad = true; }
    renderEd();
  }
  async function createRef() {
    let n = ($("[data-ed-newname]").value || "").trim().replace(/^\/+/, ""); if (!n) return;
    if (!n.includes("/")) n = "references/" + n; if (!/\.[a-z0-9]+$/i.test(n)) n += ".md";
    n = n.split("/").map((x, i, a) => (i === a.length - 1 ? x.replace(/[^A-Za-z0-9._-]+/g, "-") : M.slug(x))).join("/");
    if (ed.files.includes(n)) { ed.msg = "Esse arquivo já existe."; ed.bad = true; renderEd(); return; }
    try {
      if (!(await canWrite())) throw new Error("Permissão de escrita negada.");
      await writeFile(ed.base + n, "# " + n.split("/").pop().replace(/\.[^.]+$/, "") + "\n\n");
      ed.files.push(n); ed.files.sort((a, b) => (a === "SKILL.md" ? -1 : b === "SKILL.md" ? 1 : a.localeCompare(b))); ed.newOpen = false; inv = await listInventory(); await pickFile(n);
    } catch (e) { ed.msg = e.message; ed.bad = true; renderEd(); }
  }

  // ---------- ajuda por fase (referência: Factory v2) ----------
  const PHASE_ORDER = ["Visão geral"].concat(M.PHASES);
  const PH = {
    "Visão geral": {
      why: "Um ciclo é uma linha de montagem: cada <strong>fase</strong> (coluna) responde a uma pergunta, e cada <strong>etapa</strong> (card) é um trabalhador que lê arquivos, faz a sua parte e grava um arquivo. O que passa de uma etapa para a outra são <strong>arquivos</strong>, não conversa.",
      flow: ["Discover · devemos fazer? o quê?", "Design · como vamos fazer?", "Build · fazer", "Verify · está bom?", "Deliver · entregar", "Operate · está funcionando?"],
      fields: [["Entrada (lê)", "os arquivos que o agente precisa ler. Só o que você listar existe para ele."], ["Quem executa", "agente (decide e escreve), skill (roteiro fixo), comando (roda e dá certo ou errado) ou humano."], ["Saída (grava)", "o arquivo da entrega. A 1ª linha é o veredito; o resto explica."], ["Vereditos", "para onde o fluxo vai: próxima etapa, voltar, esperar você (<code>@humano</code>) ou terminar (<code>@fim</code>)."], ["Aprovação", "marque as etapas que sempre esperam o seu \"ok\" (ex.: merge)."]],
      tips: ["Comece pequeno: <strong>Intake → Build → Gate → PR</strong> já é um ciclo útil (é o perfil mais curto da Factory v2).", "Cada etapa lê o que a anterior gravou: se a Entrada mostra <span class=\"cy-or\">!</span>, a ordem está errada.", "As fases são colunas do <em>seu</em> ciclo: use <strong>⋯</strong> no título para renomear, mover ou remover, e <strong>＋ Nova fase</strong> no fim. As seis padrão são só um ponto de partida.", "Use um agente barato (haiku) para rotina e um forte (opus) só onde decidir é difícil."],
    },
    Discover: {
      why: "Entender <strong>o que pedem e se vale fazer</strong> antes de gastar com código. Termina com uma decisão (aceitar, pedir mais informação ou rejeitar) e, nos ciclos longos, com intenção e PRD escritos.",
      enters: "A demanda que chegou: issue, mensagem do Slack, alerta de telemetria (<code>issue.md</code>).",
      leaves: "Uma classificação (<code>intake.md</code>) e, se for o caso, <code>intent.md</code> e <code>prd.md</code>.",
      who: "Agente de triagem (barato e rápido). Para PRD e intenção, um modelo mais forte.",
      verdicts: [["ACCEPT", "vale fazer", "próxima etapa"], ["NEEDS-INFO", "faltam dados do autor", "@humano (pergunta ao autor)"], ["REJECT", "não vamos fazer", "@fim"], ["DONE / BLOCKED", "documento pronto / impedido", "próxima / @humano"]],
      steps: [["Intake", "agente intake", "issue.md", "intake.md", "ACCEPT · NEEDS-INFO · REJECT"], ["Intent", "skill sdlc-intent (opus)", "issue.md, intake.md", "intent.md", "DONE · BLOCKED"], ["PRD", "agente doc-writer (opus)", "issue.md, intake.md, intent.md", "prd.md", "DONE · BLOCKED"]],
      example: "### Intake\n- id: intake\n- executa: agente intake\n- lê: issue.md\n- grava: intake.md\n- aprovação: não\n- vereditos: ACCEPT → spec; NEEDS-INFO → @humano; REJECT → @fim",
      tips: ["O Intake também classifica o <strong>risco</strong> (baixo, médio, alto) e as <strong>superfícies</strong> (UI, segurança). Na Factory v2 isso liga ou desliga revisores depois.", "Nunca deixe o Intake escrever código: ele só lê e decide.", "Se a demanda vem de fora (Slack, GitHub), é aqui que o orquestrador entra."],
    },
    Design: {
      why: "Decidir <strong>como</strong> fazer, em documentos, antes de codar. Cada documento reduz o risco de o Build construir a coisa errada.",
      enters: "O que o Discover gravou (<code>intake.md</code>, <code>intent.md</code>, <code>prd.md</code>).",
      leaves: "<code>spec.md</code>, <code>techspec.md</code>, <code>plan.md</code>, <code>tasks.md</code> e, se houver tela, <code>prototype.md</code>.",
      who: "Agentes de documento (escritor de spec, doc-writer) ou skills de planejamento. Peça de decisão pesada: modelo forte.",
      verdicts: [["DONE", "documento pronto", "próxima etapa"], ["BLOCKED", "falta decisão sua", "@humano"]],
      steps: [["Prototype", "agente doc-writer (sonnet)", "intake.md, intent.md", "prototype.md", "DONE · BLOCKED"], ["Spec", "agente spec-writer", "issue, intake, intent, prd", "spec.md", "DONE · BLOCKED"], ["TechSpec", "agente doc-writer (opus)", "spec.md", "techspec.md", "DONE · BLOCKED"], ["Plan", "skill sdlc-plan (opus)", "intent, spec, techspec, prototype", "plan.md", "DONE · BLOCKED"], ["Tasks", "agente doc-writer (sonnet)", "spec.md, plan.md", "tasks.md", "DONE · BLOCKED"]],
      example: "### Spec\n- id: spec\n- executa: agente spec-writer\n- lê: issue.md, intake.md, intent.md, prd.md\n- grava: spec.md\n- aprovação: não\n- vereditos: DONE → build; BLOCKED → @humano",
      tips: ["Ponto bom para uma <strong>aprovação humana</strong>: revisar spec ou ADR antes de implementar é barato; corrigir depois do código não é.", "Um mesmo agente (<code>doc-writer</code>) pode servir a várias etapas; o que muda é a instrução extra de cada uma.", "Em bug simples, dá para pular tudo e ir de Intake direto a Spec."],
    },
    Build: {
      why: "<strong>Escrever o código</strong> seguindo o que o Design decidiu. É a única fase que precisa de poder de edição.",
      enters: "<code>spec.md</code>, <code>plan.md</code>, <code>tasks.md</code>. Em rodadas de correção, também o parecer do Verify.",
      leaves: "<code>build.md</code>: resumo do que foi feito, o que ficou de fora e como testar.",
      who: "Agente implementador, com <code>Edit</code> e <code>Bash</code>. Ele trabalha numa branch ou worktree separada, não na principal.",
      verdicts: [["READY", "pronto para verificar", "próxima etapa (Gate)"], ["BLOCKED", "não consegue continuar", "@humano"]],
      steps: [["Build", "agente builder (retomado a cada rodada)", "spec.md, plan.md, tasks.md", "build.md", "READY · BLOCKED"]],
      example: "### Build\n- id: build\n- executa: agente builder\n- lê: spec.md, plan.md, tasks.md\n- grava: build.md\n- aprovação: não\n- vereditos: READY → gate; BLOCKED → @humano",
      tips: ["É o destino das setas de <strong>volta</strong>: Gate com FAIL e revisores com CHANGES retornam para cá. Cada volta é uma <strong>rodada</strong>.", "Limite as rodadas (a Factory v2 limita) para o laço não rodar para sempre.", "Dê ao builder só as ferramentas necessárias e diga no prompt o que ele <strong>nunca</strong> faz (merge, push na main)."],
    },
    Verify: {
      why: "Provar que o código está bom <strong>antes</strong> de abrir o PR: primeiro com checagem objetiva (testes), depois com revisores especializados.",
      enters: "O código e o <code>build.md</code>. Cada revisor também lê o diff.",
      leaves: "Um parecer por etapa em <code>round-N/</code>: <code>checks.md</code>, <code>review-code.md</code>, <code>review-ux.md</code>…",
      who: "O <strong>gate</strong> é um comando (<code>npm test</code>): o resultado vem do código de saída, não de opinião. Os revisores são agentes só de leitura, um por lente (código, UX, UI, segurança).",
      verdicts: [["PASS", "passou", "próxima etapa"], ["FAIL", "gate falhou", "volta para Build"], ["CHANGES", "revisor pediu mudanças", "volta para Build"]],
      steps: [["Gate", "comando (script de checagens)", "—", "round-N/checks.md", "PASS · FAIL→Build"], ["Code review", "agente reviewer-code (haiku)", "—", "round-N/review-code.md", "PASS · CHANGES→Build"], ["UX review", "agente reviewer-ux (sonnet)", "—", "round-N/review-ux.md", "PASS · CHANGES→Build"], ["UI review", "agente reviewer-ui (haiku)", "—", "round-N/review-ui.md", "PASS · CHANGES→Build"], ["Security review", "agente reviewer-security (opus)", "—", "round-N/review-security.md", "PASS · CHANGES→Build"]],
      example: "### Gate\n- id: gate\n- executa: comando npm test\n- grava: gate.md\n- aprovação: não\n- vereditos: PASS → review; FAIL → build",
      tips: ["Gate primeiro, revisores depois: não gaste um revisor caro num código que nem compila.", "Na Factory v2 os revisores rodam <strong>em paralelo</strong> (mesmo grupo) e só os que o risco pede ficam ligados.", "Revisor <strong>nunca edita</strong>: só lê e grava o parecer. Quem corrige é o Build.", "Veja <em>dicas.md</em> para saber quando o gate precisa de script ou de hook."],
    },
    Deliver: {
      why: "Levar o resultado ao repositório: abrir o PR, decidir a aprovação e fazer o merge. São as ações <strong>públicas e difíceis de desfazer</strong>.",
      enters: "Os pareceres do Verify e o <code>build.md</code>.",
      leaves: "<code>pr.md</code> (link do PR), <code>decision.md</code> (aprovado ou não e por quê) e <code>merge.md</code>.",
      who: "Comandos para PR e merge (<code>gh pr create</code>, <code>gh pr merge</code>); um agente aprovador para a decisão. Em modo manual, você.",
      verdicts: [["PASS", "PR aberto", "próxima etapa"], ["APPROVE / ESCALATE", "aprovado / dúvida", "próxima / @humano"], ["MERGED / FAIL", "integrado / falhou", "@fim / @humano"]],
      steps: [["PR", "comando (abre o PR em rascunho)", "—", "pr.md", "PASS · FAIL→@humano"], ["Approve", "agente approver", "—", "decision.md", "APPROVE · ESCALATE→@humano"], ["Merge", "comando (sincroniza, roda o gate de novo, faz o merge)", "—", "merge.md", "MERGED→@fim · FAIL→@humano"]],
      example: "### Merge\n- id: merge\n- executa: comando gh pr merge --squash\n- grava: merge.md\n- aprovação: sim\n- vereditos: MERGED → @fim; FAIL → @humano",
      tips: ["Marque <strong>Aprovação humana</strong> em Merge. A Factory v2 também avisa antes de qualquer ação irreversível.", "O modo do ciclo (Manual, Para no PR, Automático) define onde o fluxo para: \"Para no PR\" espera você depois do PR.", "O Merge deve rodar o gate <strong>de novo</strong>: a base pode ter mudado desde a revisão."],
    },
    Operate: {
      why: "Confirmar que a mudança <strong>funciona em produção</strong> e fechar o ciclo. É a fase que alimenta o próximo Discover (telemetria, erros).",
      enters: "O resultado do deploy e a telemetria.",
      leaves: "<code>operate.md</code>: o que foi observado depois do deploy.",
      who: "Geralmente <strong>humano</strong> ou algo fora da fábrica (CI, deploy). Um agente pode resumir a telemetria.",
      verdicts: [["DONE", "tudo certo em produção", "@fim"], ["FAIL", "problema em produção", "@humano"]],
      steps: [["Operate", "humano ou CI (fora da fábrica)", "—", "operate.md", "DONE→@fim · FAIL→@humano"]],
      example: "### Operate\n- id: operate\n- executa: humano\n- grava: operate.md\n- aprovação: sim\n- vereditos: DONE → @fim; FAIL → @humano",
      tips: ["Comece sem esta etapa: ela só vale quando você já tem deploy e telemetria ligados.", "Um FAIL aqui costuma virar uma <strong>nova demanda</strong> no Discover, não uma volta ao Build."],
    },
  };
  let phSel = "Visão geral";
  const tbl = (head, rows) => `<table class="cy-ht"><tr>${head.map((h) => `<th>${h}</th>`).join("")}</tr>${rows.map((r) => `<tr>${r.map((c) => `<td>${c}</td>`).join("")}</tr>`).join("")}</table>`;
  function phaseHtml(k) {
    const p = PH[k]; if (!p) return "";
    if (k === "Visão geral") return `<p>${p.why}</p><h4>As fases, em ordem</h4><ol class="cy-flow">${p.flow.map((f) => `<li>${f}</li>`).join("")}</ol>`
      + `<h4>Como preencher uma etapa</h4>${tbl(["Campo", "Para que serve"], p.fields.map((f) => ["<strong>" + f[0] + "</strong>", f[1]]))}<h4>Dicas</h4><ul>${p.tips.map((t) => `<li>${t}</li>`).join("")}</ul>`
      + `<p class="fs-muted">Escolha uma fase acima para ver as etapas reais da Factory v2, exemplos e cuidados.</p>`;
    return `<p>${p.why}</p>`
      + tbl(["", ""], [["<strong>Entra</strong>", p.enters], ["<strong>Sai</strong>", p.leaves], ["<strong>Quem executa</strong>", p.who]]).replace(/<tr><th><\/th><th><\/th><\/tr>/, "")
      + `<h4>Vereditos típicos</h4>${tbl(["Veredito", "Significa", "Destino"], p.verdicts.map((v) => ["<code>" + v[0] + "</code>", v[1], v[2]]))}`
      + `<h4>Etapas da Factory v2 nesta fase</h4>${tbl(["Etapa", "Quem executa", "Lê", "Grava", "Vereditos"], p.steps.map((r) => [`<strong>${r[0]}</strong>`, r[1], r[2] === "—" ? "—" : "<code>" + r[2].split(", ").join("</code> <code>") + "</code>", "<code>" + r[3] + "</code>", r[4]]))}`
      + `<h4>Exemplo no formato deste ciclo</h4><pre>${esc(p.example)}</pre><h4>Cuidados</h4><ul>${p.tips.map((t) => `<li>${t}</li>`).join("")}</ul>`;
  }
  function renderPhase() {
    const d = $("[data-phase-dlg]"), cp = card && step(card.id) ? step(card.id).phase : null;
    d.innerHTML = `<div class="fs cy-card cy-ph"><header class="cy-card__h"><span class="cy-card__ic">?</span><div><h3 class="fs-h3">Ajuda por fase</h3><div class="fs-muted">Referência baseada na Factory v2</div></div><span class="fs-sp"></span><button class="fs-x" data-ph-close aria-label="Fechar">✕</button></header>`
      + `<nav class="cy-ph__chips">${PHASE_ORDER.map((k) => `<button data-ph="${esc(k)}" aria-pressed="${k === phSel}">${esc(k)}${k === cp ? ` <small title="fase desta etapa">●</small>` : ""}</button>`).join("")}</nav>`
      + `<div class="cy-card__b cy-help-b">${phaseHtml(phSel)}</div><footer class="cy-card__f"><span class="fs-muted">● marca a fase da etapa aberta</span><span class="fs-sp"></span><button class="btn btn--primary" data-ph-close>Entendi</button></footer></div>`;
  }
  function openPhase() { const s = card && step(card.id); phSel = s && PH[s.phase] ? s.phase : "Visão geral"; renderPhase(); const d = $("[data-phase-dlg]"); if (!d.open) d.showModal(); }

  // ---------- fases (colunas): criar, renomear, mover, remover ----------
  const cleanPhase = (v) => String(v || "").replace(/[,\n]/g, " ").replace(/\s+/g, " ").trim().slice(0, 32);
  function reflow() {
    cur.steps.forEach((st) => { if (pos[st.id]) pos[st.id].x = colX(phaseIdx(st.phase)); });
    cur.phases.forEach((_, c) => unstack(c)); syncOrder(); touch(); renderStage();
  }
  function openPhaseMenu(name) {
    phMenu = name || null; const d = $("[data-phmenu]"), i = name ? cur.phases.indexOf(name) : -1, n = name ? cur.steps.filter((x) => x.phase === name).length : 0;
    const to = name && cur.phases.length > 1 ? cur.phases[i > 0 ? i - 1 : 1] : null;
    d.innerHTML = `<div class="fs cy-card"><h3 class="fs-h3">${name ? "Fase: " + esc(name) : "Nova fase"}</h3>`
      + `<label class="cy__f"><span class="cy__l">Nome</span><input class="fs-in" data-phname value="${esc(name || "")}" placeholder="ex.: Pesquisa" maxlength="32"></label>`
      + `<div class="cy-vrow"><button class="btn btn--primary" data-phsave>${name ? "Renomear" : "Criar fase"}</button><button class="btn" data-phcancel>Fechar</button></div>`
      + (name ? `<hr><div class="cy-vrow"><button class="btn" data-phmove="-1"${i <= 0 ? " disabled" : ""}>← Mover para a esquerda</button><button class="btn" data-phmove="1"${i >= cur.phases.length - 1 ? " disabled" : ""}>Mover para a direita →</button></div>`
        + (cur.phases.length > 1 ? `<p class="fs-muted">${n ? `Ao remover, as <strong>${n}</strong> etapa(s) desta fase vão para <strong>${esc(to)}</strong>.` : "Esta fase está vazia."}</p><button class="btn cy-danger" data-phremove>Remover fase</button>` : `<p class="fs-muted">O ciclo precisa de pelo menos uma fase.</p>`) : "") + `</div>`;
    d.showModal(); const inp = d.querySelector("[data-phname]"); inp.focus(); inp.select();
  }
  function savePhase() {
    const v = cleanPhase($("[data-phname]").value), d = $("[data-phmenu]"); if (!v) return;
    if (cur.phases.some((p) => p.toLowerCase() === v.toLowerCase() && p !== phMenu)) { const m = d.querySelector(".cy-phmsg") || d.querySelector(".cy-card").appendChild(Object.assign(document.createElement("p"), { className: "fs-muted cy-phmsg" })); m.textContent = "Já existe uma fase com esse nome."; return; }
    if (phMenu) { const i = cur.phases.indexOf(phMenu); cur.steps.forEach((st) => { if (st.phase === phMenu) st.phase = v; }); cur.phases[i] = v; }
    else cur.phases.push(v);
    d.close(); reflow(); requestAnimationFrame(fit);
  }
  function movePhase(dir) {
    const i = cur.phases.indexOf(phMenu), j = i + dir; if (j < 0 || j >= cur.phases.length) return;
    [cur.phases[i], cur.phases[j]] = [cur.phases[j], cur.phases[i]]; $("[data-phmenu]").close(); reflow();
  }
  function removePhase() {
    const i = cur.phases.indexOf(phMenu); if (i < 0 || cur.phases.length < 2) return;
    const to = cur.phases[i > 0 ? i - 1 : 1]; cur.steps.forEach((st) => { if (st.phase === phMenu) st.phase = to; });
    cur.phases.splice(i, 1); $("[data-phmenu]").close(); reflow();
  }

  // ---------- importar / exportar .json (formato aes-cycle) ----------
  let imp = null; // { pack, name }
  async function exportJson() {
    const J = window.CycleJson; if (!J || !cur) return;
    const { pack, warnings } = J.toPack(cur), text = JSON.stringify(pack, null, 2) + "\n", name = pack.cycle.id + ".json";
    let where = name;
    try {
      if (window.showSaveFilePicker) {
        const h = await window.showSaveFilePicker({ suggestedName: name, id: "aes-cycles", types: [{ description: "Ciclo aes-cycle", accept: { "application/json": [".json"] } }] });
        const w = await h.createWritable(); await w.write(text); await w.close(); where = h.name;
      } else {
        const a = document.createElement("a"); a.href = URL.createObjectURL(new Blob([text], { type: "application/json" })); a.download = name; document.body.append(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 1000);
      }
      msg = "Exportado: " + where + (warnings.length ? " · avisos: " + warnings.slice(0, 2).join("; ") + (warnings.length > 2 ? " (+" + (warnings.length - 2) + ")" : "") : ""); bad = false;
      if (window.Activity) Activity.log("cycle.exported", { title: cur.label || cur.id });
    } catch (e) { if (e && e.name === "AbortError") return; msg = "Não exportei: " + e.message; bad = true; }
    updateStatus();
  }
  async function pickJson(file) {
    const J = window.CycleJson; if (!file) return;
    try {
      const pack = JSON.parse(await file.text()), errs = J.validate(pack);
      if (errs.length) throw new Error(errs.join("; "));
      imp = { pack, name: file.name }; renderImport();
    } catch (e) { msg = "JSON inválido: " + e.message; bad = true; updateStatus(); }
  }
  function renderImport() {
    const J = window.CycleJson, d = $("[data-imp-dlg]"), pr = J.profiles(imp.pack), def = imp.pack.cycle.default_profile || "";
    const first = pr.find((p) => p.id === def) ? def : pr[0].id;
    d.innerHTML = `<div class="fs cy-card"><h3 class="fs-h3">Importar ciclo</h3><p class="fs-muted"><code>${esc(imp.name)}</code> · <strong>${esc(imp.pack.cycle.label || imp.pack.cycle.id)}</strong></p>`
      + (imp.pack.cycle.description ? `<p class="fs-muted">${esc(imp.pack.cycle.description)}</p>` : "")
      + `<label class="cy__f"><span class="cy__l">Perfil (quais etapas entram)</span><select class="fs-in" data-imp-prof>${pr.map((p) => `<option value="${esc(p.id)}"${p.id === first ? " selected" : ""}>${esc(p.label)} · ${p.count} etapa(s)</option>`).join("")}</select></label>`
      + `<p class="fs-muted">Entra como um ciclo novo, ainda não salvo. Destinos como <code>@wait-author</code> e <code>@rejected</code> viram <code>@humano</code> e <code>@fim</code>.</p>`
      + `<div class="cy-vrow"><button class="btn btn--primary" data-imp-go>Importar</button><button class="btn" data-imp-cancel>Cancelar</button></div></div>`;
    if (!d.open) d.showModal();
  }
  function doImport() {
    const J = window.CycleJson, prof = $("[data-imp-prof]").value;
    if (dirty && !confirm("Há alterações não salvas no ciclo atual. Substituir mesmo assim?")) return;
    cur = J.fromPack(imp.pack, prof); saved = false; dirty = true;
    afterLoad(); syncOrder(); $("[data-imp-dlg]").close();
    msg = "Importado: " + (cur.label || cur.id) + " (" + cur.steps.length + " etapas). Revise e clique em Salvar."; bad = false;
    if (window.Activity) Activity.log("cycle.imported", { title: cur.label || cur.id });
    imp = null; render(); requestAnimationFrame(fit);
  }

  function commitLink(v) {
    if (!v || !linkTo) return;
    step(linkTo.from).next[v] = linkTo.to; $("[data-link]").close(); linkTo = null; touch(); renderStage();
  }

  host.addEventListener("input", (e) => {
    const t = e.target, d = t.dataset;
    if (ed && "edText" in d) {
      ed.text = t.value; const dirtyF = ed.text !== ed.orig, b = $("[data-ed-save]"); if (b) b.disabled = !dirtyF;
      const p = $(".cy-ed__path"); if (p) { const o = p.querySelector(".cy-ed__dot"); if (dirtyF && !o) p.insertAdjacentHTML("beforeend", ` <span class="cy-ed__dot">● não salvo</span>`); else if (!dirtyF && o) o.remove(); }
      return;
    }
    if (d.f) { cur[d.f] = t.value; touch(); return; }
    if (card && d.a && card.agent) { card.agent[d.a] = t.value; return; }
    if (card && d.s && t.matches("input.fs-in, textarea.fs-in")) { const s = step(card.id); if (!s) return; if (d.s === "id") return; s[d.s] = t.value; touch(); syncStep(s); }
  });
  host.addEventListener("change", async (e) => {
    const t = e.target, d = t.dataset;
    if ("jsonFile" in d) { const f = t.files && t.files[0]; t.value = ""; pickJson(f); return; }
    if ("sel" in d) { if (dirty && !confirm("Há alterações não salvas. Trocar de ciclo mesmo assim?")) { renderBar(); return; } await openCycle(t.value); msg = ""; render(); requestAnimationFrame(fit); return; }
    if (!card) return; const s = step(card.id); if (!s) return;
    if (d.tool && card.agent) { const a = card.agent; a.tools = t.checked ? a.tools.concat(d.tool) : a.tools.filter((x) => x !== d.tool); return; }
    if (d.a && card.agent) { card.agent[d.a] = t.value; return; }
    if (d.vto) { s.next[d.vto] = t.value; touch(); renderStage(); return; }
    if (d.s === "writes" || d.s === "status") { s[d.s] = t.value.trim(); touch(); renderCard(); renderStage(); return; }
    if (d.s === "id") { renameId(s, t.value); touch(); render(); return; }
    if (d.s === "phase") { s.phase = t.value; if (!pos[s.id] || colOf(pos[s.id].x) !== phaseIdx(t.value)) delete pos[s.id]; layout(); syncOrder(); touch(); renderStage(); return; }
    if (d.s === "approve") { s.approve = t.value === "yes"; touch(); renderStage(); return; }
    if (d.s === "kind") { s.kind = t.value; if (t.value === "human") s.ref = ""; if (t.value !== "skill") s.agent = ""; card.agent = null; touch(); renderCard(); renderStage(); if (s.kind === "agent" && s.ref) loadAgent(s); return; }
    if ("skillAgent" in d) { s.agent = t.value; touch(); renderCard(); renderStage(); return; }
    if ("pick" in d) {
      if (t.value === "__new__") { s.ref = ""; card.newRef = true; card.agent = null; touch(); renderCard(); renderStage(); return; }
      card.newRef = false; s.ref = t.value; card.agent = null; touch(); renderCard(); renderStage(); if (s.kind === "agent" && s.ref) loadAgent(s); return;
    }
    if (d.s === "ref") { s.ref = t.value.trim(); card.agent = null; touch(); renderCard(); renderStage(); if (s.kind === "agent" && s.ref) loadAgent(s); }
  });
  host.addEventListener("keydown", (e) => {
    if (e.key === "Enter" && e.target.matches("[data-node]")) openCard(e.target.dataset.node);
    if (e.key === "Enter" && e.target.matches("[data-link-new]")) { e.preventDefault(); $("[data-link-add]").click(); }
    if (e.key === "Enter" && e.target.matches("[data-ed-newname]")) { e.preventDefault(); createRef(); }
    if (e.key === "Enter" && e.target.matches("[data-phname]")) { e.preventDefault(); savePhase(); }
    if (e.key === "Enter" && e.target.matches("[data-read-new]")) { e.preventDefault(); $("[data-read-add]").click(); }
    if (e.key === "Enter" && e.target.matches("[data-vnew]")) { e.preventDefault(); $("[data-vadd]").click(); }
  });
  host.addEventListener("close", (e) => { if (e.target.matches("[data-card]")) { card = null; renderStage(); } if (e.target.matches("[data-ed-dlg]")) ed = null; }, true);

  // canvas: arrastar card (com encaixe na grade e na coluna), ligar pela bolinha, mover o fundo, zoom
  host.addEventListener("pointerdown", (e) => {
    const stage = e.target.closest("[data-stage]"); if (!stage || e.button !== 0 || e.target.closest("button, input, select, label")) return;
    const h = e.target.closest("[data-handle]"), n = e.target.closest("[data-node]");
    if (h) drag = { type: "link", from: h.dataset.handle, to: null };
    else if (n) { const id = n.dataset.node; drag = { type: "node", id, el: n, pid: e.pointerId, sx: e.clientX, sy: e.clientY, x0: pos[id].x, y0: pos[id].y, moved: false }; }
    else drag = { type: "pan", sx: e.clientX, sy: e.clientY, x0: view.x, y0: view.y };
    if (drag.type !== "node") { stage.setPointerCapture(e.pointerId); stage.classList.add("is-drag"); }
    e.preventDefault();
  });
  host.addEventListener("pointermove", (e) => {
    if (!drag) return;
    if (drag.type === "pan") { view.x = drag.x0 + e.clientX - drag.sx; view.y = drag.y0 + e.clientY - drag.sy; applyView(); return; }
    if (drag.type === "link") { drag.to = toCanvas(e); redrawEdges(); const t = nearest(drag.to, drag.from); host.querySelectorAll("[data-node]").forEach((x) => x.classList.toggle("is-target", x.dataset.node === t)); return; }
    const dx = (e.clientX - drag.sx) / view.k, dy = (e.clientY - drag.sy) / view.k;
    if (!drag.moved && Math.hypot(dx, dy) < 4) return;
    if (!drag.moved) { const st = $("[data-stage]"); try { st.setPointerCapture(drag.pid); } catch (err) {} st.classList.add("is-drag"); drag.el.classList.add("is-moving"); }
    drag.moved = true; pos[drag.id] = { x: snap(drag.x0 + dx), y: Math.max(TOP, snap(drag.y0 + dy)) };
    drag.el.style.left = pos[drag.id].x + "px"; drag.el.style.top = pos[drag.id].y + "px";
    host.querySelectorAll(".cy-col").forEach((c, i) => c.classList.toggle("is-drop", i === colOf(pos[drag.id].x))); redrawEdges();
  });
  const end = () => {
    if (!drag) return; const g = drag; drag = null; const st = $("[data-stage]"); if (st) st.classList.remove("is-drag");
    if (g.type === "pan") return;
    if (g.type === "link") {
      const t = g.to && nearest(g.to, g.from);
      if (t) { linkTo = { from: g.from, to: t }; const d = $("[data-link]"); d.innerHTML = `<div class="fs cy-card"><h3 class="fs-h3">Novo veredito</h3><p class="fs-muted">Quando <strong>${esc(label(g.from))}</strong> der este veredito, o próximo é <strong>${esc(label(t))}</strong>.</p>`
        + `<div class="cy-chips">${["FAIL", "CHANGES", "DONE", "BLOCKED"].map((v) => `<button class="btn" data-link-v="${v}">${v}</button>`).join("")}</div>`
        + `<div class="cy-vrow"><input class="fs-in" data-link-new placeholder="outro nome"><button class="btn btn--primary" data-link-add>Criar</button><button class="btn" data-link-cancel>Cancelar</button></div></div>`; d.showModal(); }
      else { redrawEdges(); host.querySelectorAll(".is-target").forEach((n) => n.classList.remove("is-target")); }
      return;
    }
    if (!g.moved) { sel = g.id; host.querySelectorAll("[data-node]").forEach((n) => n.classList.toggle("is-sel", n.dataset.node === g.id)); return; }
    const c = colOf(pos[g.id].x); pos[g.id].x = colX(c); step(g.id).phase = phases()[c]; unstack(c, g.id); syncOrder(); touch(); renderStage();
  };
  host.addEventListener("pointerup", end); host.addEventListener("pointercancel", end);
  host.addEventListener("dblclick", (e) => { const n = e.target.closest("[data-node]"); if (n && !e.target.closest("button")) openCard(n.dataset.node); });
  host.addEventListener("wheel", (e) => {
    const stage = e.target.closest("[data-stage]"); if (!stage) return; e.preventDefault(); const r = stage.getBoundingClientRect();
    if (e.ctrlKey || e.metaKey) zoomAt(view.k * Math.exp(-e.deltaY * 0.0015), e.clientX - r.left, e.clientY - r.top);
    else { view.x -= e.shiftKey ? e.deltaY : e.deltaX; view.y -= e.shiftKey ? 0 : e.deltaY; applyView(); }
  }, { passive: false });

  // ---------- entrada ----------
  function emptyState(text, btnText, fn) {
    host.innerHTML = `<div class="cy__empty-st"><p class="fs-muted">${esc(text)}</p>${btnText ? `<button class="btn btn--icon" data-empty-btn>${esc(btnText)}</button>` : ""}</div>`;
    const b = host.querySelector("[data-empty-btn]"); if (b) b.addEventListener("click", fn, { once: true });
  }
  async function load() {
    handle = await getHandle();
    if (!handle) return emptyState("Selecione a pasta do projeto para ver e montar os ciclos.", "Selecionar pasta do projeto", () => document.getElementById("project-switcher").click());
    try { if ((await handle.queryPermission({ mode: "read" })) !== "granted" && (await handle.requestPermission({ mode: "read" })) !== "granted") throw 0; }
    catch (e) { return emptyState("Sem permissão de leitura na pasta do projeto.", "Permitir", load); }
    files = await listCycles(); inv = await listInventory();
    if (!cur) { if (files.length) await openCycle(files[0]); if (!cur) blankCycle(); }
    else if (saved && !dirty && files.includes(cur.id)) {
      // o arquivo pode ter sido editado fora da página (Claude Code, editor): relê se mudou e não há alteração pendente
      try { if ((await readFile(".claude/cycles/" + cur.id + ".md")) !== diskText) await openCycle(cur.id); } catch (e) {}
    }
    render(); requestAnimationFrame(fit);
  }
  if (window.ResizeObserver) new ResizeObserver(() => { if (needFit) requestAnimationFrame(fit); }).observe(host);
  window.addEventListener("hashchange", () => { if (location.hash === "#/pipeline") load(); });
  window.addEventListener("focus", async () => {
    if (location.hash !== "#/pipeline" || !handle || !cur || !saved || dirty || card) return;
    try { if ((await readFile(".claude/cycles/" + cur.id + ".md")) !== diskText) { await openCycle(cur.id); render(); } } catch (e) {}
  });
  window.addEventListener("aes:project-changed", () => { cur = null; dirty = false; if (location.hash === "#/pipeline") load(); });
  window.addEventListener("beforeunload", (e) => { if (dirty) { e.preventDefault(); e.returnValue = ""; } });
  if (location.hash === "#/pipeline") load();
})();
