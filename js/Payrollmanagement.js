// =============================================
//  payrollManagement.js
//  Nómina colombiana - Ley 2466/2025 · SMMLV 2026
//  Firebase Firestore → colección "employees"
// =============================================

import { initializeApp, getApps } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js";
import { getFirestore, collection, getDocs }
    from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";

// =============================================
//  CONSTANTES LEGALES 2026
// =============================================
const LEGAL = {
    SMMLV:        1750905,
    AUX_TRANSP:   249095,
    HORAS_MES:    190.5,
    R_EXTRA_D:    0.25,
    R_EXTRA_N:    0.75,
    R_NOC_ORD:    0.35,
    R_DOM_D:      0.80,
    R_DOM_N:      1.15,
    R_EXTRA_DOM_D:1.05,
    R_EXTRA_DOM_N:1.55,
    PCT_SALUD:    0.04,
    PCT_PENSION:  0.04,
    TOPE_AUX:     2,
};

// =============================================
//  FIREBASE CONFIG
// =============================================
const firebaseConfig = {
    apiKey: "AIzaSyAFylb18Y4e1w7TAEoz3_toyCCHMy8s0xA",
    authDomain: "heladerialosespejos-c645e.firebaseapp.com",
    projectId: "heladerialosespejos-c645e",
    storageBucket: "heladerialosespejos-c645e.appspot.com",
    messagingSenderId: "144529838152",
    appId: "1:144529838152:web:8336516088534940ecc87d"
};

const app = getApps().length ? getApps()[0] : initializeApp(firebaseConfig);
const db  = getFirestore(app);

// =============================================
//  ESTADO
// =============================================
let firebaseEmployees = [];
let payrollData       = {};
let editingEmpId      = null;
let deletingEmpId     = null;
let emailingEmpId     = null;
let slipEmpId         = null; // empleado para desprendible individual

// =============================================
//  DOM
// =============================================
const tbody          = document.getElementById('employees-tbody');
const noEmployees    = document.getElementById('no-employees');
const payrollTable   = document.getElementById('payroll-table');
const periodInput    = document.getElementById('payroll-period');
const periodType     = document.getElementById('period-type');
const periodLabelDisplay = document.getElementById('period-label-display');
const customRangeWrapper = document.getElementById('custom-range-wrapper');

// Período por defecto = mes actual
const now = new Date();
periodInput.value = `${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}`;

// =============================================
//  PERÍODO — HELPERS
// =============================================
function getPeriodLabel() {
    const ym  = periodInput.value; // "2025-01"
    const type = periodType.value;
    if (!ym) return '—';

    const [year, month] = ym.split('-').map(Number);
    const monthNames = ['Enero','Febrero','Marzo','Abril','Mayo','Junio',
                        'Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre'];
    const mName = monthNames[month - 1];

    if (type === 'monthly')  return `${mName} ${year}`;
    if (type === 'first')    return `1ra Quincena ${mName} ${year} (1–15)`;
    if (type === 'second') {
        const lastDay = new Date(year, month, 0).getDate();
        return `2da Quincena ${mName} ${year} (16–${lastDay})`;
    }
    if (type === 'custom') {
        const s = document.getElementById('period-start').value;
        const e = document.getElementById('period-end').value;
        if (s && e) return `${fmtDate(s)} al ${fmtDate(e)}`;
        return 'Período personalizado';
    }
    return `${mName} ${year}`;
}

function getPeriodDates() {
    const ym   = periodInput.value;
    const type = periodType.value;
    if (!ym) return { start: '', end: '' };

    const [year, month] = ym.split('-').map(Number);
    const lastDay = new Date(year, month, 0).getDate();
    const pad = n => String(n).padStart(2,'0');

    if (type === 'monthly')  return { start: `${year}-${pad(month)}-01`, end: `${year}-${pad(month)}-${lastDay}` };
    if (type === 'first')    return { start: `${year}-${pad(month)}-01`, end: `${year}-${pad(month)}-15` };
    if (type === 'second')   return { start: `${year}-${pad(month)}-16`, end: `${year}-${pad(month)}-${lastDay}` };
    if (type === 'custom')   return {
        start: document.getElementById('period-start').value,
        end:   document.getElementById('period-end').value
    };
    return { start: '', end: '' };
}

function fmtDate(iso) {
    if (!iso) return '—';
    const [y, m, d] = iso.split('-');
    const months = ['ene','feb','mar','abr','may','jun','jul','ago','sep','oct','nov','dic'];
    return `${parseInt(d)} ${months[parseInt(m)-1]} ${y}`;
}

function updatePeriodLabel() {
    periodLabelDisplay.textContent = getPeriodLabel();
    customRangeWrapper.style.display = periodType.value === 'custom' ? 'flex' : 'none';
}

periodType.addEventListener('change', updatePeriodLabel);
periodInput.addEventListener('change', updatePeriodLabel);
document.getElementById('period-start').addEventListener('change', updatePeriodLabel);
document.getElementById('period-end').addEventListener('change', updatePeriodLabel);
updatePeriodLabel();

// =============================================
//  UTILIDADES
// =============================================
function fmt(n) {
    return '$' + Math.round(n||0).toLocaleString('es-CO');
}
function v(id) { return document.getElementById(id); }
function horaOrdinaria(salario) { return salario / LEGAL.HORAS_MES; }
function aplicaAuxTransporte(salario) { return salario <= LEGAL.SMMLV * LEGAL.TOPE_AUX; }

// =============================================
//  CARGA FIREBASE
// =============================================
async function loadEmployees() {
    noEmployees.textContent = 'Cargando empleados...';
    try {
        const snap = await getDocs(collection(db, 'employees'));
        firebaseEmployees = snap.docs.map(doc => ({
            id:     doc.id,
            name:   doc.data().name   || doc.id,
            salary: parseFloat(doc.data().salary) || 0
        }));
        if (firebaseEmployees.length === 0) {
            noEmployees.textContent = 'No hay empleados en Firebase.';
            return;
        }
        renderTable();
    } catch (err) {
        console.error('Error cargando empleados:', err);
        noEmployees.textContent = '❌ Error cargando empleados. Revisa la consola.';
    }
}

// =============================================
//  RENDER TABLA
// =============================================
function renderTable() {
    tbody.innerHTML = '';
    if (firebaseEmployees.length === 0) {
        noEmployees.style.display = 'block';
        payrollTable.style.display = 'none';
        return;
    }
    noEmployees.style.display = 'none';
    payrollTable.style.display = 'table';

    let sumBase = 0, sumAux = 0, sumExtras = 0, sumDev = 0, sumDed = 0, sumNeto = 0;

    firebaseEmployees.forEach(emp => {
        const liq = payrollData[emp.id];
        const tr  = document.createElement('tr');

        if (liq) {
            sumBase   += liq.salario;
            sumAux    += liq.auxTransporte;
            sumExtras += liq.totalExtrasRecargos;
            sumDev    += liq.totalDevengado;
            sumDed    += liq.totalDeducciones;
            sumNeto   += liq.netoAPagar;

            tr.innerHTML = `
                <td><strong>${emp.name}</strong></td>
                <td><span class="badge-cargo">${liq.cargo || '—'}</span></td>
                <td>${fmt(liq.salario)}</td>
                <td>${fmt(liq.auxTransporte)}</td>
                <td>${fmt(liq.totalExtrasRecargos)}</td>
                <td>${fmt(liq.totalDevengado)}</td>
                <td>${fmt(liq.totalDeducciones)}</td>
                <td class="total-cell">${fmt(liq.netoAPagar)}</td>
                <td>
                    <div class="action-btns">
                        <button class="action-btn btn-liquidar" data-id="${emp.id}">✏️ Editar</button>
                        <button class="action-btn btn-pdf"      data-id="${emp.id}" title="Descargar desprendible PDF">⬇️ PDF</button>
                        <button class="action-btn btn-email"    data-id="${emp.id}" title="Enviar por email">📧</button>
                        <button class="action-btn btn-del"      data-id="${emp.id}" title="Eliminar liquidación">🗑️</button>
                    </div>
                </td>`;
        } else {
            tr.innerHTML = `
                <td><strong>${emp.name}</strong></td>
                <td><span class="badge-cargo">—</span></td>
                <td>${fmt(emp.salary)}</td>
                <td>—</td><td>—</td><td>—</td><td>—</td>
                <td><span class="badge-pendiente">Pendiente</span></td>
                <td>
                    <div class="action-btns">
                        <button class="action-btn btn-liquidar" data-id="${emp.id}">💰 Liquidar</button>
                    </div>
                </td>`;
        }
        tbody.appendChild(tr);
    });

    // Eventos
    tbody.querySelectorAll('.btn-liquidar').forEach(btn =>
        btn.addEventListener('click', () => openLiquidarModal(btn.dataset.id)));
    tbody.querySelectorAll('.btn-del').forEach(btn =>
        btn.addEventListener('click', () => openDeletePopup(btn.dataset.id)));
    tbody.querySelectorAll('.btn-email').forEach(btn =>
        btn.addEventListener('click', () => openEmailPopupFor(btn.dataset.id)));
    tbody.querySelectorAll('.btn-pdf').forEach(btn =>
        btn.addEventListener('click', () => openSlipPreview(btn.dataset.id)));

    v('total-base').textContent        = fmt(sumBase);
    v('total-aux').textContent         = fmt(sumAux);
    v('total-extras').textContent      = fmt(sumExtras);
    v('total-devengado').textContent   = fmt(sumDev);
    v('total-deducciones').textContent = fmt(sumDed);
    v('total-pagar').textContent       = fmt(sumNeto);
}

// =============================================
//  MODAL LIQUIDACIÓN
// =============================================
function openLiquidarModal(empId) {
    editingEmpId = empId;
    const emp = firebaseEmployees.find(e => e.id === empId);
    if (!emp) return;
    const liq = payrollData[empId];

    v('liq-nombre').value    = emp.name;
    v('liq-cargo').value     = liq?.cargo || '';
    v('liq-salario').value   = liq?.salarioMensual ?? emp.salary;
    v('liq-h-ord').value     = liq?.hOrd     ?? 0;
    v('liq-h-extra-d').value = liq?.hExtraD  ?? 0;
    v('liq-h-extra-n').value = liq?.hExtraN  ?? 0;
    v('liq-h-noc-ord').value = liq?.hNocOrd  ?? 0;
    v('liq-h-dom-d').value   = liq?.hDomD    ?? 0;
    v('liq-h-dom-n').value   = liq?.hDomN    ?? 0;
    v('liq-h-ext-dom-d').value = liq?.hExtDomD ?? 0;
    v('liq-h-ext-dom-n').value = liq?.hExtDomN ?? 0;
    v('liq-bonos').value     = liq?.bonos    ?? 0;
    v('liq-otros-ing').value = liq?.otrosIng ?? 0;
    v('liq-email').value     = liq?.email    || '';
    v('liq-pct-salud').value   = liq?.pctSalud   ?? 4;
    v('liq-pct-pension').value = liq?.pctPension ?? 4;
    v('liq-otros-desc').value  = liq?.otrosDesc  ?? 0;
    v('liq-aux-transp').checked = liq ? liq.auxTransporte > 0 : aplicaAuxTransporte(emp.salary);

    updateAuxHint();
    updateInfoHoraOrd();
    resetResumen();
    v('liquidar-title').textContent = `💰 Liquidar: ${emp.name}`;
    document.getElementById('liquidar-modal').classList.add('active');
}

function updateAuxHint() {
    const salario = parseFloat(v('liq-salario').value) || 0;
    const aplica  = aplicaAuxTransporte(salario);
    v('aux-hint').textContent = aplica
        ? `Aplica (salario ≤ ${fmt(LEGAL.SMMLV * 2)})`
        : `No aplica (salario > ${fmt(LEGAL.SMMLV * 2)})`;
    if (!aplica) v('liq-aux-transp').checked = false;
}
function updateInfoHoraOrd() {
    const salario = parseFloat(v('liq-salario').value) || 0;
    const hora = horaOrdinaria(salario);
    const tipo = periodType.value;
    const hEsperadas = (tipo === 'first' || tipo === 'second') ? LEGAL.HORAS_MES / 2 : LEGAL.HORAS_MES;
    v('info-hora-ord').textContent = fmt(hora) + '/h · ' + hEsperadas + 'h esperadas en período';
}
v('liq-salario').addEventListener('input', () => { updateAuxHint(); updateInfoHoraOrd(); });
periodType.addEventListener('change', updateInfoHoraOrd);

function resetResumen() {
    ['r-salario','r-aux','r-ed','r-en','r-noc','r-dd','r-dn','r-xdd','r-xdn',
     'r-bonos','r-total-dev','r-salud','r-pension','r-otros-desc','r-total-ded','r-neto','r-hora-ord']
        .forEach(id => { if (v(id)) v(id).textContent = '—'; });
}

// --- Calcular ---
v('btn-calcular').addEventListener('click', calcular);
function calcular() {
    const salarioMensual = parseFloat(v('liq-salario').value)     || 0;
    const hOrd       = parseFloat(v('liq-h-ord').value)       || 0;
    const hExtraD    = parseFloat(v('liq-h-extra-d').value)   || 0;
    const hExtraN    = parseFloat(v('liq-h-extra-n').value)   || 0;
    const hNocOrd    = parseFloat(v('liq-h-noc-ord').value)   || 0;
    const hDomD      = parseFloat(v('liq-h-dom-d').value)     || 0;
    const hDomN      = parseFloat(v('liq-h-dom-n').value)     || 0;
    const hExtDomD   = parseFloat(v('liq-h-ext-dom-d').value) || 0;
    const hExtDomN   = parseFloat(v('liq-h-ext-dom-n').value) || 0;
    const bonos      = parseFloat(v('liq-bonos').value)       || 0;
    const otrosIng   = parseFloat(v('liq-otros-ing').value)   || 0;
    const pctSalud   = parseFloat(v('liq-pct-salud').value)   / 100 || LEGAL.PCT_SALUD;
    const pctPension = parseFloat(v('liq-pct-pension').value) / 100 || LEGAL.PCT_PENSION;
    const otrosDesc  = parseFloat(v('liq-otros-desc').value)  || 0;
    const conAux     = v('liq-aux-transp').checked;

    // Hora ordinaria siempre se calcula sobre el salario mensual completo
    const hora = horaOrdinaria(salarioMensual);

    // ── SALARIO POR HORAS ORDINARIAS TRABAJADAS ──────────────────────────
    // Se paga exactamente lo que se trabaja: horas_trabajadas × valor_hora
    const salarioPorHoras = hOrd * hora;

    // ── RECARGOS Y EXTRAS ────────────────────────────────────────────────
    // Cada tipo paga: hora_base × (1 + recargo)  →  el empleado recibe la
    // hora completa MÁS el recargo, no solo el plus.
    const valExtraD  = hExtraD  * hora * (1 + LEGAL.R_EXTRA_D);   // hora × 1.25
    const valExtraN  = hExtraN  * hora * (1 + LEGAL.R_EXTRA_N);   // hora × 1.75
    const valNocOrd  = hNocOrd  * hora * (1 + LEGAL.R_NOC_ORD);   // hora × 1.35  (horas nocturnas ordinarias: ya dentro de la jornada, solo se paga el recargo sobre ellas)
    const valDomD    = hDomD    * hora * (1 + LEGAL.R_DOM_D);     // hora × 1.80
    const valDomN    = hDomN    * hora * (1 + LEGAL.R_DOM_N);     // hora × 2.15
    const valExtDomD = hExtDomD * hora * (1 + LEGAL.R_EXTRA_DOM_D); // hora × 2.05
    const valExtDomN = hExtDomN * hora * (1 + LEGAL.R_EXTRA_DOM_N); // hora × 2.55

    // ── AUXILIO DE TRANSPORTE ────────────────────────────────────────────
    // Para quincenas se paga la mitad proporcional; mensual = valor completo.
    // Si el período es personalizado o mensual → completo.
    // 1ra o 2da quincena → mitad.
    const periodTipo = periodType.value;
    let auxFactor = 1;
    if (periodTipo === 'first' || periodTipo === 'second') auxFactor = 0.5;
    const auxTransporte = conAux ? Math.round(LEGAL.AUX_TRANSP * auxFactor) : 0;

    // ── TOTALES ──────────────────────────────────────────────────────────
    const totalExtrasRecargos = valExtraD + valExtraN + valNocOrd + valDomD + valDomN + valExtDomD + valExtDomN;

    // Salario devengado = horas ordinarias + recargos/extras + bonos/otros + aux (no deducible)
    const salarioDevengado   = salarioPorHoras + totalExtrasRecargos + bonos + otrosIng;
    const totalDevengado     = salarioDevengado + auxTransporte;

    // Deducciones: se calculan sobre salario devengado SIN aux. transporte (art. 127 CST)
    const baseDeduccion  = salarioDevengado;
    const deducSalud     = baseDeduccion * pctSalud;
    const deducPension   = baseDeduccion * pctPension;
    const totalDeducciones = deducSalud + deducPension + otrosDesc;

    const netoAPagar = totalDevengado - totalDeducciones;

    // ── INFO ADICIONAL ───────────────────────────────────────────────────
    const totalHoras = hOrd + hExtraD + hExtraN + hNocOrd + hDomD + hDomN + hExtDomD + hExtDomN;
    const horasEsperadasPeriodo = periodTipo === 'first' || periodTipo === 'second'
        ? LEGAL.HORAS_MES / 2
        : LEGAL.HORAS_MES;

    // ── ACTUALIZAR RESUMEN VISUAL ────────────────────────────────────────
    v('r-salario').textContent   = fmt(salarioPorHoras) + ` (${hOrd}h × ${fmt(hora)})`;
    v('r-aux').textContent       = fmt(auxTransporte);
    v('r-ed').textContent        = hExtraD  > 0 ? fmt(valExtraD)  + ` (${hExtraD}h)` : '—';
    v('r-en').textContent        = hExtraN  > 0 ? fmt(valExtraN)  + ` (${hExtraN}h)` : '—';
    v('r-noc').textContent       = hNocOrd  > 0 ? fmt(valNocOrd)  + ` (${hNocOrd}h)` : '—';
    v('r-dd').textContent        = hDomD    > 0 ? fmt(valDomD)    + ` (${hDomD}h)` : '—';
    v('r-dn').textContent        = hDomN    > 0 ? fmt(valDomN)    + ` (${hDomN}h)` : '—';
    v('r-xdd').textContent       = hExtDomD > 0 ? fmt(valExtDomD) + ` (${hExtDomD}h)` : '—';
    v('r-xdn').textContent       = hExtDomN > 0 ? fmt(valExtDomN) + ` (${hExtDomN}h)` : '—';
    v('r-bonos').textContent     = fmt(bonos + otrosIng);
    v('r-total-dev').textContent = fmt(totalDevengado);
    v('r-label-salud').textContent   = `Salud (${(pctSalud*100).toFixed(1)}%)`;
    v('r-label-pension').textContent = `Pensión (${(pctPension*100).toFixed(1)}%)`;
    v('r-salud').textContent         = fmt(deducSalud);
    v('r-pension').textContent       = fmt(deducPension);
    v('r-otros-desc').textContent    = fmt(otrosDesc);
    v('r-total-ded').textContent     = fmt(totalDeducciones);
    v('r-neto').textContent          = fmt(netoAPagar);
    v('r-hora-ord').textContent      = fmt(hora) + '/h';

    // Advertencia si horas bajas
    const pct = totalHoras / horasEsperadasPeriodo;
    if (pct < 0.95 && totalHoras > 0) {
        const msg = `⚠️ ${totalHoras}h trabajadas de ${horasEsperadasPeriodo}h esperadas (${Math.round(pct*100)}%)`;
        v('r-salario').title = msg;
    }

    window._liqResult = {
        salarioMensual,           // salario base mensual (referencia)
        salario: salarioPorHoras, // lo que se paga en este período
        hOrd, hExtraD, hExtraN, hNocOrd, hDomD, hDomN, hExtDomD, hExtDomN,
        bonos, otrosIng, pctSalud: pctSalud*100, pctPension: pctPension*100, otrosDesc,
        auxTransporte, auxFactor, totalExtrasRecargos, totalDevengado, totalDeducciones,
        netoAPagar, deducSalud, deducPension, salarioDevengado,
        valExtraD, valExtraN, valNocOrd, valDomD, valDomN, valExtDomD, valExtDomN,
        horaOrdinaria: hora,
        periodTipo,
        cargo: v('liq-cargo').value.trim(),
        email: v('liq-email').value.trim()
    };
}

v('btn-guardar-liq').addEventListener('click', () => {
    if (!window._liqResult) {
        alert('Primero haz clic en "🔄 Calcular" para generar la liquidación.');
        return;
    }
    payrollData[editingEmpId] = { ...window._liqResult };
    window._liqResult = null;
    document.getElementById('liquidar-modal').classList.remove('active');
    renderTable();
});

v('btn-cancelar-liq').addEventListener('click', () => {
    document.getElementById('liquidar-modal').classList.remove('active');
    window._liqResult = null;
    editingEmpId = null;
});

// =============================================
//  ELIMINAR
// =============================================
function openDeletePopup(empId) {
    deletingEmpId = empId;
    document.getElementById('delete-popup').classList.add('active');
}
v('confirm-delete').addEventListener('click', () => {
    if (deletingEmpId) { delete payrollData[deletingEmpId]; deletingEmpId = null; renderTable(); }
    document.getElementById('delete-popup').classList.remove('active');
});
v('dismiss-delete').addEventListener('click', () => {
    document.getElementById('delete-popup').classList.remove('active');
    deletingEmpId = null;
});

// =============================================
//  DESPRENDIBLE INDIVIDUAL (PDF Preview)
// =============================================
function openSlipPreview(empId) {
    const emp = firebaseEmployees.find(e => e.id === empId);
    const liq = payrollData[empId];
    if (!liq) { alert('Este empleado no tiene liquidación aún.'); return; }

    slipEmpId = empId;
    v('slip-preview-title').textContent = `📄 Desprendible – ${emp.name}`;
    v('slip-preview-content').innerHTML = buildSlipHTML(emp, liq);
    document.getElementById('slip-preview-popup').classList.add('active');
}

v('dismiss-slip').addEventListener('click', () => {
    document.getElementById('slip-preview-popup').classList.remove('active');
    slipEmpId = null;
});

v('btn-download-slip').addEventListener('click', () => {
    const emp = firebaseEmployees.find(e => e.id === slipEmpId);
    const liq = payrollData[slipEmpId];
    if (!emp || !liq) return;
    printSlip(emp, liq);
});

v('btn-email-slip').addEventListener('click', () => {
    document.getElementById('slip-preview-popup').classList.remove('active');
    openEmailPopupFor(slipEmpId);
});

function buildSlipHTML(emp, liq) {
    const period = getPeriodLabel();
    const dates  = getPeriodDates();
    const hora   = liq.horaOrdinaria || horaOrdinaria(liq.salarioMensual || liq.salario);

    const horasRows = [
        liq.hOrd     > 0 ? `<tr><td>Horas Ordinarias</td><td class="num">${liq.hOrd} h</td><td class="num">${fmt(hora)}/h</td><td class="num">${fmt(liq.hOrd * hora)}</td></tr>` : '',
        liq.hExtraD  > 0 ? `<tr class="extra-row"><td>Extras Diurnas (+25%)</td><td class="num">${liq.hExtraD} h</td><td class="num">${fmt(hora * 1.25)}/h</td><td class="num">${fmt(liq.valExtraD || liq.hExtraD * hora * LEGAL.R_EXTRA_D)}</td></tr>` : '',
        liq.hExtraN  > 0 ? `<tr class="extra-row"><td>Extras Nocturnas (+75%)</td><td class="num">${liq.hExtraN} h</td><td class="num">${fmt(hora * 1.75)}/h</td><td class="num">${fmt(liq.valExtraN || liq.hExtraN * hora * LEGAL.R_EXTRA_N)}</td></tr>` : '',
        liq.hNocOrd  > 0 ? `<tr class="extra-row"><td>Recargo Nocturno Ord. (+35%)</td><td class="num">${liq.hNocOrd} h</td><td class="num">${fmt(hora * 0.35)}/h</td><td class="num">${fmt(liq.valNocOrd || liq.hNocOrd * hora * LEGAL.R_NOC_ORD)}</td></tr>` : '',
        liq.hDomD    > 0 ? `<tr class="extra-row"><td>Dominical/Festivo Diurno (+80%)</td><td class="num">${liq.hDomD} h</td><td class="num">${fmt(hora * 1.80)}/h</td><td class="num">${fmt(liq.valDomD || liq.hDomD * hora * LEGAL.R_DOM_D)}</td></tr>` : '',
        liq.hDomN    > 0 ? `<tr class="extra-row"><td>Dominical/Festivo Nocturno (+115%)</td><td class="num">${liq.hDomN} h</td><td class="num">${fmt(hora * 2.15)}/h</td><td class="num">${fmt(liq.valDomN || liq.hDomN * hora * LEGAL.R_DOM_N)}</td></tr>` : '',
        liq.hExtDomD > 0 ? `<tr class="extra-row"><td>Extra Dominical Diurna (+105%)</td><td class="num">${liq.hExtDomD} h</td><td class="num">${fmt(hora * 2.05)}/h</td><td class="num">${fmt(liq.valExtDomD || liq.hExtDomD * hora * LEGAL.R_EXTRA_DOM_D)}</td></tr>` : '',
        liq.hExtDomN > 0 ? `<tr class="extra-row"><td>Extra Dominical Nocturna (+155%)</td><td class="num">${liq.hExtDomN} h</td><td class="num">${fmt(hora * 2.55)}/h</td><td class="num">${fmt(liq.valExtDomN || liq.hExtDomN * hora * LEGAL.R_EXTRA_DOM_N)}</td></tr>` : '',
    ].filter(Boolean).join('');

    const dateRange = (dates.start && dates.end)
        ? `${fmtDate(dates.start)} al ${fmtDate(dates.end)}`
        : period;

    return `
    <style>
        .slip-logo {
            width: 60px;
            height: 60px;
        }
        .slip-logo-img {
            width: 40px;
        }
    </style>
    <div class="slip-wrap">
        <!-- ENCABEZADO -->
        <div class="slip-header">
            <div class="slip-logo-area">
                <div class="slip-logo">
                    <img src="images/logo.png" alt="Logo" class="slip-logo-img">
                </div>
                <div>
                    <div class="slip-company">Los Espejos Heladería</div>
                    <div class="slip-subtitle">NIT: 900.123.456-7 · Medellín, Colombia</div>
                </div>
            </div>
            <div class="slip-meta">
                <div class="slip-meta-item"><span>Documento</span><strong>DESPRENDIBLE DE NÓMINA</strong></div>
                <div class="slip-meta-item"><span>Período</span><strong>${period}</strong></div>
                <div class="slip-meta-item"><span>Fechas</span><strong>${dateRange}</strong></div>
                <div class="slip-meta-item"><span>Generado</span><strong>${new Date().toLocaleDateString('es-CO')}</strong></div>
            </div>
        </div>

        <!-- DATOS EMPLEADO -->
        <div class="slip-emp-bar">
            <div class="slip-emp-block"><label>EMPLEADO</label><strong>${emp.name}</strong></div>
            <div class="slip-emp-block"><label>CARGO</label><strong>${liq.cargo || '—'}</strong></div>
            <div class="slip-emp-block"><label>SALARIO MENSUAL</label><strong>${fmt(liq.salarioMensual || liq.salario)}</strong></div>
            <div class="slip-emp-block"><label>HORA ORDINARIA</label><strong>${fmt(hora)}/h</strong></div>
            <div class="slip-emp-block"><label>JORNADA</label><strong>44 h/sem · 190.5 h/mes</strong></div>
        </div>

        <!-- CUERPO EN 2 COLUMNAS -->
        <div class="slip-body">

            <!-- DEVENGADO -->
            <div class="slip-section">
                <div class="slip-section-title devengado-title">📥 DEVENGADO</div>
                <table class="slip-table">
                    <thead>
                        <tr><th>Concepto</th><th class="num">Cantidad</th><th class="num">Tarifa</th><th class="num">Valor</th></tr>
                    </thead>
                    <tbody>
                        ${horasRows}
                        ${liq.bonos > 0 ? `<tr><td>Bonos / Comisiones</td><td class="num">—</td><td class="num">—</td><td class="num">${fmt(liq.bonos)}</td></tr>` : ''}
                        ${liq.otrosIng > 0 ? `<tr><td>Otros Ingresos</td><td class="num">—</td><td class="num">—</td><td class="num">${fmt(liq.otrosIng)}</td></tr>` : ''}
                        <tr class="subtotal-row">
                            <td colspan="3">Subtotal Horas y Recargos</td>
                            <td class="num">${fmt(liq.totalExtrasRecargos + liq.salario)}</td>
                        </tr>
                        ${liq.auxTransporte > 0 ? `<tr class="aux-row"><td colspan="3">Auxilio de Transporte (no deducible)</td><td class="num">${fmt(liq.auxTransporte)}</td></tr>` : ''}
                    </tbody>
                    <tfoot>
                        <tr><td colspan="3"><strong>TOTAL DEVENGADO</strong></td><td class="num"><strong>${fmt(liq.totalDevengado)}</strong></td></tr>
                    </tfoot>
                </table>
            </div>

            <!-- DEDUCCIONES -->
            <div class="slip-section">
                <div class="slip-section-title deducciones-title">📤 DEDUCCIONES</div>
                <table class="slip-table">
                    <thead>
                        <tr><th>Concepto</th><th class="num">Base</th><th class="num">%</th><th class="num">Valor</th></tr>
                    </thead>
                    <tbody>
                        <tr>
                            <td>Salud Empleado</td>
                            <td class="num">${fmt(liq.salario + liq.totalExtrasRecargos + liq.bonos + liq.otrosIng)}</td>
                            <td class="num">${liq.pctSalud}%</td>
                            <td class="num">${fmt(liq.deducSalud)}</td>
                        </tr>
                        <tr>
                            <td>Pensión Empleado</td>
                            <td class="num">${fmt(liq.salario + liq.totalExtrasRecargos + liq.bonos + liq.otrosIng)}</td>
                            <td class="num">${liq.pctPension}%</td>
                            <td class="num">${fmt(liq.deducPension)}</td>
                        </tr>
                        ${liq.otrosDesc > 0 ? `<tr><td>Otros Descuentos</td><td class="num">—</td><td class="num">—</td><td class="num">${fmt(liq.otrosDesc)}</td></tr>` : ''}
                    </tbody>
                    <tfoot>
                        <tr><td colspan="3"><strong>TOTAL DEDUCCIONES</strong></td><td class="num"><strong>${fmt(liq.totalDeducciones)}</strong></td></tr>
                    </tfoot>
                </table>

                <!-- NETO A PAGAR -->
                <div class="slip-neto-box">
                    <div class="slip-neto-label">💵 NETO A PAGAR</div>
                    <div class="slip-neto-value">${fmt(liq.netoAPagar)}</div>
                    <div class="slip-neto-sub">
                        Devengado ${fmt(liq.totalDevengado)} − Deducciones ${fmt(liq.totalDeducciones)}
                    </div>
                </div>

                <!-- INFO LEGAL -->
                <div class="slip-legal">
                    <strong>Marco Legal:</strong> Ley 2466/2025 · Decreto 2953/2025<br>
                    SMMLV 2026: $1.750.905 · Aux. Transporte: $249.095<br>
                    Salud empleador: 8.5% · Pensión empleador: 12%
                </div>
            </div>
        </div>

        <!-- FIRMA -->
        <div class="slip-firmas">
            <div class="slip-firma-block">
                <div class="slip-firma-line"></div>
                <div>Firma Empleado</div>
                <div class="slip-firma-name">${emp.name}</div>
            </div>
            <div class="slip-firma-block">
                <div class="slip-firma-line"></div>
                <div>Firma Empleador</div>
                <div class="slip-firma-name">Los Espejos Heladería</div>
            </div>
            <div class="slip-firma-block">
                <div class="slip-firma-line"></div>
                <div>Fecha de Recibido</div>
                <div class="slip-firma-name">&nbsp;</div>
            </div>
        </div>
    </div>`;
}

// =============================================
//  IMPRIMIR / DESCARGAR DESPRENDIBLE INDIVIDUAL
// =============================================
function printSlip(emp, liq) {
    const period = getPeriodLabel();
    const slipHTML = buildSlipHTML(emp, liq);

    const win = window.open('', '_blank', 'width=900,height=700');
    win.document.write(`<!DOCTYPE html>
<html lang="es"><head>
<meta charset="UTF-8">
<title>Desprendible ${emp.name} – ${period}</title>
<style>
    @import url('https://fonts.googleapis.com/css2?family=IBM+Plex+Sans:wght@400;500;600;700&display=swap');
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { font-family: 'IBM Plex Sans', Arial, sans-serif; font-size: 11px; color: #1a1a2e; background: white; padding: 24px; }

    .slip-wrap { max-width: 800px; margin: 0 auto; border: 2px solid #194073; border-radius: 8px; overflow: hidden; }

    /* Header */
    .slip-header { background: #194073; color: white; padding: 16px 20px; display: flex; justify-content: space-between; align-items: flex-start; gap: 20px; }
    .slip-logo-area { display: flex; align-items: center; gap: 12px; }
    .slip-logo { font-size: 36px; }
    .slip-company { font-size: 18px; font-weight: 700; letter-spacing: -0.3px; }
    .slip-subtitle { font-size: 11px; opacity: 0.75; margin-top: 3px; }
    .slip-meta { display: flex; flex-direction: column; gap: 4px; text-align: right; }
    .slip-meta-item { display: flex; gap: 8px; justify-content: flex-end; font-size: 10px; }
    .slip-meta-item span { opacity: 0.7; }
    .slip-meta-item strong { font-weight: 600; }

    /* Empleado bar */
    .slip-emp-bar { background: #e8f0fe; padding: 10px 20px; display: flex; gap: 16px; flex-wrap: wrap; border-bottom: 1px solid #c5d8ff; }
    .slip-emp-block { display: flex; flex-direction: column; gap: 1px; min-width: 110px; }
    .slip-emp-block label { font-size: 9px; font-weight: 700; color: #194073; text-transform: uppercase; letter-spacing: 0.6px; }
    .slip-emp-block strong { font-size: 11px; color: #1a1a2e; }

    /* Body */
    .slip-body { display: grid; grid-template-columns: 1.1fr 0.9fr; gap: 0; }
    .slip-section { padding: 14px 16px; border-right: 1px solid #e0e0e0; }
    .slip-section:last-child { border-right: none; }
    .slip-section-title { font-size: 10px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.8px; padding: 5px 8px; border-radius: 4px; margin-bottom: 8px; }
    .devengado-title { background: #e8f5e9; color: #2e7d32; }
    .deducciones-title { background: #fce4ec; color: #c62828; }

    /* Tablas */
    .slip-table { width: 100%; border-collapse: collapse; font-size: 10px; margin-bottom: 10px; }
    .slip-table thead th { background: #f5f5f5; padding: 5px 6px; text-align: left; font-weight: 600; font-size: 9px; text-transform: uppercase; letter-spacing: 0.4px; border-bottom: 1px solid #ddd; }
    .slip-table tbody td { padding: 4px 6px; border-bottom: 1px solid #f0f0f0; }
    .slip-table tfoot td { padding: 6px 6px; font-weight: 700; background: #f0f5ff; border-top: 2px solid #194073; color: #194073; }
    .slip-table .num { text-align: right; font-variant-numeric: tabular-nums; }
    .slip-table .extra-row td { color: #1565c0; }
    .slip-table .subtotal-row td { background: #f9f9f9; font-weight: 600; }
    .slip-table .aux-row td { color: #388e3c; font-style: italic; }

    /* Neto */
    .slip-neto-box { background: #194073; color: white; border-radius: 6px; padding: 12px 14px; margin: 10px 0; text-align: center; }
    .slip-neto-label { font-size: 10px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.8px; opacity: 0.8; }
    .slip-neto-value { font-size: 22px; font-weight: 700; letter-spacing: -0.5px; margin: 4px 0; }
    .slip-neto-sub { font-size: 9px; opacity: 0.7; }

    /* Legal */
    .slip-legal { background: #f5f5f5; border-radius: 4px; padding: 8px 10px; font-size: 9px; color: #666; line-height: 1.6; }

    /* Firmas */
    .slip-firmas { display: flex; justify-content: space-around; padding: 18px 20px 14px; border-top: 1px solid #e0e0e0; background: #fafafa; gap: 20px; }
    .slip-firma-block { text-align: center; flex: 1; font-size: 10px; color: #555; }
    .slip-firma-line { border-top: 1px solid #333; margin: 0 10px 5px; }
    .slip-firma-name { font-weight: 600; color: #194073; margin-top: 2px; font-size: 10px; }

    @media print {
        body { padding: 0; }
        .slip-wrap { border: 1px solid #194073; }
    }
</style>
</head><body>${slipHTML}</body></html>`);
    win.document.close();
    win.focus();
    setTimeout(() => { win.print(); win.close(); }, 500);
}

// =============================================
//  EMAIL
// =============================================
function openEmailPopupFor(empId) {
    emailingEmpId = empId;
    const emp = firebaseEmployees.find(e => e.id === empId);
    const liq = payrollData[empId];
    v('email-popup-desc').textContent = `Desprendible de nómina: ${emp?.name || ''}`;
    v('email-recipient').value = liq?.email || '';
    document.getElementById('email-popup').classList.add('active');
}

v('dismiss-email').addEventListener('click', () => {
    document.getElementById('email-popup').classList.remove('active');
    emailingEmpId = null;
});

v('confirm-email').addEventListener('click', () => {
    const to = v('email-recipient').value.trim();
    if (!to || !to.includes('@')) { alert('Ingresa un email válido.'); return; }
    const period  = getPeriodLabel();
    const subject = `Desprendible de nómina ${period} - Los Espejos Heladería`;
    let body;
    if (emailingEmpId) {
        const emp = firebaseEmployees.find(e => e.id === emailingEmpId);
        const liq = payrollData[emailingEmpId];
        body = liq ? buildBodySingle(emp, liq, period) : `Nómina de ${emp?.name} - sin liquidar aún.`;
    } else {
        body = buildBodyAll(period);
    }
    window.open(`mailto:${encodeURIComponent(to)}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`, '_blank');
    document.getElementById('email-popup').classList.remove('active');
    emailingEmpId = null;
});

function buildBodySingle(emp, liq, period) {
    const hora = liq.horaOrdinaria || horaOrdinaria(liq.salarioMensual || liq.salario);
    return [
        `DESPRENDIBLE DE NÓMINA`,
        `Los Espejos Heladería`,
        `Período: ${period}`,
        ``,
        `Empleado:         ${emp.name}`,
        `Cargo:            ${liq.cargo || '—'}`,
        ``,
        `── DEVENGADO ──────────────────────`,
        `Salario Base:     ${fmt(liq.salario)}`,
        `Aux. Transporte:  ${fmt(liq.auxTransporte)}`,
        liq.hExtraD  > 0 ? `Extras diurnas:   ${fmt(liq.hExtraD * hora * LEGAL.R_EXTRA_D)}` : '',
        liq.hExtraN  > 0 ? `Extras nocturnas: ${fmt(liq.hExtraN * hora * LEGAL.R_EXTRA_N)}` : '',
        liq.hNocOrd  > 0 ? `Recargo nocturno: ${fmt(liq.hNocOrd * hora * LEGAL.R_NOC_ORD)}` : '',
        liq.hDomD    > 0 ? `Dominical diurno: ${fmt(liq.hDomD   * hora * LEGAL.R_DOM_D)}` : '',
        liq.hDomN    > 0 ? `Dom. nocturno:    ${fmt(liq.hDomN   * hora * LEGAL.R_DOM_N)}` : '',
        liq.bonos + liq.otrosIng > 0 ? `Bonos / otros:    ${fmt(liq.bonos + liq.otrosIng)}` : '',
        `Total Devengado:  ${fmt(liq.totalDevengado)}`,
        ``,
        `── DEDUCCIONES ─────────────────────`,
        `Salud (${liq.pctSalud}%):      ${fmt(liq.deducSalud)}`,
        `Pensión (${liq.pctPension}%):  ${fmt(liq.deducPension)}`,
        liq.otrosDesc > 0 ? `Otros descuentos: ${fmt(liq.otrosDesc)}` : '',
        `Total Deducciones:${fmt(liq.totalDeducciones)}`,
        ``,
        `────────────────────────────────────`,
        `NETO A PAGAR:     ${fmt(liq.netoAPagar)}`,
        ``,
        `Ley 2466/2025 | SMMLV 2026: $1.750.905`,
        `Gracias por tu trabajo!`
    ].filter(l => l !== '').join('\n');
}

function buildBodyAll(period) {
    let txt = `NÓMINA GENERAL - ${period}\nLos Espejos Heladería\n${'─'.repeat(40)}\n\n`;
    let grandTotal = 0;
    firebaseEmployees.forEach(emp => {
        const liq = payrollData[emp.id];
        if (liq) {
            txt += `${emp.name} (${liq.cargo || '—'})\n`;
            txt += `  Devengado: ${fmt(liq.totalDevengado)} | Deducciones: ${fmt(liq.totalDeducciones)}\n`;
            txt += `  NETO: ${fmt(liq.netoAPagar)}\n\n`;
            grandTotal += liq.netoAPagar;
        } else {
            txt += `${emp.name} — Pendiente de liquidar\n\n`;
        }
    });
    txt += `${'─'.repeat(40)}\nTOTAL NETO NÓMINA: ${fmt(grandTotal)}`;
    return txt;
}

// =============================================
//  GENERAR NÓMINA GENERAL / PDF
// =============================================
v('btn-generate-payroll').addEventListener('click', () => {
    const liquidados = firebaseEmployees.filter(e => payrollData[e.id]);
    if (liquidados.length === 0) { alert('No hay empleados liquidados aún.'); return; }
    v('payroll-preview-content').innerHTML = buildPreviewHTML();
    document.getElementById('payroll-preview-popup').classList.add('active');
});

v('dismiss-preview').addEventListener('click', () =>
    document.getElementById('payroll-preview-popup').classList.remove('active'));

v('btn-download-pdf').addEventListener('click', () => {
    const period = getPeriodLabel();
    const dates  = getPeriodDates();
    const win = window.open('', '_blank', 'width=1000,height=700');
    win.document.write(`<!DOCTYPE html><html><head><meta charset="UTF-8">
        <title>Nómina ${period} - Los Espejos</title>
        <style>
            body{font-family:Arial,sans-serif;padding:30px;color:#333;font-size:13px}
            h2{color:#194073;margin:0 0 4px} p{font-size:12px;color:#666;margin:0}
            table{width:100%;border-collapse:collapse;margin-top:14px;font-size:12px}
            thead th{background:#194073;color:white;padding:9px;text-align:left}
            tbody td{padding:8px 9px;border-bottom:1px solid #eee}
            tfoot td{padding:9px;font-weight:bold;color:#194073;background:#f0f5ff;border-top:2px solid #194073}
        </style></head><body>${v('payroll-preview-content').innerHTML}</body></html>`);
    win.document.close();
    win.focus();
    setTimeout(() => { win.print(); win.close(); }, 400);
});

v('btn-email-all').addEventListener('click', () => {
    document.getElementById('payroll-preview-popup').classList.remove('active');
    emailingEmpId = null;
    v('email-popup-desc').textContent = 'Se enviará la nómina completa del período.';
    v('email-recipient').value = '';
    document.getElementById('email-popup').classList.add('active');
});

function buildPreviewHTML() {
    const period = getPeriodLabel();
    const dates  = getPeriodDates();
    const dateRange = (dates.start && dates.end)
        ? `${fmtDate(dates.start)} al ${fmtDate(dates.end)}`
        : period;

    let grandNeto = 0, grandDev = 0, grandDed = 0;

    const rows = firebaseEmployees.map(emp => {
        const liq = payrollData[emp.id];
        if (!liq) return `
            <tr>
                <td>${emp.name}</td>
                <td colspan="7" style="color:#999;font-style:italic;">Pendiente de liquidar</td>
            </tr>`;
        grandNeto += liq.netoAPagar;
        grandDev  += liq.totalDevengado;
        grandDed  += liq.totalDeducciones;
        return `
            <tr>
                <td><strong>${emp.name}</strong></td>
                <td>${liq.cargo || '—'}</td>
                <td>${fmt(liq.salario)}</td>
                <td>${fmt(liq.auxTransporte)}</td>
                <td>${fmt(liq.totalExtrasRecargos)}</td>
                <td>${fmt(liq.totalDevengado)}</td>
                <td>${fmt(liq.totalDeducciones)}</td>
                <td><strong>${fmt(liq.netoAPagar)}</strong></td>
            </tr>`;
    }).join('');

    return `
    <div class="payroll-preview">
        <div class="preview-header">
            <div>
                <h2>🍦 Los Espejos Heladería</h2>
                <p>Nómina del período: <strong>${period}</strong></p>
                <p>Fechas: <strong>${dateRange}</strong></p>
                <p style="margin-top:4px;font-size:11px;color:#aaa;">Ley 2466/2025 · SMMLV 2026: $1.750.905 · Aux. Transporte: $249.095</p>
            </div>
            <div style="text-align:right;font-size:12px;color:#888;">
                Generado: ${new Date().toLocaleDateString('es-CO')}
            </div>
        </div>
        <table class="preview-table">
            <thead>
                <tr>
                    <th>Empleado</th><th>Cargo</th><th>Salario Base</th>
                    <th>Aux. Transp.</th><th>Extras/Recargos</th>
                    <th>Devengado</th><th>Deducciones</th><th>Neto a Pagar</th>
                </tr>
            </thead>
            <tbody>${rows}</tbody>
            <tfoot>
                <tr>
                    <td colspan="5">TOTALES</td>
                    <td>${fmt(grandDev)}</td>
                    <td>${fmt(grandDed)}</td>
                    <td>${fmt(grandNeto)}</td>
                </tr>
            </tfoot>
        </table>
    </div>`;
}

// Cerrar modales al click fuera
['liquidar-modal','delete-popup','email-popup','payroll-preview-popup','slip-preview-popup'].forEach(id => {
    document.getElementById(id).addEventListener('click', e => {
        if (e.target === document.getElementById(id))
            document.getElementById(id).classList.remove('active');
    });
});

// =============================================
//  INIT
// =============================================
loadEmployees();