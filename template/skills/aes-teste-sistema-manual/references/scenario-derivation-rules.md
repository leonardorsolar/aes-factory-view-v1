# Regras de Derivação de Cenário

Tabela de decisão: de onde cada cenário pode vir, e o teste para saber se ele entra no roteiro manual ou fica só no `_tests.md`.

## Regra de atribuição à tarefa

Antes de aplicar o teste de inclusão acima, decide **a qual arquivo** um candidato pertence:

1. Identifica, via `Deliverables`/`Implementation Details` de cada `task_NN.md`, qual rota/tela cada tarefa introduz (se alguma).
2. Usa `_tasks.md` (grafo) para confirmar que essa rota já é alcançável de fora só com aquela tarefa e as que vêm antes dela no grafo prontas — não com tarefas que vêm depois.
3. Um cenário derivado de um endpoint vai para o arquivo da tarefa que registrou aquele endpoint (passo 1-2).
4. Um cenário que precisa de comportamento de **duas tarefas sem relação de dependência entre si** (nenhuma delas sozinha, mais as que vêm antes, alcança o que o cenário testa) vai para `geral.md`.
5. Uma tarefa para a qual nenhum cenário foi atribuído nos passos 3-4, e que segundo o passo 1-2 não expõe nada por conta própria, recebe a Forma B do template (sem cenário, com apontamento para a tarefa dependente).

## Caminho de saída

```
.aes/tasks/<slug>/
└── qa/
    ├── task_01.md
    ├── task_02.md
    ├── ...
    └── geral.md          # só se houver ao menos um cenário cross-task
```

Mesmo padrão de pasta única já usado por `diagrams/` — flat, glob simples.

## Teste de inclusão (aplicar a todo candidato já atribuído a um arquivo)

Um item vira cenário manual **somente se** as três perguntas abaixo forem "sim":

1. **É observável de fora?** Alguém consegue ver o resultado sem abrir código, log de aplicação ou banco de dados diretamente (só a resposta da API, ou a tela).
2. **É reproduzível com uma ação simples?** Um comando `curl`/uma sequência curta de cliques — não precisa de mock, de injeção de falha, ou de estado interno artificial.
3. **O resultado esperado é concreto?** Dá para escrever o valor exato (status code, campo, texto na tela) — "deve funcionar" não passa nesse teste.

Falhou em qualquer uma das três → não vira cenário aqui. Fica só documentado em `_tests.md` (se já estiver lá) ou não entra em lugar nenhum se for puramente de implementação.

## Mapeamento por fonte

| Fonte | O que virar cenário | O que NÃO vira |
|---|---|---|
| `_techspec.md` → API Endpoints | Um cenário de caminho feliz por endpoint principal, usando o exemplo de request/response já documentado | Detalhe de implementação da camada (ex.: "usa Prisma") |
| `_techspec.md` → tabela de Status Codes | Um cenário por status code de erro documentado | Status code interno que nunca é exposto pela API |
| `_techspec.md` → Known Risks | Só o risco que é reproduzível manualmente (ex.: concorrência com duas chamadas) — marcado `[Complementar]`, nunca `[Essencial]` | Risco que só se manifesta em escala/carga (não reproduzível manualmente) |
| `_prd.md` → Acceptance Criteria (`AC-N`) | Todo AC observável vira cenário — geralmente correspondem ao caminho feliz ou a uma validação já coberta pelo TechSpec (nesse caso, mescla em vez de duplicar) | AC que descreve intenção de negócio sem comportamento testável isolado (ex.: "reduz tempo de suporte") |
| `_user_stories.md` → Edge Cases (`EC-N`) | Todo EC que descreve condição + comportamento observável | EC de personas/fluxos que a feature atual não implementa ainda (fora de escopo desta rodada) |
| `_tests.md` → `E2E-`/`IT-` | Usado como **checklist de cobertura** — todo `E2E-`/`IT-` deveria ter um cenário manual correspondente; se não tiver, ou vira cenário, ou entra em "Fora deste roteiro" com o motivo | `UT-` (unitário) quase nunca vira cenário manual — é granular demais para ser observável de fora |

## Regra de mesclagem (evita duplicata)

Antes de escrever, agrupa candidatos que descrevem o mesmo comportamento observável, mesmo vindos de fontes diferentes (um `AC` do PRD + um `E2E-` do `_tests.md` que testam a mesma coisa = **um** cenário). O cenário final cita a origem mais específica disponível (prefere o exemplo real do TechSpec sobre a descrição mais abstrata do PRD).

## Regra de priorização (`Essencial` vs `Complementar`)

- **Essencial:** caminho feliz de toda operação principal; todo erro de validação/não-encontrado documentado explicitamente no TechSpec; todo AC do PRD marcado (implicitamente) como obrigatório pela linguagem do documento ("deve", "shall").
- **Complementar:** casos de borda que exigem setup incomum (concorrência, volume, ordenação); comportamento "should" (recomendado, não obrigatório) do PRD; qualquer coisa que, se falhar, não impede a entrega mas vale registrar.

## Regra de tamanho

Referência agora é **por arquivo**: 3-8 cenários por `task_NN.md`, mesma faixa para `geral.md`. Se uma tarefa sozinha passar bem disso, é sinal de que ela deveria ter sido dividida em `aes-create-tasks` — avisa o usuário em vez de forçar um arquivo longo, em vez de dividir artificialmente o roteiro.

## Formato de comando por tipo de feature

- **API REST:** `curl` com método, URL completa, `-H "Content-Type: application/json"` quando houver corpo, e `-d` com o JSON exato do exemplo do TechSpec.
- **UI web:** passo descrito como ação de usuário ("Acesse `/tarefas`", "Clique no botão 'Excluir' da linha da tarefa X", "Confirme no modal") — nunca nome de componente React ou seletor CSS.
- **CLI:** comando exato como o usuário digitaria, incluindo flags.

Sempre usa valores reais do exemplo documentado (ID, nome, payload) — nunca `<seu-valor-aqui>` genérico quando o TechSpec já forneceu um exemplo concreto.
