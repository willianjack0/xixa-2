# Decisões da Fase 4: ligar o site à economia da API

Registro das decisões do dono do projeto em 2026-11-19, tomadas ao planejar a ligação do front à carteira, XP e pacotes. Complementa `docs/PLANO-IMPLEMENTACAO.md` (seção 6) e `docs/API.md`.

## Decisões

1. **Dados locais são descartados.** XP, moedas, cartas e pacotes guardados no `localStorage` não são importados para o servidor. O servidor é a autoridade da economia, e importar estado do navegador abriria brecha de fraude. Ainda não há usuários reais, então nada se perde.
2. **Boas-vindas no fim da criação do gato.** O pacote de boas-vindas é entregue na primeira vez que o gato é salvo (primeiro `PATCH /api/eu` com `avatar_gato`), e não mais na primeira visita. `POST /api/visita` segue dando XP e pacote diário.
3. **Apelido editável; foto do Discord é opção.** O apelido nasce do Discord e pode ser trocado. O gato é o avatar padrão, e a foto do Discord só aparece se a pessoa escolher (`usar_foto`).
4. **Repetida fica no inventário.** Carta repetida só vira moeda ao chamar `POST /api/album/reciclar`. Isso deixa espaço para uma futura troca de figurinhas entre usuários.
5. **Itens da economia em aberto podem esperar:** preço do pacote Clássico (150 moedas), pacote diário acumulando até 7 e tiragem numerada nos Míticos.

## Ordem de execução

| Fatia | Entrega |
|---|---|
| 1 | API: `GET /api/pacotes/tipos`, `PATCH /api/eu`, migração 013. Front: cliente de API, visita e cabeçalho (carteira, XP e patente do servidor) |
| 2 | Álbum: ler do servidor, abrir pacote sem spoiler, loja e reciclar repetidas |
| 3 | Ranking e onboarding do gato (criador salva no servidor; boas-vindas ao concluir) |
| 4 | Remover a economia local e o painel de teste; teste e2e com Playwright |

Cada fatia vai em PR para o `dev`, e a promoção para o `main` só depois de validar o login real no `dev`.

## Regras que valem para todas as fatias

- **Anti-spoiler na abertura de pacote:** depois de `POST /api/pacotes/abrir`, o front não consulta carteira nem álbum até todas as cartas serem reveladas ou o pacote ser fechado (issue #18, PR #20). Só então busca os dois.
- **Recompensas sem regra no servidor ficam desligadas** até a Fase 3: jujuba diária (+50 moedas e +10 XP, hoje só no cliente), envio aprovado, link salvo e similares. A funcionalidade continua, sem prêmio. A jujuba precisa de uma rota própria (por exemplo `POST /api/jujuba`, com o dia e o lugar decididos pelo servidor).
- **Login obrigatório:** o site inteiro fica atrás do login do Discord (`gate.js` e `entrar.html`, provisória). A tela final foi pedida ao Subversivo011 na issue #30.
- **Produção:** `DISCORD_EXIGIR_MEMBRO=1` só na stack `main`, desligado no `dev` para testes.
- **Foto de perfil:** a foto do Discord migra para o ícone de gatinho como avatar padrão (Fase 4, fatia 3).

## Relacionados

- `docs/API.md`: contrato das rotas, em especial "Perfil e cadastro" e "Economia".
- `docs/subversivo011/economia-e-escassez.md`: regras da economia (a nota no topo registra que "toda repetida vira moeda na hora" está desatualizado).
- Issues #18 (suspense do pacote) e #30 (tela de login).
