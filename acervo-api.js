// Sincroniza o acervo público com a API (/api/memes) sobrepondo o data.js estático.
// Expõe window.acervoPronto e window.ACERVO_ORIGEM ('api' ou 'estatico').
(function () {
  window.ACERVO_ORIGEM = 'estatico';

  function fetchComTimeout(url, opts, ms = 3000) {
    const ctrl = typeof AbortController !== 'undefined' ? new AbortController() : null;
    const t = setTimeout(() => { if (ctrl) ctrl.abort(); }, ms);
    return fetch(url, { credentials: 'same-origin', signal: ctrl ? ctrl.signal : undefined, ...opts })
      .finally(() => clearTimeout(t));
  }

  function mapearItem(m) {
    const midias = Array.isArray(m.midias) ? m.midias : [];
    const imgMidia = midias.find((d) => d.tipo === 'imagem');
    const vidMidia = midias.find((d) => d.tipo === 'video_arquivo');

    const out = {
      id: m.id,
      t: m.titulo,
      y: m.ano,
      c: m.categoria,
      r: m.raridade
    };

    if (m.data) {
      out.date = String(m.data).slice(0, 10);
    }
    if (m.emoji) out.e = m.emoji;
    if (m.descricao) out.d = m.descricao;
    if (m.autor) out.by = m.autor;
    if (m.duracao != null) out.dur = m.duracao;
    if (m.youtube_id) out.yt = m.youtube_id;
    if (m.adicionado_em) {
      out.added = String(m.adicionado_em).slice(0, 10);
    }
    if (m.tipo) out.tipo = m.tipo;

    if (imgMidia && imgMidia.caminho) {
      out.img = imgMidia.caminho;
      if (imgMidia.origem_url) out.srcImg = imgMidia.origem_url;
      if (imgMidia.credito_por || imgMidia.credito_url) {
        out.credit = {
          by: imgMidia.credito_por || undefined,
          url: imgMidia.credito_url || undefined
        };
      }
    }
    if (vidMidia && vidMidia.caminho) {
      out.vid = vidMidia.caminho;
    }
    return out;
  }

  window.acervoPronto = new Promise((resolve) => {
    // Teto global de 3,5 s para nunca travar a renderização inicial
    const tGlobal = setTimeout(() => {
      resolve();
    }, 3500);

    async function sync() {
      if (typeof MEMES === 'undefined' || !Array.isArray(MEMES)) {
        return;
      }

      // 1) Busca todas as páginas do acervo
      const itensApi = [];
      let offset = 0;
      const limite = 500;
      let total = Infinity;

      while (offset < total) {
        let resp;
        try {
          resp = await fetchComTimeout(`/api/memes?limite=${limite}&offset=${offset}`, {}, 3000);
          if (!resp.ok) return;
        } catch {
          return;
        }

        let json;
        try {
          json = await resp.json();
        } catch {
          return;
        }

        if (!json || typeof json !== 'object' || !Array.isArray(json.itens)) {
          return;
        }

        total = typeof json.total === 'number' ? json.total : json.itens.length;
        itensApi.push(...json.itens);
        if (json.itens.length === 0 || itensApi.length >= total) {
          break;
        }
        offset += json.itens.length;
      }

      // 2) Mescla em lugar no array MEMES
      const mapaEst = new Map();
      MEMES.forEach((m, idx) => mapaEst.set(m.id, idx));

      for (const item of itensApi) {
        const mapeado = mapearItem(item);
        if (mapaEst.has(item.id)) {
          const idx = mapaEst.get(item.id);
          const original = MEMES[idx];
          // Banco tem precedência; preserva campos só existentes no estático
          MEMES[idx] = { ...original, ...mapeado };
        } else {
          MEMES.push({
            views: 0,
            saves: 0,
            ...mapeado
          });
          mapaEst.set(item.id, MEMES.length - 1);
        }
      }

      window.ACERVO_ORIGEM = 'api';

      // 3) Remove memes que estão fora do ar (oculto / removido)
      const todosIds = MEMES.map((m) => m.id);
      if (todosIds.length > 0) {
        // Envia em fatias de até 600 ids se necessário
        const fatias = [];
        for (let i = 0; i < todosIds.length; i += 600) {
          fatias.push(todosIds.slice(i, i + 600));
        }

        for (const idsLote of fatias) {
          try {
            const respFda = await fetchComTimeout('/api/memes/fora-do-ar', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ ids: idsLote })
            }, 3000);
            if (respFda.ok) {
              const dadosFda = await respFda.json();
              if (dadosFda && Array.isArray(dadosFda.ids) && dadosFda.ids.length > 0) {
                const setRemover = new Set(dadosFda.ids);
                for (let j = MEMES.length - 1; j >= 0; j--) {
                  if (setRemover.has(MEMES[j].id)) {
                    MEMES.splice(j, 1);
                  }
                }
              }
            }
          } catch {
            // Falha na checagem de fora do ar não oculta ninguém
          }
        }
      }
    }

    sync()
      .catch(() => {})
      .finally(() => {
        clearTimeout(tGlobal);
        resolve();
      });
  });
})();
