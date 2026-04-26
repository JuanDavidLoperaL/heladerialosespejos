import { initializeApp } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js";
import {
    getFirestore,
    collection,
    onSnapshot,
    doc,
    getDoc,
    setDoc,
    deleteDoc,
    increment
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";

// 🔐 QZ SECURITY
async function getQZ() {
    return new Promise((resolve, reject) => {
        let attempts = 0;

        const check = () => {
            if (window.qz) {
                resolve(window.qz);
            } else if (attempts > 50) {
                reject("QZ no cargó");
            } else {
                attempts++;
                setTimeout(check, 100);
            }
        };

        check();
    });
}
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
        orderNumber:         docSnap.id,
        createdAt:           d.createdAt?.toDate?.() ?? new Date(),
        customer:            d.customer            ?? '—',
        customerAddress:     d.customerAddress     ?? '—',
        customerNeighborhood: d.customerNeighborhood ?? '—',
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
    printTicketWIFI(pendingPrintOrder);
    await completeOrder(pendingPrintOrder);
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
                total:         increment(order.total ?? 0),
                orders:        increment(1),
                efectivo:      increment(order.paymentMethod === "Efectivo"      ? 1 : 0),
                transferencia: increment(order.paymentMethod === "Transferencia" ? 1 : 0)
            }
        }, { merge: true });
        console.log("✅ Analítica guardada correctamente");
    } catch (err) {
        console.error("❌ Error guardando analítica:", err);
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
            ${i.fruit        ? `<br><span class="item-detail">🍌 Fruta: ${i.fruit}</span>`       : ''}
            ${i.additions    ? `<br><span class="item-detail"> Adiciones: ${i.additions.map(a => a.name).join(', ')}</span>` : ''}
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
        ${i.fruit          ? `<div class="item-detail">🍌 Fruta: ${i.fruit}</div>`           : ''}
        ${i.additions      ? `<div class="item-detail">Adiciones: ${i.additions.map(a => a.name).join(', ')}</div>`           : ''}
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

async function printTicketWIFI(order) {
    console.log("🖨️ Intentando imprimir pedido:", order.orderNumber);

    const qz = window.qz;
    if (!qz) {
        console.error("❌ window.qz no está disponible.");
        alert("QZ Tray no está cargado. Verifica que qz-tray.js esté incluido en dashboard.html.");
        return;
    }

    try {
        qz.security.setCertificatePromise(function(resolve) { resolve(""); });
        qz.security.setSignaturePromise(function(toSign) {
            return function(resolve) { resolve(""); };
        });

        if (!qz.websocket.isActive()) {
            console.log("🔌 Conectando a QZ Tray...");
            await qz.websocket.connect();
        }
        console.log("✅ Conectado a QZ Tray");

        const printers = await qz.printers.find();
        console.log("🖨️ Impresoras disponibles:", printers);

        if (!printers || printers.length === 0) {
            alert("No se encontraron impresoras.");
            return;
        }

        const printerName = printers.find(p => !/^\d+\.\d+\.\d+\.\d+$/.test(p)) ?? printers[0];
        console.log("✅ Usando impresora:", printerName);

        const config = qz.configs.create(printerName);

        // ─── Helpers de codificación ───────────────────────────────────────────

        function toBytes(str) {
            const map = {
                'á': 0xE1, 'é': 0xE9, 'í': 0xED, 'ó': 0xF3, 'ú': 0xFA,
                'Á': 0xC1, 'É': 0xC9, 'Í': 0xCD, 'Ó': 0xD3, 'Ú': 0xDA,
                'ñ': 0xF1, 'Ñ': 0xD1, 'ü': 0xFC, 'Ü': 0xDC,
                '¿': 0xBF, '¡': 0xA1, '°': 0xB0
            };
            const bytes = [];
            for (const ch of str) {
                bytes.push(map[ch] !== undefined ? map[ch] : ch.charCodeAt(0) & 0xFF);
            }
            return bytes;
        }

        function bytesToBase64(bytes) {
            let binary = '';
            for (const b of bytes) binary += String.fromCharCode(b);
            return btoa(binary);
        }

        // ─── Logo → bytes ESC/POS raster (comando GS v 0) ─────────────────────
        // targetWidth: ancho en píxeles del ticket. TM-m30III a 203dpi = ~576px max.
        // Usa 400 para que el logo ocupe bien el ancho sin cortarse.

        async function logoToESCBytes(imagePath, targetWidth = 400) {
            return new Promise((resolve) => {
                const img = new Image();
                img.crossOrigin = 'anonymous';

                img.onload = () => {
                    const scale  = targetWidth / img.width;
                    const width  = targetWidth;
                    const height = Math.round(img.height * scale);

                    const canvas  = document.createElement('canvas');
                    canvas.width  = width;
                    canvas.height = height;

                    const ctx = canvas.getContext('2d');
                    ctx.fillStyle = '#FFFFFF';
                    ctx.fillRect(0, 0, width, height);
                    ctx.drawImage(img, 0, 0, width, height);

                    const imageData = ctx.getImageData(0, 0, width, height);
                    const pixels    = imageData.data; // RGBA

                    // Ancho en bytes (8 píxeles por byte), redondeado arriba
                    const byteWidth = Math.ceil(width / 8);

                    const imgBytes = [];
                    for (let y = 0; y < height; y++) {
                        for (let bx = 0; bx < byteWidth; bx++) {
                            let byte = 0;
                            for (let bit = 0; bit < 8; bit++) {
                                const x = bx * 8 + bit;
                                if (x < width) {
                                    const idx       = (y * width + x) * 4;
                                    const luminance = 0.299 * pixels[idx] + 0.587 * pixels[idx + 1] + 0.114 * pixels[idx + 2];
                                    if (luminance < 128) byte |= (0x80 >> bit); // píxel oscuro = punto impreso
                                }
                            }
                            imgBytes.push(byte);
                        }
                    }

                    // Comando GS v 0: GS 0x76 0x30 m xL xH yL yH [data]
                    const xL = byteWidth & 0xFF;
                    const xH = (byteWidth >> 8) & 0xFF;
                    const yL = height & 0xFF;
                    const yH = (height >> 8) & 0xFF;

                    resolve([0x1D, 0x76, 0x30, 0x00, xL, xH, yL, yH, ...imgBytes]);
                };

                img.onerror = () => {
                    console.warn("⚠️ No se pudo cargar el logo — se omitirá del ticket.");
                    resolve([]); // Continúa sin logo si falla la carga
                };

                img.src = imagePath;
            });
        }

        // ─── Construir ticket ──────────────────────────────────────────────────

        async function buildTicketBytes(order) {
            const ESC = [0x1B];
            const GS  = [0x1D];
            const LF  = [0x0A];

            const bytes = [];
            const add = (...parts) => {
                for (const p of parts) {
                    if (Array.isArray(p)) bytes.push(...p);
                    else bytes.push(...toBytes(String(p)));
                }
            };

            // Inicializar impresora
            add(ESC, [0x40]);

            // ── Logo centrado ─────────────────────────────────────────────────
            add(ESC, [0x61, 0x01]);                          // centrar
            const logoBytes = await logoToESCBytes('images/logo.png', 400);
            if (logoBytes.length > 0) {
                add(logoBytes);
                add(LF);
            }
            // ── Reconfigurar codificación después del logo ────────────────────
            add(ESC, [0x74, 0x10]);

            // ── Encabezado ────────────────────────────────────────────────────
            add(ESC, [0x45, 0x01]);                          // negrita ON
            add('Heladeria Los Espejos', LF);
            add(ESC, [0x45, 0x00]);                          // negrita OFF
            add('No es solo un helado', LF);
            add('es tradicion hecha sabor', LF);
            add('--------------------------------', LF);

            // ── Info pedido ───────────────────────────────────────────────────
            add(ESC, [0x61, 0x00]);                          // izquierda
            add(`Comanda #: ${order.orderNumber}`, LF);
            add(`Fecha: ${formatDate(order.createdAt instanceof Date ? order.createdAt : new Date(order.createdAt))}`, LF);
            add('--------------------------------', LF);

            // ── Cliente ───────────────────────────────────────────────────────
            add(`Cliente   : ${order.customer}`, LF);
            add(`Tel       : ${order.customerPhoneNumber}`, LF);
            add(`Dirección : ${order.customerAddress}`, LF);
            add(`Barrio    : ${order.customerNeighborhood}`, LF);
            add('--------------------------------', LF);

            // ── Items ─────────────────────────────────────────────────────────
            add('PEDIDO:', LF);
            const items = Array.isArray(order.order) ? order.order : [];
            items.forEach((i, index) => {
                const qty   = i.quantity || 1;
                const price = Number(i.price).toLocaleString('es-CO');
                add(`${index + 1}. ${i.productTitle} x${qty}`, LF);
                add(`   $${price}`, LF);
                if (i.ingredients)    add(`   ${i.ingredients}`, LF);
                if (i.iceCreamFlavor) add(`   Helado  : ${i.iceCreamFlavor}`, LF);
                if (i.flavor)         add(`   Sabor   : ${i.flavor}`, LF);
                if (i.fruit)          add(`   Fruta   : ${i.fruit}`, LF);
                if (i.juice)          add(`   Jugo    : ${i.juice}`, LF);
                if (i.toppings)       add(`   Toppings: ${i.toppings}`, LF);
                if (i.sauces)         add(`   Salsa   : ${i.sauces}`, LF);
                if (i.notes)          add(`   Notas   : ${i.notes}`, LF);
                if (i.additions)      add(`   Adiciones: ${i.additions.map(a => a.name).join(', ')}`, LF);
            });

            add('--------------------------------', LF);

            // ── Pago y total ──────────────────────────────────────────────────
            add(`Pago : ${order.paymentMethod}`, LF);
            add(ESC, [0x45, 0x01]);                          // negrita ON
            add(`TOTAL: $${Number(order.total).toLocaleString('es-CO')}`, LF);
            add(ESC, [0x45, 0x00]);                          // negrita OFF
            add('* Domicilio no incluido', LF);
            add('--------------------------------', LF);

            // ── Footer centrado ───────────────────────────────────────────────
            add(ESC, [0x61, 0x01]);
            add('Gracias por tu pedido!', LF);
            add('Lun - Dom 12:00 PM - 8:00 PM', LF);
            add(LF, LF, LF);

            // ── Cortar papel ──────────────────────────────────────────────────
            add(GS, [0x56, 0x00]);

            return bytes;
        }

        const ticketBytes  = await buildTicketBytes(order);
        const ticketBase64 = bytesToBase64(ticketBytes);

        await qz.print(config, [{
            type:   'raw',
            format: 'base64',
            data:   ticketBase64
        }]);

        console.log("✅ Ticket impreso correctamente");

    } catch (err) {
        console.error("❌ Error al imprimir:", err);
        alert("Error al imprimir: " + (err.message || err));
    }
}