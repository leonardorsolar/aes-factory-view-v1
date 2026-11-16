# Template do Roteiro de QA Manual

Um arquivo por `task_NN`, mais `geral.md` quando houver cenário cross-task. Três formas de conteúdo, dependendo do que a tarefa expõe (ver Passo 1-2 do `SKILL.md`).

## Forma A — Tarefa com comportamento observável próprio

```markdown
# Teste Manual — [Nome da Feature] — task_NN: [título da tarefa]

Roteiro para QA humano. Baseado em `_techspec.md` (v[N]) e `task_NN.md`.
Para o contrato de testes automatizados, ver `_tests.md`.

## Setup (uma vez, antes de todos os cenários)

- [comando para subir o projeto]
- [dado necessário no banco antes de começar]
- [ferramenta usada nos exemplos: curl / Postman / navegador]

## Caminho Feliz

### [Essencial] Cenário 1: [nome em linguagem de usuário]

**O que confirma:** [1 frase]

**Passos:**
1. [passo concreto, com comando/ação real]

**Resultado esperado:** [status code + corpo exato, ou comportamento visível exato]

- [ ] Passou   - [ ] Falhou — anote aqui o que aconteceu de diferente:

## Validação e Erros
[mesma estrutura]

## Casos de Borda
[mesma estrutura, marcados Complementar quando cabível]

## Fora deste roteiro

[lista curta do que existe em _tests.md/PRD mas não virou cenário manual, com o motivo]
```

## Forma B — Tarefa sem comportamento observável próprio

Usada quando a tarefa é só lógica interna (classe de erro, repositório, service) e nenhuma rota/tela nova fica alcançável de fora só com ela pronta.

```markdown
# Teste Manual — [Nome da Feature] — task_NN: [título da tarefa]

## Por que este arquivo não tem cenário de teste

Esta tarefa entrega [resumo em 1 frase do que ela implementa — ex.: "a classe de erro e os métodos de repositório/service para deletar uma tarefa"], mas não expõe rota nem tela por conta própria. Não há como testar isso manualmente de fora até `task_[MM]` ([título dela]) estar pronta.

**Quando `task_[MM]` estiver concluída**, use o roteiro `task_[MM].md` — ele cobre o comportamento que esta tarefa torna possível.
```

## Forma C — `geral.md` (cenários cross-task)

```markdown
# Teste Manual — [Nome da Feature] — Cenários Cross-Task

Cenários que só fazem sentido testando o resultado combinado de mais de uma tarefa. Requer que todas as tarefas citadas em cada cenário já estejam concluídas.

### [Essencial ou Complementar] Cenário N: [nome]

**Requer:** `task_NN` e `task_MM` concluídas.

**O que confirma:** [1 frase]

**Passos:**
1. [passo concreto]

**Resultado esperado:** [exato]

- [ ] Passou   - [ ] Falhou — anote aqui o que aconteceu de diferente:
```

## Exemplo real — `delete-tasks`

### `qa/task_01.md` (Forma B)

```markdown
# Teste Manual — Delete Tasks — task_01: Core Delete Logic

## Por que este arquivo não tem cenário de teste

Esta tarefa entrega a classe `NotFoundError` e os métodos `deleteById` no repositório e no service, mas não registra nenhuma rota. Não há como testar isso manualmente de fora até `task_02` (HTTP Layer + Wiring) estar pronta.

**Quando `task_02` estiver concluída**, use o roteiro `task_02.md` — ele cobre o comportamento que esta tarefa torna possível.
```

### `qa/task_02.md` (Forma A)

```markdown
# Teste Manual — Delete Tasks — task_02: HTTP Layer + Wiring

Roteiro para QA humano. Baseado em `_techspec.md` (v1) e `task_02.md`.

## Setup (uma vez, antes de todos os cenários)

- Suba o projeto: `npm run dev`
- Garanta que existe ao menos uma tarefa cadastrada — se não tiver, crie uma:
  `curl -X POST http://localhost:3000/tasks -H "Content-Type: application/json" -d '{"title":"Tarefa de teste"}'`
- Anote o `id` retornado.

## Caminho Feliz

### [Essencial] Cenário 1: Deletar uma tarefa existente

**O que confirma:** o endpoint remove a tarefa e retorna os dados dela.

**Passos:**
1. `curl -i -X DELETE http://localhost:3000/tasks/<id>`

**Resultado esperado:** status `200`, corpo com a tarefa deletada.

- [ ] Passou   - [ ] Falhou — anote aqui o que aconteceu de diferente:

## Validação e Erros

### [Essencial] Cenário 2: ID inválido

**Passos:** `curl -i -X DELETE http://localhost:3000/tasks/abc` (repita com `0`, `-5`, `3.5`)

**Resultado esperado:** status `400`, `{ "error": "ID invalido" }` em todos os casos.

- [ ] Passou   - [ ] Falhou — anote aqui o que aconteceu de diferente:

### [Essencial] Cenário 3: Tarefa que não existe

**Passos:** `curl -i -X DELETE http://localhost:3000/tasks/999999`

**Resultado esperado:** status `404`, `{ "error": "Tarefa nao encontrada" }`.

- [ ] Passou   - [ ] Falhou — anote aqui o que aconteceu de diferente:

## Casos de Borda

### [Complementar] Cenário 4: Deletar a mesma tarefa duas vezes ao mesmo tempo

**Passos:** crie uma tarefa, anote o `<id>`, dispare `curl -i -X DELETE http://localhost:3000/tasks/<id>` em dois terminais quase ao mesmo tempo.

**Resultado esperado:** uma chamada retorna `200`, a outra `404` — nenhuma `500`.

- [ ] Passou   - [ ] Falhou — anote aqui o que aconteceu de diferente:

## Fora deste roteiro

- Verificação de que a query usa `prisma.task.delete` internamente: implementação, não comportamento observável.
```
