import { initializeApp } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js";
import { getAuth, signInWithEmailAndPassword, signOut } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js";
import { getFirestore, doc, getDoc } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";

const firebaseConfig = {
    apiKey: "AIzaSyAFylb18Y4e1w7TAEoz3_toyCCHMy8s0xA",
    authDomain: "heladerialosespejos-c645e.firebaseapp.com",
    projectId: "heladerialosespejos-c645e",
    storageBucket: "heladerialosespejos-c645e.firebasestorage.app",
    messagingSenderId: "144529838152",
    appId: "1:144529838152:web:8336516088534940ecc87d",
    measurementId: "G-L36FHJEM67"
};

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

const NO_ACCESS_MESSAGE = 'Tu cuenta no tiene acceso al panel. Pide a un administrador que te lo habilite.';

// Solo entra al dashboard quien esté en config/userRoles con un rol web distinto de "none".
async function hasDashboardAccess(email) {
    const snap = await getDoc(doc(db, 'config', 'userRoles'));
    const users = snap.data()?.users ?? [];
    const entry = users.find(u => u.email?.trim().toLowerCase() === email.toLowerCase());
    return !!entry && entry.role !== 'none';
}

// Referencias al DOM
const emailInput = document.getElementById('login-email');
const passwordInput = document.getElementById('login-password');
const togglePasswordBtn = document.getElementById('toggle-password');
const loginBtn = document.getElementById('login-btn');
const emailError = document.getElementById('email-error');
const passwordError = document.getElementById('password-error');

// Mostrar/ocultar contraseña
togglePasswordBtn.addEventListener('click', () => {
    const isPassword = passwordInput.type === 'password';
    passwordInput.type = isPassword ? 'text' : 'password';
    togglePasswordBtn.textContent = isPassword ? '🙈' : '👁';
});

// Validaciones
function isValidEmail(email) {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

function showError(element, message) {
    element.textContent = message;
    element.style.display = 'block';
}

function clearError(element) {
    element.textContent = '';
    element.style.display = 'none';
}

function validate() {
    let valid = true;
    const email = emailInput.value.trim();
    const password = passwordInput.value.trim();

    clearError(emailError);
    clearError(passwordError);

    if (!email) {
        showError(emailError, 'El correo es obligatorio.');
        valid = false;
    } else if (!isValidEmail(email)) {
        showError(emailError, 'Ingresa un correo válido.');
        valid = false;
    }

    if (!password) {
        showError(passwordError, 'La contraseña es obligatoria.');
        valid = false;
    } else if (password.length < 6) {
        showError(passwordError, 'La contraseña es incorrecta.');
        valid = false;
    }

    return valid;
}

// Login con Firebase
loginBtn.addEventListener('click', async () => {
    if (!validate()) return;

    const email = emailInput.value.trim();
    const password = passwordInput.value.trim();

    loginBtn.textContent = 'Iniciando...';
    loginBtn.disabled = true;

    try {
        const { user } = await signInWithEmailAndPassword(auth, email, password);
        if (!(await hasDashboardAccess(user.email ?? email))) {
            await signOut(auth);
            loginBtn.textContent = 'Iniciar Sesión';
            loginBtn.disabled = false;
            showError(emailError, NO_ACCESS_MESSAGE);
            return;
        }
        loginBtn.textContent = 'Iniciar Sesión';
        loginBtn.disabled = false;
        window.location.href = 'dashboard.html';
    } catch (error) {
        loginBtn.textContent = 'Iniciar Sesión';
        loginBtn.disabled = false;

        switch (error.code) {
            case 'auth/user-not-found':
            case 'auth/wrong-password':
            case 'auth/invalid-credential':
                showError(emailError, 'Correo o contraseña incorrectos.');
                break;
            case 'auth/too-many-requests':
                showError(emailError, 'Demasiados intentos. Intenta más tarde.');
                break;
            default:
                showError(emailError, 'Error al iniciar sesión. Intenta de nuevo.');
        }
    }
});

// Si el dashboard sacó al usuario por falta de acceso, lo explicamos aquí.
if (new URLSearchParams(window.location.search).get('noAccess') === '1') {
    showError(emailError, NO_ACCESS_MESSAGE);
}
