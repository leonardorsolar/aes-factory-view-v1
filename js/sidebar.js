// Comportamento da sidebar: recolher o menu e abrir/fechar grupos.
(function () {
  const app = document.getElementById("app");
  const btnCollapse = document.getElementById("btn-collapse");

  // Recolher / expandir (lembra a escolha)
  btnCollapse.addEventListener("click", () => {
    const collapsed = app.classList.toggle("is-collapsed");
    try { localStorage.setItem("sidebar-collapsed", collapsed); } catch (e) {}
  });

  try {
    if (localStorage.getItem("sidebar-collapsed") === "true") app.classList.add("is-collapsed");
  } catch (e) {}

  // Grupos expansíveis (ex.: Work)
  document.querySelectorAll("[data-toggle]").forEach((button) => {
    button.addEventListener("click", () => {
      const group = button.closest(".nav__group");
      const open = group.classList.toggle("is-open");
      button.setAttribute("aria-expanded", open);
    });
  });
})();
