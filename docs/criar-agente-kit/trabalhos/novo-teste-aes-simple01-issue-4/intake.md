DECISION: ACCEPT
RISK: low
SURFACES: none
RESCOPED: no
ROUTE: feature

## Summary
- Li a issue #4 ("crie soma de 2 numeros"), aberta pelo dono do repositório, sem comentários nem labels: pede um arquivo JavaScript com uma função que soma dois números.
- Procurei duplicidade em issues e PRs, abertos e fechados (termos "soma", "sum", lista completa): só existem a issue #1 e o PR #2 (servidor Express) e a issue #3 (arquivo txt); nada trata de soma.
- Conferi a `main` via `gh api`: hoje ela contém apenas `.gitignore`. O último commit ("Remove application files and tests...") apagou o código do PR #2, então não há função de soma nem `package.json` no repositório.
- O pedido é claro, pequeno e cabe com folga em um único PR; aceito como está.

## Scope
Criar um arquivo JavaScript com uma função que recebe dois números e retorna a soma deles (por exemplo, `soma(2, 3)` retorna `5`; funciona também com negativos e decimais, como `soma(-1, 0.5)` retornando `-0.5`). A função deve ser exportada para poder ser usada por outros arquivos.

Leituras assumidas, já que a issue não detalha:
- Arquivo `soma.js` na raiz do repositório, função chamada `soma`, exportada no estilo CommonJS (`module.exports`), coerente com o padrão Node CommonJS que o projeto usava no PR #2.
- Sem validação de tipos: a função assume que recebe números; o comportamento com outros tipos não é definido.

Fora do escopo: interface de linha de comando, servidor ou rota HTTP, validação de entrada e configuração de ferramentas de teste/lint (a `main` não tem `package.json`). Testes automatizados também ficam fora desta primeira fatia.

## Why
O pedido é inequívoco, contido em um único arquivo novo, sem tocar dados, autenticação ou código existente, e é fácil de verificar e desfazer, por isso risco `low` e rota `feature` (é um comportamento novo, ainda que pequeno e sem decisões de design). Como o repositório é de teste ("novo-teste-aes-simple01"), o custo de passar pela fábrica é baixo e o valor é exercitar o fluxo. A análise do código foi só remota (`gh api`, sem clone local): li a árvore da `main`, o histórico de commits e o `AGENTS.md` da branch do PR #2, que descreve o projeto como Node + Express em CommonJS.
