// Ayudas para meter datos en HTML sin riesgo de XSS.
// Archivo aparte (no en utils.js) a propósito: los navegadores guardan en caché los módulos
// sin número de versión; si un script nuevo pidiera una función nueva a un utils.js viejo
// en caché, la página se rompería. Un archivo nuevo nunca está en caché.

// Escapa texto para meterlo en HTML (innerHTML / atributos). Los pedidos los escribe el
// cliente desde la web pública: sin esto, alguien podría poner código en su nombre o
// dirección y ese código correría en el dashboard con la sesión del empleado.
// Usar SIEMPRE que un dato de Firestore o del usuario vaya dentro de un template HTML.
export function escapeHtml(value) {
    if (value == null) return '';
    return String(value)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

// Número seguro para mostrar o sumar (un pedido malicioso podría traer texto en vez de
// número en total, valorDomicilio, coordenadas...).
export function toNumber(value, fallback = 0) {
    const n = Number(value);
    return Number.isFinite(n) ? n : fallback;
}

// Link a Google Maps con las coordenadas del pedido o, si no hay, la dirección.
export function orderMapsUrl(order) {
    const lat = Number(order.customerLatitude);
    const lng = Number(order.customerLongitude);
    if (order.customerLatitude != null && order.customerLongitude != null
        && Number.isFinite(lat) && Number.isFinite(lng)) {
        return `https://www.google.com/maps/search/?api=1&query=${lat},${lng}`;
    }
    return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(order.customerAddress ?? '')}`;
}
