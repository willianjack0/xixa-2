// Registro das ferramentas do MCP: FONTE ÚNICA de nome, escopo, descrição e parâmetros. O llms.txt (aba MCP do painel) e o
// tools/list do endpoint /mcp saem daqui, então a documentação nunca fica desatualizada. `ativa: false` = ainda não existe
// no servidor (não aparece no llms.txt nem no tools/list).
export const FERRAMENTAS = [
  { nome: 'listar_referencias', escopo: 'ler', ativa: false,
    resumo: 'Lista os valores válidos: categorias, eras, coleções, raridades e limites. Chame antes de criar algo, para não inventar valor.', params: {} },
  { nome: 'buscar_memes', escopo: 'ler', ativa: false,
    resumo: 'Busca memes por texto, ano, categoria ou situação (publicado, oculto, removido). Paginado.',
    params: { busca: { tipo: 'texto', descricao: 'trecho do título' }, ano: { tipo: 'inteiro' }, categoria: { tipo: 'texto' }, status: { tipo: 'texto', descricao: 'publicado | oculto | removido' }, limite: { tipo: 'inteiro', descricao: 'até 50' }, offset: { tipo: 'inteiro' } } },
  { nome: 'conferir_duplicado', escopo: 'ler', ativa: false,
    resumo: 'Confere se um link ou título já existe no acervo ou na fila de envios. Use sempre antes de criar_meme.',
    params: { url: { tipo: 'texto', descricao: 'link do vídeo ou da imagem' }, titulo: { tipo: 'texto' } } },
  { nome: 'criar_meme', escopo: 'escrever', ativa: false,
    resumo: 'Cria um meme como rascunho oculto. Com o escopo publicar e publicar=true, já entra publicado. Recusa duplicado, salvo forcar=true.',
    params: { id: { tipo: 'texto', obrigatorio: true, descricao: 'slug a-z, 0-9 e hífen' }, titulo: { tipo: 'texto', obrigatorio: true }, ano: { tipo: 'inteiro', obrigatorio: true }, categoria: { tipo: 'texto', obrigatorio: true }, raridade: { tipo: 'texto', obrigatorio: true }, descricao: { tipo: 'texto' }, youtube_id: { tipo: 'texto', descricao: '11 caracteres' }, publicar: { tipo: 'booleano' }, forcar: { tipo: 'booleano' } } },
  { nome: 'editar_meme', escopo: 'escrever', ativa: false,
    resumo: 'Altera campos de um meme existente (mesma validação do painel).', params: { id: { tipo: 'texto', obrigatorio: true } } },
  { nome: 'publicar_meme', escopo: 'publicar', ativa: false,
    resumo: 'Muda um meme de oculto para publicado.', params: { id: { tipo: 'texto', obrigatorio: true } } },
  { nome: 'anexar_midia', escopo: 'escrever', ativa: false,
    resumo: 'Anexa uma imagem (jpeg, png ou webp, até 5 MB) a um meme, a partir de uma URL ou de base64.',
    params: { id: { tipo: 'texto', obrigatorio: true }, url: { tipo: 'texto' }, base64: { tipo: 'texto' } } },
  { nome: 'criar_carta', escopo: 'escrever', ativa: false,
    resumo: 'Cria uma carta no fim de uma coleção, ligada ou não a um meme.',
    params: { colecao_id: { tipo: 'texto', obrigatorio: true }, nome: { tipo: 'texto', obrigatorio: true }, raridade: { tipo: 'texto', obrigatorio: true }, meme_id: { tipo: 'texto' } } }
];

export const ativas = () => FERRAMENTAS.filter((f) => f.ativa);
