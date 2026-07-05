import { refreshIcons } from "./utils.js";

function ensurePickerDOM() {
  if (document.getElementById("picker-overlay")) return;
  const div = document.createElement("div");
  div.id = "picker-overlay";
  div.style.cssText = "display:none;position:fixed;inset:0;background:rgba(0,0,0,.45);z-index:9999;align-items:flex-end;justify-content:center";
  div.innerHTML =
    '<div id="picker-box" style="background:#fff;width:100%;max-width:480px;border-radius:20px 20px 0 0;' +
    'padding:16px;max-height:70vh;overflow-y:auto">' +
    '<div id="picker-title" style="font-size:15px;font-weight:700;color:#18181b;margin-bottom:12px"></div>' +
    '<div id="picker-list" style="display:flex;flex-direction:column;gap:2px"></div>' +
    '</div>';
  document.body.appendChild(div);
  div.addEventListener("click", function (e) { if (e.target === div) closePicker(); });
}

export function closePicker() {
  var ov = document.getElementById("picker-overlay");
  if (ov) ov.style.display = "none";
}

export function openPicker(title, options, currentValue, onSelect, config) {
  config = config || {};
  ensurePickerDOM();
  var ov = document.getElementById("picker-overlay");
  var tEl = document.getElementById("picker-title");
  var listEl = document.getElementById("picker-list");
  tEl.textContent = title;
  renderList();

  function renderList() {
    listEl.innerHTML = options.map(function (opt) {
      var active = opt.toLowerCase() === (currentValue || "").toLowerCase();
      return '<button data-val="' + opt.replace(/"/g, "&quot;") + '" style="display:flex;align-items:center;' +
        'justify-content:space-between;width:100%;text-align:left;background:' + (active ? "var(--primary-light)" : "none") +
        ';border:none;padding:14px 12px;border-radius:10px;font-size:15px;color:' + (active ? "var(--primary)" : "#18181b") +
        ';font-weight:' + (active ? "700" : "400") + ';cursor:pointer;font-family:inherit">' +
        opt + (active ? '<i data-lucide="check" style="width:18px;height:18px"></i>' : "") +
        '</button>';
    }).join("");
    Array.from(listEl.querySelectorAll("button")).forEach(function (btn) {
      btn.onclick = function () {
        var val = btn.getAttribute("data-val");
        if (config.allowCustom && val === (config.customLabel || "Outro (escrever)")) {
          renderCustomInput();
        } else {
          onSelect(val);
          closePicker();
        }
      };
    });
    refreshIcons(listEl);
  }

  function renderCustomInput() {
    listEl.innerHTML =
      '<div style="display:flex;flex-direction:column;gap:10px">' +
      '<input id="picker-custom-input" placeholder="Escreve a unidade" autocomplete="off" ' +
      'style="padding:12px;border:1px solid var(--border2);border-radius:10px;font-size:15px;font-family:inherit"/>' +
      '<button id="picker-custom-confirm" class="btn btn-primary btn-full">Usar</button>' +
      '</div>';
    var input = document.getElementById("picker-custom-input");
    input.focus();
    document.getElementById("picker-custom-confirm").onclick = function () {
      var val = input.value.trim();
      if (!val) return;
      onSelect(val);
      closePicker();
    };
  }

  ov.style.display = "flex";
}
