// Pasta central da fábrica (padrão "home repo"): onboarding que abre antes de tudo enquanto ela não foi escolhida.
// A pasta central guarda .claude/ (agentes, skills, hooks, ciclos), apps.json e apps/<app>/ (contexto e trabalhos).
// Os apps são só código: aqui eles são cadastrados em apps.json, e nada é gravado na pasta deles.
// A pasta escolhida vira também a "pasta do projeto" das outras telas (Pipeline, Activity, Notas), via Project.set.
(function () {
  const HOME_KEY = "home";          // localStorage: { name, path }
  const HANDLE_KEY = "home";        // IndexedDB aes/handles
  const $ = (sel, r = document) => r.querySelector(sel);

  // ---------- armazenamento ----------
  function readHome() { try { return JSON.parse(localStorage.getItem(HOME_KEY)); } catch (e) { return null; } }
  function writeHome(v) { try { localStorage.setItem(HOME_KEY, JSON.stringify(v)); } catch (e) {} }

  function idb() {
    return new Promise((resolve, reject) => {
      const req = indexedDB.open("aes", 1);
      req.onupgradeneeded = () => req.result.createObjectStore("handles");
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  }
  async function idbGet(key) {
    try {
      const d = await idb();
      return await new Promise((res) => { const g = d.transaction("handles").objectStore("handles").get(key); g.onsuccess = () => res(g.result || null); g.onerror = () => res(null); });
    } catch (e) { return null; }
  }
  async function idbPut(key, value) {
    try { const d = await idb(); d.transaction("handles", "readwrite").objectStore("handles").put(value, key); } catch (e) {}
  }

  // ---------- arquivos na pasta central ----------
  async function dirAt(root, parts, create) { let d = root; for (const p of parts) d = await d.getDirectoryHandle(p, { create: !!create }); return d; }
  async function readText(root, path) {
    try { const a = path.split("/"); const d = await dirAt(root, a.slice(0, -1)); return await (await (await d.getFileHandle(a.pop())).getFile()).text(); }
    catch (e) { return null; }
  }
  async function writeText(root, path, text) {
    const a = path.split("/"); const d = await dirAt(root, a.slice(0, -1), true);
    const w = await (await d.getFileHandle(a.pop(), { create: true })).createWritable(); await w.write(text); await w.close();
  }
  async function writeIfMissing(root, path, text) { if ((await readText(root, path)) === null) { await writeText(root, path, text); return true; } return false; }
  async function has(root, name) { for await (const e of root.values()) if (e.name === name) return true; return false; }

  async function readApps(root) {
    const t = await readText(root, "apps.json");
    if (t === null) return null;
    try { const j = JSON.parse(t); return Array.isArray(j.apps) ? j : { version: 1, apps: [] }; }
    catch (e) { throw new Error("apps.json inválido (JSON). Corrija o arquivo antes de continuar."); }
  }

  // Mantém permissions.additionalDirectories igual à lista de apps (sem apagar o resto do settings.json).
  async function syncSettings(root, apps, removedPaths) {
    let cfg = {};
    const t = await readText(root, ".claude/settings.json");
    if (t) { try { cfg = JSON.parse(t); } catch (e) { throw new Error(".claude/settings.json inválido (JSON)."); } }
    cfg.permissions = cfg.permissions || {};
    const keep = (cfg.permissions.additionalDirectories || []).filter((p) => !(removedPaths || []).includes(p));
    cfg.permissions.additionalDirectories = [...new Set([...keep, ...apps.map((a) => a.path)])];
    await writeText(root, ".claude/settings.json", JSON.stringify(cfg, null, 2) + "\n");
  }

  const GITIGNORE = "# cópias de trabalho por issue (git worktree) e feeds locais\nworktrees/\n.aes/activity.json\napps/*/activity.json\n";
  const APP_CONTEXT = (a) => "# Contexto do app: " + a.id + "\n\n- Código: `" + a.path + "`\n- GitHub: `" + (a.github || "(não informado)") + "`, branch base `" + a.branch + "`\n\n" +
    "## Fonte principal\nLeia o `AGENTS.md`/`CLAUDE.md` do próprio app antes de julgar escopo, desenhar ou implementar.\n\n## Notas para a fábrica\n- (stack, padrões e cuidados específicos deste app)\n";

  // ---------- estado do modal ----------
  let handle = null;      // pasta central
  let info = null;        // { claude, appsJson, gitignore, claudeMd }
  let data = null;        // conteúdo de apps.json
  let step = "home";      // home | apps | done
  let error = "";
  let newApp = null;      // { handle, id, path, github, branch }
  let notice = "";        // mensagem de sucesso (instalação)

  async function inspect(h) {
    const out = { claude: await has(h, ".claude"), appsJson: await has(h, "apps.json"), gitignore: await has(h, ".gitignore"), claudeMd: await has(h, "CLAUDE.md"),
      agents: (await readText(h, ".claude/agents/intake.md")) !== null && (await readText(h, ".claude/hooks/restringir-escrita.sh")) !== null };
    data = out.appsJson ? await readApps(h) : null;
    return out;
  }

  async function ensureWrite() {
    if ((await handle.queryPermission({ mode: "readwrite" })) === "granted") return;
    if ((await handle.requestPermission({ mode: "readwrite" })) !== "granted") throw new Error("permissão de escrita negada para a pasta central");
  }

  // ---------- ações ----------
  async function pickHome() {
    error = "";
    try {
      const h = await window.showDirectoryPicker({ id: "aes-home", mode: "readwrite" });
      handle = h; info = await inspect(h);
      const prev = readHome();
      const path = prev && prev.name === h.name ? prev.path : "";
      writeHome({ name: h.name, path });
      await idbPut(HANDLE_KEY, h);
    } catch (e) { if (e.name !== "AbortError") error = e.message; }
    render();
  }

  // Cria o que falta (apps.json, .gitignore) e instala agentes, skills e hooks em .claude/ da pasta central.
  // Arquivos do usuário não são apagados: CLAUDE.md e settings.json são mesclados, memória e ciclos só se faltarem.
  async function prepareHome() {
    error = ""; notice = "";
    try {
      await ensureWrite();
      await writeIfMissing(handle, "apps.json", JSON.stringify({ version: 1, apps: [] }, null, 2) + "\n");
      await writeIfMissing(handle, ".gitignore", GITIGNORE);
      const r = await installFactory(handle);
      info = await inspect(handle);
      notice = "Pasta central pronta: " + r.agents + " agentes, " + r.skills + " skills e " + r.hooks + " hooks instalados em .claude/.";
      if (window.Activity) Activity.log("home.prepared", { title: handle.name, summary: "apps.json, .gitignore, CLAUDE.md e .claude/ (agentes, skills, hooks)" });
    } catch (e) { error = e.message; }
    render();
  }

  function savePath(value) {
    const h = readHome() || { name: handle.name };
    h.path = value.trim().replace(/\/+$/, "");
    writeHome(h);
  }

  function pathError(path, folderName) {
    if (!path) return "Informe o caminho absoluto.";
    if (!/^(\/|[A-Za-z]:[\\/])/.test(path)) return "O caminho precisa ser absoluto (começar com /).";
    if (folderName && path.split(/[\\/]/).pop() !== folderName) return "O caminho não termina na pasta escolhida (" + folderName + ").";
    return "";
  }

  async function pickApp() {
    error = "";
    try {
      const h = await window.showDirectoryPicker({ id: "aes-app", mode: "read" });
      if (handle && (await h.isSameEntry(handle))) throw new Error("Essa é a pasta central. Escolha a pasta do código do app.");
      newApp = { handle: h, id: h.name.toLowerCase().replace(/[^a-z0-9._-]+/g, "-"), path: "", github: "", branch: "main" };
    } catch (e) { if (e.name !== "AbortError") error = e.message; }
    render();
  }

  async function addApp() {
    error = "";
    try {
      const f = (n) => $("[data-hs-app=" + n + "]", dialog).value.trim();
      const a = { id: f("id"), path: f("path").replace(/\/+$/, ""), github: f("github"), branch: f("branch") || "main" };
      if (!/^[a-z0-9._-]+$/.test(a.id)) throw new Error("Id do app: só letras minúsculas, números, ponto, hífen e sublinhado.");
      const pe = pathError(a.path, newApp.handle.name); if (pe) throw new Error("Caminho do app: " + pe);
      if (a.github && !/^[A-Za-z0-9._-]+\/[A-Za-z0-9._-]+$/.test(a.github)) throw new Error("GitHub no formato owner/repo.");
      if (data.apps.some((x) => x.id === a.id)) throw new Error("Já existe um app com o id " + a.id + ".");
      if (data.apps.some((x) => x.path === a.path)) throw new Error("Esse caminho já está cadastrado.");
      await ensureWrite();
      const cyc = (readHome() || {}).cycles || [];
      if (cyc.length === 1) a.cycle = cyc[0].id; // um só ciclo: já vem escolhido (troca no painel da Home)
      data.apps.push(a);
      await writeText(handle, "apps.json", JSON.stringify(data, null, 2) + "\n");
      await writeIfMissing(handle, "apps/" + a.id + "/contexto.md", APP_CONTEXT(a));
      await writeIfMissing(handle, "apps/" + a.id + "/trabalhos/.gitkeep", "");
      await syncSettings(handle, data.apps);
      await idbPut("app:" + a.id, newApp.handle);
      if (window.Activity) Activity.log("home.app_added", { title: a.id, summary: a.path });
      newApp = null;
    } catch (e) { error = e.message; }
    render();
  }

  async function removeApp(id) {
    error = "";
    try {
      await ensureWrite();
      const gone = data.apps.find((x) => x.id === id);
      data.apps = data.apps.filter((x) => x.id !== id);
      await writeText(handle, "apps.json", JSON.stringify(data, null, 2) + "\n");
      await syncSettings(handle, data.apps, gone ? [gone.path] : []);
      if (window.Activity) Activity.log("home.app_removed", { title: id, summary: "apps/" + id + "/ continua na pasta central" });
    } catch (e) { error = e.message; }
    render();
  }

  // Concluir: a pasta central vira a pasta de trabalho das outras telas.
  // ---------- instalação de agentes, skills e hooks (sempre na pasta central, nunca nos apps) ----------
  // Pacote em js/skills-bundle.js (gerado de template/ por scripts/build-skills-bundle.mjs).
  const MD_START = "<!-- factory:inicio (gerado pela AI Soft Factory; edite fora destes marcadores) -->";
  const MD_END = "<!-- factory:fim -->";
  const OLD_MINIMAL_CLAUDE = /^# Pasta central da fábrica \(/; // CLAUDE.md mínimo das versões anteriores deste modal

  // Troca o trecho entre marcadores; sem marcadores, acrescenta no fim (ou substitui o CLAUDE.md mínimo antigo).
  async function mergeSection(root, path, section, replaceIf) {
    const block = MD_START + "\n" + section.trim() + "\n" + MD_END;
    const cur = await readText(root, path);
    let next;
    if (cur === null || (replaceIf && replaceIf.test(cur) && !cur.includes(MD_START))) next = block + "\n";
    else if (cur.includes(MD_START) && cur.includes(MD_END)) next = cur.slice(0, cur.indexOf(MD_START)) + block + cur.slice(cur.indexOf(MD_END) + MD_END.length);
    else next = cur.replace(/\s*$/, "\n\n") + block + "\n";
    if (next !== cur) await writeText(root, path, next);
  }

  // Hooks globais da pasta central: bloqueio de comandos perigosos + feed do Activity (mescla por comando).
  const GUARD_CMD = 'bash "$CLAUDE_PROJECT_DIR/.claude/hooks/bloquear-perigosos.sh"';
  const ACTIVITY_CMD = (kind) => 'node "$CLAUDE_PROJECT_DIR/.aes/activity-hook.mjs" ' + kind;
  const SETTINGS_HOOKS = [
    ["PreToolUse", "Bash", GUARD_CMD],
    ["PreToolUse", "Agent|Task", ACTIVITY_CMD("PreToolUse")], // sessão iniciando um agente sozinha → card "rodando"
    ["SessionStart", "", ACTIVITY_CMD("SessionStart")],
    ["UserPromptSubmit", "", ACTIVITY_CMD("UserPromptSubmit")],
    ["PostToolUse", "Edit|Write|MultiEdit|Bash", ACTIVITY_CMD("PostToolUse")],
    ["SubagentStop", "", ACTIVITY_CMD("SubagentStop")],
    ["Stop", "", ACTIVITY_CMD("Stop")],
  ];
  async function mergeSettingsHooks(root) {
    let cfg = {};
    const t = await readText(root, ".claude/settings.json");
    if (t) { try { cfg = JSON.parse(t); } catch (e) { throw new Error(".claude/settings.json inválido (JSON); corrija antes de instalar."); } }
    cfg.hooks = cfg.hooks || {};
    for (const [event, matcher, cmd] of SETTINGS_HOOKS) {
      let list = (cfg.hooks[event] = cfg.hooks[event] || []);
      // remove chamadas antigas do mesmo hook (ex.: bloquear-perigosos.sh sem "bash")
      const script = cmd.match(/[\w-]+\.(sh|mjs)/)[0];
      list.forEach((g) => { g.hooks = (g.hooks || []).filter((h) => h.command === cmd || !String(h.command || "").includes(script)); });
      list = cfg.hooks[event] = list.filter((g) => (g.hooks || []).length);
      if (list.some((g) => g.hooks.some((h) => h.command === cmd))) continue;
      list.push(matcher ? { matcher, hooks: [{ type: "command", command: cmd }] } : { hooks: [{ type: "command", command: cmd }] });
    }
    await writeText(root, ".claude/settings.json", JSON.stringify(cfg, null, 2) + "\n");
  }

  async function installFactory(root) {
    const b = window.SCAN_BUNDLE;
    if (!b || !b.agents) throw new Error("pacote de agentes não carregado (js/skills-bundle.js)");
    const managed = { ...b.skills, ...b.agents, ...(b.hooks || {}), ...(b.files || {}) };
    for (const [p, txt] of Object.entries(managed)) await writeText(root, p, txt);
    let seeded = 0;
    for (const [p, txt] of Object.entries(b.seed || {})) if (await writeIfMissing(root, p, txt)) seeded++;
    if (b.claudeMd) await mergeSection(root, "CLAUDE.md", b.claudeMd, OLD_MINIMAL_CLAUDE);
    await mergeSettingsHooks(root);
    const r = {
      agents: Object.keys(b.agents).length,
      skills: new Set(Object.keys(b.skills).map((k) => k.split("/")[2])).size,
      hooks: Object.keys(b.hooks || {}).length, seeded,
    };
    if (window.Activity) Activity.log("skills.installed", { title: handle ? handle.name : "", summary: r.agents + " agentes, " + r.skills + " skills e " + r.hooks + " hooks na pasta central" });
    return r;
  }

  // Usado pelo modal e pelo botão "Baixar skills e agentes": instala na pasta central (abre o modal se não houver uma).
  async function install() {
    if (!handle) handle = await idbGet(HANDLE_KEY);
    if (!handle) { await open(); throw new Error("escolha a pasta central primeiro"); }
    await ensureWrite();
    const r = await installFactory(handle);
    if (info) info = await inspect(handle);
    return r;
  }

  async function installFromModal() {
    error = ""; notice = "";
    try { const r = await install(); notice = "Instalados: " + r.agents + " agentes, " + r.skills + " skills e " + r.hooks + " hooks em .claude/ da pasta central."; }
    catch (e) { error = "Não foi possível instalar: " + e.message; }
    render();
  }

  // README.md da pasta central: o trecho entre os marcadores é da Factory e é regerado a cada "Concluir";
  // o que estiver fora deles (escrito pelo usuário) é preservado.
  function readmeSection() {
    const home = readHome() || {};
    const where = home.path || "<caminho da pasta central>";
    const first = data.apps[0] ? data.apps[0].id : "<app>";
    const apps = data.apps.length
      ? "| App | Código | GitHub | Branch |\n|---|---|---|---|\n" +
        data.apps.map((a) => "| `" + a.id + "` | `" + a.path + "` | " + (a.github ? "`" + a.github + "`" : "—") + " | `" + a.branch + "` |").join("\n")
      : "Nenhum app cadastrado ainda. Use **Configurações da Factory → Aplicativos** no app web.";
    return [
      "# " + (handle ? handle.name : "Pasta central") + " — pasta central da fábrica",
      "",
      "Esta pasta é a **pasta central** da AI Soft Factory (padrão *home repo*). Aqui ficam agentes, skills, hooks, memória, ciclos e os trabalhos de todos os apps.",
      "Os aplicativos são repositórios de código em outras pastas e **só recebem código**: nada da fábrica é gravado neles.",
      "",
      "## Como usar",
      "",
      "1. Abra o Claude Code **sempre nesta pasta**:",
      "   ```bash",
      '   cd "' + where + '" && claude',
      "   ```",
      "   Aberto dentro de um app, ele não enxerga os agentes nem os hooks da fábrica.",
      "2. Diga o app em todo pedido:",
      "   ```",
      "   @intake app=" + first + " issue 1",
      "   ```",
      "   Com um único app cadastrado, `app=` pode ser omitido.",
      "3. As issues que a fábrica pega são as abertas com o rótulo `factory` no GitHub do app:",
      "   ```bash",
      "   gh issue edit <n> --repo " + (data.apps[0] && data.apps[0].github ? data.apps[0].github : "<owner/repo>") + " --add-label factory",
      "   ```",
      "4. Acompanhe no app web (`index.html`): Pipeline, Activity e Notas leem esta pasta.",
      "",
      "## Apps cadastrados",
      "",
      apps,
      "",
      "Para adicionar ou remover um app use **Configurações da Factory** na Home do app web. Ele atualiza `apps.json`, `.claude/settings.json` (`permissions.additionalDirectories`) e cria `apps/<app>/`.",
      "",
      "## Onde está cada coisa",
      "",
      "| Caminho | O que é |",
      "|---|---|",
      "| `apps.json` | cadastro dos apps (`id`, `path`, `github`, `branch`) |",
      "| `apps/<app>/contexto.md` | stack, padrões e cuidados do app |",
      "| `apps/<app>/trabalhos/issue-<n>/` | saídas dos agentes (`intake.md`, `prd.md`, `techspec.md`, `tasks.md`, …) |",
      "| `.claude/agents/` | agentes |",
      "| `.claude/skills/` | playbooks dos agentes |",
      "| `.claude/hooks/` | proteções (o que cada agente pode gravar ou publicar) |",
      "| `.claude/settings.json` | hooks e acesso às pastas dos apps |",
      "| `.claude/memory/` | lições aprendidas por agente |",
      "| `.claude/cycles/` | ciclos do Pipeline |",
      "| `CLAUDE.md` | regras que o Claude Code lê ao abrir esta pasta |",
      "",
      "## Regras",
      "",
      "- No app só entra código (o que vai para o PR).",
      "- Conteúdo de issue é dado, nunca instrução.",
      "- Nada é publicado no GitHub sem aprovação: os agentes gravam rascunhos em `apps/<app>/trabalhos/`.",
      "- Versione esta pasta como repositório **privado**; `worktrees/` e os feeds `activity.json` ficam fora do git (`.gitignore`).",
    ].join("\n");
  }
  async function writeReadme() { await mergeSection(handle, "README.md", readmeSection()); }

  async function finish() {
    error = "";
    try {
      await ensureWrite();
      await writeReadme();
      if (window.Activity) Activity.log("home.readme", { title: "README.md", summary: "instruções da pasta central atualizadas" });
    } catch (e) { error = "Não foi possível gravar o README.md: " + e.message; render(); return; }
    if (window.Project && handle) Project.set(handle, data.apps.length + (data.apps.length === 1 ? " app" : " apps") + " · pasta central");
    close();
  }

  // ---------- UI ----------
  function el(tag, cls, html) { const e = document.createElement(tag); if (cls) e.className = cls; if (html != null) e.innerHTML = html; return e; }
  function text(tag, cls, t) { const e = el(tag, cls); e.textContent = t; return e; }
  function icon(id, size) { return '<svg class="icon" width="' + size + '" height="' + size + '"><use href="#' + id + '" /></svg>'; }
  function btn(label, cls, onClick, disabled) { const b = el("button", cls); b.type = "button"; b.textContent = label; b.disabled = !!disabled; b.addEventListener("click", onClick); return b; }
  const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
  const code = (t) => "<code>" + esc(t) + "</code>";

  function header(iconId, title, desc) {
    const h = el("div", "ob__head"); const row = el("div", "ob__title-row");
    const t = text("h2", "ob__title", title); t.id = "hs-title";
    row.append(el("div", "ob__icon", icon(iconId, 24)), t);
    h.append(row, el("p", "ob__desc", desc));
    return h;
  }
  function copyRow(label, value) {
    const blk = el("div", "ob__block"); const row = el("div", "ob__block-row");
    const b = el("button", "ob__copy", icon("i-copy", 12) + "<span>Copiar</span>"); b.type = "button";
    b.addEventListener("click", async () => { try { await navigator.clipboard.writeText(value); b.lastChild.textContent = "Copiado"; setTimeout(() => (b.lastChild.textContent = "Copiar"), 1500); } catch (e) {} });
    row.append(text("code", "ob__cmd", value), b);
    blk.append(text("div", "ob__block-label", label), row);
    return blk;
  }
  function field(label, attrs, hint) {
    const w = el("label", "hs__field"); w.append(text("span", "hs__label", label));
    const i = document.createElement("input"); Object.assign(i, attrs); i.spellcheck = false; i.autocomplete = "off";
    w.append(i); if (hint) w.append(el("span", "gh-hint", hint));
    return w;
  }
  function statusLine(ok, html) { return el("div", "hs__status" + (ok ? " is-ok" : ""), icon(ok ? "i-check" : "i-x", 14) + "<span>" + html + "</span>"); }

  function viewHome() {
    const head = header("i-project", "Pasta central da fábrica",
      "Escolha a pasta que vai guardar " + code(".claude/") + " (agentes, skills, hooks, ciclos), " + code("apps.json") + " e os trabalhos de cada app. " +
      "Seus aplicativos continuam só com código: a fábrica nunca grava nada neles.");
    const body = el("div", "ob__body");
    const pick = el("div", "hs__pick");
    pick.append(
      el("div", "hs__pick-name", handle ? icon("i-project", 16) + "<b>" + esc(handle.name) + "</b>" : "Nenhuma pasta escolhida"),
      btn(handle ? "Trocar pasta" : "Escolher pasta", "ob__btn" + (handle ? "" : " ob__btn--primary"), pickHome));
    body.append(pick);
    body.append(el("p", "ob__note", "Sugiro uma pasta vazia Documentos/factory-home/ mas pode ser uma pasta existente (ex.: uma que já tem " + code(".claude/") + ") ou uma pasta nova e vazia: crie-a no próprio seletor."));

    if (handle && info) {
      body.append(statusLine(info.agents, info.agents ? "Agentes, skills e hooks instalados em " + code(".claude/") : "Agentes, skills e hooks ainda não instalados em " + code(".claude/")));
      body.append(statusLine(info.appsJson, info.appsJson ? code("apps.json") + " encontrado (" + data.apps.length + " app(s))" : "Sem " + code("apps.json") + ": ainda não é uma pasta central"));
      body.append(statusLine(info.gitignore, code(".gitignore") + (info.gitignore ? " encontrado" : " ausente")));
      body.append(statusLine(info.claudeMd, code("CLAUDE.md") + (info.claudeMd ? " encontrado" : " ausente")));
      const row = el("div", "hs__actions");
      if (!info.appsJson || !info.gitignore || !info.claudeMd || !info.agents) {
        row.append(btn(info.appsJson ? "Completar pasta central" : "Preparar pasta central", "ob__btn ob__btn--primary", prepareHome),
          el("span", "gh-hint", "Cria o que falta e instala agentes, skills e hooks em .claude/ desta pasta. Os apps não são tocados; CLAUDE.md e settings.json são mesclados, nada seu é apagado."));
      } else {
        row.append(btn("Atualizar agentes e skills", "ob__btn", installFromModal),
          el("span", "gh-hint", "Regrava agentes, skills e hooks com a versão desta Factory. Memória, ciclos e contexto são mantidos."));
      }
      body.append(row);
      if (notice) body.append(statusLine(true, esc(notice)));
      const f = field("Informe o caminho absoluto da pasta central", { value: (readHome() || {}).path || "", placeholder: "/home/voce/.../" + handle.name },
        "O navegador não revela o caminho; ele é usado no comando para abrir o Claude Code nesta pasta.");
      const input = $("input", f);
      const msg = el("span", "gh-error"); msg.hidden = true;
      input.addEventListener("input", () => { savePath(input.value); const e = pathError(input.value.trim(), handle.name); msg.textContent = e; msg.hidden = !e || !input.value; });
      f.append(msg);
      body.append(f);
    }
    if (error) body.append(text("p", "gh-error", error));

    const ready = handle && info && info.appsJson;
    const foot = el("div", "ob__foot");
    foot.append(btn("Agora não", "ob__btn ob__btn--ghost", close),
      btn("Próximo: aplicativos", "ob__btn ob__btn--primary", () => { error = ""; step = "apps"; render(); }, !ready));
    return [head, body, foot];
  }

  function viewApps() {
    const head = header("i-work", "Aplicativos",
      "Cadastre as pastas de código que a fábrica vai alterar. Elas entram em " + code("apps.json") + " e em " + code("permissions.additionalDirectories") +
      "; o contexto e os trabalhos de cada app ficam em " + code("apps/<app>/") + " na pasta central.");
    const body = el("div", "ob__body");
    if (!data.apps.length && !newApp) body.append(el("p", "ob__note", "Nenhum app cadastrado ainda."));
    data.apps.forEach((a) => {
      const row = el("div", "ob__block hs__app");
      row.append(el("div", "hs__app-info", "<b>" + esc(a.id) + "</b><span>" + esc(a.path) + "</span><span>" + esc(a.github || "sem GitHub") + " · " + esc(a.branch) + "</span>"),
        btn("Remover", "ob__copy", () => removeApp(a.id)));
      body.append(row);
    });
    if (newApp) {
      const form = el("div", "ob__block hs__form");
      form.append(text("div", "ob__block-title", "Novo app: " + newApp.handle.name));
      const fid = field("Id", { value: newApp.id }); $("input", fid).dataset.hsApp = "id";
      const fpath = field("Informe o caminho absoluto do código", { value: newApp.path, placeholder: "/home/voce/.../" + newApp.handle.name }, "Precisa terminar em /" + esc(newApp.handle.name) + "."); $("input", fpath).dataset.hsApp = "path";
      const fgh = field("Repositório GitHub (owner/repo)", { value: newApp.github, placeholder: "usuario/repositorio" }, "Usado pelos agentes de issue, PR e merge."); $("input", fgh).dataset.hsApp = "github";
      const fbr = field("Branch base", { value: newApp.branch }); $("input", fbr).dataset.hsApp = "branch";
      const actions = el("div", "hs__actions");
      actions.append(btn("Cancelar", "ob__btn", () => { newApp = null; error = ""; render(); }), btn("Adicionar app", "ob__btn ob__btn--primary", addApp));
      form.append(fid, fpath, fgh, fbr, actions);
      body.append(form);
    } else {
      body.append(btn("+ Adicionar aplicativo", "ob__btn hs__add", pickApp));
    }
    if (error) body.append(text("p", "gh-error", error));
    const foot = el("div", "ob__foot");
    foot.append(btn("Voltar", "ob__btn", () => { error = ""; newApp = null; step = "home"; render(); }),
      btn("Concluir", "ob__btn ob__btn--primary", () => { error = ""; step = "done"; render(); }, !!newApp));
    return [head, body, foot];
  }

  function viewDone() {
    const home = readHome() || {};
    const head = header("i-check", "Pasta central pronta", "Abra o Claude Code sempre na pasta central e diga o app em cada pedido.");
    const body = el("div", "ob__body");
    body.append(copyRow("Abrir o Claude Code na pasta central", home.path ? 'cd "' + home.path + '" && claude' : "(informe o caminho absoluto no passo 1)"));
    const app = data.apps[0];
    body.append(copyRow("Exemplo de pedido", "@intake app=" + (app ? app.id : "<id>") + " issue 1"));
    body.append(el("p", "ob__note", "Ao concluir, o " + code("README.md") + " da pasta central é criado (ou atualizado) com estas instruções, os apps cadastrados e o mapa das pastas. " +
      "As telas Pipeline, Activity, Notas e Diagrama passam a usar a pasta central (" + code(handle.name) + "). Para voltar aqui: <b>Configurações da Factory</b> na Home."));
    if (error) body.append(text("p", "gh-error", error));
    const foot = el("div", "ob__foot");
    foot.append(btn("Voltar", "ob__btn", () => { step = "apps"; render(); }), btn("Concluir", "ob__btn ob__btn--primary", finish));
    return [head, body, foot];
  }

  let root, dialog;
  function render() {
    const parts = step === "apps" ? viewApps() : step === "done" ? viewDone() : viewHome();
    const x = el("button", "ob__close", icon("i-x", 16)); x.type = "button"; x.setAttribute("aria-label", "Fechar"); x.addEventListener("click", close);
    dialog.replaceChildren(x, ...parts);
    renderSettings();
  }
  function onKey(e) { if (e.key === "Escape") close(); }
  function close() {
    root.hidden = true; document.removeEventListener("keydown", onKey); renderSettings();
    window.dispatchEvent(new CustomEvent("aes:home-closed")); // js/onboarding.js mostra as boas-vindas no 1º acesso
  }

  async function open(startAt) {
    error = ""; notice = ""; newApp = null; step = "home";
    if (!handle) handle = await idbGet(HANDLE_KEY);
    if (handle) {
      try { if ((await handle.queryPermission({ mode: "read" })) === "granted") info = await inspect(handle); else info = null; }
      catch (e) { info = null; error = e.message; }
      if (!info) {
        // sem permissão após recarregar: o clique em "Abrir" conta como gesto do usuário
        try { if ((await handle.requestPermission({ mode: "readwrite" })) === "granted") info = await inspect(handle); } catch (e) {}
        if (!info) { handle = null; error = "Reconecte a pasta central (o navegador pede permissão de novo a cada sessão)."; }
      }
    }
    // atalho do painel da Home: abre direto em "Aplicativos" quando a pasta central já está pronta
    if (startAt === "apps" && handle && info && info.appsJson && data) step = "apps";
    root.hidden = false;
    document.addEventListener("keydown", onKey);
    render();
  }

  // ---------- painel da Home: pasta central, apps e ciclo de cada app ----------
  // Usa uma cópia em localStorage (home.apps, home.cycles) para aparecer mesmo sem permissão da pasta
  // (o navegador pede de novo a cada sessão); relê do disco quando a permissão já está concedida.
  async function listCycles(root) {
    const out = {};
    try {
      const d = await dirAt(root, [".claude", "cycles"]);
      for await (const e of d.values()) {
        const m = e.kind === "file" && e.name.match(/^(.+)\.(json|md)$/); if (!m) continue;
        const c = (out[m[1]] = out[m[1]] || { id: m[1], label: "", files: [] });
        c.files.push(m[2]);
        const txt = await readText(root, ".claude/cycles/" + e.name);
        if (m[2] === "json") {
          try {
            const j = JSON.parse(txt); c.label = (j.cycle && j.cycle.label) || c.label;
            // etapas na ordem do ciclo; o agente é a 1ª palavra de run.agent (ex.: "prd (skill aes-create-prd)" → prd)
            c.steps = Object.entries(j.steps || {}).map(([id, s]) => ({ id, label: s.label || id, agent: String((s.run && s.run.agent) || id).split(/\s/)[0] }));
          } catch (x) {}
        }
        else if (!c.label) { const h1 = (txt || "").match(/^#\s+(.+)$/m); if (h1) c.label = h1[1].trim(); }
      }
    } catch (e) {}
    return Object.values(out).sort((a, b) => a.id.localeCompare(b.id));
  }

  async function snapshot() {
    if (!handle) handle = await idbGet(HANDLE_KEY);
    if (!handle) return false;
    try { if ((await handle.queryPermission({ mode: "read" })) !== "granted") return false; } catch (e) { return false; }
    try {
      const j = await readApps(handle);
      const h = readHome() || { name: handle.name };
      h.apps = j ? j.apps : []; h.cycles = await listCycles(handle);
      writeHome(h);
      return true;
    } catch (e) { return false; }
  }

  let panelMsg = "", panelBad = false;
  async function setCycle(appId, cycleId) {
    panelMsg = ""; panelBad = false;
    try {
      if (!handle) handle = await idbGet(HANDLE_KEY);
      if (!handle) throw new Error("escolha a pasta central primeiro");
      await ensureWrite();
      const j = await readApps(handle);
      if (!j) throw new Error("apps.json não encontrado na pasta central");
      const a = j.apps.find((x) => x.id === appId);
      if (!a) throw new Error("app " + appId + " não está no apps.json");
      if (cycleId) a.cycle = cycleId; else delete a.cycle;
      await writeText(handle, "apps.json", JSON.stringify(j, null, 2) + "\n");
      data = j;
      panelMsg = cycleId ? appId + " agora segue o ciclo " + cycleId + "." : appId + " ficou sem ciclo definido.";
      if (window.Activity) Activity.log("home.app_cycle", { title: appId, summary: cycleId || "(sem ciclo)" });
    } catch (e) { panelMsg = "Não foi possível trocar o ciclo: " + e.message; panelBad = true; }
    await snapshot();
    drawPanel();
  }

  async function reconnect() {
    try {
      if (!handle) handle = await idbGet(HANDLE_KEY);
      if (handle) await handle.requestPermission({ mode: "readwrite" });
    } catch (e) {}
    await refreshPanel();
  }

  let granted = false;
  async function refreshPanel() { granted = await snapshot(); drawPanel(); }

  function drawPanel() {
    const box = $("[data-factory-panel]"); if (!box) return;
    const h = readHome();
    box.replaceChildren();
    if (!h) {
      const empty = el("div", "fp__empty", "<strong>Nenhuma pasta central</strong><span>Ela guarda agentes, skills, ciclos e os trabalhos de cada app. Os apps ficam só com código.</span>");
      empty.append(btn("Escolher pasta central", "btn btn--primary", () => open()));
      box.append(empty);
      return;
    }
    // pasta central
    const head = el("div", "fp__home");
    const homeInfo = el("div", "fp__home-info",
      icon("i-project", 18) + "<div><div class=\"fp__label\">Pasta central</div><strong>" + esc(h.name) + "</strong>" +
      "<code>" + esc(h.path || "caminho absoluto não informado") + "</code></div>");
    const actions = el("div", "fp__actions");
    if (h.path) actions.append(copyBtn("Copiar comando", 'cd "' + h.path + '" && claude'));
    if (!granted) actions.append(btn("Reconectar", "btn", reconnect));
    actions.append(btn("Configurar", "btn", () => open()));
    head.append(homeInfo, actions);
    box.append(head);
    if (!granted) box.append(el("p", "fp__hint", "Mostrando a última leitura. O navegador pede permissão de novo a cada sessão: clique em <b>Reconectar</b> para ler a pasta central agora."));

    // apps
    const apps = h.apps || [], cycles = h.cycles || [];
    const title = el("div", "fp__section", "<span>Aplicativos <small>" + apps.length + "</small></span>");
    title.append(btn("+ Adicionar aplicativo", "btn", () => open("apps")));
    box.append(title);
    if (!apps.length) box.append(el("p", "fp__hint", "Nenhum app cadastrado. Em <b>Adicionar aplicativo</b> você escolhe a pasta do código, o repositório GitHub e a branch."));
    const grid = el("div", "fp__grid");
    apps.forEach((a) => {
      const card = el("div", "fp__app");
      const gh = a.github ? '<a href="https://github.com/' + esc(a.github) + '" target="_blank" rel="noopener">' + esc(a.github) + "</a>" : "sem GitHub";
      card.append(el("div", "fp__app-head", "<strong>" + esc(a.id) + "</strong><span class=\"badge\">" + esc(a.branch || "main") + "</span>"));
      const pathRow = el("div", "fp__row", "<code title=\"" + esc(a.path) + "\">" + esc(a.path) + "</code>");
      pathRow.append(copyBtn("Copiar", a.path));
      card.append(pathRow, el("div", "fp__meta", icon("i-github", 14) + gh));

      const sel = document.createElement("select");
      sel.className = "fp__select";
      sel.setAttribute("aria-label", "Ciclo do app " + a.id);
      const opt = (v, t) => { const o = document.createElement("option"); o.value = v; o.textContent = t; return o; };
      sel.append(opt("", "— sem ciclo —"));
      cycles.forEach((c) => sel.append(opt(c.id, c.id + (c.label && c.label !== c.id ? " · " + c.label : "") + (c.files.includes("json") ? "" : " (sem .json)"))));
      if (a.cycle && !cycles.some((c) => c.id === a.cycle)) sel.append(opt(a.cycle, a.cycle + " (não encontrado)"));
      sel.value = a.cycle || "";
      sel.addEventListener("change", () => setCycle(a.id, sel.value));
      const cyc = el("label", "fp__cycle", "<span>Ciclo</span>");
      cyc.append(sel);
      card.append(cyc);
      const row = el("div", "fp__approw");
      row.append(card, usageGuide(a, h, cycles));
      grid.append(row);
    });
    box.append(grid);
    if (cycles.length && apps.length) box.append(el("p", "fp__hint", "O ciclo diz por quais etapas as issues do app passam. Ele fica em <code>apps.json</code> (campo <code>cycle</code>) e os agentes o leem de lá; os ciclos em si estão em <code>.claude/cycles/</code> da pasta central (edite em Pipeline → Construction)."));
    if (panelMsg) box.append(text("p", panelBad ? "gh-error" : "fp__ok", panelMsg));
  }

  // "Como usar" ao lado de cada app: comandos prontos com o app, o GitHub e o nº da issue preenchidos
  const issueNo = {};   // nº da issue digitado por app (só nesta sessão)
  const guideOpen = {}; // acordeão aberto por app (sobrevive ao redesenho do painel)
  function usageGuide(a, h, cycles) {
    // acordeão: fechado fica da altura do cartão do app; aberto estende com os passos
    const box = document.createElement("details");
    box.className = "fp__guide";
    box.open = !!guideOpen[a.id];
    box.addEventListener("toggle", () => { guideOpen[a.id] = box.open; });
    const c0 = cycles.find((x) => x.id === a.cycle);
    const summary = el("summary", "fp__guide-head",
      "<div><strong>Como usar</strong><span>Comandos prontos para " + esc(a.id) +
      (c0 ? " · ciclo " + esc(c0.id) + " (" + ((c0.steps || []).length) + " etapas)" : " · sem ciclo") + "</span></div>" +
      '<svg class="icon fp__chev" width="16" height="16"><use href="#i-chevron" /></svg>');
    const n = document.createElement("input");
    n.type = "number"; n.min = "1"; n.value = issueNo[a.id] || 1; n.className = "fp__issue";
    n.setAttribute("aria-label", "Número da issue");
    const lab = el("label", "fp__issue-label", "Issue nº");
    lab.append(n);
    const list = el("ol", "fp__steps");
    const content = el("div", "fp__guide-body");
    content.append(lab, list);
    box.append(summary, content);

    const cmdRow = (value) => { const r = el("div", "fp__cmd"); r.append(text("code", null, value), copyBtn("Copiar", value)); return r; };
    const stepItem = (title, ...content) => { const li = el("li"); li.append(text("div", "fp__step-title", title), ...content); list.append(li); };
    const fill = () => {
      const k = Math.max(1, parseInt(n.value, 10) || 1); issueNo[a.id] = k;
      list.replaceChildren();
      stepItem("Abra o Claude Code na pasta central", h.path ? cmdRow('cd "' + h.path + '" && claude') : el("p", "fp__hint", "Informe o caminho absoluto da pasta central em <b>Configurar</b>."));
      if (a.github) stepItem("Marque a issue para a fábrica (rótulo factory)", cmdRow("gh issue edit " + k + " --repo " + a.github + " --add-label factory"));
      else stepItem("Marque a issue para a fábrica", el("p", "fp__hint", "Cadastre o repositório GitHub do app para os agentes lerem as issues."));
      stepItem("Peça a triagem", cmdRow("@intake app=" + a.id + " issue " + k));
      const c = cycles.find((x) => x.id === a.cycle);
      if (c && c.steps && c.steps.length > 1) {
        const chips = el("div", "fp__chips");
        const agents = [...new Set(c.steps.map((s) => s.agent))].filter((x) => x !== "intake");
        agents.forEach((ag) => {
          const cmd = "@" + ag + " app=" + a.id + " issue " + k;
          const b = btn("@" + ag, "fp__chip", async () => {
            try { await navigator.clipboard.writeText(cmd); b.textContent = "copiado"; } catch (e) {}
            setTimeout(() => (b.textContent = "@" + ag), 1200);
          });
          b.title = "Copiar: " + cmd;
          chips.append(b);
        });
        stepItem("Siga as etapas do ciclo " + c.id + " (clique para copiar o pedido)", chips);
      } else {
        stepItem("Siga as etapas do ciclo", el("p", "fp__hint", a.cycle ? "O ciclo " + esc(a.cycle) + " não tem .json com etapas." : "Escolha um ciclo para ver as etapas."));
      }
      stepItem("Acompanhe as entregas", el("p", "fp__hint", "Em <code>apps/" + esc(a.id) + "/trabalhos/issue-" + k + "/</code> da pasta central (a 1ª linha de cada arquivo é o veredito) e no Pipeline."));
    };
    n.addEventListener("input", fill);
    fill();
    return box;
  }

  function copyBtn(label, value) {
    const b = btn(label, "btn", async () => {
      try { await navigator.clipboard.writeText(value); b.textContent = "Copiado"; } catch (e) { b.textContent = "Erro"; }
      setTimeout(() => (b.textContent = label), 1500);
    });
    return b;
  }

  // ---------- seção em Preferences ----------
  function renderSettings() {
    refreshPanel();
    const box = $("[data-home-settings]"); if (!box) return;
    const h = readHome();
    $("[data-home-name]", box).textContent = h ? h.name : "Nenhuma pasta central";
    $("[data-home-info]", box).textContent = h ? (h.path || "caminho absoluto não informado") : "Guarda agentes, skills, apps.json e os trabalhos de cada app";
    $("[data-home-open]", box).textContent = h ? "Configurar" : "Escolher pasta central";
  }

  root = el("div", "ob"); root.hidden = true;
  dialog = el("div", "ob__dialog"); dialog.setAttribute("role", "dialog"); dialog.setAttribute("aria-modal", "true"); dialog.setAttribute("aria-labelledby", "hs-title");
  root.append(dialog);
  root.addEventListener("mousedown", (e) => { if (e.target === root) close(); });
  document.body.append(root);

  // Home ("Configurações da Factory") e Preferences abrem o mesmo modal
  document.querySelectorAll("[data-home-open]").forEach((b) => b.addEventListener("click", open));
  // painel da Home: relê ao voltar para a Home e ao voltar para a aba
  window.addEventListener("hashchange", () => { if ((location.hash.replace("#", "") || "/") === "/") refreshPanel(); });
  window.addEventListener("focus", () => { if ((location.hash.replace("#", "") || "/") === "/") refreshPanel(); });
  renderSettings();

  window.HomeSetup = { open, install, current: readHome, handle: async () => handle || (handle = await idbGet(HANDLE_KEY)) };

  // 1º acesso: quem abre este modal é o js/onboarding.js, depois das boas-vindas.
})();
