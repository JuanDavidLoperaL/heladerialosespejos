import { getFirestore, collection, getDocs, getDoc, doc } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js";

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

// ── DOM ────────────────────────────────────────────────────────────────────────

const dateFilter    = document.getElementById("date-filter");
const paymentFilter = document.getElementById("payment-filter");
const ordersTodayEl = document.getElementById("orders-today");
const salesTodayEl  = document.getElementById("sales-today");
const avgTicketEl   = document.getElementById("avg-ticket");
const tableBody     = document.getElementById("analytics-table");
const noDataMsg     = document.getElementById("no-data-msg");
const periodFilter  = document.getElementById("period-filter");
const periodSummary = document.getElementById("period-summary");
const chartLoading  = document.getElementById("chart-loading");
const chartNoData   = document.getElementById("chart-no-data");

// ── Helpers ────────────────────────────────────────────────────────────────────

function todayString() {
    return new Intl.DateTimeFormat('es-CO', {
        timeZone: 'America/Bogota',
        day:   '2-digit',
        month: '2-digit',
        year:  'numeric'
    }).format(new Date()).split('/').reverse().join('-');
}

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

    const ordersRef  = collection(db, "productOrder", "completed", targetDate);
    const ordersSnap = await getDocs(ordersRef);

    ordersSnap.forEach(docSnap => {
        const data = docSnap.data();
        if (selectedPayment && data.paymentMethod !== selectedPayment) return;
        totalOrders++;
        totalSales += data.total || 0;
    });

    if (ordersSnap.empty || totalOrders === 0) {
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
// SECCIÓN 2 — Gráficos históricos (lee analytics/daily — 1 sola lectura)
// ══════════════════════════════════════════════════════════════════════════════

let salesChartInstance   = null;
let paymentChartInstance = null;
let cachedDailyData      = null;

async function fetchDailyData() {
    if (cachedDailyData) return cachedDailyData;
    const snap      = await getDoc(doc(db, "analytics", "daily"));
    cachedDailyData = snap.exists() ? snap.data() : {};
    return cachedDailyData;
}

function filterByPeriod(data, period) {
    const now   = new Date();
    const year  = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, "0");

    const dayOfWeek = now.getDay() === 0 ? 6 : now.getDay() - 1;
    const monday    = new Date(now);
    monday.setDate(now.getDate() - dayOfWeek);
    monday.setHours(0, 0, 0, 0);

    return Object.entries(data)
        .filter(([fecha]) => {
            if (period === "year")  return fecha.startsWith(`${year}`);
            if (period === "month") return fecha.startsWith(`${year}-${month}`);
            if (period === "week")  return new Date(fecha + "T00:00:00") >= monday;
        })
        .sort(([a], [b]) => a.localeCompare(b));
}

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

async function renderCharts(period) {
    chartLoading.style.display  = "block";
    periodSummary.style.display = "none";
    chartNoData.style.display   = "none";

    const data    = await fetchDailyData();
    let entries   = filterByPeriod(data, period);
    if (period === "year") entries = groupByMonth(entries);

    chartLoading.style.display = "none";

    if (entries.length === 0) {
        chartNoData.style.display = "block";
        return;
    }

    // Totales del período
    const totals = entries.reduce((acc, [, v]) => {
        acc.total         += v.total         || 0;
        acc.orders        += v.orders        || 0;
        acc.efectivo      += v.efectivo      || 0;
        acc.transferencia += v.transferencia || 0;
        return acc;
    }, { total: 0, orders: 0, efectivo: 0, transferencia: 0 });

    document.getElementById("period-orders").textContent        = totals.orders;
    document.getElementById("period-sales").textContent         = `$${totals.total.toLocaleString()}`;
    document.getElementById("period-efectivo").textContent      = totals.efectivo;
    document.getElementById("period-transferencia").textContent = totals.transferencia;

    periodSummary.style.display = "block";

    const labels    = entries.map(([k])    => formatLabel(k, period));
    const salesData = entries.map(([, v])  => v.total         || 0);
    const efectData = entries.map(([, v])  => v.efectivo      || 0);
    const transData = entries.map(([, v])  => v.transferencia || 0);

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

    // ── Gráfico métodos de pago ────────────────────────────────────────────
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
                legend: { position: "top" }
            },
            scales: {
                y: {
                    ticks: { stepSize: 1 },
                    grid:  { color: "#f0f0f0" }
                },
                x: { grid: { display: false } }
            }
        }
    });
}

periodFilter.addEventListener("change", () => {
    cachedDailyData = null; // re-fetch al cambiar período
    renderCharts(periodFilter.value);
});

// Cargar mes actual por defecto
renderCharts("month");