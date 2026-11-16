#!/usr/bin/env bash
# PreToolUse (Write|Edit), registrado no frontmatter dos agentes de documento e revisão:
# só permite gravar dentro de apps/<app>/trabalhos/ da pasta central.
f=$(jq -r '.tool_input.file_path // empty' 2>/dev/null)
[ -z "$f" ] && exit 0
raiz="${CLAUDE_PROJECT_DIR:-$(pwd)}"
case "$f" in
  /*) abs="$f" ;;
  *)  abs="$raiz/$f" ;;
esac
case "$abs" in
  *..*) echo "Bloqueado: caminho com .." >&2; exit 2 ;;
  "$raiz"/apps/*/trabalhos/*) exit 0 ;;
esac
echo "Bloqueado: o agente só grava em apps/<app>/trabalhos/ da pasta central (tentou: $f)" >&2
exit 2
