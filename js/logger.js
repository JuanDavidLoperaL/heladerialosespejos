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
            deviceInfo: getDeviceInfo(),
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

function getDeviceInfo() {

    const userAgent = navigator.userAgent;

    const isIPhone = /iPhone/i.test(userAgent);
    const isIPad = /iPad/i.test(userAgent);
    const isAndroid = /Android/i.test(userAgent);
    const isMac = /Macintosh/i.test(userAgent);
    const isWindows = /Windows/i.test(userAgent);

    let deviceType = "Unknown";

    if (isIPhone) {
        deviceType = "iPhone";
    } else if (isIPad) {
        deviceType = "iPad";
    } else if (isAndroid) {
        deviceType = "Android";
    } else if (isMac) {
        deviceType = "Mac";
    } else if (isWindows) {
        deviceType = "Windows PC";
    }

    let browser = "Unknown";

    if (/CriOS/i.test(userAgent)) {
        browser = "Chrome iOS";
    } else if (/Chrome/i.test(userAgent)) {
        browser = "Chrome";
    } else if (/Safari/i.test(userAgent) && !/Chrome/i.test(userAgent)) {
        browser = "Safari";
    } else if (/Firefox/i.test(userAgent)) {
        browser = "Firefox";
    } else if (/Edg/i.test(userAgent)) {
        browser = "Edge";
    }

    return {
        deviceType,
        browser,
        platform: navigator.platform,
        language: navigator.language,
        userAgent,
        online: navigator.onLine,
        screenWidth: window.screen.width,
        screenHeight: window.screen.height
    };
}