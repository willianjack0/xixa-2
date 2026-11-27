// LGPD: exclusão de conta pelo próprio usuário = ANONIMIZAÇÃO (não apaga em cascata).
// A linha de usuarios fica, sem dado pessoal; o conteúdo público (comentários, envios aprovados, votos, edições da Memepédia),
// o razão de XP/moedas e o log de auditoria continuam apontando para o id, agora anônimo ('removida-<id>').
// Tudo numa transação. Nada aqui grava dado pessoal no log de auditoria (só o id da conta).
import { createHmac } from 'node:crypto';
import { auditar } from './auditoria.js';

export const PREFIXO_REMOVIDA = 'removida-';
export const apelidoDeRemovida = (id) => PREFIXO_REMOVIDA + id;

/** HMAC do id do provedor (ex.: Discord) para lembrar de um banimento sem guardar o id. Mesma chave do ip_hash (token de admin). */
export const hashProvedor = (chave, provedor, provedorId) =>
  createHmac('sha256', chave || 'naosalvo').update(`ban:${provedor}:${provedorId}`).digest('hex');

export class ErroConta extends Error {
  constructor(status, mensagem, campo) { super(mensagem); this.status = status; this.campo = campo; }
}

/**
 * Anonimiza a conta. `ctx` = contexto da rota (pool, usuario, adminToken): usado só para a auditoria.
 * `confirmar` = apelido digitado pela pessoa (sem diferenciar maiúsculas). Lança ErroConta (4xx) quando não pode.
 */
export async function excluirConta(ctx, confirmar) {
  const { pool, usuario } = ctx;
  const cli = await pool.connect();
  try {
    await cli.query('BEGIN');
    const { rows: [u] } = await cli.query(
      'SELECT id, apelido, papel, banido, removida_em FROM usuarios WHERE id = $1 FOR UPDATE', [usuario.id]);
    if (!u || u.removida_em) throw new ErroConta(409, 'conta já removida');
    if (typeof confirmar !== 'string' || confirmar.trim().toLowerCase() !== u.apelido.toLowerCase()) {
      throw new ErroConta(422, 'digite o seu apelido exatamente como ele aparece para confirmar', 'confirmar');
    }
    if (u.papel !== 'usuario') {
      throw new ErroConta(409, 'contas da equipe (moderação/admin) precisam ter o papel retirado antes de excluir; peça a um admin');
    }
    const id = Number(u.id), novo = apelidoDeRemovida(id);

    // dados pessoais: vínculo OAuth (nome de exibição, foto), sessões e chaves
    // banimento sobrevive: só o HMAC do id do provedor (assim um novo cadastro com a mesma conta do Discord continua banido)
    const { rows: oauth } = await cli.query('SELECT provedor, provedor_id FROM contas_oauth WHERE usuario_id = $1', [id]);
    if (u.banido) {
      for (const o of oauth) {
        await cli.query('INSERT INTO banimentos_provedor (hash) VALUES ($1) ON CONFLICT DO NOTHING', [hashProvedor(ctx.chaveHmac ?? ctx.adminToken, o.provedor, o.provedor_id)]);
      }
    }
    await cli.query('DELETE FROM contas_oauth WHERE usuario_id = $1', [id]);
    await cli.query('DELETE FROM sessoes WHERE usuario_id = $1', [id]);
    await cli.query('UPDATE chaves_api SET revogada_em = COALESCE(revogada_em, now()), ultimo_ip = NULL WHERE usuario_id = $1', [id]);

    // conteúdo do perfil e contatos
    await cli.query('DELETE FROM recados WHERE dono_id = $1', [id]);          // o que os outros escreveram NO perfil dela
    await cli.query('DELETE FROM publicacoes WHERE usuario_id = $1', [id]);   // publicações do perfil
    await cli.query('DELETE FROM envios_arte_carta WHERE usuario_id = $1 AND status = \'pendente\'', [id]); // arte ainda sem decisão
    await cli.query('UPDATE feedback SET contato = NULL WHERE usuario_id = $1', [id]);

    // conteúdo público fica, sem o nome: onde o apelido foi copiado como texto, troca pelo neutro
    await cli.query('UPDATE comentarios SET autor = $2 WHERE usuario_id = $1', [id, novo]);
    await cli.query('UPDATE links_sugeridos SET autor = $2, ip_hash = NULL WHERE usuario_id = $1', [id, novo]);
    // memepedia_edicoes não tem usuario_id: casa pelo apelido atual (limite conhecido: edições de apelidos antigos não são alcançadas)
    await cli.query('UPDATE memepedia_edicoes SET autor = $2, ip_hash = NULL WHERE lower(autor) = lower($1)', [u.apelido, novo]);

    await cli.query(
      `UPDATE usuarios SET apelido = $2, avatar_gato = '{}', usar_foto = false, perfil_layout = 'orkut', carta_favorita = NULL,
              cadastro_completo_em = NULL, apelido_alterado_em = NULL, ultimo_acesso = NULL, removida_em = now()
        WHERE id = $1`, [id, novo]);

    // auditoria na MESMA transação, sem dado pessoal (nem o apelido antigo)
    const gravou = await auditar({ ...ctx, pool: cli }, 'conta.excluir', 'usuarios:' + id, { banida: !!u.banido });
    if (!gravou) throw new Error('auditoria da exclusão não gravada');
    await cli.query('COMMIT');
    return { id, apelido: novo };
  } catch (e) {
    await cli.query('ROLLBACK').catch(() => {});
    throw e;
  } finally { cli.release(); }
}
