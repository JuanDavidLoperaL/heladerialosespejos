import { db } from "./firebase.js";
import {
    getFirestore, collection, onSnapshot,
    doc, getDoc, setDoc, deleteDoc, increment
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";
import { logError, logWarn, logInfo } from "./logger.js";
import { todayString, formatDate } from "./utils.js";
import { printTicketWIFI } from "./printer.js";


const USE_MOCK = false;
const DOMICILIARIOS = ['Juan José', 'Sebastian Rico', 'Felipe Yepes', 'Emmanuel Pareja', 'Camilo Mejia', 'Don José'];
const deliveryData = new Map();

function pendingPath(orderNumber) {
    return doc(db, 'productOrder', 'pending', todayString(), orderNumber);
}

function printedPath(orderNumber) {
    return doc(db, 'productOrder', 'printed', todayString(), orderNumber);
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
        customerApartmentTower: d.customerApartmentTower ?? '',
        customerApartmentUnit: d.customerApartmentUnit ?? '',
        customerPhoneNumber: d.customerPhoneNumber ?? '—',
        customerLatitude: d.customerLatitude ?? null,
        customerLongitude: d.customerLongitude ?? null,
        paymentMethod: d.paymentMethod ?? '—',
        total: d.total ?? 0,
        // Calculado por el cliente al hacer el pedido (distancia real) — el empleado
        // lo ve prellenado en el campo de domicilio pero lo puede editar libremente.
        valorDomicilio: d.valorDomicilio ?? null,
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

    const delivery       = deliveryData.get(pendingPrintOrder.orderNumber) || {};
    const valorDomicilio = Number(delivery.valorDomicilio) || 0;

    const orderWithDelivery = {
        ...pendingPrintOrder,
        domiciliario:      delivery.domiciliario || '',
        valorDomicilio,
        totalConDomicilio: pendingPrintOrder.total + valorDomicilio
    };

    printTicketWIFI(orderWithDelivery);
    await printOrder(orderWithDelivery);
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

// Imprimir solo pone el pedido en la fila de preparación (colección "printed").
// El estado real (en preparación / en camino / entregado) se controla aparte,
// desde "Pedidos en proceso". La analítica se sigue contando aquí, en el momento
// de imprimir, exactamente como antes — no se mueve al paso de "entregado".
async function printOrder(order) {
    if (USE_MOCK) {
        currentOrders = currentOrders.filter(o => o.orderNumber !== order.orderNumber);
        renderOrders(currentOrders);
        return;
    }

    processingOrders.delete(order.orderNumber);

    const snap = await getDoc(pendingPath(order.orderNumber));
    if (!snap.exists()) return;

    const valorDomicilio    = order.valorDomicilio    || 0;
    const totalConDomicilio = order.totalConDomicilio ?? order.total;

    await setDoc(printedPath(order.orderNumber), {
        ...snap.data(),
        status:            snap.data().status ?? 'inPreparation',
        domiciliario:      order.domiciliario || '',
        valorDomicilio,
        subtotal:          order.total,          // total de productos sin domicilio
        total:             totalConDomicilio      // total final para el cierre contable
    });
    await deleteDoc(pendingPath(order.orderNumber));

    const date = todayString();
    try {
        await setDoc(doc(db, "analytics", "daily"), {
            [date]: {
                total:         increment(totalConDomicilio),
                orders:        increment(1),
                efectivo:      increment(order.paymentMethod === "Efectivo"      ? 1 : 0),
                transferencia: increment(order.paymentMethod === "Transferencia" ? 1 : 0)
            }
        }, { merge: true });
        logInfo("printOrder", "Analítica actualizada", {
            paymentMethod: order.paymentMethod,
            subtotal:      order.total,
            valorDomicilio,
            total:         totalConDomicilio,
            domiciliario:  order.domiciliario,
            fecha:         date
        });
    } catch (err) {
        logError("printOrder", "Fallo guardando analítica", err);
    }

    deliveryData.delete(order.orderNumber);
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

    // Datos de domicilio: si el empleado ya lo editó, se respeta eso; si no, se
    // prellena con el valor que calculó el cliente por distancia al hacer el pedido.
    const saved = deliveryData.get(order.orderNumber) || {};
    const valorGuardado = saved.valorDomicilio != null
        ? saved.valorDomicilio
        : (order.valorDomicilio != null ? order.valorDomicilio : '');
    const totalConDomicilio = order.total + (Number(valorGuardado) || 0);

    const mapsUrl = (order.customerLatitude != null && order.customerLongitude != null)
        ? `https://www.google.com/maps/search/?api=1&query=${order.customerLatitude},${order.customerLongitude}`
        : `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(order.customerAddress)}`;

    // Generar opciones ANTES del template para evitar backticks anidados
    const opcionesDomiciliario = ['', ...DOMICILIARIOS]
        .map(d => `<option value="${d}" ${saved.domiciliario === d ? 'selected' : ''}>${d || '— Sin asignar —'}</option>`)
        .join('');

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
            ${i.notes ? `<br><span class="item-detail">📝 Porfavor Retirar: ${i.notes}</span>` : ''}
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
            <span class="ticket-value"><a href="${mapsUrl}" target="_blank" rel="noopener">${order.customerAddress} 🗺️</a></span>
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
            <span class="ticket-label">Subtotal</span>
            <span class="ticket-value">$${Number(order.total).toLocaleString('es-CO')}</span>
        </div>
        <div class="ticket-row">
            <span class="ticket-label">Domiciliario</span>
            <select class="delivery-select">
                ${opcionesDomiciliario}
            </select>
        </div>
        <div class="ticket-row">
            <span class="ticket-label">Domicilio $</span>
            <input type="number" class="delivery-fee" placeholder="0" min="0" value="${valorGuardado}" />
        </div>
        <div class="ticket-row ticket-total-row">
            <span class="ticket-label"><strong>TOTAL</strong></span>
            <span class="ticket-value ticket-grand-total"><strong>$${totalConDomicilio.toLocaleString('es-CO')}</strong></span>
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

        // Event listeners para campos de domicilio
    const deliverySelect  = ticket.querySelector('.delivery-select');
    const deliveryFeeInput = ticket.querySelector('.delivery-fee');
    const grandTotalEl    = ticket.querySelector('.ticket-grand-total');

    function updateDelivery() {
        const domiciliario   = deliverySelect.value;
        const valorDomicilio = Number(deliveryFeeInput.value) || 0;
        deliveryData.set(order.orderNumber, { domiciliario, valorDomicilio });
        grandTotalEl.innerHTML = `<strong>$${(order.total + valorDomicilio).toLocaleString('es-CO')}</strong>`;
    }

    deliverySelect.addEventListener('change', updateDelivery);
    deliveryFeeInput.addEventListener('input', updateDelivery);

    // Sincroniza deliveryData con lo que se ve en pantalla desde el primer render —
    // si no, un empleado que imprime sin tocar el campo prellenado mandaría $0 de domicilio.
    updateDelivery();

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
