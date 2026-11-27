# Painel admin: conversão das telas do Stitch para `/seppzone`

Projeto Stitch: https://stitch.google.com/projects/2314002263226574690
Telas (HTML + PNG) nesta pasta: visao, moderacao, memepedia, usuarios, memes, cartas, eras, comunidade, log, mcp.
Os HTML do Stitch são **referência visual** (usam Tailwind e só tema escuro): NÃO copiar o HTML nem carregar Tailwind.

## Regras
1. Manter TODA a informação e TODAS as ações da aba atual (`seppzone/admin.js`). Só muda layout e hierarquia. Nenhuma rota/API muda.
2. **Tema claro e escuro obrigatórios**: usar só os tokens do `theme.css` (`--bg --panel --txt --line --brand ...`, `html[data-theme=dark]`). Nada de cor fixa; o escuro do Stitch (âmbar/ciano) é inspiração: traduzir para os tokens do site. Conferir os dois temas com Playwright.
3. Sidebar agrupada (Moderação / Acervo / Pessoas / Sistema) no desktop; no celular vira gaveta ou barra inferior. Alvos de toque >= 44px, fonte mínima 12px, foco visível, `aria-*` (`role=tablist` hoje) mantidos.
4. Papéis: moderador só vê Moderação e Memepédia; admin vê tudo (vem de `ABAS[].papeis`). O servidor segue como autoridade.
5. CSS de cada aba em arquivo próprio `seppzone/admin-<aba>.css` (o shell já cria e liga todos no `index.html`) para PRs paralelos não conflitarem. O shell comum fica em `admin.css`.
6. Testes: `tests/front-admin*.test.js` devem continuar passando; acrescente testes do que mudar. Cache-bust: o `?v=` do `admin.js`/css sobe junto.
7. Trabalhar em worktree/branch próprio a partir da `dev`; PR para `dev`; nunca produção/vp3/Portainer; banco de teste com nome próprio contendo "test" (Postgres local 55432).
8. Verificar no navegador (Playwright em `C:/Users/willi/AppData/Local/Temp/pw/node_modules/playwright`) a 360, 768 e 1280 px, claro e escuro, com serviços locais.
