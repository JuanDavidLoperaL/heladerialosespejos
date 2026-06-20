import { auth, db } from "./firebase.js";
import { signOut, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js";
import { doc, getDoc } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";

const toggleBtn = document.getElementById('toggle-sidebar');
const sidebar = document.querySelector('.sidebar');
const contentFrame = document.getElementById('content-frame');
const btnPedidos = document.getElementById('btn-pedidos');
const btnAnaliticas = document.getElementById('btn-analiticas');
const logoutBtn = document.getElementById('logout-btn');
const btnHowToDoIt = document.getElementById('btn-howtodoit');
const btnPayrollManagement = document.getElementById('btn-payroll-management');
const btnCompletedOrders     = document.getElementById('btn-completed-orders');
const btnFinancialReporting  = document.getElementById('btn-financial-reporting');

// ── Roles de usuario (cargados desde Firebase config/userRoles) ───────────────
let userConfigCache = [];   // array de { email, role, defaultPunto }

async function loadUserConfig() {
    if (userConfigCache.length > 0) return;
    try {
        const snap = await getDoc(doc(db, 'config', 'userRoles'));
        userConfigCache = snap.data()?.users ?? [];
    } catch (e) {
        console.error('Error cargando configuración de usuarios:', e);
    }
}

function getUserEntry(email) {
    return userConfigCache.find(u => u.email === email);
}

function getRole(email) {
    return getUserEntry(email)?.role ?? 'default';
}

// Páginas bloqueadas por rol (admin = sin restricciones)
// reporter: accede a financialReporting pero sin ver el resumen del mes (lo controla financialReporting.js)
const RESTRICTED_PAGES = {
    admin:    [],
    manager:  ["analiticas", "payrollManagement"],
    reporter: ["analiticas", "payrollManagement"],
    default:  ["analiticas", "payrollManagement", "financialReporting"],
};

function canAccess(role, page) {
    return !(RESTRICTED_PAGES[role] ?? RESTRICTED_PAGES.default).includes(page);
}

const pages = {
    pedidos: { html: 'productOrder.html', js: 'js/productOrder.js' },
    analiticas: { html: 'businessAnalytics.html', js: 'js/businessAnalytics.js' },
    howtodoit: { html: 'howToDoIt.html', js: 'js/howToDoIt.js' },
    payrollManagement: { html: 'payrollManagement.html', js: 'js/Payrollmanagement.js' },
    completedOrders    : { html: 'completed-orders.html',    js: 'js/completed-orders.js'    },
    financialReporting : { html: 'financialReporting.html',  js: 'js/financialReporting.js'  }
};

let currentScript = null;

async function loadPage(page) {
    const user = auth.currentUser;
    const role = getRole(user?.email);

    if (!canAccess(role, page)) {
        contentFrame.innerHTML = `
            <p style="padding:20px;color:red;">
                No tienes permisos para acceder a esta sección.
            </p>
        `;
        return;
    }

    const { html, js } = pages[page];

    try {
        const response = await fetch(html);
        const text = await response.text();
        const parser = new DOMParser();
        const doc = parser.parseFromString(text, 'text/html');
        contentFrame.innerHTML = doc.body.innerHTML;
    } catch (error) {
        console.error('Error cargando página:', error);
        contentFrame.innerHTML = '<p style="padding:20px;color:red;">Error al cargar la página.</p>';
        return;
    }

    if (currentScript) currentScript.remove();

    const script = document.createElement('script');
    script.type = 'module';
    script.src = `${js}?t=${Date.now()}`;
    document.body.appendChild(script);
    currentScript = script;
}

function setActive(btn) {
    document.querySelectorAll('.menu-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
}

onAuthStateChanged(auth, async (user) => {
    if (!user) {
        window.location.href = 'login.html';
        return;
    }

    await loadUserConfig();

    const entry = getUserEntry(user.email);
    const role  = entry?.role ?? 'default';

    window.currentUserRole         = role;          // disponible para los módulos cargados dinámicamente
    window.currentUserDefaultPunto = entry?.defaultPunto ?? 'principal';

    configureMenuByRole(role);
    loadPage('pedidos');
});

// Mapa página → botón del menú (solo las páginas que pueden restringirse)
const PAGE_BUTTONS = {
    analiticas:         btnAnaliticas,
    payrollManagement:  btnPayrollManagement,
    financialReporting: btnFinancialReporting,
};

function configureMenuByRole(role) {
    const restricted = RESTRICTED_PAGES[role] ?? RESTRICTED_PAGES.default;
    Object.entries(PAGE_BUTTONS).forEach(([page, btn]) => {
        btn.style.display = restricted.includes(page) ? 'none' : 'block';
    });
}

btnPedidos.addEventListener('click', () => {
    loadPage('pedidos');
    setActive(btnPedidos);
});

btnAnaliticas.addEventListener('click', () => {
    loadPage('analiticas');
    setActive(btnAnaliticas);
});

btnHowToDoIt.addEventListener('click', () => {
    loadPage('howtodoit');
    setActive(btnHowToDoIt);
});
btnPayrollManagement.addEventListener('click', () => {
    loadPage('payrollManagement');
    setActive(btnPayrollManagement);
});
btnCompletedOrders.addEventListener('click', () => {
    loadPage('completedOrders');
    setActive(btnCompletedOrders);
});

btnFinancialReporting.addEventListener('click', () => {
    loadPage('financialReporting');
    setActive(btnFinancialReporting);
});

logoutBtn.addEventListener('click', async () => {
    try {
        await signOut(auth);
        window.location.href = 'login.html';
    } catch (error) {
        console.error('Error al cerrar sesión:', error);
    }
});

toggleBtn.addEventListener('click', () => {
    sidebar.classList.toggle('collapsed');
});