import { db, auth } from './firebase.js';
import {
    doc, setDoc, getDoc, updateDoc
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js";

// ── Estado ────────────────────────────────────────────────────────────────
let currentUser  = null;
let isEditMode   = false;
let editMonthDoc = null;   // "YYYY-MM" del registro en edición
let editDayKey   = null;   // "DD_punto" del registro en edición  (ej: "26_principal")
let gastosItems  = [];
let allRecords   = [];     // registros cargados del mes actual

// ── Helpers ───────────────────────────────────────────────────────────────
function fmt(n) {
    return '$' + Number(n || 0).toLocaleString('es-CO');
}

function escHtml(s) {
    return String(s || '')
        .replace(/&/g, '&amp;').replace(/</g, '&lt;')
        .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function monthLabel(ym) {
    if (!ym) return '';
    const [y, m] = ym.split('-');
    return new Date(+y, +m - 1, 1)
        .toLocaleDateString('es-CO', { month: 'long', year: 'numeric' });
}

// Clave del documento de mes: "YYYY-MM"
function getMonthDoc(fecha) { return fecha.slice(0, 7); }

// Clave del día dentro del documento: "DD_punto"  (ej: "26_principal")
function getDayKey(fecha, punto) { return `${fecha.slice(8, 10)}_${punto}`; }

// ── Toast ─────────────────────────────────────────────────────────────────
function showToast(msg, type = 'success') {
    const t = document.getElementById('fr-toast');
    if (!t) return;
    t.textContent = msg;
    t.className = `fr-toast fr-visible fr-${type}`;
    clearTimeout(t._tid);
    t._tid = setTimeout(() => { t.className = 'fr-toast'; }, 3200);
}

// ── Modo formulario ───────────────────────────────────────────────────────
function setEditMode(on) {
    isEditMode = on;
    const lbl       = document.getElementById('fr-form-mode-label');
    const cancelBtn = document.getElementById('fr-btn-cancel');
    const dateInput = document.getElementById('fr-date');
    const puntoSel  = document.getElementById('fr-punto');

    if (lbl)       lbl.textContent         = on ? 'Editar Registro' : 'Nuevo Registro';
    if (cancelBtn) cancelBtn.style.display = on ? '' : 'none';

    // Bloqueamos fecha y punto al editar para mantener consistencia de la clave
    if (dateInput) {
        dateInput.readOnly              = on;
        dateInput.style.background      = on ? '#f5f5f5' : '';
        dateInput.style.color           = on ? '#666' : '';
    }
    if (puntoSel) {
        puntoSel.disabled               = on;
        puntoSel.style.background       = on ? '#f5f5f5' : '';
        puntoSel.style.color            = on ? '#666' : '';
    }
}

// ── Limpiar formulario ────────────────────────────────────────────────────
function clearForm() {
    const today = new Date().toISOString().slice(0, 10);
    document.getElementById('fr-date').value          = today;
    document.getElementById('fr-punto').value         = 'principal';
    document.getElementById('fr-transferencia').value = '0';
    document.getElementById('fr-efectivo').value      = '0';
    document.getElementById('fr-caja').value          = '0';
    document.getElementById('fr-dian').value          = '0';

    const cajaDiff = document.getElementById('fr-caja-diff');
    if (cajaDiff) { cajaDiff.value = ''; cajaDiff.className = 'input-readonly'; }
    const dianIva  = document.getElementById('fr-dian-iva');
    if (dianIva)  dianIva.value = '';

    gastosItems  = [];
    editMonthDoc = null;
    editDayKey   = null;
    renderGastos();
    setEditMode(false);
}

// ── Gastos dinámicos ──────────────────────────────────────────────────────
function renderGastos() {
    const list  = document.getElementById('fr-gastos-list');
    const empty = document.getElementById('fr-gastos-empty');
    if (!list) return;

    list.querySelectorAll('.fr-gasto-item').forEach(el => el.remove());

    if (gastosItems.length === 0) {
        if (empty) empty.style.display = 'block';
    } else {
        if (empty) empty.style.display = 'none';
        gastosItems.forEach((item, i) => {
            const div = document.createElement('div');
            div.className = 'fr-gasto-item';
            div.innerHTML = `
                <input class="fr-gasto-input-desc" type="text"
                    placeholder="Descripción del gasto"
                    value="${escHtml(item.descripcion)}"
                    data-i="${i}" data-f="descripcion" />
                <input class="fr-gasto-input-monto" type="number"
                    min="0" placeholder="0"
                    value="${item.monto || 0}"
                    data-i="${i}" data-f="monto" />
                <button class="fr-gasto-delete" data-i="${i}" title="Eliminar gasto">✕</button>
            `;
            list.appendChild(div);
        });
    }
    updateGastosTotal();
}

function updateGastosTotal() {
    const total = gastosItems.reduce((s, g) => s + (parseFloat(g.monto) || 0), 0);
    const el = document.getElementById('fr-gastos-total-val');
    if (el) el.textContent = fmt(total);
    updateCajaAndDian();
}

// ── Cuadre de Caja y DIAN en tiempo real ──────────────────────────────────
function updateCajaAndDian() {
    const efectivo    = parseFloat(document.getElementById('fr-efectivo')?.value)   || 0;
    const cajaVal     = parseFloat(document.getElementById('fr-caja')?.value)       || 0;
    const dianVal     = parseFloat(document.getElementById('fr-dian')?.value)       || 0;
    const totalGastos = gastosItems.reduce((s, g) => s + (parseFloat(g.monto) || 0), 0);

    // ── Cuadre de caja ────────────────────────────────────────────────────
    // esperado = lo que debería haber en caja = efectivo recibido − gastos pagados
    const esperado   = efectivo - totalGastos;
    const diferencia = cajaVal  - esperado;   // + sobra  |  − falta

    const cajaDiffEl = document.getElementById('fr-caja-diff');
    if (cajaDiffEl) {
        if (diferencia === 0) {
            cajaDiffEl.value     = '✅ Cuadrado ($0)';
            cajaDiffEl.className = 'input-readonly fr-caja-ok';
        } else if (diferencia > 0) {
            cajaDiffEl.value     = `▲ Sobra ${fmt(diferencia)}`;
            cajaDiffEl.className = 'input-readonly fr-caja-surplus';
        } else {
            cajaDiffEl.value     = `▼ Falta ${fmt(Math.abs(diferencia))}`;
            cajaDiffEl.className = 'input-readonly fr-caja-deficit';
        }
    }

    // ── IVA DIAN ─────────────────────────────────────────────────────────
    const iva       = dianVal * 0.19;
    const dianIvaEl = document.getElementById('fr-dian-iva');
    if (dianIvaEl) {
        dianIvaEl.value = dianVal > 0 ? fmt(iva) : '—';
    }
}

// ── Firebase: guardar ─────────────────────────────────────────────────────
// Estructura: financialReporting/{YYYY-MM}  →  campo dias.{DD_punto}
// → 1 lectura y 1 escritura por mes, sin importar cuántos días tenga
async function saveEntry() {
    const fecha         = document.getElementById('fr-date').value;
    const punto         = document.getElementById('fr-punto').value;
    const transferencia = parseFloat(document.getElementById('fr-transferencia').value) || 0;
    const efectivo      = parseFloat(document.getElementById('fr-efectivo').value)      || 0;
    const cajaContada   = parseFloat(document.getElementById('fr-caja').value)          || 0;
    const dian          = parseFloat(document.getElementById('fr-dian').value)          || 0;
    const usuario       = currentUser?.email || 'desconocido';

    if (!fecha) { showToast('⚠️ Selecciona una fecha', 'error'); return; }

    const monthDoc = isEditMode ? editMonthDoc : getMonthDoc(fecha);
    const dayKey   = isEditMode ? editDayKey   : getDayKey(fecha, punto);
    const monthRef = doc(db, 'financialReporting', monthDoc);

    const data = {
        fecha,
        punto,
        ventasTransferencia : transferencia,
        ventasEfectivo      : efectivo,
        efectivoEnCaja      : cajaContada,
        facturacionDian     : dian,
        gastos              : gastosItems.map(g => ({
            descripcion : g.descripcion || '',
            monto       : parseFloat(g.monto) || 0
        })),
        usuario,
        updatedAt: new Date().toISOString()
    };

    const saveBtn = document.getElementById('fr-btn-save');
    if (saveBtn) { saveBtn.disabled = true; saveBtn.textContent = 'Guardando...'; }

    try {
        try {
            // Actualiza solo el campo del día — no toca los demás días del mes
            await updateDoc(monthRef, { [`dias.${dayKey}`]: data });
        } catch (e) {
            if (e.code === 'not-found') {
                // Primera entrada del mes: crea el documento
                await setDoc(monthRef, { dias: { [dayKey]: data } });
            } else {
                throw e;
            }
        }
        showToast('✅ Registro guardado correctamente', 'success');
        clearForm();
        await loadRecords();
    } catch (err) {
        console.error('Error guardando financialReporting:', err);
        showToast('❌ Error al guardar. Intenta de nuevo.', 'error');
    } finally {
        if (saveBtn) { saveBtn.disabled = false; saveBtn.textContent = '💾 Guardar'; }
    }
}

// ── Firebase: cargar ──────────────────────────────────────────────────────
// 1 sola lectura por mes, sin importar cuántos días tenga registrados
async function loadRecords() {
    const month     = document.getElementById('fr-month')?.value; // YYYY-MM
    const tbody     = document.getElementById('fr-tbody');
    const noData    = document.getElementById('fr-no-data');
    const tableWrap = document.getElementById('fr-table-wrapper');
    if (!tbody || !month) return;

    tbody.innerHTML = '';
    if (noData)    { noData.textContent = 'Cargando registros...'; noData.style.display = 'block'; }
    if (tableWrap) tableWrap.style.display = 'none';

    try {
        const snap = await getDoc(doc(db, 'financialReporting', month));

        if (!snap.exists() || !snap.data()?.dias) {
            allRecords = [];
            if (noData) noData.textContent = 'No hay registros para este mes.';
            updateSummary([]);
            return;
        }

        const dias = snap.data().dias;

        // Convierte el mapa dias → array ordenado por fecha y punto
        allRecords = Object.entries(dias).map(([key, d]) => ({
            id    : key,
            fecha : `${month}-${key.slice(0, 2)}`,
            punto : key.slice(3),   // "DD_punto" → slice después del "_"
            ...d
        })).sort((a, b) =>
            a.fecha.localeCompare(b.fecha) || a.punto.localeCompare(b.punto)
        );

        if (allRecords.length === 0) {
            if (noData) noData.textContent = 'No hay registros para este mes.';
            updateSummary([]);
            return;
        }

        if (noData)    noData.style.display    = 'none';
        if (tableWrap) tableWrap.style.display = 'block';

        allRecords.forEach(r => {
            const totalVentas = (r.ventasTransferencia || 0) + (r.ventasEfectivo || 0);
            const totalGastos = (r.gastos || []).reduce((s, g) => s + (g.monto || 0), 0);
            const esperado    = (r.ventasEfectivo || 0) - totalGastos;
            const cajaDiff    = (r.efectivoEnCaja || 0) - esperado;
            const dianIva     = (r.facturacionDian || 0) * 0.19;

            const gastosHtml = (r.gastos || []).length > 0
                ? r.gastos.map(g => `• ${escHtml(g.descripcion)}: ${fmt(g.monto)}`).join('<br>')
                : '<em style="color:#bbb;">Sin gastos</em>';

            const puntoBadge = r.punto === 'principal'
                ? '<span class="badge-principal">🏪 Principal</span>'
                : '<span class="badge-domicilio">🛵 Domicilio</span>';

            let cajaDiffHtml;
            if (cajaDiff === 0) {
                cajaDiffHtml = '<span class="fr-caja-badge ok">✅ Cuadrado</span>';
            } else if (cajaDiff > 0) {
                cajaDiffHtml = `<span class="fr-caja-badge surplus">▲ Sobra ${fmt(cajaDiff)}</span>`;
            } else {
                cajaDiffHtml = `<span class="fr-caja-badge deficit">▼ Falta ${fmt(Math.abs(cajaDiff))}</span>`;
            }

            const tr = document.createElement('tr');
            tr.innerHTML = `
                <td>${escHtml(r.fecha)}</td>
                <td>${puntoBadge}</td>
                <td>${fmt(r.ventasTransferencia)}</td>
                <td>${fmt(r.ventasEfectivo)}</td>
                <td class="total-cell">${fmt(totalVentas)}</td>
                <td style="color:#c62828; font-weight:bold;">${fmt(totalGastos)}</td>
                <td><div class="fr-gastos-detail">${gastosHtml}</div></td>
                <td>${fmt(r.efectivoEnCaja)}</td>
                <td>${cajaDiffHtml}</td>
                <td>${fmt(r.facturacionDian)}</td>
                <td style="color:#6a1b9a; font-weight:bold;">${fmt(dianIva)}</td>
                <td style="font-size:12px; color:#888;">${escHtml(r.usuario || '—')}</td>
                <td>
                    <button class="btn-edit-fr" data-id="${escHtml(r.id)}">✏️ Editar</button>
                </td>
            `;
            tbody.appendChild(tr);
        });

        tbody.querySelectorAll('.btn-edit-fr').forEach(btn => {
            btn.addEventListener('click', () => loadForEdit(btn.dataset.id));
        });

        updateSummary(allRecords);
    } catch (err) {
        console.error('Error cargando financialReporting:', err);
        if (noData) noData.textContent = 'Error al cargar registros.';
    }
}

// ── Cargar registro en el formulario para editar ──────────────────────────
function loadForEdit(dayKey) {
    const r = allRecords.find(rec => rec.id === dayKey);
    if (!r) return;

    document.getElementById('fr-date').value          = r.fecha;
    document.getElementById('fr-punto').value         = r.punto;
    document.getElementById('fr-transferencia').value = r.ventasTransferencia || 0;
    document.getElementById('fr-efectivo').value      = r.ventasEfectivo      || 0;
    document.getElementById('fr-caja').value          = r.efectivoEnCaja      || 0;
    document.getElementById('fr-dian').value          = r.facturacionDian     || 0;
    gastosItems  = (r.gastos || []).map(g => ({ ...g }));
    editMonthDoc = document.getElementById('fr-month').value;
    editDayKey   = dayKey;
    renderGastos();          // también llama updateCajaAndDian() al final
    setEditMode(true);

    document.querySelector('.fr-form-card')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

// ── Actualizar resumen del mes ─────────────────────────────────────────────
function updateSummary(records) {
    const p = records.filter(r => r.punto === 'principal');
    const d = records.filter(r => r.punto === 'domicilio');

    const sumF = (arr, field) => arr.reduce((s, r) => s + (r[field] || 0), 0);
    const sumG = (arr) => arr.reduce((s, r) =>
        s + (r.gastos || []).reduce((sg, g) => sg + (g.monto || 0), 0), 0);

    const pT = sumF(p, 'ventasTransferencia'), pE = sumF(p, 'ventasEfectivo');
    const pV = pT + pE,  pG = sumG(p);
    const pD = sumF(p, 'facturacionDian');

    const dT = sumF(d, 'ventasTransferencia'), dE = sumF(d, 'ventasEfectivo');
    const dV = dT + dE,  dG = sumG(d);
    const dD = sumF(d, 'facturacionDian');

    const set = (id, val) => { const el = document.getElementById(id); if (el) el.textContent = fmt(val); };

    // Subtotales y netos
    const pSub = pV - pG;               const pNeto = pV - pG - pD * 0.19;
    const dSub = dV - dG;               const dNeto = dV - dG - dD * 0.19;
    const tSub = (pV + dV) - (pG + dG); const tNeto = (pV + dV) - (pG + dG) - (pD + dD) * 0.19;

    // Principal
    set('sum-p-trans',    pT);    set('sum-p-efec',     pE);
    set('sum-p-ventas',   pV);    set('sum-p-gastos',   pG);
    set('sum-p-subtotal', pSub);
    set('sum-p-dian',     pD);    set('sum-p-iva',      pD * 0.19);
    set('sum-p-neto',     pNeto);

    // Domicilio
    set('sum-d-trans',    dT);    set('sum-d-efec',     dE);
    set('sum-d-ventas',   dV);    set('sum-d-gastos',   dG);
    set('sum-d-subtotal', dSub);
    set('sum-d-dian',     dD);    set('sum-d-iva',      dD * 0.19);
    set('sum-d-neto',     dNeto);

    // Total general
    set('sum-t-trans',    pT + dT);  set('sum-t-efec',     pE + dE);
    set('sum-t-ventas',   pV + dV);  set('sum-t-gastos',   pG + dG);
    set('sum-t-subtotal', tSub);
    set('sum-t-dian',     pD + dD);  set('sum-t-iva',     (pD + dD) * 0.19);
    set('sum-t-neto',     tNeto);
}

// ── Exportar PDF ───────────────────────────────────────────────────────────
function exportPDF() {
    const month = document.getElementById('fr-month')?.value;
    if (!month || allRecords.length === 0) {
        showToast('⚠️ No hay registros para exportar', 'error');
        return;
    }
    const win = window.open('', '_blank', 'width=1100,height=800');
    win.document.write(buildPDFReport(month, allRecords));
    win.document.close();
    setTimeout(() => win.print(), 600);
}

function buildPDFReport(month, records) {
    const label = monthLabel(month);
    const today = new Date().toLocaleDateString('es-CO', { day: '2-digit', month: 'long', year: 'numeric' });

    const p = records.filter(r => r.punto === 'principal');
    const d = records.filter(r => r.punto === 'domicilio');
    const sumF = (arr, field) => arr.reduce((s, r) => s + (r[field] || 0), 0);
    const sumG = (arr) => arr.reduce((s, r) =>
        s + (r.gastos || []).reduce((sg, g) => sg + (g.monto || 0), 0), 0);

    const pT = sumF(p, 'ventasTransferencia'), pE = sumF(p, 'ventasEfectivo');
    const pV = pT + pE, pG = sumG(p), pD = sumF(p, 'facturacionDian');
    const pSub = pV - pG, pNeto = pV - pG - pD * 0.19;

    const dT = sumF(d, 'ventasTransferencia'), dE = sumF(d, 'ventasEfectivo');
    const dV = dT + dE, dG = sumG(d), dD = sumF(d, 'facturacionDian');
    const dSub = dV - dG, dNeto = dV - dG - dD * 0.19;

    const tSub = (pV + dV) - (pG + dG);
    const tNeto = (pV + dV) - (pG + dG) - (pD + dD) * 0.19;

    const filas = records.map(r => {
        const tv        = (r.ventasTransferencia || 0) + (r.ventasEfectivo || 0);
        const tg        = (r.gastos || []).reduce((s, g) => s + (g.monto || 0), 0);
        const esperado  = (r.ventasEfectivo || 0) - tg;
        const cajaDiff  = (r.efectivoEnCaja || 0) - esperado;
        const dianIva   = (r.facturacionDian || 0) * 0.19;

        let cajaDiffTxt, cajaDiffClass;
        if (cajaDiff === 0)      { cajaDiffTxt = '✅ Cuadrado'; cajaDiffClass = 'ok'; }
        else if (cajaDiff > 0)   { cajaDiffTxt = `▲ Sobra ${fmt(cajaDiff)}`; cajaDiffClass = 'surplus'; }
        else                     { cajaDiffTxt = `▼ Falta ${fmt(Math.abs(cajaDiff))}`; cajaDiffClass = 'deficit'; }

        const gd = (r.gastos || []).length > 0
            ? r.gastos.map(g => `• ${escHtml(g.descripcion)}: ${fmt(g.monto)}`).join('<br>')
            : '—';

        return `<tr>
            <td>${escHtml(r.fecha)}</td>
            <td>${r.punto === 'principal' ? 'Principal' : 'Domicilio'}</td>
            <td class="num">${fmt(r.ventasTransferencia)}</td>
            <td class="num">${fmt(r.ventasEfectivo)}</td>
            <td class="num bold blue">${fmt(tv)}</td>
            <td class="num bold red">${fmt(tg)}</td>
            <td class="detalle">${gd}</td>
            <td class="num">${fmt(r.efectivoEnCaja)}</td>
            <td class="num caja-${cajaDiffClass}">${cajaDiffTxt}</td>
            <td class="num">${fmt(r.facturacionDian)}</td>
            <td class="num purple">${fmt(dianIva)}</td>
            <td class="user">${escHtml(r.usuario || '—')}</td>
        </tr>`;
    }).join('');

    return `<!DOCTYPE html>
<html lang="es">
<head>
<meta charset="UTF-8">
<title>Reporte Financiero — ${label}</title>
<style>
  * { box-sizing:border-box; margin:0; padding:0; }
  body { font-family:Arial,sans-serif; font-size:11px; color:#333; padding:24px; }
  .rpt-header { display:flex; justify-content:space-between; align-items:flex-start;
      padding-bottom:12px; margin-bottom:20px; border-bottom:3px solid #194073; }
  .rpt-company { font-size:20px; font-weight:bold; color:#194073; }
  .rpt-subtitle { font-size:13px; color:#555; margin-top:4px; }
  .rpt-meta { text-align:right; font-size:11px; color:#888; line-height:1.7; }
  h2 { font-size:12px; color:#194073; margin:20px 0 8px;
       text-transform:uppercase; letter-spacing:.5px; }
  table { width:100%; border-collapse:collapse; margin-bottom:16px; font-size:10.5px; }
  thead { background:#194073; color:white; }
  th  { padding:7px 8px; text-align:left; font-size:10px; }
  td  { padding:5px 8px; border-bottom:1px solid #eee; vertical-align:top; }
  tr:nth-child(even) td { background:#fafbff; }
  .num    { text-align:right; white-space:nowrap; }
  .bold   { font-weight:bold; }
  .blue   { color:#194073; }
  .red    { color:#c62828; }
  .purple { color:#6a1b9a; font-weight:bold; }
  .caja-ok      { color:#2e7d32; font-weight:bold; }
  .caja-surplus { color:#1565c0; font-weight:bold; }
  .caja-deficit { color:#c62828; font-weight:bold; }
  .detalle { font-size:10px; color:#666; line-height:1.6; }
  .user    { font-size:10px; color:#aaa; }
  .sum-table tfoot td { font-weight:bold; background:#f0f5ff;
      border-top:2px solid #194073; color:#194073; }
  .sum-table .red-row   td { color:#c62828; background:#fff5f5; }
  .sum-table .sub-row   td { color:#194073; background:#e8f0fe; font-weight:bold;
      border-top:2px dashed #90a4ae; }
  .sum-table .purp-row  td { color:#6a1b9a; background:#f9f0ff; }
  .sum-table .neto-row  td { color:#1b5e20; background:#e8f5e9; font-weight:bold;
      font-size:13px; border-top:3px solid #388e3c; }
  .footer { margin-top:20px; padding-top:10px; border-top:1px solid #ddd;
            text-align:right; font-size:10px; color:#aaa; }
  @media print {
    @page { margin:1.2cm; size:A4 landscape; }
    body  { padding:0; }
  }
</style>
</head>
<body>
<div class="rpt-header">
  <div>
    <div class="rpt-company">🍦 Heladería Los Espejos</div>
    <div class="rpt-subtitle">💰 Reporte Financiero — ${label}</div>
  </div>
  <div class="rpt-meta">
    <div>Generado: ${today}</div>
    <div>Total registros: ${records.length}</div>
  </div>
</div>
<h2>📋 Detalle de Registros</h2>
<table>
  <thead>
    <tr>
      <th>Fecha</th><th>Punto</th>
      <th class="num">Transferencia</th><th class="num">Efectivo</th>
      <th class="num">Total Ventas</th><th class="num">Total Gastos</th>
      <th>Detalle Gastos</th>
      <th class="num">Caja Contada</th><th class="num">Dif. Caja</th>
      <th class="num">Fact. DIAN</th><th class="num">IVA 19%</th>
      <th>Usuario</th>
    </tr>
  </thead>
  <tbody>${filas}</tbody>
</table>
<h2>📊 Resumen del Mes</h2>
<table class="sum-table">
  <thead>
    <tr>
      <th>Concepto</th>
      <th class="num">Punto Principal</th>
      <th class="num">Punto Domicilio</th>
      <th class="num">Total General</th>
    </tr>
  </thead>
  <tbody>
    <tr><td>Ventas Transferencia</td>
        <td class="num">${fmt(pT)}</td><td class="num">${fmt(dT)}</td><td class="num">${fmt(pT+dT)}</td></tr>
    <tr><td>Ventas Efectivo</td>
        <td class="num">${fmt(pE)}</td><td class="num">${fmt(dE)}</td><td class="num">${fmt(pE+dE)}</td></tr>
  </tbody>
  <tfoot>
    <tr><td>Total Ventas</td>
        <td class="num">${fmt(pV)}</td><td class="num">${fmt(dV)}</td><td class="num">${fmt(pV+dV)}</td></tr>
    <tr class="red-row"><td>Total Gastos</td>
        <td class="num">${fmt(pG)}</td><td class="num">${fmt(dG)}</td><td class="num">${fmt(pG+dG)}</td></tr>
    <tr class="sub-row"><td>Subtotal Ventas − Gastos</td>
        <td class="num">${fmt(pSub)}</td><td class="num">${fmt(dSub)}</td><td class="num">${fmt(tSub)}</td></tr>
    <tr><td>Facturación DIAN</td>
        <td class="num">${fmt(pD)}</td><td class="num">${fmt(dD)}</td><td class="num">${fmt(pD+dD)}</td></tr>
    <tr class="purp-row"><td>IVA 19% DIAN</td>
        <td class="num">${fmt(pD*0.19)}</td><td class="num">${fmt(dD*0.19)}</td><td class="num">${fmt((pD+dD)*0.19)}</td></tr>
    <tr class="neto-row"><td>💰 Total Ventas − Gastos − IVA</td>
        <td class="num">${fmt(pNeto)}</td><td class="num">${fmt(dNeto)}</td><td class="num">${fmt(tNeto)}</td></tr>
  </tfoot>
</table>
<div class="footer">Heladería Los Espejos © ${new Date().getFullYear()} — Documento generado automáticamente</div>
</body></html>`;
}

// ── Exportar Excel ─────────────────────────────────────────────────────────
function exportExcel() {
    const month = document.getElementById('fr-month')?.value;
    if (!month || allRecords.length === 0) {
        showToast('⚠️ No hay registros para exportar', 'error');
        return;
    }

    const XLSX = window.XLSX;
    if (!XLSX) { showToast('❌ Librería Excel no disponible', 'error'); return; }

    const wb    = XLSX.utils.book_new();
    const label = monthLabel(month);

    // ── Hoja 1: Detalle ──────────────────────────────────────────────────
    const detHeaders = [
        'Fecha', 'Punto',
        'Ventas Transferencia', 'Ventas Efectivo', 'Total Ventas', 'Total Gastos',
        'Detalle Gastos',
        'Caja Contada', 'Diferencia Caja',
        'Facturación DIAN', 'IVA 19% DIAN',
        'Usuario', 'Última actualización'
    ];
    const detRows = allRecords.map(r => {
        const tv       = (r.ventasTransferencia || 0) + (r.ventasEfectivo || 0);
        const tg       = (r.gastos || []).reduce((s, g) => s + (g.monto || 0), 0);
        const esperado = (r.ventasEfectivo || 0) - tg;
        const cajaDiff = (r.efectivoEnCaja || 0) - esperado;
        const dianIva  = (r.facturacionDian || 0) * 0.19;
        const gd       = (r.gastos || []).map(g => `${g.descripcion}: $${g.monto}`).join(' | ') || 'Sin gastos';

        let cajaDiffTxt;
        if (cajaDiff === 0)    cajaDiffTxt = 'Cuadrado ($0)';
        else if (cajaDiff > 0) cajaDiffTxt = `Sobra $${cajaDiff}`;
        else                   cajaDiffTxt = `Falta $${Math.abs(cajaDiff)}`;

        return [
            r.fecha,
            r.punto === 'principal' ? 'Punto Principal' : 'Punto Domicilio',
            r.ventasTransferencia || 0,
            r.ventasEfectivo      || 0,
            tv, tg, gd,
            r.efectivoEnCaja  || 0,
            cajaDiffTxt,
            r.facturacionDian || 0,
            dianIva,
            r.usuario   || '—',
            r.updatedAt || '—'
        ];
    });

    const ws1 = XLSX.utils.aoa_to_sheet([detHeaders, ...detRows]);
    ws1['!cols'] = [
        {wch:12},{wch:18},{wch:22},{wch:16},
        {wch:14},{wch:14},{wch:42},
        {wch:14},{wch:20},
        {wch:18},{wch:14},
        {wch:30},{wch:22}
    ];
    XLSX.utils.book_append_sheet(wb, ws1, 'Detalle');

    // ── Hoja 2: Resumen ──────────────────────────────────────────────────
    const p = allRecords.filter(r => r.punto === 'principal');
    const d = allRecords.filter(r => r.punto === 'domicilio');
    const sumF = (arr, f) => arr.reduce((s, r) => s + (r[f] || 0), 0);
    const sumG = (arr)    => arr.reduce((s, r) =>
        s + (r.gastos || []).reduce((sg, g) => sg + (g.monto || 0), 0), 0);

    const pT = sumF(p,'ventasTransferencia'), pE = sumF(p,'ventasEfectivo');
    const pV = pT+pE, pG = sumG(p), pD = sumF(p,'facturacionDian');
    const pSub = pV-pG, pNeto = pV-pG-pD*0.19;
    const dT = sumF(d,'ventasTransferencia'), dE = sumF(d,'ventasEfectivo');
    const dV = dT+dE, dG = sumG(d), dD = sumF(d,'facturacionDian');
    const dSub = dV-dG, dNeto = dV-dG-dD*0.19;
    const tSub = (pV+dV)-(pG+dG), tNeto = (pV+dV)-(pG+dG)-(pD+dD)*0.19;

    const ws2 = XLSX.utils.aoa_to_sheet([
        [`Reporte Financiero — ${label}`, '', '', ''],
        [''],
        ['Concepto',                   'Punto Principal', 'Punto Domicilio', 'Total General'],
        ['Ventas Transferencia',         pT,                dT,                pT+dT],
        ['Ventas Efectivo',              pE,                dE,                pE+dE],
        ['Total Ventas',                 pV,                dV,                pV+dV],
        ['Total Gastos',                 pG,                dG,                pG+dG],
        ['Subtotal Ventas - Gastos',     pSub,              dSub,              tSub],
        [''],
        ['Facturación DIAN',             pD,                dD,                pD+dD],
        ['IVA 19% DIAN',                 pD*0.19,           dD*0.19,           (pD+dD)*0.19],
        [''],
        ['Total Ventas - Gastos - IVA',  pNeto,             dNeto,             tNeto],
    ]);
    ws2['!cols'] = [{wch:26},{wch:18},{wch:18},{wch:16}];
    XLSX.utils.book_append_sheet(wb, ws2, 'Resumen');

    XLSX.writeFile(wb, `reporte-financiero-${month}.xlsx`);
    showToast('📊 Excel descargado correctamente', 'success');
}

// ── Init ───────────────────────────────────────────────────────────────────
function init() {
    // Mes actual
    const now        = new Date();
    const monthVal   = now.toISOString().slice(0, 7);
    const monthInput = document.getElementById('fr-month');
    if (monthInput) {
        monthInput.value = monthVal;
        const lbl = document.getElementById('fr-month-label');
        if (lbl) lbl.textContent = monthLabel(monthVal);
    }

    // Formulario vacío con fecha de hoy
    clearForm();

    // Usuario autenticado
    onAuthStateChanged(auth, user => {
        currentUser = user;
        const userField = document.getElementById('fr-usuario');
        if (userField) userField.value = user?.email || 'desconocido';
    });

    // Cambio de mes
    document.getElementById('fr-month')?.addEventListener('change', () => {
        const val = document.getElementById('fr-month').value;
        const lbl = document.getElementById('fr-month-label');
        if (lbl) lbl.textContent = monthLabel(val);
        loadRecords();
    });

    // Agregar fila de gasto
    document.getElementById('fr-btn-add-gasto')?.addEventListener('click', () => {
        gastosItems.push({ descripcion: '', monto: 0 });
        renderGastos();
    });

    // Delegación de eventos: campos y borrar gastos
    const gastosList = document.getElementById('fr-gastos-list');
    gastosList?.addEventListener('input', e => {
        const i = parseInt(e.target.dataset.i);
        const f = e.target.dataset.f;
        if (!isNaN(i) && f && gastosItems[i] !== undefined) {
            gastosItems[i][f] = f === 'monto'
                ? (parseFloat(e.target.value) || 0)
                : e.target.value;
            if (f === 'monto') updateGastosTotal(); // también llama updateCajaAndDian
        }
    });
    gastosList?.addEventListener('click', e => {
        if (e.target.classList.contains('fr-gasto-delete')) {
            gastosItems.splice(parseInt(e.target.dataset.i), 1);
            renderGastos(); // también llama updateCajaAndDian
        }
    });

    // Campos que afectan el cuadre de caja y el IVA DIAN
    document.getElementById('fr-efectivo')?.addEventListener('input', updateCajaAndDian);
    document.getElementById('fr-caja')?.addEventListener('input', updateCajaAndDian);
    document.getElementById('fr-dian')?.addEventListener('input', updateCajaAndDian);

    // Guardar
    document.getElementById('fr-btn-save')?.addEventListener('click', saveEntry);

    // Limpiar / Cancelar edición
    document.getElementById('fr-btn-clear')?.addEventListener('click', clearForm);
    document.getElementById('fr-btn-cancel')?.addEventListener('click', clearForm);

    // Exportar
    document.getElementById('fr-btn-pdf')?.addEventListener('click', exportPDF);
    document.getElementById('fr-btn-excel')?.addEventListener('click', exportExcel);

    // Ocultar resumen del mes para el rol "reporter"
    if (window.currentUserRole === 'reporter') {
        const summarySection = document.getElementById('fr-summary-section');
        if (summarySection) summarySection.style.display = 'none';
    }

    // Cargar registros del mes actual
    loadRecords();
}

init();
