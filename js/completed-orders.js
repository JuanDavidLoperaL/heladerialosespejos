import { initializeApp } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js";
import {
    getFirestore,
    collection,
    getDocs
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";

// ─── Config ────────────────────────────────────────────────────────────────────

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
const db  = getFirestore(app);

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

// ─── Helpers de fecha ──────────────────────────────────────────────────────────

function todayString() {
    return new Intl.DateTimeFormat('es-CO', {
        timeZone: 'America/Bogota',
        day:   '2-digit',
        month: '2-digit',
        year:  'numeric'
    }).format(new Date()).split('/').reverse().join('-');
}

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

    const efectivo   = orders.filter(o => o.paymentMethod === 'Efectivo').length;
    const transfer   = orders.filter(o => o.paymentMethod !== 'Efectivo').length;

    document.getElementById('summary-orders').textContent   = orders.length;
    document.getElementById('summary-efectivo').textContent = efectivo;
    document.getElementById('summary-transfer').textContent = transfer;

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

// ─── Helpers ───────────────────────────────────────────────────────────────────

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
            const pixels    = imageData.data;
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
                            if (luminance < 128) byte |= (0x80 >> bit);
                        }
                    }
                    imgBytes.push(byte);
                }
            }

            const xL = byteWidth & 0xFF;
            const xH = (byteWidth >> 8) & 0xFF;
            const yL = height & 0xFF;
            const yH = (height >> 8) & 0xFF;

            resolve([0x1D, 0x76, 0x30, 0x00, xL, xH, yL, yH, ...imgBytes]);
        };

        img.onerror = () => {
            console.warn("⚠️ No se pudo cargar el logo — se omitirá del ticket.");
            resolve([]);
        };

        img.src = imagePath;
    });
}

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

    // Logo centrado
    add(ESC, [0x61, 0x01]);
    const logoBytes = await logoToESCBytes('images/logo.png', 400);
    if (logoBytes.length > 0) {
        add(logoBytes);
        add(LF);
    }

    // Reconfigurar codificación
    add(ESC, [0x74, 0x10]);

    // Encabezado
    add(ESC, [0x61, 0x01]);
    add(ESC, [0x45, 0x01]);
    add('Heladeria Los Espejos', LF);
    add(ESC, [0x45, 0x00]);
    add('No es solo un helado', LF);
    add('es tradicion hecha sabor', LF);
    add('--------------------------------', LF);

    // Info pedido
    add(ESC, [0x61, 0x00]);
    add(`Comanda #: ${order.orderNumber}`, LF);
    add(`Fecha: ${formatDate(order.createdAt instanceof Date ? order.createdAt : new Date(order.createdAt))}`, LF);
    add('--------------------------------', LF);

    // Cliente
    add(`Cliente   : ${order.customer}`, LF);
    add(`Tel       : ${order.customerPhoneNumber}`, LF);
    add(`Dirección : ${order.customerAddress}`, LF);
    add(`Barrio    : ${order.customerNeighborhood}`, LF);
    add('--------------------------------', LF);

    // Items
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

    // Pago y total
    add(`Pago : ${order.paymentMethod}`, LF);
    add(ESC, [0x45, 0x01]);
    add(`TOTAL: $${Number(order.total).toLocaleString('es-CO')}`, LF);
    add(ESC, [0x45, 0x00]);
    add('* Domicilio no incluido', LF);
    add('--------------------------------', LF);

    // Footer
    add(ESC, [0x61, 0x01]);
    add('Gracias por tu pedido!', LF);
    add('Lun - Dom 12:00 PM - 8:00 PM', LF);
    add(LF, LF, LF);

    // Cortar papel
    add(GS, [0x56, 0x00]);

    return bytes;
}

// ─── Imprimir por WiFi (QZ Tray) ──────────────────────────────────────────────

async function printTicketWIFI(order) {
    console.log("🖨️ Reimprimiendo pedido completado:", order.orderNumber);

    const qz = window.qz;
    if (!qz) {
        console.error("❌ window.qz no está disponible.");
        alert("QZ Tray no está cargado. Verifica que qz-tray.js esté incluido en la página.");
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

        const config       = qz.configs.create(printerName);
        const ticketBytes  = await buildTicketBytes(order);
        const ticketBase64 = bytesToBase64(ticketBytes);

        await qz.print(config, [{
            type:   'raw',
            format: 'base64',
            data:   ticketBase64
        }]);

        console.log("✅ Ticket reimpreso correctamente");

    } catch (err) {
        console.error("❌ Error al imprimir:", err);
        alert("Error al imprimir: " + (err.message || err));
    }
}