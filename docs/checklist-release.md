# Checklist de release: promoção `dev` → `main`

Use este roteiro a cada promoção. O deploy é automático (merge na `main` → GitHub Actions publica as imagens → Portainer atualiza o vp3), então o cuidado vem **antes** do merge e a conferência vem **depois**. Detalhes do fluxo em `docs/deploy-vp3-portainer.md` e do banco em `docs/runbook-banco.md`.

## 1. Antes de abrir o PR de promoção

- [ ] Tudo que entra já passou pelo CI em PR para a `dev` (sintaxe, testes da API, migrações do zero, imagens, `?v=`).
- [ ] `git fetch` e `git merge-tree --write-tree origin/main origin/dev` sem conflito.
- [ ] Lista do que entra: `git log origin/main..origin/dev --merges` (um item por PR).
- [ ] **Migrações:**
  - Nenhuma migração já aplicada em produção foi editada. O teste `api/test/migracoes-aplicadas.test.js` congela os checksums; se ele falhar, crie uma migração **nova** e restaure a antiga. (Foi isso que travou os deploys de 25 a 26/11/2026: a API sai com `exit=1` e o Swarm faz rollback.)
  - Número novo livre e sem duplicata (o `migrate.js` recusa versão repetida).
  - Migração nova acrescentada ao teste congelado **depois** de aplicada em produção.
  - Ensaio com o banco no estado de produção: aplique 001 até a última já aplicada num Postgres descartável e rode `node migrate.js` por cima com o código novo.
- [ ] Rodou a suíte da API num Postgres local com o código da promoção (`cd api && TEST_DB_NAME=naosalvo_teste TEST_DB_PORT=55432 TEST_DB_USER=naosalvo TEST_DB_PASSWORD=teste npm test`).
- [ ] Páginas tocadas com o mesmo `?v=` em `theme.css`, `common.js` e `cliente-economia.js` em todas.
- [ ] Se houver migração destrutiva ou lenta: backup manual antes (`docs/backup-e-restauracao.md`) e aviso de janela.

## 2. O PR de promoção

- [ ] Título: `Promove dev para main: #NN descrição, #MM descrição`.
- [ ] Corpo com **O que entra** (um item por PR) e **Antes de deploy** (migrações que vão rodar, mudança de API, risco, decisões assumidas).
- [ ] CI verde e `mergeStateStatus` limpo. Merge com **merge commit** (não squash), para manter o histórico dos PRs.

## 3. Depois do merge

1. Espere o Actions "Publicar imagens (main)" terminar (cerca de 40 s). O `latest` só muda quando o push termina.
2. O Portainer consulta a cada 30 min. Para não esperar: stack `naosalvo` > **Puxe e reimplemente** com **Baixe novamente a imagem** ligado.
3. Confira, nesta ordem:
   - [ ] `https://naosalvo.fishlab.com.br/versao.json` mostra o SHA e o PR da promoção.
   - [ ] `https://naosalvo.fishlab.com.br/api/health` responde 200.
   - [ ] No vp3: `docker service inspect naosalvo_api --format '{{json .UpdateStatus}}'` termina em `completed`. **`rollback_completed` significa que a API nova não subiu**: veja `docker events --since 15m --filter event=die` (código de saída) e os logs da tarefa.
   - [ ] As migrações novas aparecem em `select max(versao), count(*) from schema_migrations` no banco `naosalvo`.
   - [ ] Um fluxo real no navegador, logado (perfil, álbum ou o que mudou).
4. Atualize o teste de migrações congeladas com as migrações recém-aplicadas.

## 4. Rollback

- Fixar a versão anterior: no Portainer, stack `naosalvo` > Environment variables > `NAOSALVO_TAG` = SHA anterior (7 caracteres) > **Update the stack**. Voltar ao automático: apague a variável.
- A API usa `stop-first` e `failure_action: rollback`: se a nova morrer em 20 s, o Swarm volta sozinho para a anterior (o site continua atendendo).
- Migração já aplicada **não** desfaz com o rollback da imagem. Por isso migração nova precisa ser compatível com a versão anterior da API (adicionar coluna, não remover), ou o rollback exige restaurar backup.
- Nunca buildar ou publicar imagem à mão: tudo sai do Actions na `main`.

## 5. Tag de versão

- [ ] Depois da conferência, marque a versão: `git tag vAAAA.MM.DD-N <sha da main>` e `git push origin <tag>`.
