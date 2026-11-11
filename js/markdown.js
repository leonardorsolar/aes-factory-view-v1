// Renderizador de Markdown mínimo (sem dependências, funciona em file://).
// Uso: window.renderMarkdown(texto) -> HTMLElement (<div class="md">).
// Suporta: títulos, parágrafos, negrito/itálico, `código`, blocos ```, tabelas, listas, citações,
// links, <hr>, <details>/<summary> e blocos ```mermaid (carregados sob demanda do CDN).
// Todo HTML é escapado, exceto as tags permitidas: details, summary, code, br.
(function () {
  const esc = (s) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

  function inline(text) {
    const codes = [];
    // 1. protege `código`
    text = text.replace(/`([^`]+)`/g, (_, c) => { codes.push(c); return "\u0000" + (codes.length - 1) + "\u0000"; });
    text = esc(text);
    // 2. libera só as tags permitidas
    text = text.replace(/&lt;(\/?)(details|summary|code)&gt;/g, "<$1$2>").replace(/&lt;br\s*\/?&gt;/g, "<br>");
    // 3. links (só http(s), mailto, âncoras e caminhos relativos), negrito, itálico
    text = text.replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, (m, label, url) =>
      /^(https?:|mailto:|#|\.{0,2}\/|[\w.-]+(\/|$))/i.test(url) && !/^javascript:/i.test(url)
        ? '<a href="' + url + '" target="_blank" rel="noopener">' + label + "</a>" : m);
    text = text.replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>").replace(/(^|[\s(])\*([^*\s][^*]*)\*/g, "$1<em>$2</em>");
    // 4. devolve os códigos
    return text.replace(/\u0000(\d+)\u0000/g, (_, i) => "<code>" + esc(codes[i]) + "</code>");
  }

  const isTableSep = (l) => /^\s*\|?\s*:?-{2,}:?\s*(\|\s*:?-{2,}:?\s*)*\|?\s*$/.test(l) && l.includes("-") && l.includes("|");
  const cells = (l) => l.trim().replace(/^\|/, "").replace(/\|$/, "").split("|").map((c) => c.trim());
  const isBlockStart = (l) => /^(#{1,6}\s|```|>\s?|\s*([-*]|\d+\.)\s|\s*<\/?(details|summary)|-{3,}\s*$)/.test(l);

  function toHtml(src) {
    const lines = src.replace(/\r\n?/g, "\n").split("\n");
    const out = [];
    let i = 0;
    while (i < lines.length) {
      const line = lines[i];
      const t = line.trim();
      if (!t) { i++; continue; }

      // bloco de código
      const fence = t.match(/^```\s*([\w-]*)/);
      if (fence) {
        const buf = []; i++;
        while (i < lines.length && !lines[i].trim().startsWith("```")) buf.push(lines[i++]);
        i++;
        const code = buf.join("\n");
        out.push(fence[1] === "mermaid"
          ? '<pre class="md__mermaid">' + esc(code) + "</pre>"
          : "<pre><code>" + esc(code) + "</code></pre>");
        continue;
      }

      // título
      const h = t.match(/^(#{1,6})\s+(.*)$/);
      if (h) { out.push("<h" + h[1].length + ">" + inline(h[2]) + "</h" + h[1].length + ">"); i++; continue; }

      // linha horizontal
      if (/^-{3,}$/.test(t)) { out.push("<hr>"); i++; continue; }

      // tabela
      if (t.includes("|") && i + 1 < lines.length && isTableSep(lines[i + 1])) {
        const head = cells(line); i += 2;
        let html = "<table><thead><tr>" + head.map((c) => "<th>" + inline(c) + "</th>").join("") + "</tr></thead><tbody>";
        while (i < lines.length && lines[i].trim() && lines[i].includes("|")) {
          html += "<tr>" + cells(lines[i]).map((c) => "<td>" + inline(c) + "</td>").join("") + "</tr>"; i++;
        }
        out.push(html + "</tbody></table>");
        continue;
      }

      // citação
      if (/^>\s?/.test(t)) {
        const buf = [];
        while (i < lines.length && /^\s*>\s?/.test(lines[i])) buf.push(lines[i++].replace(/^\s*>\s?/, ""));
        out.push("<blockquote>" + inline(buf.join(" ")) + "</blockquote>");
        continue;
      }

      // lista (um nível; itens recuados entram na mesma lista)
      const li = line.match(/^\s*([-*]|\d+\.)\s+(.*)$/);
      if (li) {
        const ordered = /\d/.test(li[1]);
        const items = [];
        while (i < lines.length) {
          const m = lines[i].match(/^\s*([-*]|\d+\.)\s+(.*)$/);
          if (m) { items.push(m[2]); i++; }
          else if (lines[i].trim() && /^\s{2,}\S/.test(lines[i]) && !lines[i].trim().startsWith("```")) items[items.length - 1] += " " + lines[i++].trim();
          else break;
        }
        const tag = ordered ? "ol" : "ul";
        out.push("<" + tag + ">" + items.map((x) => "<li>" + inline(x) + "</li>").join("") + "</" + tag + ">");
        continue;
      }

      // <details>/<summary> em linha própria: passa pelo filtro de tags permitidas
      if (/^<\/?(details|summary)/.test(t)) { out.push(inline(t)); i++; continue; }

      // parágrafo
      const buf = [];
      while (i < lines.length && lines[i].trim() && !isBlockStart(lines[i]) && !(lines[i].includes("|") && isTableSep(lines[i + 1] || ""))) buf.push(lines[i++].trim());
      if (!buf.length) { buf.push(lines[i++].trim()); }
      out.push("<p>" + inline(buf.join(" ")) + "</p>");
    }
    return out.join("\n");
  }

  // ---- Mermaid (opcional, carregado só se houver diagrama) ----
  let mermaidLoad = null;
  function loadMermaid() {
    if (window.mermaid) return Promise.resolve(window.mermaid);
    if (!mermaidLoad) {
      mermaidLoad = new Promise((resolve, reject) => {
        const s = document.createElement("script");
        s.src = "https://cdn.jsdelivr.net/npm/mermaid@11.4.0/dist/mermaid.min.js";
        s.onload = () => resolve(window.mermaid);
        s.onerror = () => { mermaidLoad = null; reject(new Error("mermaid indisponível")); };
        document.head.append(s);
      });
    }
    return mermaidLoad;
  }
  const isDark = () => {
    const t = document.documentElement.getAttribute("data-theme");
    return t === "dark" || (!t && window.matchMedia("(prefers-color-scheme: dark)").matches);
  };
  let seq = 0;
  async function drawDiagrams(root) {
    const nodes = root.querySelectorAll(".md__mermaid");
    if (!nodes.length) return;
    try {
      const mermaid = await loadMermaid();
      mermaid.initialize({ startOnLoad: false, securityLevel: "strict", theme: isDark() ? "dark" : "default" });
      for (const n of nodes) {
        const code = n.textContent;
        try {
          const { svg } = await mermaid.render("md-mermaid-" + ++seq, code);
          n.innerHTML = svg;
          n.classList.add("is-rendered");
        } catch (e) { n.title = "Diagrama inválido: " + e.message; } // mantém o código visível
      }
    } catch (e) { /* sem rede: o código do diagrama continua visível */ }
  }

  window.renderMarkdown = function (text) {
    const box = document.createElement("div");
    box.className = "md";
    box.innerHTML = toHtml(text);
    drawDiagrams(box);
    return box;
  };
})();
