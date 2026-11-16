# Template — `.aes/tasks/<slug>/aprendizado.md`

Estrutura fixa, sempre nesta ordem. Cada seção só entra se houver fonte real — nunca preencha
com suposição. Se uma seção inteira ficar sem conteúdo (ex.: nenhuma decisão não-óbvia
encontrada), omita a seção por completo, não deixe o cabeçalho vazio.

```markdown
# Aprendizado: <nome da task>

## O que foi feito
<2-4 frases em linguagem simples, sem jargão técnico. Fonte: _prd.md (objetivo/escopo) e
_user_stories.md (o que o usuário final ganha). Responde "o que foi construído", não "como".>

## Como foi implementado
<3-6 frases descrevendo a abordagem técnica escolhida, sem jargão desnecessário — pode nomear
tecnologias/camadas quando isso for a informação relevante (ex. "nova rota REST", "tabela nova
no SQLite"), mas não despeja nomes de classes/funções internas. Fonte: _techspec.md.>

## Decisões que vale saber
<0-3 bullets. Só entra decisão genuinamente não-óbvia — ou seja, que alguém lendo o código não
adivinharia sozinho e que teve alternativa descartada com uma razão registrada em ADR. Cada
bullet cita o ADR por link relativo, nunca reproduz o corpo dele:

- Decidimos X em vez de Y porque Z (ver [ADR-NNN: Título](adrs/adr-NNN.md))

Se não houver nenhuma decisão nessas condições, omita a seção inteira.>

## Tempo
<1-2 frases: tempo total gasto na task (soma das subtasks, via _tasks.md/task_NN.md) e, só se
houver desvio notável, qual subtask destoou do esperado e por quê (ex. retrabalho apontado em
reviews-NNN/issue_NNN.md). Sem fonte de tempo, omita a seção inteira em vez de estimar.>
```

## Notas de preenchimento

- "Linguagem simples" na primeira seção significa: escreva para alguém que não vai abrir o
  código, mas que entende o produto. Evite termos como "endpoint", "repository", "middleware"
  aqui — eles são aceitáveis em "Como foi implementado".
- Nunca junte conteúdo de duas tasks num único `aprendizado.md` — é um arquivo por `slug`
  (equivalente a uma task/feature do pipeline), não por `task_NN`.
- Este arquivo é sempre regravado por completo ao regenerar (ver `SKILL.md` § Reabertura) — não
  é editado incrementalmente.
