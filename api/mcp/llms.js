// Gera o llms.txt do MCP a partir do registro de ferramentas (api/mcp/registro.js). Texto puro, em pt-BR.
import { ativas } from './registro.js';
import { ESCOPOS, VALIDADES_DIAS, MAX_ATIVAS_POR_USUARIO } from './chaves.js';

const ESCOPO_TXT = {
  ler: 'ler: buscar memes, conferir duplicados e listar valores válidos. Não altera nada.',
  escrever: 'escrever: criar e editar memes (como rascunho oculto), anexar mídias, criar cartas e enviar textos da Memepédia (para a moderação).',
  publicar: 'publicar: publicar direto (criar_meme com publicar=true, publicar_meme, ocultar_meme, escrever_memepedia com publicar=true e moderar_memepedia). Sem este escopo, quem publica é um admin pelo painel.'
};

export function gerarLlmsTxt({ base = 'https://naosalvo.fishlab.com.br', ferramentas = ativas() } = {}) {
  const L = [];
  L.push('# Não Salvo · MCP do acervo');
  L.push('');
  L.push('> Servidor MCP do Não Salvo (acervo de memes e virais da internet brasileira). Serve para um assistente de IA buscar, conferir duplicados e cadastrar memes sem passar pelo formulário do site. Só admins criam chaves.');
  L.push('');
  L.push('## Conexão');
  L.push(`- Endpoint: ${base}/mcp (MCP "Streamable HTTP", JSON-RPC 2.0 por POST).`);
  L.push('- Autenticação: cabeçalho `Authorization: Bearer ns_mcp_...` com a chave criada na aba MCP do painel (/seppzone/). Não há cookie.');
  L.push('- Claude Code: `claude mcp add --transport http naosalvo ' + base + '/mcp --header "Authorization: Bearer SUA_CHAVE"`');
  L.push('- A chave age como o admin que a criou. Se ele deixar de ser admin ou for banido, a chave para de valer na hora.');
  L.push('');
  L.push('## Escopos da chave');
  for (const e of ESCOPOS) L.push(`- ${ESCOPO_TXT[e]}`);
  L.push(`- Validade: ${VALIDADES_DIAS.join(', ')} dias (no máximo ${MAX_ATIVAS_POR_USUARIO} chaves ativas por admin). O segredo só aparece uma vez, na criação.`);
  L.push('');
  L.push('## Ferramentas');
  if (!ferramentas.length) {
    L.push('Nenhuma ferramenta está ativa ainda: o endpoint /mcp entra na próxima fase. Esta página é atualizada sozinha quando as ferramentas forem liberadas.');
  }
  for (const f of ferramentas) {
    L.push('');
    L.push(`### ${f.nome}  (escopo: ${f.escopo})`);
    L.push(f.resumo);
    const ps = Object.entries(f.params || {});
    if (ps.length) {
      L.push('Parâmetros:');
      for (const [n, p] of ps) L.push(`- ${n} (${p.tipo}${p.obrigatorio ? ', obrigatório' : ''})${p.descricao ? ': ' + p.descricao : ''}`);
    }
  }
  L.push('');
  L.push('## Fluxo recomendado');
  // só cita passos de ferramentas que existem (as inativas ainda não aparecem aqui nem no tools/list)
  const tem = (n) => ferramentas.some((f) => f.nome === n);
  const passos = [
    tem('listar_referencias') && 'listar_referencias para saber categorias, raridades e limites válidos.',
    tem('conferir_duplicado') && 'conferir_duplicado com o link e o título. Se já existir, não crie de novo' + (tem('editar_meme') ? ': use editar_meme.' : '.'),
    tem('buscar_memes') && 'buscar_memes para ver o que já existe sobre o assunto (inclui rascunhos ocultos).',
    tem('criar_meme') && 'criar_meme (rascunho). Só use publicar=true se tiver o escopo publicar e a informação estiver conferida.',
    tem('anexar_midia') && 'anexar_midia quando o meme não for só um vídeo do YouTube. Use obter_meme para conferir as mídias e remover_midia se precisar tirar.',
    tem('ocultar_meme') && 'Para tirar do ar: ocultar_meme muda o meme de publicado para oculto (só com o escopo publicar).',
    tem('editar_carta') && 'Para arte de carta: buscar_cartas (ache o id, ex.: plataformas-2) e editar_carta com imagem_url; a imagem é otimizada e aparece no álbum e no perfil.',
    tem('obter_memepedia') && 'Para o verbete da Memepédia: obter_memepedia (veja o que já tem e o que falta), depois escrever_memepedia com a fonte. Sem publicar=true o texto vai para a moderação; moderar_memepedia (escopo publicar) aprova ou recusa.',
    'Avise o admin do que foi encontrado ou criado (ids dos memes) para revisar no painel.'
  ].filter(Boolean);
  passos.forEach((p, i) => L.push(`${i + 1}. ${p}`));
  L.push('');
  L.push('## Regras e limites');
  L.push('- O acervo é público: não cadastre dados pessoais, conteúdo ofensivo ou material sem fonte. Cite a fonte na descrição.');
  L.push('- Memes não são apagados: para tirar do ar, o admin muda a situação no painel.');
  L.push('- Tudo o que a chave faz fica no log de auditoria, com o dono e o id da chave.');
  L.push('- Erros: 401 chave inválida, expirada ou revogada; 403 falta escopo; 409 duplicado ou conflito; 422 campo inválido (a resposta diz qual); 429 limite de uso, espere e tente de novo.');
  L.push('');
  return L.join('\n');
}
