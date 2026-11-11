# Dicas

## Gates: precisa ser um script?

Não. Um gate não precisa ser um script seu, e o card de **comando** do ciclo já cobre isso.

**O que é um gate:** uma verificação que barra o avanço até passar, por exemplo testes, lint, build ou typecheck. O que importa é que o resultado seja objetivo (passou ou falhou) e não uma opinião do modelo.

### Opções, da mais simples para a mais robusta

1. **Card de comando, sem script.**
   - No card: `executa: comando npm test`, com `FAIL → build`.
   - Serve para a maioria dos projetos e já funciona no formato de ciclo.
   - É o que recomendo para começar.
2. **Comando que junta várias checagens** (`npm run lint && npm run typecheck && npm test`).
   - Se o projeto já tem um script no `package.json`, como `npm run check`, use esse.
   - Só crie um `gate.sh` quando as checagens forem muitas ou variarem por projeto.
3. **Hook do Claude Code** (`Stop` ou `PostToolUse`) rodando os testes.
   - É a única opção que *força* a checagem. O Claude não consegue pular o hook se esquecer ou decidir que está tudo certo.
   - Fica em `.claude/settings.json`, que já está no kit mínimo.
4. **Agente revisor** (`qa-engineer`) como gate de qualidade subjetiva.
   - Serve para revisão de código e UX, não para substituir testes. Ele lê o resultado dos testes, mas não deve ser o único gate.

### Por que um comando e não só uma instrução

- O resultado vem do código de saída do comando, não do Claude dizendo "os testes passaram".
- Sem motor, nada obriga o Claude a rodar a etapa. Escreva no `CLAUDE.md` que a etapa gate roda o comando e cola a saída na entrega. Se precisar de garantia real, entra o hook.

### Conselho

Comece com o card de comando (`npm test`) e a regra no `CLAUDE.md`. Adicione um hook só se perceber o Claude pulando o gate. Um script só se o comando ficar grande demais.
