import { doc, getDoc } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";

// Acceso al dashboard de una persona del personal: { role, defaultPunto } o null.
//
// Fuente: staffByEmail/{email}, copia por email de config/userRoles que mantiene la Cloud
// Function onUserRolesWritten (las reglas de Firestore la usan para saber quién es personal).
// Cada persona solo puede leer la suya. Si no se puede leer (reglas anteriores, antes de
// publicar las nuevas) se usa config/userRoles como antes.
export async function loadStaffEntry(db, email) {
    const key = (email ?? '').trim().toLowerCase();
    if (!key) return null;

    try {
        const snap = await getDoc(doc(db, 'staffByEmail', key));
        if (snap.exists()) {
            const data = snap.data();
            return { role: data.webRole ?? 'default', defaultPunto: data.defaultPunto ?? 'principal' };
        }
    } catch (e) {
        // Permiso denegado con las reglas anteriores: se intenta con config/userRoles.
    }

    try {
        const snap = await getDoc(doc(db, 'config', 'userRoles'));
        const entry = (snap.data()?.users ?? []).find(u => u.email?.trim().toLowerCase() === key);
        return entry ? { role: entry.role ?? 'default', defaultPunto: entry.defaultPunto ?? 'principal' } : null;
    } catch (e) {
        // Con las reglas nuevas solo el admin lee config/userRoles: sin entrada en el índice
        // no hay acceso.
        return null;
    }
}

// Las reglas solo reconocen como personal a cuentas verificadas (las crea o las marca un
// admin desde Equipo; no se envía ningún correo). Si el admin la acaba de marcar, la sesión
// abierta todavía no lo sabe: se recarga la cuenta y se renueva el token.
export async function refreshVerification(user) {
    if (user.emailVerified) return true;
    try {
        await user.reload();
        if (user.emailVerified) {
            await user.getIdToken(true);
            return true;
        }
    } catch (e) {
        console.error('No se pudo revisar la verificación de la cuenta', e);
    }
    return false;
}
