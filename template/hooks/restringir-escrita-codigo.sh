#!/usr/bin/env bash
# PreToolUse (Write|Edit), registrado no frontmatter do agente execute-task.
# Libera: código dentro do "path" de um app de apps.json (sem .git/, .claude/, .aes/, trabalhos/ do app)
#         e, na pasta central, apps/<app>/trabalhos/issue-<n>/execute-task.md.
# Falha fechada: sem apps.json legível, bloqueia.
f=$(jq -r '.tool_input.file_path // empty' 2>/dev/null)
[ -z "$f" ] && exit 0
raiz="${CLAUDE_PROJECT_DIR:-$(pwd)}"
case "$f" in
  /*) abs="$f" ;;
  *)  abs="$raiz/$f" ;;
esac
case "$abs" in *..*) echo "Bloqueado: caminho com .." >&2; exit 2 ;; esac

# relatório do próprio execute-task na pasta central
case "$abs" in
  "$raiz"/apps/*/trabalhos/*/execute-task.md) exit 0 ;;
  "$raiz"/*) echo "Bloqueado: na pasta central o execute-task só grava o seu execute-task.md ($f)" >&2; exit 2 ;;
esac

paths=$(jq -r '.apps[].path // empty' "$raiz/apps.json" 2>/dev/null) \
  || { echo "Bloqueado: apps.json ausente ou inválido em $raiz" >&2; exit 2; }
[ -z "$paths" ] && { echo "Bloqueado: nenhum app cadastrado em apps.json" >&2; exit 2; }

while IFS= read -r p; do
  [ -z "$p" ] && continue
  p="${p%/}"
  case "$abs" in
    "$p"/.git/*|"$p"/.claude/*|"$p"/.aes/*|"$p"/trabalhos/*)
      echo "Bloqueado: no app só entra código, não $f" >&2; exit 2 ;;
    "$p"/*) exit 0 ;;
  esac
done <<< "$paths"

echo "Bloqueado: escrita fora dos apps cadastrados em apps.json ($f)" >&2
exit 2
