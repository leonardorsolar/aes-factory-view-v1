# Proposta — agentes primeiro, ciclos visíveis, sem motor

Status: **rascunho para decisão** (nada disto está implementado).

## 1. Objetivo

Trabalhar no projeto da empresa com IA de forma simples, e poder **ver, entender e melhorar** como o trabalho flui. Três ideias:

1. **Agentes primeiro.** Um agente por fase do trabalho, com foco único, contexto isolado e ferramentas restritas. A pipeline nasce depois, como consequência.
2. **Instalação mínima no projeto da empresa:** só `CLAUDE.md` e `.claude/`. Sem Python, sem scripts, sem `.aes/`.
3. **O `new-project-view` é só o painel:** mostra ciclos como linha do tempo (colunas e cartões), diz onde estamos e deixa editar agentes e skills ali mesmo.

## 2. O que existe no projeto da empresa

```
projeto-da-empresa/
├── CLAUDE.md                      # guia lido em toda sessão + regras + ponteiro p/ os ciclos
└── .claude/
    ├── agents/*.md                # um arquivo por agente (name, description, tools, model + prompt)
    ├── skills/<nome>/SKILL.md     # playbooks (workflow + checklist), entram aos poucos
    ├── cycles/*.md                # ciclos: bug-simple, issue-complex, menor-custo...
    ├── memory.md                  # feedback que vale para o futuro (lido antes de cada tarefa)
    └── state.md                   # etapa atual de cada tarefa (o "onde estou")
```

- Se a empresa não aceitar `.claude/` versionado, usar `.git/info/exclude` (local, não vai ao repositório).
- `.aes/` **não** é instalado lá. O app guarda Scan, notas e diagramas fora do projeto da empresa.

## 3. Agentes (o centro da proposta)

### Cinco partes de todo agente
Cérebro (modelo), contexto (o que sabe), tarefa (objetivo), regras (como agir e o que nunca fazer) e ferramentas (o que pode usar). Cada `.md` em `.claude/agents/` cobre as cinco.

### Um agente por fase

| Fase | Agente | Ferramentas | Entrega (handoff) |
|---|---|---|---|
| Requisitos | `pm-spec` | leitura, escrita, busca | PRD / user stories |
| Arquitetura | `architect` | leitura, escrita, busca | ADR + tech spec |
| Implementação | `implementer` | + Edit e Bash | código + resumo da implementação |
| QA / revisão | `qa-engineer` | leitura + rodar testes | relatório de QA |
| Orquestração | `orquestrador` | gh, Slack, telemetria (MCP) | demanda classificada e encaminhada |

### Regras de construção
1. **Um arquivo por agente.** Só `name` e `description` são obrigatórios; o corpo é o prompt de sistema.
2. **Restringir `tools`.** Se omitir, o agente herda tudo. Só o `implementer` edita e roda comandos.
3. **Handoff por arquivos.** Cada agente lê a entrega do anterior e grava a sua, com status por tarefa (`READY_FOR_ARCH` → `READY_FOR_BUILD` → `DONE`).
4. **Aprovação humana** em dois pontos: no ADR, antes de implementar; no resumo da implementação, antes do PR.
5. **Modelo por tarefa:** `haiku` para rotina, modelo mais forte para arquitetura.
6. **Automação opcional:** um hook `SubagentStop` lê o status e sugere o próximo agente.

### Como criar o primeiro agente (níveis do vídeo)

| Nível | O que fazer | Resultado |
|---|---|---|
| 0 Workspace | `CLAUDE.md` + arquivo de contexto do projeto | o agente conhece o projeto |
| 1 Agente | prompt "agent designer" entrevista você e gera o `.md`; chamar com `@nome` | agente funcionando |
| 2 Skill | playbook atribuído ao agente e citado no `CLAUDE.md` | saída consistente |
| 3 Memória | `memory.md` lido antes de cada tarefa; salvar só o que vale para o futuro | não repete erros |
| 4 Nuvem/agenda | conectar ferramentas (Slack, GitHub, telemetria) e agendar | roda sem você pedir |

**Começar por um só agente** (ex.: `architect`), testar numa tarefa real e só então somar skill, memória e os outros.

## 4. Ciclos (a "pipeline" como texto)

Um ciclo é um arquivo curto em `.claude/cycles/`. Cada `##` é uma coluna; cada item, um cartão (agente, skill, comando ou humano).

```markdown
# bug-simple
Descrição: bug pequeno, 1 arquivo, sem revisão de segurança.
Aprovação: para no PR

## Discover
- intake → agente: orquestrador

## Build
- build → agente: implementer
- gate  → comando: npm test        FAIL → build

## Deliver
- pr → comando: gh pr create
```

Exemplos previstos: `bug-simple` (poucas etapas), `issue-complex` (spec, arquitetura, revisão de segurança, aprovação humana), `menor-custo` (modelos baratos, menos revisões). Nenhum motor executa o arquivo: o **Claude Code segue o roteiro** a partir do `CLAUDE.md`.

## 5. Painel no new-project-view

Uma página **Pipeline**, reaproveitando o visual do editor atual (colunas, cartões, setas tracejadas de retorno):

1. **Seletor de ciclo** no topo; cada ciclo desenha a sua linha do tempo.
2. **"Onde estou":** a etapa atual fica destacada, lida de `state.md` (o orquestrador atualiza).
3. **Editar na linha do tempo:** clicar num cartão abre um painel lateral com o `.md` do agente ou da skill; salvar grava em `.claude/agents/` ou `.claude/skills/`.
4. **Documentação ao lado:** abas "Instruções" e "Onde é usado" (quais ciclos usam esse agente).
5. **Duplicar ciclo:** gera um `.md` novo para ajustar.
6. **Listas** de Agentes, Skills e Memória, só de leitura/edição de texto.

Fora de propósito: wizard de 7 passos, simulador, pacote de ciclos, validação por script e botão de rodar teste. Arrastar cards fica (ver seção 8); o ciclo é montado na tela e gravado como Markdown.

## 6. Como os agentes se aperfeiçoam

- **Git:** cada edição fica no histórico do projeto; dá para voltar se piorar.
- **Memória:** feedback que vale para o futuro entra em `memory.md`.
- **Agente de melhoria:** lê os resultados de uma execução e *propõe* uma alteração no `.md` de outro agente; **você aprova na tela** (antes e depois). Nunca grava sozinho.
- **Comparação:** tabela simples de etapas e custo estimado por ciclo, depois de algumas execuções.

## 7. Orquestrador (Slack, GitHub, telemetria)

Agente que puxa demandas (GitHub via `gh`; Slack e telemetria via MCP), classifica o risco, escolhe o ciclo (`bug-simple` ou `issue-complex`), delega e **para na aprovação** quando o ciclo exige.

Precisa de: conectores MCP autorizados e liberados pela empresa; um gatilho (`/loop` ou agendamento) para "puxar sempre"; e limites no `CLAUDE.md` (nunca faz merge, deploy ou resposta no Slack sozinho).

## 8. Visualização primeiro: o ciclo montado por cards (ordem revisada)

A construção começa **pela tela**, não pelos agentes. Você desenha o ciclo, e cada etapa é um card que concentra a construção do agente, da skill e dos testes daquela etapa.

### Anatomia de um card (exemplo: PRD)

| Aba do card | O que contém |
|---|---|
| **Etapa** | nome (PRD), coluna (Discover), quem executa, ligação com a próxima, retorno em caso de falha |
| **Agente** | construção do `pm-spec`: modelo, ferramentas, regras; botão "Criar com o agent designer" (entrevista e gera o `.md`) |
| **Skill** | playbook da etapa (workflow + checklist), opcional |
| **Entrega** | arquivo que a etapa grava (`prd.md`) e o status que ela libera (`READY_FOR_ARCH`) |
| **Teste** | tarefa de exemplo, critério de aceite ("o PRD tem metas, escopo e critérios?") e registro manual do resultado (passou/falhou, nota). **Sem botão de rodar**: o teste é feito fora da plataforma |
| **Aprovação** | se para e espera você, ou segue |

### Estado do card (selo visível na linha do tempo)
`vazio` → `agente criado` → `testado` → `aprovado para uso`.
Assim você vê de relance **quais etapas do ciclo estão prontas** e quais ainda só existem no desenho.

### O que você faz na tela
1. **Criar um ciclo** com nome e descrição (`bug-simple`, `issue-complex`, `menor-custo`...).
2. **Adicionar etapas** com "+", em colunas livres, e ligar uma à outra; retorno em falha como seta tracejada.
3. **Abrir o card** e construir agente, skill e teste ali mesmo; ao salvar, grava `.claude/agents/`, `.claude/skills/` e `.claude/cycles/<ciclo>.md`.
4. **Registrar o teste** da etapa: você testa fora da plataforma (no Claude Code) e anota no card o resultado (passou ou falhou, com nota). O app não executa nada.
5. **Duplicar e comparar** ciclos para testar uma forma nova de trabalhar.

Os dados continuam em Markdown (sem motor): o app é só um editor visual desses arquivos.

### Sequência de construção

1. **Tela do ciclo, só desenho**
   - Colunas e cards (nome, tipo, ligações) com arrastar e soltar
   - Seletor de ciclo, criar e duplicar
   - Grava `.claude/cycles/*.md`
   - Copiar e enxugar o `cycle-builder.js` do projeto aes-simple-ai-software-factory
2. **Card completo**
   - Abas Etapa, Agente, Entrega e Aprovação
   - Salvar o agente em `.claude/agents/`
   - Botão que gera o agente por entrevista (agent designer)
3. **Aba Teste**
   - Tarefa de exemplo e critério de aceite
   - Resultado registrado à mão (o teste é feito fora da plataforma)
   - Selo de estado no card: `vazio` → `agente criado` → `testado` → `aprovado`
4. **Skills e memória**
   - Aba Skill no card, gravando `.claude/skills/`
   - `memory.md` com o feedback que vale para o futuro
5. **"Onde estou"**
   - `state.md` com a etapa atual de cada tarefa
   - Etapa destacada na linha do tempo
6. **Primeiro ciclo real**
   - Montar o `bug-simple` card a card
   - Testar fora da plataforma
   - Instalar `CLAUDE.md` e `.claude/` no projeto da empresa
7. **Orquestrador**
   - Mais um card, com GitHub, Slack e telemetria
   - Classifica a demanda, escolhe o ciclo e para na sua aprovação
8. **Agente de melhoria e comparação**
   - O agente propõe mudanças e você aprova na tela
   - Tabela comparando ciclos (etapas e custo estimado)

Depois do passo 6 já dá para usar no trabalho. Os passos 7 e 8 só entram quando o ciclo manual estiver funcionando. A instalação no projeto da empresa só acontece no passo 6.

## 9. Pontos a decidir

- **Retornos** (`FAIL → build`): manter as setas tracejadas como no editor atual? Recomendado: sim, como uma linha de texto no ciclo.
- **Edição do ciclo:** definido na seção 8: monta-se pela tela (botão "+", cards), e o resultado é gravado como Markdown. Arrastar cards **entra já na etapa 1** (decidido), reaproveitando o código do editor atual.
- **Rodar o teste:** decidido: **não haverá botão de rodar por enquanto**. O teste é feito fora da plataforma e o resultado é registrado à mão no card.
- **Escrita pelo navegador:** editar agentes exige liberar escrita na pasta do projeto. Aceitável no projeto da empresa?
- **`.claude/` versionado** ou local (`.git/info/exclude`)?
- **Telemetria:** qual ferramenta (Datadog, Sentry, outra) e se há conector MCP liberado.

## 10. Riscos e limites

- O "onde estou" só é confiável se o orquestrador atualizar `state.md`; a regra vai no `CLAUDE.md`.
- Sem motor, nada **impede** o Claude de pular uma etapa; a proteção são as regras escritas e a aprovação humana.
- Agente com `tools` demais herda poder demais: restringir sempre.
- O app só enxerga o projeto quando a pasta é selecionada, e o navegador pede permissão a cada sessão.

## Fontes

- Vídeo: *Build Your First AI Agent in 20 Minutes* (Grace Leung) — níveis 0 a 4 e as cinco partes do agente.
- Documentação do Claude Code: Subagents.
- PubNub: *Best practices for Claude Code sub-agents* e *Subagents part two, from prompts to pipelines*.
