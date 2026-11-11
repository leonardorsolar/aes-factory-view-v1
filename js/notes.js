// Página "Notas": notas em Markdown do projeto, salvas em .aes/notes/*.md (mesmo desenho do aes-ai-sofware-factory).
(function () {
  const $ = (s) => document.querySelector(s);
  const listBox = $("[data-notes-list]");
  if (!listBox) return;
  const errorBox = $("[data-notes-error]");
  const editorBox = $("[data-notes-editor]");
  const DIR = ".aes/notes";

  const PROMPT = (path) => `Na raiz do projeto existe o arquivo:\`${path}\`
Regras:
- Edite somente o arquivo informado.
- Preserve a estrutura, formatação e conteúdo não relacionado.
- Faça apenas as alterações necessárias para atender à solicitação.
- Mantenha o Markdown válido.
- Não renomeie nem mova o arquivo.
- Salve o arquivo após a edição.
Após concluir a edição, informe ao usuário exatamente a seguinte mensagem:
"Alterações concluídas. Clique em **Atualizar** para visualizar as alterações."
O usuário deseja realizar a seguinte alteração:`;

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
  async function dir(handle, create) {
    let d = handle;
    for (const p of DIR.split("/")) d = await d.getDirectoryHandle(p, { create: !!create });
    return d;
  }
  async function canWrite(handle) {
    if ((await handle.requestPermission({ mode: "readwrite" })) !== "granted") throw new Error("permissão de escrita negada");
  }
  const slugify = (s) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "") || "nota";
  const titleOf = (content, file) => {
    const h = content.split("\n").find((l) => l.trimStart().startsWith("# "));
    return (h && h.trimStart().slice(2).trim()) || file.replace(/\.md$/, "").replace(/-/g, " ");
  };

  // ---------- estado ----------
  let selected = null; // nome do arquivo

  async function listNotes(handle) {
    let d;
    try { d = await dir(handle); } catch (e) { return []; }
    const out = [];
    for await (const entry of d.values()) {
      if (entry.kind !== "file" || !entry.name.endsWith(".md")) continue;
      const f = await entry.getFile();
      out.push({ file: entry.name, title: titleOf(await f.text(), entry.name), updated: f.lastModified });
    }
    return out.sort((a, b) => b.updated - a.updated);
  }

  async function loadList() {
    listBox.replaceChildren();
    const handle = await getHandle();
    if (!handle) { showError("Nenhuma pasta de projeto selecionada. Selecione no menu lateral."); return; }
    try {
      if ((await handle.queryPermission({ mode: "read" })) !== "granted" &&
          (await handle.requestPermission({ mode: "read" })) !== "granted") { showError("Sem permissão de leitura na pasta do projeto."); return; }
      showError("");
      const notes = await listNotes(handle);
      if (!notes.length) listBox.append(el("p", "notes__empty", "Nenhuma nota ainda. Crie a primeira."));
      notes.forEach((n) => {
        const row = el("div", "note-item" + (n.file === selected ? " is-active" : ""));
        row.tabIndex = 0; row.setAttribute("role", "button");
        const txt = el("span", "note-item__text");
        txt.append(el("strong", null, n.title), el("small", null, new Date(n.updated).toLocaleString("pt-BR")));
        const del = el("button", "note-item__del", "🗑"); del.type = "button"; del.title = "Excluir nota";
        del.addEventListener("click", (e) => { e.stopPropagation(); removeNote(n); });
        row.append(el("span", null, "📄"), txt, del);
        const open = () => openNote(n.file);
        row.addEventListener("click", open);
        row.addEventListener("keydown", (e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); open(); } });
        listBox.append(row);
      });
    } catch (e) { showError("Não foi possível carregar as notas: " + e.message); }
  }

  // ---------- nova nota ----------
  function openCreate() {
    const dlg = el("dialog", "modal");
    const form = el("form", "modal__form");
    const close = el("button", "modal__close", "✕"); close.type = "button";
    const input = el("input", "modal__input"); input.id = "note-title"; input.placeholder = "Ex: Decisões de arquitetura"; input.autofocus = true;
    const label = el("label", null, "Título"); label.htmlFor = "note-title";
    const ok = el("button", "btn btn--primary", "Criar"); ok.type = "submit"; ok.disabled = true;
    const row = el("div", "modal__row"); row.append(ok);
    form.append(el("h2", "modal__title", "Nova nota"), label, input, row);
    dlg.append(close, form);
    document.body.append(dlg);
    input.addEventListener("input", () => { ok.disabled = !input.value.trim(); });
    const end = () => { dlg.close(); dlg.remove(); };
    close.addEventListener("click", end);
    dlg.addEventListener("cancel", (e) => { e.preventDefault(); end(); });
    dlg.addEventListener("click", (e) => { if (e.target === dlg) end(); });
    form.addEventListener("submit", async (e) => {
      e.preventDefault();
      const title = input.value.trim().slice(0, 200);
      if (!title) return;
      end();
      try {
        const handle = await getHandle();
        await canWrite(handle);
        const d = await dir(handle, true);
        const have = new Set(); for await (const x of d.values()) have.add(x.name);
        const slug = slugify(title); let file = slug + ".md", i = 2;
        while (have.has(file)) file = slug + "-" + i++ + ".md";
        const w = await (await d.getFileHandle(file, { create: true })).createWritable();
        await w.write("# " + title + "\n\n"); await w.close();
        if (window.Activity) Activity.log("note.created", { title });
        selected = file; await loadList(); openNote(file);
      } catch (err) { showError("Não foi possível criar a nota: " + err.message); }
    });
    dlg.showModal();
  }

  async function removeNote(n) {
    if (!confirm('Excluir a nota "' + n.title + '"?')) return;
    try {
      const handle = await getHandle(); await canWrite(handle);
      await (await dir(handle)).removeEntry(n.file);
      if (window.Activity) Activity.log("note.deleted", { title: n.title });
      if (selected === n.file) { selected = null; showPlaceholder(); }
      loadList();
    } catch (e) { showError("Não foi possível excluir: " + e.message); }
  }

  // ---------- editor ----------
  function showPlaceholder() {
    editorBox.replaceChildren(el("div", "notes__placeholder", "Selecione uma nota ou crie uma nova para começar a escrever."));
  }

  // Formatação da toolbar: devolve { value, start, end }
  function format(value, s, e, action) {
    const sel = value.slice(s, e);
    const wrap = (a, b, ph) => { const t = sel || ph; return { value: value.slice(0, s) + a + t + b + value.slice(e), start: s + a.length, end: s + a.length + t.length }; };
    const lineStart = value.lastIndexOf("\n", s - 1) + 1;
    const prefix = (p) => { const block = value.slice(lineStart, e); const out = block.split("\n").map((l, i) => (typeof p === "function" ? p(i) : p) + l).join("\n");
      return { value: value.slice(0, lineStart) + out + value.slice(e), start: lineStart, end: lineStart + out.length }; };
    const insert = (t) => ({ value: value.slice(0, s) + t + value.slice(e), start: s + t.length, end: s + t.length });
    switch (action) {
      case "h1": return prefix("# "); case "h2": return prefix("## "); case "h3": return prefix("### ");
      case "bold": return wrap("**", "**", "negrito"); case "italic": return wrap("*", "*", "itálico"); case "strike": return wrap("~~", "~~", "riscado");
      case "ul": return prefix("- "); case "ol": return prefix((i) => (i + 1) + ". "); case "task": return prefix("- [ ] "); case "quote": return prefix("> ");
      case "code": return wrap("`", "`", "código"); case "codeblock": return wrap("```\n", "\n```", "código");
      case "link": { const t = sel || "texto"; const r = value.slice(0, s) + "[" + t + "](url)" + value.slice(e); return { value: r, start: s + t.length + 3, end: s + t.length + 6 }; }
      case "table": return insert("\n| Coluna 1 | Coluna 2 |\n| --- | --- |\n|  |  |\n");
      case "hr": return insert("\n---\n");
    }
    return { value, start: s, end: e };
  }
  const TOOLS = [
    [["h1", "H1", "Título 1"], ["h2", "H2", "Título 2"], ["h3", "H3", "Título 3"]],
    [["bold", "B", "Negrito"], ["italic", "I", "Itálico"], ["strike", "S", "Riscado"]],
    [["ul", "•", "Lista"], ["ol", "1.", "Lista numerada"], ["task", "☑", "Lista de tarefas"], ["quote", "❝", "Citação"]],
    [["code", "</>", "Código em linha"], ["codeblock", "```", "Bloco de código"], ["link", "🔗", "Link"], ["table", "▦", "Tabela"], ["hr", "—", "Linha horizontal"]],
  ];

  async function openNote(file) {
    selected = file; showError("");
    listBox.querySelectorAll(".note-item").forEach((r) => r.classList.remove("is-active"));
    const handle = await getHandle();
    let saved = "";
    try { saved = await (await (await (await dir(handle)).getFileHandle(file)).getFile()).text(); }
    catch (e) { showError("Não foi possível abrir a nota: " + e.message); return; }
    loadList();

    let current = saved, tab = "editar";
    const path = DIR + "/" + file;
    const head = el("div", "note-editor__head");
    const titles = el("div", "note-editor__titles");
    const h = el("strong", null, titleOf(saved, file)); const sub = el("small", null, file);
    titles.append(h, sub);
    const actions = el("div", "note-editor__actions");
    const refresh = el("button", "btn", "Atualizar"); refresh.type = "button";
    const prompt = el("button", "btn", "Prompt"); prompt.type = "button";
    const save = el("button", "btn btn--primary", "Salvar"); save.type = "button"; save.disabled = true;
    actions.append(refresh, prompt, save);
    head.append(titles, actions);

    const bar = el("div", "note-editor__bar");
    const tabs = el("div", "note-tabs");
    const tEdit = el("button", "is-active", "Editar"), tView = el("button", null, "Visualizar");
    tEdit.type = tView.type = "button"; tabs.append(tEdit, tView);
    const tools = el("div", "md-tools");
    TOOLS.forEach((g) => { const grp = el("span", "md-tools__group");
      g.forEach(([a, label, title]) => { const b = el("button", "md-tools__btn", label); b.type = "button"; b.title = title; b.dataset.action = a; grp.append(b); });
      tools.append(grp); });
    bar.append(tabs, tools);

    const ta = el("textarea", "note-editor__text"); ta.value = current; ta.spellcheck = false;
    const view = el("div", "note-editor__view"); view.hidden = true;
    editorBox.replaceChildren(head, bar, ta, view);

    const dirty = () => current !== saved;
    const sync = () => { save.disabled = !dirty(); sub.textContent = file + (dirty() ? " · alterações não salvas" : ""); };
    ta.addEventListener("input", () => { current = ta.value; sync(); });
    ta.addEventListener("keydown", (e) => {
      if (e.key === "Tab" && !e.shiftKey) { e.preventDefault(); const s = ta.selectionStart;
        ta.setRangeText("  ", s, ta.selectionEnd, "end"); current = ta.value; sync(); }
    });
    tools.addEventListener("click", (e) => {
      const b = e.target.closest("[data-action]"); if (!b) return;
      const r = format(ta.value, ta.selectionStart, ta.selectionEnd, b.dataset.action);
      ta.value = r.value; current = r.value; ta.focus(); ta.setSelectionRange(r.start, r.end); sync();
    });
    const setTab = (t) => {
      tab = t; tEdit.classList.toggle("is-active", t === "editar"); tView.classList.toggle("is-active", t === "visualizar");
      ta.hidden = t !== "editar"; tools.hidden = t !== "editar"; view.hidden = t !== "visualizar";
      if (t === "visualizar") view.replaceChildren(window.renderMarkdown(current));
    };
    tEdit.addEventListener("click", () => setTab("editar"));
    tView.addEventListener("click", () => setTab("visualizar"));

    const doSave = async () => {
      if (!dirty()) return;
      save.disabled = true; save.textContent = "Salvando...";
      try {
        const hd = await getHandle(); await canWrite(hd);
        const w = await (await (await dir(hd)).getFileHandle(file)).createWritable();
        await w.write(current); await w.close();
        saved = current; h.textContent = titleOf(saved, file); loadList();
        if (window.Activity) Activity.log("note.saved", { title: titleOf(saved, file) });
      } catch (e) { showError("Erro ao salvar: " + e.message); }
      save.textContent = "Salvar"; sync();
    };
    save.addEventListener("click", doSave);
    editorBox.addEventListener("keydown", (e) => { if ((e.ctrlKey || e.metaKey) && e.key === "s") { e.preventDefault(); doSave(); } });
    refresh.addEventListener("click", () => openNote(file));
    prompt.addEventListener("click", async () => {
      try { await navigator.clipboard.writeText(PROMPT(path)); prompt.textContent = "Copiado!"; if (window.Activity) Activity.log("prompt.copied", { title: titleOf(saved, file) }); setTimeout(() => (prompt.textContent = "Prompt"), 2000); }
      catch (e) { showError("Não foi possível copiar o prompt."); }
    });
    setTab(tab);
  }

  $("[data-notes-new]").addEventListener("click", async () => {
    try { const h = await getHandle(); if (!h) return showError("Nenhuma pasta de projeto selecionada."); await canWrite(h); openCreate(); }
    catch (e) { showError(e.message); }
  });
  window.addEventListener("hashchange", () => { if (location.hash === "#/notes") loadList(); });
  showPlaceholder();
  if (location.hash === "#/notes") loadList();
})();
