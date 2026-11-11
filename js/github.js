// Conexão com o GitHub usando um Personal Access Token (sem servidor).
// O token e o perfil ficam só no localStorage deste navegador.
(function () {
  const TOKEN_KEY = "github-token";
  const USER_KEY = "github-user";

  const $ = (sel) => document.querySelector(sel);
  const form = $("#gh-form");
  const input = $("#gh-token");
  const errorBox = form.querySelector(".gh-error");
  const btnChange = $("[data-gh-change]");
  const btnDisconnect = $("[data-gh-disconnect]");

  // Valores originais da sidebar, para voltar ao desconectar
  const sidebar = {
    avatar: $("[data-user-avatar]"), name: $("[data-user-name]"), handle: $("[data-user-handle]"),
  };
  const defaults = {
    avatar: sidebar.avatar.textContent, name: sidebar.name.textContent, handle: sidebar.handle.textContent,
  };

  function read(key) { try { return localStorage.getItem(key); } catch (e) { return null; } }
  function write(key, value) { try { localStorage.setItem(key, value); } catch (e) {} }
  function remove(key) { try { localStorage.removeItem(key); } catch (e) {} }

  function setAvatar(el, url, fallback) {
    el.replaceChildren();
    if (url) {
      const img = document.createElement("img");
      img.src = url; img.alt = "";
      el.append(img);
    } else {
      el.textContent = fallback;
    }
  }

  function showUser(user) {
    const name = user ? user.name || user.login : "Not connected";
    const login = user ? "@" + user.login : "Add a personal access token to connect";

    $("[data-gh-name]").textContent = name;
    $("[data-gh-login]").textContent = login;
    setAvatar($("[data-gh-avatar]"), user && user.avatar_url, "?");
    btnChange.textContent = user ? "Change" : "Connect";
    btnDisconnect.hidden = !user;

    // Atualiza também o usuário no rodapé da sidebar
    sidebar.name.textContent = user ? name : defaults.name;
    sidebar.handle.textContent = user ? login : defaults.handle;
    setAvatar(sidebar.avatar, user && user.avatar_url, defaults.avatar);
  }

  async function fetchUser(token) {
    const res = await fetch("https://api.github.com/user", {
      headers: { Authorization: "Bearer " + token, Accept: "application/vnd.github+json" },
    });
    if (res.status === 401) throw new Error("Invalid token. Check it and try again.");
    if (!res.ok) throw new Error("GitHub returned an error (" + res.status + ").");
    return res.json();
  }

  function showError(message) {
    errorBox.textContent = message;
    errorBox.hidden = !message;
  }

  btnChange.addEventListener("click", () => {
    form.hidden = !form.hidden;
    showError("");
    if (!form.hidden) input.focus();
  });

  form.querySelector("[data-gh-cancel]").addEventListener("click", () => {
    form.hidden = true; input.value = ""; showError("");
  });

  btnDisconnect.addEventListener("click", () => {
    remove(TOKEN_KEY); remove(USER_KEY);
    showUser(null);
    if (window.Activity) Activity.log("github.disconnected");
  });

  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    const token = input.value.trim();
    if (!token) return showError("Paste your token first.");

    const submit = form.querySelector("[type=submit]");
    submit.disabled = true; showError("");
    try {
      const user = await fetchUser(token);
      const profile = { login: user.login, name: user.name, avatar_url: user.avatar_url };
      write(TOKEN_KEY, token); write(USER_KEY, JSON.stringify(profile));
      showUser(profile);
      form.hidden = true; input.value = "";
      if (window.Activity) Activity.log("github.connected", { title: "@" + profile.login });
    } catch (err) {
      if (window.Activity) Activity.log("github.error", { summary: err.message });
      showError(err instanceof TypeError ? "Could not reach GitHub. Check your connection." : err.message);
    } finally {
      submit.disabled = false;
    }
  });

  // Ao abrir a página: mostra o perfil salvo e confirma que o token ainda vale
  (function init() {
    const cached = read(USER_KEY);
    if (cached) { try { showUser(JSON.parse(cached)); } catch (e) {} }

    const token = read(TOKEN_KEY);
    if (!token) return;
    fetchUser(token)
      .then((user) => {
        const profile = { login: user.login, name: user.name, avatar_url: user.avatar_url };
        write(USER_KEY, JSON.stringify(profile));
        showUser(profile);
      })
      .catch((err) => {
        if (/Invalid token/.test(err.message)) { remove(TOKEN_KEY); remove(USER_KEY); showUser(null); }
      });
  })();
})();
