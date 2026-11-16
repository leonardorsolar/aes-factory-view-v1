#!/usr/bin/env bash
# PreToolUse (Bash), registrado no frontmatter dos agentes pr e merge. Uso: liberar-github.sh pr|merge
# O bloquear-perigosos.sh deixa passar `git push` e `gh pr ...` desses dois agentes; aqui está a allow-list.
# A sessão roda na pasta central: git precisa de `-C "<path>"` e gh de `--repo <github>`, ambos de um app de apps.json.
modo="$1"
cmd=$(jq -r '.tool_input.command // empty' 2>/dev/null)
[ -z "$cmd" ] && exit 0
raiz="${CLAUDE_PROJECT_DIR:-$(pwd)}"

bloquear() { echo "Bloqueado ($modo): $1" >&2; exit 2; }
branch='feature/[A-Za-z0-9._-]+-issue-[0-9]+'

# só mexe nos comandos que escrevem no GitHub; leitura (git status/diff/log, gh pr view...) passa
echo "$cmd" | grep -Eq '(^|[^[:alnum:]_-])(git([[:space:]]+-C[[:space:]]+("[^"]*"|[^[:space:]]+))?[[:space:]]+push|gh[[:space:]]+pr[[:space:]]+(create|merge|ready|edit|close|reopen|comment|review|lock))' || exit 0

# um comando por chamada: sem encadear, sem substituição
echo "$cmd" | grep -Eq '[;&|`<>]|\$\(' && bloquear "um comando por vez, sem ; & | < > crase nem \$()"
[ "$(printf '%s' "$cmd" | wc -l)" -gt 0 ] && bloquear "comando em várias linhas"
echo "$cmd" | grep -Eq '(--force|--force-with-lease|--admin|--no-verify|[[:space:]]-f([[:space:]]|$)|[[:space:]]\+)' && bloquear "flag proibida (force, admin ou no-verify)"

[ -r "$raiz/apps.json" ] || bloquear "apps.json ausente em $raiz"

# o hook global do RTK reescreve comandos como "rtk gh ..." / "rtk git ...": compara sem o prefixo
cmd=$(printf '%s' "$cmd" | sed -E 's/^[[:space:]]*rtk[[:space:]]+(proxy[[:space:]]+)?//')

# normaliza: `git -C "<path>" push ...` -> `git push ...` (path precisa estar em apps.json)
norm="$cmd"
if [[ "$cmd" =~ ^git[[:space:]]+-C[[:space:]]+(\"([^\"]+)\"|([^[:space:]]+))[[:space:]]+(.*)$ ]]; then
  p="${BASH_REMATCH[2]:-${BASH_REMATCH[3]}}"; p="${p%/}"
  jq -e --arg p "$p" '[.apps[].path | rtrimstr("/")] | index($p) != null' "$raiz/apps.json" >/dev/null \
    || bloquear "git -C em pasta que não é app de apps.json: $p"
  norm="git ${BASH_REMATCH[4]}"
elif [[ "$cmd" =~ ^git[[:space:]]+push ]]; then
  bloquear "rode git com -C \"<path do app>\" (a sessão está na pasta central)"
fi

# gh: exige --repo <github> de um app de apps.json e remove do comando para comparar
if [[ "$norm" =~ ^gh[[:space:]] ]]; then
  if [[ "$norm" =~ (--repo|-R)[[:space:]]+([^[:space:]]+) ]]; then
    r="${BASH_REMATCH[2]}"
    jq -e --arg r "$r" '[.apps[].github] | index($r) != null' "$raiz/apps.json" >/dev/null \
      || bloquear "--repo $r não está em apps.json"
    norm=$(printf '%s' "$norm" | sed -E 's/[[:space:]]+(--repo|-R)[[:space:]]+[^[:space:]]+//')
  else
    bloquear "gh precisa de --repo <owner/repo> do app"
  fi
fi

case "$modo" in
  pr)
    echo "$norm" | grep -Eq "^git push (-u )?origin $branch$" && exit 0
    echo "$norm" | grep -Eq '^gh pr create ' && echo "$norm" | grep -q -- '--draft' && echo "$norm" | grep -Eq -- '--body-file apps/[A-Za-z0-9._-]+/trabalhos/' && exit 0
    bloquear "o pr só pode: git -C \"<path>\" push [-u] origin feature/<app>-issue-<n> e gh pr create --repo <github> --draft --body-file apps/<app>/trabalhos/..." ;;
  merge)
    echo "$norm" | grep -Eq "^git push origin $branch$" && exit 0
    echo "$norm" | grep -Eq '^gh pr ready [0-9]+$' && exit 0
    echo "$norm" | grep -Eq '^gh pr merge [0-9]+ --squash( --delete-branch)?$' && exit 0
    bloquear "o merge só pode: git -C \"<path>\" push origin feature/<app>-issue-<n>, gh pr ready <n> --repo <github> e gh pr merge <n> --repo <github> --squash [--delete-branch]" ;;
  *) bloquear "modo desconhecido: $modo" ;;
esac
