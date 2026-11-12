DECISION: REJECT
RISK: low
SURFACES: none
RESCOPED: no
ROUTE: feature

## Summary
- Li a issue #7 ("Criar função que soma dois números"), aberta pelo dono do repositório, sem comentários: pede um arquivo JavaScript com uma função que recebe dois números e devolve a soma.
- Procurei duplicidade em issues e PRs, abertos e fechados (termos "soma", "somar" e a lista completa): a issue #4 ("crie soma de 2 numeros"), ainda aberta, pede exatamente a mesma coisa.
- A issue #4 já passou pela triagem e foi aceita, com escopo de criar `soma.js` na raiz com a função `soma` exportada.
- Conferi a `main` via `gh api`: hoje ela contém apenas `.gitignore`, então a função ainda não existe, mas já está encaminhada pela #4.

## Scope
Nenhum: o trabalho já está coberto pela issue #4. Se houver algo na #7 que a #4 não cubra (por exemplo, nome de arquivo ou de função diferente, ou testes), sugiro comentar na #4 para que entre naquele escopo.

## Why
A #7 é duplicata da #4: mesmo pedido (arquivo JavaScript com função que soma dois números), mesmo autor, e a #4 já foi aceita. Construir as duas geraria trabalho e arquivos repetidos. A análise do código foi só remota (`gh api`, sem clone local): li a árvore da `main` e a lista de issues e PRs do repositório.
