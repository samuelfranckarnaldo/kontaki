import { el, refreshIcons, today } from "./utils.js";

// ── CALENDÁRIO GLOBAL (seletor de intervalo de datas) ───────────────────────
// Reutilizável em qualquer subpágina: initCalendar() liga-o a um contentor e
// a um botão "Aplicar" opcional; getCalSelection() lê o intervalo escolhido.
export var calState = { viewYear: 0, viewMonth: 0, selFrom: null, selTo: null };

var CAL_DIAS  = ["D","S","T","Q","Q","S","S"];
var CAL_MESES = ["Janeiro","Fevereiro","Março","Abril","Maio","Junho","Julho","Agosto","Setembro","Outubro","Novembro","Dezembro"];

var _calContainerId = "hist-calendar";
var _calApplyBtnId  = "hist-picker-apply";
var _calMode        = "range"; // "range" (De/Até) ou "single" (1 toque)
var _calOnPick       = null;   // callback(dateStr) usado só no modo single

export function fmtCalShort(dateStr) {
  if (!dateStr) return "--";
  var d = new Date(dateStr + "T00:00:00");
  return String(d.getDate()).padStart(2,"0") + "/" + String(d.getMonth()+1).padStart(2,"0");
}

// Prepara o estado e desenha o calendário pela primeira vez. containerId é
// o id do <div> onde o calendário é desenhado; applyBtnId (opcional) é o
// botão que fica activado/desactivado consoante o intervalo esteja completo.
export function initCalendar(containerId, applyBtnId, initialFrom, initialTo) {
  _calContainerId = containerId || "hist-calendar";
  _calApplyBtnId  = applyBtnId  || null;
  _calMode  = "range";
  _calOnPick = null;

  var startRef = initialFrom ? new Date(initialFrom + "T00:00:00") : new Date();
  calState.viewYear  = startRef.getFullYear();
  calState.viewMonth = startRef.getMonth();
  calState.selFrom = initialFrom || null;
  calState.selTo   = initialTo   || null;

  renderCalendar();
}

// Modo de data única: 1 toque escolhe e já chama onPick(dateStr) — sem
// precisar de um botão "Aplicar" nem de segunda data. Útil para qualquer
// campo que hoje usa <input type="date"> nativo do Android.
export function initSingleDateCalendar(containerId, initialDate, onPick) {
  _calContainerId = containerId || "hist-calendar";
  _calApplyBtnId  = null;
  _calMode  = "single";
  _calOnPick = onPick || null;

  var startRef = initialDate ? new Date(initialDate + "T00:00:00") : new Date();
  calState.viewYear  = startRef.getFullYear();
  calState.viewMonth = startRef.getMonth();
  calState.selFrom = initialDate || null;
  calState.selTo   = initialDate || null;

  renderCalendar();
}

// Lê a selecção actual — usar no handler do próprio botão "Aplicar" de cada
// subpágina, já que o que fazer com o intervalo escolhido varia consoante o
// contexto (Histórico, Contabilidade, etc.).
export function getCalSelection() {
  return { from: calState.selFrom, to: calState.selTo };
}

export function renderCalendar(dir) {
  var wrap = el(_calContainerId);
  if (!wrap) return;

  var y = calState.viewYear, m = calState.viewMonth;
  var firstDay = new Date(y, m, 1).getDay();
  var daysInMonth = new Date(y, m + 1, 0).getDate();
  var todayStr = today();

  var cells = "";
  for (var i = 0; i < firstDay; i++) cells += '<div class="cal-cell cal-cell--empty"></div>';
  for (var d = 1; d <= daysInMonth; d++) {
    var dateStr = y + "-" + String(m+1).padStart(2,"0") + "-" + String(d).padStart(2,"0");
    var cls = "cal-cell";
    var isSingle = calState.selFrom && calState.selTo && calState.selFrom === calState.selTo && dateStr === calState.selFrom;
    if (dateStr === todayStr) cls += " cal-cell--today";
    if (isSingle) {
      cls += " cal-cell--single";
    } else {
      if (calState.selFrom && dateStr === calState.selFrom) cls += " cal-cell--start";
      if (calState.selTo && dateStr === calState.selTo) cls += " cal-cell--end";
      if (calState.selFrom && calState.selTo && dateStr > calState.selFrom && dateStr < calState.selTo) cls += " cal-cell--inrange";
    }
    if (dateStr > todayStr) cls += " cal-cell--future";
    cells += '<button class="' + cls + '" onclick="window._calPick(\'' + dateStr + '\')"' + (dateStr > todayStr ? ' disabled' : '') + '>' + d + '</button>';
  }

  var statusText;
  if (!calState.selFrom) {
    statusText = 'Toca numa data de início';
  } else if (!calState.selTo) {
    statusText = '<strong>' + fmtCalShort(calState.selFrom) + '</strong> → toca na data final';
  } else {
    statusText = '<strong>' + fmtCalShort(calState.selFrom) + '</strong> → <strong>' + fmtCalShort(calState.selTo) + '</strong>';
  }

  wrap.innerHTML =
    '<div class="cal-status">' + statusText + '</div>' +
    '<div class="cal-header">' +
      '<button class="hist-nav-arrow" onclick="window._calNavMonth(-1)"><i data-lucide="chevron-left"></i></button>' +
      '<span class="cal-title">' + CAL_MESES[m] + ' ' + y + '</span>' +
      '<button class="hist-nav-arrow" onclick="window._calNavMonth(1)"><i data-lucide="chevron-right"></i></button>' +
    '</div>' +
    '<div class="cal-grid cal-grid--weekdays">' + CAL_DIAS.map(function(d0){return '<div class="cal-weekday">'+d0+'</div>';}).join("") + '</div>' +
    '<div class="cal-grid ' + (dir === 1 ? "cal-grid--slide-left" : dir === -1 ? "cal-grid--slide-right" : "cal-grid--anim") + '">' + cells + '</div>';

  refreshIcons(wrap);
}

window._calNavMonth = function(dir) {
  calState.viewMonth += dir;
  if (calState.viewMonth > 11) { calState.viewMonth = 0; calState.viewYear++; }
  if (calState.viewMonth < 0)  { calState.viewMonth = 11; calState.viewYear--; }
  renderCalendar(dir);
};

window._calPick = function(dateStr) {
  if (_calMode === "single") {
    calState.selFrom = dateStr;
    calState.selTo   = dateStr;
    renderCalendar();
    if (_calOnPick) _calOnPick(dateStr);
    return;
  }

  if (!calState.selFrom || (calState.selFrom && calState.selTo) || dateStr < calState.selFrom) {
    calState.selFrom = dateStr;
    calState.selTo = null;
  } else if (dateStr === calState.selFrom) {
    calState.selFrom = dateStr;
    calState.selTo = dateStr;
  } else {
    calState.selTo = dateStr;
  }
  if (_calApplyBtnId) {
    var applyBtn = el(_calApplyBtnId);
    if (applyBtn) applyBtn.disabled = !(calState.selFrom && calState.selTo);
  }
  renderCalendar();
};
