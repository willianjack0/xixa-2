# Política de Acesso e Segurança do Bucket S3 (MinIO)

Este documento descreve o diagnóstico de segurança da configuração atual do bucket S3 (`naosalvo`), a política de acesso recomendada, os comandos de aplicação/verificação via MinIO Client (`mc`) e a política do usuário de serviço.

> **Importante:** A aplicação destas políticas deve ser realizada pelo responsável pela infraestrutura do MinIO (`lab4`). A aplicação Não Salvo NÃO acessa o MinIO administrativamente.

---

## 1. Diagnóstico do Problema Atual

Atualmente, o bucket `naosalvo` no endpoint `https://s3.fishlab.com.br` está com a listagem aberta publicamente:
```sh
curl -s -i "https://s3.fishlab.com.br/naosalvo/?list-type=2"
```
O comando acima devolve código HTTP `200 OK` e o XML de `<ListBucketResult>` contendo a relação de todos os objetos do bucket sem necessidade de credenciais.

**Riscos:**
- Enumeração de arquivos privados ou arquivos temporários não publicados.
- Raspagem facilitada de metadados e arquivos de teste/órfãos.
- Consumo desnecessário de tráfego e CPU do servidor de storage.

---

## 2. Política de Acesso Público Recomendada (Bucket Policy)

O acesso anônimo (público) deve permitir **apenas** a leitura de objetos (`s3:GetObject`) sob o prefixo `midias/`. Qualquer tentativa de listagem (`s3:ListBucket`) anônima ou acesso a outros prefixos deve retornar `403 Forbidden`.

### 2.1 JSON da Política Anônima (`policy-anonima.json`)

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Sid": "LeituraPublicaApenasMidias",
      "Effect": "Allow",
      "Principal": "*",
      "Action": [
        "s3:GetObject"
      ],
      "Resource": [
        "arn:aws:s3:::naosalvo/midias/*"
      ]
    }
  ]
}
```

### 2.2 Aplicação via `mc` (MinIO Client)

Configurar o alias do cluster MinIO (se ainda não configurado):
```sh
mc alias set fishlab https://s3.fishlab.com.br <ADMIN_ACCESS_KEY> <ADMIN_SECRET_KEY>
```

Aplicar o arquivo JSON de política no bucket:
```sh
mc anonymous set-json policy-anonima.json fishlab/naosalvo
```

*(Alternativa rápida via comando `mc`, caso prefira o padrão pré-definido sob o prefixo):*
```sh
# Remove qualquer política anônima ampla do bucket:
mc anonymous set none fishlab/naosalvo

# Concede download público apenas para midias/*:
mc anonymous set download fishlab/naosalvo/midias
```

### 2.3 Comandos de Verificação

Execute os comandos a seguir para certificar que a política surtiu efeito:

1. **Testar Listagem Pública (deve falhar com 403 Forbidden):**
   ```sh
   curl -i "https://s3.fishlab.com.br/naosalvo/?list-type=2"
   # Esperado: HTTP 403 Forbidden (ou AccessDenied)
   ```

2. **Testar Leitura de Imagem Pública (deve ter sucesso):**
   ```sh
   curl -i -I "https://s3.fishlab.com.br/naosalvo/midias/<algum-arquivo-existente>.webp"
   # Esperado: HTTP 200 OK
   ```

3. **Testar Leitura de Objeto fora de `midias/` (deve falhar):**
   ```sh
   curl -i -I "https://s3.fishlab.com.br/naosalvo/privado.txt"
   # Esperado: HTTP 403 Forbidden
   ```

---

## 3. Política de Usuário de Serviço (Aplicação / MCP / Limpador)

A aplicação Não Salvo utiliza credenciais de serviço (`S3_ACCESS_KEY` e `S3_SECRET_KEY`) para:
1. Upload de mídias (`s3:PutObject`) em `naosalvo/midias/*`.
2. Verificação de existência (`s3:GetObject` / `head`) em `naosalvo/midias/*`.
3. Remoção de imagens antigas / órfãs (`s3:DeleteObject`) em `naosalvo/midias/*`.
4. Listagem (`s3:ListBucket`) **estritamente restrita** ao prefixo `midias/` (necessária para o script `limpar-orfaos-s3.js` e inventário).

### 3.1 JSON da Política do Usuário de Serviço (`policy-app-naosalvo.json`)

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Sid": "AcoesEmObjetosMidias",
      "Effect": "Allow",
      "Action": [
        "s3:PutObject",
        "s3:GetObject",
        "s3:DeleteObject"
      ],
      "Resource": [
        "arn:aws:s3:::naosalvo/midias/*"
      ]
    },
    {
      "Sid": "ListagemApenasPrefixoMidias",
      "Effect": "Allow",
      "Action": [
        "s3:ListBucket"
      ],
      "Resource": [
        "arn:aws:s3:::naosalvo"
      ],
      "Condition": {
        "StringLike": {
          "s3:prefix": [
            "midias/*",
            "midias/"
          ]
        }
      }
    }
  ]
}
```

### 3.2 Criação e Vinculação no MinIO via `mc`

1. **Criar a política no MinIO:**
   ```sh
   mc admin policy create fishlab naosalvo-app-policy policy-app-naosalvo.json
   ```

2. **Atribuir a política ao usuário de serviço da aplicação:**
   ```sh
   mc admin policy attach fishlab naosalvo-app-policy --user naosalvo-app-user
   ```

Com essa separação:
- Usuários anônimos da web conseguem carregar as imagens do acervo sem ver a lista completa de arquivos.
- A aplicação consegue salvar, listar e limpar órfãos de `midias/`.
- Ninguém (nem a app) consegue listar ou apagar dados fora do prefixo autorizado.
