---
name: aes-teste-sistema-manual
description: Gera um roteiro de teste manual curto e em linguagem simples, POR TAREFA (task_NN) de uma feature do pipeline Plataforma AES, para QA humano executar sem precisar entender jargão técnico — a partir de _techspec.md, task_NN.md, _tasks.md, _prd.md e _user_stories.md já existentes. Use quando o usuário pedir "teste de sistema", "roteiro de QA", "teste manual" de uma tarefa ou feature, reclamar que o _tests.md é grande/técnico demais para um tester ler, ou disser explicitamente "aes-teste-sistema-manual". Não use para gerar o contrato de testes automatizados (UT-/IT-/E2E-, isso é aes-create-techspec) nem para executar/implementar código (aes-execute-task).
---

# Plataforma AES — Teste de Sistema Manual

`_tests.md` (gerado por `aes-create-techspec`) é um contrato técnico para quem escreve teste automatizado — IDs `UT-`/`IT-`/`E2E-`, um caso por comportamento, cobertura exaustiva. Isso é exatamente o que faz ele ser grande e difícil de ler para uma pessoa que só precisa **clicar/chamar a API e conferir se voltou certo**. Esta skill existe para separar as duas audiências: gera, **uma por `task_NN`**, um documento curto em prosa simples, com passos concretos e copiáveis, para um QA humano rodar manualmente sem abrir código.

<HARD-GATE>
- **Curto acima de completo.** O objetivo não é cobrir 100% dos casos do `_tests.md` — é cobrir o que um humano realmente precisa checar para confiar na entrega daquela tarefa. Cenários que só fazem sentido em teste automatizado ficam de fora daqui.
- **Nunca fabrica passo observável para tarefa que não expõe nada de fora.** Se `task_NN` é só lógica interna (sem rota/tela nova), o roteiro dela diz isso explicitamente em vez de inventar um `curl` que não testa nada de verdade — ver "Tarefas sem comportamento observável próprio" abaixo.
- **Passo concreto, nunca abstrato.** Todo passo é uma ação executável (comando `curl` real com valores reais, ou uma ação de UI descrita como "clique em X") — nunca "testar o endpoint de delete" sem dizer o comando exato.
- **Zero jargão de implementação.** Sem `UT-`/`IT-`/`E2E-`, sem nome de classe ou camada interna. QA não precisa saber o que é `TaskRepository`.
- Nunca inventa comportamento que não esteja em `_techspec.md`, `task_NN.md`, `_prd.md`, `_user_stories.md` ou `_tests.md` — se um cenário não tem fonte, não entra no roteiro.
</HARD-GATE>

## Entrada

- `slug` (obrigatório) — `.aes/tasks/<slug>/`.
- `tarefa` (opcional) — `task_01`, `task_02`... Se informada, gera/regenera só o roteiro dessa tarefa. Se omitida, gera um roteiro por `task_NN` existente na pasta, mais `geral.md` para cenários que atravessam mais de uma tarefa (ver Passo 4).

## Passo 0 — Validação de Entrada

0. Confirme a raiz do projeto: é o diretório que contém `AGENTS.md`, `CLAUDE.md` ou `.cursorrules` (num workspace com subpastas como `backend/`/`frontend/`, esses arquivos ficam um nível acima, nunca dentro delas). Se o diretório atual não for esse — por exemplo, o terminal abriu dentro de `backend/` —, localize-o e mude para lá antes de tocar em `.aes/`. Só na ausência desses marcadores em qualquer nível acima, caia para o diretório que já contém `.aes/tasks/`; só na ausência de ambos, trate o diretório atual como raiz.
1. Exige `_techspec.md` (fonte principal: endpoints reais, exemplos de payload, status codes). Sem ele, recusa: "Preciso do `_techspec.md` para ter os comandos e respostas reais — roda `aes-create-techspec` primeiro."
2. Exige ao menos um `task_NN.md` na pasta — sem `aes-create-tasks` já ter rodado, não há como atribuir cenário a uma tarefa específica. Sem eles, recusa e sugere rodar `aes-create-tasks` primeiro.
3. Lê `_tasks.md` (grafo de dependência) — essencial para saber que tarefa expõe o quê e o que depende do quê.
4. Lê também, se existirem (não bloqueiam, só enriquecem): `_prd.md` (Acceptance Criteria), `_user_stories.md` (Edge Cases), `_tests.md` (casos E2E/IT já pensados — usados como checklist de cobertura, nunca copiados 1:1).

## Fluxo de Trabalho

### 1. Mapear o que cada tarefa expõe

Para cada `task_NN.md`, cruza `Deliverables`/`Implementation Details` com a seção "API Endpoints" (ou fluxo de UI) do `_techspec.md`: essa tarefa **introduz, sozinha, algum endpoint/tela nova ou observável de fora**? Usa `_tasks.md` para saber a ordem de dependência — uma tarefa só é considerada "expõe algo" se, seguindo o grafo, o que ela entrega já é alcançável de fora assim que ela (e só ela, mais o que já veio antes dela) está pronta.

No exemplo `delete-tasks`: `task_01` (Core Delete Logic — Error class + Repository + Service) não registra rota nenhuma; `task_02` (HTTP Layer + Wiring) é quem liga isso a `DELETE /tasks/:id`. Então só `task_02` tem cenário de `curl` de verdade; `task_01` cai no caso especial abaixo.

### 2. Tarefas sem comportamento observável próprio

Se a tarefa não expõe nada de fora sozinha, o roteiro dela **não fabrica passo de API/UI**. Em vez disso, registra isso explicitamente e aponta qual tarefa (pelo grafo de `_tasks.md`) vai tornar aquilo testável — ver modelo em `references/qa-manual-template.md`. Continua sendo um arquivo curto, só que sem seção de cenários — não é uma falha, é a resposta certa para o tipo de tarefa.

### 3. Extrair e atribuir cenários (tarefas que expõem algo)

Mesma extração de antes, mas cada cenário é atribuído à tarefa que introduziu aquele comportamento — nunca duplicado entre tarefas:

- **Caminho feliz e erros/validação** — da seção "API Endpoints"/"Status Codes" do TechSpec, atribuídos à tarefa que registra aquela rota (passo 1).
- **Casos de borda observáveis** — de `_user_stories.md` (`EC-N`) e `_prd.md` (`AC-N`), atribuídos à tarefa cujo escopo cobre o comportamento descrito.
- **Riscos manualmente reprováveis** — de "Known Risks" do TechSpec, atribuídos à tarefa que implementa o componente em risco.

Mesmo teste de inclusão de antes (observável / reproduzível com ação simples / resultado concreto) e mesma regra de mesclagem contra `_tests.md` — detalhes em `references/scenario-derivation-rules.md`.

### 4. Cenários que atravessam mais de uma tarefa → `geral.md`

Um cenário que só faz sentido testando o resultado combinado de duas ou mais tarefas (ex.: criar via uma rota de uma tarefa e deletar via rota de outra, ou um fluxo ponta a ponta do PRD que nenhuma tarefa isolada cobre) não entra em nenhum `task_NN` — vai para `qa/geral.md`, com uma nota de quais tarefas precisam estar prontas antes de rodá-lo.

### 5. Priorizar e limitar tamanho — por arquivo, não pela feature inteira

- Classifica todo cenário como **Essencial** ou **Complementar**, igual antes.
- Referência de tamanho agora é **por tarefa**: 3-8 cenários por `task_NN.md` gerado. Se uma tarefa sozinha passar bem disso, é sinal de que ela deveria ter sido dividida lá em `aes-create-tasks` — avisa o usuário em vez de forçar um arquivo longo.
- `geral.md` segue a mesma referência (3-8), já que tende a ter poucos cenários por natureza (só os que realmente exigem mais de uma tarefa).

### 6. Escrever os roteiros

Leia `references/qa-manual-template.md` para a estrutura exata de cada tipo de arquivo (com cenário, sem cenário, e `geral.md`) e `references/scenario-derivation-rules.md` para as regras completas de atribuição, mesclagem e formatação de comando/passo.

Escreve `.aes/tasks/<slug>/qa/task_01.md`, `.aes/tasks/<slug>/qa/task_02.md` (um por `task_NN` existente), e `.aes/tasks/<slug>/qa/geral.md` quando houver ao menos um cenário cross-task.

## Formato de Cada Cenário (resumo — estrutura completa no template)

```markdown
### [Essencial] Cenário N: [nome em linguagem de usuário, não técnica]

**O que confirma:** [1 frase — por que esse teste existe]

**Passos:**
1. [ação concreta e copiável]
2. [ação concreta e copiável]

**Resultado esperado:** [status/valor exato — nunca "deve funcionar corretamente"]

- [ ] Passou   - [ ] Falhou — anote aqui o que aconteceu de diferente:
```

## Ao Final

Confirma listando por arquivo: "Gerados roteiros de QA: `task_01.md` (sem cenário observável — depende de `task_02`), `task_02.md` (4 cenários: 3 essenciais, 1 complementar), `geral.md` (1 cenário cross-task)." Se algo do `_tests.md`/PRD não pôde virar cenário manual, lista rapidamente o que ficou de fora e por quê.

## Reabertura

Se `_techspec.md` ou algum `task_NN.md` mudou de versão, regenera só os arquivos afetados por aquela mudança (não é preciso regenerar `task_01.md` porque `task_02.md` mudou, salvo se a mudança afetar a análise "expõe algo sozinha?" do passo 1). Cada `.md` de QA não é documento de edição manual incremental como o Excalidraw — é sempre regravado por completo quando regenerado, e avisa: "Roteiro de `[task_NN]` regenerado com base no TechSpec `v[N]`. Marcações de Passou/Falhou anteriores não são preservadas."
