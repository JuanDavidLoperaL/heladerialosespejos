import { checkAppVersion, APP_VERSION } from "./appVersioning.js";
checkAppVersion();

import { app, db, auth } from "./firebase.js";
import { doc, setDoc, serverTimestamp } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";
import { getAnalytics, logEvent } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-analytics.js";
import { getAuth, signInAnonymously } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js";
import { getRemoteConfig, fetchAndActivate, getValue } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-remote-config.js";
import { logError, logWarn, logInfo } from "./logger.js";
import { todayString, timeString, isValidColombianPhone, showFeedback, isBeforeOpening } from "./utils.js";
import { loadCatalogWithCache, getAdditionsFromCatalog } from "./catalog.js";

const analytics    = getAnalytics(app);
const remoteConfig = getRemoteConfig(app);
let authReady = false;

signInAnonymously(auth)
    .then(() => {
        authReady = true;
        //logInfo("auth", "Autenticación anónima exitosa");
    })
    .catch((error) => {
        authReady = false;
        //logError("signInAnonymously", "Error en autenticación anónima app v" + APP_VERSION, error);
    });

// Configuración de Remote Config
remoteConfig.settings = {
    minimumFetchIntervalMillis: 5 * 60 * 1000, // Cada 5 Minutos
};
remoteConfig.defaultConfig = {
    save_order_enabled: true
};


let saveOrderEnabled = true;
let flavorsCache = null;
let additionsCache = null;

// Limpiar cache viejo si existe (migración)
try { localStorage.removeItem('hle_flavors_v2'); } catch {}

// ── Skeleton loading ──────────────────────────────────────────────────────────
function showSkeletonLoading() {
    const track = document.getElementById('carousel-track');
    if (track) {
        track.innerHTML = Array(5).fill(
            `<div class="carousel-item skeleton-item" style="
                min-width:80px; height:36px; border-radius:20px;
                background:linear-gradient(90deg,#eee 25%,#f5f5f5 50%,#eee 75%);
                background-size:200% 100%; animation:hle-shimmer 1.2s infinite;
            "></div>`
        ).join('');
    }

    const info = document.getElementById('category-info');
    if (info) {
        info.innerHTML = `
            <style>
              @keyframes hle-shimmer {
                0%   { background-position: 200% 0; }
                100% { background-position: -200% 0; }
              }
              .hle-skel {
                border-radius:8px;
                background:linear-gradient(90deg,#eee 25%,#f5f5f5 50%,#eee 75%);
                background-size:200% 100%;
                animation:hle-shimmer 1.2s infinite;
              }
            </style>
            <div class="hle-skel" style="width:40%;height:28px;margin-bottom:12px;"></div>
            <div class="hle-skel" style="width:70%;height:16px;margin-bottom:24px;"></div>
            <div style="display:flex;gap:16px;flex-wrap:wrap;">
              ${Array(4).fill(`
                <div class="hle-skel" style="width:200px;height:160px;border-radius:12px;"></div>
              `).join('')}
            </div>
        `;
    }
}

function updateFlags() {
    saveOrderEnabled = getValue(remoteConfig, "save_order_enabled").asBoolean();
}

function initRemoteConfig() {
    fetchAndActivate(remoteConfig)
        .then(() => {
            updateFlags();
        })
        .catch((error) => {
            logWarn("initRemoteConfig", "fetch failed, usando defaults", { error: error.message });
        });


    setInterval(() => {
        if (document.visibilityState === 'visible') {
            fetchAndActivate(remoteConfig)
                .then(updateFlags)
                .catch((error) => {
                    logWarn("initRemoteConfig:interval", "fallo refresh silencioso", { error: error.message });
                });
        }
    }, 10 * 60 * 1000);
}

document.addEventListener('DOMContentLoaded', function () {
    initRemoteConfig();

    // =======================
    // TÉRMINOS Y CONDICIONES
    // =======================
    const termsModal = document.getElementById('terms-modal');
    const acceptTermsBtn = document.getElementById('accept-terms-btn');

    if (termsModal && acceptTermsBtn) {
        termsModal.style.display = 'flex';
        document.body.style.overflow = 'hidden';

        acceptTermsBtn.addEventListener('click', () => {
            termsModal.style.display = 'none';
            document.body.style.overflow = 'auto';
        });
    }
    const carouselItems = document.querySelectorAll('.carousel-item');
    const categoryInfo = document.getElementById('category-info');
    const prevBtn = document.querySelector('.prev');
    const nextBtn = document.querySelector('.next');
    const carouselTrack = document.querySelector('.carousel-track');
    const whatsappNumber = "+573007403433";

    // Estado del pedido
    let currentOrder = {
        items: [],
        total: 0,
        customerInfo: {
            name: '',
            phone: '',
            address: '',
            neighborhood: '',
            payment: ''
        }
    };

    // Estado de disponibilidad y catálogo
    let availability = { categories: {} };
    let categoryData = {};

    // Cargar catálogo y flavors (con cache + validación de versión)
    async function loadAvailability() {
        showSkeletonLoading();

        try {
            const result = await loadCatalogWithCache();
            categoryData  = result.categoryData;
            availability  = result.availability;
            flavorsCache  = result.flavors;

            updateCarousel();
        } catch (error) {
            logError("loadAvailability", "Fallo cargando el catálogo app v" + APP_VERSION, error);
        }
    }

    // Obtener adiciones desde el catálogo ya cargado (sin lecturas extra)
    function getAdditionsFromFirebase() {
        if (additionsCache) return additionsCache;
        additionsCache = getAdditionsFromCatalog(categoryData);
        return additionsCache;
    }

    // Actualizar el carrusel según disponibilidad
    function updateCarousel() {
        const track = document.getElementById('carousel-track');
        track.innerHTML = ''; // Limpiar carrusel

        const categories = Object.keys(categoryData);

        categories.forEach((categoryId, index) => {
            const cat = categoryData[categoryId];

            const item = document.createElement('div');
            item.classList.add('carousel-item');
            if (index === 0) item.classList.add('active');
            item.dataset.category = categoryId;
            item.textContent = cat.title || categoryId;

            // Click para cambiar categoría
            item.addEventListener('click', () => {
                document.querySelectorAll('.carousel-item').forEach(el => el.classList.remove('active'));
                item.classList.add('active');
                updateCategoryInfo(categoryId);
            });

            track.appendChild(item);
        });

        // Cargar la primera categoría al inicio
        if (categories.length > 0) {
            updateCategoryInfo(categories[0]);
        }
    }


    // Manejar clic en items del carousel
    carouselItems.forEach(item => {
        item.addEventListener('click', function () {
            if (this.style.display !== 'none') {
                carouselItems.forEach(i => i.classList.remove('active'));
                this.classList.add('active');
                const category = this.getAttribute('data-category');
                updateCategoryInfo(category);
            }
        });
    });

    // Función para actualizar la información de la categoría
    function updateCategoryInfo(category) {
        const message = categoryData[category];

        if (!message) {
            categoryInfo.innerHTML = `<p>Categoría no encontrada.</p>`;
            return;
        }

        if (!availability.categories[category]) {
            categoryInfo.innerHTML = `
                <h2>${message.title}</h2>
                <p>Este producto esta agotado de momento, te invito a probar otro de nuestros deliciosos productos.</p>
            `;
            return;
        }

        // Filtrar productos activos
        const availableCards = message.cards.filter(card => card.active !== false);

        if (availableCards.length === 0) {
            categoryInfo.innerHTML = `
                <h2>${message.title}</h2>
                <p>Actualmente no tenemos productos disponibles en esta categoría.</p>
            `;
            return;
        }
        let cardsHTML = availableCards.map(card => {
            return `
                <div class="product-card" 
                    data-bolas="${card.bolas}"
                    data-toppings="${card.toppings}"
                    data-sauces="${card.hasSauces}" 
                    data-price="${card.price.replace(/\./g, '')}"
                    data-title="${card.title}" 
                    data-ingredients="${card.ingredients}" 
                    data-image="${card.image}"
                    data-has-additions="${card.hasAdditions}"
                    >
                    
                    <h3>${card.title}</h3>
                    <p><strong>Ingredientes: </strong> ${card.ingredients}</p>
                    <p><strong>Valor:</strong> $${card.price}</p>
                    <button class="select-btn">Seleccionar</button>
                </div>
            `;
        }).join('');

        categoryInfo.innerHTML = `
            <h2>${message.title}</h2>
            <p>${message.description}</p>
            <div class="cards-container">
                ${cardsHTML}
            </div>
        `;

        // Agregar event listeners para los botones "Seleccionar"
        document.querySelectorAll('.select-btn').forEach(btn => {
            btn.addEventListener('click', function () {
                // Mostrar overlay
                const overlay = document.getElementById('loading-overlay');
                overlay.style.display = 'flex';

                // Ocultar después de 2 segundos
                setTimeout(() => {
                    overlay.style.display = 'none';
                }, 2000);
                const card = this.closest('.product-card');
                openFlavorSelection(
                    card.dataset.title,
                    card.dataset.ingredients,
                    parseInt(card.dataset.bolas),
                    parseInt(card.dataset.toppings),
                    card.dataset.sauces,
                    card.dataset.price,
                    card.dataset.image,
                    card.dataset.hasAdditions
                );
            });
        });
    }

    function generateAdditionSelect(additionsList) {
        return `
        <div class="flavor-option addition-row">
            <label>Adición:</label>
            <select class="addition-dropdown">
                <option value="">Selecciona una adición</option>
                ${additionsList.map(add => `
                    <option value="${add.price}" data-name="${add.name}">
                        ${add.name} (+$${new Intl.NumberFormat('es-CO').format(add.price)})
                    </option>
                `).join('')}
            </select>
            <button type="button" class="remove-addition">❌</button>
        </div>
    `;
    }

    // Resto de tus funciones (openFlavorSelection, openCustomerInfoModal, etc.) se mantienen igual
    async function openFlavorSelection(title, ingredients, bolas, toppings, hasSauces, price, image, hasAdditions) {
        const { sundayFlavors, icecreamFlavors, toppingsFlavors, saucesFlavors, fruitFlavors } = flavorsCache;
        const additionsList = hasAdditions ? getAdditionsFromFirebase() : [];
        const titleNorm = title.toLowerCase().normalize('NFD').replace(/\p{Mn}/gu, '');
        const isSunday = titleNorm.includes("sunday");
        const sundayIsSpecial = titleNorm.includes("sunday super especial");
        const sundayCount = sundayIsSpecial ? 2 : 1;
        const hasAdditionsBool = hasAdditions === true || hasAdditions === 'true';
        const hasSaucesBool = hasSauces === true || hasSauces === 'true';
        const modal = document.createElement('div');
        const selectJuicePreparation = titleNorm.includes("jugo de");
        const shouldSelectFruit = [
            "banana especial",
            "banana super especial",
            "fresas con crema super especial",
            "sunday super especial",
            "brownie super especial"
        ].includes(titleNorm);
        const bananaShouldSelectFruit = [
            "banana especial",
            "banana super especial"
        ].includes(titleNorm);
        modal.className = 'flavor-modal';
        // Formatear precio a string con punto como miles
        const priceFormatted = new Intl.NumberFormat('es-CO').format(price || 0);

        modal.innerHTML = `
      <div class="modal-content">
          <span class="close-modal">&times;</span>
          <img src="${image}" alt="${title}" class="modal-product-image">
          <h2>${title}</h2>
          
          <div class="ingredients-section">
            <h3>Ingredientes: </h3>
            <p>${ingredients}</p>
          </div>

          <div class="flavor-selection">
          ${isSunday
                ? `
                <h3>Selecciona ${sundayCount > 1 ? `${sundayCount} sabores de Sunday` : 'el sabor del Sunday'}:</h3>
                ${sundayFlavors.length > 0
                    ? Array(sundayCount).fill().map((_, i) => `
                        <div class="flavor-option">
                            <label>Sunday sabor ${i + 1}:</label>
                            <select class="sunday-flavor">
                                ${sundayFlavors.map(f => `<option value="${f}">${f}</option>`).join('')}
                            </select>
                        </div>
                      `).join('')
                    : `<p class="no-flavors">No hay sabores disponibles</p>`
                }
              `
                : ''
            }

            ${shouldSelectFruit
                ? `
                <h3>Selecciona tu fruta:</h3>
                ${fruitFlavors.length > 0
                    ? Array(sundayCount).fill().map((_, i) => `
                        <div class="flavor-option">
                            <select class="fruit-flavor">
                                ${fruitFlavors.map(f => `
                                    <option 
                                    value="${f}" 
                                    ${(
                            bananaShouldSelectFruit &&
                            f.toLowerCase() === "frutos amarillos"
                        ) ? "disabled" : ""}
                                    >
                                ${f}
                                    </option>
                                `).join('')}
                            </select>
                        </div>
                      `).join('')
                    : `<p class="no-flavors">No hay sabores disponibles</p>`
                }
              `
                : ''
            }

            ${selectJuicePreparation
                ? `
                  <h3>Jugo en :</h3>
                  <div class="flavor-option">
                    <select class="juice-preparation">
                      <option value="agua">Agua</option>
                      <option value="leche">Leche</option>
                    </select>
                  </div>
                `
                : ''
            }
             
            ${bolas > 0
                ? `
                <h3>Selecciona tus sabores de helado (${bolas}):</h3>
              `
                : ''
            }
              ${icecreamFlavors.length > 0
                ? Array(bolas).fill().map((_, i) => `
                      <div class="flavor-option">
                          <label>Bola ${i + 1}:</label>
                          <select class="flavor-select">
                              ${icecreamFlavors.map(f => `<option value="${f}">${f}</option>`).join('')}
                          </select>
                      </div>
                  `).join('')
                : `<p class="no-flavors">No hay sabores de helado disponibles</p>`}

                ${toppings > 0
                ? `
                    <h3>Selecciona tus toppings(${toppings}):</h3>
                    ${toppingsFlavors.length > 0
                    ? Array(toppings).fill().map((_, i) => `
                              <div class="flavor-option">
                                  <label>Topping ${i + 1}:</label>
                                  <select class="flavor-select-toppings">
                                      ${toppingsFlavors.map(f => `<option value="${f}">${f}</option>`).join('')}
                                  </select>
                              </div>
                          `).join('')
                    : `<p class="no-flavors">No hay sabores de helado disponibles</p>`}
                  `
                : ''
            }

                ${hasSaucesBool
                ? `
                    <h3>Selecciona la salsa:</h3>
                    ${saucesFlavors.length > 0
                    ? Array(1).fill().map((_, i) => `
                              <div class="flavor-option">
                                  <label>Salsa:</label>
                                  <select class="flavor-select-sauces">
                                      ${saucesFlavors.map(f => `<option value="${f}">${f}</option>`).join('')}
                                  </select>
                              </div>
                          `).join('')
                    : `<p class="no-flavors">No hay sabores de helado disponibles</p>`}
                  `
                : ''
            }
            ${hasAdditionsBool && additionsList.length > 0
                ? `
                <h3>Adiciones:</h3>
                <div id="additions-wrapper">
                ${generateAdditionSelect(additionsList)}
                </div>
                <button type="button" id="add-addition-btn">+ Agregar otra adición</button>
                `
                : ''
            }
          </div>

          <div class="ingredients-section">
            <label>¿Quieres retirar algún ingrediente?</label>
            <input type="text" placeholder="Ejemplo: Retirar queso o Retirar cereal" class="ingredients-notes">
          </div>

          <div class="number-of-items-section">
            <label>¿Cuantos de este mismo producto quieres?</label>
            <input type="number" placeholder="Ejemplo: 1" class="number-items" min="1" step="1" inputmode="numeric" value="1">
          </div>

          <div class="price-section">
              <h3>Total: $${priceFormatted}</h3>
              <button class="add-to-cart">Agregar al Pedido</button>
          </div>
      </div>
        `;

        document.body.appendChild(modal);

        const sundaySelects = modal.querySelectorAll('.sunday-flavor');
        const fruitSelects = modal.querySelectorAll('.fruit-flavor');

        function syncFruitOptions() {
            const selectedSundayFlavors = Array.from(sundaySelects).map(s => s.value.toLowerCase());

            const hasFrutosAmarillos = selectedSundayFlavors.includes('frutos amarillos');

            fruitSelects.forEach(select => {
                select.disabled = hasFrutosAmarillos;

                // opcional: resetear selección si se bloquea
                if (hasFrutosAmarillos) {
                    select.selectedIndex = 0;
                }
            });
        }

        sundaySelects.forEach(select => {
            select.addEventListener('change', syncFruitOptions);
        });
        syncFruitOptions();

        let basePrice = Number(price) || 0;
        let totalElement = modal.querySelector('.price-section h3');

        function updateTotal() {
            const quantity = parseInt(modal.querySelector('.number-items').value) || 1;

            let additionsTotal = 0;

            modal.querySelectorAll('.addition-dropdown').forEach(select => {
                const value = parseInt(select.value);
                if (!isNaN(value)) {
                    additionsTotal += value;
                }
            });

            const total = (basePrice + additionsTotal) * quantity;

            totalElement.textContent = `Total: $${total.toLocaleString('es-CO')}`;
        }

        const additionsWrapper = modal.querySelector('#additions-wrapper');
        const addBtn = modal.querySelector('#add-addition-btn');

        if (addBtn) {
            addBtn.addEventListener('click', () => {
                additionsWrapper.insertAdjacentHTML('beforeend', generateAdditionSelect(additionsList));
            });
        }
        modal.querySelector('.close-modal').addEventListener('click', function () {
            document.body.removeChild(modal);
        });

        modal.querySelector('.number-items').addEventListener('input', updateTotal);

        modal.addEventListener('change', function (e) {
            if (e.target.classList.contains('addition-dropdown')) {
                updateTotal();
            }
        });

        modal.addEventListener('click', function (e) {
            if (e.target.classList.contains('remove-addition')) {
                e.target.closest('.addition-row').remove();
                updateTotal();
            }
        });

        modal.querySelector('.add-to-cart').addEventListener('click', function () {
            let sundayFlavor = '';
            const sundayHelper = isSunday || shouldSelectFruit;
            if (sundayHelper) {
                const sundaySelects = modal.querySelectorAll('.sunday-flavor');
                sundayFlavor = Array.from(sundaySelects).map(s => s.value).join(', ');
            }

            const flavors = [];
            const fruits = [];

            const additions = [];
            let additionsTotal = 0;

            modal.querySelectorAll('.addition-dropdown').forEach(select => {
                const selectedOption = select.options[select.selectedIndex];

                if (select.value) {
                    const price = parseInt(select.value);
                    additions.push({
                        name: selectedOption.dataset.name,
                        price: parseInt(select.value)
                    });
                    additionsTotal += price;
                }
            });

            modal.querySelectorAll('.flavor-select').forEach(select => {
                flavors.push(select.value);
            });

            modal.querySelectorAll('.fruit-flavor').forEach(select => {
                fruits.push(select.value);
            });

            const juicePrepration = [];
            modal.querySelectorAll('.juice-preparation').forEach(select => {
                juicePrepration.push(select.value);
            });

            const toppingsSelected = [];
            modal.querySelectorAll('.flavor-select-toppings').forEach(select => {
                toppingsSelected.push(select.value);
            });

            const sauces = [];
            modal.querySelectorAll('.flavor-select-sauces').forEach(select => {
                sauces.push(select.value);
            });

            const ingredientsNotes = modal.querySelector('.ingredients-notes').value;

            const numberOfItems = Math.max(1, parseInt(modal.querySelector('.number-items').value) || 1);

            if (numberOfItems < 1) {
                showFeedback('La cantidad debe ser al menos 1', 'error');
                return;
            }

            currentOrder.items.push({
                title: sundayHelper ? `${title} (${sundayFlavor})` : title,
                sundayFlavor: sundayHelper ? sundayFlavor : null,
                juiceFlavor: juicePrepration,
                flavors: flavors,
                fruit: fruits,
                toppings: toppingsSelected,
                sauces: sauces,
                ingredients: ingredients,
                ingredientsNotes: ingredientsNotes,
                numberOfItems: numberOfItems,
                additions: additions,
                additionsTotal: additionsTotal,
                price: basePrice + additionsTotal
            });

            currentOrder.total = currentOrder.items.reduce((sum, item) => sum + (item.price * item.numberOfItems), 0);
            updateOrderButton();
            document.body.removeChild(modal);
            showFeedback('¡Producto agregado al pedido!', 'success');
        });
    }

    async function saveOrderToFirebase(orderData) {
        const orderNumber = crypto.randomUUID();
        const displayNumber = orderNumber.split('-')[0].toUpperCase();

        const orderDoc = {
            createdAt: serverTimestamp(),
            customer: orderData.customerInfo.name,
            customerNeighborhood: orderData.customerInfo.neighborhood,
            customerAddress: orderData.customerInfo.address,
            customerPhoneNumber: orderData.customerInfo.phone,
            paymentMethod: orderData.customerInfo.payment,
            total: orderData.total,
            orderNumber: displayNumber,
            order: orderData.items.map(item => ({
                productTitle: item.title,
                flavor: item.sundayFlavor ?? '',
                fruit: item.fruit?.join(', ') ?? '',
                iceCreamFlavor: item.flavors?.join(', ') ?? '',
                ingredients: item.ingredients ?? '',
                juice: item.juiceFlavor?.join(', ') ?? '',
                notes: item.ingredientsNotes ?? '',
                additions: item.additions ?? [],
                price: item.price,
                sauces: item.sauces?.join(', ') ?? '',
                toppings: item.toppings?.join(', ') ?? '',
                quantity: item.numberOfItems
            }))
        };

        await setDoc(
            doc(db, 'productOrder', 'pending', todayString(), orderNumber),
            orderDoc
        );

        return displayNumber;
    }

    function openCustomerInfoModal() {
        const scheduledBanner = isBeforeOpening()
            ? `<div class="scheduled-order-notice">
                   ⏰ <strong>Pedido agendado</strong> — Aún no hemos abierto.
                   Tu pedido quedará registrado y la distribución de productos comienza a la <strong>1:00 PM</strong>.
               </div>`
            : '';

        const modal = document.createElement('div');
        modal.className = 'order-modal';
        modal.innerHTML = `
          <div class="modal-content">
              <span class="close-modal">&times;</span>
              <h2>Confirmar Pedido</h2>
              ${scheduledBanner}
              <div class="order-summary">
                  <h3>Tu Pedido:</h3>
                  <div class="order-items" id="order-items">
                      ${currentOrder.items.map((item, index) => `
                          <div class="order-item" data-index="${index}">
                              <div class="item-info">
                                  <h4>${item.title}</h4>
                                  ${item.title.toLowerCase().normalize('NFD').replace(/\p{Mn}/gu, '').includes("jugo de")
                ? `<p>Jugo en: ${item.juiceFlavor.join(', ')}</p>` : ''
            }
                                  <p>Sabores: ${item.flavors.join(', ')}</p>
                                  ${item.fruit && item.fruit.length > 0
                ? `<p>Fruta: ${item.fruit.join(', ')}</p>`
                : ''}
                                  <p>ingredients: ${item.ingredients}</p>
                                  ${item.toppings && item.toppings.length > 0 ? `<p>Toppings: ${item.toppings.join(', ')}</p>` : ''}
                                  ${item.sauces && item.sauces.length > 0 ? `<p>Salsas: ${item.sauces.join(', ')}</p>` : ''}
                                  ${item.ingredientsNotes ? `<p>Porfavor Retirar: ${item.ingredientsNotes}</p>` : ''}
                                  ${item.additions && item.additions.length > 0
                ? `<p>Adiciones: ${item.additions.map(a => `${a.name} ($${a.price.toLocaleString('es-CO')})`).join(', ')}</p>`
                : ''}
                                  <p>Precio: $${item.price.toLocaleString('es-CO')}</p>
                                  <p>Cuantos de este mismo producto: ${item.numberOfItems}</p>
                              </div>
                              <button class="remove-item">Eliminar</button>
                          </div>
                      `).join('')}
                  </div>
                  <div class="order-total">
                      <h3>Total: $${currentOrder.total.toLocaleString('es-CO')}</h3>
                  </div>
              </div>
              
              <div class="customer-info">
                  <h3>Información de Entrega</h3>
                  <div class="info-field">
                      <label>Nombre completo:</label>
                      <input type="text" id="customer-name" placeholder="Tu nombre" value="${currentOrder.customerInfo.name}" required>
                  </div>
                  
                  <div class="info-field">
                      <label>Teléfono:</label>
                      <input type="tel" id="customer-phone" placeholder="Ej: 3001234567" value="${currentOrder.customerInfo.phone}" required>
                  </div>
                  
                  <div class="info-field">
                      <label>Barrio:</label>
                      <input type="text" id="customer-neighborhood" placeholder="Barrio:" value="${currentOrder.customerInfo.neighborhood}" required>
                  </div>

                  <div class="info-field">
                      <label>Dirección de entrega:</label>
                      <input type="text" id="customer-address" placeholder="Tu dirección completa" value="${currentOrder.customerInfo.address}" required>
                  </div>

                  <div class="info-field">
                    <label>Método de pago:</label>
                    <select id="customer-payment-method" required>
                        <option value="" disabled selected>Seleccione método de pago</option>
                        <option value="Efectivo">Efectivo</option>
                        <option value="Transferencia">Transferencia</option>
                    </select>
                  </div>
              </div>
              <p style="font-size:12px; margin-top:10px;">
                 Al enviar el pedido aceptas los
  <a href="terminos.html" target="_blank">Términos y Condiciones</a>
  y la
  <a href="tratamiento-datos.html" target="_blank">Política de Tratamiento de Datos</a>.
</p>

              <button class="send-whatsapp">Enviar Pedido por WhatsApp</button>
          </div>
      `;

        document.body.appendChild(modal);

        modal.querySelectorAll('.remove-item').forEach(btn => {
            btn.addEventListener('click', function () {
                const itemIndex = parseInt(this.closest('.order-item').getAttribute('data-index'));
                currentOrder.items.splice(itemIndex, 1);
                currentOrder.total = currentOrder.items.reduce((sum, item) => sum + (item.price * item.numberOfItems), 0);

                if (currentOrder.items.length === 0) {
                    document.body.removeChild(modal);
                    showFeedback('Has eliminado todos los productos del pedido', 'error');
                } else {
                    const orderItemsContainer = modal.querySelector('#order-items');
                    orderItemsContainer.innerHTML = currentOrder.items.map((item, index) => `
                      <div class="order-item" data-index="${index}">
                          <div class="item-info">
                              <h4>${item.title}</h4>
                              <p>Sabores: ${item.flavors.join(', ')}</p>
                              <p>ingredients: ${item.ingredients}</p>
                              ${item.ingredientsNotes ? `<p>Porfavor Retirar: ${item.ingredientsNotes}</p>` : ''}
                              <p>Precio: $${item.price.toLocaleString('es-CO')}</p>
                              <p>Cuantos de este mismo producto: ${item.numberOfItems}</p>
                          </div>
                          <button class="remove-item">Eliminar</button>
                      </div>
                  `).join('');
                    modal.querySelector('.order-total h3').textContent = `Total: $${currentOrder.total.toLocaleString('es-CO')}`;
                }
                updateOrderButton();
            });
        });

        modal.querySelector('.close-modal').addEventListener('click', function () {
            document.body.removeChild(modal);
        });

        modal.addEventListener('click', function (e) {
            if (e.target === modal) {
                document.body.removeChild(modal);
            }
        });

        const sendWhatsappBtn = modal.querySelector('.send-whatsapp');

        async function submitOrder() {
            const name         = document.getElementById('customer-name').value.trim();
            const phone        = document.getElementById('customer-phone').value.trim();
            const address      = document.getElementById('customer-address').value.trim();
            const neighborhood = document.getElementById('customer-neighborhood').value.trim();
            const payment      = document.getElementById('customer-payment-method').value.trim();

            if (!name)         { showFeedback('Por favor ingresa tu nombre completo', 'error'); return; }
            if (!phone)        { showFeedback('Por favor ingresa tu número de teléfono', 'error'); return; }
            if (!isValidColombianPhone(phone)) { showFeedback('Por favor ingresa un número de teléfono colombiano válido', 'error'); return; }
            if (!address)      { showFeedback('Por favor ingresa tu dirección de entrega', 'error'); return; }
            if (!neighborhood) { showFeedback('Por favor ingresa tu barrio de entrega', 'error'); return; }
            if (!payment)      { showFeedback('Por favor ingresa tu método de pago', 'error'); return; }

            currentOrder.customerInfo = { name, phone, address, neighborhood, payment };

            // Si es antes de apertura, mostrar popup de confirmación de pedido agendado
            if (isBeforeOpening()) {
                const schedulePopup = document.createElement('div');
                schedulePopup.className = 'schedule-confirm-overlay';
                schedulePopup.innerHTML = `
                    <div class="schedule-confirm-popup">
                        <button class="schedule-confirm-close">&times;</button>
                        <div class="schedule-confirm-icon">⏰</div>
                        <h3>Pedido agendado</h3>
                        <p>
                            Entiendo que la atención al público empieza a las
                            <strong>12:30 PM</strong> y mi pedido queda agendado
                            para entrega a partir de la <strong>1:00 PM</strong>.
                        </p>
                        <button class="schedule-confirm-send">Enviar pedido por WhatsApp</button>
                    </div>
                `;
                document.body.appendChild(schedulePopup);

                schedulePopup.querySelector('.schedule-confirm-close').addEventListener('click', () => {
                    document.body.removeChild(schedulePopup);
                    // Re-habilitar el botón principal para que puedan volver a intentarlo
                    sendWhatsappBtn.disabled = false;
                    sendWhatsappBtn.textContent = '📲 Enviar pedido por WhatsApp';
                });

                schedulePopup.querySelector('.schedule-confirm-send').addEventListener('click', async () => {
                    document.body.removeChild(schedulePopup);
                    await dispatchOrder();
                });

                return;
            }

            await dispatchOrder();
        }

        async function dispatchOrder() {
            sendWhatsappBtn.disabled = true;
            sendWhatsappBtn.textContent = '⏳ Procesando pedido...';

            const whatsappMessage = generateWhatsAppMessage();
            const encodedMessage  = encodeURIComponent(whatsappMessage);
            const whatsappUrl     = `https://wa.me/${whatsappNumber}?text=${encodedMessage}`;

            logEvent(analytics, 'pedido_whatsapp', {
                items_count:    currentOrder.items.length,
                total:          currentOrder.total,
                message_length: whatsappMessage.length,
                user_agent:     navigator.userAgent,
                payment_method: currentOrder.customerInfo.payment,
                neighborhood:   currentOrder.customerInfo.neighborhood,
                order_total:    currentOrder.total,
                app_version:    APP_VERSION
            });

            if (saveOrderEnabled) {
                try {
                    await Promise.race([
                        saveOrderToFirebase(currentOrder),
                        new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), 4000))
                    ]);
                } catch (error) {
                    logError("saveOrderToFirebase", "Fallo guardando pedido en Firebase app " + APP_VERSION, {
                        customerInfo: currentOrder.customerInfo,
                        items:        currentOrder.items,
                        total:        currentOrder.total,
                        authenticated: !!auth.currentUser,
                        code:         error?.code,
                        message:      error?.message,
                        uid:          auth.currentUser?.uid ?? null,
                        online:       navigator.onLine,
                        appVersion:   APP_VERSION
                    });
                }
            }

            document.body.removeChild(modal);
            window.location.href = whatsappUrl;
        }

        sendWhatsappBtn.addEventListener('click', submitOrder);
    }

    function generateWhatsAppMessage() {
        let message = `¡Hola! Quiero hacer un pedido en la Heladeria Los Espejos:\n\n`;
        if (isBeforeOpening()) {
            message += `⏰ *PEDIDO AGENDADO* — La distribución de productos comienza a la 1:00 PM.\n\n`;
        }
        message += `*Pedido:*\n`;
        currentOrder.items.forEach((item, index) => {
            message += `${index + 1}. ${item.title}\n`;
            if (item.sundayFlavor) {
                message += `   *Sabor:* ${item.sundayFlavor}\n`;
            }
            if (item.fruit && item.fruit.length > 0) {
                message += `   *Fruta:* ${item.fruit.join(', ')}\n`;
            }
            if (item.juiceFlavor.length > 0) {
                message += `   *Juego en:* ${item.juiceFlavor.join(', ')}\n`;
            }
            if (item.flavors.length > 0) {
                message += `   *Sabores de helado:* ${item.flavors.join(', ')}\n`;
            }
            message += `   *ingredientes:* ${item.ingredients}\n`;
            if (item.toppings && item.toppings.length > 0) {
                message += `   *Toppings:* ${item.toppings.join(', ')}\n`;
            }
            if (item.sauces && item.sauces.length > 0) {
                message += `   *Salsa:* ${item.sauces.join(', ')}\n`;
            }
            if (item.ingredientsNotes) {
                message += `   *Porfavor Retirar:* ${item.ingredientsNotes}\n`;
            }
            if (item.additions && item.additions.length > 0) {
                message += `   *Adiciones:* ${item.additions.map(a => `${a.name} ($${a.price.toLocaleString('es-CO')})`).join(', ')}\n`;
            }
            message += `   *Quiero: ${item.numberOfItems}* de este producto\n`;
            message += `   *Precio:* $${item.price.toLocaleString('es-CO')}\n\n`;
        });

        message += `*Total productos: $${currentOrder.total.toLocaleString('es-CO')}*\n`;
        message += `*Domicilio no incluido!* Nuestra asesora te dara el precio final con domicilio incluido\n\n`;
        message += `📅 *Fecha:* ${todayString()} — ${timeString()}\n\n`;
        message += `*Mis datos:*\n`;
        message += `*Nombre:* ${currentOrder.customerInfo.name}\n`;
        message += `*Teléfono:* ${currentOrder.customerInfo.phone}\n`;
        message += `*Dirección:* ${currentOrder.customerInfo.address}\n`;
        message += `*Barrio:* ${currentOrder.customerInfo.neighborhood}\n`;
        message += `*Metodo de pago:* ${currentOrder.customerInfo.payment}\n\n`;
        message += `¡Gracias!`;

        return message;
    }

    function updateOrderButton() {
        const btn = document.getElementById('confirm-order-btn');
        const itemCount = currentOrder.items.length;
        btn.textContent = `Confirmar Pedido (${itemCount})`;

        if (itemCount > 0) {
            btn.classList.add('active');
            btn.disabled = false;
        } else {
            btn.classList.remove('active');
            btn.disabled = true;
        }
    }

    document.getElementById('confirm-order-btn').addEventListener('click', function () {
        if (currentOrder.items.length === 0) {
            showFeedback('Por favor agrega al menos un producto a tu pedido', 'error');
        } else {
            openCustomerInfoModal();
        }
    });

    prevBtn.addEventListener('click', () => {
        carouselTrack.scrollBy({ left: -200, behavior: 'smooth' });
    });

    nextBtn.addEventListener('click', () => {
        carouselTrack.scrollBy({ left: 200, behavior: 'smooth' });
    });

    // Inicializar
    loadAvailability();
    updateOrderButton();
});