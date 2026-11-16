// Seleção da pasta do projeto (File System Access API: Chrome/Edge).
// O navegador não revela o caminho completo, só o nome da pasta e o acesso ao conteúdo.
(function () {
  const PROJECT_KEY = "project";

  const $ = (sel) => document.querySelector(sel);
  const btnSelect = $("[data-project-select]");
  const btnClear = $("[data-project-clear]");
  const errorBox = $("[data-project-error]");
  const switcher = $("#project-switcher");
  const switcherLabel = $("[data-project-label]");
  const defaultLabel = switcherLabel.textContent;

  function read() { try { return JSON.parse(localStorage.getItem(PROJECT_KEY)); } catch (e) { return null; } }
  function write(v) { try { localStorage.setItem(PROJECT_KEY, JSON.stringify(v)); } catch (e) {} }
  function remove() { try { localStorage.removeItem(PROJECT_KEY); } catch (e) {} }

  // IndexedDB guarda o "handle" da pasta, para usos futuros (ler arquivos do projeto)
  function db() {
    return new Promise((resolve, reject) => {
      const req = indexedDB.open("aes", 1);
      req.onupgradeneeded = () => req.result.createObjectStore("handles");
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  }
  async function saveHandle(handle) {
    try {
      const d = await db();
      d.transaction("handles", "readwrite").objectStore("handles").put(handle, "project");
    } catch (e) {}
  }
  async function clearHandle() {
    try {
      const d = await db();
      d.transaction("handles", "readwrite").objectStore("handles").delete("project");
    } catch (e) {}
  }

  function showError(message) {
    errorBox.textContent = message;
    errorBox.hidden = !message;
  }

  function showProject(project) {
    $("[data-project-name]").textContent = project ? project.name : "No folder selected";
    $("[data-project-info]").textContent = project ? project.info : "Pick the root folder of your project";
    btnSelect.textContent = project ? "Change folder" : "Select project folder";
    btnClear.hidden = !project;
    switcherLabel.textContent = project ? project.name : defaultLabel;
  }

  // Lê o primeiro nível da pasta para dar um resumo
  async function describe(handle) {
    let items = 0, git = false;
    for await (const entry of handle.values()) {
      items++;
      if (entry.name === ".git") git = true;
    }
    return items + (items === 1 ? " item" : " items") + (git ? " · Git repository" : "");
  }

  async function selectFolder() {
    showError("");
    try {
      const handle = await window.showDirectoryPicker({ id: "aes-project", mode: "read" });
      const project = { name: handle.name, info: await describe(handle) };
      write(project);
      await saveHandle(handle);
      showProject(project);
      if (window.Activity) Activity.log("project.selected", { title: project.name, summary: project.info });
      // Avisa os outros módulos (ex.: onboarding confere se o projeto novo já tem Git/.aes)
      window.dispatchEvent(new CustomEvent("aes:project-changed", { detail: { project, handle } }));
    } catch (err) {
      if (err.name !== "AbortError") showError("Could not open the folder: " + err.message);
    }
  }

  // O botão em Preferences e o seletor de projeto da sidebar fazem a mesma coisa
  btnSelect.addEventListener("click", selectFolder);
  switcher.addEventListener("click", selectFolder);

  btnClear.addEventListener("click", () => {
    const prev = read();
    if (window.Activity) Activity.log("project.cleared", { title: prev && prev.name });
    remove(); clearHandle(); showProject(null); showError("");
    window.dispatchEvent(new CustomEvent("aes:project-changed", { detail: { project: null, handle: null } }));
  });

  if (!("showDirectoryPicker" in window)) {
    btnSelect.disabled = true;
    switcher.disabled = true;
    showError("Your browser does not support folder selection. Use Chrome or Edge.");
  }

  // Usado pela pasta central (js/home.js): ela vira a pasta de trabalho das outras telas.
  window.Project = {
    async set(handle, info) {
      const project = { name: handle.name, info: info || (await describe(handle)) };
      write(project); await saveHandle(handle); showProject(project); showError("");
      if (window.Activity) Activity.log("project.selected", { title: project.name, summary: project.info });
      window.dispatchEvent(new CustomEvent("aes:project-changed", { detail: { project, handle } }));
    },
  };

  showProject(read());
})();
