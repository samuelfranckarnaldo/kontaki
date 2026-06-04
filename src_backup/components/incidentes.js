import { db } from "../db.js";
import { fmt, fmtDate, el, refreshIcons } from "../utils.js";
import { toast } from "../toast.js";
import { openModal, closeModal } from "../modal.js";
import { getUser } from "../auth.js";

export async function loadIncidentes() {
  const btn = document.getElementById("btn-back-incidentes");
  if (btn) btn.onclick = () => window._showSubpage(null);
  await renderIncidentes();
}

async function renderIncidentes() {
  const incidents = await db.getAll("incidents");
  const users     = await db.getAll("users");
  const wrap      = document.getElementById("inc-list");
  if (!wrap) return;

  const open   = incidents.filter(i => i.status === "open");
  const closed = incidents.filter(i => i.status !== "open");

  if (!incidents.length) {
    wrap.innerHTML = `
      <div class="empty-state">
        <i data-lucide="shield-check" style="width:36px;height:36px;color:#a1a1aa;margin-bottom:10px"></i>
        <div class="empty-state-title">Sem incidentes</div>
        <div class="empty-state-sub">Nenhuma diferença de stock registada.</div>
      </div>`;
    refreshIcons(wrap); return;
  }

  const userName = (uid) => { const u = users.find(u => u.id === Number(uid)); return u ? u.name : "Desconhecido"; };

  wrap.innerHTML =
    (open.length ? `
      <div style="font-size:11px;font-weight:700;color:#dc2626;text-transform:uppercase;
                  letter-spacing:.4px;margin-bottom:8px;padding:0 2px">
        Em aberto (${open.length})
      </div>
      ${open.map(i => incCard(i, userName, true)).join("")}` : "") +
    (closed.length ? `
      <div style="font-size:11px;font-weight:700;color:#71717a;text-transform:uppercase;
                  letter-spacing:.4px;margin:14px 0 8px;padding:0 2px">
        Resolvidos (${closed.length})
      </div>
      ${closed.map(i => incCard(i, userName, false)).join("")}` : "");

  refreshIcons(wrap);
}

function incCard(i, userName, isOpen) {
  const diff     = i.diff || (i.found - i.expected);
  const diffColor= diff < 0 ? "#dc2626" : "#16a34a";
  const diffSign = diff > 0 ? "+" : "";
  return `
    <div style="background:#fff;border-radius:12px;padding:14px;margin-bottom:8px;
                border-left:4px solid ${isOpen?"#dc2626":"#16a34a"};
                box-shadow:0 1px 3px rgba(0,0,0,.06)">
      <div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:10px">
        <div>
          <div style="font-size:14px;font-weight:700;color:#18181b">${i.productName || "Produto"}</div>
          <div style="font-size:11px;color:#71717a;margin-top:2px">${fmtDate(i.date)}</div>
        </div>
        <span style="font-size:12px;font-weight:700;padding:3px 8px;border-radius:6px;
                     background:${isOpen?"#fee2e2":"#dcfce7"};color:${isOpen?"#dc2626":"#16a34a"}">
          ${isOpen ? "Em aberto" : "Resolvido"}
        </span>
      </div>
      <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:8px;margin-bottom:10px">
        <div style="background:#f4f4f5;border-radius:8px;padding:8px;text-align:center">
          <div style="font-size:10px;color:#71717a;font-weight:600">Esperado</div>
          <div style="font-size:16px;font-weight:700;color:#18181b;margin-top:2px">${i.expected || "?"}</div>
        </div>
        <div style="background:#f4f4f5;border-radius:8px;padding:8px;text-align:center">
          <div style="font-size:10px;color:#71717a;font-weight:600">Encontrado</div>
          <div style="font-size:16px;font-weight:700;color:#18181b;margin-top:2px">${i.found || "?"}</div>
        </div>
        <div style="background:${diff<0?"#fee2e2":"#dcfce7"};border-radius:8px;padding:8px;text-align:center">
          <div style="font-size:10px;color:${diffColor};font-weight:600">Diferença</div>
          <div style="font-size:16px;font-weight:700;color:${diffColor};margin-top:2px">${diffSign}${diff || "?"}</div>
        </div>
      </div>
      ${i.responsible ? `
        <div style="font-size:12px;color:#71717a;margin-bottom:6px">
          <span style="font-weight:600">Responsável anterior:</span> ${userName(i.responsible)}
        </div>` : ""}
      ${i.foundBy ? `
        <div style="font-size:12px;color:#71717a;margin-bottom:6px">
          <span style="font-weight:600">Detectado por:</span> ${userName(i.foundBy)}
        </div>` : ""}
      ${i.note ? `
        <div style="font-size:12px;color:#71717a;background:#f4f4f5;border-radius:8px;
                    padding:8px;margin-bottom:8px">${i.note}</div>` : ""}
      ${isOpen && getUser().role === "admin" ? `
        <div style="display:flex;gap:8px">
          <button onclick="window._resolveInc(${i.id},'resolved')"
                  style="flex:1;padding:9px;background:#dcfce7;border:1.5px solid #bbf7d0;
                         border-radius:8px;color:#16a34a;font-size:13px;font-weight:700;
                         cursor:pointer;font-family:inherit">
            ✓ Resolver
          </button>
          <button onclick="window._resolveInc(${i.id},'dismissed')"
                  style="flex:1;padding:9px;background:#f4f4f5;border:1.5px solid #e4e4e7;
                         border-radius:8px;color:#71717a;font-size:13px;font-weight:700;
                         cursor:pointer;font-family:inherit">
            Ignorar
          </button>
        </div>` : ""}
    </div>`;
}

window._resolveInc = async (id, status) => {
  const inc = await db.get("incidents", id);
  if (!inc) return;
  await db.put("incidents", { ...inc, status, resolvedAt: new Date().toISOString(), resolvedBy: getUser().id });
  toast(status === "resolved" ? "Incidente resolvido." : "Incidente ignorado.", "success");
  await renderIncidentes();
};

window._closeModal = closeModal;
