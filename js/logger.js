import { initializeApp, getApps } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js";
import { getFirestore, addDoc, collection } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";

const firebaseConfig = {
    apiKey: "AIzaSyAFylb18Y4e1w7TAEoz3_toyCCHMy8s0xA",
    authDomain: "heladerialosespejos-c645e.firebaseapp.com",
    projectId: "heladerialosespejos-c645e",
    storageBucket: "heladerialosespejos-c645e.appspot.com",
    messagingSenderId: "144529838152",
    appId: "1:144529838152:web:8336516088534940ecc87d",
    measurementId: "G-L36FHJEM67"
};

// Reusar la app si ya fue inicializada, si no crear una nueva
const app = getApps().length ? getApps()[0] : initializeApp(firebaseConfig);
const db  = getFirestore(app);

async function saveLog(level, context, message, extra = {}) {
    try {
        await addDoc(collection(db, "logs"), {
            level,
            context,
            message,
            ...extra,
            timestamp: new Date().toISOString(),
            userAgent: navigator.userAgent,
            url:       window.location.href
        });
    } catch (e) {
        console.error("⚠️ No se pudo guardar log:", e);
    }
}

export function logError(context, error, extra = {}) {
    const info = {
        mensaje: error?.message ?? String(error),
        codigo:  error?.code    ?? null,
        ...extra
    };
    console.error(`❌ [${context}]`, info);
    saveLog("error", context, info.mensaje, info);
}

export function logWarn(context, message, extra = {}) {
    console.warn(`⚠️ [${context}]`, message, extra);
    saveLog("warn", context, message, extra);
}

export function logInfo(context, message, extra = {}) {
    console.log(`ℹ️ [${context}]`, message, extra);
    saveLog("info", context, message, extra);
}