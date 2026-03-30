import { initializeApp } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js";
import { getFirestore, collection, onSnapshot, doc, updateDoc, deleteDoc } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";

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

const ordersContainer = document.getElementById('orders-container');
const noOrders = document.getElementById('no-orders');

// Popups
const cancelPopup = document.getElementById('cancel-popup');
const printPopup = document.getElementById('print-popup');
let pendingCancelId = null;
let pendingPrintId = null;

document.getElementById('dismiss-cancel').addEventListener('click', () => closePopup(cancelPopup));
document.getElementById('dismiss-print').addEventListener('click', () => closePopup(printPopup));

document.getElementById('confirm-cancel').addEventListener('click', async () => {
    if (!pendingCancelId) return;
    await deleteDoc(doc(db, 'orders', pendingCancelId));
    closePopup(cancelPopup);
});

//document.getElementById('confirm-print').addEventListener('click', () => {
  //  if (!pendingPrintId) return;
    //const ticket = document.querySelector(`.ticket[data-id="${pendingPrintId}"]`);
    //if (ticket) printTicket(ticket);
    //closePopup(printPopup);
//});

// Buscar el order por id
document.getElementById('confirm-print').addEventListener('click', () => {
    if (!pendingPrintId) return;
    const order = currentOrders.find(o => o.id === pendingPrintId);
    if (order) printTicket(order);
    closePopup(printPopup);
});

function closePopup(popup) {
    popup.classList.remove('visible');
    pendingCancelId = null;
    pendingPrintId = null;
}

let currentOrders = [];

// Escuchar pedidos en tiempo real desde Firebase
//onSnapshot(collection(db, 'orders'), (snapshot) => {
  //  const orders = [];
    //snapshot.forEach(d => orders.push({ id: d.id, ...d.data() }));
    //renderOrders(orders);
//});

// MOCK - borrar cuando conectes Firebase
const mockOrders = [
    {
        id: 'mock001',
        orderNumber: '001',
        createdAt: new Date(Date.now() - 25 * 60 * 1000).toISOString(),
        customerInfo: {
            name: 'Juan Pérez',
            address: 'Calle 45 #12-34',
            phone: '3001234567',
            payment: 'Efectivo',
            neighborhood: 'El Poblado'
        },
        items: [
            {
                title: 'Sunday Especial',
                numberOfItems: 2,
                price: 15000,
                sundayFlavor: 'Maracuyá',
                juiceFlavor: [],
                flavors: ['Vainilla', 'Chocolate'],
                toppings: ['Chispas', 'Maní'],
                sauces: ['Arequipe'],
                ingredients: 'Helado, sunday, toppings',
                ingredientsNotes: 'Sin maní por favor'
            }
        ],
        total: 30000,
        paymentStatus: 'pendiente'
    },
    {
        id: 'mock002',
        orderNumber: '002',
        createdAt: new Date(Date.now() - 19 * 60 * 1000).toISOString(),
        customerInfo: {
            name: 'Juan Pérez',
            address: 'Calle 45 #12-34',
            phone: '3001234567',
            payment: 'Efectivo',
            neighborhood: 'El Poblado'
        },
        items: [
            {
                title: 'Sunday Super Especial',
                numberOfItems: 3,
                price: 18000,
                sundayFlavor: 'Maracuyá',
                juiceFlavor: [],
                flavors: ['Vainilla'],
                toppings: ['Chispas', 'Maní'],
                sauces: ['Arequipe'],
                ingredients: 'Helado, sunday, toppings',
                ingredientsNotes: 'Sin maní por favor'
            }
        ],
        total: 30000,
        paymentStatus: 'pendiente'
    },
    {
        id: 'mock003',
        orderNumber: '003',
        createdAt: new Date(Date.now() - 19 * 60 * 1000).toISOString(),
        customerInfo: {
            name: 'Juan Camilo',
            address: 'Calle 45 #12-34',
            phone: '3001234567',
            payment: 'Efectivo',
            neighborhood: 'El Poblado'
        },
        items: [
            {
                title: 'Jugo de Mora',
                numberOfItems: 7,
                price: 34000,
                sundayFlavor: '',
                juiceFlavor: ["Mora"],
                flavors: [],
                toppings: [],
                sauces: [],
                ingredients: 'Helado, sunday, toppings',
                ingredientsNotes: 'Sin maní por favor'
            }
        ],
        total: 30000,
        paymentStatus: 'pendiente'
    }
];

currentOrders = mockOrders;
renderOrders(mockOrders);

function renderOrders(orders) {
    // Limpiar tickets existentes (no el mensaje de vacío)
    document.querySelectorAll('.ticket').forEach(t => t.remove());

    if (orders.length === 0) {
        noOrders.style.display = 'block';
        return;
    }

    noOrders.style.display = 'none';

    orders.forEach(order => {
        const ticket = buildTicket(order);
        ordersContainer.appendChild(ticket);
    });

    checkUrgentOrders();
}

function buildTicket(order) {
    const ticket = document.createElement('div');
    ticket.className = 'ticket';
    ticket.dataset.id = order.id;
    ticket.dataset.createdAt = order.createdAt || new Date().toISOString();

    const date = order.createdAt
        ? formatDate(new Date(order.createdAt))
        : '—';

    const itemsHTML = Array.isArray(order.items)
    ? order.items.map(i => `
        <li>
            <strong>${i.title} x${i.numberOfItems}</strong> — $${Number(i.price).toLocaleString('es-CO')}
            ${i.sundayFlavor ? `<br><span class="item-detail">🍨 Sunday: ${i.sundayFlavor}</span>` : ''}
            ${i.juiceFlavor?.length > 0 ? `<br><span class="item-detail">🥤 Jugo de: ${i.juiceFlavor.join(', ')}</span>` : ''}
            ${i.flavors?.length > 0 ? `<br><span class="item-detail">🍦 Sabores: ${i.flavors.join(', ')}</span>` : ''}
            ${i.toppings?.length > 0 ? `<br><span class="item-detail">🍫 Toppings: ${i.toppings.join(', ')}</span>` : ''}
            ${i.sauces?.length > 0 ? `<br><span class="item-detail">🍯 Salsa: ${i.sauces.join(', ')}</span>` : ''}
            ${i.ingredientsNotes ? `<br><span class="item-detail">📝 Notas: ${i.ingredientsNotes}</span>` : ''}
        </li>
    `).join('')
    : '<li>Sin detalle</li>';

    ticket.innerHTML = `
        <div class="ticket-header">
            <span class="ticket-number">🧾 #${order.orderNumber || order.id.slice(0,6).toUpperCase()}</span>
            <span class="ticket-date">${date}</span>
        </div>

        <div class="ticket-row">
            <span class="ticket-label">Cliente</span>
            <span class="ticket-value">${order.customerInfo?.name || '—'}</span>
        </div>

        <div class="ticket-row">
            <span class="ticket-label">Dirección</span>
            <span class="ticket-value">${order.customerInfo?.address || '—'}</span>
        </div>

        <div class="ticket-row">
            <span class="ticket-label">Teléfono</span>
            <span class="ticket-value">${order.customerInfo?.phone || '—'}</span>
        </div>

        <div class="ticket-row">
            <span class="ticket-label">Pedido</span>
            <ul class="order-list">${itemsHTML}</ul>
        </div>

        <div class="ticket-row">
            <span class="ticket-label">Total</span>
            <span class="ticket-value ticket-total">$${Number(order.total || 0).toLocaleString('es-CO')}</span>
        </div>

        <div class="ticket-row">
            <span class="ticket-label">Método de pago</span>
            <span class="ticket-value">${order.customerInfo?.payment || '—'}</span>
        </div>

        <div class="ticket-row">
            <span class="ticket-label">Estado de pago</span>
            <select class="payment-status ${order.paymentStatus || 'pendiente'}">
                <option value="pendiente" ${(order.paymentStatus || 'pendiente') === 'pendiente' ? 'selected' : ''}>⏳ Pendiente</option>
                <option value="pagado"    ${order.paymentStatus === 'pagado'    ? 'selected' : ''}>✅ Pagado</option>
            </select>
        </div>

        <div class="ticket-actions">
            <button class="btn-cancel-ticket">🗑 Cancelar</button>
            <button class="btn-print-ticket">🖨 Imprimir</button>
        </div>
    `;

    // Dropdown estado de pago
    ticket.querySelector('.payment-status').addEventListener('change', async function () {
        this.className = `payment-status ${this.value}`;
        await updateDoc(doc(db, 'orders', order.id), { paymentStatus: this.value });
    });

    // Cancelar
    ticket.querySelector('.btn-cancel-ticket').addEventListener('click', () => {
        pendingCancelId = order.id;
        cancelPopup.classList.add('visible');
    });

    // Imprimir
    ticket.querySelector('.btn-print-ticket').addEventListener('click', () => {
        pendingPrintId = order.id;
        printPopup.classList.add('visible');
    });

    return ticket;
}

// Revisar tickets urgentes cada 30 segundos
function checkUrgentOrders() {
    document.querySelectorAll('.ticket').forEach(ticket => {
        const createdAt = new Date(ticket.dataset.createdAt);
        const minutesElapsed = (Date.now() - createdAt.getTime()) / 60000;
        if (minutesElapsed >= 20) {
            ticket.classList.add('urgent');
        } else {
            ticket.classList.remove('urgent');
        }
    });
}

setInterval(checkUrgentOrders, 30000);

// Helpers
function formatDate(date) {
    const dd   = String(date.getDate()).padStart(2, '0');
    const mm   = String(date.getMonth() + 1).padStart(2, '0');
    const yyyy = date.getFullYear();
    const hh   = String(date.getHours()).padStart(2, '0');
    const min  = String(date.getMinutes()).padStart(2, '0');
    const ss   = String(date.getSeconds()).padStart(2, '0');
    return `${dd}/${mm}/${yyyy} ${hh}:${min}:${ss}`;
}

function printTicket(order) {
    const printWindow = window.open('', '_blank');

    const itemsHTML = Array.isArray(order.items)
        ? order.items.map((i, index) => `
            <div class="item">
                <strong>${index + 1}. ${i.title} x${i.numberOfItems}</strong>
                <span>$${Number(i.price * i.numberOfItems).toLocaleString('es-CO')}</span>
            </div>
            ${i.sundayFlavor ? `<div class="item-detail">Sunday: ${i.sundayFlavor}</div>` : ''}
            ${i.juiceFlavor?.length > 0 ? `<div class="item-detail">Jugo en: ${i.juiceFlavor.join(', ')}</div>` : ''}
            ${i.flavors?.length > 0 ? `<div class="item-detail">Sabores: ${i.flavors.join(', ')}</div>` : ''}
            ${i.toppings?.length > 0 ? `<div class="item-detail">Toppings: ${i.toppings.join(', ')}</div>` : ''}
            ${i.sauces?.length > 0 ? `<div class="item-detail">Salsa: ${i.sauces.join(', ')}</div>` : ''}
            ${i.ingredientsNotes ? `<div class="item-detail">Notas: ${i.ingredientsNotes}</div>` : ''}
        `).join('<div class="divider"></div>')
        : 'Sin detalle';

    const date = order.createdAt
        ? formatDate(new Date(order.createdAt))
        : formatDate(new Date());

    printWindow.document.write(`
        <!DOCTYPE html>
        <html>
        <head>
            <meta charset="UTF-8">
            <title>Ticket</title>
            <style>
                * {
                    margin: 0;
                    padding: 0;
                    box-sizing: border-box;
                }

                body {
                    font-family: 'Courier New', Courier, monospace;
                    font-size: 12px;
                    width: 72mm; /* ancho impresión térmica 80mm - márgenes */
                    color: #000;
                    background: #fff;
                    padding: 4mm;
                }

                .center { text-align: center; }
                .right  { text-align: right; }
                .bold   { font-weight: bold; }

                .logo {
                    font-size: 16px;
                    font-weight: bold;
                    text-align: center;
                    margin-bottom: 4px;
                }

                .subtitle {
                    font-size: 10px;
                    text-align: center;
                    margin-bottom: 8px;
                }

                .separator {
                    border-top: 1px dashed #000;
                    margin: 6px 0;
                }

                .row {
                    display: flex;
                    justify-content: space-between;
                    margin: 2px 0;
                }

                .label {
                    font-weight: bold;
                    font-size: 10px;
                    text-transform: uppercase;
                }

                .value {
                    font-size: 11px;
                }

                .item {
                    display: flex;
                    justify-content: space-between;
                    margin: 3px 0;
                    font-weight: bold;
                }

                .item-detail {
                    font-size: 10px;
                    color: #333;
                    margin-left: 8px;
                    margin-bottom: 2px;
                }

                .divider {
                    border-top: 1px dotted #ccc;
                    margin: 4px 0;
                }

                .total-section {
                    margin-top: 6px;
                }

                .total-row {
                    display: flex;
                    justify-content: space-between;
                    font-size: 14px;
                    font-weight: bold;
                    margin-top: 4px;
                }

                .footer {
                    text-align: center;
                    font-size: 10px;
                    margin-top: 10px;
                }

                @media print {
                    @page {
                        margin: 0;
                        size: 80mm auto; /* ancho fijo, alto automático */
                    }
                    body {
                        width: 72mm;
                    }
                }
            </style>
        </head>
        <body>

            <div class="logo">Heladería Los Espejos</div>
            <div class="subtitle">No es solo un helado, es tradición hecha sabor</div>

            <div class="separator"></div>

            <div class="row">
                <span class="label">Comanda #</span>
                <span class="value bold">${order.orderNumber || order.id?.slice(0,6).toUpperCase()}</span>
            </div>
            <div class="row">
                <span class="label">Fecha</span>
                <span class="value">${date}</span>
            </div>

            <div class="separator"></div>

            <div class="label">Cliente</div>
            <div class="value">${order.customerInfo?.name || '—'}</div>
            <div class="value">${order.customerInfo?.phone || '—'}</div>
            <div class="value">${order.customerInfo?.neighborhood || '—'}</div>
            <div class="value">${order.customerInfo?.address || '—'}</div>

            <div class="separator"></div>

            <div class="label">Pedido</div>
            <div style="margin-top: 4px;">
                ${itemsHTML}
            </div>

            <div class="separator"></div>

            <div class="total-section">
                <div class="row">
                    <span class="label">Método de pago</span>
                    <span class="value">${order.customerInfo?.payment || '—'}</span>
                </div>
                <div class="total-row">
                    <span>TOTAL</span>
                    <span>$${Number(order.total || 0).toLocaleString('es-CO')}</span>
                </div>
                <div style="font-size:10px; margin-top:4px;">* Domicilio no incluido</div>
            </div>

            <div class="separator"></div>

            <div class="footer">
                ¡Gracias por tu pedido!<br>
                Horario: Lun - Dom 12:00 PM - 8:00 PM
            </div>

        </body>
        </html>
    `);

    printWindow.document.close();
    printWindow.focus();
    setTimeout(() => {
        printWindow.print();
        printWindow.close();
    }, 500);
}