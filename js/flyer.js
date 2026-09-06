import { db } from "./firebase.js";
import { doc, getDoc } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";

// ── Flyer promocional (index.html) ───────────────────────────────────────────
// Doc liviano en Firestore que controla si se muestra el flyer y qué imagen usar.
// La imagen en sí vive en Firebase Storage; aquí solo se guarda su URL pública.
const CACHE_KEY = 'hle_flyer_v1';
const CACHE_TTL = 60 * 60 * 1000; // 1 hora

function readCache() {
    try {
        const raw = localStorage.getItem(CACHE_KEY);
        if (!raw) return null;
        return JSON.parse(raw);
    } catch { return null; }
}

function writeCache(data) {
    try {
        localStorage.setItem(CACHE_KEY, JSON.stringify({ ...data, ts: Date.now() }));
    } catch {}
}

/**
 * Devuelve { activo, imageUrl } del flyer actual.
 * Ante cualquier falla (sin red, doc inexistente, permisos, etc.) devuelve
 * activo:false para que la página siga su flujo normal sin flyer.
 *
 * @param {boolean} forceFresh - ignora la caché local (usado en modo prueba,
 * para ver de inmediato los cambios que se hacen desde el dashboard).
 */
export async function loadFlyerConfig(forceFresh = false) {
    if (!forceFresh) {
        const cached = readCache();
        if (cached && (Date.now() - cached.ts) < CACHE_TTL) {
            return { activo: !!cached.activo, imageUrl: cached.imageUrl || '' };
        }
    }

    try {
        const snap = await getDoc(doc(db, 'flyerConfig', 'current'));
        const data = snap.exists() ? snap.data() : {};
        const result = { activo: !!data.activo, imageUrl: data.imageUrl || '' };
        writeCache(result);
        return result;
    } catch {
        return { activo: false, imageUrl: '' };
    }
}
