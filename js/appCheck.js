import { initializeAppCheck, ReCaptchaEnterpriseProvider } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-app-check.js";

// Firebase App Check: cada llamada a Firestore, Storage y Functions lleva un token que prueba
// que viene de esta página (reCAPTCHA Enterprise / Fraud Defense, invisible para el cliente:
// sin retos ni casillas) y no de un script.
// MISMO PROPÓSITO en las apps: App Attest (iOS) y Play Integrity (Android).
//
// Clave de reCAPTCHA Enterprise de tipo "sitio web" con puntuación (es pública, va en la
// página; no hay clave secreta). La misma clave se registra en Firebase Console → App Check →
// app web → Fraud Defense. Mientras esté vacía, App Check no se activa y la página funciona
// igual que antes.
const RECAPTCHA_ENTERPRISE_SITE_KEY = "6Ld0bCAuAAAAAD-Ajwe30S70dptL5mo_v1yLRM8f";

let started = false;

export function startAppCheck(app) {
    if (started || !RECAPTCHA_ENTERPRISE_SITE_KEY) return;
    started = true;

    // En localhost reCAPTCHA no sirve: se usa un token de depuración. La consola del navegador
    // muestra "App Check debug token: ..." y se agrega en Firebase Console → App Check →
    // app web → Administrar tokens de depuración.
    const host = window.location.hostname;
    if (host === "localhost" || host === "127.0.0.1") {
        self.FIREBASE_APPCHECK_DEBUG_TOKEN = true;
    }

    try {
        initializeAppCheck(app, {
            provider: new ReCaptchaEnterpriseProvider(RECAPTCHA_ENTERPRISE_SITE_KEY),
            isTokenAutoRefreshEnabled: true,
        });
    } catch (error) {
        // Sin App Check la página sigue funcionando mientras la consola no lo exija.
        console.error("No se pudo iniciar App Check", error);
    }
}
