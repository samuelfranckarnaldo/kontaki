import { db }                                          from "../db.js";
import { fmt, fmtDate, today, el, refreshIcons }      from "../utils.js";
import { toast }                                       from "../toast.js";
import { openModal, closeModal }                       from "../modal.js";
import { getUser, getSession }                         from "../auth.js";
import {
  ktkService, sessionService,
  validateKtkHash, storeKeyService,
} from "../services.js";

export async function loadTurno() {
  const backBtn = document.getElementById("btn-back-turno");
  if (backBtn) backBtn.onclick = () => window._showSubpage(null);
  window._showSubpage = window._showSubpage || (() => {});
  await renderTurno();
}

// ── RENDER PRINCIPAL ──────────────────────────────────────────────────────────
async function renderTurno() {
  const user    = getUser();
  const session = getSession();
  const wrap    = document.getElementById("turno-content");
  if (!wrap) return;

  const sessions = await db.getAll("sessions");
  const sales    = await db.getAll("sales");

  const sessionSales = session
    ? sales.filter(s => s.sessionId === session.id)
    : [];
  const totalVendas = sessionSales.reduce((a,s) => a+(s.total||0), 0);

  const duration = session
    ? sessionService.getTurnoDuration(session.openedAt)
    : null;

  const closedSessions = sessions
    .filter(s => s.status === "closed" || s.status === "validated")
    .sort((a,b) => b.id - a.id)
    .slice(0, 8);

  // Verifica storeKey
  const storeKeySetting = await db.get("settings","storeKey");
  const hasStoreKey     = !!((storeKeySetting&&storeKeySetting.value));

  wrap.innerHTML = `

    ${session ? `
    <!-- Turno activo -->
    <div style="background:linear-gradient(135deg,#5b21b6,#7c3aed);border-radius:14px;
                padding:16px;color:#fff;margin-bottom:12px">
      <div style="display:flex;justify-content:space-between;align-items:flex-start">
        <div>
          <div style="font-size:11px;color:#ddd6fe;font-weight:700;text-transform:uppercase;
                      letter-spacing:.4px">Turno activo</div>
          <div style="font-size:20px;font-weight:700;margin-top:4px">${user.name}</div>
          <div style="font-size:12px;color:#ddd6fe;margin-top:4px">
            Desde ${fmtDate(session.openedAt)}
          </div>
        </div>
        <div style="text-align:right">
          <div style="font-size:22px;font-weight:700">${(duration&&duration.str)||""}</div>
          ${(duration&&duration.warn) ? `<div style="font-size:10px;color:#fde68a;margin-top:2px">⚠ Turno longo</div>` : ""}
        </div>
      </div>
    </div>

    <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-bottom:12px">
      <div class="stat-card" style="border-left:3px solid #16a34a">
        <div class="stat-label" style="color:#16a34a">Vendas</div>
        <div class="stat-val" style="color:#16a34a;font-size:15px">${fmt(totalVendas)}</div>
        <div style="font-size:11px;color:#71717a;margin-top:2px">${sessionSales.length} transações</div>
      </div>
      <div class="stat-card" style="border-left:3px solid #5b21b6">
        <div class="stat-label" style="color:#5b21b6">Sessão UUID</div>
        <div style="font-size:10px;font-weight:600;color:#5b21b6;margin-top:4px;
                    word-break:break-all;line-height:1.4">
          ${(session.uuid||"sem uuid").slice(0,18)}...
        </div>
      </div>
    </div>

    ${!hasStoreKey ? `
    <div style="background:#fef3c7;border:1.5px solid #fde68a;border-radius:12px;
                padding:12px 14px;margin-bottom:12px;display:flex;gap:10px;align-items:flex-start">
      <i data-lucide="alert-triangle" style="width:18px;height:18px;color:#d97706;flex-shrink:0;margin-top:2px"></i>
      <div style="font-size:12px;color:#92400e;line-height:1.5">
        <strong>Chave da loja não configurada.</strong><br/>
        O ficheiro .ktk será exportado sem assinatura HMAC.
        A autenticidade não poderá ser verificada noutros dispositivos.
      </div>
    </div>` : ""}

    <div style="display:flex;flex-direction:column;gap:8px;margin-bottom:14px">
      <button onclick="window._fecharTurno()"
              style="width:100%;padding:14px;background:#dc2626;color:#fff;border:none;
                     border-radius:12px;font-size:15px;font-weight:700;cursor:pointer;
                     font-family:inherit;display:flex;align-items:center;justify-content:center;
                     gap:8px;box-shadow:0 4px 12px rgba(220,38,38,.25)">
        <i data-lucide="log-out" style="width:18px;height:18px"></i>
        Fechar turno e exportar .ktk
      </button>
      <button onclick="window._verVendasTurno()"
              style="width:100%;padding:12px;background:#f4f4f5;color:#5b21b6;
                     border:1.5px solid #ddd6fe;border-radius:12px;font-size:14px;
                     font-weight:700;cursor:pointer;font-family:inherit">
        Ver vendas deste turno (${sessionSales.length})
      </button>
    </div>` : `

    <!-- Sem turno activo -->
    <div style="background:#f4f4f5;border-radius:12px;padding:20px;text-align:center;
                margin-bottom:14px">
      <i data-lucide="clock" style="width:32px;height:32px;color:#a1a1aa;margin-bottom:8px"></i>
      <div style="font-size:14px;color:#71717a">Nenhum turno activo</div>
    </div>`}

    ${user.role === "admin" ? `
    <!-- Importar KTK -->
    <div style="margin-bottom:14px">
      <div style="font-size:12px;font-weight:700;color:#71717a;text-transform:uppercase;
                  letter-spacing:.4px;margin-bottom:8px">Importar ficheiro .ktk</div>
      <label style="display:flex;align-items:center;justify-content:center;gap:10px;
                    padding:16px;border:2px dashed #ddd6fe;border-radius:12px;
                    background:#faf5ff;cursor:pointer">
        <i data-lucide="upload" style="width:20px;height:20px;color:#5b21b6"></i>
        <span style="font-size:14px;font-weight:600;color:#5b21b6">
          Clica para importar .ktk
        </span>
        <input type="file" accept=".ktk,.json" id="ktk-import-input"
               style="display:none" onchange="window._handleKtkImport(this)"/>
      </label>
    </div>` : ""}

    <!-- Timeline de turnos -->
    ${closedSessions.length ? `
    <div>
      <div style="font-size:12px;font-weight:700;color:#71717a;text-transform:uppercase;
                  letter-spacing:.4px;margin-bottom:10px">Turnos anteriores</div>
      ${closedSessions.map(s => {
        const color = s.validated ? "#16a34a" : s.hasIncidents ? "#dc2626" : "#5b21b6";
        const label = s.validated ? "Validado" : s.hasIncidents ? "Com incidentes" : s.isImported ? "Importado" : "Fechado";
        const bg    = s.validated ? "#dcfce7" : s.hasIncidents ? "#fee2e2" : "#ede9fe";
        return `
        <div style="background:#fff;border-radius:12px;padding:12px 14px;margin-bottom:8px;
                    border-left:4px solid ${color};box-shadow:0 1px 3px rgba(0,0,0,.06)">
          <div style="display:flex;justify-content:space-between;align-items:center">
            <div>
              <div style="font-size:14px;font-weight:700">${s.userName||"Desconhecido"}</div>
              <div style="font-size:11px;color:#71717a;margin-top:2px">
                ${fmtDate(s.openedAt)}
                ${s.closedAt ? " → "+fmtDate(s.closedAt) : ""}
              </div>
              ${s.uuid ? `<div style="font-size:9px;color:#a1a1aa;margin-top:2px;font-family:monospace">
                ${s.uuid.slice(0,16)}...
              </div>` : ""}
            </div>
            <div style="text-align:right">
              <div style="font-size:14px;font-weight:700;color:#16a34a">${fmt(s.totalVendas||0)}</div>
              <span style="font-size:10px;font-weight:700;padding:2px 6px;border-radius:4px;
                           background:${bg};color:${color}">
                ${label}
              </span>
            </div>
          </div>
        </div>`;
      }).join("")}
    </div>` : ""}`;

  refreshIcons(wrap);
}

// ── FECHAR TURNO ──────────────────────────────────────────────────────────────
window._fecharTurno = async () => {
  const session = getSession();
  if (!session) { toast("Nenhum turno activo.", "error"); return; }

  const sales    = await db.getAll("sales");
  const incidents= await db.getAll("incidents");
  const sessionSales     = sales.filter(s=>s.sessionId===session.id);
  const sessionIncidents = incidents.filter(i=>i.sessionId===session.id);
  const totalVendas      = sessionSales.reduce((a,s)=>a+(s.total||0),0);

  // Verifica storeKey
  const sk = await db.get("settings","storeKey");
  const semChave = !(sk&&sk.value);

  openModal("Fechar Turno",
    `${semChave ? `
    <div style="background:#fef3c7;border:1.5px solid #fde68a;border-radius:12px;
                padding:12px 14px;margin-bottom:14px;display:flex;gap:10px;align-items:flex-start">
      <i data-lucide="alert-triangle" style="width:18px;height:18px;color:#d97706;flex-shrink:0"></i>
      <div style="font-size:12px;color:#92400e;line-height:1.5">
        <strong>Sem assinatura HMAC.</strong><br/>
        Este ficheiro .ktk não poderá ser verificado noutros dispositivos.
        Configure a chave da loja em Perfil → Segurança.
      </div>
    </div>` : ""}
    <div style="background:#f4f4f5;border-radius:12px;padding:14px;margin-bottom:14px">
      <div style="font-size:11px;color:#a1a1aa;font-weight:700;text-transform:uppercase;
                  letter-spacing:.4px;margin-bottom:10px">Resumo do turno</div>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;font-size:13px">
        <div>Total vendido<br/><strong style="font-size:16px;color:#16a34a">${fmt(totalVendas)}</strong></div>
        <div>Transações<br/><strong style="font-size:16px">${sessionSales.length}</strong></div>
        <div>Incidentes<br/><strong style="font-size:16px;color:${sessionIncidents.length?"#dc2626":"#16a34a"}">${sessionIncidents.length}</strong></div>
        <div>Sessão<br/><strong style="font-size:11px;font-family:monospace">${(session.uuid||"").slice(0,12)}...</strong></div>
      </div>
    </div>
    <div style="font-size:13px;color:#71717a;margin-bottom:16px;line-height:1.5">
      Ao fechar, será gerado um ficheiro <strong>.ktk</strong> para entregar ao patrão
      ou ao próximo funcionário.
    </div>
    <div class="form-actions">
      <button class="btn btn-ghost btn-full" onclick="window._closeModal()">Cancelar</button>
      <button class="btn btn-primary btn-full" onclick="window._confirmarFecho()"
              style="background:#dc2626">
        <i data-lucide="log-out"></i> Fechar e exportar .ktk
      </button>
    </div>`);
  refreshIcons(el("modal-box"));
};

window._confirmarFecho = async () => {
  const user    = getUser();
  const session = getSession();
  if (!session) return;

  try {
    // Fecha sessão
    await sessionService.closeSession(session.id);

    // Gera KTK
    const ktk     = await ktkService.generate(session.id);
    const ktkStr  = JSON.stringify(ktk, null, 2);
    const blob    = new Blob([ktkStr],{type:"application/json"});
    const url     = URL.createObjectURL(blob);
    const fname   = `turno_${user.name.replace(/\s+/g,"_")}_${today()}.ktk`;

    closeModal();
    openModal("Turno fechado!",
      `<div style="text-align:center;padding:10px 0 16px">
        <div style="width:64px;height:64px;background:#dcfce7;border-radius:50%;
                    display:flex;align-items:center;justify-content:center;margin:0 auto 12px">
          <i data-lucide="check-circle" style="width:32px;height:32px;color:#16a34a"></i>
        </div>
        <div style="font-size:16px;font-weight:700;margin-bottom:6px">Turno fechado!</div>
        <div style="font-size:13px;color:#71717a">Partilha o ficheiro .ktk com o patrão.</div>
        ${!ktk.hash ? `
        <div style="background:#fef3c7;border-radius:8px;padding:10px;margin-top:10px;
                    font-size:12px;color:#92400e;text-align:left">
          ⚠ Exportado sem assinatura HMAC — chave da loja não configurada.
        </div>` : ""}
      </div>
      <div style="display:flex;flex-direction:column;gap:8px">
        <a href="${url}" download="${fname}"
           style="display:flex;align-items:center;justify-content:center;gap:8px;
                  padding:14px;background:#5b21b6;color:#fff;border-radius:12px;
                  text-decoration:none;font-size:14px;font-weight:700;font-family:inherit">
          <i data-lucide="download" style="width:18px;height:18px"></i>
          Guardar ${fname}
        </a>
        <button onclick="window._shareKtk('${encodeURIComponent(ktkStr)}','${fname}')"
                style="padding:14px;background:#25D366;color:#fff;border:none;
                       border-radius:12px;font-size:14px;font-weight:700;cursor:pointer;
                       font-family:inherit;display:flex;align-items:center;
                       justify-content:center;gap:8px">
          <i data-lucide="share-2" style="width:18px;height:18px"></i>
          Partilhar
        </button>
        <button onclick="window._closeModal();window._logoutSafe()"
                style="padding:12px;background:#f4f4f5;color:#71717a;border:none;
                       border-radius:12px;font-size:14px;font-weight:700;
                       cursor:pointer;font-family:inherit">
          Terminar sessão
        </button>
      </div>`);
    refreshIcons(el("modal-box"));

  } catch(err) {
    toast("Erro ao fechar turno: "+err.message,"error");
    console.error(err);
  }
};

window._shareKtk = async (encodedKtk, fname) => {
  try {
    const blob = new Blob([decodeURIComponent(encodedKtk)],{type:"application/json"});
    const file = new File([blob], fname, {type:"application/json"});
    if (navigator.canShare && navigator.canShare({files:[file]})) {
      await navigator.share({files:[file], title:"Turno Kontaki"});
    } else {
      const url = URL.createObjectURL(blob);
      const a   = document.createElement("a");
      a.href=url; a.download=fname; a.click();
      URL.revokeObjectURL(url);
      toast("Ficheiro guardado.","info");
    }
  } catch(err) {
    toast("Erro ao partilhar: "+err.message,"error");
  }
};

window._logoutSafe = () => {
  const app   = document.getElementById("app");
  const login = document.getElementById("login-page");
  if (app)   app.style.display   = "none";
  if (login) login.style.display = "flex";
  document.getElementById("inp-user").value = "";
  document.getElementById("inp-pass").value = "";
};

// ── IMPORTAR KTK ──────────────────────────────────────────────────────────────
window._handleKtkImport = async (input) => {
  const file = input.files[0];
  if (!file) return;
  input.value = "";

  let ktk;
  try {
    const text = await file.text();
    ktk = JSON.parse(text);
  } catch {
    toast("Ficheiro inválido — não é JSON válido.","error"); return;
  }

  // Validação de campos obrigatórios
  if (!ktk.id_sessao || !ktk.versao || !ktk.loja_id) {
    toast("Ficheiro .ktk inválido — campos obrigatórios em falta.","error"); return;
  }

  // Verificar duplicado
  const dup = await sessionService.checkDuplicate(ktk.id_sessao);
  if (dup) {
    toast(`Sessão já importada em ${fmtDate(dup.openedAt)}.`,"error"); return;
  }

  // Validar hash
  const hashResult = await validateKtkHash(ktk);
  if (!hashResult.valid && !hashResult.legacy) {
    openModal("Hash Inválido",
      `<div style="text-align:center;padding:20px 0">
        <div style="width:60px;height:60px;background:#fee2e2;border-radius:50%;
                    display:flex;align-items:center;justify-content:center;margin:0 auto 14px">
          <i data-lucide="shield-x" style="width:28px;height:28px;color:#dc2626"></i>
        </div>
        <div style="font-size:16px;font-weight:700;color:#dc2626;margin-bottom:8px">
          Ficheiro modificado
        </div>
        <div style="font-size:13px;color:#71717a;line-height:1.6">
          O hash HMAC não é válido.<br/>
          O ficheiro pode ter sido alterado após geração.
        </div>
      </div>
      <button class="btn btn-ghost btn-full" onclick="window._closeModal()">Fechar</button>`);
    refreshIcons(el("modal-box")); return;
  }

  showKtkViewer(ktk, hashResult);
};

function showKtkViewer(ktk, hashResult) {
  const vendas    = ktk.vendas    || [];
  const fiados    = ktk.fiados    || [];
  const incidentes= ktk.incidentes|| [];
  const stockRows = Object.values(ktk.stock_esperado || {});
  const totalVendas = vendas.reduce((a,v)=>a+(v.total||0),0);
  const fiadoAberto = fiados.filter(f=>f.status==="open").reduce((a,f)=>a+(f.amount||0),0);

  openModal(`Turno — ${ktk.funcionario}`,
    `<div style="max-height:70vh;overflow-y:auto">

      <!-- Header -->
      <div style="background:linear-gradient(135deg,#5b21b6,#7c3aed);border-radius:12px;
                  padding:14px;color:#fff;margin-bottom:14px">
        <div style="display:flex;justify-content:space-between;align-items:flex-start">
          <div>
            <div style="font-size:16px;font-weight:700">${ktk.funcionario}</div>
            <div style="font-size:12px;color:#ddd6fe;margin-top:3px">
              ${ktk.data_abertura ? fmtDate(ktk.data_abertura) : ""}
              ${ktk.data_fecho ? " → "+fmtDate(ktk.data_fecho) : ""}
            </div>
            <div style="font-size:11px;color:#ddd6fe;margin-top:2px">
              ${ktk.loja_nome} · v${ktk.versao}
            </div>
          </div>
          <span style="font-size:11px;font-weight:700;padding:4px 8px;border-radius:6px;
                       background:${hashResult.legacy?"rgba(251,191,36,.3)":"rgba(255,255,255,.2)"};
                       color:${hashResult.legacy?"#fef3c7":"#fff"}">
            ${hashResult.legacy ? "⚠ Hash legado" : "✓ HMAC válido"}
          </span>
        </div>
      </div>

      <!-- KPIs -->
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-bottom:14px">
        <div class="stat-card" style="border-left:3px solid #16a34a">
          <div class="stat-label" style="color:#16a34a">Total vendido</div>
          <div class="stat-val" style="color:#16a34a;font-size:14px">${fmt(totalVendas)}</div>
          <div style="font-size:11px;color:#71717a">${vendas.length} vendas</div>
        </div>
        <div class="stat-card" style="border-left:3px solid ${incidentes.length?"#dc2626":"#16a34a"}">
          <div class="stat-label" style="color:${incidentes.length?"#dc2626":"#71717a"}">Incidentes</div>
          <div class="stat-val" style="color:${incidentes.length?"#dc2626":"#18181b"}">${incidentes.length}</div>
        </div>
        <div class="stat-card" style="border-left:3px solid #d97706">
          <div class="stat-label" style="color:#d97706">Fiado aberto</div>
          <div class="stat-val" style="color:#d97706;font-size:13px">${fmt(fiadoAberto)}</div>
        </div>
        <div class="stat-card" style="border-left:3px solid #5b21b6">
          <div class="stat-label" style="color:#5b21b6">Fiados pagos</div>
          <div class="stat-val" style="color:#5b21b6">${fiados.filter(f=>f.status==="paid").length}</div>
        </div>
      </div>

      <!-- Stock esperado -->
      ${stockRows.length ? `
      <div style="margin-bottom:14px">
        <div style="font-size:12px;font-weight:700;color:#71717a;text-transform:uppercase;
                    letter-spacing:.4px;margin-bottom:8px">Stock declarado</div>
        <div style="background:#fff;border-radius:12px;overflow:hidden;border:1px solid #f4f4f5">
          <div style="display:grid;grid-template-columns:1fr 60px 60px 60px;
                      padding:8px 12px;background:#f4f4f5;
                      font-size:10px;font-weight:700;color:#71717a;text-transform:uppercase">
            <span>Produto</span>
            <span style="text-align:center">Recebeu</span>
            <span style="text-align:center">Vendeu</span>
            <span style="text-align:right">Esperado</span>
          </div>
          ${stockRows.map(r => `
            <div style="display:grid;grid-template-columns:1fr 60px 60px 60px;
                        padding:10px 12px;border-top:1px solid #f4f4f5;align-items:center">
              <span style="font-size:13px;font-weight:600">${r.productName}</span>
              <span style="text-align:center;font-size:13px;color:#71717a">${r.received}</span>
              <span style="text-align:center;font-size:13px;color:#dc2626">${r.sold}</span>
              <span style="text-align:right;font-size:13px;font-weight:700;
                           color:${r.expected<0?"#dc2626":r.expected<(r.received*0.1)?"#d97706":"#16a34a"}">
                ${r.expected} ${r.unit}
              </span>
            </div>`).join("")}
        </div>
      </div>` : ""}

      <!-- Incidentes -->
      ${incidentes.length ? `
      <div style="margin-bottom:14px">
        <div style="font-size:12px;font-weight:700;color:#dc2626;text-transform:uppercase;
                    letter-spacing:.4px;margin-bottom:8px">⚠ Incidentes</div>
        ${incidentes.map(i => `
          <div style="background:#fff5f5;border:1px solid #fca5a5;border-radius:10px;
                      padding:12px;margin-bottom:6px">
            <div style="font-size:14px;font-weight:700;color:#dc2626">${i.productName}</div>
            <div style="display:flex;gap:12px;margin-top:6px;font-size:12px;color:#71717a">
              <span>Esperado: <strong>${i.expected}</strong></span>
              <span>Encontrado: <strong>${i.found}</strong></span>
              <span style="color:#dc2626;font-weight:700">
                Dif: ${(i.diff||0)>0?"+":""}${i.diff}
              </span>
            </div>
          </div>`).join("")}
      </div>` : ""}

      <!-- Fiados -->
      ${fiados.length ? `
      <div style="margin-bottom:14px">
        <div style="font-size:12px;font-weight:700;color:#71717a;text-transform:uppercase;
                    letter-spacing:.4px;margin-bottom:8px">Fiados</div>
        ${fiados.map(f => `
          <div style="display:flex;justify-content:space-between;align-items:center;
                      padding:9px 0;border-bottom:1px solid #f4f4f5;font-size:13px">
            <span style="font-weight:600">${f.clientName}</span>
            <div style="display:flex;align-items:center;gap:8px">
              <span style="font-weight:700;color:${f.status==="paid"?"#16a34a":"#dc2626"}">
                ${fmt(f.amount)}
              </span>
              <span style="font-size:10px;font-weight:700;padding:2px 6px;border-radius:4px;
                           background:${f.status==="paid"?"#dcfce7":"#fee2e2"};
                           color:${f.status==="paid"?"#16a34a":"#dc2626"}">
                ${f.status==="paid"?"Pago":"Em aberto"}
              </span>
            </div>
          </div>`).join("")}
      </div>` : ""}

      <!-- Vendas -->
      ${vendas.length ? `
      <div style="margin-bottom:14px">
        <div style="font-size:12px;font-weight:700;color:#71717a;text-transform:uppercase;
                    letter-spacing:.4px;margin-bottom:8px">Vendas (${vendas.length})</div>
        ${vendas.slice(0,5).map(v => `
          <div style="display:flex;justify-content:space-between;padding:8px 0;
                      border-bottom:1px solid #f4f4f5;font-size:13px">
            <div>
              <span style="font-weight:600">#${v.id}</span>
              <span style="color:#71717a;margin-left:6px">${v.payMethod}</span>
            </div>
            <span style="font-weight:700;color:#16a34a">${fmt(v.total)}</span>
          </div>`).join("")}
        ${vendas.length>5?`<div style="font-size:11px;color:#a1a1aa;margin-top:6px;text-align:center">
          +${vendas.length-5} mais vendas
        </div>`:""}
      </div>` : ""}

    </div>

    <!-- Acções -->
    <div style="display:flex;gap:8px;margin-top:14px;border-top:1px solid #f4f4f5;padding-top:14px">
      <button class="btn btn-ghost btn-full" onclick="window._closeModal()">Fechar</button>
      <button class="btn btn-primary btn-full"
              onclick="window._confirmarImportKtk(${JSON.stringify(ktk).replace(/\\/g,'\\\\').replace(/'/g,"\\'")})"
              style="background:#16a34a">
        <i data-lucide="check-circle"></i> Validar e importar
      </button>
    </div>`);

  refreshIcons(el("modal-box"));
}

window._confirmarImportKtk = async (ktk) => {
  try {
    const result = await ktkService.import(ktk);
    toast(`Turno importado. ${result.incidentCount} incidente(s) registado(s).`,"success");
    closeModal();
    await renderTurno();
  } catch(err) {
    if (err.message.startsWith("DUPLICATE:")) {
      toast("Este turno já foi importado anteriormente.","error");
    } else if (err.message === "INVALID_HASH") {
      toast("Hash inválido — ficheiro foi modificado.","error");
    } else if (err.message === "INVALID_FORMAT") {
      toast("Formato .ktk inválido.","error");
    } else {
      toast("Erro: "+err.message,"error");
    }
    closeModal();
  }
};

window._verVendasTurno = async () => {
  const session = getSession();
  if (!session) return;
  const sales = await db.getAll("sales");
  const mine  = sales.filter(s=>s.sessionId===session.id).reverse();
  openModal("Vendas do turno",
    `<div style="max-height:60vh;overflow-y:auto">
      ${!mine.length
        ? `<div style="text-align:center;color:#a1a1aa;padding:20px">Nenhuma venda neste turno</div>`
        : mine.map(s => `
          <div style="display:flex;justify-content:space-between;padding:10px 0;
                      border-bottom:1px solid #f4f4f5;font-size:13px">
            <div>
              <div style="font-weight:600">#${s.id} · ${s.payMethod}</div>
              <div style="color:#71717a;font-size:11px">${fmtDate(s.date)}</div>
            </div>
            <div style="font-weight:700;color:#16a34a">${fmt(s.total)}</div>
          </div>`).join("")}
    </div>
    <button class="btn btn-ghost btn-full" onclick="window._closeModal()" style="margin-top:12px">
      Fechar
    </button>`);
};

window._closeModal = closeModal;
