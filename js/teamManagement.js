import { app } from "./firebase.js";
import { getFunctions, httpsCallable } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-functions.js";

// Toda la lectura/escritura de roles pasa por Cloud Functions (staffRoles.ts):
// ellas verifican en el servidor que quien llama sea admin en config/userRoles.
const functions       = getFunctions(app, 'us-central1');
const listStaffFn     = httpsCallable(functions, 'listStaff');
const searchUsersFn   = httpsCallable(functions, 'searchUsers');
const setStaffRoleFn  = httpsCallable(functions, 'setStaffRole');

const APP_ROLE_LABELS = { customer: 'Cliente', employee: 'Empleado' };
const WEB_ROLE_LABELS = {
    admin:    'Admin',
    manager:  'Manager',
    reporter: 'Reportero',
    default:  'Empleado',
    basic:    'Básico',
    none:     'Sin acceso',
};
const PUNTO_LABELS = { principal: '🏪 Principal', domicilio: '🛵 Domicilio' };

let staffCache = [];
let editingEmail = null;

const $ = (id) => document.getElementById(id);

function escapeHtml(value) {
    return String(value ?? '').replace(/[&<>"']/g, c => ({
        '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
    }[c]));
}

function isValidEmail(email) {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

function showToast(msg, type = 'success') {
    const t = $('team-toast');
    if (!t) return;
    t.textContent = msg;
    t.className = `team-toast team-visible team-${type}`;
    clearTimeout(t._tid);
    t._tid = setTimeout(() => { t.className = 'team-toast'; }, 3200);
}

function errorMessage(error) {
    // Los HttpsError de la function ya traen el mensaje en español.
    return error?.message || 'Ocurrió un error. Intenta de nuevo.';
}

// ── Personal actual ─────────────────────────────────────────────────────────
async function loadStaff() {
    const list = $('team-staff-list');
    list.innerHTML = '<p class="team-empty">Cargando…</p>';
    try {
        const { data } = await listStaffFn();
        staffCache = data.staff ?? [];
        renderStaff();
    } catch (error) {
        console.error('listStaff:', error);
        list.innerHTML = `<p class="team-error">${escapeHtml(errorMessage(error))}</p>`;
    }
}

function renderStaff() {
    const list = $('team-staff-list');
    if (staffCache.length === 0) {
        list.innerHTML = '<p class="team-empty">Todavía no hay personal registrado.</p>';
        return;
    }

    list.innerHTML = staffCache.map(member => {
        const isAdmin = member.webRole === 'admin';
        const name = member.displayName ? escapeHtml(member.displayName) : '<span class="team-muted">Sin nombre</span>';
        const appBadge = member.hasAppAccount
            ? `<span class="team-badge team-badge-${escapeHtml(member.appRole)}">📱 ${APP_ROLE_LABELS[member.appRole] ?? escapeHtml(member.appRole)}</span>`
            : `<span class="team-badge team-badge-pending" title="Recibirá este rol cuando se registre en la app">📱 ${APP_ROLE_LABELS[member.appRole] ?? escapeHtml(member.appRole)} · sin cuenta aún</span>`;
        const webBadge = `<span class="team-badge team-badge-web-${escapeHtml(member.webRole)}">💻 ${WEB_ROLE_LABELS[member.webRole] ?? escapeHtml(member.webRole)}</span>`;
        const puntoBadge = member.webRole !== 'none'
            ? `<span class="team-badge">${PUNTO_LABELS[member.defaultPunto] ?? escapeHtml(member.defaultPunto)}</span>`
            : '';
        const action = isAdmin
            ? '<span class="team-lock" title="Solo desde la consola de Firebase">🔒</span>'
            : `<button class="btn-secondary team-edit-btn" data-email="${escapeHtml(member.email)}">Editar</button>`;

        return `
            <div class="team-member">
                <div class="team-member-info">
                    <div class="team-member-name">${name}</div>
                    <div class="team-member-email">${escapeHtml(member.email)}</div>
                    <div class="team-badges">${appBadge}${webBadge}${puntoBadge}</div>
                </div>
                <div class="team-member-action">${action}</div>
            </div>`;
    }).join('');

    list.querySelectorAll('.team-edit-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            const member = staffCache.find(m => m.email === btn.dataset.email);
            if (member) openEditor(member);
        });
    });
}

// ── Búsqueda ────────────────────────────────────────────────────────────────
async function search() {
    const input = $('team-search-input');
    const results = $('team-search-results');
    const query = input.value.trim().toLowerCase();

    if (query.length < 3) {
        results.innerHTML = '<p class="team-error">Escribe al menos 3 letras del correo.</p>';
        return;
    }

    results.innerHTML = '<p class="team-empty">Buscando…</p>';
    try {
        const { data } = await searchUsersFn({ query });
        const users = data.users ?? [];
        const exactMatch = users.some(u => u.email === query);

        let html = users.map(u => {
            const staff = staffCache.find(m => m.email === u.email);
            const isAdmin = staff?.webRole === 'admin';
            return `
                <div class="team-member team-result">
                    <div class="team-member-info">
                        <div class="team-member-name">${u.displayName ? escapeHtml(u.displayName) : '<span class="team-muted">Sin nombre</span>'}</div>
                        <div class="team-member-email">${escapeHtml(u.email)}</div>
                        <div class="team-badges">
                            <span class="team-badge team-badge-${escapeHtml(u.appRole)}">📱 ${APP_ROLE_LABELS[u.appRole] ?? escapeHtml(u.appRole)}</span>
                        </div>
                    </div>
                    <div class="team-member-action">
                        ${isAdmin
                            ? '<span class="team-lock">🔒</span>'
                            : `<button class="btn-primary team-pick-btn" data-email="${escapeHtml(u.email)}">Elegir</button>`}
                    </div>
                </div>`;
        }).join('');

        // Personal que aún no tiene cuenta en la app: se agrega por correo completo.
        if (!exactMatch && isValidEmail(query)) {
            html += `
                <div class="team-member team-result team-result-new">
                    <div class="team-member-info">
                        <div class="team-member-email">${escapeHtml(query)}</div>
                        <div class="team-muted">No tiene cuenta en la app todavía.</div>
                    </div>
                    <div class="team-member-action">
                        <button class="btn-primary team-pick-btn" data-email="${escapeHtml(query)}">Agregar</button>
                    </div>
                </div>`;
        }

        results.innerHTML = html || '<p class="team-empty">No encontramos usuarios con ese correo. Escribe el correo completo para agregarlo.</p>';

        results.querySelectorAll('.team-pick-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                const email = btn.dataset.email;
                const staff = staffCache.find(m => m.email === email);
                const user  = users.find(u => u.email === email);
                openEditor(staff ?? {
                    email,
                    appRole: 'employee',
                    webRole: 'default',
                    defaultPunto: 'principal',
                    hasAppAccount: !!user,
                });
            });
        });
    } catch (error) {
        console.error('searchUsers:', error);
        results.innerHTML = `<p class="team-error">${escapeHtml(errorMessage(error))}</p>`;
    }
}

// ── Editor ──────────────────────────────────────────────────────────────────
function syncPuntoVisibility() {
    $('team-punto-group').style.display = $('team-web-role').value === 'none' ? 'none' : 'block';
}

function openEditor(member) {
    editingEmail = member.email;
    $('team-modal-email').textContent = member.email;
    $('team-app-role').value = member.appRole ?? 'customer';
    $('team-web-role').value = member.webRole ?? 'none';
    $('team-punto').value    = member.defaultPunto ?? 'principal';
    $('team-modal-error').style.display = 'none';
    syncPuntoVisibility();
    $('team-modal').style.display = 'flex';
}

function closeEditor() {
    editingEmail = null;
    $('team-modal').style.display = 'none';
}

async function save() {
    if (!editingEmail) return;

    const appRole      = $('team-app-role').value;
    const webRole      = $('team-web-role').value;
    const defaultPunto = $('team-punto').value;

    const summary = `${editingEmail}\n\n📱 App: ${APP_ROLE_LABELS[appRole]}\n💻 Panel web: ${WEB_ROLE_LABELS[webRole]}`;
    if (!confirm(`¿Confirmas este cambio?\n\n${summary}`)) return;

    const saveBtn = $('team-modal-save');
    const errorEl = $('team-modal-error');
    saveBtn.disabled = true;
    saveBtn.textContent = 'Guardando…';
    errorEl.style.display = 'none';

    try {
        await setStaffRoleFn({ email: editingEmail, appRole, webRole, defaultPunto });
        closeEditor();
        $('team-search-results').innerHTML = '';
        $('team-search-input').value = '';
        showToast('✅ Acceso actualizado');
        await loadStaff();
    } catch (error) {
        console.error('setStaffRole:', error);
        errorEl.textContent = errorMessage(error);
        errorEl.style.display = 'block';
    } finally {
        saveBtn.disabled = false;
        saveBtn.textContent = 'Guardar';
    }
}

// ── Init ────────────────────────────────────────────────────────────────────
$('team-search-btn').addEventListener('click', search);
$('team-search-input').addEventListener('keydown', (e) => {
    if (e.key === 'Enter') search();
});
$('team-refresh-btn').addEventListener('click', loadStaff);
$('team-web-role').addEventListener('change', syncPuntoVisibility);
$('team-modal-cancel').addEventListener('click', closeEditor);
$('team-modal-save').addEventListener('click', save);
$('team-modal').addEventListener('click', (e) => {
    if (e.target.id === 'team-modal') closeEditor();
});

loadStaff();
