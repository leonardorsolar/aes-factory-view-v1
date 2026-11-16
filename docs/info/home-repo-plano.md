# Plano: pasta central da fábrica (padrão "home repo")

Origem da ideia: vídeo "The Home Repo: the effortless multi-repo agent setup". Um único repositório (home) guarda skills, agentes, hooks, memória, wiki e artefatos. O agente **sempre roda dentro do home** e alcança os repositórios dos aplicativos por caminho. Os aplicativos ficam só com código.

---

## 1. Como funciona hoje

```
aes-factory-view (index.html)
   └── escolhe UMA pasta ──► novo-teste-aes-simple02/
                               ├── CLAUDE.md
                               ├── contexto/contexto.md
                               ├── trabalhos/<repo>-issue-<n>/*.md
                               ├── .claude/{agents,skills,hooks,memory,cycles,settings.json}
                               └── .aes/{activity.json,activity-hook.mjs,notes,diagrams,project}
```

- `js/project.js` guarda um único handle (`IndexedDB aes/handles/"project"`). Todos os módulos (`notes`, `diagram`, `cycles`, `scan`, `activity`, `pipeline`) leem e gravam nele.
- O botão "Baixar skills e agentes" (`js/scan.js` → `installSkills`) copia o bundle para `.claude/` do app e mescla hooks no `.claude/settings.json` dele.
- Hooks e agentes resolvem tudo por `$CLAUDE_PROJECT_DIR` (`restringir-escrita.sh` só libera `$raiz/trabalhos/`; `restringir-escrita-codigo.sh` libera `$raiz/*`).

**Problema:** cada app recebe uma cópia de skills e agentes (que ficam desatualizadas) e cerca de 60 arquivos que não são código. Com 2 ou mais apps, a manutenção duplica.

---

## 2. Como deve ficar

```
~/aes-home/                       ← pasta central (repo git próprio, versionado)
├── CLAUDE.md                     ← regras gerais + mapa dos apps (caminhos)
├── apps.json                     ← registro dos apps (nome, caminho, repo GitHub, branch)
├── .claude/
│   ├── settings.json             ← hooks + permissions.additionalDirectories (caminhos dos apps)
│   ├── agents/  skills/  hooks/  cycles/
│   └── memory/                   ← lições por agente (compartilhadas entre apps)
├── .aes/activity-hook.mjs
├── apps/
│   └── <app>/
│       ├── contexto.md           ← stack, padrões, critérios do app
│       ├── trabalhos/issue-<n>/  ← intake.md, prd.md, techspec.md, tasks.md, gate.md…
│       ├── project/              ← saída do Scan
│       ├── notes/  diagrams/
│       └── activity.json
└── worktrees/<app>-issue-<n>/    ← (fase 5) cópia de trabalho isolada por issue (no .gitignore do home)

~/projetos/loja/                  ← app: só código. Nenhum .claude/, .aes/, trabalhos/
~/projetos/api-pagamentos/        ← app: só código
```

Fluxo:

```
index.html ──(readwrite)──► aes-home/      (grava tudo aqui)
          └─(read)────────► apps/*         (só lê, para Scan e Onboarding)

terminal:  cd ~/aes-home && claude
           @intake app=loja issue 3
             └─ lê/escreve código em ~/projetos/loja (additionalDirectories)
             └─ grava artefatos em aes-home/apps/loja/trabalhos/issue-3/
```

Regra de ouro: **no app só entra o que vai para o PR** (código, testes, configuração da própria stack). Tudo que é da fábrica fica no home.

---

## 3. Decisões técnicas (Claude Code)

| Necessidade | Como resolver |
|---|---|
| Agente alcançar o app | Rodar `claude` no home. Em `.claude/settings.json` do home: `"permissions": { "additionalDirectories": ["/abs/loja", "/abs/api"] }` (ou `--add-dir`). O app gera esse bloco a partir de `apps.json`. |
| Skills, agentes e hooks | Vêm do `.claude/` do home (cwd). Nada é copiado para o app. |
| `CLAUDE.md` que o app já tenha (da stack) | Não carrega sozinho de diretório adicional. Opção: `CLAUDE_CODE_ADDITIONAL_DIRECTORIES_CLAUDE_MD=1`, ou o agente lê `<app>/CLAUDE.md` explicitamente no "Antes de começar". |
| Git e GitHub | Sempre com caminho explícito: `git -C <path>`, `gh -R <owner/repo>` (vem de `apps.json`). Nunca `gh repo view` do cwd, porque o cwd agora é o home. |
| Saber qual app | Todo pedido leva o app: `@intake app=loja issue 3`. Sem `app=`, se houver só 1 app em `apps.json` usa ele; senão o agente pergunta. |
| Caminho absoluto | O navegador não revela caminhos. O usuário digita o caminho absoluto uma vez ao registrar o app (campo de texto + o handle da pasta para leitura). |

`apps.json`:

```json
{
  "version": 1,
  "apps": [
    {
      "id": "novo-teste-aes-simple02",
      "path": "/home/solar/Documentos/aes plataforma/novo-teste-aes-simple02",
      "github": "leonardorsolar/novo-teste-aes-simple02",
      "branch": "main",
      "cycle": "novo-ciclo"
    }
  ]
}
```

---

## 4. Passo a passo

**Status (2026-11-16):** fases 1 e 2 feitas na pasta central `novo-teste-aes-simple02`, com o primeiro app `app-teste01-2026`. Falta o teste de ponta a ponta (`@intake app=app-teste01-2026 issue N`). O app web ainda lê os caminhos antigos (`trabalhos/<repo>-issue-<n>`, `.aes/` dentro do projeto) até a fase 3.

### Fase 1: preparar a pasta central

**Pasta central escolhida:** `/home/solar/Documentos/aes plataforma/novo-teste-aes-simple02` (git com remote, sem código de app, já tem `.claude/` com 13 agentes, skills, hooks e o ciclo). Não há migração de apps: ela vira o home no lugar onde está.

1. Criar `.gitignore` (`worktrees/`, `apps/*/activity.json`).
2. Reorganizar no próprio lugar:
   - `trabalhos/` e `contexto/` saem da raiz; cada app terá `apps/<app>/contexto.md` e `apps/<app>/trabalhos/`.
   - O teste antigo (`trabalhos/novo-teste-aes-simple02-issue-3/`) pode ser apagado ou guardado em `apps/_teste/`.
   - `.aes/{notes,diagrams}` → `apps/<app>/` quando houver app (ou ficam em `.aes/` como itens gerais da fábrica).
3. Reescrever `CLAUDE.md` e `contexto/contexto.md`: hoje dizem "o repositório alvo é sempre o atual (`gh repo view`)". Passam a dizer "o repositório alvo vem de `apps.json`".
4. Criar `apps.json` (vazio ou com o primeiro app real).
5. Ajustar `.claude/settings.json`: `permissions.additionalDirectories` com os caminhos dos apps.

**Pronto quando:** na pasta central, `claude` lista os agentes e skills e `@intake app=<app> issue N` grava em `apps/<app>/trabalhos/issue-N/intake.md` sem criar nada na pasta do app.

### Fase 2: agentes, skills e hooks entendem o app

1. **Convenção de caminhos** (trocar em todos os agentes, skills e no ciclo):
   - `trabalhos/<repo>-issue-<n>/` → `apps/<app>/trabalhos/issue-<n>/`
   - `contexto/contexto.md` → `apps/<app>/contexto.md`
   - repo → `apps.json[app].github`; caminho do código → `apps.json[app].path`
2. **Bloco padrão "Antes de começar"** em cada agente: resolver `app` (do pedido ou de `apps.json`), ler `apps.json`, `apps/<app>/contexto.md`, a memória do agente e `<path>/CLAUDE.md` se existir.
3. **Hooks:**
   - `restringir-escrita.sh`: libera só `$CLAUDE_PROJECT_DIR/apps/*/trabalhos/*`.
   - `restringir-escrita-codigo.sh`: lê `apps.json` (com `jq`) e libera escrita só dentro do `path` de algum app (ou do worktree, fase 5). Bloqueia `.git/` do app e qualquer escrita no home fora de `apps/<app>/trabalhos/<n>/execute-task.md`.
   - `liberar-github.sh`: aceitar `gh ... -R <repo>` e `git -C <path> push` só para repos que estão em `apps.json`.
   - `bloquear-perigosos.sh`: sem mudança.
4. **Memória:** `.claude/memory/<agente>-memoria.md` continua compartilhada (as lições servem para todos os apps). Lição que só vale para um app vai para `apps/<app>/contexto.md`.
5. **`triagem-de-issue`:** o rótulo `factory` e o "modo lote" passam a valer por app (`gh issue list -R <repo>`).

**Pronto quando:** `@intake app=novo-teste-aes-simple02 issue 3` grava `apps/novo-teste-aes-simple02/trabalhos/issue-3/intake.md` e nada muda dentro do app; `@execute-task` altera só arquivos de código do app.

### Fase 3: o app web passa a ter "home" + "apps"

0. **Primeira tela ao abrir o app: escolher a pasta central.**
   - Se não há handle `home` no IndexedDB, o app abre direto num passo de boas-vindas: "Onde fica a pasta central da fábrica?" com dois botões: **Escolher pasta existente** e **Criar pasta nova** (o usuário escolhe/cria a pasta no seletor; o app grava a estrutura mínima: `CLAUDE.md`, `apps.json`, `.claude/`, `.gitignore`).
   - Campo para o caminho absoluto (o navegador não revela), usado no comando `cd "<home>" && claude`.
   - Pasta escolhida que já tem `.claude/` e `apps.json` é aceita como está; se tiver `.claude/` mas não `apps.json`, o app oferece "adaptar para pasta central" (cria `apps.json` e mostra o que precisa mudar).
   - Só depois disso aparece "Adicionar aplicativo". Sem pasta central, as telas que gravam ficam desabilitadas.
   - Handle salvo pede `requestPermission({mode:"readwrite"})` a cada abertura (exigência do navegador, precisa de clique): mostrar o botão "Reconectar pasta central".
1. **`js/project.js` → `js/workspace.js`**
   - Dois tipos de handle no IndexedDB: `home` (readwrite) e `app:<id>` (read).
   - Tela de configuração: "Pasta central" (escolher) + lista "Aplicativos" (adicionar: escolher pasta + digitar caminho absoluto + repo GitHub; remover).
   - Grava `apps.json` no home e regenera `permissions.additionalDirectories` em `.claude/settings.json` (mesclando, como `mergeActivityHooks` já faz).
   - Seletor da sidebar troca o **app ativo** (`localStorage.activeApp`) e dispara `aes:app-changed`.
2. **Helper único de arquivos** (hoje cada módulo tem o seu `dir/readFile/writeFile` duplicado): `Workspace.home()`, `Workspace.appDir(id)` (`apps/<id>/` no home), `Workspace.appCode(id)` (handle de leitura do código). Todos os módulos passam a usar esse helper.
3. **Mapeamento dos módulos:**

| Módulo | Hoje grava em (app) | Passa a gravar em (home) |
|---|---|---|
| `notes.js` | `.aes/notes/` | `apps/<app>/notes/` |
| `diagram.js` | `.aes/diagrams/` | `apps/<app>/diagrams/` |
| `scan.js` (saída) | `.aes/project/` | `apps/<app>/project/` (lê o código de `appCode`) |
| `scan.js` (instalar skills) | `.claude/` do app | `.claude/` do home, uma vez só |
| `cycles.js` / `pipeline.js` | `.claude/cycles`, `.claude/agents` | `.claude/cycles`, `.claude/agents` do home; cards de `apps/<app>/trabalhos/` |
| `activity.js` | `.aes/activity.json` | `apps/<app>/activity.json` (ou um feed único com campo `app`) |
| `onboarding.js` | checa `.aes` no app | checa git/.gitignore no app (leitura) e setup no home |

4. **Botão "Copiar comando"**: `cd "<home>" && claude` (o caminho absoluto do home também é digitado uma vez).
5. **Modo antigo (embutido)**: manter por enquanto como opção "usar o app como pasta central" para não quebrar projetos já configurados. Remover na fase 6.

**Pronto quando:** com home + 2 apps registrados, trocar de app na sidebar troca notas, diagramas, Scan e cards do Pipeline, e nenhum arquivo é criado nas pastas dos apps.

### Fase 4: Activity e Pipeline multi-app

1. `activity-hook.mjs` roda no home: descobrir o app do evento pelo prompt (`app=<id>`) ou pelo caminho do arquivo editado (prefixo de `path` em `apps.json`, ou `apps/<id>/`). Gravar `app` no evento.
2. Card do Pipeline: chave `app + issue` (hoje é `repo-issue-N`).
3. Visão "Todos os apps" no Pipeline (cards agrupados por app).

### Fase 5: isolamento por worktree (vários agentes ao mesmo tempo)

1. O `execute-task` cria `git -C <path> worktree add <home>/worktrees/<app>-issue-<n> -b feature/<app>-issue-<n>` e trabalha lá. A pasta principal do app não é tocada; o git só registra o worktree dentro de `.git/` do app (não aparece no `git status`).
2. `gate`, `review-*` e `pr` usam o mesmo worktree; `merge` remove o worktree no fim (`git worktree remove`).
3. O hook de código passa a liberar `worktrees/<app>-issue-<n>/` em vez do `path` do app.

**Ganho:** 2 issues do mesmo app rodam em paralelo sem conflito, e o usuário pode continuar mexendo no app enquanto a fábrica trabalha.

### Fase 6: limpeza e documentação

1. Remover o modo embutido, `SCAN_BUNDLE` passa a instalar só no home.
2. `docs/template/` vira o template do home (`CLAUDE.md` com o mapa de apps, `apps.json` de exemplo, `.gitignore`).
3. Atualizar `README.md` (telas, fluxo, "Baixar skills" → "Preparar pasta central").
4. `node scripts/build-skills-bundle.mjs` e os testes `test-cycle-*.mjs` atualizados para os caminhos novos.

---

## 5. Riscos e cuidados

- **Caminho absoluto digitado errado**: validar comparando o nome da pasta do handle com o fim do caminho digitado.
- **Agente rodado de dentro do app por engano**: sem `.claude/` no app ele não vê agentes nem hooks. O `CLAUDE.md` do home deve dizer "rode sempre em aes-home"; dá para colocar um `SessionStart` no home que avisa se o cwd não é o home.
- **Hooks de proteção dependem de `jq` e de `apps.json`**: se `apps.json` faltar ou estiver inválido, o hook de código deve **bloquear** (falha fechada), não liberar.
- **Escala**: um `apps.json` simples serve para ~30-40 apps. Acima disso, agrupar (frontend/backend/interno) no `CLAUDE.md`, como sugere o vídeo.
- **Dados sensíveis no home**: o home vai para o GitHub como repo **privado**; `activity.json` e `worktrees/` ficam fora do git.

---

## 6. Ordem sugerida e tamanho

| Fase | Esforço | Depende de |
|---|---|---|
| 1. Criar home do zero | pequeno | nada |
| 2. Agentes, skills e hooks | médio | 1 |
| 3. App web home + apps | grande | 1 (pode andar em paralelo com 2) |
| 4. Activity/Pipeline multi-app | médio | 2 e 3 |
| 5. Worktrees | médio | 2 |
| 6. Limpeza | pequeno | todas |

Começar pelas fases 1 e 2 com um app real já prova o padrão sem mexer no app web: dá para rodar o ciclo inteiro pelo terminal no home e conferir que o app continua só com código.
