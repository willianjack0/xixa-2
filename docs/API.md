# API

Node puro + Postgres (`api/`). Rotas por assunto em `api/routes/`, roteador em `api/lib/router.js`, montagem em `api/app.js`. Respostas em JSON; erros em `{ erro }` (rotas novas e comunidade) ou `{ error }` (formulário de contribuidores e admin, formato antigo mantido).

## Saúde

| Rota | Resposta |
|---|---|
| `GET /api/health` | `200 { ok: true, banco: "ok" }`; `503 { ok: false, banco: "falha" }` se o banco não responder em 2 s |

## Acervo (público, cache de 60 s)

Só memes com `status = 'publicado'`. Fonte da verdade: Postgres (carga inicial em `api/seed/acervo.js`).

| Rota | Descrição |
|---|---|
| `GET /api/memes` | `{ total, itens[] }`. Filtros: `ano`, `categoria`, `raridade`, `limite` (máx. 500), `offset`. Ordem: ano, data, id |
| `GET /api/memes/:id` | Um meme (`400` id inválido, `404` inexistente ou não publicado) |
| `GET /api/eras` | `{ itens[] }` com `ano`, `ano_fim` (`null` na era aberta "2020+"), `rotulo`, `lema`, `texto` |
| `GET /api/categorias` | `{ itens[] }` com `nome`, `icone`, `emoji`, `total` de memes publicados |

Cada meme: `id, titulo, ano, data, categoria, tipo, raridade, emoji, descricao, autor, duracao, youtube_id, adicionado_em, midias[]`; cada mídia: `tipo` (`imagem` ou `video_arquivo`), `caminho`, `origem_url`, `credito_por`, `credito_url`, `largura`, `altura`.

## Economia (servidor é a autoridade)

Moedas, XP e cartas só mudam por chamadas da API, dentro de uma transação que trava a linha do usuário. Saldo e XP são a **soma do razão** (`movimentos_moeda`, `eventos_xp`); `usuarios.moedas` e `usuarios.xp` são cache atualizado na mesma transação. Valores de recompensa e de repetidas vêm de `regras_economia`; preço, chances e garantia de cada pacote vêm de `pacotes_tipo`. Regras de negócio: `docs/subversivo011/economia-e-escassez.md`.

Sem o acervo carregado (seed não rodou) ou sem as regras de economia, `abrir` e a carteira respondem `503 { erro: "serviço indisponível, tente mais tarde" }`; o detalhe (o que falta e o que rodar) vai só para o log do servidor. Nada é gravado.

Rotas marcadas com 🔒 exigem usuário (ver **Login com Discord e sessão**). Erros de regra: `{ erro }` com 400, 402 (moedas insuficientes), 404 ou 409. Até 60 ações de escrita por usuário a cada 10 min (429).

| Rota | Descrição |
|---|---|
| 🔒 `GET /api/carteira` | `moedas`, `xp` (do razão), `patente` e `proxima_patente`, `pacotes` no estoque, resumo das `cartas` e `valor_das_repetidas` |
| 🔒 `GET /api/album` | Coleções com todas as cartas e a `quantidade` que o usuário tem; `tenho`, `total`, `completa` |
| 🔒 `POST /api/visita` | Visita do dia (fuso de `regras_economia.limites`): +XP e pacote diário (acumula até 7). **Não dá mais o pacote de boas-vindas** (ele vem ao salvar o gato pela primeira vez: `PATCH /api/eu`). Idempotente por dia. Resposta: `{ dia, primeira_visita_do_dia, xp_ganho, pacotes_ganhos: ["diario"] \| [], carteira }` |
| 🔒 `GET /api/pacotes/tipos` | Catálogo para a loja (só tipos ativos, na ordem de `pacotes_tipo.ordem`). `{ itens: [{ id, nome, descricao, preco, cartas, chances, garantia, escopo, gratis, comprar, icone, gradiente }] }`. `chances` = peso por raridade (`{ "Comum": 44, "Relevante": 26, … }`, soma 100; raridade ausente = 0); `garantia` = raridade mínima garantida ou `null`; `escopo` = `"todas"` (qualquer coleção) ou `"colecao"` (o comprador escolhe a coleção em `colecao_id` ao comprar); `gratis` = `preco === 0` (diário e boas-vindas: vêm do estoque, não se compram); `comprar` = `true` só se estiver à venda (`preco > 0`). Sem seed: `503` genérico |
| 🔒 `POST /api/pacotes/comprar` | `{ tipo, colecao_id? }` (`colecao_id` só no pacote da coleção). Cobra no razão e guarda no estoque. `402` sem moedas; pacote grátis não se compra |
| 🔒 `POST /api/pacotes/abrir` | `{ estoque_id }` ou `{ tipo, colecao_id? }` (abre o mais antigo). Sorteia no servidor, grava em `pacotes_abertos` (com a `semente`, que reproduz o sorteio) e credita cartas, XP e o bônus de coleção completa numa só transação. Devolve `cartas[]` (com `nova`), `xp_ganho`, `moedas_ganhas`, `colecoes_completas`, `carteira` |
| 🔒 `POST /api/album/reciclar` | `{ carta_id }` ou `{ todas: true }`. **É o único jeito de uma repetida virar moeda**: abrir pacote só soma a carta ao inventário (`quantidade`) e informa `valor_das_repetidas`, sem pagar. Converte repetidas em moedas (sempre fica 1 de cada). `409` se não houver repetida |
| `GET /api/ranking?metrica=xp\|cartas&limite=50` | Público. `xp` soma os eventos do razão; `cartas` conta cartas distintas. Banidos ficam de fora. Cada item: `{ posicao, apelido, avatar_gato, avatar_url, valor, patente }`; **`avatar_url` só vem preenchido quando a pessoa escolheu usar a foto** (`usar_foto`), senão `null` (use o gato) |

Idempotência do razão: visita do dia, carta nova e coleção completa têm índice único por usuário e referência, então retry ou corrida nunca pagam duas vezes.

## Login com Discord e sessão

OAuth2 do Discord (scope `identify`). Quem usa: o site abre `/api/auth/discord?voltar=/album.html`, o usuário autoriza no Discord e volta para a página de origem já logado.

| Rota | Descrição |
|---|---|
| `GET /api/auth/discord?voltar=/caminho` | Gera um `state` aleatório, guarda no cookie `ns_oauth` (httpOnly, 10 min, só viaja para `/api/auth`) e redireciona (302) ao Discord. `voltar` só aceita **caminho relativo do próprio site**; qualquer outra coisa (`https://…`, `//…`, `/\\…`, `javascript:`) vira `/` |
| `GET /api/auth/discord/callback` | Confere o `state` com o cookie (`400` se faltar ou divergir), troca o `code`, lê `/users/@me`, cria ou atualiza `usuarios` + `contas_oauth`, abre a sessão e redireciona para `voltar` (revalidado). Falhas voltam para a mesma página com `?login=` **`negado`** (cancelou no Discord), **`erro`** (Discord recusou o code), **`banido`** (conta suspensa: não abre sessão), **`nao_membro`** (só se `DISCORD_EXIGIR_MEMBRO=1`) |
| `POST /api/auth/sair` | Apaga a sessão no banco e limpa o cookie. Exige `X-CSRF`. Sem sessão, só limpa o cookie |
| 🔒 `GET /api/eu` | `{ usuario: { id, apelido, avatar_gato, avatar_url, usar_foto, cadastro_completo }, patente, proxima_patente, moedas, xp, csrf }`. Detalhes de cada campo em **Perfil e cadastro**. `401` se não estiver logado. **O `csrf` daqui vai no header `X-CSRF` das chamadas que alteram dados** |

**Foto de perfil.** A cada login o servidor lê `id` e `avatar` (hash) de `/users/@me` e grava em `contas_oauth.avatar_url` (migração 012) a URL **montada por ele**: `https://cdn.discordapp.com/avatars/<id>/<hash>.png?size=128`. Sempre `.png` (inclusive avatar animado, hash `a_…`), nunca o avatar padrão do Discord. `id` precisa casar `^[0-9]{5,25}$` e o hash `^[a-f0-9_]{1,64}$`; qualquer outra coisa (ou ausência de foto) grava `null`. Nenhuma URL crua do Discord e nenhum parâmetro do cliente entram na coluna. Quem trocou ou removeu a foto no Discord tem a URL atualizada (ou zerada) no login seguinte, no mesmo `UPDATE` do nome de exibição. Usuários sem conta Discord (stub de teste) têm `avatar_url: null`. **A foto é opcional**: o padrão é o gato; ver `usar_foto` em **Perfil e cadastro**.

**State assinado.** O cookie `ns_oauth` é `<state>.<destino>.<emitido em>.<hmac>`: HMAC-SHA256 com chave derivada do client secret. O servidor recusa (`400`) assinatura inválida, destino adulterado, cookie com mais de 10 minutos (validado no servidor, não só pelo `Max-Age`) ou emitido "no futuro". O `state` também precisa bater com o da URL de volta.

Primeiro login cria o usuário com apelido único derivado do nome no Discord (acentos removidos, 3 a 20 caracteres; colisão ganha sufixo numérico: `Ana`, `Ana2`…; nome **reservado** ganha `_gato`: `Admin` vira `Admin_gato`, ver **Apelido: reservados e limite de troca**) e um gato provisório determinístico pelo id do Discord (o cadastro só fica completo quando a pessoa salva o gato: ver **Perfil e cadastro**). Um login seguinte reaproveita o usuário e só atualiza o nome de exibição. Rate limit: 30 chamadas por IP a cada 10 min nas rotas de auth (`429`).

**Sessão.** Cookie `ns_sessao`: `HttpOnly`, `Secure`, `SameSite=Lax`, 30 dias. O valor é um token aleatório de 256 bits; **o banco guarda só o sha256 dele** (`sessoes.id`), então um vazamento do banco não entrega sessões. Renovação deslizante: se passou mais de 1 dia desde a última renovação, o uso empurra a expiração e reemite o cookie, com teto absoluto de 90 dias desde a criação. No máximo 10 sessões por usuário (a mais antiga cai). Expiradas são ignoradas na leitura e apagadas na subida da API e a cada hora.

**CSRF.** Rota autenticada por cookie que altera dados (POST/PUT/PATCH/DELETE) exige **`X-CSRF`** igual ao token da sessão (vem em `GET /api/eu`; é derivado do token do cookie, que o JavaScript não lê) e, se o navegador mandar `Origin`, ele precisa ser o do site. Falha = `403`. GET não exige. O stub de teste (header, sem cookie) não precisa.

**Patente.** `lib/patente.js`: a patente é calculada no servidor pela soma do razão `eventos_xp` e pela tabela `patentes`. Ao registrar uma rota, `{ autenticada: true }` exige usuário e `{ patente: 'moderador' }` exige também essa patente ou maior (id ou nome: `'banda_larga'`, `'Banda larga'`). `401` sem login, `403` abaixo da patente (`{ erro, patente_atual }`), `503` se a tabela `patentes` estiver vazia. Todas as rotas de economia usam a sessão; nenhuma rota de admin por patente foi criada ainda.

**Configuração (nunca no repositório, nunca em log).** Segredos só por arquivo (Docker secrets): `DISCORD_CLIENT_ID_FILE`, `DISCORD_CLIENT_SECRET_FILE` e, opcional, `DISCORD_GUILD_ID_FILE`. **O client secret por variável (`DISCORD_CLIENT_SECRET`) só vale em dev/test** (mesma allowlist do stub: `DB_NAME` com token `test`/`dev` e `NODE_ENV` diferente de `production`); em produção a variável é ignorada, com um aviso no log que não mostra o valor. `DISCORD_REDIRECT_URI` por variável (https obrigatório fora de localhost) e precisa ser **exatamente** a URL cadastrada no portal do Discord. Sem client id/secret/redirect a API sobe normalmente e as rotas de login respondem `503`. Opcionais: `DISCORD_EXIGIR_MEMBRO=1` (só entra quem está no servidor do `DISCORD_GUILD_ID`; pede também o scope `guilds`; ver **Decisões de produto**), `SITE_ORIGIN` (origem do site para o CSRF; padrão = origem do redirect) e `COOKIE_SECURE=0` (só para teste local sem HTTPS). Nas stacks: `docker-stack.dev.yml` e `deploy/auto/stack.dev.yml` usam `naosalvo_dev_discord_client_id`, `naosalvo_dev_discord_client_secret` e `naosalvo_discord_guild_id`; `docker-stack.yml` e `deploy/auto/stack.main.yml` usam `naosalvo_discord_client_id`, `naosalvo_discord_client_secret` e `naosalvo_discord_guild_id`. A access token do Discord é usada só durante o callback e descartada (não é gravada).

## Perfil e cadastro

Estado do perfil (todos em `usuario` de `GET /api/eu`):

| Campo | Tipo | Significado |
|---|---|---|
| `apelido` | string | 3 a 20 caracteres de `A-Z a-z 0-9 _ . -`. Único sem diferenciar maiúsculas, não pode ser reservado e só muda 1 vez a cada 24 h (a 1ª troca é livre): ver **Apelido: reservados e limite de troca** |
| `avatar_gato` | objeto | O gato (**avatar padrão**), sempre completo: `{ fur, pat, eye, acc, clo, bg }`, inteiros (lista fechada abaixo) |
| `avatar_url` | string \| null | Foto do Discord (CDN, montada no servidor) ou `null` se a conta não tem foto |
| `usar_foto` | bool | `true` = mostrar a foto em vez do gato. **Só é `true` se existir `avatar_url`** (se a pessoa tirar a foto no Discord, volta a `false` sozinho). Padrão `false` |
| `cadastro_completo` | bool | `false` até o gato ser salvo pela primeira vez (fim do criador de gato) |

**Lista fechada do `avatar_gato`** (as mesmas opções do criador de gato em `common.js`): `fur` 0 a 9 (10 pelos; 9 = Sphynx), `pat` 0 a 4 (5 padrões), `eye` 0 a 4 (5 olhos), `acc` 0 a 8 (9 acessórios), `clo` 0 a 7 (8 roupas), `bg` 0 a 7 (8 fundos). Todas as 6 chaves são obrigatórias, todas inteiros JSON (não strings) dentro da faixa; qualquer chave extra ou valor fora da faixa é recusado.

### `PATCH /api/eu` 🔒 (exige `X-CSRF`)

Corpo JSON com **pelo menos um** de: `{ apelido?, avatar_gato?, usar_foto? }`. Chave desconhecida = erro. As mudanças valem juntas (tudo ou nada). `avatar_url` **não** é aceito do cliente (vem só do login Discord).

Resposta `200`:

```json
{
  "usuario": { "id": 7, "apelido": "Ana", "avatar_gato": { "fur": 1, "pat": 0, "eye": 2, "acc": 3, "clo": 0, "bg": 4 }, "avatar_url": "https://cdn.discordapp.com/avatars/…png?size=128", "usar_foto": false, "cadastro_completo": true },
  "pacote_boas_vindas": { "estoque_id": 123 }
}
```

`pacote_boas_vindas` é `{ estoque_id }` **somente na chamada que entregou o pacote** (primeira vez que o `avatar_gato` é salvo); em qualquer outra, `null`. Abra com `POST /api/pacotes/abrir { estoque_id }`.

| Status | Quando |
|---|---|
| `400` `{ erro }` | JSON inválido, corpo vazio ou sem nenhum dos campos, chave desconhecida (inclusive `avatar_url`), corpo que não é objeto |
| `401` / `403` | Sem login / sem `X-CSRF` válido ou conta suspensa |
| `409` `{ erro: "apelido já está em uso" }` | Apelido ocupado por **outra** pessoa (sem diferenciar maiúsculas). Trocar só a caixa do próprio apelido (`ana` → `Ana`) é permitido |
| `422` `{ erro, campo }` | Valor inválido: `campo` é `"apelido"` (fora da regra **ou reservado**), `"avatar_gato"` (faltou chave, chave extra, não inteiro ou fora da faixa) ou `"usar_foto"` (não é booleano, ou `true` sem `avatar_url`) |
| `429` `{ erro }` | Mais de 30 alterações de perfil em 10 min |
| `429` `{ erro, campo: "apelido", tente_em_segundos }` | Apelido trocado há menos de 24 h. `tente_em_segundos` (inteiro, ≥ 1) diz quanto falta; o mesmo valor vai no header `Retry-After`. Como o PATCH é tudo ou nada, **nada** do corpo é gravado (nem o gato, nem as boas-vindas): reenvie sem o apelido |
| `503` | Pacote de boas-vindas não cadastrado (sem seed): **nada é gravado** |

### Perfil público e recados 🔒

O perfil que outras pessoas visitam (`perfil.html?u=<apelido>`). Tudo exige login. Migração 015.

**Campos novos no `PATCH /api/eu`** (também voltam em `usuario` de `GET /api/eu`):

| Campo | Tipo | Regra |
|---|---|---|
| `perfil_layout` | string | Visual do perfil, as mesmas redes da linha do tempo: `homepage` (anos 90), `icq`, `orkut` (padrão), `fotolog`, `msn`, `twitter`, `facebook`, `ask`, `whatsapp`, `vine`, `snapchat`, `instagram` ou `tiktok` (`kwai` e `bluesky` saíram na migração 018; quem usava foi para `tiktok` e `twitter`). Outro valor = `422 { campo: "perfil_layout" }` |
| `carta_favorita` | string \| null | Id da carta em destaque. **Só uma carta que a pessoa tem** (`quantidade > 0`), senão `422 { campo: "carta_favorita" }`. `null` tira a favorita. Se a pessoa reciclar a carta depois, ela some do perfil (conferido na leitura) |

| Rota | Resposta |
|---|---|
| `GET /api/perfil/:apelido` | `{ perfil: { apelido, avatar_gato, avatar_url, layout, membro_desde, eh_meu }, patente: { id, nome, cor }, proxima_patente: { nome, faltam } \| null, xp, carta_favorita: carta \| null, album: { total, tenho, colecoes_completas, colecoes: [{ id, nome, icone, cor, total, tenho, completa }], cartas: [carta] }, recados: <quantidade>, publicacoes: [publicação] }`. `carta` = `{ id, colecao_id, numero, nome, emoji, raridade, meme_id }`. Apelido sem diferenciar maiúsculas. **Não vaza** id, moedas, csrf nem banido. Inexistente, banido ou apelido fora da regra = `404` |
| `GET /api/perfil/:apelido/recados` | `{ itens: [{ id, texto, em, autor: { apelido, avatar_gato, avatar_url }, pode_apagar }] }`, os 50 mais recentes primeiro. Recado de autor banido não aparece. `pode_apagar` = você é o dono do perfil ou quem escreveu |
| `POST /api/perfil/:apelido/recados` (exige `X-CSRF`) | Corpo `{ texto }`: 1 a 300 caracteres depois de limpar (controle e caracteres invisíveis viram espaço, espaços repetidos juntos). `201` com o recado. `422` texto vazio/longo ou recado no próprio perfil; `404` perfil inexistente; `429` mais de 10 recados em 10 min |
| `DELETE /api/recados/:id` (exige `X-CSRF`) | `200 { ok: true }`. Só o dono do perfil ou o autor; qualquer outro caso (inclusive id inválido) = `404`, para não revelar nada |
| `POST /api/publicacoes` (exige `X-CSRF`) | Compartilhar figurinha do álbum no próprio perfil. Corpo `{ carta_id, legenda? }` (legenda 1 a 140 caracteres, mesma limpeza do recado; vazia = sem legenda). Só carta que a pessoa tem (`quantidade > 0`), senão `422`. Compartilhar a mesma de novo sobe a publicação (não duplica). `201` com a publicação. `429` mais de 20 em 10 min. Migração 018 |
| `DELETE /api/publicacoes/:id` (exige `X-CSRF`) | `200 { ok: true }`. Só o dono; qualquer outro caso = `404` |

`publicação` = `{ id, tipo: "figurinha" \| "meme", em, legenda, carta? (figurinha), meme?: { id, titulo, ano, youtube_id, emoji } (meme), pode_apagar }`. Entram as figurinhas compartilhadas e os memes que a pessoa enviou e foram aprovados (`envios.status = 'aprovado'`), os 30 mais recentes primeiro. Só figurinha pode ser apagada, e só pelo dono.

O texto do recado é guardado como texto puro: **o front sempre escapa** antes de mostrar. Os visuais são inspirados em cada rede, sem logos oficiais. A interação é a mesma em todos (recado) e só muda o nome (scrap no Orkut, livro de visitas no Fotolog e na home page, mensagem offline no MSN, menção no Twitter, mural no Facebook, pergunta no Ask.fm, comentário no Instagram/TikTok/Kwai/Vine etc.).

### Apelido: reservados e limite de troca

**Reservados.** Recusados com `422 { erro, campo: "apelido" }`: `admin`, `administrador`, `mod`, `moderador`, `moderacao`, `suporte`, `staff`, `nao salvo`, `naosalvo`, `xet`, `sistema`, `system`, `root`, `discord`, `oficial`. A comparação é **normalizada**: minúsculas, sem acentos, sem espaço nem `. _ -` e sem números no fim. Então `Admin`, `ADMIN_2`, `a.d.m.i.n`, `Nao-Salvo`, `Moderação` e `xet99` caem; `Modesto`, `admin_joao`, `rootbeer` e `ad2min` passam. A lista fica em `api/auth/apelidos.js`.

**Apelido gerado no 1º login.** Nunca é reservado. Como `admin2` também é reservado, número não resolve: a base reservada ganha `_gato` (`Admin` → `Admin_gato`; se colidir, `Admin_gato2`).

**Limite de troca.** O apelido só muda **1 vez a cada 24 h**. A **primeira troca é livre** (`usuarios.apelido_alterado_em` nulo); cada troca grava `apelido_alterado_em` e a seguinte só passa depois de 24 h (relógio do banco), senão `429` com `tente_em_segundos`. **Não contam** como troca: salvar o gato (a criação do gato), `usar_foto`, enviar o mesmo apelido que já tem (nada a fazer, `200`) e tentativas recusadas (`409` ocupado, `422` reservado ou inválido). Trocar só a caixa (`ana` → `Ana`) conta como troca. Contas existentes começam com a primeira troca livre (sem backfill). A ordem das checagens no servidor é: formato e reservado (`422`), janela de 24 h (`429`), apelido ocupado (`409`).

**Boas-vindas (regra fechada).** Na **primeira vez** que o `avatar_gato` é salvo (`cadastro_completo_em` era nulo) o servidor, na mesma transação e com a linha do usuário travada: preenche `cadastro_completo_em` e põe **1** pacote `boas` no estoque. Nunca duas vezes, nem com 10 `PATCH` simultâneos (índice único parcial em `pacotes_estoque` por usuário + origem `boas`). Salvar de novo o gato, trocar apelido ou `usar_foto` **não** dá pacote. `POST /api/visita` não dá boas-vindas.

## Autenticação de teste (stub)

`api/auth-stub.js` continua existindo **só para dev e testes**: com `AUTH_STUB=1`, o header `X-Test-User: <apelido>` (3 a 20 letras, números, `_`, `.`, `-`) identifica o usuário e o cria na primeira chamada. A sessão do login Discord tem prioridade; o stub só entra se não houver sessão válida. Sem a variável, o header é ignorado.

- **Só dev e teste.** Quem manda o header vira aquele usuário. A guarda é uma **allowlist**: o stub só liga se `DB_NAME` é de teste/dev **por token** (`naosalvo_dev`, `naosalvo_test`, `test_x`, `dev_x` ou nome terminando em `test`/`dev`; `prod_devel` não vale) **e** `NODE_ENV` não é `production` (sem diferenciar maiúsculas). `NODE_ENV=test` sozinho não basta. Qualquer outro caso (`naosalvo`, `naosalvo_staging`, banco ausente, `NODE_ENV=Production`, `naosalvo` com `NODE_ENV=test`) faz a API **recusar subir**, com erro claro, antes de tocar no banco. Nunca coloque `AUTH_STUB` em `docker-stack.yml`.
- Em produção as rotas 🔒 só aceitam a sessão do login Discord.
- O stub identifica o usuário **pelo apelido** do header: depois de `PATCH /api/eu { apelido }` o mesmo usuário passa a ser chamado pelo apelido novo. Com sessão (cookie) a identidade é o id e isso não acontece.

### Fora do escopo deste PR (anotado)

- Prefixo `__Host-` nos nomes dos cookies (exige Path=/ e sem Domain; o cookie de state usa `Path=/api/auth`, então ficaria só a sessão): melhoria futura.
- Login novo **não** revoga as sessões anteriores do usuário (até 10 coexistem, uma por navegador/dispositivo). Uma tela "sair de todos os dispositivos" é o caminho natural; hoje basta apagar as linhas de `sessoes` do usuário.

## Decisões de produto

### Fechadas

1. **Repetida fica no inventário e só vira moeda via `POST /api/album/reciclar`.** Abrir pacote soma a carta em `inventario_cartas.quantidade` e informa `valor_das_repetidas`, sem pagar. Assim a repetida continua existindo como carta, o que deixa espaço para **troca de figurinhas** no futuro. Consequência: `docs/subversivo011/economia-e-escassez.md` ("toda repetida vira moeda na hora") está **desatualizado** nesse ponto; a nota foi registrada no topo daquele arquivo. Os números da simulação valem como referência de ritmo, não como descrição exata.

2. **Exigir membro do servidor do Discord em produção: ligar `DISCORD_EXIGIR_MEMBRO=1`.** O código já suporta (testado com mock): quem não está no servidor volta para a página com `?login=nao_membro`, sem sessão; o pedido de autorização passa a incluir o scope `guilds` (a tela de consentimento mostra "ver seus servidores"). **Ainda não está ligado em nenhuma stack**: para ligar, acrescentar `DISCORD_EXIGIR_MEMBRO: "1"` ao `environment` da api em `docker-stack.yml` e `deploy/auto/stack.main.yml` (o `DISCORD_GUILD_ID_FILE` já está montado) e rebuild do deployer. Em dev, deixar desligado para testar com contas avulsas.

3. **Boas-vindas no fim da criação do gato** (decisão do dono), não na primeira visita: o servidor entrega o pacote na primeira vez que o `avatar_gato` é salvo em `PATCH /api/eu`, uma única vez por conta. O texto "no cadastro" de `economia-e-escassez.md` passa a valer.
4. **O gato é o avatar padrão; a foto do Discord é opção** (`usar_foto`, desligado por padrão). **O apelido é editável** (único, sem diferenciar maiúsculas). **Dados do `localStorage` do protótipo são descartados**: não há importação.

### Em aberto (implementado como no protótipo; confirmar com o grupo antes de divulgar)

1. **Preço do pacote Clássico (150 moedas)**: número da simulação, ainda não validado pelo grupo. Fica em `pacotes_tipo.preco`.
2. **Pacote diário acumula até 7** e o "dia" segue `America/Sao_Paulo` (`regras_economia.limites`).
3. **Sem tiragem numerada nos Míticos** (é recomendação do documento de economia, não implementada).

## Configuração

`TRUSTED_PROXY_HOPS` (padrão **2**) diz quantos proxies confiáveis ficam entre o cliente e a API. É o que define o **IP do cliente** usado no rate limit, nos hashes anti-spam e em `sessoes.ip`. O `X-Forwarded-For` é uma lista que cada proxy acrescenta à direita; o que está à esquerda pode ser forjado pelo cliente. Na cadeia cliente → Cloudflare → Traefik → API o Cloudflare acrescenta o IP real e o Traefik acrescenta o IP da borda do Cloudflare, então o IP do cliente é o item na posição N **a partir da direita** (N=2: o penúltimo): `forjado, IP-real, borda-CF` → `IP-real`. Cadeia com menos itens que N usa o último; sem cabeçalho (ou item que não pareça IP) usa o IP do socket; `0` ignora o cabeçalho. Se mudar a infraestrutura (outro proxy na frente, ou sem Cloudflare), ajuste o valor: ver o runbook. O IP puro não é gravado em tabelas de anti-spam (só HMAC); `sessoes.ip` guarda o IP para auditoria da sessão.

`DB_POOL_MAX` define o tamanho do pool de conexões do pg (inteiro de 1 a 100; padrão 10).

## Rotas já existentes (comportamento inalterado)

`/api/contribuidores`, `/api/votos` (agregado anônimo, tabela `votos_legado`), `/api/feedback`, `/api/comentarios`, `/api/links`, `/api/links/aprovados`, `/api/yt-stats` e `/api/admin/*` (token `Bearer`).

**Sobe.Desce** (migração 009): `POST /api/eventos` `{id, tipo: "visita"|"clique"}` conta 1 por meme, IP (HMAC) e dia; `GET /api/sobedesce?tipo=visitados|clicados&periodo=hoje|sempre` devolve `{sobe, desce}` (hoje: compara com ontem; sempre: mais e menos acessados).

**Memepédia** (migração 010): `GET /api/memepedia[?id=]` (último texto aprovado de cada parte), `POST /api/memepedia` `{id, campo, texto, fonte?, autor}` entra como pendente; moderação em `GET /api/admin/memepedia` e `POST /api/admin/memepedia/:id {status}`. Campos: origem, porque, usos, rede, hoje, curiosidades. Limites de uso por IP seguem em memória.

**Equipe do site** (migração 019, tabela `equipe` pelo **ID do Discord**, que não muda; o apelido muda e pode ser pego por outro):
- Papel da equipe (`moderador`) aplicado **uma vez** (na migração para quem já tem conta, ou no 1º login). Só sobe quem está como `usuario`; depois, quem decide é o admin.
- `patente_fixa`: patente mostrada sem o XP (vale a maior entre a do XP e a fixa) em `/api/eu`, carteira, perfil e ranking; conta para `exigePatente`. Não dá XP nem moedas.
- `edita_direto` (ou papel moderador/admin): `POST /api/memepedia/direto` `{ id, campo, texto, fonte? }` e `POST /api/links/direto` `{ id, yt }` (🔒, `X-CSRF`) entram **publicados**, sem fila; autor = apelido da conta; `403` para os demais. Não dá XP (por enquanto). `GET /api/eu` devolve `edita_direto`.

## Testes

`cd api && npm test` roda `node --test`. Testes que precisam de Postgres só rodam com um banco **descartável** (`TEST_DB_NAME` precisa conter `test` ou `descart`; cada arquivo usa um schema próprio):

```
docker run -d --name pgtest -e POSTGRES_USER=naosalvo -e POSTGRES_PASSWORD=t -e POSTGRES_DB=naosalvo_test -p 54329:5432 postgres:16-alpine
TEST_DB_PORT=54329 TEST_DB_PASSWORD=t TEST_DB_NAME=naosalvo_test npm test
```

Sem `TEST_DB_NAME` esses testes são pulados (é o caso do CI, que não tem Postgres).
