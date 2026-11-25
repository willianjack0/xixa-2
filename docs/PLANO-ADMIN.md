# Plano do admin e da moderação (Fase 3, em fatias)

Continuação da Fase 3 de `PLANO-IMPLEMENTACAO.md`. Começa pelo backend; o front do admin só liga em cada fatia depois que a API dela passa nos testes.

## Regras de acesso (decididas)

- **Papel** (`usuarios.papel`): `usuario` < `moderador` < `admin`. É separado da patente (XP): a patente é mérito, o papel é permissão.
- O primeiro admin é o usuário `yorkshiremaconhadoa` (definido na migração 017, uma vez, só se a conta existir).
- Usuário comum **não vê** a aba Moderação. Sessão deslogada **não vê** Ranking, Álbum, Moderação nem Enviar meme (o menu esconde e a página manda para o login; a API já responde 401 nas rotas autenticadas).
- O servidor é a autoridade: o front só esconde; toda rota confere o papel no banco a cada chamada.
- O token fixo `ADMIN_TOKEN` continua como chave de emergência até a fatia 6.

## Fatias

| # | Fatia | Backend | Front | Pronto quando |
|---|---|---|---|---|
| 1 | **Papéis e acesso** | migração 017 (`usuarios.papel`), `lib/papel.js`, opção `{ papel }` no roteador, `/api/eu` devolve `papel`, `/api/admin/*` aceita sessão de admin | menu: Moderação só para moderador/admin; deslogado não vê Ranking, Álbum, Moderação, Enviar meme | `yorkshiremaconhadoa` entra no admin com o login; usuário comum recebe 401/403 |
| 2 | **Log de auditoria** | helper `auditar(db, usuario, acao, alvo, detalhe)` sobre `log_auditoria`; `GET /api/admin/log` | aba Log (somente leitura) | toda ação de admin/moderador aparece no log, e o log não pode ser apagado (trigger já existe) |
| 3 | **Usuários** | `GET /api/admin/usuarios`, `POST …/:id/papel`, `POST …/:id/banir` (respeita o papel de quem age; ninguém muda o próprio papel) | aba Usuários e patentes | admin promove e bane; tudo no log |
| 4 | **Acervo: memes e cartas** | CRUD de `memes`, `midias`, `cartas`, `colecoes`, `eras`, `categorias` com validação e log | abas Memes e Cartas | editar um meme no admin muda o site sem rodar o seed |
| 5 | **Moderação** | `GET /api/mod/fila`, voto por consenso, `edicoes`, `remocoes` (prazo de 72 h) | aba Moderação (só moderador/admin) | um envio aprovado entra no acervo, o autor ganha XP e moedas |
| 6 | **Admin único** | `GET /api/admin/resumo`, `/regras` (XP editável) | trocar os dados fictícios por chamadas, mover Contribuidores/Feedback/Comentários, aposentar `/dashboard`, tirar o token fixo | `/admin` sem dados de exemplo |

## Estado em 25/11/2026
| # | Fatia | Estado |
|---|---|---|
| 1 | Papéis e acesso | **pronta** (papel no banco, `/api/eu` devolve `papel`, menu por papel) |
| 2 | Log de auditoria | **pronta** (aba Log; `auditar` em toda ação, inclusive via MCP) |
| 3 | Usuários | **pronta** (papel e banimento) |
| 4 | Acervo: memes e cartas | **pronta**, com **upload de imagem** (S3, WebP), **busca de meme** na carta e **imagem da carta**; o site lê o banco (álbum, perfil e páginas de meme) |
| 5 | Moderação | **pronta** (fila, consenso, remoções com prazo de 72 h; insígnia de moderador no ranking) |
| 6 | Admin único | **parcial**: o painel mudou de `/admin` para `/seppzone` e a **Visão geral** tem números reais e **Navegação do site** (visitas, sessões, tempo, origens, dispositivos, memes mais vistos). Falta aposentar `/dashboard` e tirar o token fixo (`ADMIN_TOKEN` segue como chave de emergência) |

Pendências do admin: aposentar `/dashboard` e o token fixo; `/api/admin/resumo` e regras de XP editáveis (fatia 6); visitantes únicos de 7 e 30 dias são únicos por dia somados (limite do analytics sem dado pessoal).

## Fatia 1 (histórico)

Arquivos: `api/migrations/017_papeis.sql`, `api/lib/papel.js`, `api/lib/router.js`, `api/routes/auth.js`, `api/test/papel.test.js`.

Cuidados:
- O papel é lido do banco em cada chamada (não vai no cookie nem no token), então rebaixar alguém vale na hora.
- Sessão de admin por cookie em método que altera dados passa pelo CSRF, igual às outras rotas.
- Se mandar `Authorization` errado, não cai para a sessão (evita confundir os dois modos).
- Renomear o apelido depois da migração não muda o papel; quem registrar o apelido depois não herda nada.

Fica para depois: tela de login própria do admin, 2FA e expiração mais curta da sessão de admin.
