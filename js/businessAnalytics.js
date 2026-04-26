import { getFirestore, collection, getDocs, doc, getDoc } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";
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
const db = getFirestore(app);

const dateFilter = document.getElementById("date-filter");
const paymentFilter = document.getElementById("payment-filter");
const ordersTodayEl = document.getElementById("orders-today");
const salesTodayEl = document.getElementById("sales-today");
const avgTicketEl = document.getElementById("avg-ticket");
const tableBody = document.getElementById("analytics-table");

function todayString() {
    return new Intl.DateTimeFormat('es-CO', {
        timeZone: 'America/Bogota',
        day:   '2-digit',
        month: '2-digit',
        year:  'numeric'
    }).format(new Date()).split('/').reverse().join('-');
}

// Carga las fechas desde el campo availableDates del documento completed
async function loadAvailableDates() {
    const completedDoc = await getDoc(doc(db, "productOrder", "pending"));

    let dates = [];

    if (completedDoc.exists() && completedDoc.data().availableDates) {
        dates = completedDoc.data().availableDates;
    } else {
        // Fallback: si no existe ese campo, usar solo la fecha de hoy
        const today = todayString();
        dates = [today];
    }

    dates.sort((a, b) => b.localeCompare(a));

    dateFilter.innerHTML = `<option value="">Última disponible</option>`;
    dates.forEach(date => {
        dateFilter.innerHTML += `<option value="${date}">${date}</option>`;
    });

    return dates;
}

async function loadAnalytics() {
    const selectedDate = dateFilter.value;
    const selectedPayment = paymentFilter.value;

    // Obtener fechas disponibles para saber cuál es la última
    const completedDoc = await getDoc(doc(db, "productOrder", "pending"));
    let dates = [];

    if (completedDoc.exists() && completedDoc.data().availableDates) {
        dates = completedDoc.data().availableDates;
        dates.sort((a, b) => b.localeCompare(a));
    } else {
        const today = todayString();
        dates = [today];
    }

    const targetDate = selectedDate || dates[0];

    let totalOrders = 0;
    let totalSales = 0;

    // ✅ Ruta correcta: productOrder/completed/{fecha} como subcolección
    const ordersRef = collection(db, "productOrder", "pending", targetDate);
    const ordersSnap = await getDocs(ordersRef);

    ordersSnap.forEach(docSnap => {
        const data = docSnap.data();
        if (selectedPayment && data.paymentMethod !== selectedPayment) return;
        totalOrders++;
        totalSales += data.total || 0;
    });

    tableBody.innerHTML = `
        <tr>
            <td>${targetDate}</td>
            <td>${totalOrders}</td>
            <td>$${totalSales.toLocaleString()}</td>
        </tr>
    `;

    ordersTodayEl.textContent = totalOrders;
    salesTodayEl.textContent = `$${totalSales.toLocaleString()}`;
    const avg = totalOrders > 0 ? totalSales / totalOrders : 0;
    avgTicketEl.textContent = `$${Math.round(avg).toLocaleString()}`;
}

dateFilter.addEventListener("change", loadAnalytics);
paymentFilter.addEventListener("change", loadAnalytics);

(async () => {
    await loadAvailableDates();
    await loadAnalytics();
})();