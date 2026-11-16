# New Project View

Página inicial para começar e organizar um projeto. HTML, CSS e JavaScript puro: sem servidor, sem `npm install`, sem build.

## Como rodar

```bash
xdg-open index.html     # Linux (ou duplo clique em index.html)
```

## Telas

| Tela | O que faz |
|---|---|
| Home | Atalhos para Scan, Diagrama e Notas |
| Scan the codebase | Gera a visão do projeto em `.aes/project/` (skill `template/skills/aes-init`) |
| Diagrama | Quadros Excalidraw salvos em `.aes/diagrams/` |
| Notas | Notas em Markdown salvas em `.aes/notes/` |
| Pipeline | Monta ciclos de trabalho em colunas e cards (arrastar, ligar, zoom). Cada card tem abas Etapa, Agente, Entrega e Aprovação. Grava `.claude/cycles/<ciclo>.md` e `.claude/agents/<agente>.md` na pasta do projeto |
| Activity | Linha do tempo: ações na página e sessões do Claude Code |
| Settings | Preferências (tema) guardadas no navegador |

## Activity e o hook do Claude Code

```
Claude Code ──hook──► scripts/activity-hook.mjs ──► .aes/activity.json ──(4 s)──► página /activity
```

Os hooks estão em `.claude/settings.json` (precisa de Node). A página relê `.aes/activity.json` a cada 4 s.
O botão **Baixar skills e agentes** (e "Preparar pasta central" em **Configurações da Factory**) instala agentes, skills, hooks e o hook do Activity **na pasta central**, nunca nos apps (`.claude/`, `.aes/activity-hook.mjs` e hooks mesclados no `.claude/settings.json`). O pacote vem de `template/` (`node scripts/build-skills-bundle.mjs`).

### Cards em Pipeline → Tarefas
A aba Pipeline mostra o desenho do ciclo do projeto (`.claude/cycles/*.json`) e, abaixo, um card por issue, na coluna da fase em que ela está:
- `UserPromptSubmit` (`@intake triar a issue 3`) → `factory.step_started`: o card aparece com a etapa **rodando**.
- Saídas em `trabalhos/<repo>-issue-<N>/<etapa>.md`: a 1ª linha (`DECISION:`/`VERDICT:`) é o veredito; `next` do ciclo diz para onde o card vai (`@next`, `@wait-author`, `@rejected`, `@human`).
- `<etapa>.questions.md` sem `<etapa>.answers.md` → "aguardando sua resposta". `SubagentStop`/`Stop` encerram o "rodando".

## Depois de editar `template/` (skills e agents)

```bash
node scripts/build-skills-bundle.mjs   # regenera js/skills-bundle.js
```

## Pipeline: formato do ciclo

Sem motor: o ciclo é um Markdown que o Claude Code segue (`js/cycle-md.js` lê e grava).

```markdown
# Bug simples
Descrição: bug pequeno, 1 arquivo
Aprovação: stop_at_pr

## Discover
### Intake
- id: intake
- executa: agente orquestrador
- grava: intake.md
- aprovação: não
- vereditos: DONE → build; BLOCKED → @humano
```

Teste do formato: `node scripts/test-cycle-md.mjs`.

## Importar e exportar ciclos (.json)

Os botões **Importar JSON** e **Exportar JSON** da página Pipeline trocam ciclos no formato `aes-cycle` (v1), o mesmo de `aes-simple-ai-software-factory/docs/templates/cycles`.

- **Importar:** escolha o arquivo e o **perfil** (quais etapas entram). Vira um ciclo novo, ainda não salvo.
- **Exportar:** abre "Salvar como"; navegue até a pasta de destino (o navegador lembra a última). Sem esse recurso, baixa o arquivo.
- O que a tela não edita (prompt, after, group, needs, required, port, model…) é guardado e devolvido na exportação, então o ciclo volta igual.
- Não existe no formato: o **status** da entrega (se perde) e perfis/roteamento extras (só um perfil é exportado).

Testes: `node scripts/test-cycle-md.mjs` e `node scripts/test-cycle-json.mjs` (este lê os JSON reais da pasta de exemplos).
