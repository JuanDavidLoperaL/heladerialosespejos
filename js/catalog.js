import { db } from "./firebase.js";
import { doc, getDoc } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";

function titleToKey(title) {
    return title
        .toLowerCase()
        .normalize('NFD').replace(/\p{Mn}/gu, '')
        .replace(/\s+/g, '_');
}

const CATEGORY_ORDER = [
    'sunday', 'fresas_con_crema', 'ensaladas', 'salpicones',
    'especialidades', 'bananas', 'cereales', 'brownie',
    'bebidas', 'helado', 'adiciones'
];

/**
 * Carga el catálogo completo desde productCategories/categories.
 * 1 sola lectura de Firestore.
 * @returns {{ categoryData: object, availability: object }}
 */
export async function loadCatalog() {
    const snap = await getDoc(doc(db, 'productCategories', 'categories'));
    if (!snap.exists()) {
        return { categoryData: {}, availability: { categories: {} } };
    }

    const { products } = snap.data();
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

    // Respetar el orden definido; categorías no listadas van al final
    const categoryData = {};
    CATEGORY_ORDER.forEach(key => { if (unordered[key]) categoryData[key] = unordered[key]; });
    Object.keys(unordered).forEach(key => { if (!categoryData[key]) categoryData[key] = unordered[key]; });

    return { categoryData, availability };
}

/**
 * Extrae la lista de adiciones desde categoryData ya cargado (sin lecturas extra).
 * @param {object} categoryData
 * @returns {{ id: string, name: string, price: number }[]}
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
