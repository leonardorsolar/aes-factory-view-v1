DECISION: ACCEPT
RISK: low
SURFACES: none
RESCOPED: no
ROUTE: feature

## Summary
- Li a issue #5 ("crie a multplicacao de 2 números"), aberta pelo dono do repositório, sem comentários nem labels: pede um arquivo JavaScript com uma função que multiplica dois números.
- Procurei duplicidade em issues e PRs, abertos e fechados (termos "multiplicacao", "multiplica", "multiply" e a lista completa): existem apenas a issue #1 e o PR #2 (servidor Express), a issue #3 (arquivo txt) e a issue #4 (soma de 2 números); nenhuma trata de multiplicação.
- Conferi a `main` via `gh api`: hoje ela contém apenas `.gitignore`, então não existe função de multiplicação nem `package.json` no repositório.
- O pedido é claro, pequeno e cabe com folga em um único PR; aceito como está.

## Scope
Criar um arquivo JavaScript com uma função que recebe dois números e retorna o produto deles (por exemplo, `multiplicacao(2, 3)` retorna `6`; funciona também com negativos, zero e decimais, como `multiplicacao(-2, 0.5)` retornando `-1` e `multiplicacao(7, 0)` retornando `0`). A função deve ser exportada para poder ser usada por outros arquivos.

Leituras assumidas, já que a issue não detalha:
- Arquivo `multiplicacao.js` na raiz do repositório, função chamada `multiplicacao`, exportada no estilo CommonJS (`module.exports`), coerente com o padrão Node CommonJS usado no PR #2 e com a leitura adotada para a issue #4 (soma).
- Sem validação de tipos: a função assume que recebe números; o comportamento com outros tipos não é definido.

Fora do escopo: interface de linha de comando, servidor ou rota HTTP, validação de entrada, configuração de ferramentas de teste/lint (a `main` não tem `package.json`) e qualquer integração com a função de soma da issue #4. Testes automatizados também ficam fora desta entrega.

## Why
O pedido é inequívoco, contido em um único arquivo novo, sem tocar dados, autenticação ou código existente, e é fácil de verificar e desfazer, por isso risco `low` e rota `feature` (comportamento novo, ainda que pequeno). A issue #4 é parecida, mas pede soma, não multiplicação, então não é duplicata. A análise do código foi só remota (`gh api`, sem clone local): li a árvore da `main`, que contém apenas `.gitignore`, e as branches existentes (`main` e `factory/001-criar-um-servidor-node`).
