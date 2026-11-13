Use a skill .claude/skills/criar-agente/SKILL.md para criar o bloco completo
(agente + skill + memória + hook, se necessário + CLAUDE.md + etapa no ciclo)
a partir da skill pronta .claude/skills/aes-create-techspec/ e das referências dela
(references/, assets/, scripts/).

Modo: C (skill pronta). Converter em bloco.

Contexto:
- Agente: doc-writer, que executa a etapa techspec do ciclo cycles/prd-spec.json
  com a skill aes-create-techspec.
- Etapa: lê issue.md, intake.md e prd.md; grava techspec.md; needs: prd.
- Vereditos: DONE → @next e BLOCKED → @human.

Regras:
- Não altere a skill aes-create-techspec nem as referências dela.
- Se já existirem agente, memória, hook, CLAUDE.md ou ciclo, leia, mescle e só acrescente.
- Primeiro me mostre a tabela de lacunas (o que veio → para onde vai → o que falta criar)
  e a lista mantido x adaptado. Só escreva depois da minha aprovação.
- Crie só o que falta. Hook só se passar nos critérios do Nível 5.
- Feche com a verificação de alinhamento.