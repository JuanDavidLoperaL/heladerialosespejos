import { initializeApp } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js";
import { getAuth, signOut, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js";

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
const auth = getAuth(app);

const contentFrame = document.getElementById('content-frame');
const btnPedidos = document.getElementById('btn-pedidos');
const btnAnaliticas = document.getElementById('btn-analiticas');
const logoutBtn = document.getElementById('logout-btn');
const btnHowToDoIt = document.getElementById('btn-howtodoit');
const btnPayrollManagement = document.getElementById('btn-payroll-management');

const ADMIN_EMAIL = "adminlosespejos@heladerialosespejos.com";

const pages = {
    pedidos: { html: 'productOrder.html', js: 'js/productOrder.js' },
    analiticas: { html: 'businessAnalytics.html', js: 'js/businessAnalytics.js' },
    howtodoit: { html: 'howToDoIt.html', js: 'js/howToDoIt.js' },
    payrollManagement: { html: 'payrollManagement.html', js: 'js/Payrollmanagement.js' }
};

let currentScript = null;

async function loadPage(page) {
    const user = auth.currentUser;
    const isAdmin = user?.email === ADMIN_EMAIL;

    // Bloquear acceso
    if (!isAdmin && (page === 'analiticas' || page === 'payrollManagement')) {
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

onAuthStateChanged(auth, (user) => {
    if (!user) {
        window.location.href = 'login.html';
        return;
    }

    const isAdmin = user.email === ADMIN_EMAIL;

    configureMenuByRole(isAdmin);

    loadPage('pedidos');
});

function configureMenuByRole(isAdmin) {
    if (!isAdmin) {
        // Ocultar opciones que NO deben ver
        btnAnaliticas.style.display = 'none';
        btnPayrollManagement.style.display = 'none';
    } else {
        // Asegurar que admin sí vea todo
        btnAnaliticas.style.display = 'block';
        btnPayrollManagement.style.display = 'block';
    }
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

logoutBtn.addEventListener('click', async () => {
    try {
        await signOut(auth);
        window.location.href = 'login.html';
    } catch (error) {
        console.error('Error al cerrar sesión:', error);
    }
});