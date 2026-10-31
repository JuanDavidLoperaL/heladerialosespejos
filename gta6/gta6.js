// Página pública de la rifa. No usa Firebase SDK ni sesión: llama directo a la
// Cloud Function publicRaffleLookup (protocolo de callable: POST {data} → {result}).
// La function solo devuelve los números y el nombre enmascarado ("Ana P."), y
// limita las consultas por IP para que nadie recorra celulares en masa.
(function () {
    'use strict';

    var LOOKUP_URL = 'https://us-central1-heladerialosespejos-c645e.cloudfunctions.net/publicRaffleLookup';
    var PHONE_DIGITS = 10;
    var PHONE_GROUPS = [3, 3, 2, 2];

    var form   = document.getElementById('gta-form');
    var input  = document.getElementById('gta-phone');
    var button = document.getElementById('gta-btn');
    var result = document.getElementById('gta-result');

    function phoneDigits(value) {
        return String(value || '').replace(/\D/g, '').slice(0, PHONE_DIGITS);
    }

    function formatPhone(value) {
        var d = phoneDigits(value);
        var parts = [];
        var start = 0;
        for (var i = 0; i < PHONE_GROUPS.length && start < d.length; i++) {
            parts.push(d.slice(start, start + PHONE_GROUPS[i]));
            start += PHONE_GROUPS[i];
        }
        return parts.join('-');
    }

    // Todo se pinta con textContent (nunca innerHTML con datos del servidor).
    function el(tag, className, text) {
        var node = document.createElement(tag);
        if (className) node.className = className;
        if (text != null) node.textContent = text;
        return node;
    }

    function showMessage(text, isError) {
        result.replaceChildren(el('p', isError ? 'gta-error' : 'gta-empty', text));
    }

    function showTickets(data) {
        var title = el('p', 'gta-result-title',
            '¡Hola ' + data.name + '! Tienes ' + data.numbers.length + ' boletas:');
        var list = el('div', 'gta-tickets');
        data.numbers.forEach(function (n) {
            list.appendChild(el('span', 'gta-ticket', n));
        });
        result.replaceChildren(title, list, el('p', 'gta-hint', '¡Mucha suerte! 🍀'));
    }

    input.addEventListener('input', function () {
        input.value = formatPhone(input.value);
    });

    form.addEventListener('submit', function (event) {
        event.preventDefault();
        var phone = phoneDigits(input.value);
        if (phone.length !== PHONE_DIGITS) {
            showMessage('El celular debe tener ' + PHONE_DIGITS + ' dígitos.', true);
            return;
        }

        button.disabled = true;
        showMessage('Consultando…', false);

        fetch(LOOKUP_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ data: { phone: phone } }),
        })
            .then(function (res) { return res.json(); })
            .then(function (body) {
                if (body.error) throw new Error(body.error.message);
                var data = body.result || {};
                if (!data.found) {
                    showMessage('Este celular no tiene boletas registradas.', false);
                } else {
                    showTickets(data);
                }
            })
            .catch(function (error) {
                showMessage(error && error.message ? error.message : 'No se pudo consultar. Intenta de nuevo.', true);
            })
            .finally(function () {
                button.disabled = false;
            });
    });
})();
