#!/usr/bin/env node
// Hook do Claude Code: registra o que a sessão faz no feed da página Activity (.aes/activity.json).
// Uso (em .claude/settings.json):  node scripts/activity-hook.mjs <SessionStart|UserPromptSubmit|PostToolUse|SubagentStop|Stop>
// Lê o JSON do hook no stdin. Nunca falha nem imprime nada: um hook com erro não pode atrapalhar a sessão.
import { execFileSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { dirname, join, relative, isAbsolute } from "node:path";

const MAX = 500;          // mesmo limite de js/activity.js
const DEDUPE_MS = 60_000; // mesma edição de arquivo em menos de 1 min não vira outro evento
const ACTOR = "Claude";

function readStdin() {
  try { return JSON.parse(readFileSync(0, "utf8") || "{}"); } catch { return {}; }
}

function shorten(text, n = 140) {
  const t = String(text || "").replace(/\s+/g, " ").trim();
  return t.length > n ? t.slice(0, n - 1) + "…" : t;
}

// Última resposta do assistente no transcript (JSONL), para usar de resumo no "Stop".
function lastAssistantText(transcriptPath) {
  try {
    const lines = readFileSync(transcriptPath, "utf8").trim().split("\n");
    for (let i = lines.length - 1; i >= 0; i--) {
      const row = JSON.parse(lines[i]);
      const msg = row.message;
      if (row.type !== "assistant" || !msg || !Array.isArray(msg.content)) continue;
      const text = msg.content.filter((c) => c.type === "text").map((c) => c.text).join(" ");
      if (text.trim()) return shorten(text);
    }
  } catch { /* sem resumo */ }
  return undefined;
}

// "issue 1" vence "#2" (o prompt do merge cita o PR #2); "#N" sozinho só se não houver "issue N"
function issueOf(text) {
  const m = text.match(/\bissue\s*#?\s*(\d+)/i) || text.match(/#(\d+)/);
  return m ? Number(m[1]) : 0;
}
function stepStarted(agent, text, summary) {
  const issue = issueOf(text);
  if (!issue) return null;
  const app = (text.match(/\bapp=([\w.-]+)/) || [])[1]; // pasta central: "app=<app>"
  return { action: "factory.step_started", title: (app ? app + " " : "") + "#" + issue + " · @" + agent, summary, extra: app ? { agent, issue, app } : { agent, issue } };
}

function buildEvent(kind, input, root) {
  if (kind === "SessionStart") {
    return { action: "claude.session_started", title: input.source || "", summary: undefined };
  }
  if (kind === "UserPromptSubmit") {
    // "@intake triar a issue 3": marca a etapa como rodando antes de qualquer arquivo existir
    const prompt = String(input.prompt || "");
    // relatório de subagente devolvido à sessão também chega como "prompt": não é pedido do usuário
    if (/^\s*<agent-message\b|\[Subagent hand-back\]/.test(prompt)) return null;
    // só conta pedido que COMEÇA com @agente, e o agente precisa existir em .claude/agents/
    const agent = (prompt.match(/^\s*@([\w-]+)/) || [])[1];
    if (agent && !existsSync(join(root, ".claude", "agents", agent + ".md"))) return null;
    if (!agent) return null;
    return stepStarted(agent, prompt, shorten(prompt));
  }
  if (kind === "PreToolUse") {
    // a sessão iniciou um subagente sozinha (ex.: depois de "pode fazer"): também é início de etapa
    const tool = input.tool_name, ti = input.tool_input || {};
    if (tool !== "Agent" && tool !== "Task") return null;
    const agent = String(ti.subagent_type || "");
    if (!agent || !existsSync(join(root, ".claude", "agents", agent + ".md"))) return null;
    const text = String(ti.prompt || "") + "\n" + String(ti.description || "");
    return stepStarted(agent, text, "(iniciado pela sessão) " + shorten(ti.description || ti.prompt));
  }
  if (kind === "SubagentStop") {
    const agent = input.agent_type;
    return agent ? { action: "factory.step_finished", title: "@" + agent, summary: undefined, extra: { agent } } : null;
  }
  if (kind === "Stop") {
    return { action: "claude.responded", title: "", summary: lastAssistantText(input.transcript_path) };
  }
  if (kind === "PostToolUse") {
    const tool = input.tool_name;
    const ti = input.tool_input || {};
    if (tool === "Edit" || tool === "Write" || tool === "MultiEdit") {
      const file = ti.file_path;
      if (!file) return null;
      const rel = isAbsolute(file) ? relative(root, file) : file;
      if (rel.startsWith("..") || rel.startsWith(".aes/activity.json")) return null; // fora do projeto ou o próprio feed
      // saída de uma etapa: liga o evento à tarefa (pasta central: apps/<app>/trabalhos/issue-N/; antigo: trabalhos/<repo>-issue-N/)
      const p = rel.replace(/\\/g, "/");
      const a = p.match(/^apps\/([^/]+)\/trabalhos\/issue-(\d+)\/([^/]+\.md)$/);
      const w = p.match(/^trabalhos\/(.+)-issue-(\d+)\/([^/]+\.md)$/);
      const extra = a ? { app: a[1], repo: a[1], issue: Number(a[2]), file: a[3] } : w ? { repo: w[1], issue: Number(w[2]), file: w[3] } : undefined;
      return { action: tool === "Write" ? "claude.file_written" : "claude.file_edited", title: rel, summary: undefined, extra };
    }
    if (tool === "Bash" && /\bgit\s+commit\b/.test(String(ti.command || ""))) {
      let subject = "";
      try { subject = execFileSync("git", ["log", "-1", "--pretty=%s"], { cwd: root, encoding: "utf8", timeout: 3000 }).trim(); } catch { /* ignora */ }
      return { action: "claude.committed", title: shorten(subject, 100), summary: undefined };
    }
  }
  return null;
}

function main() {
  const kind = process.argv[2];
  const input = readStdin();
  const root = process.env.CLAUDE_PROJECT_DIR || input.cwd || process.cwd();
  const built = buildEvent(kind, input, root);
  if (!built) return;

  const file = join(root, ".aes", "activity.json");
  let events = [];
  try {
    const data = JSON.parse(readFileSync(file, "utf8"));
    if (Array.isArray(data.events)) events = data.events;
  } catch { /* arquivo ainda não existe */ }

  const now = Date.now();
  const dup = events.find((e) => e.action === built.action && e.title === built.title && e.actor === ACTOR
    && now - Date.parse(e.timestamp) < DEDUPE_MS && built.action.startsWith("claude.file_"));
  if (dup) return;

  const ev = { id: randomUUID(), kind: "deed", action: built.action, title: built.title, actor: ACTOR, timestamp: new Date(now).toISOString() };
  if (built.summary) ev.summary = built.summary;
  if (built.extra) Object.assign(ev, built.extra);
  events = [ev, ...events].slice(0, MAX);

  mkdirSync(dirname(file), { recursive: true });
  const tmp = file + "." + process.pid + ".tmp";
  writeFileSync(tmp, JSON.stringify({ version: 1, events }, null, 2));
  renameSync(tmp, file); // troca atômica: o navegador nunca lê o arquivo pela metade
}

try { main(); } catch { /* nunca atrapalha a sessão */ }
process.exit(0);
