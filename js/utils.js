export function todayString() {
    return new Intl.DateTimeFormat('es-CO', {
        timeZone: 'America/Bogota',
        day:   '2-digit',
        month: '2-digit',
        year:  'numeric'
    }).format(new Date()).split('/').reverse().join('-');
}

export function formatDate(date) {
    return new Intl.DateTimeFormat('es-CO', {
        timeZone: 'America/Bogota',
        day:    '2-digit',
        month:  '2-digit',
        year:   'numeric',
        hour:   '2-digit',
        minute: '2-digit',
        second: '2-digit',
        hour12: true
    }).format(date);
}

export function timeString() {
    return new Intl.DateTimeFormat('es-CO', {
        timeZone: 'America/Bogota',
        hour:   '2-digit',
        minute: '2-digit',
        hour12: true
    }).format(new Date());
}

export function isBeforeOpening() {
    const hour = parseInt(
        new Intl.DateTimeFormat('es-CO', {
            timeZone: 'America/Bogota',
            hour:   '2-digit',
            hour12: false
        }).format(new Date()),
        10
    );
    return hour < 12;
}

export function isAfterClosing() {
    const parts = new Intl.DateTimeFormat('es-CO', {
        timeZone: 'America/Bogota',
        hour:   '2-digit',
        minute: '2-digit',
        hour12: false
    }).formatToParts(new Date());
    const hour   = parseInt(parts.find(p => p.type === 'hour').value,   10);
    const minute = parseInt(parts.find(p => p.type === 'minute').value, 10);
    return hour > 19 || (hour === 19 && minute >= 40);
}

export function isValidColombianPhone(phone) {
    const regex = /^(?:\+57)?[ -]?(3[0-9]{2}|60[1-8])[ -]?[0-9]{3}[ -]?[0-9]{4}$/;
    return regex.test(phone);
}

export function showFeedback(message, type) {
    const existing = document.querySelector('.order-feedback');
    if (existing) existing.remove();

    const feedback = document.createElement('div');
    feedback.className = `order-feedback ${type}`;
    feedback.textContent = message;
    document.body.appendChild(feedback);

    setTimeout(() => {
        if (document.body.contains(feedback)) document.body.removeChild(feedback);
    }, 3000);
}