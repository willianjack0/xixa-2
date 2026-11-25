# Plano: MCP para alimentar o acervo (painel adm `/seppzone`)

Objetivo: um admin conecta uma IA (Claude Desktop, Claude Code, qualquer cliente MCP) ao Não Salvo e ela busca, confere duplicados, cadastra e edita memes, sem passar pelo formulário. Cada admin cria a **própria chave de API** no painel; só admin cria chave. A aba **MCP** do painel mostra um `llms.txt` com as habilidades e o modo de uso.

Status em 25/11/2026: **M1 a M5 implementadas e em produção** (release #97). Falta o teste de ponta a ponta com um cliente MCP real instalado (ver "Pendências" no fim). Decisões já tomadas: mídias no **MinIO (S3)**; memes criados pelo MCP entram **publicados direto** para quem tem o escopo `publicar`, e o log registra o usuário **e que a ação veio pelo MCP**.

## Como funciona
- **Endpoint:** `POST https://naosalvo.fishlab.com.br/mcp`, MCP "Streamable HTTP" (JSON-RPC 2.0 sobre HTTP, sem SSE). Implementação mínima própria dentro da API (`initialize`, `ping`, `tools/list`, `tools/call`), sem dependência nova (a API só usa `pg`).
- **Autenticação:** `Authorization: Bearer ns_mcp_<segredo>`. Não usa cookie nem CSRF.
- **Quem a chave representa:** o admin que a criou. Cada chamada confere de novo, no banco, se o dono ainda é `admin` e não está banido; perdeu o papel, a chave para de valer na hora.
- **Escopos da chave** (escolhidos ao criar): `ler` (buscar e conferir), `escrever` (criar e editar memes como rascunho), `publicar` (publicar direto). Padrão: `ler` + `escrever`.
- **Tudo auditado:** cada tool que altera dado grava em `log_auditoria` com `via: "mcp"` e o id da chave.

## Chaves de API (fatia M1)
Tabela `chaves_api` (migração 022; 018 a 021 estão reservadas pelas PRs abertas do colaborador):

| coluna | nota |
|---|---|
| `id`, `usuario_id` (dono), `nome` (ex.: "Notebook do Xet") | |
| `prefixo` (primeiros 8 caracteres, para identificar na lista) | |
| `hash` (SHA-256 do segredo), **nunca o segredo** | segredo com 32 bytes aleatórios; mostrado **uma única vez** |
| `escopos` (`ler`, `escrever`, `publicar`), `expira_em` (padrão 90 dias, máximo 1 ano) | |
| `criada_em`, `ultimo_uso_em`, `ultimo_ip`, `revogada_em` | |

Rotas (só sessão de admin, com CSRF; o token de emergência **não** cria chave): `GET /api/admin/mcp/chaves` (as minhas; admin vê todas), `POST /api/admin/mcp/chaves` (devolve o segredo uma vez), `DELETE /api/admin/mcp/chaves/:id` (revoga; admin revoga qualquer uma). Máximo de 5 chaves ativas por admin.

## Tools (fatias M2 e M3)
| tool | escopo | o que faz |
|---|---|---|
| `listar_referencias` | ler | categorias, eras, coleções, raridades válidas e limites (para a IA não inventar valor) |
| `buscar_memes` | ler | por texto, ano, categoria, status; paginado |
| `conferir_duplicado` | ler | recebe link e/ou título; devolve memes e envios parecidos (mesma normalização de URL do envio e similaridade de título) |
| `criar_meme` | escrever | cria como **`oculto`** (rascunho) com título, ano, categoria, raridade, descrição, `youtube_id` ou link e mídias; recusa duplicado salvo `forcar: true`. Com o escopo `publicar` e `publicar: true`, já entra **`publicado`** |
| `editar_meme` | escrever | altera campos e mídias de um meme (mesma validação do admin) |
| `publicar_meme` | publicar | `oculto` → `publicado`; sem esse escopo, o admin publica pelo painel |
| `anexar_midia` | escrever | baixa uma imagem de uma URL ou recebe base64 e anexa ao meme (ver Mídias) |
| `criar_carta` | escrever | cria carta numa coleção, ligada ou não a um meme |

Não existem tools para apagar, banir, mudar papel, mexer em XP/moedas ou ler dados de usuários: a IA só alimenta o acervo.

## Mídias (fatia M4) — decidido: MinIO (S3)
Hoje as 74 imagens estão **dentro da imagem do site** (`memes/`), então imagem nova não pode ir para lá sem rebuild. Decisão: **MinIO** (já roda no vp3, serviço `minio_minio`).
- Bucket `naosalvo-midias`, usuário de serviço próprio só com permissão nesse bucket (secrets `naosalvo_s3_access_key` e `naosalvo_s3_secret_key`; nada de credencial do MinIO inteiro).
- A API grava com o protocolo S3 (PUT assinado com SigV4, escrito com `node:crypto`, sem SDK, para não inflar a imagem).
- Leitura pública: o nginx do site faz proxy de `/midias/` para o bucket (leitura anônima só desse prefixo), então a URL fica `https://naosalvo.fishlab.com.br/midias/<arquivo>`, sem expor o MinIO. `memes.midias.caminho` passa a aceitar `midias/<arquivo>`.
- Backup: o bucket entra no mesmo job de backup do banco.
Em ambos: só `image/jpeg`, `image/png`, `image/webp` (conferido pelos bytes iniciais, nunca pelo nome ou `Content-Type`), até 5 MB, nome gerado pelo servidor (`<meme>-<n>.<ext>`), sem SVG. Download por URL com proteção contra SSRF: só http(s), recusa IP privado/loopback/link-local (incluindo depois do redirect), timeout e limite de tamanho. `memes.midias.caminho` passa a aceitar `midias/<arquivo>`.
Os memes só com `youtube_id` (a maioria) **não precisam de mídia**.

## Painel: aba "MCP" (fatia M1 + M5)
- **Minhas chaves:** lista (nome, prefixo, escopos, validade, último uso), botão "Criar chave" (nome, escopos, validade), segredo exibido uma vez com botão copiar e aviso, "Revogar".
- **Como conectar:** trecho pronto para Claude Desktop/Claude Code (`claude mcp add --transport http naosalvo https://naosalvo.fishlab.com.br/mcp --header "Authorization: Bearer <sua chave>"`).
- **`llms.txt`:** texto com o que o MCP faz, as tools, os valores válidos, o fluxo recomendado ("conferir duplicado → criar rascunho → anexar mídia → avisar o admin para publicar"), limites e erros comuns. É **gerado a partir do registro das tools** (fonte única: nome, descrição e parâmetros de cada tool), então nunca fica desatualizado. Exibido na aba com "Copiar" e "Baixar", e servido em `GET /api/admin/mcp/llms.txt` (só admin).

## Segurança (resumo)
Segredo só em hash; exibição única; revogação imediata; papel conferido a cada chamada; limite de uso por chave (ex.: 60 chamadas/min, 300 criações/dia) com 429; sem CORS aberto; log com chave e IP; corpo máximo 8 MB; validação idêntica à do admin (mesmos esquemas); entrada tratada como dado (a IA pode ser induzida por conteúdo externo, por isso `criar_meme` entra como rascunho e **publicar é escopo separado**); sem acesso ao banco além das tools.

## Fatias
| # | Entrega | Pronto quando |
|---|---|---|
| M1 | migração 022, rotas de chaves, aba MCP com chaves e `llms.txt` base | admin cria/revoga chave; usuário comum recebe 403 |
| M2 | endpoint `/mcp` + tools de leitura | um cliente MCP real lista tools e busca memes |
| M3 | tools de escrita (rascunho, editar, publicar, carta) com escopos e log | a IA cadastra um meme oculto e ele aparece no admin |
| M4 | mídias (volume, upload, download seguro) | meme novo com imagem aparece no site |
| M5 | `llms.txt` gerado do registro, exemplos de conexão, testes ponta a ponta | um cliente MCP real conclui o fluxo sozinho |

**Publicação (decidido):** quem tem o escopo `publicar` publica direto; quem só tem `escrever` cria rascunho `oculto`. O `log_auditoria` grava o usuário dono da chave, o id da chave e `via: "mcp"` em toda ação, publicada ou não.

## Estado real (25/11/2026) e o que mudou do plano
- **Bucket:** `naosalvo` (não `naosalvo-midias`), prefixo `midias/`; usuário de serviço próprio (secrets `naosalvo_s3_access_key` / `naosalvo_s3_secret_key`).
- **Endpoint S3:** `https://s3.fishlab.com.br`, **não** `minio_minio:9000`: o MinIO recusa o host interno (`_` não vale em hostname; 400 "invalid hostname"). O nginx de `/midias/` usa o mesmo host (SNI + Host). Verificado em produção: PUT 200, HEAD 200, DELETE 204 e leitura anônima de `midias/` 200.
- **Imagens são otimizadas antes de ir para o S3** (`api/lib/imagens.js`, sharp): gira pelo EXIF, remove metadados (EXIF/GPS), reduz (meme 1600 px, carta 800 px) e converte para **WebP**; recusa animada, bomba de pixels (> 40 milhões) e arquivo corrompido. O mesmo caminho serve o MCP (`anexar_midia`) e o painel (`POST /api/admin/uploads/imagem?perfil=meme|carta`, até 10 MB). O log guarda tamanho final e original.
- **Vídeo só por link externo** (YouTube): não se cria mídia nova `video_arquivo` (a que já existe pode ficar); `youtube_id` aceita o link e guarda o id.
- **Cartas** ganharam `imagem` (migração 023); a tool `criar_carta` e o painel aceitam imagem e meme.
- **Roteamento:** o Traefik manda `/mcp` para a API (antes caía no nginx e dava 404; corrigido na #94).

## Onde cada mídia aparece no site (fonte única: o banco)
| Mídia | Origem | Onde aparece | Como chega |
|---|---|---|---|
| Imagem do meme (`midias` tipo imagem) | painel ou MCP → S3 `midias/` | cards da home, linha do tempo, Memepédia, visualizador, player (pôster), perfil (meme publicado) | `viewer.js` sincroniza `/api/memes` em todas as páginas; perfil recebe `meme.imagem` da API |
| Link do YouTube | painel ou MCP | miniatura quando o meme não tem imagem; player | `youtube_id` |
| Imagem da carta (`cartas.imagem`) | painel → S3 | álbum (vaga, carta, pacote aberto), perfil (figurinha, carta favorita, grade de publicações) | `GET /api/cartas` no álbum; `carta.imagem` nas rotas do perfil |
| Carta nova, nome, emoji, raridade, meme ligado | painel | álbum | `GET /api/cartas` (carta nova entra no fim da coleção) |
Prioridade da arte em todo lugar: **imagem do banco > imagem do meme no acervo > miniatura do YouTube > emoji**.

## Pendências
- **Teste com cliente MCP real** (Claude Code/Desktop instalado pelo admin): criar, ocultar, pesquisar e anexar mídia, conferindo no painel, no log (`via: mcp`) e no site.
- **Política do bucket:** hoje a listagem do bucket `naosalvo` é pública (anônimo lista os nomes). Restringir a leitura anônima a `GetObject` em `midias/*`.
- **Backup do bucket** no job de backup do banco (previsto neste plano): conferir se está rodando.
- Imagens enviadas **antes** de uma troca de meme/carta ficam órfãs no S3 (não há limpeza automática).
