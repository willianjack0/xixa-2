// Registro das ferramentas do MCP: FONTE ÚNICA de nome, escopo, descrição e parâmetros. O llms.txt (aba MCP do painel) e o
// tools/list do endpoint /mcp saem daqui, então a documentação nunca fica desatualizada. `ativa: false` = ainda não existe
// no servidor (não aparece no llms.txt nem no tools/list).
export const FERRAMENTAS = [
  { nome: 'listar_referencias', escopo: 'ler', ativa: true,
    resumo: 'Lista os valores válidos: categorias, eras, coleções, raridades e limites. Chame antes de criar algo, para não inventar valor.', params: {} },
  { nome: 'buscar_memes', escopo: 'ler', ativa: true,
    resumo: 'Busca memes por texto, ano, categoria ou situação (publicado, oculto, removido). Paginado.',
    params: { busca: { tipo: 'texto', descricao: 'trecho do título' }, ano: { tipo: 'inteiro' }, categoria: { tipo: 'texto' }, status: { tipo: 'texto', descricao: 'publicado | oculto | removido' }, limite: { tipo: 'inteiro', descricao: 'até 50' }, offset: { tipo: 'inteiro' } } },
  { nome: 'conferir_duplicado', escopo: 'ler', ativa: true,
    resumo: 'Confere se um link ou título já existe no acervo ou na fila de envios. Use sempre antes de criar_meme.',
    params: { url: { tipo: 'texto', descricao: 'link do vídeo ou da imagem' }, titulo: { tipo: 'texto' } } },
  { nome: 'criar_meme', escopo: 'escrever', ativa: true,
    resumo: 'Cria um meme como rascunho oculto. Com o escopo publicar e publicar=true, já entra publicado. Recusa duplicado, salvo forcar=true.',
    params: {
      id: { tipo: 'texto', obrigatorio: true, descricao: 'slug a-z, 0-9 e hífen' },
      titulo: { tipo: 'texto', obrigatorio: true },
      ano: { tipo: 'inteiro', obrigatorio: true },
      categoria: { tipo: 'texto', obrigatorio: true },
      raridade: { tipo: 'texto', obrigatorio: true },
      tipo: { tipo: 'texto', descricao: 'video | foto (padrão video)' },
      data: { tipo: 'texto', descricao: 'AAAA-MM-DD' },
      emoji: { tipo: 'texto' },
      descricao: { tipo: 'texto' },
      autor: { tipo: 'texto' },
      duracao: { tipo: 'inteiro', descricao: 'em segundos' },
      youtube_id: { tipo: 'texto', descricao: '11 caracteres' },
      publicar: { tipo: 'booleano', descricao: 'só com o escopo publicar' },
      forcar: { tipo: 'booleano', descricao: 'ignora aviso de duplicado' }
    } },
  { nome: 'editar_meme', escopo: 'escrever', ativa: true,
    resumo: 'Altera campos de um meme existente (mesma validação do painel).',
    params: {
      id: { tipo: 'texto', obrigatorio: true },
      titulo: { tipo: 'texto' },
      ano: { tipo: 'inteiro' },
      data: { tipo: 'texto', descricao: 'AAAA-MM-DD' },
      categoria: { tipo: 'texto' },
      raridade: { tipo: 'texto' },
      tipo: { tipo: 'texto', descricao: 'video | foto' },
      emoji: { tipo: 'texto' },
      descricao: { tipo: 'texto' },
      autor: { tipo: 'texto' },
      duracao: { tipo: 'inteiro', descricao: 'em segundos' },
      youtube_id: { tipo: 'texto', descricao: '11 caracteres' }
    } },
  { nome: 'publicar_meme', escopo: 'publicar', ativa: true,
    resumo: 'Muda um meme de oculto para publicado.', params: { id: { tipo: 'texto', obrigatorio: true } } },
  { nome: 'anexar_midia', escopo: 'escrever', ativa: true,
    resumo: 'Anexa uma imagem (jpeg, png ou webp, até 5 MB) a um meme existente. Informe exatamente um entre url (link público, baixado pelo servidor) e base64 (só imagens pequenas, até uns 700 KB, por causa do limite de 1 MB da requisição).',
    params: { id: { tipo: 'texto', obrigatorio: true, descricao: 'id do meme' }, url: { tipo: 'texto', descricao: 'link público http/https da imagem (portas 80 e 443)' }, base64: { tipo: 'texto', descricao: 'conteúdo da imagem em base64' }, credito_por: { tipo: 'texto', descricao: 'quem fez a imagem (até 120 caracteres)' }, credito_url: { tipo: 'texto', descricao: 'link da fonte/crédito' } } },
  { nome: 'criar_carta', escopo: 'escrever', ativa: true,
    resumo: 'Cria uma carta no fim de uma coleção, ligada ou não a um meme.',
    params: {
      colecao_id: { tipo: 'texto', obrigatorio: true },
      nome: { tipo: 'texto', obrigatorio: true },
      raridade: { tipo: 'texto', obrigatorio: true },
      emoji: { tipo: 'texto' },
      meme_id: { tipo: 'texto' }
    } }
];

export const ativas = () => FERRAMENTAS.filter((f) => f.ativa);

const TIPO_MAP = {
  texto: 'string',
  inteiro: 'integer',
  booleano: 'boolean'
};

export function schemaDe(ferramenta) {
  const properties = {};
  const required = [];
  for (const [nome, p] of Object.entries(ferramenta.params || {})) {
    const prop = { type: TIPO_MAP[p.tipo] || 'string' };
    if (p.descricao) prop.description = p.descricao;
    properties[nome] = prop;
    if (p.obrigatorio) required.push(nome);
  }
  const s = {
    type: 'object',
    properties,
    additionalProperties: false
  };
  if (required.length) s.required = required;
  return s;
}
