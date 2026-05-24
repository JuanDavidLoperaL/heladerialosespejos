import { formatDate } from "./utils.js";

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

            const canvas = document.createElement('canvas');
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

    add(ESC, [0x40]);

    add(ESC, [0x61, 0x01]);
    const logoBytes = await logoToESCBytes('images/logo.png', 400);
    if (logoBytes.length > 0) { add(logoBytes); add(LF); }

    add(ESC, [0x74, 0x10]);
    add(ESC, [0x61, 0x01]);
    add(ESC, [0x45, 0x01]);
    add('Heladeria Los Espejos', LF);
    add(ESC, [0x45, 0x00]);
    add('No es solo un helado', LF);
    add('es tradicion hecha sabor', LF);
    add('--------------------------------', LF);

    add(ESC, [0x61, 0x00]);
    add(`Comanda #: ${order.orderNumber}`, LF);
    add(`Fecha: ${formatDate(order.createdAt instanceof Date ? order.createdAt : new Date(order.createdAt))}`, LF);
    add('--------------------------------', LF);

    add(`Cliente   : ${order.customer}`, LF);
    add(`Tel       : ${order.customerPhoneNumber}`, LF);
    add(`Dirección : ${order.customerAddress}`, LF);
    add(`Barrio    : ${order.customerNeighborhood}`, LF);
    add('--------------------------------', LF);

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
    add(`Pago : ${order.paymentMethod}`, LF);
    add(ESC, [0x45, 0x01]);
    add(`TOTAL: $${Number(order.total).toLocaleString('es-CO')}`, LF);
    add(ESC, [0x45, 0x00]);
    add('* Domicilio no incluido', LF);
    add('--------------------------------', LF);

    add(ESC, [0x61, 0x01]);
    add('Gracias por tu pedido!', LF);
    add('Lun - Dom 12:00 PM - 8:00 PM', LF);
    add(LF, LF, LF);
    add(GS, [0x56, 0x00]);

    return bytes;
}

export async function printTicketWIFI(order) {
    const qz = window.qz;
    if (!qz) {
        alert("QZ Tray no está cargado. Verifica que qz-tray.js esté incluido en la página.");
        return;
    }

    try {
        qz.security.setCertificatePromise(function (resolve) { resolve(""); });
        qz.security.setSignaturePromise(function (toSign) {
            return function (resolve) { resolve(""); };
        });

        if (!qz.websocket.isActive()) {
            await qz.websocket.connect();
        }

        const printers = await qz.printers.find();
        if (!printers || printers.length === 0) {
            alert("No se encontraron impresoras.");
            return;
        }

        const printerName  = printers.find(p => !/^\d+\.\d+\.\d+\.\d+$/.test(p)) ?? printers[0];
        const config       = qz.configs.create(printerName);
        const ticketBytes  = await buildTicketBytes(order);
        const ticketBase64 = bytesToBase64(ticketBytes);

        await qz.print(config, [{ type: 'raw', format: 'base64', data: ticketBase64 }]);

    } catch (err) {
        console.error("❌ Error al imprimir:", err);
        alert("Error al imprimir: " + (err.message || err));
    }
}