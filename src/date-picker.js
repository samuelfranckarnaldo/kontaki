import { refreshIcons } from "./utils.js";

const CAL_MESES = ["Janeiro","Fevereiro","Março","Abril","Maio","Junho","Julho","Agosto","Setembro","Outubro","Novembro","Dezembro"];
const CAL_DIAS  = ["D","S","T","Q","Q","S","S"];

let _dpState = { viewYear: 0, viewMonth: 0, selected: null, onSelect: null };

function ensureDatePickerDOM() {
  if (document.getElementById("dp-overlay")) return;
  const div = document.createElement("div");
  div.id = "dp-overlay";
  div.style.cssText = "display:none;position:fixed;inset:0;background:rgba(0,0,0,.45);z-index:9999;align-items:flex-end;justify-content:center";
  div.innerHTML =
    '<div style="background:#fff;width:100%;max-width:480px;border-radius:20px 20px 0 0;padding:16px;max-height:70vh;overflow-y:auto">' +
    '<div id="dp-title" style="font-size:15px;font-weight:700;color:#18181b;margin-bottom:12px"></div>' +
    '<div id="dp-calendar"></div>' +
    '<div style="display:flex;gap:8px;margin-top:14px">' +
      '<button id="dp-clear" class="btn btn-ghost" style="flex:1">Limpar</button>' +
      '<button id="dp-today" class="btn btn-ghost" style="flex:1">Hoje</button>' +
    '</div>' +
    '</div>';
  document.body.appendChild(div);
  div.addEventListener("click", function (e) { if (e.target === div) closeDatePicker(); });

  document.getElementById("dp-clear").onclick = function () {
    if (_dpState.onSelect) _dpState.onSelect("");
    closeDatePicker();
  };
  document.getElementById("dp-today").onclick = function () {
    const t = new Date();
    const iso = t.toISOString().slice(0, 10);
    if (_dpState.onSelect) _dpState.onSelect(iso);
    closeDatePicker();
  };
}

export function closeDatePicker() {
  var ov = document.getElementById("dp-overlay");
  if (ov) ov.style.display = "none";
}

function fmtShort(dateStr) {
  var d = new Date(dateStr + "T00:00:00");
  return d.getDate() + " " + CAL_MESES[d.getMonth()].slice(0, 3);
}

function renderDpCalendar(dir) {
  var wrap = document.getElementById("dp-calendar");
  if (!wrap) return;
  var y = _dpState.viewYear, m = _dpState.viewMonth;
  var firstDay = new Date(y, m, 1).getDay();
  var daysInMonth = new Date(y, m + 1, 0).getDate();
  var todayStr = new Date().toISOString().slice(0, 10);

  var cells = "";
  for (var i = 0; i < firstDay; i++) cells += '<div class="cal-cell cal-cell--empty"></div>';
  for (var d = 1; d <= daysInMonth; d++) {
    var dateStr = y + "-" + String(m + 1).padStart(2, "0") + "-" + String(d).padStart(2, "0");
    var cls = "cal-cell";
    if (dateStr === todayStr) cls += " cal-cell--today";
    if (dateStr === _dpState.selected) cls += " cal-cell--single";
    cells += '<button class="' + cls + '" onclick="window._dpPick(\'' + dateStr + '\')">' + d + '</button>';
  }

  var statusText = _dpState.selected
    ? '<strong>' + fmtShort(_dpState.selected) + '</strong> selecionado'
    : 'Toca numa data';

  wrap.innerHTML =
    '<div class="cal-status">' + statusText + '</div>' +
    '<div class="cal-header">' +
      '<button class="hist-nav-arrow" onclick="window._dpNavMonth(-1)"><i data-lucide="chevron-left"></i></button>' +
      '<span class="cal-title">' + CAL_MESES[m] + ' ' + y + '</span>' +
      '<button class="hist-nav-arrow" onclick="window._dpNavMonth(1)"><i data-lucide="chevron-right"></i></button>' +
    '</div>' +
    '<div class="cal-grid cal-grid--weekdays">' + CAL_DIAS.map(function (d0) { return '<div class="cal-weekday">' + d0 + '</div>'; }).join("") + '</div>' +
    '<div class="cal-grid ' + (dir === 1 ? "cal-grid--slide-left" : dir === -1 ? "cal-grid--slide-right" : "cal-grid--anim") + '">' + cells + '</div>';

  refreshIcons(wrap);
}

window._dpNavMonth = function (dir) {
  _dpState.viewMonth += dir;
  if (_dpState.viewMonth > 11) { _dpState.viewMonth = 0; _dpState.viewYear++; }
  if (_dpState.viewMonth < 0) { _dpState.viewMonth = 11; _dpState.viewYear--; }
  renderDpCalendar(dir);
};

window._dpPick = function (dateStr) {
  _dpState.selected = dateStr;
  if (_dpState.onSelect) _dpState.onSelect(dateStr);
  closeDatePicker();
};

export function openField(input, title, onChange) {
  openDatePicker(title || "Selecionar data", input.value, function(dateStr) {
    input.value = dateStr;
    if (onChange) onChange(dateStr);
  });
}

export function openDatePicker(title, currentValue, onSelect) {
  ensureDatePickerDOM();
  var ov = document.getElementById("dp-overlay");
  var tEl = document.getElementById("dp-title");
  tEl.textContent = title;

  var base = currentValue ? new Date(currentValue + "T00:00:00") : new Date();
  _dpState.viewYear = base.getFullYear();
  _dpState.viewMonth = base.getMonth();
  _dpState.selected = currentValue || null;
  _dpState.onSelect = onSelect;

  renderDpCalendar();
  ov.style.display = "flex";
}
