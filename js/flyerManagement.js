import { db, storage } from "./firebase.js";
import { doc, getDoc, setDoc } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";
import { ref, uploadBytes, getDownloadURL, deleteObject } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-storage.js";

// Ruta fija: cada subida reemplaza la anterior, así no quedan archivos huérfanos en Storage.
const STORAGE_PATH = 'flyers/promo';

function flyerDocRef() {
    return doc(db, 'flyerConfig', 'current');
}

function showToast(msg, type = 'success') {
    const t = document.getElementById('fly-toast');
    if (!t) return;
    t.textContent = msg;
    t.className = `fly-toast fly-visible fly-${type}`;
    clearTimeout(t._tid);
    t._tid = setTimeout(() => { t.className = 'fly-toast'; }, 3200);
}

// ── Modal de estado de subida (cargando / éxito / error) ────────────────────
const STATUS_ICONS = { loading: '⏳', success: '✅', error: '❌' };

function showStatus(state, message) {
    const overlay  = document.getElementById('fly-status-modal');
    const icon     = document.getElementById('fly-status-icon');
    const text     = document.getElementById('fly-status-text');
    const closeBtn = document.getElementById('fly-status-close-btn');
    if (!overlay) return;

    icon.textContent = STATUS_ICONS[state] || '';
    text.textContent = message;
    closeBtn.style.display = state === 'loading' ? 'none' : 'block';
    overlay.style.display = 'flex';
}

function hideStatus() {
    const overlay = document.getElementById('fly-status-modal');
    if (overlay) overlay.style.display = 'none';
}

document.getElementById('fly-status-close-btn')?.addEventListener('click', hideStatus);

// Actualiza el estado del checkbox "Mostrar el flyer" y su texto de ayuda,
// para que quede claro por qué está deshabilitado cuando no hay imagen.
function updateToggleAvailability(hasImage) {
    const toggle = document.getElementById('fly-active-toggle');
    const hint   = document.getElementById('fly-toggle-hint');
    if (toggle) toggle.disabled = !hasImage;
    if (hint) {
        hint.textContent = hasImage
            ? 'Puedes desactivarlo temporalmente sin borrar la imagen.'
            : 'Sube una imagen primero para poder activarla.';
    }
}

function renderPreview(imageUrl) {
    const img   = document.getElementById('fly-preview-img');
    const empty = document.getElementById('fly-preview-empty');
    if (!img || !empty) return;

    if (imageUrl) {
        img.src = imageUrl;
        img.style.display = 'block';
        empty.style.display = 'none';
    } else {
        img.removeAttribute('src');
        img.style.display = 'none';
        empty.style.display = 'block';
    }
}

async function loadCurrentFlyer() {
    const toggle = document.getElementById('fly-active-toggle');
    try {
        const snap = await getDoc(flyerDocRef());
        const data = snap.exists() ? snap.data() : {};
        renderPreview(data.imageUrl || '');
        if (toggle) toggle.checked = !!data.activo;
        updateToggleAvailability(!!data.imageUrl);
    } catch (e) {
        console.error('Error cargando configuración del flyer:', e);
        showToast('No se pudo cargar la configuración actual.', 'error');
    }
}

async function uploadFlyer() {
    const input = document.getElementById('fly-file-input');
    const file  = input?.files?.[0];
    if (!file) {
        showToast('Selecciona primero una imagen.', 'error');
        return;
    }

    showStatus('loading', 'Subiendo imagen, un momento...');

    const btn = document.getElementById('fly-btn-upload');
    if (btn) { btn.disabled = true; btn.textContent = 'Subiendo...'; }

    try {
        const storageRef = ref(storage, STORAGE_PATH);
        await uploadBytes(storageRef, file);
        const imageUrl = await getDownloadURL(storageRef);

        await setDoc(flyerDocRef(), {
            activo: true,
            imageUrl,
            updatedAt: new Date().toISOString()
        });

        renderPreview(imageUrl);
        const toggle = document.getElementById('fly-active-toggle');
        if (toggle) toggle.checked = true;
        updateToggleAvailability(true);
        if (input) input.value = '';
        showStatus('success', '¡Listo! El flyer se subió y quedó activado para los clientes.');
    } catch (e) {
        console.error('Error subiendo el flyer:', e);
        showStatus('error', `Ocurrió un error al subir la imagen: ${e.message || e.code || 'error desconocido'}`);
    } finally {
        if (btn) { btn.disabled = false; btn.textContent = '⬆️ Subir imagen'; }
    }
}

async function toggleActive() {
    const toggle = document.getElementById('fly-active-toggle');
    if (!toggle) return;

    try {
        await setDoc(flyerDocRef(), { activo: toggle.checked }, { merge: true });
        showToast(toggle.checked ? 'Flyer activado.' : 'Flyer desactivado (la imagen sigue guardada).');
    } catch (e) {
        console.error('Error actualizando el estado del flyer:', e);
        showToast('No se pudo actualizar el estado.', 'error');
        toggle.checked = !toggle.checked; // revertir el switch visualmente
    }
}

async function removeFlyer() {
    if (!confirm('¿Seguro que quieres quitar el flyer actual? Esto elimina la imagen.')) return;

    try {
        try {
            await deleteObject(ref(storage, STORAGE_PATH));
        } catch (e) {
            if (e.code !== 'storage/object-not-found') throw e;
        }

        await setDoc(flyerDocRef(), { activo: false, imageUrl: '' });

        renderPreview('');
        const toggle = document.getElementById('fly-active-toggle');
        if (toggle) toggle.checked = false;
        updateToggleAvailability(false);
        showToast('Flyer eliminado.');
    } catch (e) {
        console.error('Error quitando el flyer:', e);
        showToast('No se pudo quitar el flyer.', 'error');
    }
}

loadCurrentFlyer();

document.getElementById('fly-btn-upload')?.addEventListener('click', uploadFlyer);
document.getElementById('fly-btn-remove')?.addEventListener('click', removeFlyer);
document.getElementById('fly-active-toggle')?.addEventListener('change', toggleActive);
