# Template do qa-manual.md

Leia antes de gravar o roteiro. Um único arquivo por issue, com uma seção por `task_NN` (na ordem do `tasks.md`) e, se houver, a seção de cenários cross-task. Cada seção de tarefa usa a Forma A ou a Forma B, conforme o passo 2 do `SKILL.md`.

## Esqueleto do arquivo

```markdown
VERDICT: DONE

# Teste manual: <nome da feature em linguagem de usuário> (issue <n>)

Roteiro para QA humano. Baseado em `techspec.md`, `tasks.md`, `execute-task.md` e `pr.md` da issue <n>.
O contrato de testes automatizados está no `techspec.md`.

## Setup (uma vez, antes de todos os cenários)
- <branch e link do PR, tirados do pr.md: `git checkout <branch>`>
- <comando real para subir o app, com a porta>
- <dado que precisa existir antes, com o comando para criá-lo>
- <ferramenta usada nos exemplos: curl, navegador, terminal>

## task_01: <título da tarefa>
<Forma A ou Forma B>

## task_02: <título da tarefa>
<Forma A ou Forma B>

## Cenários cross-task
<Forma C; omita a seção se não houver nenhum>

## Fora deste roteiro
- <item do contrato de testes ou do PRD que não virou cenário, com o motivo>

## Notas
- <limitações, tarefas grandes demais, regravação de roteiro anterior; omita se vazio>
```

## Forma A: tarefa com comportamento observável

```markdown
## task_NN: <título>

### Caminho feliz

#### [Essencial] Cenário 1: <nome em linguagem de usuário>
**O que confirma:** <1 frase>
**Passos:**
1. <ação concreta e copiável>
**Resultado esperado:** <status + corpo exato, ou o que aparece na tela>
- [ ] Passou   - [ ] Falhou: anote o que aconteceu de diferente:

### Validação e erros
<mesma estrutura>

### Casos de borda
<mesma estrutura, `[Complementar]` quando couber>
```

Omita uma subseção (Validação e erros, Casos de borda) que ficar vazia. A numeração dos cenários é contínua no arquivo inteiro, para o QA citar "Cenário 7" sem ambiguidade.

## Forma B: tarefa sem comportamento observável

Use quando a tarefa é só lógica interna e nenhuma rota, tela ou comando fica alcançável com ela (e as anteriores no grafo) pronta.

```markdown
## task_NN: <título>

Sem cenário próprio. Esta tarefa entrega <resumo em 1 frase, sem nome de classe>, mas não expõe rota, tela nem comando sozinha. Ela fica testável quando `task_MM` (<título>) estiver pronta: use a seção `task_MM`.
```

## Forma C: cenários cross-task

```markdown
## Cenários cross-task

Só fazem sentido com o resultado combinado de mais de uma tarefa. Rode quando todas as tarefas citadas estiverem prontas.

#### [Essencial] Cenário N: <nome>
**Requer:** `task_NN` e `task_MM`.
**O que confirma:** <1 frase>
**Passos:**
1. <ação concreta>
**Resultado esperado:** <exato>
- [ ] Passou   - [ ] Falhou: anote o que aconteceu de diferente:
```

## Exemplo completo: issue 12, deletar tarefas

```markdown
VERDICT: DONE

# Teste manual: Deletar tarefas (issue 12)

Roteiro para QA humano. Baseado em `techspec.md`, `tasks.md`, `execute-task.md` e `pr.md` da issue 12.
O contrato de testes automatizados está no `techspec.md`.

## Setup (uma vez, antes de todos os cenários)
- Pegue a branch do PR #34: `git checkout feature/app-issue-12`
- Suba o app: `npm run dev` (porta 3000)
- Crie uma tarefa: `curl -X POST http://localhost:3000/tasks -H "Content-Type: application/json" -d '{"title":"Tarefa de teste"}'`
- Anote o `id` retornado.

## task_01: Lógica de exclusão

Sem cenário próprio. Esta tarefa entrega a regra de exclusão e o erro de "não encontrada", mas não expõe rota, tela nem comando sozinha. Ela fica testável quando `task_02` (Rota de exclusão) estiver pronta: use a seção `task_02`.

## task_02: Rota de exclusão

### Caminho feliz

#### [Essencial] Cenário 1: Deletar uma tarefa existente
**O que confirma:** a tarefa some e a API devolve os dados dela.
**Passos:**
1. `curl -i -X DELETE http://localhost:3000/tasks/<id>`
**Resultado esperado:** status `200`, corpo com a tarefa deletada.
- [ ] Passou   - [ ] Falhou: anote o que aconteceu de diferente:

### Validação e erros

#### [Essencial] Cenário 2: ID inválido
**O que confirma:** a API recusa IDs que não são números inteiros positivos.
**Passos:**
1. `curl -i -X DELETE http://localhost:3000/tasks/abc` (repita com `0`, `-5` e `3.5`)
**Resultado esperado:** status `400` e `{ "error": "ID invalido" }` em todos os casos.
- [ ] Passou   - [ ] Falhou: anote o que aconteceu de diferente:

#### [Essencial] Cenário 3: Tarefa que não existe
**O que confirma:** a API avisa quando não há o que deletar.
**Passos:**
1. `curl -i -X DELETE http://localhost:3000/tasks/999999`
**Resultado esperado:** status `404` e `{ "error": "Tarefa nao encontrada" }`.
- [ ] Passou   - [ ] Falhou: anote o que aconteceu de diferente:

### Casos de borda

#### [Complementar] Cenário 4: Deletar a mesma tarefa duas vezes ao mesmo tempo
**O que confirma:** exclusões simultâneas não quebram o servidor.
**Passos:**
1. Crie uma tarefa e anote o `<id>`.
2. Em dois terminais, rode quase ao mesmo tempo `curl -i -X DELETE http://localhost:3000/tasks/<id>`.
**Resultado esperado:** uma chamada retorna `200` e a outra `404`; nenhuma retorna `500`.
- [ ] Passou   - [ ] Falhou: anote o que aconteceu de diferente:

## Fora deste roteiro
- Uso interno do ORM na exclusão: implementação, não comportamento observável.
```
