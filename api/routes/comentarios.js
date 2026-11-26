// Comentários da comunidade nas fotos (livro de visitas, Orkut, Tumblr, Instagram).
import { send, lerJson, clean, limited } from '../lib/http.js';
import { VOTE_ID } from './votos.js';

export default function registrar(r) {
  r.get('/api/comentarios', async ({ res, url, pool }) => {
    const id = url.searchParams.get('id') || '';
    if (!VOTE_ID.test(id)) return send(res, 400, { erro: 'id inválido' });
    const { rows } = await pool.query(
      'SELECT id, autor, texto, criado_em FROM (SELECT * FROM comentarios WHERE meme_id = $1 ORDER BY criado_em DESC LIMIT 100) c ORDER BY criado_em ASC', [id]);
    return send(res, 200, { itens: rows.map((x) => ({ id: +x.id, autor: x.autor, texto: x.texto, em: x.criado_em })) });
  });

  r.post('/api/comentarios', async ({ req, res, pool, ip, usuario }) => {
    if (limited('c:' + ip, 20)) return send(res, 429, { erro: 'Muitos comentários seguidos. Aguarde um pouco.' });
    const b = await lerJson(req);
    if (b === undefined || b === null || typeof b !== 'object' || Array.isArray(b)) return send(res, 400, { erro: 'json inválido' });
    if (b['bot-field']) return send(res, 201, { ok: true });
    if ('autor' in b && b.autor !== undefined) return send(res, 422, { erro: 'O autor é definido pela conta logada e não deve ser enviado.' });
    const id = String(b.id || ''), texto = clean(b.texto, 300);
    if (!VOTE_ID.test(id)) return send(res, 400, { erro: 'id inválido' });
    if (texto.length < 1) return send(res, 422, { erro: 'Escreva alguma coisa.' });

    const { rows: uRows } = await pool.query('SELECT apelido FROM usuarios WHERE id = $1', [usuario.id]);
    if (!uRows.length || !uRows[0].apelido) return send(res, 401, { erro: 'usuário não encontrado' });
    const autor = uRows[0].apelido;

    let rows;
    try {
      ({ rows } = await pool.query(
        'INSERT INTO comentarios (meme_id, autor, texto) VALUES ($1,$2,$3) RETURNING id, criado_em', [id, autor, texto]));
    } catch (e) {
      if (e.code === '23503') return send(res, 404, { erro: 'meme não encontrado' }); // FK: meme_id inexistente
      throw e;
    }
    return send(res, 201, { id: +rows[0].id, autor, texto, em: rows[0].criado_em });
  }, { autenticada: true });
}
