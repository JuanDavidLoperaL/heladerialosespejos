import { db } from "./firebase.js";
import {
    collection, getDocs, onSnapshot,
    doc, getDoc, setDoc, deleteDoc, updateDoc, increment
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";
import { logError, logInfo } from "./logger.js";
import { todayString, formatDate } from "./utils.js";
import { groupOrdersByProximity, DEFAULT_PROXIMITY_METERS, DEFAULT_MAX_GROUP_SIZE } from "./orderGrouping.js";

const STATUS_OPTIONS = [
    { value: 'inPreparation', label: 'En preparación' },
    { value: 'onTheWay',      label: 'En camino' }
];

const GROUP_COLORS = ['#6a3fa0', '#16a085', '#d35400', '#2980b9', '#c0392b', '#8e5b3f'];

let allOrders           = [];    // pedidos cargados para la fecha vigente
let activeFilter        = 'all'; // 'all' | 'Efectivo' | 'transfer'
let pendingDeliverOrder = null;
let pendingCancelOrder  = null;
let unsubscribe         = null;
let orderGroups         = new Map(); // orderNumber -> { groupId, memberNumbers, maxDistanceMeters, colorIndex }
let groupCounter        = 0;

// Parametrizable desde Firestore (config/orderGrouping) — se actualiza en vivo
// para que un cambio del dueño aplique al instante en todas las pantallas abiertas.
let groupingConfig = { proximityMeters: DEFAULT_PROXIMITY_METERS, maxGroupSize: DEFAULT_MAX_GROUP_SIZE };

onSnapshot(doc(db, 'config', 'orderGrouping'),
    (snap) => {
        const d = snap.data();
        const proximityMeters = Number(d?.proximityMeters);
        const maxGroupSize    = Number(d?.maxGroupSize);
        groupingConfig = {
            proximityMeters: proximityMeters > 0 ? proximityMeters : DEFAULT_PROXIMITY_METERS,
            maxGroupSize:    maxGroupSize >= 2 ? Math.floor(maxGroupSize) : DEFAULT_MAX_GROUP_SIZE
        };
    },
    (error) => {
        logError("groupingConfig", "Fallo leyendo configuración de agrupación, usando valores por defecto", error);
        groupingConfig = { proximityMeters: DEFAULT_PROXIMITY_METERS, maxGroupSize: DEFAULT_MAX_GROUP_SIZE };
    }
);

const ordersContainer  = document.getElementById('orders-container');
const noOrders         = document.getElementById('no-orders');
const ordersCount      = document.getElementById('orders-count');
const deliverPopup     = document.getElementById('deliver-popup');
const cancelPopup      = document.getElementById('cancel-order-popup');
const dateInput        = document.getElementById('date-input');
const btnSearch        = document.getElementById('btn-search');
const searchInput      = document.getElementById('search-input');
const btnGroupProximity = document.getElementById('btn-group-proximity');
const btnClearGrouping  = document.getElementById('btn-clear-grouping');
const groupingSummary   = document.getElementById('grouping-summary');

dateInput.value = todayString();

function printedPath(orderNumber, dateString) {
    return doc(db, 'productOrder', 'printed', dateString, orderNumber);
}

function completedPath(orderNumber, dateString) {
    return doc(db, 'productOrder', 'completed', dateString, orderNumber);
}

function cancelledPath(orderNumber, dateString) {
    return doc(db, 'productOrder', 'cancelled', dateString, orderNumber);
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
    ordersContainer.querySelectorAll('.ticket, .order-group, .loading-msg').forEach(el => el.remove());

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

    // El pedido más antiguo (el que más tiempo lleva esperando) siempre manda
    // el orden general. Si quedó en un grupo por cercanía, sus compañeros se
    // muestran justo a su lado (aunque sean pedidos más nuevos) y no se vuelven
    // a mostrar sueltos más abajo en su propia posición cronológica.
    const rendered = new Set();
    sorted.forEach(order => {
        if (rendered.has(order.orderNumber)) return;

        const groupInfo = orderGroups.get(order.orderNumber);
        const members = groupInfo
            ? groupInfo.memberNumbers
                .map(num => sorted.find(o => o.orderNumber === num))
                .filter(Boolean) // por si un compañero ya no está visible (entregado/cancelado/filtro de pago)
            : [];

        if (members.length >= 2) {
            ordersContainer.appendChild(buildGroupWrapper(members, groupInfo));
            members.forEach(m => rendered.add(m.orderNumber));
        } else {
            ordersContainer.appendChild(buildTicket(order));
            rendered.add(order.orderNumber);
        }
    });

    applySearchFilter();
}

function buildGroupWrapper(members, groupInfo) {
    const wrapper = document.createElement('div');
    wrapper.className = 'order-group';
    wrapper.style.setProperty('--group-color', GROUP_COLORS[groupInfo.colorIndex % GROUP_COLORS.length]);

    const header = document.createElement('div');
    header.className = 'group-header';
    header.textContent = `🔗 Grupo ${groupInfo.groupId} — ${members.length} pedidos, máximo ${groupInfo.maxDistanceMeters} m entre sí`;

    const ticketsRow = document.createElement('div');
    ticketsRow.className = 'group-tickets';
    members.forEach(order => ticketsRow.appendChild(buildTicket(order)));

    wrapper.appendChild(header);
    wrapper.appendChild(ticketsRow);
    return wrapper;
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
        <button class="btn-cancel-order" title="Cancelar pedido">✕</button>
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

    ticket.querySelector('.btn-cancel-order').addEventListener('click', () => {
        pendingCancelOrder = order;
        cancelPopup.classList.add('visible');
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
        clearGrouping();
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
    clearGrouping();

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

// ─── Agrupar por cercanía ────────────────────────────────────────────────────────

function clearGrouping() {
    orderGroups = new Map();
    groupingSummary.textContent = '';
    btnClearGrouping.style.display = 'none';
}

btnClearGrouping.addEventListener('click', () => {
    clearGrouping();
    renderOrders(getFilteredOrders());
});

btnGroupProximity.addEventListener('click', async () => {
    btnGroupProximity.disabled = true;
    const originalLabel = btnGroupProximity.textContent;
    btnGroupProximity.textContent = 'Agrupando…';
    groupingSummary.textContent = '';

    try {
        // Se agrupa sobre TODOS los pedidos "En preparación" del día vigente, sin importar
        // el filtro de método de pago activo en pantalla — la ruta del domiciliario
        // no depende de si el cliente pagó en efectivo o por transferencia. Los pedidos
        // "En camino" se excluyen a propósito: ya salieron a reparto y agruparlos
        // confundiría al personal despachando.
        const ordersToGroup = allOrders.filter(o => o.status === 'inPreparation');
        const { groups, geocodedCount, noCoordsCount, proximityMeters, maxGroupSize } =
            await groupOrdersByProximity(ordersToGroup, groupingConfig);

        orderGroups = new Map();
        groups.forEach(({ orderNumbers, maxDistanceMeters }) => {
            groupCounter++;
            const colorIndex = (groupCounter - 1) % GROUP_COLORS.length;
            orderNumbers.forEach(num => {
                orderGroups.set(num, { groupId: groupCounter, memberNumbers: orderNumbers, maxDistanceMeters, colorIndex });
            });
        });

        const groupedCount = groups.reduce((sum, g) => sum + g.orderNumbers.length, 0);
        const unmatchedGeocoded = geocodedCount - groupedCount;
        groupingSummary.textContent =
            `🔗 ${groups.length} grupo${groups.length !== 1 ? 's' : ''} formado${groups.length !== 1 ? 's' : ''} ` +
            `(≤${proximityMeters} m, hasta ${maxGroupSize} por grupo) · ${unmatchedGeocoded} sin pareja cercana · ${noCoordsCount} sin dirección geolocalizada`;
        btnClearGrouping.style.display = groups.length > 0 ? '' : 'none';

        renderOrders(getFilteredOrders());

        logInfo("groupOrdersByProximity", "Pedidos agrupados por cercanía", {
            grupos: groups.length,
            sinParejaCercana: unmatchedGeocoded,
            sinCoordenadas: noCoordsCount,
            proximityMeters,
            maxGroupSize
        });
    } catch (err) {
        logError("groupOrdersByProximity", "Fallo agrupando pedidos por cercanía", err);
        alert('No se pudo agrupar los pedidos por cercanía. Intenta de nuevo.');
    } finally {
        btnGroupProximity.disabled = false;
        btnGroupProximity.textContent = originalLabel;
    }
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

    await setDoc(completedPath(order.orderNumber, order.dateString), {
        ...snap.data(),
        status: 'delivered'
    });
    await deleteDoc(printedPath(order.orderNumber, order.dateString));

    // La analítica se cuenta aquí, al entregar — no al imprimir — para que un
    // pedido cancelado en "Pedidos en proceso" nunca llegue a sumar a la venta.
    try {
        await setDoc(doc(db, "analytics", "daily"), {
            [order.dateString]: {
                total:         increment(order.total),
                orders:        increment(1),
                efectivo:      increment(order.paymentMethod === "Efectivo"      ? 1 : 0),
                transferencia: increment(order.paymentMethod === "Transferencia" ? 1 : 0)
            }
        }, { merge: true });
        logInfo("markDelivered", "Analítica actualizada", {
            orderNumber:   order.orderNumber,
            dateString:    order.dateString,
            total:         order.total,
            paymentMethod: order.paymentMethod
        });
    } catch (err) {
        logError("markDelivered", "Fallo guardando analítica", err);
    }

    logInfo("markDelivered", "Pedido marcado como entregado", {
        orderNumber: order.orderNumber,
        dateString: order.dateString
    });
}

async function cancelOrder(order) {
    const snap = await getDoc(printedPath(order.orderNumber, order.dateString));
    if (!snap.exists()) return;

    // Solo mueve el pedido a "cancelled" para dejar registro — nunca se suma
    // a la analítica porque esta solo se cuenta al marcar un pedido entregado.
    await setDoc(cancelledPath(order.orderNumber, order.dateString), {
        ...snap.data(),
        status: 'cancelled',
        cancelledAt: new Date()
    });
    await deleteDoc(printedPath(order.orderNumber, order.dateString));

    logInfo("cancelOrder", "Pedido cancelado", {
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

document.getElementById('dismiss-cancel-order').addEventListener('click', () => {
    cancelPopup.classList.remove('visible');
    pendingCancelOrder = null;
});

document.getElementById('confirm-cancel-order').addEventListener('click', async () => {
    if (!pendingCancelOrder) return;
    try {
        await cancelOrder(pendingCancelOrder);
    } catch (err) {
        logError("confirm-cancel-order", "Fallo cancelando pedido", err);
        alert('No se pudo cancelar el pedido. Intenta de nuevo.');
    }
    cancelPopup.classList.remove('visible');
    pendingCancelOrder = null;
});
