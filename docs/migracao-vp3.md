# Migração do Não Salvo para o vp3 (produção)

Do servidor 2 (lab) para o vp3 (`jkp3`, Debian, Swarm de um nó com Traefik, Portainer e Postgres compartilhados).
Domínio de produção: **naosalvo.fishlab.com.br**. `naosalvo-local` e `naosalvo-dev` passam a só redirecionar para ele.

## Decisões (já tomadas)
- **Banco de origem: `naosalvo_dev`.** Conferido em 25/11/2026: `naosalvo` (o "local") tem 0 usuários e está na migração 015; `naosalvo_dev` tem os 7 usuários (todos do Discord, incluindo o admin `YorkshireMaconhadoa`), 129 eventos de XP, comentários, votos e as migrações até a 017. Ele vira o banco `naosalvo` da produção.
- **Usuários vêm junto, sim.** O dump leva `usuarios`, `contas_oauth`, razão de XP e moedas, inventário, votos etc. O login é pelo ID do Discord, que é o mesmo em qualquer app do Discord; o usuário entra na mesma conta, só precisa logar de novo (o cookie é do domínio novo). Admin, papéis e banidos também vão no dump.
- **Discord: usa o app do dev**, com a URL de callback nova.
- **Stack gerenciável pelo Portainer** (`deploy/vp3/stack.yml`, compose v3.8 com secrets externos e variável `NAOSALVO_TAG`).
- **Imagens no Docker Hub** (`willianjack0/naosalvo-api` e `willianjack0/naosalvo-web`), como as outras stacks do vp3.

## O que o vp3 já tem (conferido em leitura)
8 CPUs, 23 GB de RAM, 186 GB livres. Rede `jknet`; Traefik com `letsencryptresolver` (desafio HTTP) e `--providers.docker.network=jknet`; Postgres 14.20 (`postgres_postgres`), mesma versão principal do lab (14.24): dump e restauração compatíveis. Não existe ainda banco, usuário nem secrets do naosalvo.

## Roteiro

### 0. Antes de começar (sem mexer em nada)
- [ ] **Discord:** no app do dev, em OAuth2 > Redirects, adicionar `https://naosalvo.fishlab.com.br/api/auth/discord/callback` (pode manter o antigo até o fim). Anotar `client_id`, `client_secret` e o `guild_id` do servidor da comunidade.
- [ ] **DNS (Cloudflare):** registro `naosalvo.fishlab.com.br` → `144.91.91.104`. Veja como os outros domínios do vp3 estão (nuvem laranja/proxy ou só DNS). Proxy ligado: deixe `TRUSTED_PROXY_HOPS: "2"`; só DNS: mude para `"1"` na stack.
- [ ] **Docker Hub:** o repositório é privado? Se sim, adicione a credencial no Portainer (Registries) para o Swarm puxar as imagens.

### 1. Banco e secrets no vp3
No terminal do vp3 (`ssh root@144.91.91.104`):
```sh
P=$(docker ps -q -f name=postgres_postgres | head -1)
SENHA=$(openssl rand -base64 24 | tr -d '/+=\n')
printf "CREATE ROLE naosalvo LOGIN PASSWORD '%s';\nCREATE DATABASE naosalvo OWNER naosalvo;\n" "$SENHA" | docker exec -i $P psql -U postgres -v ON_ERROR_STOP=1
printf %s "$SENHA" | docker secret create naosalvo_db_password -
openssl rand -hex 32 | tr -d '\n' | docker secret create naosalvo_admin_token -       # chave de emergência: guarde no gerenciador de senhas
printf %s 'CLIENT_ID'     | docker secret create naosalvo_discord_client_id -
printf %s 'CLIENT_SECRET' | docker secret create naosalvo_discord_client_secret -
printf %s 'GUILD_ID'      | docker secret create naosalvo_discord_guild_id -
unset SENHA
```
Os valores nunca vão para o repositório, para o Portainer nem para o histórico (`printf` é interno do shell).

### 2. Imagens
Em um checkout limpo de `main` (na vp3 serve), com `docker login` feito:
```sh
sh deploy/vp3/build-push.sh --so-build   # teste: constrói e não publica
sh deploy/vp3/build-push.sh              # publica <sha7> e latest no Docker Hub
```
O site sai com o `/versao.json` (ramo, PR, SHA e hora para a tarja do rodapé).

### 3. Ensaio (não derruba nada)
Faz um dump de teste, restaura no vp3 e sobe a stack para validar antes do dia da virada. Use os mesmos comandos do passo 5, mas **sem** parar a API do lab. O ensaio descobre erro de permissão, versão e secrets sem pressa. Depois do ensaio: `DROP DATABASE naosalvo; CREATE DATABASE naosalvo OWNER naosalvo;` e repita no dia.

### 4. Stack no Portainer
Portainer > Stacks > Add stack > **Web editor**, nome `naosalvo`, cole `deploy/vp3/stack.yml`. Em Environment variables: `NAOSALVO_TAG` = `<sha7>`. Deploy. (Pela linha de comando: `NAOSALVO_TAG=<sha7> docker stack deploy --with-registry-auth -c deploy/vp3/stack.yml naosalvo`.)
Atualizar depois: mude `NAOSALVO_TAG` e **Update the stack**. Reverter: volte a tag anterior. A API troca com `stop-first` de propósito (a migração nova roda na subida e a versão antiga não pode atender com o esquema novo).

Validação sem depender do DNS final (certificado de teste, por isso `-k`):
```sh
curl -sk --resolve naosalvo.fishlab.com.br:443:144.91.91.104 https://naosalvo.fishlab.com.br/api/health      # {"ok":true,"banco":"ok"}
curl -sk --resolve naosalvo.fishlab.com.br:443:144.91.91.104 https://naosalvo.fishlab.com.br/versao.json
```

### 5. Virada (janela curta, ~15 min)
1. **Congelar a escrita no lab:** `docker --context servidor2 service scale naosalvo-dev_api=0`. O site fica sem API (leitura estática ok).
2. **Dump final** (formato custom, sem donos):
   ```sh
   C=$(docker --context servidor2 ps -q -f name=postgres_postgres)
   docker --context servidor2 exec $C pg_dump -U postgres -Fc --no-owner --no-acl naosalvo_dev > naosalvo_dev_FINAL.dump
   scp naosalvo_dev_FINAL.dump root@144.91.91.104:/root/
   ```
3. **Restaurar no vp3** (banco `naosalvo` vazio):
   ```sh
   P=$(docker ps -q -f name=postgres_postgres | head -1)
   docker cp /root/naosalvo_dev_FINAL.dump $P:/tmp/n.dump
   docker exec $P pg_restore -U postgres -d naosalvo --no-owner --no-acl --role=naosalvo --exit-on-error /tmp/n.dump
   docker exec $P psql -U postgres -d naosalvo -c "DELETE FROM sessoes"     # sessões do domínio antigo não servem
   docker exec $P rm /tmp/n.dump
   ```
4. **Conferir** (devem bater com o lab): `usuarios` 7 (ou o valor do dia), `contas_oauth` igual, `memes`, `eventos_xp`, `max(versao) from schema_migrations` = 017; `SELECT papel FROM usuarios WHERE apelido ILIKE 'yorkshiremaconhadoa'` = `admin`.
5. **Subir/atualizar a stack** (passo 4) e validar com `--resolve`.
6. **DNS no ar** (se ainda não estiver): `naosalvo.fishlab.com.br` → vp3; o Traefik emite o certificado na primeira visita.
7. **Testar de verdade:** login com Discord (entra na mesma conta), `/seppzone/` como admin, voto, envio de meme, tarja de versão no rodapé.

### 6. Redirecionar os endereços antigos
No servidor 2, nesta ordem (duas rotas com o mesmo Host brigam no Traefik):
```sh
docker --context servidor2 stack rm naosalvo-deployer      # senão ele recria as stacks
docker --context servidor2 stack rm naosalvo-dev
docker --context servidor2 stack rm naosalvo
docker --context servidor2 stack deploy --resolve-image never -c deploy/lab-redirect/stack.yml naosalvo-redirect
curl -sI https://naosalvo-dev.fishlab.com.br/api/health | grep -i location      # https://naosalvo.fishlab.com.br/api/health
```
Não apague os bancos `naosalvo` e `naosalvo_dev` do lab nem os secrets por pelo menos 30 dias (rede de segurança).

### 7. Rollback
- **Antes do passo 6:** `docker --context servidor2 service scale naosalvo-dev_api=1` e aponte o DNS de volta (ou apenas não divulgue o domínio novo). Nada foi apagado no lab.
- **Depois do passo 6:** `stack rm naosalvo-redirect` e `stack deploy` das stacks antigas (`deploy/auto/stack.dev.yml` e `stack.main.yml`, imagens `:prev` ainda no servidor 2). Dados novos gravados no vp3 desde a virada precisariam de um dump do vp3 para voltar.

## Depois da virada (pendências, em ordem)
1. **Backup no vp3:** `pg_dump -Fc naosalvo` diário em `/root/backups` (o do lab, `docs/backup-e-restauracao.md`, não vai junto) e um teste de restauração.
2. **Deploy contínuo:** hoje o deployer do lab publica a cada merge. No vp3, opção recomendada: GitHub Actions faz `build-push.sh` em merge na `main` e chama o webhook da stack no Portainer (atualiza `NAOSALVO_TAG`). Fica para uma PR própria, decidindo antes se o ambiente de dev continua no lab.
3. **Ambiente de dev:** com o `naosalvo-dev` virando redirecionamento, não sobra um dev com banco próprio. Se quiser manter um, a stack de dev sobe no lab em outro domínio (ex.: `naosalvo-teste.fishlab.com.br`) com um banco novo.
4. **Segurança:** trocar a senha do Postgres compartilhado só se ela já tiver circulado; manter `ADMIN_TOKEN` fora de qualquer chat.
