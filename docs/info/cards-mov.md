Resumo de como o card da tarefa anda na aba **Pipeline → Tarefas** 🎯

## Como o card anda

O card não guarda estado próprio. A cada ~3 s (só com a aba Pipeline visível) a tela recalcula tudo a partir de três fontes:

| Pergunta | Onde ele descobre | Quem manda |
|---|---|---|
| **Por onde passou** (histórico) | Os arquivos já gravados em `trabalhos/<repo>-issue-3/`. A 1ª linha de cada um é o veredito (`intake.md` → `DECISION: ACCEPT`; `prd.md` → `VERDICT: DONE`). Um `<etapa>.questions.md` sem `<etapa>.answers.md` marca a etapa como "aguardando sua resposta". | 📁 **Arquivos = fonte da verdade** |
| **Está rodando neste instante?** | Evento `factory.step_started` (agente + issue) no `.aes/activity.json` **sem** um fim depois dele. O fim é um `factory.step_finished` do mesmo agente ou um `claude.responded`. Sem fim registrado, vale por no máximo 30 min (depois vira "travado" e some o "rodando"). | 🪝 **Hook = só "rodando agora"** |
| **Onde está agora** | Se há etapa rodando, ela. Se nada roda, a última etapa que já tem saída; quando o veredito dela é `@next`, vale a fase da **próxima** etapa. | 📁 arquivos + 🪝 hook |
| **Para onde vai** | O `next` do ciclo (`.claude/cycles/<ciclo>.json` do projeto): veredito → `@next`, `@wait-author`, `@rejected`, `@human` ou `@done`. | 🧭 **Ciclo = regras** |
| **Em que coluna fica** | O campo `phase` da etapa no ciclo. No `novo-ciclo`: intake e prd em **Fase: Discovery**, techspec em **Design**. | 🧭 ciclo |

Nada é fixo em "intake": agente → etapa vem de `run.agent`, arquivo → etapa vem de `writes`, e o título vem do `# PRD:` do `prd.md` (antes disso, "Issue #N").

### Selos e marcas do card

| Situação | Como aparece |
|---|---|
| Etapa rodando | `◐` azul + pulso no card e borda azul |
| Etapa concluída | `✓` verde + veredito ao lado (`ACCEPT`, `DONE`…) |
| Aguardando resposta (`questions.md` sem `answers.md`) | `⏸` + selo "aguardando sua resposta" |
| Etapa pendente | `○` |
| `@wait-author` | selo "perguntou ao autor" |
| `@rejected` | selo "rejeitado" e card esmaecido |
| `@human` (ex.: `BLOCKED`) | selo "sua decisão" |
| `@done` | selo "concluída" |

Clicar no card abre uma gaveta com os `.md` da pasta da issue.

### Na prática
1. Você envia `@intake triar a issue 3`. O hook (`UserPromptSubmit`) registra `factory.step_started` com `agent: intake` e `issue: 3`, e o card nasce em **Fase: Discovery** com o intake "rodando".
2. O agente grava `trabalhos/<repo>-issue-3/intake.md`. Quando o subagente termina, o hook (`SubagentStop`) registra `factory.step_finished`, e a tela lê a **1ª linha do arquivo** (`ACCEPT`, `NEEDS-INFO` ou `REJECT`).
3. O ciclo traduz o veredito em destino: `ACCEPT` leva o card para a próxima etapa (prd), `NEEDS-INFO` mantém o card com "perguntou ao autor" e `REJECT` encerra como rejeitado.
4. `@prd …` e `@doc-writer-techspec …` repetem o processo. Com `prd.md` em `DONE`, o card passa para **Design**, onde está o techspec.

Por que dá certo: se o evento do hook atrasar ou se perder, ou se você reiniciar tudo, os arquivos continuam dizendo o estado correto. O hook só cobre o intervalo entre o seu pedido e o primeiro arquivo aparecer.

Pré-requisitos no projeto: pasta conectada em Preferences (com permissão de leitura), o hook instalado (botão **Baixar skills e agentes**, depois reabrir o Claude Code) e as saídas em `trabalhos/<repo>-issue-<N>/`.

## Arquivos mudados e como

| Arquivo | Mudança |
|---|---|
| `scripts/activity-hook.mjs` | Dois eventos novos: `UserPromptSubmit` (extrai `@agente` e `issue N`/`#N` do prompt e grava `factory.step_started`; ignora prompts sem os dois) e `SubagentStop` (grava `factory.step_finished` com o `agent_type`). `file_written`/`file_edited` passam a levar `issue`, `repo` e `file` quando o caminho casa `trabalhos/<repo>-issue-<N>/*.md`. Nunca falha nem imprime. |
| `js/activity.js` | Registra os tipos `factory.step_started` e `factory.step_finished` (categoria "Fábrica", que já existia). |
| `js/scan.js` | `mergeActivityHooks` passa a incluir `UserPromptSubmit` e `SubagentStop` (sem matcher), mesclando sem tocar no `PreToolUse` do projeto. |
| `scripts/build-skills-bundle.mjs` | Já empacota `scripts/activity-hook.mjs` como `.aes/activity-hook.mjs`; rodar `node scripts/build-skills-bundle.mjs` depois de editar o hook, para o botão levar a versão nova (`js/skills-bundle.js` é gerado). |
| `.claude/settings.json` (deste repo) | Recebeu os dois hooks novos. |
| `js/pipeline.js` | O maior. Lê o ciclo de `.claude/cycles/*.json` do projeto (fallback: `cycles/fabrica-v3.json`), desenha o "Desenho da pipeline" e, abaixo, as colunas de Tarefas. `scanTasks` lê `trabalhos/*-issue-N/`, o veredito de cada etapa, as perguntas pendentes e os eventos do `activity.json` (a detecção de "rodando" e do limite de 30 min fica dentro dele). `taskCard`/`refreshTasks` desenham os cards, e `openTask` abre a gaveta com os `.md`. Polling de ~3 s com a aba visível e recarga em `aes:project-changed`. |
| `css/cycles.css` | Estilos dos cards de tarefa (borda azul e pulso de "rodando", lista de etapas, selo, gaveta). |
| `js/cycles.js` | Correção à parte: o ajuste automático de zoom da aba Construction esperava medir uma área escondida e encolhia para 25%; agora adia o ajuste até a área ficar visível (`ResizeObserver`). |
| `README.md` | Seção Activity explica os eventos novos e como o card é derivado. |

## Ainda não validado

- Os nomes dos campos do payload dos hooks (`prompt` no `UserPromptSubmit`, `agent_type` no `SubagentStop`) não foram conferidos numa sessão real do Claude Code. Se algum não vier, o card só aparece depois que o primeiro arquivo for gravado.
- A lógica de leitura (`scanTasks`) foi testada com os arquivos reais do `novo-teste-aes-simple02` e com eventos simulados; o visual na página ainda não foi conferido no navegador.
