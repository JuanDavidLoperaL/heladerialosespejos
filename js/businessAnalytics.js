import { db } from "./firebase.js";
import { collection, getDocs, getDoc, doc } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";
import { todayString, GASTO_CATEGORIAS } from "./utils.js";

// ── DOM ────────────────────────────────────────────────────────────────────────

const dateFilter    = document.getElementById("date-filter");
const paymentFilter = document.getElementById("payment-filter");
const ordersTodayEl = document.getElementById("orders-today");
const salesTodayEl  = document.getElementById("sales-today");
const avgTicketEl   = document.getElementById("avg-ticket");
const tableBody     = document.getElementById("analytics-table");
const noDataMsg     = document.getElementById("no-data-msg");
const periodFilter  = document.getElementById("period-filter");
const puntoFilter   = document.getElementById("punto-filter");
const weekPickerWrap  = document.getElementById("week-picker-wrap");
const monthPickerWrap = document.getElementById("month-picker-wrap");
const yearPickerWrap  = document.getElementById("year-picker-wrap");
const weekPicker    = document.getElementById("week-picker");
const monthPicker   = document.getElementById("month-picker");
const yearPicker    = document.getElementById("year-picker");
const periodSummary = document.getElementById("period-summary");
const chartLoading  = document.getElementById("chart-loading");
const chartNoData   = document.getElementById("chart-no-data");

// ══════════════════════════════════════════════════════════════════════════════
// SECCIÓN 1 — Resumen diario (lee productOrder/pending/{fecha})
// ══════════════════════════════════════════════════════════════════════════════

function initDateFilter() {
    dateFilter.value = todayString();
}

async function loadAnalytics() {
    const targetDate      = dateFilter.value;
    const selectedPayment = paymentFilter.value;

    let totalOrders = 0;
    let totalSales  = 0;
    let hasAnyDocs  = false;

    // Un pedido impreso vive en "printed" hasta que se marca como entregado, momento en el
    // que pasa a "completed". Sumamos las dos colecciones para que el resumen del día siga
    // contando lo mismo que contaba antes (todo lo que se imprimió ese día).
    for (const collectionName of ["printed", "completed"]) {
        const ordersRef  = collection(db, "productOrder", collectionName, targetDate);
        const ordersSnap = await getDocs(ordersRef);
        if (!ordersSnap.empty) hasAnyDocs = true;

        ordersSnap.forEach(docSnap => {
            const data = docSnap.data();
            if (selectedPayment && data.paymentMethod !== selectedPayment) return;
            totalOrders++;
            totalSales += data.total || 0;
        });
    }

    if (!hasAnyDocs || totalOrders === 0) {
        noDataMsg.style.display = "block";
        tableBody.innerHTML     = "";
    } else {
        noDataMsg.style.display = "none";
        tableBody.innerHTML = `
            <tr>
                <td>${targetDate}</td>
                <td>${totalOrders}</td>
                <td>$${totalSales.toLocaleString()}</td>
            </tr>
        `;
        ordersTodayEl.textContent = totalOrders;
        salesTodayEl.textContent  = `$${totalSales.toLocaleString()}`;
        const avg = totalOrders > 0 ? totalSales / totalOrders : 0;
        avgTicketEl.textContent   = `$${Math.round(avg).toLocaleString()}`;
    }
}

dateFilter.addEventListener("change", loadAnalytics);
paymentFilter.addEventListener("change", loadAnalytics);

initDateFilter();
loadAnalytics();

// ══════════════════════════════════════════════════════════════════════════════
// SECCIÓN 2 — Gráficos históricos
//
// Ventas en $ (Principal y Domicilio): siempre desde financialReporting/{YYYY-MM} — el cajero
// digita el total por método de pago al día en "Ver reporte financiero" para AMBOS puntos, así
// que Ventas/Efectivo/Transferencia en Analíticas cuadran exactamente con esas tarjetas sin
// importar el punto elegido. La cantidad de pedidos es la única cifra que no sale de ahí: solo
// Domicilio la tiene, porque cada pedido de la app pasa por productOrder → analytics/{fecha}
// (Principal nunca se digita pedido por pedido). Por eso las tarjetas y el gráfico de métodos
// de pago cambian de significado (cantidad vs. $) según el punto elegido, y "Pedidos" solo
// aparece cuando el punto incluye Domicilio.
// ══════════════════════════════════════════════════════════════════════════════

let salesChartInstance   = null;
let paymentChartInstance = null;
let gastosChartInstance  = null;
let cachedDailyData      = null;
const frMonthCache       = new Map(); // "YYYY-MM" -> { "DD_punto": {...registro} }

function pad2(n) { return String(n).padStart(2, "0"); }
function toDateStr(d) { return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`; }

const DATE_KEY_RE = /^\d{4}-\d{2}-\d{2}$/;

// Un documento POR FECHA en "analytics" (analytics/{fecha}), en vez del viejo documento único
// "analytics/daily" que compartían todas las fechas del negocio (eso causaba conflictos de
// escritura en horas pico y hacía que muchos pedidos entregados nunca se contabilizaran). El
// doc "daily" se deja de leer — queda como respaldo histórico, sin usarse.
async function fetchDailyData() {
    if (cachedDailyData) return cachedDailyData;
    const snap = await getDocs(collection(db, "analytics"));
    const data = {};
    snap.forEach(docSnap => {
        if (DATE_KEY_RE.test(docSnap.id)) data[docSnap.id] = docSnap.data();
    });
    cachedDailyData = data;
    return cachedDailyData;
}

async function fetchFinancialReportingMonth(ym) {
    if (frMonthCache.has(ym)) return frMonthCache.get(ym);
    const snap = await getDoc(doc(db, "financialReporting", ym));
    const dias = snap.exists() ? (snap.data().dias || {}) : {};
    frMonthCache.set(ym, dias);
    return dias;
}

// Trae y aplana en un solo array todos los registros diarios (de ambos puntos) de los
// meses involucrados en el rango seleccionado.
async function fetchFinancialReportingEntries(months) {
    const monthDocs = await Promise.all(months.map(fetchFinancialReportingMonth));
    const entries   = [];
    monthDocs.forEach(dias => Object.values(dias).forEach(r => entries.push(r)));
    return entries;
}

// ── Rango de fechas según período + selector específico ─────────────────────────
function monthsBetween(start, end) {
    const months = new Set();
    const cur = new Date(start);
    while (cur <= end) {
        months.add(`${cur.getFullYear()}-${pad2(cur.getMonth() + 1)}`);
        cur.setDate(cur.getDate() + 1);
    }
    return [...months];
}

function computeRange(period) {
    if (period === "week") {
        const picked = weekPicker.value || todayString();
        const base   = new Date(picked + "T00:00:00");
        const dow    = base.getDay() === 0 ? 6 : base.getDay() - 1;
        const monday = new Date(base);
        monday.setDate(base.getDate() - dow);
        const sunday = new Date(monday);
        sunday.setDate(monday.getDate() + 6);
        return { start: toDateStr(monday), end: toDateStr(sunday), months: monthsBetween(monday, sunday) };
    }
    if (period === "month") {
        const ym       = monthPicker.value || todayString().slice(0, 7);
        const [y, m]   = ym.split("-").map(Number);
        const lastDay  = new Date(y, m, 0).getDate();
        return { start: `${ym}-01`, end: `${ym}-${pad2(lastDay)}`, months: [ym] };
    }
    // year
    const y      = yearPicker.value || String(new Date().getFullYear());
    const months = Array.from({ length: 12 }, (_, i) => `${y}-${pad2(i + 1)}`);
    return { start: `${y}-01-01`, end: `${y}-12-31`, months };
}

function updatePickerVisibility() {
    const period = periodFilter.value;
    weekPickerWrap.style.display  = period === "week"  ? "" : "none";
    monthPickerWrap.style.display = period === "month" ? "" : "none";
    yearPickerWrap.style.display  = period === "year"  ? "" : "none";
}

function initPickers() {
    weekPicker.value  = todayString();
    monthPicker.value = todayString().slice(0, 7);
    yearPicker.value  = String(new Date().getFullYear());
    updatePickerVisibility();
}

// ── Agregación de ventas ──────────────────────────────────────────────────────
function groupByMonth(entries) {
    const months = {};
    entries.forEach(([fecha, vals]) => {
        const key = fecha.slice(0, 7);
        if (!months[key]) months[key] = { total: 0, orders: 0, efectivo: 0, transferencia: 0 };
        months[key].total         += vals.total         || 0;
        months[key].orders        += vals.orders        || 0;
        months[key].efectivo      += vals.efectivo      || 0;
        months[key].transferencia += vals.transferencia || 0;
    });
    return Object.entries(months).sort(([a], [b]) => a.localeCompare(b));
}

function formatLabel(key, period) {
    const meses = ["ene","feb","mar","abr","may","jun","jul","ago","sep","oct","nov","dic"];
    if (period === "year") {
        const [, m] = key.split("-");
        return meses[parseInt(m) - 1].charAt(0).toUpperCase() + meses[parseInt(m) - 1].slice(1);
    }
    const [, m, d] = key.split("-");
    return `${parseInt(d)} ${meses[parseInt(m) - 1]}`;
}

// Conteo de pedidos de Domicilio: analytics/{fecha} es la única fuente que trae cantidad
// de pedidos reales (financialReporting nunca digita pedido por pedido, en ningún punto).
// Ojo: solo tiene datos desde que se despliegue la migración a "un doc por fecha" — fechas
// anteriores a ese despliegue van a mostrar 0 pedidos aunque sí hubo domicilios ese día.
function buildDomicilioOrdersPerDate(dailyData, start, end) {
    const perDate = {};
    Object.entries(dailyData).forEach(([fecha, vals]) => {
        if (fecha >= start && fecha <= end) perDate[fecha] = { orders: vals.orders || 0 };
    });
    return perDate;
}

// Ventas en $ de un punto, siempre desde financialReporting — la misma fuente que ya usan
// las tarjetas "Punto Principal" / "Punto Domicilio" del Reporte Financiero, para que Ventas
// en Analíticas cuadre exactamente con esas tarjetas sin importar el punto elegido.
function buildFRSalesPerDate(frEntries, punto, start, end) {
    const perDate = {};
    frEntries
        .filter(r => r.punto === punto && r.fecha >= start && r.fecha <= end)
        .forEach(r => {
            const key = r.fecha;
            if (!perDate[key]) perDate[key] = { total: 0, efectivo: 0, transferencia: 0 };
            perDate[key].efectivo      += r.ventasEfectivo      || 0;
            perDate[key].transferencia += r.ventasTransferencia || 0;
            perDate[key].total         += (r.ventasEfectivo || 0) + (r.ventasTransferencia || 0);
        });
    return perDate;
}

// "Todos": suma las ventas en $ de ambos puntos, fecha por fecha.
function sumSalesPerDate(...salesPerDateMaps) {
    const perDate = {};
    const allDates = new Set(salesPerDateMaps.flatMap(m => Object.keys(m)));
    allDates.forEach(fecha => {
        perDate[fecha] = salesPerDateMaps.reduce((acc, m) => {
            const v = m[fecha] || { total: 0, efectivo: 0, transferencia: 0 };
            return {
                total:         acc.total         + (v.total         || 0),
                efectivo:      acc.efectivo      + (v.efectivo      || 0),
                transferencia: acc.transferencia + (v.transferencia || 0)
            };
        }, { total: 0, efectivo: 0, transferencia: 0 });
    });
    return perDate;
}

// Combina las ventas en $ (financialReporting) con el conteo de pedidos (Domicilio, analytics)
// en un solo mapa por fecha — son dos fuentes independientes, por eso se pegan al final.
function mergeSalesWithOrders(salesPerDate, ordersPerDate) {
    const perDate = {};
    const allDates = new Set([...Object.keys(salesPerDate), ...Object.keys(ordersPerDate)]);
    allDates.forEach(fecha => {
        const s = salesPerDate[fecha]  || { total: 0, efectivo: 0, transferencia: 0 };
        const o = ordersPerDate[fecha] || { orders: 0 };
        perDate[fecha] = { total: s.total, efectivo: s.efectivo, transferencia: s.transferencia, orders: o.orders || 0 };
    });
    return perDate;
}

// ── Tarjetas y etiquetas dinámicas según el punto elegido ────────────────────────
function updateCardLabelsAndValues(punto, totals) {
    const cardOrders       = document.getElementById("card-orders");
    const ordersLabel      = document.getElementById("period-orders-label");
    const efectivoLabel    = document.getElementById("period-efectivo-label");
    const transferenciaLabel = document.getElementById("period-transferencia-label");
    const paymentChartLabel = document.getElementById("payment-chart-label");

    document.getElementById("period-sales").textContent = `$${totals.total.toLocaleString()}`;

    if (punto === "principal") {
        // No existe conteo de pedidos para Principal: nunca se digitaron pedido por pedido.
        cardOrders.style.display = "none";
        efectivoLabel.textContent      = "Efectivo ($)";
        transferenciaLabel.textContent = "Transferencia ($)";
        document.getElementById("period-efectivo").textContent      = `$${totals.efectivo.toLocaleString()}`;
        document.getElementById("period-transferencia").textContent = `$${totals.transferencia.toLocaleString()}`;
        paymentChartLabel.textContent = "Ventas por método de pago ($)";
    } else {
        cardOrders.style.display = "";
        ordersLabel.textContent = punto === "all" ? "Pedidos (Domicilio)" : "Pedidos en período";
        efectivoLabel.textContent      = punto === "all" ? "Efectivo (Domicilio)"      : "Efectivo";
        transferenciaLabel.textContent = punto === "all" ? "Transferencia (Domicilio)" : "Transferencia";
        document.getElementById("period-orders").textContent        = totals.orders;
        document.getElementById("period-efectivo").textContent      = totals.efectivo;
        document.getElementById("period-transferencia").textContent = totals.transferencia;
        paymentChartLabel.textContent = punto === "all"
            ? "Pedidos por método de pago (Domicilio)"
            : "Pedidos por método de pago";
    }
}

// ── Gastos por categoría ──────────────────────────────────────────────────────
const CATEGORIA_COLORS = {
    "Nómina":                       "#194073",
    "Frutas":                       "#4CAF50",
    "Helados":                      "#EC407A",
    "Lacteos":                      "#FDD835",
    "Papelería y oficina":          "#8D6E63",
    "Materia prima":                "#F27127",
    "Empaques y desechables":       "#00897B",
    "Publicidad y marketing":       "#AB47BC",
    "Mantenimiento y reparaciones": "#607D8B",
    "Transporte y domicilios":      "#FFA000",
    "Impuestos y contabilidad":     "#C62828",
    "Dotación y uniformes":         "#3949AB",
    "Seguros":                      "#5D4037",
    "Tecnología y software":        "#00ACC1",
    "Servicios públicos":           "#6a1b9a",
    "Arriendo":                     "#9E9D24",
    "Otros":                        "#999999"
};

function aggregateGastosByCategoria(frEntries, punto, start, end) {
    const totals = {};
    let grandTotal = 0;

    frEntries
        .filter(r => r.fecha >= start && r.fecha <= end && (punto === "all" || r.punto === punto))
        .forEach(r => {
            [...(r.gastos || []), ...(r.gastosTransfer || []), ...(r.gastosCajaMayor || [])].forEach(g => {
                const cat = g.categoria || "Otros";
                totals[cat] = (totals[cat] || 0) + (g.monto || 0);
                grandTotal += g.monto || 0;
            });
        });

    return { totals, grandTotal };
}

// Misma base de entradas que aggregateGastosByCategoria (financialReporting), sumando el
// monto facturado a la DIAN — el 19% de eso es el IVA que se resta en "Resultado del período".
function sumFacturacionDian(frEntries, punto, start, end) {
    return frEntries
        .filter(r => r.fecha >= start && r.fecha <= end && (punto === "all" || r.punto === punto))
        .reduce((s, r) => s + (r.facturacionDian || 0), 0);
}

function renderGastosSection(totals, grandTotal) {
    const noDataEl = document.getElementById("gastos-no-data");
    const contentEl = document.getElementById("gastos-content");

    if (grandTotal === 0) {
        noDataEl.style.display  = "block";
        contentEl.style.display = "none";
        return;
    }
    noDataEl.style.display  = "none";
    contentEl.style.display = "block";

    document.getElementById("gastos-total-val").textContent = `$${grandTotal.toLocaleString()}`;

    // Solo se listan las categorías con gasto real en el período (evita una leyenda con
    // categorías en $0 mezcladas en el donut).
    const labels = GASTO_CATEGORIAS.filter(c => (totals[c] || 0) > 0);
    const values = labels.map(c => totals[c]);
    const colors = labels.map(c => CATEGORIA_COLORS[c] || "#999999");

    const tbody = document.getElementById("gastos-tbody");
    tbody.innerHTML = labels
        .map(c => {
            const pct = grandTotal > 0 ? (totals[c] / grandTotal * 100) : 0;
            return `<tr>
                <td>${c}</td>
                <td>$${totals[c].toLocaleString()}</td>
                <td>${pct.toFixed(1)}%</td>
            </tr>`;
        })
        .join("");

    if (gastosChartInstance) gastosChartInstance.destroy();
    gastosChartInstance = new Chart(document.getElementById("gastosChart"), {
        type: "doughnut",
        data: {
            labels,
            datasets: [{
                data: values,
                backgroundColor: colors,
                borderWidth: 2,
                borderColor: "#fff"
            }]
        },
        options: {
            responsive: true,
            plugins: {
                legend: { position: "bottom", labels: { boxWidth: 12, font: { size: 11 } } },
                tooltip: {
                    callbacks: {
                        label: ctx => `${ctx.label}: $${ctx.parsed.toLocaleString()}`
                    }
                }
            }
        }
    });
}

// ── Productos más vendidos ────────────────────────────────────────────────────
// Solo cuentan pedidos en productOrder/completed/{fecha}: antes de entregarse, el cliente (o un
// trabajador por orden del cliente) puede cancelarlo, y los cancelados viven en "cancelled".
// Solo Domicilio tiene pedidos registrados producto por producto — Principal nunca los digita.
// Se cuenta la "quantity" de cada línea (un mismo producto pedido varias veces suma varias
// unidades). Las adiciones dentro de un producto no cuentan; pedidas solas sí, son un producto.
const PRODUCTOS_TOP_N = 10;
let productosChartInstance = null;
let productosRequestId     = 0;
const completedDayCache    = new Map(); // "YYYY-MM-DD" -> [{ name, quantity }]

function escapeHtml(s) {
    return String(s).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}

// Los Sunday se guardan como "Sunday (Fresa)" con el sabor también en "flavor" — se agrupan
// por producto del menú quitando ese sufijo (si no eligieron sabor queda "Sunday ()").
function baseProductName(item) {
    const title  = (item.productTitle || "").trim();
    const flavor = (item.flavor || "").trim();
    const suffix = ` (${flavor})`;
    return title.endsWith(suffix) ? title.slice(0, -suffix.length).trim() : title;
}

function datesBetween(start, end) {
    const dates = [];
    const cur  = new Date(start + "T00:00:00");
    const last = new Date(end   + "T00:00:00");
    while (cur <= last) {
        dates.push(toDateStr(cur));
        cur.setDate(cur.getDate() + 1);
    }
    return dates;
}

async function fetchCompletedItemsForDay(dateStr) {
    if (completedDayCache.has(dateStr)) return completedDayCache.get(dateStr);
    const snap  = await getDocs(collection(db, "productOrder", "completed", dateStr));
    const items = [];
    snap.forEach(docSnap => {
        const lines = docSnap.data().order;
        if (!Array.isArray(lines)) return;
        lines.forEach(line => {
            const name = baseProductName(line);
            if (name) items.push({ name, quantity: Number(line.quantity) || 1 });
        });
    });
    // Hoy todavía pueden entrar pedidos completados — no se cachea.
    if (dateStr !== todayString()) completedDayCache.set(dateStr, items);
    return items;
}

// Una colección por día: se consultan en tandas para no disparar ~365 lecturas a la vez en "Año".
async function aggregateProductos(start, end) {
    const today = todayString();
    const dates = datesBetween(start, end).filter(d => d <= today);
    const counts = {};
    const CHUNK = 31;
    for (let i = 0; i < dates.length; i += CHUNK) {
        const days = await Promise.all(dates.slice(i, i + CHUNK).map(fetchCompletedItemsForDay));
        days.flat().forEach(({ name, quantity }) => {
            counts[name] = (counts[name] || 0) + quantity;
        });
    }
    return counts;
}

// Catálogo actual (productCategories/categories) para cruzarlo con lo vendido y encontrar los
// productos que no se venden. Se lee directo de Firestore (1 lectura por carga de la página) en
// vez del caché de 24h del sitio, para que un producto recién agregado o apagado se refleje ya.
let catalogProductsPromise = null;

function fetchCatalogProducts() {
    if (!catalogProductsPromise) {
        catalogProductsPromise = getDoc(doc(db, "productCategories", "categories"))
            .then(snap => {
                const products = [];
                (snap.exists() ? snap.data().products || [] : []).forEach(cat => {
                    // Las adiciones casi siempre van dentro de otro producto (no cuentan), así
                    // que saldrían "sin ventas" aunque sí se vendan. Lo inactivo no se puede pedir.
                    if (cat.active === false || (cat.title || "").trim().toLowerCase() === "adiciones") return;
                    (cat.items || []).forEach(item => {
                        if (item.active === false || !item.name) return;
                        products.push({ name: item.name.trim(), categoria: cat.title, price: item.price || 0 });
                    });
                });
                return products;
            })
            .catch(err => { catalogProductsPromise = null; throw err; });
    }
    return catalogProductsPromise;
}

// Los dos bloques (más vendidos / sin ventas) comparten carga, filtro de punto y mensajes.
const PRODUCTOS_BLOCKS = ["productos", "sin-ventas"];

function setProductosBlocksState(state, message = "") {
    PRODUCTOS_BLOCKS.forEach(prefix => {
        document.getElementById(`${prefix}-loading`).style.display = state === "loading" ? "block" : "none";
        document.getElementById(`${prefix}-content`).style.display = state === "content" ? "block" : "none";
        const noDataEl = document.getElementById(`${prefix}-no-data`);
        noDataEl.style.display = state === "message" ? "block" : "none";
        if (state === "message") noDataEl.textContent = message;
    });
}

function renderSinVentasSection(counts, catalogProducts) {
    const fmtPrice = p => `$${Number(p).toLocaleString("es-CO")}`;

    const sinVentas = catalogProducts.filter(p => !counts[p.name]);
    const sinVentasBody = document.getElementById("sin-ventas-tbody");
    document.getElementById("sin-ventas-count").textContent = sinVentas.length;
    document.getElementById("sin-ventas-table").style.display = sinVentas.length ? "" : "none";
    document.getElementById("sin-ventas-empty").style.display = sinVentas.length ? "none" : "block";
    sinVentasBody.innerHTML = sinVentas
        .map(p => `<tr>
            <td>${escapeHtml(p.name)}</td>
            <td>${escapeHtml(p.categoria)}</td>
            <td>${fmtPrice(p.price)}</td>
        </tr>`)
        .join("");

    const menosVendidos = catalogProducts
        .filter(p => counts[p.name] > 0)
        .sort((a, b) => counts[a.name] - counts[b.name] || a.name.localeCompare(b.name))
        .slice(0, PRODUCTOS_TOP_N);
    document.getElementById("menos-vendidos-tbody").innerHTML = menosVendidos
        .map(p => `<tr>
            <td>${escapeHtml(p.name)}</td>
            <td>${escapeHtml(p.categoria)}</td>
            <td>${fmtPrice(p.price)}</td>
            <td>${counts[p.name].toLocaleString()}</td>
        </tr>`)
        .join("");
}

async function renderProductosSection(punto, start, end) {
    const requestId = ++productosRequestId;
    const suffix = punto === "all" ? " (Domicilio)" : "";

    document.getElementById("productos-label").textContent  = `Productos más vendidos${suffix}`;
    document.getElementById("sin-ventas-label").textContent = `Productos sin ventas y menos vendidos${suffix}`;
    setProductosBlocksState("loading");

    if (punto === "principal") {
        setProductosBlocksState("message", "Los productos vendidos solo se registran para pedidos de Domicilio.");
        return;
    }

    let counts, catalogProducts;
    try {
        [counts, catalogProducts] = await Promise.all([aggregateProductos(start, end), fetchCatalogProducts()]);
    } catch (err) {
        console.error("Error cargando productos más vendidos:", err);
        if (requestId !== productosRequestId) return;
        setProductosBlocksState("message", "No se pudieron cargar los productos. Intenta de nuevo.");
        return;
    }
    // El usuario cambió el filtro mientras cargaba: este resultado ya no aplica.
    if (requestId !== productosRequestId) return;

    const ranking = Object.entries(counts).sort(([an, a], [bn, b]) => b - a || an.localeCompare(bn));
    const totalUnits = ranking.reduce((s, [, n]) => s + n, 0);

    // Sin ningún pedido completado, todo el catálogo saldría "sin ventas" — no aporta nada.
    if (totalUnits === 0) {
        setProductosBlocksState("message", "Sin pedidos completados para este período.");
        return;
    }
    setProductosBlocksState("content");
    renderSinVentasSection(counts, catalogProducts);

    document.getElementById("productos-total-val").textContent = totalUnits.toLocaleString();
    document.getElementById("productos-tbody").innerHTML = ranking
        .map(([name, n], i) => `<tr>
            <td>${i + 1}</td>
            <td>${escapeHtml(name)}</td>
            <td>${n.toLocaleString()}</td>
            <td>${(n / totalUnits * 100).toFixed(1)}%</td>
        </tr>`)
        .join("");

    const top = ranking.slice(0, PRODUCTOS_TOP_N);
    // Alto fijo por barra para que los nombres no se apiñen con muchos productos.
    document.getElementById("productos-chart-wrap").style.height = `${top.length * 34 + 40}px`;

    if (productosChartInstance) productosChartInstance.destroy();
    productosChartInstance = new Chart(document.getElementById("productosChart"), {
        type: "bar",
        data: {
            labels: top.map(([name]) => name),
            datasets: [{
                label: "Veces vendido",
                data: top.map(([, n]) => n),
                backgroundColor: "rgba(242, 113, 39, 0.8)",
                borderColor: "#F27127",
                borderWidth: 2,
                borderRadius: 6
            }]
        },
        options: {
            indexAxis: "y",
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: { display: false },
                tooltip: {
                    callbacks: {
                        label: ctx => `${ctx.parsed.x.toLocaleString()} vendidos (${(ctx.parsed.x / totalUnits * 100).toFixed(1)}%)`
                    }
                }
            },
            scales: {
                x: { ticks: { precision: 0 }, grid: { color: "#f0f0f0" } },
                y: { grid: { display: false } }
            }
        }
    });
}

// ── Resultado del período (Ventas − Gastos − IVA = Utilidad neta) ───────────────
// Misma fórmula que "Total (STG - GT - GCM)" en financialReporting: Gastos aquí ya
// incluye gastos + gastosTransfer + gastosCajaMayor (GT y GCM son solo gastos que
// entraron por otro medio de pago), así que Ventas - Gastos - IVA = ese mismo total.
function renderResultadoSection(ventasTotal, gastosTotal, ivaTotal) {
    const utilidad = ventasTotal - gastosTotal - ivaTotal;
    const pct = v => ventasTotal > 0 ? `${(v / ventasTotal * 100).toFixed(1)}%` : "—";

    document.getElementById("resultado-ventas-val").textContent   = `$${ventasTotal.toLocaleString()}`;
    document.getElementById("resultado-gastos-val").textContent   = `$${gastosTotal.toLocaleString()}`;
    document.getElementById("resultado-iva-val").textContent      = `$${ivaTotal.toLocaleString()}`;
    document.getElementById("resultado-utilidad-val").textContent = `$${utilidad.toLocaleString()}`;

    document.getElementById("resultado-ventas-pct").textContent   = ventasTotal > 0 ? "100%" : "—";
    document.getElementById("resultado-gastos-pct").textContent   = pct(gastosTotal);
    document.getElementById("resultado-iva-pct").textContent      = pct(ivaTotal);
    document.getElementById("resultado-utilidad-pct").textContent = pct(utilidad);

    document.getElementById("resultado-utilidad-card").classList.toggle("negative", utilidad < 0);

    const gastosBar   = document.getElementById("resultado-bar-gastos");
    const ivaBar      = document.getElementById("resultado-bar-iva");
    const utilidadBar = document.getElementById("resultado-bar-utilidad");

    if (ventasTotal > 0) {
        gastosBar.style.width   = `${Math.min(100, Math.max(0, gastosTotal / ventasTotal * 100))}%`;
        ivaBar.style.width      = `${Math.min(100, Math.max(0, ivaTotal      / ventasTotal * 100))}%`;
        utilidadBar.style.width = `${Math.min(100, Math.max(0, utilidad      / ventasTotal * 100))}%`;
    } else {
        gastosBar.style.width = ivaBar.style.width = utilidadBar.style.width = "0%";
    }
}

// ── Render principal ──────────────────────────────────────────────────────────
async function renderCharts() {
    chartLoading.style.display  = "block";
    periodSummary.style.display = "none";
    chartNoData.style.display   = "none";

    const period = periodFilter.value;
    const punto  = puntoFilter.value; // "all" | "principal" | "domicilio"
    const { start, end, months } = computeRange(period);

    const dailyData = await fetchDailyData();
    const frEntries = await fetchFinancialReportingEntries(months);

    const domicilioOrdersPerDate = buildDomicilioOrdersPerDate(dailyData, start, end);
    const principalSalesPerDate  = buildFRSalesPerDate(frEntries, "principal", start, end);
    const domicilioSalesPerDate  = buildFRSalesPerDate(frEntries, "domicilio", start, end);

    let salesPerDate;
    if (punto === "domicilio")      salesPerDate = domicilioSalesPerDate;
    else if (punto === "principal") salesPerDate = principalSalesPerDate;
    else                             salesPerDate = sumSalesPerDate(principalSalesPerDate, domicilioSalesPerDate);

    // El conteo de pedidos solo existe para Domicilio — Principal nunca lo tiene.
    const ordersPerDate = punto === "principal" ? {} : domicilioOrdersPerDate;
    const perDate = mergeSalesWithOrders(salesPerDate, ordersPerDate);

    // Gastos, IVA y Resultado del período se calculan aparte, directo de financialReporting,
    // sin pasar por perDate (que solo sirve para las ventas de los gráficos de arriba).
    const { totals: gastosPorCategoria, grandTotal: gastosGrandTotal } =
        aggregateGastosByCategoria(frEntries, punto, start, end);
    const ivaTotal    = sumFacturacionDian(frEntries, punto, start, end) * 0.19;
    const ventasTotal = Object.values(perDate).reduce((s, v) => s + (v.total || 0), 0);

    renderGastosSection(gastosPorCategoria, gastosGrandTotal);
    renderResultadoSection(ventasTotal, gastosGrandTotal, ivaTotal);
    // Sin await: en "Año" son muchas lecturas y no deben frenar los gráficos de ventas.
    renderProductosSection(punto, start, end);

    chartLoading.style.display = "none";

    let entries = Object.entries(perDate).sort(([a], [b]) => a.localeCompare(b));
    if (period === "year") entries = groupByMonth(entries);

    if (entries.length === 0) {
        chartNoData.style.display = "block";
        return;
    }

    const totals = entries.reduce((acc, [, v]) => {
        acc.total         += v.total         || 0;
        acc.orders        += v.orders        || 0;
        acc.efectivo      += v.efectivo      || 0;
        acc.transferencia += v.transferencia || 0;
        return acc;
    }, { total: 0, orders: 0, efectivo: 0, transferencia: 0 });

    updateCardLabelsAndValues(punto, totals);
    periodSummary.style.display = "block";

    const labels    = entries.map(([k])   => formatLabel(k, period));
    const salesData = entries.map(([, v]) => v.total         || 0);
    const efectData = entries.map(([, v]) => v.efectivo      || 0);
    const transData = entries.map(([, v]) => v.transferencia || 0);
    const isMoneyBreakdown = punto === "principal"; // Principal: $ · Domicilio/Todos: cantidad de pedidos

    // ── Gráfico ventas ─────────────────────────────────────────────────────
    if (salesChartInstance) salesChartInstance.destroy();
    salesChartInstance = new Chart(document.getElementById("salesChart"), {
        type: "bar",
        data: {
            labels,
            datasets: [{
                label: "Ventas ($)",
                data: salesData,
                backgroundColor: "rgba(25, 64, 115, 0.8)",
                borderColor: "#194073",
                borderWidth: 2,
                borderRadius: 6
            }]
        },
        options: {
            responsive: true,
            plugins: {
                legend: { display: false },
                tooltip: {
                    callbacks: {
                        label: ctx => `$${ctx.parsed.y.toLocaleString()}`
                    }
                }
            },
            scales: {
                y: {
                    ticks: { callback: v => `$${v.toLocaleString()}` },
                    grid:  { color: "#f0f0f0" }
                },
                x: { grid: { display: false } }
            }
        }
    });

    // ── Gráfico métodos de pago (cantidad de pedidos, o $ cuando el punto es Principal) ──
    if (paymentChartInstance) paymentChartInstance.destroy();
    paymentChartInstance = new Chart(document.getElementById("paymentChart"), {
        type: "bar",
        data: {
            labels,
            datasets: [
                {
                    label: "Efectivo",
                    data: efectData,
                    backgroundColor: "rgba(242, 113, 39, 0.8)",
                    borderColor: "#F27127",
                    borderWidth: 2,
                    borderRadius: 6
                },
                {
                    label: "Transferencia",
                    data: transData,
                    backgroundColor: "rgba(39, 166, 154, 0.8)",
                    borderColor: "#27a69a",
                    borderWidth: 2,
                    borderRadius: 6
                }
            ]
        },
        options: {
            responsive: true,
            plugins: {
                legend: { position: "top" },
                tooltip: isMoneyBreakdown
                    ? { callbacks: { label: ctx => `${ctx.dataset.label}: $${ctx.parsed.y.toLocaleString()}` } }
                    : {}
            },
            scales: {
                y: {
                    ticks: isMoneyBreakdown
                        ? { callback: v => `$${v.toLocaleString()}` }
                        : { stepSize: 1 },
                    grid: { color: "#f0f0f0" }
                },
                x: { grid: { display: false } }
            }
        }
    });
}

periodFilter.addEventListener("change", () => {
    updatePickerVisibility();
    renderCharts();
});
weekPicker.addEventListener("change", renderCharts);
monthPicker.addEventListener("change", renderCharts);
yearPicker.addEventListener("change", renderCharts);
puntoFilter.addEventListener("change", renderCharts);

// Cargar mes actual por defecto
initPickers();
renderCharts();