// Navegação entre páginas: mostra a <section data-page> que combina com o #hash da URL.
(function () {
  const pages = document.querySelectorAll("[data-page]");
  const links = document.querySelectorAll("[data-link]");

  function showPage() {
    const route = location.hash.replace("#", "") || "/";
    const page = document.querySelector(`[data-page="${route}"]`);

    // Mostra só a página atual
    pages.forEach((p) => { p.hidden = p !== page; });
    document.title = (page ? page.dataset.title : "Página não encontrada") + " · AI Soft Factory";

    // Marca o link ativo no menu
    links.forEach((link) => {
      const active = link.getAttribute("href") === "#" + route;
      link.classList.toggle("is-active", active);
      if (active) link.setAttribute("aria-current", "page");
      else link.removeAttribute("aria-current");

      // Se o link ativo está dentro de um grupo, deixa o grupo aberto
      const group = link.closest(".nav__group");
      if (active && group) {
        group.classList.add("is-open");
        group.querySelector("[data-toggle]").setAttribute("aria-expanded", "true");
      }
    });
  }

  window.addEventListener("hashchange", showPage);
  showPage();
})();

// Abas da página Pipeline: Construction (ciclos) e Pipeline (vazia por enquanto).
(() => {
  const tabs = document.querySelectorAll("[data-pipe-tab]");
  tabs.forEach((b) => b.addEventListener("click", () => {
    tabs.forEach((t) => t.classList.toggle("is-active", t === b));
    document.querySelectorAll("[data-pipe-panel]").forEach((p) => { p.hidden = p.dataset.pipePanel !== b.dataset.pipeTab; });
  }));
})();
