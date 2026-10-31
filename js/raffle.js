import { app } from "./firebase.js";
import { getFunctions, httpsCallable } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-functions.js";

// Toda la rifa pasa por Cloud Functions (raffle.ts): el servidor verifica que quien
// vende sea personal del dashboard, escoge los números (nunca repite uno vendido),
// toma el vendedor del token y la hora del servidor. Las reglas de Firestore no
// dejan leer ni escribir las colecciones de la rifa directamente.
const functions       = getFunctions(app, 'us-central1');
const sellFn          = httpsCallable(functions, 'sellRaffleTickets');
const searchByPhoneFn = httpsCallable(functions, 'searchRaffleByPhone');
const listSalesFn     = httpsCallable(functions, 'listRaffleSales');

const PHONE_DIGITS         = 10;
const HISTORY_PAGE_SIZE    = 50;
const MANY_TICKETS_ALERT   = 9;     // alerta (solo admin): un celular con esta cantidad o más
const WATERMARK_CHAR_WIDTH = 11;    // ancho aproximado por letra a 18px en negrita
const WATERMARK_GAP_X      = 40;    // espacio entre marcas en la misma fila
const WATERMARK_ROW_HEIGHT = 46;    // distancia entre filas de la marca de agua

// Motivo por el que se entregan las boletas (se guarda la clave, se muestra el texto).
const REASON_LABELS = {
    ticketPurchase:  '🎟️ Por compra de boleta',
    productPurchase: '🍦 Por compra de productos (60.000+)',
};

const $ = (id) => document.getElementById(id);

function escapeHtml(value) {
    return String(value ?? '').replace(/[&<>"']/g, c => ({
        '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
    }[c]));
}

// ── Celular: máscara ###-###-##-## ───────────────────────────────────────────
const PHONE_GROUPS = [3, 3, 2, 2];

function phoneDigits(value) {
    return String(value ?? '').replace(/\D/g, '').slice(0, PHONE_DIGITS);
}

function formatPhone(value) {
    const d = phoneDigits(value);
    const parts = [];
    let start = 0;
    for (const size of PHONE_GROUPS) {
        if (start >= d.length) break;
        parts.push(d.slice(start, start + size));
        start += size;
    }
    return parts.join('-');
}

function attachPhoneMask(input) {
    input.addEventListener('input', () => {
        input.value = formatPhone(input.value);
    });
}

// ── UI ───────────────────────────────────────────────────────────────────────
function ticketsHtml(numbers) {
    return `<div class="raffle-tickets">${
        numbers.map(n => `<span class="raffle-ticket">${escapeHtml(n)}</span>`).join('')
    }</div>`;
}

// ── Popup "Ver en grande" ────────────────────────────────────────────────────
let modalData = null;   // { name, phone, numbers } de lo último que se mostró

function bigButtonHtml() {
    return '<button type="button" class="btn-secondary raffle-big-btn" data-raffle-big>🔍 Ver en grande</button>';
}

// Marca de agua con nombre y celular, encima de todo el popup (boletas incluidas),
// para que una captura de pantalla siempre deje ver de quién son. Es un SVG en
// mosaico como fondo (filas horizontales intercaladas) que se repite solo hasta
// cubrir la capa; la capa completa se gira en CSS (.raffle-watermark-layer).
function watermarkBackground(text) {
    const tileW = Math.max(160, text.length * WATERMARK_CHAR_WIDTH) + WATERMARK_GAP_X;
    const tileH = WATERMARK_ROW_HEIGHT * 2;
    const label = escapeHtml(text);
    // Fila 1 completa; fila 2 corrida media baldosa (partida entre el borde derecho
    // e izquierdo, que se juntan al repetirse el mosaico).
    const positions = [[tileW / 2, tileH / 4], [0, tileH * 3 / 4], [tileW, tileH * 3 / 4]];
    const texts = positions.map(([x, y]) => `<text x="${x}" y="${y}">${label}</text>`).join('');
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${tileW}" height="${tileH}">`
        + `<g text-anchor="middle" dominant-baseline="middle" font-family="Arial, sans-serif"`
        + ` font-size="18" font-weight="bold" fill="rgb(250,150,90)" fill-opacity="0.4">`
        + `${texts}</g></svg>`;
    return `url("data:image/svg+xml,${encodeURIComponent(svg)}")`;
}

function openModal() {
    if (!modalData) return;
    $('raffle-modal-title').textContent  = modalData.name;
    $('raffle-modal-phone').textContent  = `📱 ${formatPhone(modalData.phone)}`;
    $('raffle-modal-tickets').innerHTML  = modalData.numbers
        .map(n => `<span class="raffle-ticket raffle-ticket-big">${escapeHtml(n)}</span>`).join('');
    $('raffle-watermark-layer').style.backgroundImage =
        watermarkBackground(`${modalData.name} · ${formatPhone(modalData.phone)}`);
    $('raffle-modal').style.display = 'flex';
}

function closeModal() {
    $('raffle-modal').style.display = 'none';
}

function onKeydown(event) {
    // El dashboard reemplaza esta sección al navegar: si el popup ya no existe, soltamos el listener.
    if (!$('raffle-modal')) return document.removeEventListener('keydown', onKeydown);
    if (event.key === 'Escape') closeModal();
}

function reasonHtml(reason) {
    const label = REASON_LABELS[reason];
    return label ? `<span class="raffle-reason-badge">${escapeHtml(label)}</span>` : '';
}

function errorMessage(error) {
    // Los HttpsError de las functions ya traen el mensaje en español.
    return error?.message || 'Ocurrió un error. Intenta de nuevo.';
}

// createdAt llega de las functions en milisegundos.
function formatDate(millis) {
    if (!millis) return '';
    const date = new Date(millis);
    return date.toLocaleString('es-CO', {
        weekday: 'long', day: 'numeric', month: 'long', year: 'numeric',
        hour: 'numeric', minute: '2-digit', second: '2-digit', hour12: true,
    });
}

function saleMetaHtml(createdAt, soldBy) {
    const date = formatDate(createdAt);
    return `<div class="raffle-sale-meta">
        ${date ? `<span>🕒 ${escapeHtml(date)}</span>` : ''}
        ${soldBy ? `<span>👤 Vendió: ${escapeHtml(soldBy)}</span>` : ''}
    </div>`;
}

// ── Boletas vendidas: resumen de hoy + histórico filtrable por motivo ─────────
// Se leen todas las ventas una vez (máx. ~3.300, porque son 3 boletas de 10.000
// números) y se filtra en el navegador; así no hace falta un índice compuesto.
let historySales = [];
let historyShown = HISTORY_PAGE_SIZE;

function dayKey(millis) {
    const date = new Date(millis);
    return `${date.getFullYear()}-${date.getMonth()}-${date.getDate()}`;
}

function isToday(millis) {
    return !!millis && dayKey(millis) === dayKey(Date.now());
}

function countTickets(sales) {
    return sales.reduce((sum, s) => sum + (s.numbers?.length ?? 0), 0);
}

function statTileHtml(title, sales, highlight = false) {
    const byReason = (reason) => countTickets(sales.filter(s => s.reason === reason));
    return `
        <div class="raffle-stat ${highlight ? 'raffle-stat-highlight' : ''}">
            <span class="raffle-stat-title">${title}</span>
            <span class="raffle-stat-value">${countTickets(sales)}</span>
            <span class="raffle-stat-caption">boletas · ${sales.length} ventas</span>
            <div class="raffle-stat-breakdown">
                <span>🎟️ Compra de boleta: <b>${byReason('ticketPurchase')}</b></span>
                <span>🍦 Compra de productos: <b>${byReason('productPurchase')}</b></span>
            </div>
        </div>
    `;
}

function renderStats() {
    $('raffle-stats').innerHTML =
        statTileHtml('Hoy', historySales.filter(s => isToday(s.createdAt)), true)
        + statTileHtml('Histórico', historySales);
}

function renderHistory() {
    const filter = $('raffle-history-filter').value;
    const sales  = filter === 'all' ? historySales : historySales.filter(s => s.reason === filter);
    const list   = $('raffle-history-list');

    $('raffle-history-summary').textContent = `${countTickets(sales)} boletas en ${sales.length} ventas`;

    if (sales.length === 0) {
        list.innerHTML = '<p class="raffle-empty">No hay ventas con este filtro.</p>';
        $('raffle-history-more').style.display = 'none';
        return;
    }

    list.innerHTML = sales.slice(0, historyShown).map(s => `
        <div class="raffle-sale">
            <p class="raffle-sale-customer">${escapeHtml(s.name)} · ${escapeHtml(formatPhone(s.phone))}</p>
            ${reasonHtml(s.reason)}
            ${saleMetaHtml(s.createdAt, s.soldBy)}
            ${ticketsHtml(s.numbers ?? [])}
        </div>
    `).join('');
    $('raffle-history-more').style.display = sales.length > historyShown ? 'inline-block' : 'none';
}

// ── Alertas (solo admin) ─────────────────────────────────────────────────────
// Se calculan con las mismas ventas del histórico; el resto de roles no ve la tarjeta.
function buildAlerts(sales) {
    const byPhone = new Map();
    sales.forEach(s => {
        if (!byPhone.has(s.phone)) byPhone.set(s.phone, []);
        byPhone.get(s.phone).push(s);
    });

    const alerts = [];
    byPhone.forEach((phoneSales, phone) => {
        const name = phoneSales[0].name;   // las ventas vienen de la más reciente a la más antigua
        const tickets = countTickets(phoneSales);
        if (tickets >= MANY_TICKETS_ALERT) {
            alerts.push({ phone, name, text: `Tiene ${tickets} boletas en ${phoneSales.length} ventas.` });
        }

        const byDay = new Map();
        phoneSales.forEach(s => {
            if (!s.createdAt) return;
            const key = dayKey(s.createdAt);
            if (!byDay.has(key)) byDay.set(key, []);
            byDay.get(key).push(s);
        });
        byDay.forEach(daySales => {
            if (daySales.length < 2) return;
            const day = new Date(daySales[0].createdAt).toLocaleDateString('es-CO', { day: 'numeric', month: 'long', year: 'numeric' });
            const sellers = [...new Set(daySales.map(s => s.soldBy).filter(Boolean))].join(', ');
            alerts.push({ phone, name, text: `Recibió boletas ${daySales.length} veces el ${day}${sellers ? ` (vendió: ${sellers})` : ''}.` });
        });
    });
    return alerts;
}

function renderAlerts() {
    const card = $('raffle-alerts-card');
    if (window.currentUserRole !== 'admin') {
        card.style.display = 'none';
        return;
    }
    card.style.display = 'block';

    const alerts = buildAlerts(historySales);
    $('raffle-alerts-list').innerHTML = alerts.length === 0
        ? '<p class="raffle-empty">Sin alertas por ahora. 👍</p>'
        : alerts.map(a => `
            <div class="raffle-alert">
                <div>
                    <p class="raffle-sale-customer">${escapeHtml(a.name)} · ${escapeHtml(formatPhone(a.phone))}</p>
                    <p class="raffle-alert-text">${escapeHtml(a.text)}</p>
                </div>
                <button type="button" class="raffle-link-btn" data-raffle-alert-phone="${escapeHtml(a.phone)}">Ver boletas</button>
            </div>
        `).join('');
}

async function loadHistory() {
    try {
        const { data } = await listSalesFn();
        historySales = data.sales ?? [];
        historyShown = HISTORY_PAGE_SIZE;
        const sold = countTickets(historySales);
        $('raffle-counter').textContent = `${sold} vendidas · ${data.totalNumbers - sold} disponibles`;
        renderStats();
        renderHistory();
        renderAlerts();
    } catch (error) {
        console.error('raffle history:', error);
        $('raffle-history-list').innerHTML = `<p class="raffle-error">${escapeHtml(errorMessage(error))}</p>`;
    }
}

function showSellError(message) {
    const el = $('raffle-sell-error');
    el.textContent = message;
    el.style.display = message ? 'block' : 'none';
}

async function onSell(event) {
    event.preventDefault();
    const name  = $('raffle-name').value.trim().replace(/\s+/g, ' ');
    const phone = phoneDigits($('raffle-phone').value);
    const reason = document.querySelector('input[name="raffle-reason"]:checked')?.value;

    if (!name) return showSellError('Escribe el nombre del cliente.');
    if (phone.length !== PHONE_DIGITS) return showSellError(`El celular debe tener ${PHONE_DIGITS} dígitos.`);
    if (!REASON_LABELS[reason]) return showSellError('Escoge el motivo.');
    showSellError('');

    const btn = $('raffle-sell-btn');
    btn.disabled = true;
    btn.textContent = 'Generando…';

    try {
        // El servidor devuelve la venta guardada: números, vendedor y hora del servidor.
        const { data: sale } = await sellFn({ name, phone, reason });
        const { numbers } = sale;
        const result = $('raffle-sell-result');
        result.innerHTML = `
            <p class="raffle-result-title">✅ Boletas de ${escapeHtml(name)} · ${escapeHtml(formatPhone(phone))}</p>
            ${reasonHtml(reason)}
            ${saleMetaHtml(sale.createdAt, sale.soldBy)}
            ${ticketsHtml(numbers)}
            ${bigButtonHtml()}
        `;
        modalData = { name, phone, numbers };
        result.style.display = 'block';
        $('raffle-name').value  = '';
        $('raffle-phone').value = '';
        document.querySelectorAll('input[name="raffle-reason"]').forEach(r => { r.checked = false; });
        loadHistory();
    } catch (error) {
        console.error('raffle sell:', error);
        showSellError(errorMessage(error));
    } finally {
        btn.disabled = false;
        btn.textContent = '🎟️ Generar 3 boletas';
    }
}

async function onSearch(event) {
    event.preventDefault();
    const list  = $('raffle-search-results');
    const phone = phoneDigits($('raffle-search-phone').value);

    if (phone.length !== PHONE_DIGITS) {
        list.innerHTML = `<p class="raffle-error">El celular debe tener ${PHONE_DIGITS} dígitos.</p>`;
        return;
    }

    list.innerHTML = '<p class="raffle-empty">Buscando…</p>';
    try {
        const { data } = await searchByPhoneFn({ phone });
        const sales = data.sales ?? [];   // ya vienen de la más reciente a la más antigua

        if (sales.length === 0) {
            list.innerHTML = '<p class="raffle-empty">Este celular no tiene boletas.</p>';
            return;
        }

        const allNumbers = sales.flatMap(s => s.numbers ?? []);
        modalData = { name: sales[0].name, phone, numbers: allNumbers };
        list.innerHTML = `
            <p class="raffle-result-title">${escapeHtml(sales[0].name)} · ${escapeHtml(formatPhone(phone))} — ${allNumbers.length} boletas</p>
            ${bigButtonHtml()}
            ${sales.map(s => `
                <div class="raffle-sale">
                    ${reasonHtml(s.reason)}
                    ${saleMetaHtml(s.createdAt, s.soldBy)}
                    ${ticketsHtml(s.numbers ?? [])}
                </div>
            `).join('')}
        `;
    } catch (error) {
        console.error('raffle search:', error);
        list.innerHTML = `<p class="raffle-error">${escapeHtml(errorMessage(error))}</p>`;
    }
}

attachPhoneMask($('raffle-phone'));
attachPhoneMask($('raffle-search-phone'));
$('raffle-sell-form').addEventListener('submit', onSell);
$('raffle-sell-form').addEventListener('input', () => showSellError(''));
$('raffle-search-form').addEventListener('submit', onSearch);

// Los botones "Ver en grande" se generan con cada resultado, por eso delegamos el click.
document.querySelector('.raffle-container').addEventListener('click', (event) => {
    if (event.target.closest('[data-raffle-big]')) openModal();

    // "Ver boletas" de una alerta: consulta ese celular en la tarjeta de búsqueda.
    const alertBtn = event.target.closest('[data-raffle-alert-phone]');
    if (alertBtn) {
        $('raffle-search-phone').value = formatPhone(alertBtn.dataset.raffleAlertPhone);
        $('raffle-search-form').requestSubmit();
        $('raffle-search-form').scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
});
$('raffle-modal-close').addEventListener('click', closeModal);
$('raffle-modal').addEventListener('click', (event) => {
    if (event.target === $('raffle-modal')) closeModal();   // click en el fondo oscuro
});
document.addEventListener('keydown', onKeydown);

$('raffle-history-filter').addEventListener('change', () => {
    historyShown = HISTORY_PAGE_SIZE;
    renderHistory();
});
$('raffle-history-more').addEventListener('click', () => {
    historyShown += HISTORY_PAGE_SIZE;
    renderHistory();
});
$('raffle-history-refresh').addEventListener('click', loadHistory);

loadHistory();
