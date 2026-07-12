// Persistencia generica de estado de visualizacao (scroll, filtro, busca)
// por pagina, usando localStorage. Sobrevive a troca de aba e a
// fechar/reabrir o app (nao sobrevive a "limpar dados do site").

const PREFIX = "kontaki-viewstate-";

export function saveViewState(pageKey, state) {
  try {
    localStorage.setItem(PREFIX + pageKey, JSON.stringify(state));
  } catch (e) {}
}

export function restoreViewState(pageKey) {
  try {
    var raw = localStorage.getItem(PREFIX + pageKey);
    return raw ? JSON.parse(raw) : null;
  } catch (e) {
    return null;
  }
}

export function clearViewState(pageKey) {
  try {
    localStorage.removeItem(PREFIX + pageKey);
  } catch (e) {}
}

// Salva/restaura apenas o scroll de um container, de forma generica.
// Usado pelo router para todas as paginas, sem precisar saber nada
// sobre o conteudo especifico de cada uma.
export function saveScroll(pageId, container) {
  if (!container) return;
  var state = restoreViewState(pageId) || {};
  state.scrollTop = container.scrollTop;
  saveViewState(pageId, state);
}

export function restoreScroll(pageId, container) {
  if (!container) return;
  var state = restoreViewState(pageId);
  if (state && typeof state.scrollTop === "number") {
    requestAnimationFrame(function () {
      container.scrollTop = state.scrollTop;
    });
  }
}
