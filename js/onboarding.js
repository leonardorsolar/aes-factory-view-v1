// Onboarding: boas-vindas + passos de configuração (Git, .gitignore, GitHub CLI, publicar no GitHub)
// + mensagem final. Abre quando o projeto selecionado ainda não está configurado (sem .git, .gitignore
// ou .aes) — inclusive ao trocar para um projeto novo. "Já vi" é guardado POR PROJETO no navegador.
(function () {
  const SEEN_KEY = "onboarding-seen"; // sem projeto selecionado (1º acesso); com projeto: SEEN_KEY + ":" + nome

  function projectName() { try { const p = JSON.parse(localStorage.getItem("project")); return p && p.name; } catch (e) { return null; } }
  function seenKey() { const n = projectName(); return n ? SEEN_KEY + ":" + n : SEEN_KEY; }
  function isSeen() { try { return localStorage.getItem(seenKey()) === "1"; } catch (e) { return false; } }
  function markSeen() { try { localStorage.setItem(seenKey(), "1"); } catch (e) {} }

  // O que a pasta do projeto já tem. null = não deu para ler (sem permissão).
  let status = null;
  async function inspect(handle) {
    const found = { git: false, gitignore: false, aes: false };
    for await (const entry of handle.values()) {
      if (entry.name === ".git") found.git = true;
      if (entry.name === ".gitignore") found.gitignore = true;
      if (entry.name === ".aes") found.aes = true;
    }
    return found;
  }
  const needsSetup = (s) => !s.git || !s.gitignore || !s.aes;

  const code = (t) => "<code>" + t + "</code>";

  // Cada passo é um dado: para adicionar outro, basta incluir mais um item aqui.
  const STEPS = [
    {
      icon: "i-branch",
      title: "Inicializar repositório Git",
      desc: "O primeiro passo é ter um repositório Git nesta pasta. Rode o comando abaixo no terminal, na raiz do projeto.",
      commands: [{ label: "Inicializar repositório Git", command: "git init" }],
      prompts: [{ text: "Verifique se este projeto já possui um repositório Git inicializado. Se não tiver, inicialize um repositório Git na raiz deste projeto (git init), sem alterar ou remover nenhum arquivo existente. Ao final, confirme que o repositório foi criado corretamente e mostre o status atual (git status)." }],
    },
    {
      icon: "i-file",
      title: "Criar arquivo .gitignore",
      desc: "Evite versionar arquivos locais de configuração. Rode o comando abaixo.",
      commands: [{ label: "Criar arquivo .gitignore", command: "echo '# Arquivo .gitignore' > .gitignore" }],
      note: "Adicione no .gitignore as pastas que não devem ir pro repositório, por exemplo: " + code("node_modules") + " e arquivos " + code(".env") + ".",
      prompts: [{ text: "Verifique se este projeto já possui um arquivo .gitignore. Se não tiver, crie um .gitignore adequado à tecnologia do projeto, garantindo que secrets, arquivos .env, dependências, builds e arquivos temporários não sejam versionados — inclua também as pastas .aes e .claude. Se já existir um .gitignore, apenas complete o que estiver faltando, sem remover entradas existentes." }],
    },
    {
      icon: "i-github",
      title: "Instalar o GitHub CLI",
      desc: "Verifique se o GitHub CLI (gh) já está instalado e funcionando antes de conectar ao repositório remoto.",
      commands: [
        { label: "Verificar se o GitHub CLI já está instalado", command: "gh --version" },
        { label: "Verificar autenticação no GitHub", command: "gh auth status" },
      ],
      note: "Se o " + code("gh") + " já estiver instalado e funcionando, não reinstale — só confirme a versão acima. Se não estiver, instale pelo gerenciador de pacotes do seu sistema operacional e rode " + code("gh auth status") + " para confirmar a autenticação.",
      prompts: [{ text: "Verifique se o GitHub CLI (gh) já está instalado e funcionando corretamente nesta máquina. Primeiro execute uma verificação da instalação e da versão disponível (gh --version). Se o gh já estiver instalado e funcionando, não reinstale; apenas confirme a versão e o estado da instalação. Se não estiver instalado, identifique o sistema operacional e utilize o gerenciador de pacotes apropriado para instalar o GitHub CLI. Após a instalação, verifique novamente se o comando gh está disponível no PATH, confirme a versão instalada e execute uma verificação básica de funcionamento. Se a instalação ou configuração exigir autenticação no GitHub, informe o usuário e, quando possível, execute gh auth status para verificar o estado da autenticação. Não invente credenciais, não altere configurações desnecessárias e não prossiga enquanto a instalação não tiver sido validada. Ao final, informe claramente se o GitHub CLI já estava instalado ou foi instalado, qual versão está disponível, se o comando está funcionando e se a autenticação do GitHub está configurada." }],
    },
    {
      icon: "i-upload",
      title: "Subir um projeto para o GitHub",
      desc: "Revise o que vai ser commitado, confirme o commit inicial e publique o repositório no GitHub.",
      commands: [
        { label: "Revisar o que será commitado", command: "git status" },
        { label: "Commit inicial", command: 'git add -A && git commit -m "chore: initial project setup"' },
        { label: "Verificar se já existe um remote", command: "git remote -v" },
        { label: "Criar o repositório no GitHub (com o gh)", command: "gh repo create" },
        { label: "Publicar a branch principal", command: "git push -u origin main" },
      ],
      note: "Confira o " + code("git status") + " antes de commitar para garantir que nenhum secret ou arquivo indevido entre no repositório. Se já existir um remote configurado, pule o " + code("gh repo create") + " e vá direto pro push. Evite " + code("--force") + " e não mergeie automaticamente.",
      prompts: [
        { title: "Nível 1 — Subir um projeto para o GitHub", text: "Suba este projeto para o GitHub. Primeiro, rode git status para revisar o que será enviado. Verifique se o projeto já possui um remote GitHub configurado (git remote -v); se possuir, apenas confirme que está correto e siga direto para o push. Se não possuir, verifique se o GitHub CLI (gh) está instalado e autenticado (gh --version e gh auth status); se não estiver instalado ou autenticado, pare e oriente o usuário a instalar/autenticar antes de continuar, sem inventar credenciais. Com o gh disponível, use-o para criar o repositório remoto (gh repo create), perguntando ao usuário apenas o nome do repositório e se deve ser público ou privado, sem inventar URLs manualmente. Depois de criar ou confirmar o remote, publique o projeto com git push -u origin <branch> na branch principal. Não faça force push e não faça merge automaticamente. Ao final, informe se o repositório já existia ou foi criado, qual é o remote configurado e se o push foi concluído com sucesso." },
        { title: "Nível 2 — Repositório GitHub Básico - Setup do Repositório: Git + .gitignore + README + GitHub", text: "Prepare este projeto para ser versionado e publicado no GitHub de forma profissional e mínima. Antes de qualquer alteração, verifique o que já existe no projeto, incluindo Git, .gitignore, README.md, branches, remote e arquivos que não devem ser versionados. Não recrie, substitua ou remova configurações existentes sem necessidade. Inicialize o Git somente se ainda não estiver inicializado. Crie ou ajuste o .gitignore de acordo com a tecnologia do projeto, garantindo que secrets, .env, dependências, builds e arquivos temporários não sejam versionados. Crie ou ajuste um README.md com descrição, tecnologias, pré-requisitos, instalação, execução e testes, aproveitando o conteúdo existente. Revise o git status e o diff antes do commit, garantindo que nenhum secret ou arquivo indevido será incluído. Faça o commit inicial apenas quando apropriado, usando uma mensagem como \"chore: initial project setup\". Verifique se o projeto já possui um remote GitHub configurado (git remote -v); se possuir, apenas confirme que ele está correto e siga para o push. Se não possuir, verifique se o GitHub CLI (gh) está instalado e autenticado (gh --version e gh auth status); se não estiver instalado ou autenticado, pare e oriente o usuário a instalar/autenticar antes de continuar, sem inventar credenciais. Com o gh disponível, use-o para criar o repositório remoto (gh repo create), perguntando ao usuário apenas o nome do repositório e se deve ser público ou privado, sem inventar URLs manualmente. Depois de criar ou confirmar o remote, publique o projeto com git push -u origin <branch> na branch principal. Não altere o código da aplicação sem necessidade, não faça force push e não faça merge automaticamente. Ao final, informe o que já existia, o que foi criado ou alterado, o estado do Git, o remote, o commit realizado, se o push foi feito com sucesso e qualquer ação que ainda dependa do usuário." },
      ],
    },
  ];

  // Índice -1 = boas-vindas; 0..N-1 = passos; N = mensagem final
  const LAST = STEPS.length;
  let index = -1;
  let tab = "manual";
  let root, dialog;

  function el(tag, cls, html) {
    const e = document.createElement(tag);
    if (cls) e.className = cls;
    if (html != null) e.innerHTML = html;
    return e;
  }
  function icon(id, size) {
    return '<svg class="icon" width="' + size + '" height="' + size + '"><use href="#' + id + '"/></svg>';
  }
  function textEl(tag, cls, text) { const e = el(tag, cls); e.textContent = text; return e; }

  function copyButton(text) {
    const b = el("button", "ob__copy", icon("i-copy", 14) + "<span>Copiar</span>");
    b.type = "button";
    b.addEventListener("click", async () => {
      try {
        await navigator.clipboard.writeText(text);
        b.lastChild.textContent = "Copiado";
        setTimeout(() => { b.lastChild.textContent = "Copiar"; }, 1500);
      } catch (e) { /* sem clipboard: o texto continua visível para copiar à mão */ }
    });
    return b;
  }

  function header(iconId, title, descHtml) {
    const h = el("div", "ob__head");
    const row = el("div", "ob__title-row");
    row.append(el("div", "ob__icon", icon(iconId, 24)), textEl("h2", "ob__title", title));
    h.append(row, el("p", "ob__desc", descHtml));
    h.firstChild.firstChild.nextSibling.id = "ob-title";
    return h;
  }

  function welcome() {
    let desc;
    if (status) {
      const missing = [];
      if (!status.git) missing.push("um repositório Git");
      if (!status.gitignore) missing.push("um arquivo " + code(".gitignore"));
      if (!status.aes) missing.push("a configuração da fábrica (" + code(".aes") + ")");
      const name = projectName() ? "<b>" + projectName().replace(/[<>&]/g, "") + "</b>" : "Seu projeto";
      desc = missing.length
        ? name + " ainda não tem " + missing.join(", ").replace(/, ([^,]*)$/, " nem $1") + ". Vamos fazer as configurações básicas antes de começar."
        : name + " já está configurado. Você pode revisar os passos abaixo quando quiser.";
    } else {
      desc = "Vamos conferir as configurações básicas do seu projeto (Git, " + code(".gitignore") + ", GitHub CLI e GitHub) antes de começar.";
    }
    const head = header("i-sparkles", "Bem-vindo à AI Soft Factory", desc);
    const col = (dot, name, inner) =>
      '<div class="ob__col"><div class="ob__col-head"><span class="ob__dot ' + dot + '"></span>' + name + '</div><div class="ob__col-body">' + inner + "</div></div>";
    const board = el("div", "ob__board",
      col("", "To do",
        '<div class="ob__ticket ob__ticket--a"><small>ENG-124</small>Add repository search</div>' +
        '<div class="ob__ticket ob__ticket--b"><small>ENG-125</small>Improve setup flow</div>') +
      col("ob__dot--green", "In progress", "") + col("ob__dot--blue", "Deployed", ""));
    board.setAttribute("aria-hidden", "true");
    const body = el("div", "ob__body ob__body--center");
    body.append(board);

    const check = el("label", "ob__check", '<input type="checkbox" id="ob-never" /> Não mostrar novamente para estas informações');
    const foot = el("div", "ob__foot");
    foot.append(button("Agora não", "ob__btn ob__btn--ghost", () => close(document.getElementById("ob-never").checked)),
      button("Configurar agora", "ob__btn ob__btn--primary", () => go(0)));
    return [head, body, check, foot];
  }

  function stepView(step) {
    const head = header(step.icon, step.title, step.desc);
    const body = el("div", "ob__body");

    const tabs = el("div", "ob__tabs");
    ["manual", "prompt"].forEach((t) => {
      const b = button(t === "manual" ? "Manual" : "Prompt", "ob__tab" + (tab === t ? " is-active" : ""), () => { tab = t; render(); });
      tabs.append(b);
    });
    body.append(tabs);

    if (tab === "prompt") {
      step.prompts.forEach((p) => {
        const blk = el("div", "ob__block");
        if (p.title) blk.append(textEl("div", "ob__block-title", p.title));
        const row = el("div", "ob__block-row");
        row.append(textEl("span", "ob__block-label", "Prompt para o agente de IA"), copyButton(p.text));
        blk.append(row, textEl("p", "ob__prompt", p.text));
        body.append(blk);
      });
    } else {
      body.append(el("div", "ob__hint", icon("i-terminal", 16) + "Comandos sugeridos para essa etapa"));
      step.commands.forEach((c) => {
        const blk = el("div", "ob__block");
        const row = el("div", "ob__block-row");
        row.append(textEl("code", "ob__cmd", c.command), copyButton(c.command));
        blk.append(textEl("div", "ob__block-label", c.label), row);
        body.append(blk);
      });
      if (step.note) body.append(el("p", "ob__note", step.note));
    }

    const foot = el("div", "ob__foot");
    foot.append(button("Voltar", "ob__btn", () => go(index - 1)), button("Próximo", "ob__btn ob__btn--primary", () => go(index + 1)));
    return [head, body, foot];
  }

  // Mensagem geral final, com botão de fechar (no lugar do download de config das skills)
  function finish() {
    const head = header("i-check", "Tudo pronto!", "Você concluiu as configurações básicas.");
    const body = el("div", "ob__body ob__body--center");
    body.append(el("div", "ob__done",
      "<strong>Sua fábrica está quase pronta para começar.</strong>" +
      "<p>Selecione a pasta do seu projeto, conecte sua conta do GitHub, baixe as skills e agentes no menu lateral e comece a criar tarefas. " +
      "Você pode rever estas instruções quando quiser.</p>"));
    const foot = el("div", "ob__foot");
    foot.append(
      button("Voltar", "ob__btn", () => go(index - 1)),
      button("Baixar skills e agentes", "ob__btn", () => {
        // reaproveita o botão da sidebar (js/scan.js); o clique do usuário mantém a permissão de escrita
        const b = document.querySelector("[data-skills-install-all]");
        if (b && !b.disabled) b.click();
        else alert("Selecione a pasta do projeto primeiro.");
      }),
      button("Fechar", "ob__btn ob__btn--primary", () => close(true)));
    return [head, body, foot];
  }

  function button(label, cls, onClick) {
    const b = el("button", cls);
    b.type = "button";
    b.textContent = label;
    b.addEventListener("click", onClick);
    return b;
  }

  function go(i) { index = i; tab = "manual"; render(); }

  function render() {
    const parts = index < 0 ? welcome() : index >= LAST ? finish() : stepView(STEPS[index]);
    const closeBtn = el("button", "ob__close", icon("i-x", 16));
    closeBtn.type = "button";
    closeBtn.setAttribute("aria-label", "Fechar");
    closeBtn.addEventListener("click", () => close(index >= LAST));
    dialog.replaceChildren(closeBtn, ...parts);
    const first = dialog.querySelector(".ob__btn--primary");
    if (first) first.focus();
  }

  // remember = true grava que o onboarding já foi visto (não abre mais sozinho)
  function close(remember) {
    if (remember) { markSeen(); if (window.Activity) Activity.log("onboarding.finished"); }
    root.hidden = true;
    document.removeEventListener("keydown", onKey);
  }
  function onKey(e) { if (e.key === "Escape") close(index >= LAST); }

  function open() {
    index = -1;
    root.hidden = false;
    document.addEventListener("keydown", onKey);
    render();
  }

  root = el("div", "ob");
  root.hidden = true;
  dialog = el("div", "ob__dialog");
  dialog.setAttribute("role", "dialog");
  dialog.setAttribute("aria-modal", "true");
  dialog.setAttribute("aria-labelledby", "ob-title");
  root.append(dialog);
  root.addEventListener("mousedown", (e) => { if (e.target === root) close(index >= LAST); });
  document.body.append(root);

  window.openOnboarding = open; // reabrir manualmente (ex.: pelo console)

  // Decide se abre sozinho para o projeto atual.
  async function check(handle) {
    status = null;
    if (!projectName()) { if (!isSeen()) open(); return; } // sem projeto: 1º acesso, como antes
    if (isSeen()) return;
    try {
      if (handle && (await handle.queryPermission({ mode: "read" })) === "granted") status = await inspect(handle);
    } catch (e) { status = null; }
    if (status) { if (needsSetup(status)) open(); return; }
    // Sem permissão de leitura agora (ex.: recarregou a página): usa o resumo salvo na seleção.
    let info = "";
    try { info = JSON.parse(localStorage.getItem("project")).info || ""; } catch (e) {}
    if (!/Git repository/.test(info)) open();
  }

  function storedHandle() {
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

  // Trocou de projeto: um projeto novo ainda não configurado mostra o onboarding de novo.
  window.addEventListener("aes:project-changed", (e) => {
    const d = e.detail || {};
    if (!d.project) return;
    if (!root.hidden) { root.hidden = true; document.removeEventListener("keydown", onKey); }
    check(d.handle);
  });

  storedHandle().then(check);
})();
