# Regras de derivação de cenário

Leia no passo 4 do `SKILL.md`: de onde cada cenário pode vir, a qual seção do `qa-manual.md` ele pertence e o teste que decide se entra no roteiro ou fica só no contrato de testes do `techspec.md`.

## Atribuição à tarefa

1. Pelos Entregáveis e Detalhes de Implementação de cada `## task_NN` do `tasks.md`, identifique qual rota, tela ou comando cada tarefa introduz (se algum).
2. Pelo `## Grafo` do `tasks.md`, confirme que isso já é alcançável de fora com aquela tarefa e as anteriores prontas, não com as que vêm depois.
3. Pelo `execute-task.md`, confirme que foi implementado como o techspec descreve; se mudou, vale o implementado.
4. Cenário derivado de uma rota, tela ou comando vai para a seção da tarefa que o introduziu.
5. Cenário que precisa do comportamento de duas tarefas sem dependência entre si vai para `## Cenários cross-task`.
6. Tarefa sem cenário atribuído e que, pelos passos 1 e 2, não expõe nada recebe a Forma B do template.

## Teste de inclusão

Um candidato vira cenário **só se** as três respostas forem "sim":

1. **É observável de fora?** Dá para ver o resultado sem abrir código, log ou banco: só a resposta da API, a tela ou a saída do comando.
2. **Reproduz com ação simples?** Um `curl`, um comando ou poucos cliques, sem mock, injeção de falha ou estado interno artificial.
3. **O resultado esperado é concreto?** Dá para escrever o valor exato (status, campo, texto na tela). "Deve funcionar" não passa.

Falhou em uma → não vira cenário. Se está no contrato de testes, vai para "Fora deste roteiro" com o motivo; se é só implementação, não entra em lugar nenhum.

## Mapeamento por fonte

| Fonte | Vira cenário | Não vira |
|---|---|---|
| `techspec.md`, API/fluxo de UI | um caminho feliz por operação principal, com o exemplo de request e response documentado | detalhe de implementação da camada |
| `techspec.md`, status codes | um cenário por erro documentado | status interno que a API nunca expõe |
| `techspec.md`, riscos conhecidos | só o risco reproduzível à mão (ex.: duas chamadas simultâneas), sempre `[Complementar]` | risco que só aparece em escala ou carga |
| `prd.md`, critérios de aceite (`AC-N`) | todo AC observável; se já coberto por um cenário do techspec, mescle | AC de intenção de negócio sem comportamento testável (ex.: "reduz tempo de suporte") |
| `prd.md`, casos de borda (`EC-N`) | todo EC com condição e comportamento observável | EC de fluxo que esta issue não implementa |
| contrato de testes, `E2E`/`IT` | checklist de cobertura: cada um tem cenário correspondente ou entra em "Fora deste roteiro" | `UT`, granular demais para ser visto de fora |
| `execute-task.md` | ajuste de rota, campo ou mensagem que mudou na implementação | decisões internas sem efeito visível |

## Mesclagem

Antes de escrever, agrupe candidatos que testam o mesmo comportamento observável, mesmo de fontes diferentes (um `AC` do PRD e um `E2E` do contrato = **um** cenário). Prefira o exemplo concreto do techspec à descrição abstrata do PRD.

## Prioridade

- **Essencial:** caminho feliz de toda operação principal; todo erro de validação ou não-encontrado documentado no techspec; todo AC obrigatório do PRD ("deve").
- **Complementar:** borda que exige setup incomum (concorrência, volume, ordenação); comportamento recomendado ("deveria"); o que, se falhar, não impede a entrega mas vale registrar.

## Tamanho

Referência por seção: 3 a 8 cenários por tarefa e no cross-task. Passou muito disso: registre em `## Notas` que a tarefa parece grande demais, em vez de dividir o roteiro artificialmente.

## Formato do passo por tipo de mudança

- **API REST:** `curl` com método, URL completa, `-H "Content-Type: application/json"` quando houver corpo e `-d` com o JSON exato do exemplo do techspec.
- **Tela web:** ação de usuário ("Acesse `/tarefas`", "Clique em 'Excluir' na linha da tarefa X", "Confirme no modal"), nunca nome de componente ou seletor CSS.
- **CLI:** o comando exato, com flags, como o usuário digitaria.

Use sempre valores reais do exemplo documentado (ID, nome, payload), não `<seu-valor-aqui>`. Placeholder só para valor que o próprio roteiro manda anotar antes (ex.: o `<id>` retornado no Setup).
