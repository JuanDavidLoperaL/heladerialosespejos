import { db } from "./firebase.js";
import { doc, getDoc } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";

// ── Claves y TTL de localStorage ─────────────────────────────────────────────
const CACHE_KEY     = 'hle_catalog_v1';   // catálogo + flavors juntos
const CACHE_TTL     = 24 * 60 * 60 * 1000; // 24 horas — revisar versión después de este tiempo

// ── Orden de categorías en el carrusel ───────────────────────────────────────
const CATEGORY_ORDER = [
    'sunday', 'fresas_con_crema', 'ensaladas', 'salpicones',
    'especialidades', 'bananas', 'cereales', 'brownie',
    'bebidas', 'helado', 'adiciones'
];

// ── Helpers ───────────────────────────────────────────────────────────────────
function titleToKey(title) {
    return title
        .toLowerCase()
        .normalize('NFD').replace(/\p{Mn}/gu, '')
        .replace(/\s+/g, '_');
}

function readLocalCache() {
    try {
        const raw = localStorage.getItem(CACHE_KEY);
        if (!raw) return null;
        return JSON.parse(raw); // { version, ts, catalog, flavors }
    } catch { return null; }
}

function writeLocalCache(version, catalog, flavors) {
    try {
        localStorage.setItem(CACHE_KEY, JSON.stringify({
            version,
            ts: Date.now(),
            catalog,
            flavors
        }));
    } catch {}
}

// ── Parseo del documento de Firestore ────────────────────────────────────────
function parseCatalogDoc(products) {
    const unordered = {};
    const availability = { categories: {} };

    (products || []).forEach(cat => {
        const key = titleToKey(cat.title);
        availability.categories[key] = cat.active !== false;

        unordered[key] = {
            title: cat.title,
            description: cat.description || '',
            cards: (cat.items || []).map(item => ({
                id: item.name,
                title: item.name,
                ingredients: item.ingredients || '',
                bolas: item.bolas || 0,
                toppings: item.toppings || 0,
                hasSauces: item.hasSauces || false,
                price: new Intl.NumberFormat('es-CO').format(item.price || 0),
                rawPrice: item.price || 0,
                image: item.image || '',
                hasAdditions: item.hasAdditions || false,
                active: item.active !== false
            }))
        };
    });

    const categoryData = {};
    CATEGORY_ORDER.forEach(key => { if (unordered[key]) categoryData[key] = unordered[key]; });
    Object.keys(unordered).forEach(key => { if (!categoryData[key]) categoryData[key] = unordered[key]; });

    return { categoryData, availability };
}

// ── Fetchers de Firestore ─────────────────────────────────────────────────────
async function fetchRemoteVersion() {
    const snap = await getDoc(doc(db, 'cacheVersion', 'cache'));
    if (!snap.exists()) return null;
    return snap.data().v || null;
}

async function fetchCatalogFromFirebase() {
    const snap = await getDoc(doc(db, 'productCategories', 'categories'));
    if (!snap.exists()) return { parsed: { categoryData: {}, availability: { categories: {} } }, rawProducts: [] };
    const rawProducts = snap.data().products || [];
    return { parsed: parseCatalogDoc(rawProducts), rawProducts };
}

async function fetchFlavorsFromFirebase() {
    const snap = await getDoc(doc(db, 'productIngredients', 'ingredients'));
    if (!snap.exists()) return { sundayFlavors: [], icecreamFlavors: [], toppingsFlavors: [], saucesFlavors: [], fruitFlavors: [] };
    const d = snap.data();
    return {
        sundayFlavors:   d.sunday   || [],
        icecreamFlavors: d.iceCream || [],
        toppingsFlavors: d.toppings || [],
        saucesFlavors:   d.sauces   || [],
        fruitFlavors:    d.fruit    || []
    };
}

// ── API pública ───────────────────────────────────────────────────────────────

/**
 * Carga catálogo y flavors usando cache con validación de versión.
 *
 * Flujo:
 *   1. Cache existe Y tiene menos de 24h  →  usar cache (0 lecturas Firestore)
 *   2. Cache expirado o no existe         →  leer versión de Firestore (1 lectura)
 *      a. Versión igual al cache          →  refrescar TTL y usar cache (1 lectura total)
 *      b. Versión distinta o sin cache    →  descargar catálogo + flavors y guardar cache (3 lecturas total)
 *
 * @returns {{ categoryData, availability, flavors }}
 */
export async function loadCatalogWithCache() {
    const local = readLocalCache();
    const now   = Date.now();

    // Cache válido dentro del TTL → 0 lecturas
    if (local && (now - local.ts) < CACHE_TTL) {
        return { ...parseCatalogDoc(local.catalog), flavors: local.flavors };
    }

    // Cache expirado o inexistente → revisar versión remota (1 lectura)
    const remoteVersion = await fetchRemoteVersion();

    if (local && remoteVersion && local.version === remoteVersion) {
        // Misma versión → refrescar TTL y reusar datos
        writeLocalCache(local.version, local.catalog, local.flavors);
        return { ...parseCatalogDoc(local.catalog), flavors: local.flavors };
    }

    // Versión nueva o sin cache → descargar todo (2 lecturas más)
    const [{ parsed, rawProducts }, flavors] = await Promise.all([
        fetchCatalogFromFirebase(),
        fetchFlavorsFromFirebase()
    ]);

    const versionToSave = remoteVersion || '0.0.0';
    writeLocalCache(versionToSave, rawProducts, flavors);

    return { ...parsed, flavors };
}

/**
 * Extrae la lista de adiciones desde categoryData ya cargado (sin lecturas extra).
 */
export function getAdditionsFromCatalog(categoryData) {
    const key = Object.keys(categoryData).find(k =>
        categoryData[k].title.toLowerCase() === 'adiciones'
    );
    if (!key) return [];
    return categoryData[key].cards
        .filter(c => c.active)
        .map(c => ({ id: c.id, name: c.title, price: c.rawPrice }));
}
