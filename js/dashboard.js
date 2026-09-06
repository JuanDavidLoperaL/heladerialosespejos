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
const btnInProcessOrders     = document.getElementById('btn-in-process-orders');
const btnReglamento          = document.getElementById('btn-reglamento');
const btnFlyer               = document.getElementById('btn-flyer');

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
// flyer: solo admin gestiona la publicidad del sitio
const RESTRICTED_PAGES = {
    admin:    [],
    manager:  ["analiticas", "payrollManagement", "flyer"],
    reporter: ["analiticas", "payrollManagement", "flyer"],
    default:  ["analiticas", "payrollManagement", "financialReporting", "flyer"],
};

// Roles de lista blanca: solo pueden acceder a las páginas explícitamente listadas aquí.
// Para darle más acceso a un rol, solo agrega la key de la página (ver objeto `pages`) al arreglo.
const ALLOWED_PAGES = {
    basic: ["howtodoit", "reglamento"],
};

function canAccess(role, page) {
    if (ALLOWED_PAGES[role]) {
        return ALLOWED_PAGES[role].includes(page);
    }
    return !(RESTRICTED_PAGES[role] ?? RESTRICTED_PAGES.default).includes(page);
}

const pages = {
    pedidos: { html: 'productOrder.html', js: 'js/productOrder.js' },
    analiticas: { html: 'businessAnalytics.html', js: 'js/businessAnalytics.js' },
    howtodoit: { html: 'howToDoIt.html', js: 'js/howToDoIt.js' },
    payrollManagement: { html: 'payrollManagement.html', js: 'js/Payrollmanagement.js' },
    completedOrders    : { html: 'completed-orders.html',    js: 'js/completed-orders.js'    },
    financialReporting : { html: 'financialReporting.html',  js: 'js/financialReporting.js'  },
    inProcessOrders    : { html: 'in-process-orders.html',    js: 'js/in-process-orders.js'   },
    reglamento         : { html: 'reglamentoInterno.html',    js: 'js/reglamentoInterno.js'   },
    flyer              : { html: 'flyerManagement.html',      js: 'js/flyerManagement.js'     }
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
        const response = await fetch(`${html}?t=${Date.now()}`);
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

    const initialPage = firstAccessiblePage(role);
    loadPage(initialPage);
    setActive(PAGE_BUTTONS[initialPage]);
});

// Mapa página → botón del menú (define también el orden de "primera página accesible")
const PAGE_BUTTONS = {
    pedidos:            btnPedidos,
    inProcessOrders:    btnInProcessOrders,
    completedOrders:    btnCompletedOrders,
    payrollManagement:  btnPayrollManagement,
    analiticas:         btnAnaliticas,
    financialReporting: btnFinancialReporting,
    howtodoit:          btnHowToDoIt,
    reglamento:         btnReglamento,
    flyer:              btnFlyer,
};

function configureMenuByRole(role) {
    Object.entries(PAGE_BUTTONS).forEach(([page, btn]) => {
        btn.style.display = canAccess(role, page) ? 'block' : 'none';
    });
}

function firstAccessiblePage(role) {
    return Object.keys(PAGE_BUTTONS).find(page => canAccess(role, page)) ?? 'pedidos';
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

btnInProcessOrders.addEventListener('click', () => {
    loadPage('inProcessOrders');
    setActive(btnInProcessOrders);
});

btnFinancialReporting.addEventListener('click', () => {
    loadPage('financialReporting');
    setActive(btnFinancialReporting);
});

btnReglamento.addEventListener('click', () => {
    loadPage('reglamento');
    setActive(btnReglamento);
});

btnFlyer.addEventListener('click', () => {
    loadPage('flyer');
    setActive(btnFlyer);
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