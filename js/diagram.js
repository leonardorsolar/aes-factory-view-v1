// Página "Diagrama": lista os boards Excalidraw do projeto (.aes/diagrams/), cria novos e edita/salva.
// Também mostra os boards gerados pelo scan em .aes/project/diagrams/.
(function () {
  const root = document.querySelector("[data-diagram-list]");
  if (!root) return;
  const errorBox = document.querySelector("[data-diagram-error]");
  const DIRS = [".aes/diagrams", ".aes/project/diagrams"];

  const el = (tag, cls, text) => {
    const n = document.createElement(tag);
    if (cls) n.className = cls;
    if (text != null) n.textContent = text;
    return n;
  };
  const showError = (m) => { errorBox.textContent = m || ""; errorBox.hidden = !m; };

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

  async function getDir(handle, path, create) {
    let d = handle;
    for (const part of path.split("/")) d = await d.getDirectoryHandle(part, { create: !!create });
    return d;
  }
  async function readText(handle, path) {
    const parts = path.split("/");
    const d = await getDir(handle, parts.slice(0, -1).join("/"));
    return (await (await d.getFileHandle(parts[parts.length - 1])).getFile()).text();
  }
  async function writeFile(handle, path, text) {
    const parts = path.split("/");
    const d = await getDir(handle, parts.slice(0, -1).join("/"), true);
    const w = await (await d.getFileHandle(parts[parts.length - 1], { create: true })).createWritable();
    await w.write(text); await w.close();
  }

  const slugify = (name) => name.trim().toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");

  // Modal com o Excalidraw (iframe de excalidraw/index.html)
  function openBoard(title, path, scene) {
    const dlg = el("dialog", "board board--full");
    const head = el("div", "board__head");
    const status = el("span", "board__status");
    const save = el("button", "btn btn--primary", "Salvar"); save.type = "button";
    const close = el("button", "btn", "Fechar"); close.type = "button";
    head.append(el("strong", null, "Excalidraw — " + title), status, save, close);
    const frame = el("iframe", "board__frame");
    frame.src = "excalidraw/index.html";
    dlg.append(head, frame);
    document.body.append(dlg);

    const dark = document.documentElement.getAttribute("data-theme") === "dark" ||
      (!document.documentElement.getAttribute("data-theme") && matchMedia("(prefers-color-scheme: dark)").matches);
    const onMsg = async (ev) => {
      if (ev.source !== frame.contentWindow) return;
      if (ev.data?.type === "excalidraw:ready") {
        if (scene) frame.contentWindow.postMessage({ type: "excalidraw:load", scene: { ...scene, appState: { ...(scene.appState || {}), theme: dark ? "dark" : "light" } } }, "*");
      } else if (ev.data?.type === "excalidraw:save-response") {
        try {
          const handle = await getHandle();
          if ((await handle.requestPermission({ mode: "readwrite" })) !== "granted") throw new Error("permissão de escrita negada");
          await writeFile(handle, path, JSON.stringify(ev.data.scene, null, 1));
          status.textContent = "Salvo em " + path;
          if (window.Activity) Activity.log("diagram.saved", { title, summary: path });
        } catch (e) { status.textContent = "Erro ao salvar: " + e.message; }
        save.disabled = false;
      }
    };
    window.addEventListener("message", onMsg);
    save.addEventListener("click", () => { save.disabled = true; status.textContent = "Salvando..."; frame.contentWindow.postMessage({ type: "excalidraw:save-request" }, "*"); });
    const end = () => { window.removeEventListener("message", onMsg); dlg.close(); dlg.remove(); load(); };
    close.addEventListener("click", end);
    dlg.addEventListener("cancel", (e) => { e.preventDefault(); end(); });
    dlg.showModal();
  }

  async function openFile(name, path) {
    showError("");
    try {
      const handle = await getHandle();
      const scene = JSON.parse(await readText(handle, path));
      openBoard(name, path, scene);
    } catch (e) { showError("Não foi possível abrir " + path + ": " + e.message); }
  }

  // Dialog "Criar diagrama"
  function openCreate() {
    let proj = ""; try { proj = (JSON.parse(localStorage.getItem("project")) || {}).name || ""; } catch (e) {}
    const dlg = el("dialog", "modal");
    const form = el("form", "modal__form");
    const close = el("button", "modal__close", "✕"); close.type = "button"; close.setAttribute("aria-label", "Fechar");
    const input = el("input", "modal__input"); input.id = "diagram-name"; input.placeholder = "Ex: Fluxo de autenticação"; input.autofocus = true;
    const label = el("label", null, "Nome"); label.htmlFor = "diagram-name";
    const hint = el("p", "modal__hint"); hint.append("📁 Será salvo em: ", el("code", null, (proj ? proj + "/" : "") + ".aes/diagrams"));
    const ok = el("button", "btn btn--primary", "Criar"); ok.type = "submit"; ok.disabled = true;
    const row = el("div", "modal__row"); row.append(ok);
    form.append(el("h2", "modal__title", "Criar diagrama"), label, input, hint, row);
    dlg.append(close, form);
    document.body.append(dlg);
    input.addEventListener("input", () => { ok.disabled = !input.value.trim(); });
    const end = () => { dlg.close(); dlg.remove(); };
    close.addEventListener("click", end);
    dlg.addEventListener("cancel", (e) => { e.preventDefault(); end(); });
    dlg.addEventListener("click", (e) => { if (e.target === dlg) end(); });
    form.addEventListener("submit", (e) => {
      e.preventDefault();
      const name = input.value.trim();
      if (!name) return;
      end();
      openBoard(name, ".aes/diagrams/" + (slugify(name) || "diagrama-" + Date.now()) + ".excalidraw", null);
    });
    dlg.showModal();
  }

  // Diagramas padrão (excalidraw/templates/): ao salvar, grava uma cópia em .aes/diagrams/
  async function openPicker() {
    showError("");
    const dlg = el("dialog", "modal modal--picker");
    const head = el("div", "picker__head"); const close = el("button", "btn btn--ghost", "✕"); close.type = "button";
    head.append(el("strong", null, "Selecionar diagrama"), close);
    const list = el("ul", "picker__list");
    dlg.append(head, list);
    document.body.append(dlg);
    const end = () => { dlg.close(); dlg.remove(); };
    close.addEventListener("click", end);
    dlg.addEventListener("cancel", (e) => { e.preventDefault(); end(); });
    dlg.addEventListener("click", (e) => { if (e.target === dlg) end(); });
    dlg.showModal();
    try {
      const idx = await (await fetch("excalidraw/templates/index.json")).json();
      idx.diagrams.forEach((d) => {
        const li = el("li"); const b = el("button", "picker__item"); b.type = "button";
        const t = el("span", "diagram-tile__text"); t.append(el("strong", null, d.title));
        if (d.description) t.append(el("small", null, d.description));
        b.append(el("span", null, "✎"), t);
        b.addEventListener("click", async () => {
          try {
            const scene = await (await fetch("excalidraw/templates/" + d.slug + ".excalidraw")).json();
            end();
            openBoard(d.title, ".aes/diagrams/" + d.slug + ".excalidraw", scene);
          } catch (e) { showError("Não foi possível carregar o diagrama: " + e.message); end(); }
        });
        li.append(b); list.append(li);
      });
    } catch (e) { list.append(el("li", "picker__empty", "Nenhum diagrama padrão disponível (abra o app por um servidor HTTP).")); }
  }

  function card(title, desc, onClick, dashed, onDelete) {
    const c = el("button", "diagram-tile" + (dashed ? " diagram-tile--new" : ""));
    c.type = "button";
    c.append(el("span", "diagram-tile__icon", dashed ? "+" : "✎"));
    const t = el("span", "diagram-tile__text");
    t.append(el("strong", null, title));
    if (desc) t.append(el("small", null, desc));
    c.append(t);
    c.addEventListener("click", onClick);
    if (!onDelete) return c;
    const wrap = el("div", "diagram-wrap");
    const del = el("button", "diagram-del", "🗑"); del.type = "button"; del.title = "Excluir diagrama"; del.setAttribute("aria-label", "Excluir diagrama " + title);
    del.addEventListener("click", onDelete);
    wrap.append(c, del);
    return wrap;
  }

  async function deleteDiagram(name, dir) {
    if (!confirm('Excluir o diagrama "' + name.replace(/\.excalidraw$/, "") + '"? Essa ação não pode ser desfeita.')) return;
    showError("");
    try {
      const handle = await getHandle();
      if ((await handle.requestPermission({ mode: "readwrite" })) !== "granted") throw new Error("permissão de escrita negada");
      await (await getDir(handle, dir)).removeEntry(name);
      if (window.Activity) Activity.log("diagram.deleted", { title: name.replace(/\.excalidraw$/, "") });
      load();
    } catch (e) { showError("Não foi possível excluir: " + e.message); }
  }

  async function load() {
    root.replaceChildren();
    const handle = await getHandle();
    if (!handle) {
      showError("");
      const empty = el("div", "dcard__empty");
      const pick = el("button", "btn btn--icon", "Selecionar pasta do projeto");
      pick.addEventListener("click", () => document.getElementById("project-switcher").click());
      empty.append(el("p", "dcard__hint", "Selecione a pasta do projeto para ver e criar diagramas."), pick);
      root.append(empty);
      return;
    }
    showError("");
    root.append(card("Criar diagrama", "Novo board Excalidraw, salvo em .aes/diagrams", async () => {
      if ((await handle.requestPermission({ mode: "readwrite" })) === "granted") openCreate();
      else showError("Permissão de escrita negada.");
    }, true));
    try {
      if ((await handle.queryPermission({ mode: "read" })) !== "granted" &&
          (await handle.requestPermission({ mode: "read" })) !== "granted") { showError("Sem permissão de leitura na pasta do projeto."); return; }
    } catch (e) {}
    for (const dir of DIRS) {
      let d;
      try { d = await getDir(handle, dir); } catch (e) { continue; }
      const names = [];
      for await (const entry of d.values()) if (entry.kind === "file" && entry.name.endsWith(".excalidraw")) names.push(entry.name);
      names.sort().forEach((n) => root.append(card(n.replace(/\.excalidraw$/, ""), dir, () => openFile(n, dir + "/" + n), false,
        dir === DIRS[0] ? () => deleteDiagram(n, dir) : null)));
    }
  }

  document.querySelector("[data-diagram-pick]").addEventListener("click", openPicker);
  window.addEventListener("hashchange", () => { if (location.hash === "#/diagram") load(); });
  window.addEventListener("aes:project-changed", () => { if (location.hash === "#/diagram") load(); });
  if (location.hash === "#/diagram") load();
})();
