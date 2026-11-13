# Decisão: gate e review depois do build

Contexto: o `novo-ciclo` (`novo-teste-aes-simple02/.claude/cycles/novo-ciclo.json`) hoje termina em `execute-task` (fase Build). Não há fase Verify. Este documento registra as opções para ligar o build ao review.

## Estado atual do novo-ciclo

`intake → prd → techspec → tasks → execute-task` (todas agentes que gravam um `.md`). Sem gate e sem review.

## O que é o gate (aes-simple-ai-software-factory)

- **Script, sem LLM** (`scripts/gate.sh`, `bin/gate`). No ciclo: `run: { script: scripts/gate.sh }`.
- Roda `lint`, `typecheck`, `test` e `build` do projeto na worktree do job (e `pytest` em projetos Python).
- **Veredito pelo exit code:** 0 → `PASS` (segue para `review_code`); outro → `FAIL` (volta ao `build` com o log, `max_rounds: 3`).
- O motor grava o resultado em `round-N/checks.md`.
- Falha se o branch alterar arquivos em `protected_paths` (ex.: o próprio `gate.sh`), para o builder não enfraquecer a checagem.
- Modo `--hook`: usado como hook `SubagentStop` do builder, que só termina se os checks passam.
- Por que existe: não gastar um revisor LLM em código que nem compila ou não passa nos testes.

## É necessário no nosso projeto?

Opcional. O `fabrica-v3.json` já usa, e o `pipeline.md` do projeto de referência prevê desligar o gate por perfil (o `review_code` passa a vir direto de `build`, sem seta solta).

- **Manter** se os projetos construídos têm testes, lint ou build.
- **Pular** em perfis como Documentação ou Rápido, ou em projetos sem nenhum check.

## Alternativas

### A. Build direto para o review
- Adicionar `review_code` depois de `execute-task` (`needs: [execute-task]`).
- O `DONE` do build já aponta para `@next`. Sem script.
- Risco: o revisor LLM gasta tokens mesmo se o código não compila.

### B. Gate opcional + `gate.sh` com SKIPPED (recomendada)
- Adicionar a etapa `gate` (script) entre o build e o `review_code`.
- `PASS` → review. `FAIL` → volta ao `execute-task`, no máximo 3 rodadas.
- **Opcional por perfil:** perfil sem gate liga o review direto ao build.
- **SKIPPED:** se o projeto não tem checks, o `gate.sh` sai com 0 e grava `GATE: SKIPPED`, em vez de falhar e travar o fluxo.

### C. `to-review.sh`
- Script pequeno no fim do build: confere que `execute-task.md` diz `DONE` e que há diff/commit novo, e então dispara o review.
- Não roda testes; é só a ponte entre as etapas.
- Só vale a pena se o disparo for automático. Hoje o `@next` apenas indica o próximo passo e quem executa é o usuário com `@agente ...`.

## Recomendação

**B**, e **C** só depois, se quiser automatizar. **A** serve de plano B para projetos sem testes.

## Decisão

**Pendente.** Escolher entre A, B ou B + C.

## O que muda quando for implementar

- `novo-teste-aes-simple02/.claude/cycles/novo-ciclo.json` e `novo-ciclo.md`: etapas `gate` e `review_code` na fase Verify (coluna In Review).
- `gate.sh` novo no projeto, com detecção automática e `SKIPPED`.
- Agente `reviewer-code` (e skill), se ainda não existir no projeto.
- Se for opção C: `to-review.sh`.

## Como escolher quais revisores rodam (code, ux, ui, security)

No aes-simple-ai-software-factory os revisores não são fixos: **o intake classifica a issue e o `route` aplica as regras** da seção `routing` do `pipeline.yaml`.

1. **O intake grava cabeçalhos no `intake.md`**, logo abaixo do veredito:
   ```
   DECISION: ACCEPT
   RISK: low | medium | high
   SURFACES: ui, security   (ou none)
   ROUTE: bug | feature | feature_large | docs
   ```
2. **`bin/route` (`job route`) lê esses cabeçalhos** (`bin/job`, função `sync()`) e aplica o `routing`.
3. **`ROUTE` escolhe o perfil**, que é a lista de etapas ligadas (o resto é pulado):
   - `bug`: `intake, build, gate, review_code, pr…`
   - `feature`: acrescenta `review_security`
   - `docs`: só `review_code`, sem gate
4. **`RISK` escolhe o modelo do `review_code`:** `low` = Haiku; `medium` e `high` = Sonnet.
5. **`SURFACES` liga os revisores especializados:**
   - `ui` liga `review_ux` (Sonnet) e `review_ui` (Haiku)
   - `security` liga `review_security` (Opus)
   - `none` deixa só o `review_code`

| Revisor | Quando roda |
|---|---|
| `review_code` | Quase sempre, com o modelo definido pelo `RISK` |
| `review_ux` e `review_ui` | Só se `SURFACES` contém `ui` |
| `review_security` | Só se `SURFACES` contém `security` (ou se o perfil o inclui) |

Todos têm `group: review`: rodam em paralelo e o fluxo só avança quando todos terminam. Qualquer `CHANGES` volta ao `build`. Na dúvida vale `default_profile: feature_large` (o mais seguro).

### Para o nosso `novo-ciclo`

O `intake.md` de hoje só grava `ACCEPT`, `NEEDS-INFO` ou `REJECT`, sem `RISK` nem `SURFACES`. Duas formas de decidir os revisores:

- **Simples (começar assim):** `review_code` fixo em todo projeto; `review_ux` e `review_security` entram à mão como etapas opcionais num perfil.
- **Como a referência:** estender o intake para gravar `RISK` e `SURFACES` e ligar os revisores automaticamente a partir disso. Mais trabalho, porém automático.


o que foi feito:

# Plano: etapa "Gate" acionável por IA no novo-ciclo (card com comando para copiar)

## Context
O usuário quer um card (etapa) em que possa pedir à IA para rodar os testes do gate, em vez de um script fixo. A tela (aes-factory-view-v1) é somente leitura: não dispara o Claude Code. Ela já mostra, no diálogo de cada etapa do desenho da pipeline, "Comandos de uso" com botão Copiar (`commandsOf` em js/pipeline.js:83), e acompanha o resultado lendo o `.md` da etapa (`verdictOf`, js/pipeline.js:192, aceita `GATE: PASS`). Então o "card que solicita à IA" = etapa `gate` como **agente** + comando copiável.

## Abordagem
1. **Ciclo** (`/home/solar/Documentos/aes plataforma/novo-teste-aes-simple02/.claude/cycles/novo-ciclo.json` e `.md`): nova etapa `gate` (fase `verify`, coluna In Review), `run: { agent: "gate (skill aes-run-gate)" }`, `needs: ["execute-task"]`, `writes: "gate.md"`, `next: { PASS: "@next", SKIPPED: "@next", FAIL: "execute-task" }`. Entra no `profiles.novo_ciclo.steps` depois de `execute-task`. (Opcional por perfil: perfil sem `gate` liga o review direto ao build.)
2. **Agente `gate`** (`template/agents/gate.md` + cópia em `.claude/agents/` do projeto): detecta os comandos (package.json: lint, typecheck, test, build; pytest), roda, e grava `gate.md` com 1ª linha `GATE: PASS | FAIL | SKIPPED` (SKIPPED se não houver checks) e o log resumido dos erros abaixo. Não edita código nem usa `--fix`.
3. **Skill `aes-run-gate`** (`template/skills/aes-run-gate/SKILL.md`): playbook da detecção e do formato do `gate.md`. Incluir no bundle com `node scripts/build-skills-bundle.mjs`.
4. **Tela** (`js/pipeline.js`, `commandsOf`): texto de pedido próprio para o gate, por exemplo `@gate rodar os testes (lint, tipos, testes, build) da <issue#N>`, no lugar do genérico "executar a etapa gate". O card de tarefa já mostra `✓ PASS` / `FAIL` sozinho, pois `verdictOf` lê `GATE: PASS`.
5. **Doc**: registrar a decisão em `docs/info/gate-review-decision.md` (alternativa B com gate-agente).

## Uso final
`@execute-task ... issue 3` (DONE) → `@gate rodar os testes da issue 3` → `gate.md` com `GATE: PASS` → `@reviewer-code revisar issue 3`. `FAIL` volta ao execute-task.

## Verificação
- `node scripts/test-cycle-json.mjs` com o novo `novo-ciclo.json`.
- Abrir a aba Pipeline: a etapa Gate aparece em Verify; clicar nela mostra o comando e o botão Copiar.
- Criar um `trabalhos/<repo>-issue-3/gate.md` de teste com `GATE: PASS` e conferir o selo `✓ PASS` no card.

## Implementado: gate como agente (card acionável por IA)

Em vez de script, o gate do `novo-ciclo` é um **agente** que você chama pelo Claude Code; a tela só mostra o comando e acompanha o resultado.

- **Etapa** `gate` (fase Verify) em `novo-ciclo.json`/`.md`: `needs: execute-task`, grava `gate.md`; `PASS` e `SKIPPED` → `@next`, `FAIL` → `execute-task`.
- **Agente** `template/agents/gate.md` e **skill** `template/skills/aes-run-gate/`: detectam lint/tipos/testes/build, rodam sem `--fix` e gravam `GATE: PASS | FAIL | SKIPPED` na 1ª linha. Já estão no bundle e copiados para `novo-teste-aes-simple02/.claude/`.
- **Tela:** clicar na etapa Gate mostra o comando `@gate rodar os testes (lint, tipos, testes, build) da <issue#N>` com botão Copiar (`commandsOf` em `js/pipeline.js`). O card da tarefa mostra `✓ PASS` ou `FAIL` lendo o `gate.md`.

Uso: `@execute-task ... issue 3` → `@gate rodar os testes da issue 3` → (PASS) `@reviewer-code ...`.
