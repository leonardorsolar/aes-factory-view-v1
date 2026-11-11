// Tema: "system" (segue o sistema), "light" ou "dark". A escolha fica salva no navegador.
(function () {
  const root = document.documentElement;

  function applyTheme(theme) {
    if (theme === "light" || theme === "dark") root.setAttribute("data-theme", theme);
    else root.removeAttribute("data-theme"); // system: o CSS usa prefers-color-scheme
  }

  let saved = "system";
  try { saved = localStorage.getItem("theme") || "system"; } catch (e) {}
  applyTheme(saved);

  // Botões da página Preferences (o script roda no <head>, então espera o HTML carregar)
  document.addEventListener("DOMContentLoaded", () => {
    const buttons = document.querySelectorAll("[data-theme-option]");

    function mark(theme) {
      buttons.forEach((b) => {
        const on = b.dataset.themeOption === theme;
        b.classList.toggle("is-active", on);
        b.setAttribute("aria-pressed", on);
      });
    }

    buttons.forEach((b) =>
      b.addEventListener("click", () => {
        const theme = b.dataset.themeOption;
        applyTheme(theme);
        mark(theme);
        try { localStorage.setItem("theme", theme); } catch (e) {}
      })
    );

    mark(saved);
  });
})();
