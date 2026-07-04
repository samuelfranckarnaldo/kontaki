import os

path = os.path.expanduser('~/kontaki/src/components/vender.js')
js = open(path, 'r').read()

old = '''function showReceipt(d) {
  window._lastSaleId = d.sid;
  const storeName  = (d.store&&d.store.name)  || "Kontaki";
  const storeAddr  = (d.store&&d.store.address)|| "";
  const storePhone = (d.store&&d.store.phone)  || "";
  const storeLogo  = (d.store&&d.store.logo)   || "";
  const nif        = (d.store&&d.store.nif)    || "";
  const nItems     = d.items.reduce(function(a,i){return a+i.qty;},0);

  openModal("",
    `<div style="font-family:'DM Sans',Arial,sans-serif">

      <div style="background:linear-gradient(135deg,#059669,#10b981);
                  padding:24px 20px 20px;text-align:center;
                  margin:-20px -20px 0;border-radius:20px 20px 0 0">
        <div style="width:56px;height:56px;background:rgba(255,255,255,.2);
                    border-radius:50%;display:flex;align-items:center;
                    justify-content:center;margin:0 auto 12px;
                    border:2px solid rgba(255,255,255,.4)">
          <i data-lucide="check" style="width:28px;height:28px;color:#fff;stroke-width:3"></i>
        </div>
        <div style="font-size:32px;font-weight:800;color:#fff;letter-spacing:-.5px;line-height:1">${fmt(d.total)}</div>
        <div style="font-size:12px;color:rgba(255,255,255,.8);margin-top:6px">
          ${nItems} ${nItems===1?"item":"itens"} · Venda concluída
        </div>
      </div>

      <div style="border:1px solid #e5e7eb;border-radius:14px;overflow:hidden;margin:16px 0 0">

        <div style="padding:14px 16px;text-align:center;background:#fafafa;border-bottom:1px dashed #d1d5db">
          ${storeLogo?`<img src="${storeLogo}" style="width:40px;height:40px;object-fit:contain;margin:0 auto 6px;display:block;border-radius:8px"/>`:``}
          <div style="font-size:15px;font-weight:800;color:#111827">${storeName}</div>
          ${storeAddr  ? `<div style="font-size:11px;color:#6b7280;margin-top:2px">${storeAddr}</div>`  : ""}
          ${storePhone ? `<div style="font-size:11px;color:#6b7280">${storePhone}</div>`                : ""}
          ${nif        ? `<div style="font-size:11px;color:#6b7280">NIF: ${nif}</div>`                  : ""}
          <div style="font-size:10px;color:#9ca3af;margin-top:6px;font-weight:600">
            Nº ${String(d.sid).padStart(6,"0")} · ${fmtDate(d.saleDate)}
          </div>
        </div>

        ${d.operatorName ? `
        <div style="padding:8px 16px;border-bottom:1px dashed #d1d5db;background:#fff;
                    display:flex;align-items:center;gap:6px">
          <i data-lucide="user-check" style="width:12px;height:12px;color:#9ca3af"></i>
          <span style="font-size:11px;color:#9ca3af">Atendido por <span style="font-weight:700;color:#6b7280">${d.operatorName}</span></span>
        </div>` : ""}

        ${d.clientName ? `
        <div style="padding:10px 16px;border-bottom:1px dashed #d1d5db;
                    display:flex;align-items:center;gap:10px;background:#fff">
          <div style="width:32px;height:32px;background:#ede9fe;border-radius:8px;
                      display:flex;align-items:center;justify-content:center;flex-shrink:0">
            <i data-lucide="user" style="width:14px;height:14px;color:#5b21b6"></i>
          </div>
          <div>
            <div style="font-size:13px;font-weight:700;color:#111827">${d.clientName}</div>
            ${d.clientPhone ? `<div style="font-size:11px;color:#6b7280;margin-top:1px">${d.clientPhone}</div>` : ""}
          </div>
        </div>` : ""}

        <div style="padding:10px 16px;border-bottom:1px dashed #d1d5db;background:#fff">
          ${d.items.map(i=>`
          <div style="display:flex;justify-content:space-between;align-items:center;padding:4px 0">
            <div style="flex:1;min-width:0">
              <span style="font-size:13px;color:#374151;font-weight:600">${i.name}</span>
              <span style="font-size:11px;color:#9ca3af;margin-left:6px">×${i.qty}</span>
            </div>
            <span style="font-size:13px;font-weight:700;color:#111827;flex-shrink:0">${fmt(i.price*i.qty)}</span>
          </div>`).join("")}
        </div>

        <div style="padding:12px 16px;background:#fafafa;border-bottom:1px dashed #d1d5db">
          ${d.da>0?`
          <div style="display:flex;justify-content:space-between;font-size:12px;padding:3px 0">
            <span style="color:#6b7280">Desconto</span>
            <span style="color:#059669;font-weight:600">− ${fmt(d.da)}</span>
          </div>`:""}
          <div style="display:flex;justify-content:space-between;align-items:center;
                      padding:10px 12px;background:#5b21b6;border-radius:10px;margin-top:6px">
            <span style="font-size:14px;font-weight:700;color:#ddd6fe">Total</span>
            <span style="font-size:20px;font-weight:800;color:#fff">${fmt(d.total)}</span>
          </div>
          <div style="display:flex;justify-content:space-between;font-size:12px;margin-top:8px;color:#6b7280">
            <span style="text-transform:capitalize;font-weight:600">${d.payMethod}</span>
            ${d.recebido>0?`<span>Recebido: ${fmt(d.recebido)} · Troco: <strong style="color:#059669">${fmt(d.troco)}</strong></span>`:""}
          </div>
        </div>

        <div style="padding:14px 16px;display:flex;align-items:center;gap:14px;background:#fff">
          <div id="receipt-qr" style="flex-shrink:0"></div>
          <div>
            <div style="font-size:9px;color:#9ca3af;text-transform:uppercase;
                        letter-spacing:.6px;margin-bottom:5px;font-weight:700">Verificação</div>
            <div style="font-size:20px;font-weight:800;color:#5b21b6;letter-spacing:3px">${d.hash}</div>
            <div style="font-size:10px;color:#9ca3af;margin-top:4px;line-height:1.5">
              Scan para verificar autenticidade
            </div>
          </div>
        </div>

        <div style="padding:10px 16px;text-align:center;background:#fafafa;border-top:1px dashed #d1d5db">
          <div style="font-size:9px;color:#9ca3af;line-height:1.8">
            Documento de gestão interna · Sem validade fiscal perante a AGT
          </div>
          <div style="font-size:10px;color:#7c3aed;font-weight:700;margin-top:2px">
            Powered by Kontaki · Introxeer
          </div>
        </div>

        <div style="padding:12px 16px;text-align:center;background:#fafafa">
          <div style="font-size:12.5px;font-weight:700;color:#374151">Obrigado pela preferência!</div>
          <div style="font-size:11px;color:#9ca3af;margin-top:2px">Volte sempre</div>
        </div>
      </div>'''

new = '''function showReceipt(d) {
  window._lastSaleId = d.sid;
  const storeName  = (d.store&&d.store.name)  || "Kontaki";
  const storeAddr  = (d.store&&d.store.address)|| "";
  const storePhone = (d.store&&d.store.phone)  || "";
  const storeLogo  = (d.store&&d.store.logo)   || "";
  const nif        = (d.store&&d.store.nif)    || "";
  const nItems     = d.items.reduce(function(a,i){return a+i.qty;},0);

  openModal("",
    `<div style="font-family:'DM Sans',Arial,sans-serif">

      <div style="background:linear-gradient(135deg,#059669,#10b981);
                  padding:24px 20px 20px;text-align:center;
                  margin:-20px -20px 0;border-radius:20px 20px 0 0">
        <div style="width:56px;height:56px;background:rgba(255,255,255,.2);
                    border-radius:50%;display:flex;align-items:center;
                    justify-content:center;margin:0 auto 12px;
                    border:2px solid rgba(255,255,255,.4)">
          <i data-lucide="check" style="width:28px;height:28px;color:#fff;stroke-width:3"></i>
        </div>
        <div style="font-size:32px;font-weight:800;color:#fff;letter-spacing:-.5px;line-height:1">${fmt(d.total)}</div>
        <div style="font-size:12px;color:rgba(255,255,255,.8);margin-top:6px">
          ${nItems} ${nItems===1?"item":"itens"} · Venda concluída
        </div>
      </div>

      <div style="border:1px solid #e5e7eb;border-radius:14px;overflow:hidden;margin:16px 0 0">

        <div style="padding:16px;text-align:center;background:#fafafa;border-bottom:1px solid #e5e7eb">
          ${storeLogo?`<img src="${storeLogo}" style="width:40px;height:40px;object-fit:contain;margin:0 auto 8px;display:block;border-radius:8px"/>`:``}
          <div style="font-size:16px;font-weight:800;color:#111827">${storeName}</div>
          ${storeAddr  ? `<div style="font-size:11px;color:#6b7280;margin-top:3px">${storeAddr}</div>`  : ""}
          ${storePhone ? `<div style="font-size:11px;color:#6b7280;margin-top:1px">${storePhone}</div>`                : ""}
          ${nif        ? `<div style="font-size:11px;color:#6b7280;margin-top:1px">NIF: ${nif}</div>`                  : ""}
          <div style="font-size:10px;color:#9ca3af;margin-top:8px;font-weight:600;padding-top:8px;border-top:1px dashed #d1d5db">
            Nº ${String(d.sid).padStart(6,"0")} · ${fmtDate(d.saleDate)}${d.operatorName ? ` · ${d.operatorName}` : ""}
          </div>
        </div>

        ${d.clientName ? `
        <div style="padding:10px 16px;border-bottom:1px solid #f3f4f6;
                    display:flex;align-items:center;gap:10px;background:#fff">
          <div style="width:30px;height:30px;background:#f3f4f6;border-radius:8px;
                      display:flex;align-items:center;justify-content:center;flex-shrink:0">
            <i data-lucide="user" style="width:13px;height:13px;color:#6b7280"></i>
          </div>
          <div>
            <div style="font-size:13px;font-weight:700;color:#111827">${d.clientName}</div>
            ${d.clientPhone ? `<div style="font-size:11px;color:#9ca3af;margin-top:1px">${d.clientPhone}</div>` : ""}
          </div>
        </div>` : ""}

        <div style="padding:12px 16px;background:#fff">
          ${d.items.map(i=>`
          <div style="display:flex;justify-content:space-between;align-items:center;padding:4px 0">
            <div style="flex:1;min-width:0">
              <span style="font-size:13px;color:#374151;font-weight:600">${i.name}</span>
              <span style="font-size:11px;color:#9ca3af;margin-left:6px">×${i.qty}</span>
            </div>
            <span style="font-size:13px;font-weight:700;color:#111827;flex-shrink:0">${fmt(i.price*i.qty)}</span>
          </div>`).join("")}
        </div>

        <div style="padding:12px 16px;background:#fafafa;border-top:1px solid #e5e7eb">
          ${d.da>0?`
          <div style="display:flex;justify-content:space-between;font-size:12px;padding:3px 0">
            <span style="color:#6b7280">Desconto</span>
            <span style="color:#059669;font-weight:600">− ${fmt(d.da)}</span>
          </div>`:""}
          <div style="display:flex;justify-content:space-between;align-items:center;
                      padding:10px 12px;background:#5b21b6;border-radius:10px;margin-top:6px">
            <span style="font-size:14px;font-weight:700;color:#ddd6fe">Total</span>
            <span style="font-size:20px;font-weight:800;color:#fff">${fmt(d.total)}</span>
          </div>
          <div style="display:flex;justify-content:space-between;font-size:12px;margin-top:8px;color:#6b7280">
            <span style="text-transform:capitalize;font-weight:600">${d.payMethod}</span>
            ${d.recebido>0?`<span>Recebido: ${fmt(d.recebido)} · Troco: <strong style="color:#059669">${fmt(d.troco)}</strong></span>`:""}
          </div>
        </div>

        <div style="padding:14px 16px;display:flex;align-items:center;gap:14px;background:#fff;border-top:1px solid #e5e7eb">
          <div id="receipt-qr" style="flex-shrink:0"></div>
          <div>
            <div style="font-size:9px;color:#9ca3af;text-transform:uppercase;
                        letter-spacing:.6px;margin-bottom:5px;font-weight:700">Verificação</div>
            <div style="font-size:20px;font-weight:800;color:#374151;letter-spacing:3px">${d.hash}</div>
            <div style="font-size:10px;color:#9ca3af;margin-top:4px;line-height:1.5">
              Scan para verificar autenticidade
            </div>
          </div>
        </div>

        <div style="padding:14px 16px;text-align:center;background:#fafafa;border-top:1px solid #e5e7eb">
          <div style="font-size:13px;font-weight:700;color:#374151">Obrigado pela preferência!</div>
          <div style="font-size:11px;color:#9ca3af;margin-top:2px;margin-bottom:10px">Volte sempre</div>
          <div style="font-size:9px;color:#c4c4c8;line-height:1.7;padding-top:8px;border-top:1px dashed #e5e7eb">
            Documento de gestão interna · Sem validade fiscal perante a AGT<br/>
            Powered by Kontaki · Introxeer
          </div>
        </div>
      </div>'''

if old in js:
    js = js.replace(old, new, 1)
    open(path, 'w').write(js)
    print("Recibo redesenhado: cor disciplinada, menos separadores, localização reforçada.")
else:
    print("ERRO: bloco não encontrado exactamente — verificar manualmente.")
