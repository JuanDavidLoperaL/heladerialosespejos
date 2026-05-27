import { db } from "./firebase.js";
import { collection, getDocs } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";
import { todayString, formatDate } from "./utils.js";
import { printTicketWIFI } from "./printer.js";

// ─── Estado ────────────────────────────────────────────────────────────────────

let allOrders        = [];   // todos los pedidos cargados para el día
let pendingPrintOrder = null;

// ─── DOM ───────────────────────────────────────────────────────────────────────

const ordersContainer = document.getElementById('orders-container');
const noOrders        = document.getElementById('no-orders');
const ordersCount     = document.getElementById('orders-count');
const daySummary      = document.getElementById('day-summary');
const printPopup      = document.getElementById('print-popup');
const dateInput       = document.getElementById('date-input');
const btnSearch       = document.getElementById('btn-search');
const searchInput     = document.getElementById('search-input');

// ─── Init: setear fecha de hoy ─────────────────────────────────────────────────

dateInput.value = todayString();


// ─── Normalizar doc Firebase ───────────────────────────────────────────────────

function normalizeOrder(docSnap) {
    const d = docSnap.data();
    return {
        orderNumber:          docSnap.id,
        createdAt:            d.createdAt?.toDate?.() ?? new Date(),
        customer:             d.customer             ?? '—',
        customerAddress:      d.customerAddress      ?? '—',
        customerNeighborhood: d.customerNeighborhood ?? '—',
        customerPhoneNumber:  d.customerPhoneNumber  ?? '—',
        paymentMethod:        d.paymentMethod        ?? '—',
        total:                d.total                ?? 0,
        order:                Array.isArray(d.order) ? d.order : [],
        paymentStatus:        d.paymentStatus        ?? 'completado'
    };
}

// ─── Buscar pedidos ────────────────────────────────────────────────────────────

async function fetchCompletedOrders(dateStr) {
    showLoading();

    try {
        const colRef  = collection(db, 'productOrder', 'completed', dateStr);
        const snapshot = await getDocs(colRef);

        allOrders = snapshot.docs.map(normalizeOrder);
        allOrders.sort((a, b) => {
            const da = a.createdAt instanceof Date ? a.createdAt : new Date(a.createdAt);
            const db_ = b.createdAt instanceof Date ? b.createdAt : new Date(b.createdAt);
            return da - db_;
        });

        renderOrders(allOrders);
        renderSummary(allOrders);

    } catch (err) {
        console.error("Error cargando pedidos completados:", err);
        noOrders.textContent = 'Error al cargar. Intenta de nuevo.';
        noOrders.style.display = 'block';
        ordersContainer.querySelectorAll('.ticket, .loading-msg').forEach(el => el.remove());
    }
}

// ─── Render ────────────────────────────────────────────────────────────────────

function showLoading() {
    ordersContainer.querySelectorAll('.ticket, .loading-msg').forEach(el => el.remove());
    noOrders.style.display = 'none';
    daySummary.style.display = 'none';
    ordersCount.textContent = '…';

    const msg = document.createElement('p');
    msg.className = 'loading-msg';
    msg.innerHTML = '<span class="spinner"></span> Cargando pedidos…';
    ordersContainer.appendChild(msg);
}

function renderOrders(orders) {
    ordersContainer.querySelectorAll('.ticket, .loading-msg').forEach(el => el.remove());

    if (orders.length === 0) {
        noOrders.textContent = 'No hay pedidos completados para este día.';
        noOrders.style.display = 'block';
        ordersCount.textContent = '0 pedidos';
        return;
    }

    noOrders.style.display = 'none';
    ordersCount.textContent = `${orders.length} pedido${orders.length !== 1 ? 's' : ''}`;
    orders.forEach(order => ordersContainer.appendChild(buildTicket(order)));
}

function renderSummary(orders) {
    if (orders.length === 0) {
        daySummary.style.display = 'none';
        return;
    }

    const fmtCO = (n) => '$' + Number(n || 0).toLocaleString('es-CO');

    const efectivoOrders = orders.filter(o => o.paymentMethod === 'Efectivo');
    const transferOrders = orders.filter(o => o.paymentMethod !== 'Efectivo');

    const totalEfectivo = efectivoOrders.reduce((s, o) => s + (o.total || 0), 0);
    const totalTransfer = transferOrders.reduce((s, o) => s + (o.total || 0), 0);
    const totalGeneral  = totalEfectivo + totalTransfer;

    document.getElementById('summary-orders').textContent         = orders.length;
    document.getElementById('summary-efectivo').textContent       = efectivoOrders.length;
    document.getElementById('summary-efectivo-total').textContent = fmtCO(totalEfectivo);
    document.getElementById('summary-transfer').textContent       = transferOrders.length;
    document.getElementById('summary-transfer-total').textContent = fmtCO(totalTransfer);
    document.getElementById('summary-total').textContent          = fmtCO(totalGeneral);

    daySummary.style.display = 'flex';
}

function buildTicket(order) {
    const ticket = document.createElement('div');
    ticket.className = 'ticket';
    ticket.dataset.id        = order.orderNumber;
    ticket.dataset.createdAt = order.createdAt instanceof Date
        ? order.createdAt.toISOString()
        : new Date().toISOString();

    const date  = formatDate(order.createdAt instanceof Date ? order.createdAt : new Date(order.createdAt));
    const items = Array.isArray(order.order) ? order.order : [];

    const itemsHTML = items.length > 0
        ? items.map(i => `
            <li>
                <strong>${i.productTitle}</strong> — $${Number(i.price).toLocaleString('es-CO')}
                ${i.quantity        ? `<br><span class="item-detail"><strong>Cantidad:</strong> ${i.quantity}</span>`            : ''}
                ${i.ingredients     ? `<br><span class="item-detail">🍨 ${i.ingredients}</span>`                                 : ''}
                ${i.iceCreamFlavor  ? `<br><span class="item-detail">🍦 Helado: ${i.iceCreamFlavor}</span>`                      : ''}
                ${i.flavor          ? `<br><span class="item-detail">🍓 Sabor: ${i.flavor}</span>`                               : ''}
                ${i.fruit           ? `<br><span class="item-detail">🍌 Fruta: ${i.fruit}</span>`                                : ''}
                ${i.additions       ? `<br><span class="item-detail">➕ Adiciones: ${i.additions.map(a => a.name).join(', ')}</span>` : ''}
                ${i.juice           ? `<br><span class="item-detail">🥤 Jugo: ${i.juice}</span>`                                 : ''}
                ${i.toppings        ? `<br><span class="item-detail">🍫 Toppings: ${i.toppings}</span>`                          : ''}
                ${i.sauces          ? `<br><span class="item-detail">🍯 Salsa: ${i.sauces}</span>`                               : ''}
                ${i.notes           ? `<br><span class="item-detail">📝 Notas: ${i.notes}</span>`                                : ''}
            </li>
        `).join('')
        : '<li>Sin detalle</li>';

    ticket.innerHTML = `
        <span class="ticket-badge">✔ Completado</span>
        <div class="ticket-header">
            <span class="ticket-number">🧾 #${order.orderNumber}</span>
            <span class="ticket-date">${date}</span>
        </div>
        <div class="ticket-row">
            <span class="ticket-label">Cliente</span>
            <span class="ticket-value">${order.customer}</span>
        </div>
        <div class="ticket-row">
            <span class="ticket-label">Dirección</span>
            <span class="ticket-value">${order.customerAddress}</span>
        </div>
        <div class="ticket-row">
            <span class="ticket-label">Barrio</span>
            <span class="ticket-value">${order.customerNeighborhood}</span>
        </div>
        <div class="ticket-row">
            <span class="ticket-label">Teléfono</span>
            <span class="ticket-value">${order.customerPhoneNumber}</span>
        </div>
        <div class="ticket-row">
            <span class="ticket-label">Pedido</span>
            <ul class="order-list">${itemsHTML}</ul>
        </div>
        <div class="ticket-row">
            <span class="ticket-label">Total</span>
            <span class="ticket-value ticket-total">$${Number(order.total).toLocaleString('es-CO')}</span>
        </div>
        <div class="ticket-row">
            <span class="ticket-label">Método de pago</span>
            <span class="ticket-value">${order.paymentMethod}</span>
        </div>
        <div class="ticket-actions">
            <button class="btn-reprint-ticket">🖨 Reimprimir</button>
        </div>
    `;

    ticket.querySelector('.btn-reprint-ticket').addEventListener('click', () => {
        pendingPrintOrder = order;
        printPopup.classList.add('visible');
    });

    return ticket;
}

// ─── Búsqueda por comanda ──────────────────────────────────────────────────────

searchInput.addEventListener('input', function () {
    const query = this.value.trim().toLowerCase();

    document.querySelectorAll('.ticket').forEach(ticket => {
        const number = ticket.querySelector('.ticket-number')?.textContent?.toLowerCase() ?? '';
        ticket.style.display = (!query || number.includes(query)) ? '' : 'none';
    });

    const visible = [...document.querySelectorAll('.ticket')].some(t => t.style.display !== 'none');
    noOrders.style.display = visible ? 'none' : 'block';
    noOrders.textContent   = query
        ? `No se encontró la comanda "${query.toUpperCase()}".`
        : 'No hay pedidos completados para este día.';
});

// ─── Botón buscar ──────────────────────────────────────────────────────────────

btnSearch.addEventListener('click', () => {
    const dateStr = dateInput.value;
    if (!dateStr) {
        alert('Por favor selecciona una fecha.');
        return;
    }
    searchInput.value = '';
    fetchCompletedOrders(dateStr);
});

// También buscar al presionar Enter en el date input
dateInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') btnSearch.click();
});

// ─── Popup ─────────────────────────────────────────────────────────────────────

document.getElementById('dismiss-print').addEventListener('click', () => {
    printPopup.classList.remove('visible');
    pendingPrintOrder = null;
});

document.getElementById('confirm-print').addEventListener('click', async () => {
    if (!pendingPrintOrder) return;
    await printTicketWIFI(pendingPrintOrder);
    printPopup.classList.remove('visible');
    pendingPrintOrder = null;
});