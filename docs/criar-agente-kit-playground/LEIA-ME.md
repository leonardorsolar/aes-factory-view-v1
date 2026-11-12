# Kit criar-agente

## Conteúdo

- `.claude/skills/criar-agente/SKILL.md`: a skill que guia a criação de um agente completo
- `.claude/hooks/bloquear-perigosos.sh`: hook de exemplo que bloqueia `rm -rf` e `git push --force`
- `.claude/settings.json`: registro do hook

Neste zip a pasta se chama `claude` (sem ponto) para não ficar oculta. Ao copiar para o projeto, renomeie para `.claude`. Os caminhos abaixo já consideram o nome `.claude`.

## Instalar

1. Extraia o zip, copie a pasta `claude` para a raiz do seu projeto (workspace) e renomeie para `.claude`. Se o projeto já tiver `.claude`, copie o conteúdo para dentro dela.
2. Se o projeto já tiver `.claude/settings.json`, não sobrescreva: copie só o bloco `hooks` para dentro do seu arquivo.
3. No macOS/Linux, torne o hook executável: `chmod +x .claude/hooks/bloquear-perigosos.sh`
4. O hook usa `jq`. Instale se não tiver (`brew install jq`, `apt install jq` ou `winget install jqlang.jq`). No Windows, o script precisa de Git Bash ou WSL.

## Testar a skill

1. Abra o Claude Code na pasta do projeto, em uma sessão nova.
2. Digite `/criar-agente` ou peça: "crie um agente de arquitetura para este projeto".
3. Responda às perguntas; ele cria um nível por vez (workspace, agente, skill, memória).
4. Chame o agente criado com `@nome-do-agente` em uma tarefa real.

## Testar o hook

Fora do Claude Code, no terminal:

```bash
echo '{"tool_input":{"command":"rm -rf pasta"}}' | .claude/hooks/bloquear-perigosos.sh; echo "saida=$?"
echo '{"tool_input":{"command":"ls"}}' | .claude/hooks/bloquear-perigosos.sh; echo "saida=$?"
```

O primeiro deve mostrar a mensagem de bloqueio e `saida=2`; o segundo, `saida=0`.

Dentro do Claude Code: peça para rodar `rm -rf pasta-de-teste` em uma pasta descartável. O comando deve ser bloqueado.
