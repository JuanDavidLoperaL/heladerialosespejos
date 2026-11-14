import { auth, db } from "./firebase.js";
import { signOut, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js";
import { loadStaffEntry, refreshVerification } from "./staffAccess.js";

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
const btnEquipo              = document.getElementById('btn-equipo');
const btnRifa                = document.getElementById('btn-rifa');

// ── Rol del usuario (lista del personal, ver staffAccess.js) ──────────────────
let currentEntry = null;   // { role, defaultPunto } del usuario con sesión

function getRole() {
    return currentEntry?.role ?? 'default';
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
    basic: ["howtodoit", "reglamento", "rifa"],
};

// Páginas exclusivas de admin, sin importar qué roles se agreguen en el futuro.
const ADMIN_ONLY_PAGES = ["equipo"];

function canAccess(role, page) {
    if (ADMIN_ONLY_PAGES.includes(page)) {
        return role === 'admin';
    }
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
    flyer              : { html: 'flyerManagement.html',      js: 'js/flyerManagement.js'     },
    equipo             : { html: 'teamManagement.html',       js: 'js/teamManagement.js'      },
    rifa               : { html: 'raffle.html',               js: 'js/raffle.js'              }
};

let currentScript = null;

async function loadPage(page) {
    const user = auth.currentUser;
    const role = getRole();

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

    const entry = user.isAnonymous ? null : await loadStaffEntry(db, user.email);

    // Sin entrada en la lista del personal (o con rol "none") no hay acceso al panel.
    if (!entry || entry.role === 'none') {
        await signOut(auth);
        window.location.href = 'login.html?noAccess=1';
        return;
    }
    currentEntry = entry;

    const role  = entry.role ?? 'default';
    document.body.style.visibility = 'visible';

    // Cuenta sin verificar: las reglas no le muestran pedidos ni datos hasta que un admin la
    // verifique en Equipo (no se envía ningún correo).
    if (!(await refreshVerification(user))) {
        showUnverifiedBanner(role === 'admin');
    }

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
    rifa:               btnRifa,
    flyer:              btnFlyer,
    equipo:             btnEquipo,
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

btnEquipo.addEventListener('click', () => {
    loadPage('equipo');
    setActive(btnEquipo);
});

btnRifa.addEventListener('click', () => {
    loadPage('rifa');
    setActive(btnRifa);
});

logoutBtn.addEventListener('click', async () => {
    try {
        await signOut(auth);
        window.location.href = 'login.html';
    } catch (error) {
        console.error('Error al cerrar sesión:', error);
    }
});

// En celular el sidebar es un menú desplegable (ver media query en dashboard.css).
const mobileQuery = window.matchMedia('(max-width: 768px)');

toggleBtn.addEventListener('click', () => {
    sidebar.classList.toggle(mobileQuery.matches ? 'open' : 'collapsed');
});

// Al elegir una sección en celular, cerramos el menú para mostrar el contenido.
document.querySelectorAll('.sidebar .menu-btn').forEach(btn => {
    btn.addEventListener('click', () => {
        if (mobileQuery.matches) sidebar.classList.remove('open');
    });
});
// Aviso fijo arriba cuando la cuenta no está verificada.
function showUnverifiedBanner(isAdmin) {
    const banner = document.createElement('div');
    banner.className = 'unverified-banner';
    banner.textContent = isAdmin
        ? '⚠️ Tu cuenta no está verificada. Entra a Equipo y usa "Verificar cuentas existentes" (incluye la tuya); luego vuelve a iniciar sesión.'
        : '⚠️ Tu cuenta no está verificada, por eso no ves los pedidos. Pide a un administrador que la verifique en Equipo y vuelve a iniciar sesión.';
    banner.style.cssText = 'position:sticky;top:0;z-index:1000;background:#fff3cd;color:#664d03;'
        + 'border-bottom:1px solid #ffe69c;padding:10px 16px;font-size:14px;text-align:center;';
    document.body.prepend(banner);
}
