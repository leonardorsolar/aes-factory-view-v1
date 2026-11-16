---
name: aes-create-aprendizado
description: Gera um resumo curto e legível, POR TASK (slug), do que foi feito, como foi implementado e — só quando houver decisão não-óbvia registrada em ADR — por quê, a partir de _prd.md, _user_stories.md, _techspec.md, adrs/*.md, _tasks.md e reviews-NNN/ já existentes, salvo em .aes/tasks/<slug>/aprendizado.md. Use quando o usuário pedir "aprendizado da task", "resumo da tarefa", "o que essa task fez", "ficha da tarefa", ou disser explicitamente "aes-create-aprendizado" — sempre depois que a task já foi concluída, nunca como parte automática da execução. Não substitui aes-workflow-memory (memória de execução entre tasks, em .aes/tasks/<name>/memory/, usada para acelerar retomadas) nem gera proposta para .aes/memory/proposals/ (isso é outro pipeline, com pattern_kind: error/decision/timing, importado em memory_entries pela página /memoria) — este arquivo é um resumo de leitura humana, não uma regra reaproveitável nem memória de execução. Não use para gerar o roteiro de QA manual (isso é aes-teste-sistema-manual) nem o contrato de testes automatizados (aes-create-techspec).
---

# Plataforma AES — Aprendizado da Task

Depois que uma task é concluída, o que sobra em disco são documentos técnicos (`_prd.md`,
`_techspec.md`, ADRs, `_tasks.md`) — bons para quem vai implementar a próxima, ruins para quem só
quer entender rápido "o que essa task fez, como, e por quê" sem reabrir cinco arquivos. Esta
skill lê o que já existe e escreve um único resumo curto, em `.aes/tasks/<slug>/aprendizado.md`,
para esse segundo público.

<HARD-GATE>
- **Nunca especula.** Se uma fonte não tiver a informação de uma seção, a seção inteira é
  omitida — nunca preenchida com suposição ou frase genérica ("a implementação seguiu boas
  práticas" não é uma frase válida).
- **"Decisões que vale saber" só entra com ADR de verdade.** Uma decisão só aparece se houver
  alternativa descartada e razão registrada em `adrs/*.md`. Sem isso, a seção é omitida por
  completo — não vira lista de decisões triviais/óbvias.
- **Cita ADR, nunca reproduz.** Toda menção a ADR é um link relativo mais uma frase de
  relevância — nunca o corpo do ADR copiado ou parafraseado extensamente.
- **Roda só manualmente.** Não é disparada automaticamente ao fim de uma task nem por outra
  skill — o usuário decide quando gerar.
- **Não é proposta de memória.** Não grava em `memory_entries` nem em
  `.aes/memory/proposals/*.md`. Esse pipeline é do `aes-workflow-memory`/módulo de memória; esta
  skill produz um artefato de leitura separado.
</HARD-GATE>

## Entrada

- `slug` (obrigatório) — `.aes/tasks/<slug>/`.

## Passo 0 — Validação de Entrada

0. Confirme a raiz do projeto: é o diretório que contém `AGENTS.md`, `CLAUDE.md` ou
   `.cursorrules` (num workspace com subpastas como `backend/`/`frontend/`, esses arquivos ficam
   um nível acima, nunca dentro delas). Se o diretório atual não for esse, localize-o e mude para
   lá antes de tocar em `.aes/`. Só na ausência desses marcadores em qualquer nível acima, caia
   para o diretório que já contém `.aes/tasks/`; só na ausência de ambos, trate o diretório atual
   como raiz.
1. Exige `_prd.md` — fonte principal de "O que foi feito". Sem ele, recusa: "Preciso do
   `_prd.md` para saber o objetivo da task — roda `aes-create-prd` primeiro."
2. Exige `_techspec.md` — fonte principal de "Como foi implementado". Sem ele, recusa: "Preciso
   do `_techspec.md` para saber a abordagem técnica — roda `aes-create-techspec` primeiro."
3. Lê também, se existirem (não bloqueiam, só enriquecem): `_user_stories.md` (o que o usuário
   final ganha), `adrs/*.md` (decisões não-óbvias), `_tasks.md` e `task_NN.md` (tempo por
   subtask), `reviews-NNN/issue_NNN.md` (retrabalho relevante).

## Fluxo de Trabalho

### 1. "O que foi feito"

Extraia de `_prd.md` (objetivo, escopo) e `_user_stories.md` (o que o usuário final ganha) uma
síntese de 2-4 frases, em linguagem simples — sem nomear rota, classe ou tabela. Responde "o que
foi construído", nunca "como".

### 2. "Como foi implementado"

Extraia de `_techspec.md` a abordagem técnica escolhida, em 3-6 frases. Pode nomear
tecnologia/camada quando isso for a informação relevante (ex. "nova rota REST", "tabela nova no
SQLite"), mas sem despejar nomes de classes/funções internas que só fazem sentido para quem vai
mexer no código.

### 3. "Decisões que vale saber"

Cruze com `adrs/*.md`. Uma decisão só entra se: (a) teve alternativa considerada e descartada, e
(b) a razão está registrada no ADR — não em inferência sua. Formato de cada bullet, igual ao
padrão de citação de ADR já usado em `aes-create-tasks` (`references/task-template.md`):

```markdown
- Decidimos X em vez de Y porque Z (ver [ADR-NNN: Título](adrs/adr-NNN.md))
```

Zero a três bullets. Sem nenhuma decisão nessas condições, omita a seção inteira.

### 4. "Tempo"

Leia `_tasks.md` (grafo/lista de subtasks) e, se precisar de granularidade, cada `task_NN.md`
(datas de criação/atualização) para calcular tempo total da task. Se `reviews-NNN/issue_NNN.md`
indicar retrabalho relevante em alguma subtask, ou uma subtask destoar visivelmente do tempo das
demais, mencione em uma frase — sem seção própria para isso, entra dentro de "Tempo". Sem fonte
de tempo utilizável, omita a seção inteira em vez de estimar.

### 5. Escrever o arquivo

Leia `references/aprendizado-template.md` para a estrutura markdown exata (incluindo notas de
quando omitir cada seção) e escreva `.aes/tasks/<slug>/aprendizado.md` seguindo-a à risca.

## Ao Final

Confirme: "Gerado `.aes/tasks/<slug>/aprendizado.md`." Se alguma seção foi omitida por falta de
fonte, liste rapidamente qual e por quê (ex.: "'Decisões que vale saber' omitida — nenhum ADR
encontrado.").

## Reabertura

Sempre regravado por completo quando rodado de novo — não é edição incremental. Avise: "
`aprendizado.md` regenerado com base no estado atual de `_prd.md`/`_techspec.md`/ADRs. Versão
anterior não é preservada."
