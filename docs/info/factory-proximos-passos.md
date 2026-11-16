# Fábrica de software: próximos passos

referência: https://www.youtube.com/watch?v=WOhJflEz3mY

Comparação entre o ciclo atual (`novo-teste-aes-simple02/.claude/cycles/novo-ciclo.json`) e a fábrica de software com agentes descrita no vídeo "Software factory explained by a Senior Engineer", seguida do passo a passo para fechar cada lacuna dentro do projeto.

Caminhos relativos abaixo partem de `novo-teste-aes-simple02/`.

---

## 1. Onde estamos

O ciclo `novo_ciclo` já cobre a linha de montagem principal:

```
intake → prd → techspec → tasks → execute-task → gate
       → review-code | review-security | review-ui | review-ux (paralelo)
       → pr → approve → merge
```

- 5 fases: Discovery, Design, Build, Verify, Deliver.
- `approval: stop_at_pr`: o ciclo pausa no PR; `merge` tem `confirm: true`.
- Gate `FAIL` e review `CHANGES` voltam para `execute-task`.
- Há um arquivo de agente para cada um dos 13 passos em `.claude/agents/`.
- O `gate` já roda os scripts `lint`, `typecheck`, `test` e `build` do repositório alvo (skill `aes-run-gate`).
- O `intake` já classifica risco, rota e superfícies.

Equivalência com o vídeo:

https://www.youtube.com/watch?v=WOhJflEz3mY

| Vídeo | Projeto hoje |
|---|---|
| Agente de triagem | `intake` |
| Agente de refinamento | `prd` (parcial) |
| Priorizador | não existe |
| Agente implementador | `execute-task` |
| Pipeline de qualidade | `gate` (depende dos scripts do repo alvo) |
| Revisor de IA | `review-*` |
| PRs / aprovação / merge | `pr`, `approve`, `merge` |
| Staging + smoke + QA + deploy | não existe |
| Observabilidade / retrospectiva | não existe |

---

## 2. O que falta (resumo)

1. **Entrada automática:** hoje tudo começa num `issue.md` criado à mão. Faltam ganchos para Sentry, Slack ou um botão "reportar bug", e a checagem de duplicidade/backlog.
2. **Refinamento completo:** estimar o **raio de explosão** (quais serviços a mudança afeta e se mexe em banco, no design system ou num componente isolado), prioridade e tamanho, e **reproduzir o bug** com Playwright (vídeo e prints no ticket).
3. **Priorizador:** decidir se o ticket vai sozinho para a implementação ou precisa de uma pessoa.
4. **Gate mais rígido:** além de lint, tipos, testes e build, rodar análise estática (duplicação, complexidade ciclomática, código morto), **E2E/smoke** e **diff visual** antes/depois.
5. **Limite de turnos:** o laço execute → gate/review não tem teto e pode queimar tokens indefinidamente.
6. **Revisor de arquitetura:** procurar regressões estruturais (limites de módulo violados, estado redundante, função duplicada, `JSON.stringify` no banco relacional, valores fixos nos testes).
7. **Merge pelo risco:** decidir entre merge automático e revisão humana pelo raio de explosão, em vez de parar no PR em todo ticket.
8. **Depois do merge:** ambiente de preview/staging reproduzível com dados anonimizados, **agente de QA** que testa como usuário, e deploy.
9. **Contexto fixo:** `CLAUDE.md` do repo alvo com o padrão de stack (design system, API, cache, banco) e skills oficiais da stack.
10. **Melhoria da fábrica:** retrospectiva/observabilidade sobre tickets fechados, roteador de modelo, agente de docs/changelog e, mais adiante, verificação formal (regras de negócio que o código não pode quebrar).

---

## 3. Passo a passo

Os passos estão em ordem de prioridade. Cada um diz quais arquivos criar ou alterar.

### Passo 1: endurecer o gate (prioridade máxima)

O gate só é tão bom quanto os scripts do repositório alvo. Se o repo não tiver `lint`/`typecheck`/`test`, o gate devolve `SKIPPED` e nada é verificado.

1. No **repositório alvo** (o que os agentes alteram), garantir no `package.json`:
   ```json
   {
     "scripts": {
       "lint": "eslint .",
       "typecheck": "tsc --noEmit",
       "test": "vitest run",
       "test:e2e:smoke": "playwright test --grep @smoke",
       "analyze": "<ferramenta de análise estática: duplicação, complexidade, código morto>",
       "build": "..."
     }
   }
   ```
2. Escrever os primeiros testes E2E marcados com `@smoke` cobrindo só o essencial (login/registro e o fluxo principal).
3. Em `.claude/skills/aes-run-gate/SKILL.md`, no passo **Detectar**, incluir `analyze` e `test:e2e:smoke`, nesta ordem: `lint`, `typecheck`, `analyze`, `test`, `test:e2e:smoke`, `build`.
4. Ainda na skill, trocar `SKIPPED` por `FAIL` quando faltar `lint` **ou** `typecheck`, para que um repo sem checagens não passe sem verificação. `SKIPPED` passa a valer só para repos sem `package.json`/Python.
5. Pedir no `gate.md` uma seção `## Métricas` com números da análise (duplicações, funções acima do limite de complexidade, exports não usados). Esses números servem de entrada para o `execute-task` se corrigir na volta.

### Passo 2: limite de turnos no laço de correção

1. Em `.claude/cycles/novo-ciclo.json`, adicionar no nível do `cycle`:
   ```json
   "max_loops": 5
   ```
   (no vídeo o teto é 100 turnos; aqui o laço é por passo inteiro, então 3 a 5 voltas já é bastante).
2. No `execute-task` (`.claude/agents/execute-task.md`), antes de começar: contar quantas vezes `execute-task.md` já foi reescrito para a issue (por exemplo, um contador `ROUND: N` na 2ª linha do relatório). Se `N > max_loops`, gravar `VERDICT: BLOCKED` com o motivo "limite de voltas atingido" e parar. `BLOCKED` já vai para `@human`.
3. No app (`aes-factory-view`), mostrar o `ROUND` no card para ver quais tickets estão girando.

### Passo 3: raio de explosão e prioridade no refinamento

1. Em `.claude/agents/intake.md`, exigir no `intake.md` um bloco fixo:
   ```
   ## Blast radius
   BLAST: small | medium | large
   - small: só componente/tela isolada, um serviço
   - medium: design system, módulo compartilhado ou mais de um serviço
   - large: banco/migração, auth, pagamentos, infraestrutura
   PRIORITY: P0 | P1 | P2 | P3
   SIZE: S | M | L
   ```
2. Em `.claude/agents/prd.md`, copiar `BLAST`, `PRIORITY` e `SIZE` para o topo do `prd.md`, para que os passos seguintes leiam sem abrir o intake.
3. (Opcional, depois do Passo 7) Reprodução: quando a issue for bug, o `prd` roda um teste Playwright que reproduz o problema e anexa o vídeo/print em `trabalhos/<repo>-issue-<n>/evidencias/`.

### Passo 4: merge decidido pelo risco

1. Em `novo-ciclo.json`, adicionar um segundo modo em `approval_modes`:
   ```json
   "by_blast_radius": {
     "label": "Pelo raio de explosão",
     "auto_merge_when": { "BLAST": ["small"] },
     "pause_after": ["pr"]
   }
   ```
2. Em `.claude/agents/approver.md`: ler `BLAST` do `prd.md`. Se `small` e todos os reviews `PASS`, devolver `APPROVE`. Se `medium`/`large`, devolver `ESCALATE` (vai para `@human`).
3. Em `merge`, manter `confirm: true` enquanto a taxa de sucesso não for alta. Quando a maioria dos merges `small` der certo (o vídeo fala em ~99%), tirar a confirmação só para `small`.

### Passo 5: revisor de arquitetura

1. Criar `.claude/agents/reviewer-architecture.md` com a skill `criar-agente` (mesmo formato dos outros `reviewer-*`).
2. Checklist do revisor:
   - módulo importando de outro módulo por fora da interface pública;
   - função/hook/componente recriado quando já existe;
   - estado duplicado ou derivável;
   - objetos serializados (`JSON.stringify`) em coluna de banco relacional;
   - valores fixos nos testes só para passar;
   - código e endpoints/tabelas que ficaram sem uso.
3. Em `novo-ciclo.json`, adicionar o passo `review-architecture` com `group: "review"`, `needs: ["gate"]`, `next: { "PASS": "@next", "CHANGES": "execute-task" }`, e incluí-lo no `needs` do `pr` e na lista do perfil.
4. Revisor sem o contexto dos outros: ele lê só `issue.md`, `techspec.md` e o diff, não os outros reviews.

### Passo 6: contexto fixo do repositório alvo

1. No `CLAUDE.md` (ou `AGENTS.md`) do **repositório alvo**, documentar: design system e onde ficam os componentes, padrão de API (REST/GraphQL), cache, banco e regras de modelagem, o que é proibido (comentários com nome de issue, feature flags soltas, etc.).
2. Instalar skills oficiais da stack (React/Vercel, AWS, etc.) e referenciá-las no `execute-task.md`.
3. Regra no `execute-task`: ler esse `CLAUDE.md` antes de qualquer edição.

### Passo 7: preview, QA e deploy (fase nova)

1. Criar uma fase `release` em `novo-ciclo.json` (coluna "Done" ou "Release").
2. Ambiente de preview por branch (Vercel/Amplify para front; para back, `docker compose` com banco a partir de um **seed anonimizado**: nomes, e-mails e textos trocados por dados falsos com o mesmo tamanho).
3. Novo agente `.claude/agents/qa.md`:
   - lê só `issue.md` e os critérios de aceitação (contexto de usuário, sem código);
   - roda os testes `@smoke` e navega o recurso com Playwright no preview;
   - grava `qa.md` com `QA: PASS | FAIL`, prints e vídeo.
4. Passos no ciclo: `merge → smoke → qa → deploy`, com `FAIL` voltando para `@human`.

### Passo 8: priorizador

1. Novo agente `.claude/agents/prioritizer.md` entre `prd` e `techspec`.
2. Lê `BLAST`, `PRIORITY` e `SIZE`. Vereditos:
   - `GO`: segue sozinho (bug claro, `small`);
   - `HUMAN`: mudança de arquitetura, `large`, ou dúvida se vale a pena fazer;
   - `LATER`: válido, mas fora da prioridade agora.
3. Adicionar ao ciclo com `next: { "GO": "@next", "HUMAN": "@human", "LATER": "@backlog" }`.

### Passo 9: entrada automática

1. Criar um endpoint/script (ex.: `.aes/ingest.mjs`) que recebe webhooks do Sentry e de um botão "reportar bug" e cria a issue no GitHub com o contexto (stack trace, URL, usuário anonimizado, print).
2. Cada issue nova dispara o `intake` (via GitHub Action ou rotina agendada).
3. No `intake`, reforçar a checagem de duplicidade: buscar issues abertas/fechadas parecidas com `gh issue list --search` antes de aceitar.

### Passo 10: melhoria contínua da fábrica

1. **Retrospectiva mensal:** agente `retro` que lê os `trabalhos/*/` fechados no mês e responde: quais áreas do código concentram bugs, quais issues passaram mais voltas (`ROUND`), quais checks mais falham. Saída: sugestões de mudança na fábrica (skill, CLAUDE.md, gate), não no código.
2. **Roteador de modelo:** no frontmatter dos agentes, usar `haiku` para passos mecânicos (gate, pr, merge), e `sonnet`/`opus` para prd, techspec, execute-task e reviews. Ajustar pelo custo observado.
3. **Agente de docs/changelog:** depois do merge, atualizar o changelog e remover comentários de rastreio deixados pelos agentes.
4. **Futuro:** regras de negócio fixas e verificáveis (ex.: "um usuário não faz dois pagamentos em 5 s") escritas como testes de propriedade ou invariantes que o gate sempre roda.

---

## 4. Ordem sugerida

| # | Passo | Por quê agora |
|---|---|---|
| 1 | Gate com ferramentas reais | É o que permite não ler todo o código |
| 2 | Limite de turnos | Evita loops caros |
| 3 | Raio de explosão no intake/prd | Base para merge e priorização |
| 4 | Merge pelo risco | Tira o humano dos tickets pequenos |
| 5 | Revisor de arquitetura | Segura a degradação do código |
| 6 | Contexto fixo do repo alvo | Reduz erros do implementador |
| 7 | Preview + QA + deploy | Fecha a esteira depois do merge |
| 8 | Priorizador | Útil quando o volume de issues crescer |
| 9 | Entrada automática | Idem |
| 10 | Retrospectiva e roteador | Melhora a fábrica, não o produto |

Regra de trabalho da fábrica: quando um ticket der errado, não corrija só o componente. Pergunte o que mudar no gate, no contexto ou na skill para o erro não se repetir.
