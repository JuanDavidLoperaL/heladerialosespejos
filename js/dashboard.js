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

// Proteger el dashboard — si no hay sesión, redirigir al login
onAuthStateChanged(auth, (user) => {
    if (!user) {
        window.location.href = 'login.html';
    }
});

const contentFrame = document.getElementById('content-frame');
const btnPedidos = document.getElementById('btn-pedidos');
const btnAnaliticas = document.getElementById('btn-analiticas');
const logoutBtn = document.getElementById('logout-btn');

// Navegación
btnPedidos.addEventListener('click', () => {
    contentFrame.src = 'productOrder.html';
    setActive(btnPedidos);
});

btnAnaliticas.addEventListener('click', () => {
    contentFrame.src = 'businessAnalytics.html';
    setActive(btnAnaliticas);
});

function setActive(btn) {
    document.querySelectorAll('.menu-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
}

// Cerrar sesión
logoutBtn.addEventListener('click', async () => {
    try {
        await signOut(auth);
        window.location.href = 'login.html';
    } catch (error) {
        console.error('Error al cerrar sesión:', error);
    }
});