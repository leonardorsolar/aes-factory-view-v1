# Plano: agentes PR, Approve e Merge (fase Deliver)

## Contexto
O ciclo `novo-ciclo` termina hoje em review-* (fase Verify). Falta a fase **Deliver**: abrir o PR, decidir a aprovação e fazer o merge. A referência (`aes-simple-ai-software-factory`, `docs/templates/factory-v2/factory/pipeline.yaml`, `agents/approver.md`, `factory/scripts/pr.sh|merge.sh`) usa scripts para PR e Merge e um agente (`approver`) para a decisão. O usuário quer os **três como agentes**, criados com a skill `criar-agente` (modo B: adaptar o material, sem skill/memória; hook só onde há risco, e aqui há).

## Decisões (recomendadas; ajustar se discordar)
- **pr, approver, merge = 3 agentes** em `.claude/agents/`, ids de etapa `pr`, `approve`, `merge`, fase `deliver`.
- **Branch/commit ficam no `pr`**: cria `feature/<repo>-issue-<n>`, commita só os arquivos listados em `execute-task.md`, faz push e abre PR **em rascunho** (`Closes #<n>` + resumo). O `execute-task` não muda.
- **Approve decide, não executa**: `APPROVE` → `@next`, `ESCALATE` → `@human`. Aprova só se gate PASS/SKIPPED, todos os review-* PASS, critérios do PRD atendidos e mudança dentro do escopo; escala se tocar dinheiro/acesso/identidade, deploy/CI, schema/dependência ou decisão de produto.
- **Merge** só com `decision.md` = `APPROVE`: atualiza a branch com a base, confere o gate de novo, `gh pr ready` + `gh pr merge --squash`; nunca `--admin`/`--force`. Etapa com `confirm: true` no ciclo (ação pública e irreversível).
- Vereditos (1ª linha `VERDICT:`): pr `PASS → @next | FAIL → @human`; approve `APPROVE → @next | ESCALATE → @human`; merge `MERGED → @next | FAIL → @human`.

## Arquivos a criar
- `.claude/agents/pr.md` (tools: Read, Grep, Glob, Bash, Write; model sonnet) → grava `pr.md`
- `.claude/agents/approver.md` (Read, Grep, Glob, Bash somente leitura, Write; model opus) → grava `decision.md`
- `.claude/agents/merge.md` (Read, Grep, Glob, Bash, Write; model sonnet) → grava `merge.md`
- Hooks (frontmatter de cada agente, padrão de `restringir-escrita*.sh`):
  - `.claude/hooks/restringir-escrita.sh` (já existe) em `approver`, `pr` e `merge` para Write/Edit só em `trabalhos/`
  - `.claude/hooks/liberar-pr.sh`: no Bash do `pr`, permite só `git switch -c feature/...`, `git add <arquivos>`, `git commit`, `git push -u origin feature/...`, `gh pr create --draft`, `gh pr view`; bloqueia push para a base e `--force`
  - `.claude/hooks/liberar-merge.sh`: no Bash do `merge`, permite só `git fetch/merge origin/<base>`, `git push origin feature/...`, `gh pr ready|view|merge --squash` (sem `--admin`/`--force`)

## Arquivos a editar
- `.claude/hooks/bloquear-perigosos.sh`: hoje bloqueia `git push` e `gh pr create/merge` para qualquer agente. Passa a **ignorar** chamadas dos agentes `pr` e `merge` (cada um é coberto pelo seu hook restrito). Pré-requisito: confirmar se o payload do hook traz o nome do agente (`agent_type`); se não trouxer, usar um marcador que o próprio hook do agente grava. Testar antes de seguir.
- `.claude/cycles/novo-ciclo.json` e `.md`: fase `deliver` com `pr` (needs: 4 reviews), `approve` (needs: pr), `merge` (needs: approve, `confirm: true`); acrescentar ao perfil. `approval: stop_at_pr` já para após o PR até o usuário seguir.
- `CLAUDE.md`: 3 linhas na tabela de agentes, hooks novos em "Onde está cada coisa", regra de que só `pr`/`merge` escrevem no GitHub e só após as condições acima.

## Verificação
1. `jq . .claude/cycles/novo-ciclo.json` e conferir que `pr.md`, `decision.md`, `merge.md` batem entre agente, `.md` e `.json` (verificação de alinhamento da skill).
2. Testar cada hook com JSON simulado: deve permitir o comando previsto e bloquear `git push --force`, push na base, `gh pr merge --admin`, escrita fora de `trabalhos/`.
3. Testar que `bloquear-perigosos.sh` ainda bloqueia `git push` na sessão principal e em outros agentes.
4. Simulação ponta a ponta só com autorização do usuário (exige remoto GitHub e a issue 3 com os reviews PASS): `pr` → `approve` → `merge`. Sem isso, validar só os hooks e os arquivos.

## Fora do escopo
Skill, memória e diagrama dos três agentes: oferecer ao final, não criar.
