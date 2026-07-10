import { db } from "./firebase.js";
import {
    collection, getDocs, onSnapshot,
    doc, getDoc, setDoc, deleteDoc, updateDoc
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";
import { logError, logInfo } from "./logger.js";
import { todayString, formatDate } from "./utils.js";

const STATUS_OPTIONS = [
    { value: 'inPreparation', label: 'En preparación' },
    { value: 'onTheWay',      label: 'En camino' }
];

let allOrders           = [];    // pedidos cargados para la fecha vigente
let activeFilter        = 'all'; // 'all' | 'Efectivo' | 'transfer'
let pendingDeliverOrder = null;
let unsubscribe         = null;

const ordersContainer = document.getElementById('orders-container');
const noOrders         = document.getElementById('no-orders');
const ordersCount      = document.getElementById('orders-count');
const deliverPopup     = document.getElementById('deliver-popup');
const dateInput        = document.getElementById('date-input');
const btnSearch        = document.getElementById('btn-search');
const searchInput      = document.getElementById('search-input');

dateInput.value = todayString();

function printedPath(orderNumber, dateString) {
    return doc(db, 'productOrder', 'printed', dateString, orderNumber);
}

function completedPath(orderNumber, dateString) {
    return doc(db, 'productOrder', 'completed', dateString, orderNumber);
}

function normalizeOrder(docSnap, dateString) {
    const d = docSnap.data();
    return {
        orderNumber:          docSnap.id,
        dateString,
        createdAt:            d.createdAt?.toDate?.() ?? new Date(),
        customer:             d.customer             ?? '—',
        customerAddress:      d.customerAddress      ?? '—',
        customerNeighborhood: d.customerNeighborhood ?? '—',
        customerApartmentTower: d.customerApartmentTower ?? '',
        customerApartmentUnit:  d.customerApartmentUnit  ?? '',
        customerPhoneNumber:  d.customerPhoneNumber  ?? '—',
        customerLatitude:     d.customerLatitude     ?? null,
        customerLongitude:    d.customerLongitude    ?? null,
        paymentMethod:        d.paymentMethod        ?? '—',
        domiciliario:         d.domiciliario         ?? '',
        valorDomicilio:       d.valorDomicilio       ?? null,
        total:                d.total                ?? 0,
        order:                Array.isArray(d.order) ? d.order : [],
        status:               d.status               ?? 'inPreparation'
    };
}

// ─── Carga de pedidos ────────────────────────────────────────────────────────────

// El día de hoy se observa en tiempo real, para que un pedido impreso desde otro
// puesto aparezca solo, sin recargar. Cualquier otro día se consulta una sola vez
// (igual que en "Pedidos completados") — un día pasado ya no cambia en vivo.
function watchToday() {
    if (unsubscribe) { unsubscribe(); unsubscribe = null; }

    const dateStr = todayString();
    const colRef = collection(db, 'productOrder', 'printed', dateStr);
    unsubscribe = onSnapshot(colRef,
        (snapshot) => {
            allOrders = snapshot.docs.map(d => normalizeOrder(d, dateStr));
            renderOrders(getFilteredOrders());
        },
        (error) => {
            logError("watchToday", "Fallo escuchando pedidos en proceso", error);
            noOrders.textContent = 'Error al cargar pedidos. Recarga la página.';
            noOrders.style.display = 'block';
        }
    );
}

async function fetchOrdersForDate(dateStr) {
    if (unsubscribe) { unsubscribe(); unsubscribe = null; }
    showLoading();

    try {
        const colRef = collection(db, 'productOrder', 'printed', dateStr);
        const snapshot = await getDocs(colRef);
        allOrders = snapshot.docs.map(d => normalizeOrder(d, dateStr));
        renderOrders(getFilteredOrders());
    } catch (err) {
        logError("fetchOrdersForDate", "Fallo cargando pedidos en proceso", err);
        ordersContainer.querySelectorAll('.ticket, .loading-msg').forEach(el => el.remove());
        noOrders.textContent = 'Error al cargar. Intenta de nuevo.';
        noOrders.style.display = 'block';
    }
}

function showLoading() {
    ordersContainer.querySelectorAll('.ticket, .loading-msg').forEach(el => el.remove());
    noOrders.style.display = 'none';
    ordersCount.textContent = '…';

    const msg = document.createElement('p');
    msg.className = 'loading-msg';
    msg.innerHTML = '<span class="spinner"></span> Cargando pedidos…';
    ordersContainer.appendChild(msg);
}

watchToday();

// ─── Render ──────────────────────────────────────────────────────────────────────

function renderOrders(orders) {
    ordersContainer.querySelectorAll('.ticket, .loading-msg').forEach(el => el.remove());

    if (orders.length === 0) {
        noOrders.style.display = 'block';
        noOrders.textContent = 'No hay pedidos en proceso.';
        ordersCount.textContent = '0 pedidos';
        return;
    }

    const sorted = [...orders].sort((a, b) => {
        const dateA = a.createdAt instanceof Date ? a.createdAt : new Date(a.createdAt);
        const dateB = b.createdAt instanceof Date ? b.createdAt : new Date(b.createdAt);
        return dateA - dateB;
    });

    noOrders.style.display = 'none';
    ordersCount.textContent = `${orders.length} pedido${orders.length !== 1 ? 's' : ''}`;
    sorted.forEach(order => ordersContainer.appendChild(buildTicket(order)));

    applySearchFilter();
}

function buildTicket(order) {
    const ticket = document.createElement('div');
    ticket.className = 'ticket';
    ticket.dataset.id = order.orderNumber;

    const date  = formatDate(order.createdAt instanceof Date ? order.createdAt : new Date(order.createdAt));
    const items = Array.isArray(order.order) ? order.order : [];

    const mapsUrl = (order.customerLatitude != null && order.customerLongitude != null)
        ? `https://www.google.com/maps/search/?api=1&query=${order.customerLatitude},${order.customerLongitude}`
        : `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(order.customerAddress)}`;

    const itemsHTML = items.length > 0
        ? items.map(i => `
        <li>
            <strong>${i.productTitle}</strong> — $${Number(i.price).toLocaleString('es-CO')}
            ${i.quantity ? `<br><span class="item-detail"><strong>Cantidad:</strong> ${i.quantity}</span>` : ''}
            ${i.ingredients ? `<br><span class="item-detail">🍨 ${i.ingredients}</span>` : ''}
            ${i.iceCreamFlavor ? `<br><span class="item-detail">🍦 Helado: ${i.iceCreamFlavor}</span>` : ''}
            ${i.flavor ? `<br><span class="item-detail">🍓 Sabor: ${i.flavor}</span>` : ''}
            ${i.fruit ? `<br><span class="item-detail">🍌 Fruta: ${i.fruit}</span>` : ''}
            ${i.additions ? `<br><span class="item-detail">➕ Adiciones: ${i.additions.map(a => a.name).join(', ')}</span>` : ''}
            ${i.juice ? `<br><span class="item-detail">🥤 Jugo: ${i.juice}</span>` : ''}
            ${i.toppings ? `<br><span class="item-detail">🍫 Toppings: ${i.toppings}</span>` : ''}
            ${i.sauces ? `<br><span class="item-detail">🍯 Salsa: ${i.sauces}</span>` : ''}
            ${i.notes ? `<br><span class="item-detail">📝 Porfavor Retirar: ${i.notes}</span>` : ''}
        </li>
    `).join('')
        : '<li>Sin detalle</li>';

    const statusButtonsHTML = STATUS_OPTIONS.map(option => `
        <button
            class="btn-status ${order.status === option.value ? 'active' : ''}"
            data-status="${option.value}"
        >${option.label}</button>
    `).join('');

    ticket.innerHTML = `
        <span class="ticket-badge">🚚 En proceso</span>
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
            <span class="ticket-value"><a href="${mapsUrl}" target="_blank" rel="noopener">${order.customerAddress} · ${order.customerNeighborhood} 🗺️</a></span>
        </div>
        ${order.customerApartmentTower ? `
        <div class="ticket-row">
            <span class="ticket-label">Torre</span>
            <span class="ticket-value">${order.customerApartmentTower}</span>
        </div>` : ''}
        ${order.customerApartmentUnit ? `
        <div class="ticket-row">
            <span class="ticket-label">Apto/Casa</span>
            <span class="ticket-value">${order.customerApartmentUnit}</span>
        </div>` : ''}
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
        ${order.domiciliario ? `
        <div class="ticket-row">
            <span class="ticket-label">Domiciliario</span>
            <span class="ticket-value">${order.domiciliario}</span>
        </div>` : ''}
        <div class="status-toggle">${statusButtonsHTML}</div>
        <button class="btn-mark-delivered">✅ Marcar como entregado</button>
    `;

    ticket.querySelectorAll('.btn-status').forEach(btn => {
        btn.addEventListener('click', () => updateStatus(order, btn.dataset.status));
    });

    ticket.querySelector('.btn-mark-delivered').addEventListener('click', () => {
        pendingDeliverOrder = order;
        deliverPopup.classList.add('visible');
    });

    return ticket;
}

// ─── Filtro por método de pago ──────────────────────────────────────────────────

function getFilteredOrders() {
    if (activeFilter === 'all')      return allOrders;
    if (activeFilter === 'Efectivo') return allOrders.filter(o => o.paymentMethod === 'Efectivo');
    if (activeFilter === 'transfer') return allOrders.filter(o => o.paymentMethod !== 'Efectivo');
    return allOrders;
}

document.querySelectorAll('.btn-filter').forEach(btn => {
    btn.addEventListener('click', () => {
        activeFilter = btn.dataset.filter;
        document.querySelectorAll('.btn-filter').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        searchInput.value = '';
        renderOrders(getFilteredOrders());
    });
});

// ─── Búsqueda por comanda ────────────────────────────────────────────────────────

function applySearchFilter() {
    const query = searchInput.value.trim().toLowerCase();

    document.querySelectorAll('.ticket').forEach(ticket => {
        const orderNumber = ticket.querySelector('.ticket-number')?.textContent?.toLowerCase() ?? '';
        ticket.style.display = (!query || orderNumber.includes(query)) ? '' : 'none';
    });

    const hasVisible = [...document.querySelectorAll('.ticket')].some(t => t.style.display !== 'none');
    noOrders.style.display = hasVisible ? 'none' : 'block';
    noOrders.textContent = query
        ? `No se encontró la comanda "${query.toUpperCase()}".`
        : 'No hay pedidos en proceso.';
}

searchInput.addEventListener('input', applySearchFilter);

// ─── Botón buscar por fecha ──────────────────────────────────────────────────────

btnSearch.addEventListener('click', () => {
    const dateStr = dateInput.value;
    if (!dateStr) {
        alert('Por favor selecciona una fecha.');
        return;
    }

    searchInput.value = '';
    activeFilter = 'all';
    document.querySelectorAll('.btn-filter').forEach(b => b.classList.toggle('active', b.dataset.filter === 'all'));

    if (dateStr === todayString()) {
        watchToday();
    } else {
        fetchOrdersForDate(dateStr);
    }
});

// También buscar al presionar Enter en el date input
dateInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') btnSearch.click();
});

// ─── Acciones sobre un pedido ────────────────────────────────────────────────────

async function updateStatus(order, status) {
    if (order.status === status) return;
    try {
        await updateDoc(printedPath(order.orderNumber, order.dateString), { status });
    } catch (err) {
        logError("updateStatus", "Fallo actualizando estado", err);
        alert('No se pudo actualizar el estado. Intenta de nuevo.');
    }
}

async function markDelivered(order) {
    const snap = await getDoc(printedPath(order.orderNumber, order.dateString));
    if (!snap.exists()) return;

    // Solo mueve el pedido de colección — la analítica ya se contó al imprimir,
    // así que aquí NO se vuelve a incrementar (evita duplicar la venta).
    await setDoc(completedPath(order.orderNumber, order.dateString), {
        ...snap.data(),
        status: 'delivered'
    });
    await deleteDoc(printedPath(order.orderNumber, order.dateString));

    logInfo("markDelivered", "Pedido marcado como entregado", {
        orderNumber: order.orderNumber,
        dateString: order.dateString
    });
}

document.getElementById('dismiss-deliver').addEventListener('click', () => {
    deliverPopup.classList.remove('visible');
    pendingDeliverOrder = null;
});

document.getElementById('confirm-deliver').addEventListener('click', async () => {
    if (!pendingDeliverOrder) return;
    await markDelivered(pendingDeliverOrder);
    deliverPopup.classList.remove('visible');
    pendingDeliverOrder = null;
});
