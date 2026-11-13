// Página "Activity": feed cronológico do que o app fez (mais recente primeiro), agrupado por dia.
// Persistência: .aes/activity.json na pasta do projeto (quando há permissão de escrita) + cache em localStorage.
// Uso pelos outros módulos: window.Activity.log("note.created", { title: "Minha nota", summary: "..." }).
(function () {
  const MAX = 500;
  const FILE = "activity.json";
  const DIR = [".aes"];

  // ação -> [ícone do sprite, frase em pt-BR]
  const ACTIONS = {
    "github.connected": ["i-github", "conectou o GitHub"],
    "github.disconnected": ["i-github", "desconectou o GitHub"],
    "github.error": ["i-github", "falhou ao conectar o GitHub"],
    "project.selected": ["i-project", "selecionou o projeto"],
    "project.cleared": ["i-project", "removeu o projeto"],
    "onboarding.finished": ["i-check", "concluiu o onboarding"],
    "onboarding.dismissed": ["i-x", "ocultou o onboarding"],
    "skills.installed": ["i-sparkles", "instalou as skills"],
    "scan.detected": ["i-sparkles", "detectou o relatório do scan"],
    "scan.updated": ["i-sparkles", "atualizou o relatório do scan"],
    "board.saved": ["i-file", "salvou um board"],
    "diagram.created": ["i-branch", "criou o diagrama"],
    "diagram.saved": ["i-branch", "salvou o diagrama"],
    "diagram.deleted": ["i-branch", "excluiu o diagrama"],
    "note.created": ["i-file", "criou a nota"],
    "note.saved": ["i-file", "salvou a nota"],
    "note.deleted": ["i-file", "excluiu a nota"],
    "cycle.saved": ["i-pipeline", "salvou o ciclo"],
    "cycle.exported": ["i-pipeline", "exportou o ciclo"],
    "cycle.imported": ["i-pipeline", "importou o ciclo"],
    "agent.saved": ["i-sparkles", "salvou o agente"],
    "prompt.copied": ["i-copy", "copiou o prompt"],
    "claude.session_started": ["i-terminal", "iniciou uma sessão"],
    "claude.responded": ["i-terminal", "concluiu uma resposta"],
    "claude.file_edited": ["i-file", "editou"],
    "claude.file_written": ["i-file", "gravou"],
    "claude.committed": ["i-branch", "commitou"],
    "factory.step_started": ["i-sparkles", "iniciou uma etapa"],
    "factory.step_finished": ["i-check", "concluiu uma etapa"],
    "factory.step_saved": ["i-check", "decidiu uma etapa da tarefa"],
    "factory.tour_closed": ["i-sparkles", "fechou o tour da fábrica"],
  };

  // prefixo da ação -> categoria exibida no badge
  const CATEGORIES = {
    github: "GitHub", project: "Projeto", onboarding: "Onboarding", skills: "Scan", scan: "Scan",
    board: "Scan", diagram: "Diagramas", note: "Notas", prompt: "Prompt", cycle: "Pipeline", agent: "Pipeline", claude: "Claude", factory: "Fábrica",
  };
  const categoryOf = (action) => CATEGORIES[String(action).split(".")[0]] || "Geral";

  let events = [];
  let lastModified = 0;
  let loadedKey = null;
  let queue = Promise.resolve();
  const listeners = [];

  const read = (k) => { try { return JSON.parse(localStorage.getItem(k)); } catch (e) { return null; } };
  const write = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) {} };
  const projectName = () => { const p = read("project"); return p && p.name ? p.name : "_sem-projeto"; };
  const cacheKey = () => "activity:" + projectName();

  function getHandle() {
    return new Promise((resolve) => {
      try {
        const req = indexedDB.open("aes", 1);
        req.onupgradeneeded = () => req.result.createObjectStore("handles");
        req.onerror = () => resolve(null);
        req.onsuccess = () => {
          const get = req.result.transaction("handles").objectStore("handles").get("project");
          get.onsuccess = () => resolve(get.result || null);
          get.onerror = () => resolve(null);
        };
      } catch (e) { resolve(null); }
    });
  }

  async function dirHandle(root, create) {
    let d = root;
    for (const p of DIR) d = await d.getDirectoryHandle(p, { create: !!create });
    return d;
  }

  // ---------- persistência (isolada aqui: trocar o backend não afeta a UI) ----------
  // Lê .aes/activity.json. Devolve { events, modified } ou null se não houver arquivo/permissão.
  // Só usa a pasta salva se ela for a do projeto atual: na troca de projeto o handle pode ainda ser o anterior.
  async function readStore() {
    const root = await getHandle();
    if (!root || root.name !== projectName() || (await root.queryPermission({ mode: "read" })) !== "granted") return null;
    try {
      const file = await (await (await dirHandle(root, false)).getFileHandle(FILE)).getFile();
      const data = JSON.parse(await file.text());
      return { events: Array.isArray(data.events) ? data.events : [], modified: file.lastModified };
    } catch (e) { return null; }
  }

  // Grava o arquivo só se já houver permissão de escrita (não dá para pedir sem gesto do usuário).
  async function writeStore(list) {
    write(cacheKey(), list);
    const root = await getHandle();
    if (!root || root.name !== projectName() || (await root.queryPermission({ mode: "readwrite" })) !== "granted") return;
    try {
      const fh = await (await dirHandle(root, true)).getFileHandle(FILE, { create: true });
      const w = await fh.createWritable();
      await w.write(JSON.stringify({ version: 1, events: list }, null, 2));
      await w.close();
      lastModified = (await fh.getFile()).lastModified;
    } catch (e) {}
  }

  // Autor padrão: nome/login do GitHub conectado (se houver)
  function githubActor() {
    try { const u = JSON.parse(localStorage.getItem("github-user")); return u && (u.name || u.login) || undefined; } catch (e) { return undefined; }
  }

  // ---------- API ----------
  const newId = () => (window.crypto && crypto.randomUUID ? crypto.randomUUID() : Date.now() + "-" + Math.random().toString(16).slice(2));

  function merge(a, b) {
    const byId = new Map();
    a.concat(b).forEach((e) => { if (e && e.id && e.timestamp) byId.set(e.id, e); });
    return [...byId.values()].sort((x, y) => y.timestamp.localeCompare(x.timestamp)).slice(0, MAX);
  }

  function emit() { listeners.forEach((fn) => { try { fn(events); } catch (e) {} }); }

  // Trocou de projeto? Descarta o estado em memória do anterior e parte do cache do novo.
  function syncProject() {
    const key = cacheKey();
    if (key === loadedKey) return;
    loadedKey = key;
    events = read(key) || [];
    lastModified = 0;
  }

  function log(action, info) {
    syncProject();
    info = info || {};
    const ev = { id: newId(), kind: "deed", action, title: info.title || "", actor: info.actor || githubActor(), summary: info.summary, timestamp: new Date().toISOString() };
    events = [ev].concat(events).slice(0, MAX);
    emit();
    queue = queue.then(() => writeStore(events)).catch(() => {});
    return ev;
  }

  // Recarrega: junta cache local com o arquivo (eventos gravados por agentes/CLI também entram).
  async function load(force) {
    syncProject();
    const cached = read(cacheKey()) || [];
    const stored = await readStore();
    if (stored && !force && stored.modified === lastModified && events.length) return;
    if (stored) lastModified = stored.modified;
    const next = merge(cached.concat(events), stored ? stored.events : []);
    if (loadedKey !== cacheKey()) return; // projeto mudou durante a leitura assíncrona
    const changed = JSON.stringify(next.map((e) => e.id)) !== JSON.stringify(events.map((e) => e.id));
    events = next;
    if (changed) emit();
    // Se o cache tinha eventos que o arquivo ainda não tem, tenta gravar.
    if (stored && next.length !== stored.events.length) queue = queue.then(() => writeStore(events)).catch(() => {});
  }

  function subscribe(fn) { listeners.push(fn); }

  // ---------- agrupamento por dia ----------
  const dayKey = (d) => d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0");

  function groupByDay(list) {
    const sorted = list.slice().sort((a, b) => b.timestamp.localeCompare(a.timestamp));
    const today = new Date();
    const yest = new Date(); yest.setDate(today.getDate() - 1);
    const groups = [];
    sorted.forEach((ev) => {
      const d = new Date(ev.timestamp);
      const key = dayKey(d);
      let g = groups[groups.length - 1];
      if (!g || g.dayKey !== key) {
        const heading = key === dayKey(today) ? "Hoje" : key === dayKey(yest) ? "Ontem"
          : d.toLocaleDateString("pt-BR", { dateStyle: "full" });
        g = { dayKey: key, heading, events: [] };
        groups.push(g);
      }
      g.events.push(ev);
    });
    return groups;
  }

  // ---------- render ----------
  const el = (tag, cls, text) => {
    const n = document.createElement(tag);
    if (cls) n.className = cls;
    if (text != null) n.textContent = text;
    return n;
  };

  function icon(id) {
    const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    svg.setAttribute("class", "icon");
    svg.setAttribute("width", "14");
    svg.setAttribute("height", "14");
    const use = document.createElementNS("http://www.w3.org/2000/svg", "use");
    use.setAttribute("href", "#" + id);
    svg.appendChild(use);
    return svg;
  }

  // dd/mm hh:mm, como formatTimestamp da referência
  function formatTimestamp(iso) {
    const d = new Date(iso);
    if (isNaN(d.getTime())) return iso;
    return d.toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });
  }

  function render() {
    const box = document.querySelector("[data-activity-feed]");
    if (!box) return;
    box.textContent = "";
    if (!events.length) {
      const empty = el("div", "activity__empty");
      empty.append(icon("i-activity"), el("p", null, "Nenhum evento ainda."));
      box.appendChild(empty);
      return;
    }
    groupByDay(events).forEach((g) => {
      const sec = el("section", "activity__day");
      const heading = el("div", "activity__heading");
      heading.appendChild(el("span", null, g.heading));
      sec.appendChild(heading);
      const ul = el("ul", "activity__rail");
      g.events.forEach((ev, i) => {
        const meta = ACTIONS[ev.action] || ["i-activity", ev.action];
        const actor = ev.actor || "Alguém";
        const li = el("li", "activity__row");
        if (i < g.events.length - 1) li.appendChild(el("span", "activity__line"));
        const mark = el("span", "activity__mark"); mark.appendChild(icon(meta[0]));
        const row = el("div", "activity__content");
        const time = el("time", "activity__time", formatTimestamp(ev.timestamp));
        time.dateTime = ev.timestamp;
        row.append(
          el("span", "activity__kind", categoryOf(ev.action)),
          el("span", "activity__avatar", actor.charAt(0).toUpperCase()),
          el("span", "activity__actor", actor),
          el("span", "activity__phrase", meta[1]),
          el("span", "activity__title", ev.title || "")
        );
        if (ev.summary) row.appendChild(el("span", "activity__summary", ev.summary));
        row.appendChild(time);
        li.append(mark, row);
        ul.appendChild(li);
      });
      sec.appendChild(ul);
      box.appendChild(sec);
    });
  }

  window.Activity = { log, load, render, subscribe, groupByDay };

  // ---------- ciclo de vida ----------
  const onActivityPage = () => (location.hash.replace("#", "") || "/") === "/activity";
  async function refresh() { await load(); if (onActivityPage()) render(); }

  subscribe(() => { if (onActivityPage()) render(); });
  window.addEventListener("hashchange", () => { if (onActivityPage()) refresh(); });
  window.addEventListener("focus", () => { if (onActivityPage()) refresh(); });
  setInterval(() => { if (onActivityPage() && !document.hidden) refresh(); }, 4000);
  refresh();
})();
