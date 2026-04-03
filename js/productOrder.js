import { initializeApp } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js";
import {
    getFirestore,
    collection,
    onSnapshot,
    doc,
    getDoc,
    setDoc,
    deleteDoc
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";

// ─── Config ────────────────────────────────────────────────────────────────────

const USE_MOCK = false; // 👈 cambiar a true para usar datos de prueba

const firebaseConfig = {
    apiKey: "AIzaSyAFylb18Y4e1w7TAEoz3_toyCCHMy8s0xA",
    authDomain: "heladerialosespejos-c645e.firebaseapp.com",
    projectId: "heladerialosespejos-c645e",
    storageBucket: "heladerialosespejos-c645e.appspot.com",
    messagingSenderId: "144529838152",
    appId: "1:144529838152:web:8336516088534940ecc87d",
    measurementId: "G-L36FHJEM67"
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

// ─── Fecha ─────────────────────────────────────────────────────────────────────

function todayString() {
    return new Intl.DateTimeFormat('es-CO', {
        timeZone: 'America/Bogota',
        day:   '2-digit',
        month: '2-digit',
        year:  'numeric'
    }).format(new Date()).split('/').reverse().join('-');
}

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
        customerPhoneNumber: '3001234567',
        paymentMethod: 'Efectivo',
        total: 40000,
        order: [
            {
                productTitle: 'Sunday Especial Fresa',
                flavor: 'Fresas',
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
        customerPhoneNumber: '3109876543',
        paymentMethod: 'Nequi',
        total: 18000,
        order: [
            {
                productTitle: 'Copa Especial',
                flavor: '',
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
        orderNumber:         docSnap.id,
        createdAt:           d.createdAt?.toDate?.() ?? new Date(),
        customer:            d.customer            ?? '—',
        customerAddress:     d.customerAddress     ?? '—',
        customerPhoneNumber: d.customerPhoneNumber ?? '—',
        paymentMethod:       d.paymentMethod       ?? '—',
        total:               d.total               ?? 0,
        order:               Array.isArray(d.order) ? d.order : [],
        paymentStatus:       d.paymentStatus       ?? 'pendiente'
    };
}

// ─── Estado global ─────────────────────────────────────────────────────────────

let currentOrders      = [];
let pendingCancelOrder = null;
let pendingPrintOrder  = null;
let unsubscribe        = null;

// ─── DOM ───────────────────────────────────────────────────────────────────────

const ordersContainer = document.getElementById('orders-container');
const noOrders        = document.getElementById('no-orders');
const cancelPopup     = document.getElementById('cancel-popup');
const printPopup      = document.getElementById('print-popup');

// ─── Popups ────────────────────────────────────────────────────────────────────

document.getElementById('dismiss-cancel').addEventListener('click', () => closePopup(cancelPopup));
document.getElementById('dismiss-print').addEventListener('click',  () => closePopup(printPopup));

document.getElementById('confirm-cancel').addEventListener('click', async () => {
    if (!pendingCancelOrder) return;
    await cancelOrder(pendingCancelOrder);
    closePopup(cancelPopup);
});

document.getElementById('confirm-print').addEventListener('click', async () => {
    if (!pendingPrintOrder) return;
    await completeOrder(pendingPrintOrder);
    printTicket(pendingPrintOrder);
    closePopup(printPopup);
});

function closePopup(popup) {
    popup.classList.remove('visible');
    pendingCancelOrder = null;
    pendingPrintOrder  = null;
}

// ─── Firebase actions ──────────────────────────────────────────────────────────

async function cancelOrder(order) {
    if (USE_MOCK) {
        currentOrders = currentOrders.filter(o => o.orderNumber !== order.orderNumber);
        renderOrders(currentOrders);
        return;
    }
    await deleteDoc(pendingPath(order.orderNumber));
}

async function completeOrder(order) {
    if (USE_MOCK) {
        currentOrders = currentOrders.filter(o => o.orderNumber !== order.orderNumber);
        renderOrders(currentOrders);
        return;
    }
    const snap = await getDoc(pendingPath(order.orderNumber));
    if (!snap.exists()) return;
    await setDoc(completedPath(order.orderNumber), snap.data());
    await deleteDoc(pendingPath(order.orderNumber));
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
            console.error('Error escuchando pedidos:', error);
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
            ${i.quantity   ? `<br><span class="item-detail"><strong>Cantidad:</strong> ${i.quantity}</span>`        : ''}
            ${i.ingredients   ? `<br><span class="item-detail">🍨 ${i.ingredients}</span>`        : ''}
            ${i.iceCreamFlavor ? `<br><span class="item-detail">🍦 Helado: ${i.iceCreamFlavor}</span>` : ''}
            ${i.flavor        ? `<br><span class="item-detail">🍓 Sabor: ${i.flavor}</span>`       : ''}
            ${i.juice         ? `<br><span class="item-detail">🥤 Jugo: ${i.juice}</span>`         : ''}
            ${i.toppings      ? `<br><span class="item-detail">🍫 Toppings: ${i.toppings}</span>`  : ''}
            ${i.sauces        ? `<br><span class="item-detail">🍯 Salsa: ${i.sauces}</span>`       : ''}
            ${i.notes         ? `<br><span class="item-detail">📝 Notas: ${i.notes}</span>`        : ''}
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
            <button class="btn-print-ticket">🖨 Imprimir</button>
        </div>
    `;

    ticket.querySelector('.btn-cancel-ticket').addEventListener('click', () => {
        pendingCancelOrder = order;
        cancelPopup.classList.add('visible');
    });

    ticket.querySelector('.btn-print-ticket').addEventListener('click', () => {
        pendingPrintOrder = order;
        printPopup.classList.add('visible');
    });

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
    noOrders.style.display  = hasVisible ? 'none' : 'block';
    noOrders.textContent    = query
        ? `No se encontró la comanda "${query.toUpperCase()}".`
        : 'No hay pedidos activos.';
});

// ─── Helpers ───────────────────────────────────────────────────────────────────

function formatDate(date) {
    return new Intl.DateTimeFormat('es-CO', {
        timeZone: 'America/Bogota',
        day:    '2-digit',
        month:  '2-digit',
        year:   'numeric',
        hour:   '2-digit',
        minute: '2-digit',
        second: '2-digit',
        hour12: true
    }).format(date);
}

// ─── Print ─────────────────────────────────────────────────────────────────────

function printTicket(order) {
    const printWindow = window.open('', '_blank');
    const items = Array.isArray(order.order) ? order.order : [];

const itemsHTML = items.length > 0
    ? items.map((i, index) => `
        <div class="item">
            <strong>${index + 1}. ${i.productTitle}</strong>
            <span>$${Number(i.price).toLocaleString('es-CO')}</span>
        </div>
        ${i.ingredients    ? `<div class="item-detail">${i.ingredients}</div>`          : ''}
        ${i.iceCreamFlavor ? `<div class="item-detail">Helado: ${i.iceCreamFlavor}</div>` : ''}
        ${i.flavor         ? `<div class="item-detail">Sabor: ${i.flavor}</div>`         : ''}
        ${i.juice          ? `<div class="item-detail">Jugo: ${i.juice}</div>`            : ''}
        ${i.toppings       ? `<div class="item-detail">Toppings: ${i.toppings}</div>`    : ''}
        ${i.sauces         ? `<div class="item-detail">Salsa: ${i.sauces}</div>`          : ''}
        ${i.notes          ? `<div class="item-detail">Notas: ${i.notes}</div>`           : ''}
    `).join('<div class="divider"></div>')
    : 'Sin detalle';

    const date = formatDate(order.createdAt instanceof Date ? order.createdAt : new Date(order.createdAt));

    printWindow.document.write(`
        <!DOCTYPE html><html><head><meta charset="UTF-8"><title>Ticket</title>
        <style>
            *{margin:0;padding:0;box-sizing:border-box;}
            body{font-family:'Courier New',monospace;font-size:12px;width:72mm;color:#000;background:#fff;padding:4mm;}
            .bold{font-weight:bold;}
            .logo{font-size:16px;font-weight:bold;text-align:center;margin-bottom:4px;}
            .subtitle{font-size:10px;text-align:center;margin-bottom:8px;}
            .separator{border-top:1px dashed #000;margin:6px 0;}
            .row{display:flex;justify-content:space-between;margin:2px 0;}
            .label{font-weight:bold;font-size:10px;text-transform:uppercase;}
            .value{font-size:11px;}
            .item{display:flex;justify-content:space-between;margin:3px 0;font-weight:bold;}
            .item-detail{font-size:10px;color:#333;margin-left:8px;margin-bottom:2px;}
            .divider{border-top:1px dotted #ccc;margin:4px 0;}
            .total-row{display:flex;justify-content:space-between;font-size:14px;font-weight:bold;margin-top:4px;}
            .footer{text-align:center;font-size:10px;margin-top:10px;}
            @media print{@page{margin:0;size:80mm auto;}body{width:72mm;}}
        </style></head><body>
            <div class="logo">Heladería Los Espejos</div>
            <div class="subtitle">No es solo un helado, es tradición hecha sabor</div>
            <div class="separator"></div>
            <div class="row"><span class="label">Comanda #</span><span class="value bold">${order.orderNumber}</span></div>
            <div class="row"><span class="label">Fecha</span><span class="value">${date}</span></div>
            <div class="separator"></div>
            <div class="label">Cliente</div>
            <div class="value">${order.customer}</div>
            <div class="value">${order.customerPhoneNumber}</div>
            <div class="value">${order.customerAddress}</div>
            <div class="separator"></div>
            <div class="label">Pedido</div>
            <div style="margin-top:4px;">${itemsHTML}</div>
            <div class="separator"></div>
            <div class="row"><span class="label">Método de pago</span><span class="value">${order.paymentMethod}</span></div>
            <div class="total-row"><span>TOTAL</span><span>$${Number(order.total).toLocaleString('es-CO')}</span></div>
            <div style="font-size:10px;margin-top:4px;">* Domicilio no incluido</div>
            <div class="separator"></div>
            <div class="footer">¡Gracias por tu pedido!<br>Horario: Lun - Dom 12:00 PM - 8:00 PM</div>
        </body></html>
    `);

    printWindow.document.close();
    printWindow.focus();
    setTimeout(() => { printWindow.print(); printWindow.close(); }, 500);
}