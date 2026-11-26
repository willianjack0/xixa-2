// Migrações JÁ APLICADAS em produção: o conteúdo é congelado. O migrate.js recusa migração aplicada com checksum diferente e a
// API não sobe (travou os deploys depois de 25/11/2026, quando a 025 foi editada depois de aplicada). Para mudar o banco, crie uma
// migração NOVA. Este teste confere o mesmo checksum que o migrate.js grava (sha256 do SQL com LF).
// Ao aplicar uma migração nova em produção, acrescente-a aqui (nome: sha256).
import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const pasta = join(dirname(fileURLToPath(import.meta.url)), '..', 'migrations');
const CONGELADAS = {
  '001_legado.sql': '033a7b3110a6d5a39fb5fbc8ee205fe753fa6b88b67002bbf2963d71b06f4df2',
  '002_contas.sql': '76d7cec1a9df4b8bb0822fd78f5a6a166d2266a0c50993b19ed8c6e5350f9bb9',
  '003_acervo.sql': '3608efa9a78699269bc1857379c88c2c9050de06547899cafd30db61f9b0b4ae',
  '004_album_economia.sql': '4eb93fd0448c309de5ef4679ef128899821b310cfd3eaeb1bfd0ee0a412cfc03',
  '005_comunidade.sql': '9a6475a023ec0abfbd96d59940feb6b413ca6d24ffb7085ff610d896636c7a32',
  '006_moderacao.sql': '29cc01e49f4b35c012c4c69dd014cdebd33129f7b1da265128865d7c20208f41',
  '007_links_sugeridos.sql': 'a1cf16f0b73c1e88e2a89dceb0832e0bb9ef0d5370fff1460aa69a21491ea01f',
  '008_economia_servidor.sql': '885c54a97facd96782d64957638c7da43c0580742de34619e3604ce23967d941',
  '009_sobe_desce.sql': '6a2a1bae22c7f1849c12a37451bbe0592d55f3b572130c483a7d0166a890bd2b',
  '010_memepedia.sql': 'a63bb56d5332dbf32408854a046852ddcf04d3a877069f61761e11987deed745',
  '011_eventos_ip_dia_idx.sql': '97eba8b5a4279ebedcbf8f8d7373cf13786058a59ef27ea4ea5f6a010cdbe8ff',
  '012_contas_oauth_avatar.sql': 'b6473c533f333bdc8da8a24fde2ea95349bf5c3d936b11917345ee8d8e88e486',
  '013_perfil_cadastro.sql': 'd3ed70854c809d8bd3740a667272662933fe4e124d3873c90da49f3fa1bc4f0d',
  '014_apelido_alterado_em.sql': '75b789f1f56b7aafc52ea1b7c0e28925a725693ead190f2c90f0eeb878696115',
  '015_perfil_publico.sql': 'd0f538c98a41fe8471617ed93cff6753c223243e9153206ec483c1000b2fdab9',
  '016_votos_usuario.sql': 'bf45b41b553c5cb19a7d275d3a95592f9caaf46ea5c6a31009a5424084917d82',
  '017_papeis.sql': '35e6463fb9bb671b4f07ddeba4e9a08af4312bc7fdebff0bdaaddf2ee6f24a06',
  '018_perfil_publicacoes.sql': 'e1e1a79da69c22e064138d7f1d5b1a7416ad4094e3e6fe6f2c4b79a3abb272b9',
  '019_equipe.sql': 'b7f5dabe3725d3701969924945703cd81bc99230e1f0503947fdbc992e1593c2',
  '020_acervo_correcoes_lote1.sql': 'fc76519e6b56df780bbd587dd4daa4b2ba862573f5290148d80c5dc3be80c0a1',
  '021_album_figurinhas_memes.sql': '6c0a1b01d905604b6f5b1fe1e9e1c2f5d1a81e7d66b1bed6abebcf2fc99f220c',
  '022_chaves_api.sql': '4600991b229b06ef2cd4ba23ec877c176949d2cc121c1cd417699319f89a273d',
  '023_cartas_imagem.sql': 'c2405726803f4ee8fc5aef020ea52852e014c587335791fedb008960af105013',
  '024_analytics.sql': '7459b6d117186116cb0b3e2591efad71882df6f663715f4e0c9eb6ecf428e829',
  '025_memes_catalogo_doc.sql': 'ebc03e522311623b05ef6cd3e2ad7231735062c7379516680fe9f6467b4e4bd5'
};

test('migrações já aplicadas em produção não foram editadas (crie uma migração nova em vez disso)', () => {
  const ruins = [];
  for (const [nome, esperado] of Object.entries(CONGELADAS)) {
    const sql = readFileSync(join(pasta, nome), 'utf8').split('\r\n').join('\n');
    const atual = createHash('sha256').update(sql).digest('hex');
    if (atual !== esperado) ruins.push(nome);
  }
  assert.deepEqual(ruins, [], 'migração aplicada e editada: ' + ruins.join(', ') + ' (o migrate.js recusa e a API não sobe)');
});

test('toda migração congelada ainda existe', () => {
  const existentes = new Set(readdirSync(pasta));
  assert.deepEqual(Object.keys(CONGELADAS).filter((n) => !existentes.has(n)), []);
});
