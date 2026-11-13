// Página "Projeto" (Scan the codebase): informações, relatório do scan e DevMentor.
// O relatório é lido da pasta .aes/project/ dentro da pasta de projeto selecionada.
(function () {
  const $ = (s) => document.querySelector(s);
  const reportBox = $("[data-scan-report]");
  const errorBox = $("[data-scan-error]");

  // Arquivos gerados pela skill aes-init, em .aes/project/
  const FILES = [
    { file: "_overview.md", title: "Visão geral", desc: "O que é o projeto e seus módulos" },
    { file: "_architecture.md", title: "Arquitetura", desc: "Camadas, stack e convenções" },
    { file: "_onboarding.md", title: "Onboarding", desc: "Como rodar e começar a mexer" },
    { file: "_devmentor.md", title: "Guia para dev júnior", desc: "Onboarding didático com perguntas e exercícios" },
    { file: "_quality.md", title: "Qualidade", desc: "Testes, lacunas e riscos" },
    { file: "_design-system.md", title: "Design system", desc: "Tokens e componentes de UI" },
  ];

  const el = (tag, cls, text) => {
    const n = document.createElement(tag);
    if (cls) n.className = cls;
    if (text != null) n.textContent = text;
    return n;
  };

  // ---------- 1. Informações do Projeto ----------
  function showInfo() {
    let project = null;
    try { project = JSON.parse(localStorage.getItem("project")); } catch (e) {}
    $("[data-scan-name]").textContent = project ? project.name : "Nenhum projeto selecionado";
    $("[data-scan-info]").textContent = project ? project.info : "Selecione a pasta do projeto no menu lateral.";
    $("[data-scan-status]").textContent = project ? "Ativo" : "Inativo";
  }

  // ---------- 2. Relatório do Scan ----------
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

  async function readText(dir, name) {
    try { return await (await (await dir.getFileHandle(name)).getFile()).text(); }
    catch (e) { return null; }
  }

  // Pega "gerado_em" do front-matter e as linhas de "Não determinado" do _scan-meta.md
  function parseMeta(text) {
    const date = (text.match(/gerado_em:\s*(\S+)/) || [])[1] || "";
    const m = text.match(/##\s*N[ãa]o determinado[^\n]*\n([\s\S]*?)(?=\n##\s|$)/i);
    const gaps = m ? m[1].split("\n").filter((l) => l.trim().startsWith("-")).map((l) => l.replace(/^\s*-\s*/, "")) : [];
    return { date, gaps };
  }

  function renderEmpty(message) {
    reportBox.replaceChildren();
    const box = el("div", "scan-empty");
    box.append(el("div", null, message));
    const ol = el("ol");
    ["Em Settings, selecione a pasta do projeto.",
     "Abra o projeto no Claude Code e rode a skill aes-init (gera a pasta .aes/project/).",
     "Volte aqui e clique em Atualizar."].forEach((t) => ol.append(el("li", null, t)));
    box.append(ol);
    reportBox.append(box);
  }

  let activeTab = null;
  // Diagramas gerados pela skill em .aes/project/diagrams/
  const DIAGRAM_MD = [
    { file: "geral.banco.md", title: "Banco de Dados" },
    { file: "geral.modulos.md", title: "Mapa de Módulos" },
    { file: "geral.classe.md", title: "Modelo de Domínio" },
  ];
  const BOARDS = [
    { file: "spec-project.excalidraw", title: "Board do projeto", desc: "Board editável com o mapa de módulos e a visão geral do banco." },
    { file: "design-system.excalidraw", title: "Board de Design System", desc: "Board editável com paleta, tipografia, componentes e ícones." },
  ];
  const ANIMATED = "architecture-animada.html";

  async function readDiagrams(projectDir) {
    const out = {};
    let d;
    try { d = await projectDir.getDirectoryHandle("diagrams"); } catch (e) { return out; }
    for (const name of [...DIAGRAM_MD.map((x) => x.file), ...BOARDS.map((x) => x.file), ANIMATED]) {
      const text = await readText(d, name);
      if (text != null) out[name] = text;
    }
    return out;
  }

  // Modal com o Excalidraw (iframe de excalidraw/index.html) — carrega a cena e salva de volta no arquivo.
  function openBoard(title, name, text) {
    let scene;
    try { scene = JSON.parse(text); } catch (e) { errorBox.textContent = "Arquivo .excalidraw inválido: " + name; errorBox.hidden = false; return; }
    const dlg = el("dialog", "board");
    const head = el("div", "board__head");
    const status = el("span", "board__status");
    const save = el("button", "btn btn--primary", "Salvar no projeto"); save.type = "button";
    const close = el("button", "btn", "Fechar"); close.type = "button";
    head.append(el("strong", null, title), status, save, close);
    const frame = el("iframe", "board__frame");
    frame.src = "excalidraw/index.html";
    dlg.append(head, frame);
    document.body.append(dlg);

    const dark = document.documentElement.getAttribute("data-theme") === "dark" ||
      (!document.documentElement.getAttribute("data-theme") && matchMedia("(prefers-color-scheme: dark)").matches);
    const onMsg = async (ev) => {
      if (ev.source !== frame.contentWindow) return;
      if (ev.data?.type === "excalidraw:ready") {
        frame.contentWindow.postMessage({ type: "excalidraw:load", scene: { ...scene, appState: { ...(scene.appState || {}), theme: dark ? "dark" : "light" } } }, "*");
      } else if (ev.data?.type === "excalidraw:save-response") {
        try {
          const handle = await getHandle();
          if ((await handle.requestPermission({ mode: "readwrite" })) !== "granted") throw new Error("permissão de escrita negada");
          await writeFile(handle, ".aes/project/diagrams/" + name, JSON.stringify(ev.data.scene, null, 1));
          status.textContent = "Salvo.";
          if (window.Activity) Activity.log("board.saved", { title });
        } catch (e) { status.textContent = "Erro ao salvar: " + e.message; }
        save.disabled = false;
      }
    };
    window.addEventListener("message", onMsg);
    save.addEventListener("click", () => { save.disabled = true; status.textContent = "Salvando..."; frame.contentWindow.postMessage({ type: "excalidraw:save-request" }, "*"); });
    const end = () => { window.removeEventListener("message", onMsg); dlg.close(); dlg.remove(); };
    close.addEventListener("click", end);
    dlg.addEventListener("cancel", (e) => { e.preventDefault(); end(); });
    dlg.showModal();
  }

  // Modal de leitura: mostra o conteúdo de uma aba em tela grande. Esc ou "Fechar" fecha.
  function openReader(title, content) {
    const dlg = el("dialog", "board");
    const head = el("div", "board__head");
    const close = el("button", "btn", "Fechar"); close.type = "button";
    head.append(el("strong", null, title), close);
    const body = el("div", "reader__body");
    body.append(content);
    dlg.append(head, body);
    document.body.append(dlg);
    const end = () => { dlg.close(); dlg.remove(); };
    close.addEventListener("click", end);
    dlg.addEventListener("cancel", (e) => { e.preventDefault(); end(); });
    dlg.addEventListener("click", (e) => { if (e.target === dlg) end(); });
    dlg.showModal();
  }

  function openAnimated(html) {
    const dlg = el("dialog", "board");
    const head = el("div", "board__head");
    const close = el("button", "btn", "Fechar"); close.type = "button";
    head.append(el("strong", null, "Diagrama de Arquitetura Animado"), el("span", "board__status"), close);
    const frame = el("iframe", "board__frame");
    frame.setAttribute("sandbox", "allow-scripts");
    frame.srcdoc = html;
    dlg.append(head, frame);
    document.body.append(dlg);
    const end = () => { dlg.close(); dlg.remove(); };
    close.addEventListener("click", end);
    dlg.addEventListener("cancel", (e) => { e.preventDefault(); end(); });
    dlg.showModal();
  }

  function diagramsView(diagrams) {
    const box = el("div", "diagrams");
    BOARDS.filter((b) => diagrams[b.file] != null).forEach((b) => {
      const row = el("div", "diagram-card");
      const btn = el("button", "btn", "Abrir board"); btn.type = "button";
      btn.addEventListener("click", () => openBoard(b.title, b.file, diagrams[b.file]));
      const txt = el("div"); txt.append(el("strong", null, b.title), el("p", null, b.desc));
      row.append(txt, btn); box.append(row);
    });
    if (diagrams[ANIMATED] != null) {
      const row = el("div", "diagram-card");
      const btn = el("button", "btn", "Abrir diagrama"); btn.type = "button";
      btn.addEventListener("click", () => openAnimated(diagrams[ANIMATED]));
      const txt = el("div"); txt.append(el("strong", null, "Arquitetura animada"), el("p", null, "Diagrama de arquitetura animado (Archify)."));
      row.append(txt, btn); box.append(row);
    }
    DIAGRAM_MD.filter((d) => diagrams[d.file] != null).forEach((d) => {
      box.append(el("h3", "diagram-title", d.title),
        window.renderMarkdown(diagrams[d.file].replace(/^---[\s\S]*?---\s*/, "")));
    });
    return box;
  }

  function renderReport(found, meta, diagrams) {
    diagrams = diagrams || {};
    reportBox.replaceChildren();
    if (meta) {
      const d = meta.date ? new Date(meta.date) : null;
      reportBox.append(el("p", "scan-meta",
        "Último scan: " + (d && !isNaN(d) ? d.toLocaleString("pt-BR") : meta.date || "data não informada")));
    }

    // Abas: uma por arquivo gerado (+ "Não determinado"). Arquivos ausentes não aparecem.
    const tabs = FILES.filter((f) => found[f.file] != null).map((f) => ({
      id: f.file, title: f.title, desc: f.desc,
      render: () => window.renderMarkdown(found[f.file].replace(/^---[\s\S]*?---\s*/, "")),
    }));
    if (Object.keys(diagrams).length) {
      tabs.splice(Math.min(tabs.length, FILES.filter((f) => found[f.file] != null).length), 0,
        { id: "_diagrams", title: "Diagramas", desc: "Mermaid e boards Excalidraw", render: () => diagramsView(diagrams) });
    }
    if (meta && meta.gaps.length) {
      tabs.push({ id: "_gaps", title: "Não determinado", desc: "Lacunas do scan", render: () => el("pre", null, meta.gaps.map((g) => "• " + g).join("\n")) });
    }
    if (!tabs.length) return;
    if (!tabs.some((t) => t.id === activeTab)) activeTab = tabs[0].id;

    const bar = el("div", "tabs");
    bar.setAttribute("role", "tablist");
    const panel = el("div", "tabs__panel");
    panel.setAttribute("role", "tabpanel");
    const select = (id) => {
      activeTab = id;
      bar.querySelectorAll(".tab").forEach((b) => {
        const on = b.dataset.tab === id;
        b.classList.toggle("is-active", on);
        b.setAttribute("aria-selected", on);
      });
      const t = tabs.find((x) => x.id === id);
      panel.replaceChildren(t.render());
    };
    tabs.forEach((t) => {
      const b = el("button", "tab", t.title);
      b.type = "button"; b.dataset.tab = t.id; b.title = t.desc;
      b.setAttribute("role", "tab");
      b.addEventListener("click", () => select(t.id));
      bar.append(b);
    });
    // Botão "Expandir": abre o conteúdo da aba ativa num modal grande, para ler melhor.
    const expand = el("button", "btn btn--icon tabs__expand", "Expandir");
    expand.type = "button";
    expand.title = "Abrir em tela maior";
    expand.addEventListener("click", () => {
      const t = tabs.find((x) => x.id === activeTab);
      openReader(t.title, t.render());
    });
    bar.append(expand);
    reportBox.append(bar, panel);
    select(activeTab);
  }

  let lastSig = null;
  // Registra no feed só quando o "gerado_em" do scan muda (guardado por projeto, sobrevive a recarregar a página)
  function logScan(meta) {
    if (!meta || !meta.date || !window.Activity) return;
    let proj = "";
    try { proj = (JSON.parse(localStorage.getItem("project")) || {}).name || ""; } catch (e) {}
    const key = "activity:scan-date:" + proj;
    let prev = null;
    try { prev = localStorage.getItem(key); } catch (e) {}
    if (prev === meta.date) return;
    try { localStorage.setItem(key, meta.date); } catch (e) {}
    Activity.log(prev ? "scan.updated" : "scan.detected", { summary: "gerado em " + meta.date });
  }
  // quiet=true (atualização automática): não pede permissão nem mexe na tela se nada mudou
  async function loadReport(quiet) {
    if (!quiet) errorBox.hidden = true;
    const handle = await getHandle();
    if (!handle) { if (!quiet) renderEmpty("Nenhuma pasta de projeto selecionada."); return; }
    try {
      let perm = await handle.queryPermission({ mode: "read" });
      if (perm !== "granted" && !quiet) perm = await handle.requestPermission({ mode: "read" });
      if (perm !== "granted") {
        if (!quiet) renderEmpty("Sem permissão de leitura na pasta do projeto. Clique em Atualizar e permita o acesso.");
        return;
      }
      let dir;
      try {
        dir = await (await handle.getDirectoryHandle(".aes")).getDirectoryHandle("project");
      } catch (e) {
        if (lastSig !== "none") { lastSig = "none"; renderEmpty("Nenhum relatório encontrado em .aes/project/ — rode as skills no Claude Code."); }
        return;
      }
      const found = {};
      for (const f of FILES) found[f.file] = await readText(dir, f.file);
      const metaText = await readText(dir, "_scan-meta.md");
      if (FILES.every((f) => found[f.file] == null) && metaText == null) {
        if (lastSig !== "empty") { lastSig = "empty"; renderEmpty("A pasta .aes/project/ existe, mas ainda está vazia."); }
        return;
      }
      const diagrams = await readDiagrams(dir);
      const sig = JSON.stringify([found, metaText, diagrams]);
      if (sig === lastSig) return;
      lastSig = sig;
      const meta = metaText ? parseMeta(metaText) : null;
      renderReport(found, meta, diagrams);
      logScan(meta);
    } catch (err) {
      errorBox.textContent = "Não foi possível ler o relatório: " + err.message;
      errorBox.hidden = false;
    }
  }

  // ---------- 3. DevMentor Professor ----------
  function promptCard(title, subtitle, instructions, prompt) {
    const d = el("details", "fold");
    const s = el("summary", null, title);
    s.append(el("small", null, subtitle));
    const body = el("div", "fold__body");
    const btn = el("button", "btn btn--icon", "Copiar prompt");
    btn.type = "button";
    btn.style.justifySelf = "start";
    btn.addEventListener("click", async () => {
      try { await navigator.clipboard.writeText(prompt); btn.textContent = "Copiado!"; if (window.Activity) Activity.log("prompt.copied", { title }); }
      catch (e) { btn.textContent = "Não foi possível copiar"; }
      setTimeout(() => { btn.textContent = "Copiar prompt"; }, 2000);
    });
    body.append(el("p", null, instructions), btn, el("pre", null, prompt));
    d.append(s, body);
    return d;
  }

  function renderDevmentor() {
    const p = window.DEVMENTOR_PROMPTS || {};
    $("[data-devmentor]").replaceChildren(
      promptCard("Onboarding de Projeto — Backend",
        "11 níveis: Documentação → Visão geral → Stack → Arquitetura → Fluxo real → … → Fluxo do time",
        "Copie o prompt e cole em qualquer LLM (Claude, ChatGPT, Gemini...) com acesso ao projeto. Ele lê AGENTS.md/CLAUDE.md e o relatório do scan para ensinar o backend, camada por camada.",
        p.backend || ""),
      promptCard("Onboarding de Projeto — Frontend React",
        "8 etapas: Componentes & JSX → Props → State → API → Arquitetura → CRUD → Qualidade → Sênior",
        "Copie o prompt e cole em qualquer LLM com acesso ao projeto. Ele lê AGENTS.md/CLAUDE.md e o relatório do scan para ensinar componentes, estado e chamadas de API reais.",
        p.frontend || "")
    );
  }

  // ---------- Skills do scan ----------
  const bundle = window.SCAN_BUNDLE || { skills: {}, agents: {} };
  const SKILL_NAMES = ["aes-init"];
  const installBtn = $("[data-skills-install]");
  const installAllBtn = $("[data-skills-install-all]"); // botão da sidebar (todas as páginas)
  const allLabel = installAllBtn.querySelector("span");
  const skillsStatus = $("[data-skills-status]");
  const skillsError = $("[data-skills-error]");

  async function fileExists(root, path) {
    try {
      let d = root; const parts = path.split("/");
      for (const part of parts.slice(0, -1)) d = await d.getDirectoryHandle(part);
      await d.getFileHandle(parts[parts.length - 1]);
      return true;
    } catch (e) { return false; }
  }

  async function skillsInstalled(handle) {
    const checks = SKILL_NAMES.map((n) => ".claude/skills/" + n + "/SKILL.md");
    const r = await Promise.all(checks.map((c) => fileExists(handle, c)));
    return r.filter(Boolean).length;
  }

  async function refreshSkillsStatus() {
    const handle = await getHandle();
    installBtn.disabled = installAllBtn.disabled = !handle;
    if (!handle) { skillsStatus.textContent = "Selecione um projeto para baixar as skills."; return; }
    if ((await handle.queryPermission({ mode: "read" })) !== "granted") {
      skillsStatus.textContent = "A skill aes-init será copiada para .claude/skills/ do projeto.";
      return;
    }
    const n = await skillsInstalled(handle);
    skillsStatus.textContent = n === 1
      ? "Skill aes-init instalada. Clique para reinstalar/atualizar."
      : "Skill aes-init não instalada. Clique em Baixar skill.";
  }

  async function writeFile(root, path, text) {
    let d = root; const parts = path.split("/");
    for (const part of parts.slice(0, -1)) d = await d.getDirectoryHandle(part, { create: true });
    const w = await (await d.getFileHandle(parts[parts.length - 1], { create: true })).createWritable();
    await w.write(text); await w.close();
  }

  // Liga o hook do Activity no .claude/settings.json do projeto, sem apagar o que já existe (mescla por comando).
  const HOOK_CMD = (kind) => 'node "$CLAUDE_PROJECT_DIR/.aes/activity-hook.mjs" ' + kind;
  const HOOKS = [["SessionStart", ""], ["PostToolUse", "Edit|Write|MultiEdit|Bash"], ["Stop", ""]];
  async function mergeActivityHooks(root) {
    let cfg = {};
    try {
      const d = await root.getDirectoryHandle(".claude"); const f = await (await d.getFileHandle("settings.json")).getFile();
      cfg = JSON.parse((await f.text()) || "{}");
    } catch (e) { if (e instanceof SyntaxError) throw new Error(".claude/settings.json inválido (JSON); corrija antes de instalar o hook"); }
    cfg.hooks = cfg.hooks || {};
    for (const [event, matcher] of HOOKS) {
      const cmd = HOOK_CMD(event), list = (cfg.hooks[event] = cfg.hooks[event] || []);
      if (list.some((g) => (g.hooks || []).some((h) => h.command === cmd))) continue;
      list.push(matcher ? { matcher, hooks: [{ type: "command", command: cmd }] } : { hooks: [{ type: "command", command: cmd }] });
    }
    await writeFile(root, ".claude/settings.json", JSON.stringify(cfg, null, 2) + "\n");
  }

  async function installSkills() {
    skillsError.hidden = true;
    const handle = await getHandle();
    if (!handle) return;
    installBtn.disabled = installAllBtn.disabled = true;
    installBtn.textContent = allLabel.textContent = "Baixando...";
    try {
      // a pasta foi escolhida só para leitura: pede permissão de escrita (precisa de clique do usuário)
      if ((await handle.requestPermission({ mode: "readwrite" })) !== "granted") throw new Error("permissão de escrita negada");
      const all = { ...bundle.skills, ...(bundle.agents || {}) };
      const n = new Set(Object.keys(bundle.skills).map((k) => k.split("/")[2])).size;
      const na = Object.keys(bundle.agents || {}).length;
      for (const [path, text] of Object.entries(all)) await writeFile(handle, path, text);
      for (const [path, text] of Object.entries(bundle.files || {})) await writeFile(handle, path, text);
      if (bundle.files && bundle.files[".aes/activity-hook.mjs"]) await mergeActivityHooks(handle);
      installBtn.textContent = "Instalado!";
      allLabel.textContent = n + " skills e " + na + " agente(s) instalados!";
      if (window.Activity) Activity.log("skills.installed", { summary: Object.keys(all).length + " arquivos em .claude/skills e .claude/agents, hook do Activity em .claude/settings.json" });
    } catch (err) {
      skillsError.textContent = "Não foi possível baixar as skills: " + err.message;
      skillsError.hidden = false;
      installBtn.textContent = "Baixar skill";
      allLabel.textContent = "Erro ao baixar";
      installAllBtn.title = installBtn.title = skillsError.textContent;
    }
    setTimeout(() => {
      installBtn.textContent = "Baixar skill"; allLabel.textContent = "Baixar skills e agentes";
      installBtn.disabled = false; refreshSkillsStatus();
    }, 2500);
  }

  function renderCommands() {
    const box = $("[data-skills-cmds]");
    ["/aes-init"].forEach((cmd) => {
      const row = el("div", "cmd");
      const b = el("button", "btn", "Copiar"); b.type = "button";
      b.addEventListener("click", async () => {
        try { await navigator.clipboard.writeText(cmd); b.textContent = "Copiado!"; } catch (e) { b.textContent = "Erro"; }
        setTimeout(() => { b.textContent = "Copiar"; }, 1500);
      });
      row.append(el("code", null, cmd), b);
      box.append(row);
    });
  }
  installBtn.addEventListener("click", installSkills);
  installAllBtn.addEventListener("click", installSkills);
  renderCommands();

  // Atualiza ao entrar na página, ao clicar em Atualizar e ao trocar de projeto
  const onProject = () => (location.hash.replace("#", "") || "/") === "/project";
  function onRoute() {
    if (onProject()) { showInfo(); loadReport(); }
    refreshSkillsStatus(); // também habilita/desabilita o botão da sidebar
  }
  $("[data-scan-refresh]").addEventListener("click", () => { lastSig = null; showInfo(); loadReport(); refreshSkillsStatus(); });
  // Enquanto a página está aberta, procura o relatório novo a cada 4s (e ao voltar para a aba)
  setInterval(() => { if (onProject() && !document.hidden) loadReport(true); }, 4000);
  window.addEventListener("focus", () => { if (onProject()) loadReport(true); });
  window.addEventListener("hashchange", onRoute);
  window.addEventListener("storage", showInfo);

  renderDevmentor();
  showInfo();
  onRoute();
})();
