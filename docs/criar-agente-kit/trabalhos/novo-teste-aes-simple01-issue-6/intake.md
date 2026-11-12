DECISION: NEEDS-INFO
RISK: medium
SURFACES: none
RESCOPED: no
ROUTE: feature_large

## Summary
- Li a issue #6 ("Melhorar o sistema"), aberta pelo dono do repositório, sem comentários: diz apenas que "o sistema está ruim e precisa ficar melhor", sem apontar problema, comportamento esperado ou parte afetada.
- Procurei duplicidade em issues e PRs, abertos e fechados (termos "melhorar", "sistema" e a lista completa): nenhuma outra issue ou PR trata de melhoria geral.
- Conferi a `main` via `gh api`: hoje ela contém apenas `.gitignore`. O código do servidor do PR #2 foi removido e as funções das issues #4 e #5 ainda não foram construídas, então o código não mostra o que deveria melhorar.
- Sem saber o que está ruim, não dá para definir o escopo de um PR, por isso peço informações antes de seguir.

## Scope
Ainda não definido. Depende das respostas abaixo. Quando houver resposta, a ideia é aceitar uma primeira mudança concreta e verificável que caiba em um único PR pequeno.

## Why
O pedido não descreve nenhum comportamento a corrigir ou criar, e a `main` (só `.gitignore`) não dá pistas de qual seria a leitura sensata. Só o autor sabe o que considera "ruim". A análise do código foi só remota (`gh api`, sem clone local): li a árvore da `main` e a lista de branches (`main` e `factory/001-criar-um-servidor-node`). Os valores de risco e rota acima são palpites, porque o pedido pode ir de algo trivial a uma mudança grande.

## Questions
1. O que exatamente está ruim? Descreva em uma frase o problema concreto (por exemplo, um erro, uma lentidão ou algo que falta).
2. Qual parte do sistema é afetada? (o servidor Express do PR #2, que já não está na `main`, as funções de soma/multiplicação das issues #4 e #5, ou outra coisa)
3. Como saberemos que ficou melhor? Diga em uma linha o resultado esperado.
