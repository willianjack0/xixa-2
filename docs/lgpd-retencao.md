# LGPD: o que guardamos, por quanto tempo e como sai

Tabela de retenção do que o **código** faz hoje (a política pública está em `privacidade.html` e precisa bater com esta página).
Prazos marcados como **proposta** ainda esperam a decisão do dono do projeto (plano, decisão 5).

| Dado | Onde | Prazo | Como sai |
|---|---|---|---|
| Código do IP do anti-spam de votos/contagens | `eventos_meme_ip.ip_hash` | dia atual + 2 anteriores (~3 dias) | `DELETE` em lotes, a cada 6 h (`lib/limpeza.js`, `limparEventosIp`) |
| Código do IP do anti-spam de links sugeridos | `links_sugeridos.ip_hash` | 3 dias | `UPDATE ... SET ip_hash = NULL` em lotes, a cada 6 h (`limparIpHash`); a linha fica |
| Código do IP do anti-spam da Memepédia | `memepedia_edicoes.ip_hash` | 3 dias | idem |
| Visitante único por dia (analytics) | `analytics_visitante_dia` | dia atual + 2 anteriores | `DELETE` oportunista em `routes/analytics.js` |
| Sessão (hash do cookie, IP e navegador) | `sessoes` | expira em 30 dias sem uso, máximo 90 dias; no máximo 10 por conta | `limparExpiradas` na subida e a cada hora; apagada ao sair, ao banir e ao excluir a conta |
| Conta e evolução (XP, moedas, cartas, votos, comentários, envios) | `usuarios` e tabelas ligadas | enquanto a conta existir | exclusão pelo próprio usuário = **anonimização** (`lib/lgpd.js`): some o que é pessoal, o resto fica como `removida-<id>` |
| Vínculo com o Discord (ID, nome de exibição, foto) | `contas_oauth` | enquanto a conta existir | apagado na exclusão da conta |
| Banimento de conta excluída | `banimentos_provedor` | indefinido (é antiabuso) | só o HMAC do ID do Discord; remoção manual para desbanir |
| Chaves de API da equipe (MCP) | `chaves_api` | até expirar/revogar | revogadas e `ultimo_ip = NULL` na exclusão da conta. **Guarda IP em claro enquanto existir** |
| Feedback (mensagem, contato, página) | `feedback` | **proposta:** sem prazo hoje (admin apaga) | `DELETE /api/admin/feedback/:id`; `contato` zerado na exclusão da conta |
| Pedido de remoção de conteúdo (nome, motivo, contato) | `remocoes` | **proposta:** sem prazo hoje | sem rotina automática |
| Cadastro "Quero contribuir" | `contribuidores` | até concluir o contato ou até a pessoa pedir | `DELETE /api/admin/contribuidores/:id` (botão "Excluir" no seppzone), com auditoria `contribuidor.excluir` |
| Auditoria da moderação | `log_auditoria` | enquanto necessário (imutável por trigger) | não se apaga; só id da conta e o que foi feito, nunca nome |
| Cópias de segurança | dumps do Postgres e espelho do S3 | 14 dias, mínimo 3 | rotação do script; dados excluídos podem ficar nelas até lá |

## Como o titular pede cada coisa

- **Excluir a conta:** perfil > "Privacidade e conta" > "Excluir minha conta" (2 etapas, apelido digitado). Conta da equipe precisa perder o papel antes.
- **Remover o cadastro de contribuidor** (não tem conta nem e-mail): botão "Mandar feedback" do rodapé, tipo "Remoção", informando o nome e o Discord usados no cadastro. Um admin acha na lista do seppzone (aba Comunidade > Contribuidores) e usa "Excluir".
- **Corrigir/acessar dados:** mesmo formulário; resposta em até 15 dias.
