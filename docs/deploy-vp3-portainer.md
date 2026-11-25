# Deploy contínuo do vp3: GitHub Actions + Portainer em modo Git

Fluxo: merge na `main` → o GitHub Actions constrói as imagens e publica no Docker Hub (`willianjack0/naosalvo-api` e `naosalvo-web`, tags `<sha7>` e `latest`) → o Portainer, com a stack ligada ao repositório, consulta **a cada 30 minutos**, puxa o `latest` e atualiza o vp3. Nada de deployer próprio nem de `docker.sock` exposto.

Peças no repositório: `.github/workflows/publicar-imagens.yml` (publica) e `deploy/vp3/stack.yml` (a stack que o Portainer lê).

## Passo a passo (uma vez só)

### 1. Token do Docker Hub
1. Entre em hub.docker.com com a conta `willianjack0`.
2. Avatar (canto superior direito) > **Account settings** > **Personal access tokens** > **Generate new token**.
3. Descrição `github-actions-naosalvo`, permissão **Read & Write**, validade a gosto (90 dias, anotando para renovar). **Generate**.
4. Copie o token agora (só aparece uma vez).

### 2. Secrets no GitHub
Repositório `willianjack0/xixa-2` > **Settings** > **Secrets and variables** > **Actions** > **New repository secret**:
- `DOCKERHUB_USERNAME` = `willianjack0`
- `DOCKERHUB_TOKEN` = o token do passo 1

### 3. Publicar a primeira vez (cria o `latest`)
Depois que este workflow estiver na `main`: **Actions** > **Publicar imagens (main)** > **Run workflow** (branch `main`) > **Run workflow**. Leva uns 2 a 4 minutos. No resumo do job aparecem as duas imagens. Confira no Docker Hub que existe `willianjack0/naosalvo-web:latest` e `naosalvo-api:latest`. **Não siga para o passo 4 antes disso**, senão a stack não encontra a imagem.

### 4. Trocar a stack do vp3 para o modo Git
A stack atual (`naosalvo`) foi criada pela linha de comando. O Portainer só gerencia por completo as que ele mesmo cria, então ela precisa ser recriada. **Dá uns segundos a 1 minuto de queda** do site. Os dados ficam seguros no Postgres e os secrets continuam existindo.
1. No terminal do vp3: `docker stack rm naosalvo` (espere sumir: `docker service ls | grep naosalvo` vazio).
2. No Portainer: **Stacks** > **Add stack**.
3. **Name:** `naosalvo`. **Build method:** `Repository`.
4. **Repository URL:** `https://github.com/willianjack0/xixa-2` (público: deixe *Authentication* desligado).
5. **Repository reference:** `refs/heads/main`.
6. **Compose path:** `deploy/vp3/stack.yml`.
7. **GitOps updates** (ligue): *Automatic updates* ligado, *Mechanism* `Polling`, *Fetch interval* **`30m`**. Marque **Re-pull image** (e **Force redeployment** se existir). Sem essas marcas ele não puxa o `latest` novo.
8. **Environment variables:** nenhuma (a stack usa `latest` por padrão). Para fixar uma versão ou fazer rollback, crie `NAOSALVO_TAG` = `<sha7>` e use **Update the stack**.
9. **Deploy the stack.** Em ~1 minuto: `naosalvo_api` e `naosalvo_web` em 1/1.
10. Confira `https://naosalvo.fishlab.com.br/versao.json` (SHA e PR da última `main`).

### 5. Validar o ciclo inteiro
Faça um merge pequeno na `main` (ou rode o workflow à mão). Em até 30 minutos depois do workflow terminar, `versao.json` mostra o SHA novo. Para não esperar: Portainer > Stacks > `naosalvo` > **Pull and redeploy**.

## Operação
- **Rollback:** Portainer > `naosalvo` > Environment variables > `NAOSALVO_TAG` = SHA anterior > Update the stack. Voltar ao automático: apague a variável.
- **Tempo de consulta:** Portainer > Stacks > `naosalvo` > *GitOps updates* > *Fetch interval*.
- **A API troca com `stop-first`:** a cada versão a API fica alguns segundos fora (a migração nova roda na subida). O site estático continua no ar.
- **Se o Actions falhar:** a stack continua na versão anterior (o `latest` só muda quando o push termina). O resumo do job mostra o erro.
- **Segurança:** o token do Docker Hub vive só nos secrets do GitHub; o workflow só roda em push na `main` (não em PR de fora). Renove o token antes de vencer.
