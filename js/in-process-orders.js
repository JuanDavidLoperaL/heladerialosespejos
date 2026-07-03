import { db } from "./firebase.js";
import {
    collection, onSnapshot,
    doc, getDoc, setDoc, deleteDoc, updateDoc
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";
import { logError, logInfo } from "./logger.js";
import { todayString, formatDate } from "./utils.js";

const STATUS_OPTIONS = [
    { value: 'inPreparation', label: 'En preparación' },
    { value: 'onTheWay',      label: 'En camino' }
];

let currentOrders = [];
let pendingDeliverOrder = null;
let unsubscribe = null;

const ordersContainer = document.getElementById('orders-container');
const noOrders         = document.getElementById('no-orders');
const deliverPopup     = document.getElementById('deliver-popup');

function printedPath(orderNumber) {
    return doc(db, 'productOrder', 'printed', todayString(), orderNumber);
}

function completedPath(orderNumber) {
    return doc(db, 'productOrder', 'completed', todayString(), orderNumber);
}

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
        domiciliario:         d.domiciliario         ?? '',
        total:                d.total                ?? 0,
        order:                Array.isArray(d.order) ? d.order : [],
        status:               d.status               ?? 'inPreparation'
    };
}

function initOrders() {
    if (unsubscribe) unsubscribe();

    const colRef = collection(db, 'productOrder', 'printed', todayString());
    unsubscribe = onSnapshot(colRef,
        (snapshot) => {
            currentOrders = snapshot.docs.map(normalizeOrder);
            renderOrders(currentOrders);
        },
        (error) => {
            logError("initOrders", "Fallo escuchando pedidos en proceso", error);
            noOrders.textContent = 'Error al cargar pedidos. Recarga la página.';
            noOrders.style.display = 'block';
        }
    );
}

initOrders();

function renderOrders(orders) {
    document.querySelectorAll('.ticket').forEach(t => t.remove());

    if (orders.length === 0) {
        noOrders.style.display = 'block';
        noOrders.textContent = 'No hay pedidos en proceso.';
        return;
    }

    const sorted = [...orders].sort((a, b) => {
        const dateA = a.createdAt instanceof Date ? a.createdAt : new Date(a.createdAt);
        const dateB = b.createdAt instanceof Date ? b.createdAt : new Date(b.createdAt);
        return dateA - dateB;
    });

    noOrders.style.display = 'none';
    sorted.forEach(order => ordersContainer.appendChild(buildTicket(order)));
}

function buildTicket(order) {
    const ticket = document.createElement('div');
    ticket.className = 'ticket';
    ticket.dataset.id = order.orderNumber;

    const date  = formatDate(order.createdAt instanceof Date ? order.createdAt : new Date(order.createdAt));
    const items = Array.isArray(order.order) ? order.order : [];

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
            <span class="ticket-value">${order.customerAddress} · ${order.customerNeighborhood}</span>
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

async function updateStatus(order, status) {
    if (order.status === status) return;
    try {
        await updateDoc(printedPath(order.orderNumber), { status });
    } catch (err) {
        logError("updateStatus", "Fallo actualizando estado", err);
        alert('No se pudo actualizar el estado. Intenta de nuevo.');
    }
}

async function markDelivered(order) {
    const snap = await getDoc(printedPath(order.orderNumber));
    if (!snap.exists()) return;

    // Solo mueve el pedido de colección — la analítica ya se contó al imprimir,
    // así que aquí NO se vuelve a incrementar (evita duplicar la venta).
    await setDoc(completedPath(order.orderNumber), {
        ...snap.data(),
        status: 'delivered'
    });
    await deleteDoc(printedPath(order.orderNumber));

    logInfo("markDelivered", "Pedido marcado como entregado", { orderNumber: order.orderNumber });
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

document.getElementById('search-input').addEventListener('input', function () {
    const query = this.value.trim().toLowerCase();

    document.querySelectorAll('.ticket').forEach(ticket => {
        const orderNumber = ticket.querySelector('.ticket-number')?.textContent?.toLowerCase() ?? '';
        ticket.style.display = (!query || orderNumber.includes(query)) ? '' : 'none';
    });

    const hasVisible = [...document.querySelectorAll('.ticket')].some(t => t.style.display !== 'none');
    noOrders.style.display = hasVisible ? 'none' : 'block';
    noOrders.textContent = query
        ? `No se encontró la comanda "${query.toUpperCase()}".`
        : 'No hay pedidos en proceso.';
});
