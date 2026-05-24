import { db } from "./firebase.js";
import {
    getFirestore, collection, onSnapshot,
    doc, getDoc, setDoc, deleteDoc, increment
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";
import { logError, logWarn, logInfo } from "./logger.js";
import { todayString, formatDate } from "./utils.js";
import { printTicketWIFI } from "./printer.js";


const USE_MOCK = false;

function pendingPath(orderNumber) {
    return doc(db, 'productOrder', 'pending', todayString(), orderNumber);
}

function completedPath(orderNumber) {
    return doc(db, 'productOrder', 'completed', todayString(), orderNumber);
}

// ─── Mock ──────────────────────────────────────────────────────────────────────

const mockOrders = [
    {
        orderNumber: '001',
        createdAt: new Date(Date.now() - 25 * 60 * 1000),
        customer: 'Juan Pérez',
        customerAddress: 'Calle 45 #12-34',
        customerNeighborhood: 'Barrio 1',
        customerPhoneNumber: '3001234567',
        paymentMethod: 'Efectivo',
        total: 40000,
        order: [
            {
                productTitle: 'Sunday Especial Fresa',
                flavor: 'Fresas',
                fruit: 'Banano',
                iceCreamFlavor: 'Macadamia',
                ingredients: 'Una bola de helado',
                juice: '',
                notes: 'Sin cereal',
                price: 16000,
                sauces: 'Mora',
                toppings: 'Crispy',
                quantity: 1
            },
            {
                productTitle: 'Jugo Natural',
                flavor: '',
                fruit: '',
                iceCreamFlavor: '',
                ingredients: 'Jugo natural',
                juice: 'Mango',
                notes: '',
                price: 8000,
                sauces: '',
                toppings: '',
                quantity: 3
            }
        ],
        paymentStatus: 'pendiente'
    },
    {
        orderNumber: '002',
        createdAt: new Date(Date.now() - 19 * 60 * 1000),
        customer: 'María López',
        customerAddress: 'Carrera 70 #34-12',
        customerNeighborhood: 'Barrio 1',
        customerPhoneNumber: '3109876543',
        paymentMethod: 'Nequi',
        total: 18000,
        order: [
            {
                productTitle: 'Copa Especial',
                flavor: '',
                fruit: 'Banano',
                iceCreamFlavor: 'Vainilla',
                ingredients: 'Dos bolas de helado',
                juice: '',
                notes: '',
                price: 18000,
                sauces: 'Arequipe',
                toppings: '',
                quantity: 1
            }
        ],
        paymentStatus: 'pendiente'
    }
];

// ─── Normalizar doc Firebase ───────────────────────────────────────────────────

function normalizeFirebaseOrder(docSnap) {
    const d = docSnap.data();
    return {
        orderNumber: docSnap.id,
        createdAt: d.createdAt?.toDate?.() ?? new Date(),
        customer: d.customer ?? '—',
        customerAddress: d.customerAddress ?? '—',
        customerNeighborhood: d.customerNeighborhood ?? '—',
        customerPhoneNumber: d.customerPhoneNumber ?? '—',
        paymentMethod: d.paymentMethod ?? '—',
        total: d.total ?? 0,
        order: Array.isArray(d.order) ? d.order : [],
        paymentStatus: d.paymentStatus ?? 'pendiente'
    };
}

// ─── Estado global ─────────────────────────────────────────────────────────────

let currentOrders = [];
let pendingCancelOrder = null;
let pendingPrintOrder = null;
let unsubscribe = null;
const processingOrders = new Set();

// ─── DOM ───────────────────────────────────────────────────────────────────────

const ordersContainer = document.getElementById('orders-container');
const noOrders = document.getElementById('no-orders');
const cancelPopup = document.getElementById('cancel-popup');
const printPopup = document.getElementById('print-popup');

// ─── Popups ────────────────────────────────────────────────────────────────────

document.getElementById('dismiss-cancel').addEventListener('click', () => closePopup(cancelPopup));
document.getElementById('dismiss-print').addEventListener('click', () => closePopup(printPopup));

document.getElementById('confirm-cancel').addEventListener('click', async () => {
    if (!pendingCancelOrder) return;
    await cancelOrder(pendingCancelOrder);
    closePopup(cancelPopup);
});

document.getElementById('confirm-print').addEventListener('click', async () => {
    if (!pendingPrintOrder) return;
    printTicketWIFI(pendingPrintOrder);
    await completeOrder(pendingPrintOrder);
    closePopup(printPopup);
});

function closePopup(popup) {
    popup.classList.remove('visible');
    pendingCancelOrder = null;
    pendingPrintOrder = null;
}

// ─── Firebase actions ──────────────────────────────────────────────────────────

async function cancelOrder(order) {
    if (USE_MOCK) {
        currentOrders = currentOrders.filter(o => o.orderNumber !== order.orderNumber);
        renderOrders(currentOrders);
        return;
    }
    processingOrders.delete(order.orderNumber);
    await deleteDoc(pendingPath(order.orderNumber));
}

async function completeOrder(order) {
    if (USE_MOCK) {
        currentOrders = currentOrders.filter(o => o.orderNumber !== order.orderNumber);
        renderOrders(currentOrders);
        return;
    }
    processingOrders.delete(order.orderNumber);
    const snap = await getDoc(pendingPath(order.orderNumber));
    if (!snap.exists()) return;

    await setDoc(completedPath(order.orderNumber), snap.data());
    await deleteDoc(pendingPath(order.orderNumber));

    // ── DEBUG: ver qué llega ──────────────────────────────────────
    console.log("📊 Guardando analítica:", {
        paymentMethod: order.paymentMethod,
        total: order.total,
        fecha: todayString()
    });

    const date = todayString();
    try {
        await setDoc(doc(db, "analytics", "daily"), {
            [date]: {
                total: increment(order.total ?? 0),
                orders: increment(1),
                efectivo: increment(order.paymentMethod === "Efectivo" ? 1 : 0),
                transferencia: increment(order.paymentMethod === "Transferencia" ? 1 : 0)
            }
        }, { merge: true });
        logInfo("completeOrder", "Analítica actualizada", {
            paymentMethod: order.paymentMethod,
            total: order.total,
            fecha: todayString()
        });
    } catch (err) {
        logError("completeOrder", "Fallo guardando analítica", err);
    }
}

// ─── Init ──────────────────────────────────────────────────────────────────────

function initOrders() {
    if (USE_MOCK) {
        currentOrders = mockOrders;
        renderOrders(currentOrders);
        return;
    }

    if (unsubscribe) unsubscribe();

    const colRef = collection(db, 'productOrder', 'pending', todayString());
    unsubscribe = onSnapshot(colRef,
        (snapshot) => {
            currentOrders = snapshot.docs.map(normalizeFirebaseOrder);
            renderOrders(currentOrders);
        },
        (error) => {
            logError("initOrders", "Fallo escuchando pedidos en tiempo real", error);
            noOrders.textContent = 'Error al cargar pedidos. Recarga la página.';
            noOrders.style.display = 'block';
        }
    );
}

initOrders();

// ─── Render ────────────────────────────────────────────────────────────────────

function renderOrders(orders) {
    document.querySelectorAll('.ticket').forEach(t => t.remove());

    if (orders.length === 0) {
        noOrders.style.display = 'block';
        noOrders.textContent = 'No hay pedidos activos.';
        return;
    }

    const sorted = [...orders].sort((a, b) => {
        const dateA = a.createdAt instanceof Date ? a.createdAt : new Date(a.createdAt);
        const dateB = b.createdAt instanceof Date ? b.createdAt : new Date(b.createdAt);
        return dateA - dateB;
    });

    noOrders.style.display = 'none';
    sorted.forEach(order => ordersContainer.appendChild(buildTicket(order)));
    checkUrgentOrders();
}

function buildTicket(order) {
    const ticket = document.createElement('div');
    ticket.className = 'ticket';
    if (processingOrders.has(order.orderNumber)) {
        ticket.classList.add('processing');
    }
    ticket.dataset.id = order.orderNumber;
    ticket.dataset.createdAt = order.createdAt instanceof Date
        ? order.createdAt.toISOString()
        : new Date().toISOString();

    const date = formatDate(order.createdAt instanceof Date ? order.createdAt : new Date(order.createdAt));
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
            ${i.additions ? `<br><span class="item-detail"> Adiciones: ${i.additions.map(a => a.name).join(', ')}</span>` : ''}
            ${i.juice ? `<br><span class="item-detail">🥤 Jugo: ${i.juice}</span>` : ''}
            ${i.toppings ? `<br><span class="item-detail">🍫 Toppings: ${i.toppings}</span>` : ''}
            ${i.sauces ? `<br><span class="item-detail">🍯 Salsa: ${i.sauces}</span>` : ''}
            ${i.notes ? `<br><span class="item-detail">📝 Notas: ${i.notes}</span>` : ''}
        </li>
    `).join('')
        : '<li>Sin detalle</li>';

    ticket.innerHTML = `
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
            <button class="btn-cancel-ticket">🗑 Cancelar</button>
            ${processingOrders.has(order.orderNumber)
            ? `<button class="btn-print-ticket">🖨 Imprimir</button>`
            : `<button class="btn-in-progress-ticket">⏳ En Proceso</button>`
            }
        </div>
    `;

    ticket.querySelector('.btn-cancel-ticket').addEventListener('click', () => {
        pendingCancelOrder = order;
        cancelPopup.classList.add('visible');
    });

    const processBtn = ticket.querySelector('.btn-in-progress-ticket');

    if (processBtn) {
        processBtn.addEventListener('click', () => {
            processingOrders.add(order.orderNumber);
            renderOrders(currentOrders);
        });
    }

    const printBtn = ticket.querySelector('.btn-print-ticket');
    if (printBtn) {
        printBtn.addEventListener('click', () => {
            pendingPrintOrder = order;
            printPopup.classList.add('visible');
        });
    }

    return ticket;
}

// ─── Urgentes ──────────────────────────────────────────────────────────────────

function checkUrgentOrders() {
    document.querySelectorAll('.ticket').forEach(ticket => {
        const minutesElapsed = (Date.now() - new Date(ticket.dataset.createdAt).getTime()) / 60000;
        ticket.classList.toggle('urgent', minutesElapsed >= 20);
    });
}

setInterval(checkUrgentOrders, 30000);

// ─── Búsqueda ──────────────────────────────────────────────────────────────────

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
        : 'No hay pedidos activos.';
});
