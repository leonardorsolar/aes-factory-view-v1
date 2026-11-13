Resumo organizado a partir do plano 🎯

## Como o card anda

O card não guarda estado próprio. A cada ~3 s a tela recalcula tudo a partir de duas fontes:

| Pergunta | Onde ele descobre | Quem manda |
|---|---|---|
| **Por onde passou** (histórico) | Os arquivos já gravados em `trabalhos/<repo>-issue-3/`. A 1ª linha de cada um é o veredito (ex.: `intake.md` → `ACCEPT`). | 📁 **Arquivos = fonte da verdade** |
| **Onde está agora** | Se há uma etapa rodando, ela. Se nada roda, a última etapa concluída (ou a próxima pendente, quando o veredito é `@next`). | 📁 arquivos + 🪝 hook |
| **Está rodando neste instante?** | Eventos `factory.step_started` sem `step_finished` no `.aes/activity.json`. | 🪝 **Hook = só "rodando agora"** |
| **Para onde vai** | O `next` do ciclo (`novo-ciclo.json`): veredito → `@next`, `@wait-author`, `@rejected` ou `@human`. | 🧭 **Ciclo = regras** |
| **Em que coluna fica** | O campo `phase` da etapa no ciclo (intake e prd em Discovery, techspec em Design). | 🧭 ciclo |

**Na prática**
1. Você envia `@intake triar a issue 3`. O hook registra "intake da issue 3 começou", e o card nasce em **Discovery** com o intake "rodando".
2. O agente grava `intake.md` e o subagente termina. O hook registra o fim, e a tela lê a **1ª linha do arquivo** (`ACCEPT`, `NEEDS-INFO` ou `REJECT`).
3. O ciclo traduz o veredito em destino: segue para o `prd`, espera o autor ou encerra como rejeitado.

Por que dá certo: se o evento do hook atrasar ou se perder, ou se você reiniciar tudo, os arquivos continuam dizendo o estado correto. O hook só evita o atraso entre o seu pedido e o primeiro arquivo aparecer.

## Arquivos que serão mudados e como

| Arquivo | Mudança |
|---|---|
| `scripts/activity-hook.mjs` | Dois eventos novos. `UserPromptSubmit` extrai `@agente` e `issue N` do prompt e grava `factory.step_started`. `SubagentStop` grava `factory.step_finished`. Também enriquece `file_written`/`edited` com `issue`, `repo` e `file` quando o caminho casa `trabalhos/<repo>-issue-<N>/*.md`. Nunca falha nem imprime. |
| `js/activity.js` | Registra os tipos `factory.step_started` e `factory.step_finished` (categoria "Fábrica", que já existe). |
| `js/scan.js` | `mergeActivityHooks` passa a incluir `UserPromptSubmit` e `SubagentStop`, sem matcher, mesclando sem tocar no `PreToolUse`. |
| `scripts/build-skills-bundle.mjs` | Roda de novo (`node scripts/build-skills-bundle.mjs`) para o botão "Baixar skills e agentes" levar o hook novo. |
| `.claude/settings.json` (deste repo) | Recebe os dois hooks novos. |
| `js/pipeline.js` | O maior. `scanTasks` lê `trabalhos/*-issue-N/` e o veredito de cada etapa, e detecta `<etapa>.questions.md` sem `.answers.md`. `runningSteps` lê o `activity.json` (descarta "rodando" com mais de ~30 min como travado). Mapas genéricos tirados do ciclo (agente→etapa, arquivo→etapa, veredito→destino). O card real substitui o de exemplo, com polling de ~3 s só com a aba visível e recarga em `aes:project-changed`. |
| `README.md` | Seção Activity explica os eventos novos e como o card é derivado. |

Não deve exigir mudança em `css/cycles.css`, porque o card reaproveita `.pp__card`, mas os selos novos (rodando, sua decisão) podem pedir pequenos estilos. 🎨

