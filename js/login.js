import { initializeApp } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js";
import { getAuth, signInWithEmailAndPassword } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js";

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
        await signInWithEmailAndPassword(auth, email, password);
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