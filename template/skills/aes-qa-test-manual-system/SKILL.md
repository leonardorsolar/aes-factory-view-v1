---
name: aes-qa-test-manual-system
description: Gera o roteiro de teste manual de uma issue da fábrica, curto e em linguagem simples, para um QA humano executar sem ler código. Roda depois do PR: lê techspec.md, tasks.md, prd.md, execute-task.md e pr.md da pasta apps/<app>/trabalhos/issue-<n>/ e grava qa-manual.md, com uma seção por task_NN e cenários que atravessam tarefas. Use quando o agente qa-manual for acionado, ou quando o usuário pedir "roteiro de QA", "teste manual", "teste de sistema" ou "o que o QA precisa testar" de uma issue da fábrica, mesmo sem citar o nome da skill. Não gera o contrato de testes automatizados (UT/IT/E2E, que é do aes-create-techspec), não executa os testes e não edita código.
---

# Teste de sistema manual (QA humano)

Usada pelo agente `qa-manual` (definições, ferramentas e limites estão em `.claude/agents/qa-manual.md`). Lições de feedback seguem a seção "Ao receber feedback" do agente; mudanças nesta skill só com aprovação do usuário.

O contrato de testes dentro do `techspec.md` (IDs `UT`/`IT`/`E2E`) é escrito para quem automatiza: um caso por comportamento, cobertura exaustiva. Por isso ele é grande e técnico para quem só precisa **chamar a API ou clicar na tela e conferir o resultado**. Esta skill separa as duas audiências: gera um roteiro curto, com passos copiáveis, que um QA roda sem abrir código.

A etapa é **opcional** no ciclo: roda depois do `pr`, em paralelo ao `approve`, e não bloqueia o merge. O roteiro é um apoio ao QA, que decide se e quando executá-lo.

## Regras do roteiro

Estas regras são firmes porque, se quebradas, o QA testa algo errado ou perde confiança no roteiro:

- **Curto acima de completo.** Cubra o que uma pessoa precisa checar para confiar na entrega, não 100% do contrato de testes. O que só faz sentido automatizado fica em "Fora deste roteiro".
- **Passo concreto.** Todo passo é uma ação executável: `curl` com valores reais, comando de CLI exato ou ação de tela ("clique em Excluir na linha da tarefa X"). Nunca "testar o endpoint de delete".
- **Sem jargão de implementação.** Nada de `UT-`/`IT-`/`E2E-`, nome de classe, camada ou componente. O QA não precisa saber o que é `TaskRepository`.
- **Sem cenário inventado.** Todo cenário vem de `techspec.md`, `tasks.md`, `prd.md` ou `execute-task.md`. Sem fonte, não entra.
- **Tarefa sem nada observável não ganha passo falso.** Se a `task_NN` é só lógica interna (sem rota, tela ou comando novo), a seção dela diz isso e aponta a tarefa que torna o comportamento testável.

## Entrada

Pasta do job: `apps/<app>/trabalhos/issue-<n>/`.

| Arquivo | Obrigatório | Para quê |
|---|---|---|
| `techspec.md` | sim (`VERDICT: DONE`) | endpoints, exemplos de payload, status codes, riscos conhecidos e o contrato de testes (checklist de cobertura) |
| `tasks.md` | sim (`VERDICT: DONE`) | seções `## task_NN`, `## Grafo` (dependências) e `## Cobertura de testes` |
| `execute-task.md` | sim (`VERDICT: DONE`) | o que foi de fato implementado e desvios do techspec: o roteiro testa o que existe, não o que foi planejado |
| `pr.md` | sim (`VERDICT: PASS`) | branch e link do PR: o Setup manda o QA testar exatamente esse código |
| `prd.md` | se existir | critérios de aceite (`AC-N`) e casos de borda (`EC-N`) das user stories |
| código do app (`<path>`) | só leitura | comando real para subir o app, porta, rota base, dados de seed |

Sem algum obrigatório, ou com veredito diferente do indicado, a skill não grava roteiro: o agente para e avisa (ver o agente).

## Fluxo

1. **Descubra como subir o app.** Pegue no `pr.md` a branch e o link do PR: o primeiro passo do Setup é colocar essa branch no ar (ex.: `git checkout <branch>`). Leia `apps/<app>/contexto.md`, o `AGENTS.md`/`CLAUDE.md` e o `package.json` (ou equivalente) do app. O Setup do roteiro usa o comando e a porta reais, porque um Setup errado invalida todos os cenários.
2. **Mapeie o que cada tarefa expõe.** Para cada `## task_NN` do `tasks.md`, cruze Entregáveis e Detalhes de Implementação com a seção de API/fluxo de UI do techspec: a tarefa, sozinha e com as que vêm antes dela no `## Grafo`, deixa algo alcançável de fora? Confira no `execute-task.md` se isso foi mesmo implementado.
3. **Tarefas sem comportamento observável** recebem a Forma B do template (sem cenário, apontando a tarefa que torna aquilo testável). Não é falha: é a resposta certa para esse tipo de tarefa.
4. **Extraia e atribua cenários** à tarefa que introduziu o comportamento, sem duplicar entre tarefas: caminho feliz e erros (API/status codes do techspec), casos de borda observáveis (`AC-N`/`EC-N` do PRD) e riscos reproduzíveis à mão (riscos conhecidos do techspec). Aplique o teste de inclusão e a regra de mesclagem de `references/scenario-derivation-rules.md`.
5. **Cenários que atravessam tarefas** (só fazem sentido com duas ou mais prontas) vão para `## Cenários cross-task`, com a lista de tarefas exigidas.
6. **Priorize e limite.** Cada cenário é `[Essencial]` ou `[Complementar]`. Referência: 3 a 8 cenários por tarefa e no cross-task. Uma tarefa que passa muito disso provavelmente deveria ter sido dividida no `tasks.md`: registre em `## Notas` em vez de forçar um roteiro longo.
7. **Confira a cobertura.** Todo `E2E`/`IT` do contrato de testes deve ter um cenário correspondente ou aparecer em "Fora deste roteiro" com o motivo. `UT` quase nunca vira cenário.
8. **Grave `qa-manual.md`** seguindo `references/qa-manual-template.md` (leia antes de escrever). Se o arquivo já existir (volta do ciclo), regrave por inteiro: marcações de Passou/Falhou antigas não são preservadas, e isso vai em `## Notas`.

## Checklist de qualidade

- [ ] 1ª linha é `VERDICT: DONE` ou `VERDICT: BLOCKED`, sem texto antes
- [ ] Setup começa pela branch do PR e usa o comando, a porta e os dados reais do app
- [ ] Há uma seção `## task_NN` para cada tarefa do `tasks.md`, na mesma ordem
- [ ] Todo passo é copiável e todo resultado esperado é exato (status, campo, texto na tela)
- [ ] Nenhum `UT-`/`IT-`/`E2E-`, nome de classe ou camada no texto dos cenários
- [ ] Nenhum cenário sem fonte nos documentos da issue
- [ ] Todo `E2E`/`IT` do contrato está coberto ou listado em "Fora deste roteiro"
- [ ] Desvios do `execute-task.md` em relação ao techspec estão refletidos (o roteiro testa o que foi feito)

## Formato de saída

Um único arquivo, `apps/<app>/trabalhos/issue-<n>/qa-manual.md`. Exemplo curto (estrutura completa em `references/qa-manual-template.md`):

```markdown
VERDICT: DONE

# Teste manual: Deletar tarefas (issue 12)

Roteiro para QA humano. Baseado em `techspec.md`, `tasks.md`, `execute-task.md` e `pr.md`.

## Setup
- Pegue a branch do PR #34: `git checkout feature/app-issue-12`
- Suba o app: `npm run dev` (porta 3000)
- Crie uma tarefa: `curl -X POST http://localhost:3000/tasks -H "Content-Type: application/json" -d '{"title":"Tarefa de teste"}'` e anote o `id`.

## task_01: Lógica de exclusão
Sem cenário próprio: esta tarefa não expõe rota nem tela. Use a seção `task_02`, que cobre o comportamento que ela torna possível.

## task_02: Rota de exclusão
### [Essencial] Cenário 1: Deletar uma tarefa existente
**O que confirma:** a tarefa some e a API devolve os dados dela.
**Passos:**
1. `curl -i -X DELETE http://localhost:3000/tasks/<id>`
**Resultado esperado:** status `200`, corpo com a tarefa deletada.
- [ ] Passou   - [ ] Falhou: anote o que aconteceu de diferente:

## Fora deste roteiro
- Uso interno do ORM na exclusão: implementação, não comportamento observável.
```

`VERDICT: BLOCKED` vem com `## Blocked` dizendo o que falta e quem pode dar (ex.: o techspec não documenta nenhuma rota, tela ou comando e o código não mostra como acessar a mudança).

## Erros a evitar

- **Copiar o contrato de testes 1:1.** Vira um roteiro longo e técnico, que é o problema que esta skill resolve. Use o contrato só como checklist de cobertura.
- **`<seu-valor-aqui>` quando o techspec já tem exemplo.** Use os valores reais do exemplo documentado.
- **Inventar `curl` para tarefa interna.** Um comando que não testa nada dá falsa confiança.
- **Testar o plano em vez da entrega.** Se o `execute-task.md` registra que uma rota mudou de nome ou ficou de fora, o roteiro segue o que foi implementado.
- **Seletor CSS ou nome de componente em passo de tela.** Descreva como o usuário vê: texto do botão, título da página.
