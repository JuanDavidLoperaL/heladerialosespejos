// ─── Datos ─────────────────────────────────────────────────────────────────────
// Para agregar un nuevo paso: agrega un objeto { title, text } al array steps.
// Para agregar una nueva sección: agrega un objeto al array SECTIONS.
// Los números se generan automáticamente.

const SECTIONS = [
    {
        id: 'impresora',
        navLabel: '🖨️ Configurar Impresora',
        title: '🖨️ Configurar la Impresora',
        description: 'Cómo conectar la impresora térmica Epson TM-m30III para imprimir tickets de pedidos.',
        note: {
            icon: '💡',
            text: '<strong>Recuerda:</strong> QZ Tray debe estar abierto cada vez que vayas a imprimir. Si el ticket no sale, lo primero es verificar que QZ Tray esté corriendo en la barra de estado.'
        },
        steps: [
            {
                title: 'Descargar el Driver de la epson',
                text: 'Ve al link <code>https://epson.com/Support/sl/s</code>, busca el modelo que necesitas, en nuestro caso la tm-m30III <code>https://epson.com/Support/Point-of-Sale/Thermal-Printers/Epson-TM-m30III-Series/s/SPT_C31CK51001</code>, y descarga el driver correspondiente a tu sistema operativo. Instálalo siguiendo las instrucciones del asistente.'
            },
            {
                title: 'Imprimir desde iPhone o Android',
                text: 'Debes descargar el SDK de epson para tu sistema iOS <code>https://download-center.epson.com/softwares/?device_id=TM-m30III&os=IOS&language=es&region=CO</code> o usa el pod <code>pod ePOS2</code>.'
            },
            {
                title: 'Descargar e instalar QZ Tray',
                text: 'Ve a <code>qz.io</code>, descarga QZ Tray e instálalo en el computador conectado a la impresora. Es el puente entre el navegador y la impresora.'
            },
            {
                title: 'Abrir QZ Tray',
                text: 'Busca QZ Tray en tus aplicaciones y ábrelo. Aparecerá un ícono en la barra de estado (Mac) o en la bandeja del sistema (Windows). Debe estar corriendo siempre que vayas a imprimir.'
            },
            {
                title: 'Conectar la impresora',
                text: 'Conecta la Epson TM-m30III por USB o por WiFi a la misma red del computador. Enciéndela y verifica que el LED de conexión esté estable.'
            },
            {
                title: 'Verificar que el computador reconoce la impresora',
                text: 'En Mac ve a <code>Preferencias del Sistema → Impresoras y Escáneres</code>. Debes ver la Epson TM-m30III en la lista. Si no aparece, presiona <code>+</code> para agregarla.'
            },
            {
                title: 'Probar desde el dashboard',
                text: 'Con QZ Tray abierto, ve a un pedido activo y presiona <strong>🖨 Imprimir</strong>. La primera vez QZ Tray puede pedir permiso para conectarse al sitio — acepta siempre.'
            },
            {
                title: 'Si hay varias impresoras en la lista',
                text: 'Ve a <code>Preferencias del Sistema → Impresoras y Escáneres</code>, selecciona las que no uses y presiona <code>−</code> para eliminarlas. El dashboard usa la primera impresora disponible que no sea una IP.'
            }
        ]
    },
    {
        id: 'nomina',
        navLabel: '💰 Hacer Nómina',
        title: '💰 Hacer Nómina',
        description: 'Proceso para calcular y pagar la nómina del equipo de Los Espejos cada período.',
        note: {
            icon: '⚠️',
            text: '<strong>Importante:</strong> Los aportes del empleador a salud (<code>8.5%</code>), pensión (<code>12%</code>) y ARL se pagan aparte y no se descuentan del salario del empleado. Consúltalo con tu contador.'
        },
        steps: [
            {
                title: 'Reunir las horas trabajadas',
                text: 'Recopila el registro de horas de cada empleado del período. Verifica horas ordinarias, extras diurnas, extras nocturnas y festivos por separado.'
            },
            {
                title: 'Calcular el salario base',
                text: 'Multiplica las horas ordinarias por el valor hora acordado. Para 2025 el salario mínimo diario en Colombia es <code>$57.116</code>. Ajusta según el contrato de cada persona.'
            }
        ]
    }
];

// ─── Render ────────────────────────────────────────────────────────────────────

function buildNav() {
    const nav = document.querySelector('.howto-nav');
    SECTIONS.forEach((section, index) => {
        const a = document.createElement('a');
        a.href = '#';
        a.dataset.section = section.id;
        a.textContent = section.navLabel;
        if (index === 0) a.classList.add('active');
        nav.appendChild(a);
    });
}

function buildSections() {
    const content = document.querySelector('.howto-content');
    SECTIONS.forEach((section, index) => {
        const stepsHTML = section.steps.map((step, i) => `
            <div class="step">
                <div class="step-num">${i + 1}</div>
                <div>
                    <div class="step-title">${step.title}</div>
                    <div class="step-text">${step.text}</div>
                </div>
            </div>
        `).join('');

        const noteHTML = section.note ? `
            <div class="note">
                <span class="note-icon">${section.note.icon}</span>
                <div>${section.note.text}</div>
            </div>
        ` : '';

        const el = document.createElement('section');
        el.className = 'howto-section' + (index === 0 ? ' active' : '');
        el.id = `section-${section.id}`;
        el.innerHTML = `
            <div class="section-header">
                <h2>${section.title}</h2>
                <p>${section.description}</p>
            </div>
            <div class="steps">${stepsHTML}</div>
            ${noteHTML}
        `;
        content.appendChild(el);
    });
}

function bindNav() {
    const navLinks = document.querySelectorAll('.howto-nav a');
    const sections = document.querySelectorAll('.howto-section');

    navLinks.forEach(link => {
        link.addEventListener('click', (e) => {
            e.preventDefault();
            const target = link.dataset.section;

            navLinks.forEach(l => l.classList.remove('active'));
            sections.forEach(s => s.classList.remove('active'));

            link.classList.add('active');
            document.getElementById(`section-${target}`).classList.add('active');
        });
    });
}

// ─── Init ──────────────────────────────────────────────────────────────────────

buildNav();
buildSections();
bindNav();