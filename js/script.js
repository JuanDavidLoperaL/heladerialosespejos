import { initializeApp } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js";
import { getFirestore, collection, doc, getDocs, getDoc } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";

// Configuración de Firebase
const firebaseConfig = {
    apiKey: "AIzaSyAFylb18Y4e1w7TAEoz3_toyCCHMy8s0xA",
    authDomain: "heladerialosespejos-c645e.firebaseapp.com",
    projectId: "heladerialosespejos-c645e",
    storageBucket: "heladerialosespejos-c645e.appspot.com",
    messagingSenderId: "144529838152",
    appId: "1:144529838152:web:8336516088534940ecc87d",
    measurementId: "G-L36FHJEM67"
};

// Inicializar Firebase
const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

// Terminos y condiciones 
const termsModal = document.getElementById('terms-modal');
const acceptTermsBtn = document.getElementById('accept-terms-btn');


document.addEventListener('DOMContentLoaded', function () {
    
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

    // Estado de disponibilidad
    let availability = {
        categories: {},
        products: {}
    };

    // Datos base de productos
    let categoryData = {};  // Aquí guardarás título, descripción y productos por categoría

    // Cargar disponibilidad desde Firebase
    async function loadAvailability() {
        try {
            const categoriesSnapshot = await getDocs(collection(db, 'categories'));

            // Usar Promise.all para esperar a cargar productos de todas categorías
            const promises = [];

            categoriesSnapshot.forEach(doc => {
                const catId = doc.id;
                const catData = doc.data();

                availability.categories[catId] = catData.active || false;

                // Guardar título y descripción para la categoría
                categoryData[catId] = {
                    title: catData.title || '',
                    description: catData.description || '',
                    cards: []  // productos
                };

                // Cargar productos y guardar la promesa para esperar después
                const p = loadProducts(catId);
                promises.push(p);
            });
            console.log("Los valores que tengo son:", categoryData);
            // Esperar a que se terminen de cargar todos los productos
            await Promise.all(promises);
            await sortProducts()
            console.log("Los valores que tengo son:", categoryData);
            updateCarousel();
        } catch (error) {
            console.error("Error loading availability:", error);

            // Manejo de error: podrías decidir qué hacer aquí, por ejemplo marcar todo como activo
        }
    }


    // Cargar productos de Sunday
    async function loadProducts(categoryId) {
        try {
            const productsSnapshot = await getDocs(collection(db, `categories/${categoryId}/products`));

            categoryData[categoryId].cards = []; // vaciar antes de agregar

            productsSnapshot.forEach(doc => {
                const product = doc.data();

                availability.products[doc.id] = product.active || false;

                // Formatear precio a string con punto como miles
                const priceFormatted = new Intl.NumberFormat('es-CO').format(product.price || 0);

                // Agregar producto a categoryData para esa categoría
                categoryData[categoryId].cards.push({
                    id: doc.id,
                    title: product.title || '',
                    ingredients: product.ingredients || '',
                    bolas: product.bolas || 0,
                    toppings: product.toppings || 0,
                    hasSauces: product.hasSauces || false,
                    price: priceFormatted,
                    image: product.images || '',
                });
            });
        } catch (error) {
            console.error(`Error loading ${categoryId} products:`, error);
            // Manejar error si quieres
        }
    }

    // ordenar productos segun requrimientos - [ ] Sunday, fresas, ensaladas, salpicón especialidades
    async function sortProducts() {
        try {
            // Orden deseado
            const orden = [
                "sunday",
                "fresas",
                "ensaladas",
                "salpicon",
                "especialidades",
                "helado",
                "bananas",
                "bebidas",
                "cereales",
                "brownie",
                "adiciones"
            ];

            const categoriesOrdered = {};
            orden.forEach(key => {
                if (categoryData[key]) {
                    categoriesOrdered[key] = categoryData[key];
                }
            });

            categoryData = categoriesOrdered

        } catch (error) {
            console.error(`Error sorting products`, error);
        }
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
        const availableCards = message.cards.filter(card => availability.products[card.id] !== false);

        if (availableCards.length === 0) {
            categoryInfo.innerHTML = `
                <h2>${message.title}</h2>
                <p>Actualmente no tenemos productos disponibles en esta categoría.</p>
            `;
            return;
        }
        let cardsHTML = availableCards.map(card => {
            const hasToppings = card.toppings > 0;
            return `
                <div class="product-card" 
                    data-bolas="${card.bolas}"
                    data-toppings="${card.toppings}"
                    data-sauces="${card.hasSauces}" 
                    data-price="${card.price.replace('.', '')}" 
                    data-title="${card.title}" 
                    data-ingredients="${card.ingredients}" 
                    data-image="${card.image}">
                    
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
                    card.dataset.image
                );
            });
        });
    }

    async function getFlavorsFromFirebase() {
        const sundayDoc = await getDoc(doc(db, "flavors", "sunday"));
        const icecreamDoc = await getDoc(doc(db, "flavors", "icecream"));
        const toppingsDoc = await getDoc(doc(db, "toppings", "products"));
        const saucesDoc = await getDoc(doc(db, "flavors", "sauces"));
        return {
            sundayFlavors: sundayDoc.exists() ? sundayDoc.data().flavors : [],
            icecreamFlavors: icecreamDoc.exists() ? icecreamDoc.data().flavors : [],
            toppingsFlavors: toppingsDoc.exists() ? toppingsDoc.data().toppings : [],
            saucesFlavors: saucesDoc.exists() ? saucesDoc.data().flavors : []
        };
    }

    // Resto de tus funciones (openFlavorSelection, openCustomerInfoModal, etc.) se mantienen igual
    async function openFlavorSelection(title, ingredients, bolas, toppings, hasSauces, price, image) {
        const { sundayFlavors, icecreamFlavors, toppingsFlavors, saucesFlavors } = await getFlavorsFromFirebase();
        const isSunday = title.toLowerCase().includes("sunday");
        const sundayIsSpecial = title.toLowerCase().includes("sunday super especial");
        const sundayCount = sundayIsSpecial ? 2 : 1;
        const hasSaucesBool = hasSauces === true || hasSauces === 'true';
        const modal = document.createElement('div');
        const selectJuicePreparation = title.toLowerCase().includes("jugo de");
        const shouldSelectFruit = [
            "banana especial",
            "banana super especial",
            "fresas con crema super especial"
        ].includes(title.toLowerCase());
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
                ${sundayFlavors.length > 0
                    ? Array(sundayCount).fill().map((_, i) => `
                        <div class="flavor-option">
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
          </div>

          <div class="ingredients-section">
            <label>¿Quieres adicionar ó retirar algún ingrediente?</label>
            <input type="text" placeholder="Ejemplo: Adicionar mas queso o retirar queso" class="ingredients-notes">
          </div>
          
          <div class="price-section">
              <h3>Total: $${priceFormatted}</h3>
              <button class="add-to-cart">Agregar al Pedido</button>
          </div>
      </div>
    `;

        document.body.appendChild(modal);

        modal.querySelector('.close-modal').addEventListener('click', function () {
            document.body.removeChild(modal);
        });

        modal.addEventListener('click', function (e) {
            if (e.target === modal) {
                document.body.removeChild(modal);
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
            modal.querySelectorAll('.flavor-select').forEach(select => {
                flavors.push(select.value);
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

            currentOrder.items.push({
                title: sundayHelper ? `${title} (${sundayFlavor})` : title,
                sundayFlavor: sundayHelper ? sundayFlavor : null,
                juiceFlavor: juicePrepration,
                flavors: flavors,
                toppings: toppingsSelected,
                sauces: sauces,
                ingredients: ingredients,
                ingredientsNotes: ingredientsNotes,
                price: parseInt(price)
            });

            currentOrder.total = currentOrder.items.reduce((sum, item) => sum + item.price, 0);
            updateOrderButton();
            document.body.removeChild(modal);
            showFeedback('¡Producto agregado al pedido!', 'success');
        });
    }


    function openCustomerInfoModal() {
        const modal = document.createElement('div');
        modal.className = 'order-modal';
        modal.innerHTML = `
          <div class="modal-content">
              <span class="close-modal">&times;</span>
              <h2>Confirmar Pedido</h2>
              
              <div class="order-summary">
                  <h3>Tu Pedido:</h3>
                  <div class="order-items" id="order-items">
                      ${currentOrder.items.map((item, index) => `
                          <div class="order-item" data-index="${index}">
                              <div class="item-info">
                                  <h4>${item.title}</h4>
                                  ${item.title.toLowerCase().includes("jugo de")
                ? `<p>Jugo en: ${item.juiceFlavor.join(', ')}</p>` : ''
            }
                                  <p>Sabores: ${item.flavors.join(', ')}</p>
                                  <p>ingredients: ${item.ingredients}</p>
                                  ${item.toppings && item.toppings.length > 0 ? `<p>Toppings: ${item.toppings.join(', ')}</p>` : ''}
                                  ${item.sauces && item.sauces.length > 0 ? `<p>Salsas: ${item.sauces.join(', ')}</p>` : ''}
                                  ${item.ingredientsNotes ? `<p>Notas: ${item.ingredientsNotes}</p>` : ''}
                                  <p>Precio: $${item.price.toLocaleString('es-CO')}</p>
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
                currentOrder.total = currentOrder.items.reduce((sum, item) => sum + item.price, 0);

                if (currentOrder.items.length === 0) {
                    document.body.removeChild(modal);
                    showFeedback('Has eliminado todos los productos del pedido', 'error');
                    updateOrderButton();
                } else {
                    const orderItemsContainer = modal.querySelector('#order-items');
                    orderItemsContainer.innerHTML = currentOrder.items.map((item, index) => `
                      <div class="order-item" data-index="${index}">
                          <div class="item-info">
                              <h4>${item.title}</h4>
                              <p>Sabores: ${item.flavors.join(', ')}</p>
                              <p>ingredients: ${item.ingredients}</p>
                              ${item.ingredientsNotes ? `<p>Notas: ${item.ingredientsNotes}</p>` : ''}
                              <p>Precio: $${item.price.toLocaleString('es-CO')}</p>
                          </div>
                          <button class="remove-item">Eliminar</button>
                      </div>
                  `).join('');
                    modal.querySelector('.order-total h3').textContent = `Total: $${currentOrder.total.toLocaleString('es-CO')}`;
                }
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

        modal.querySelector('.send-whatsapp').addEventListener('click', function () {
            const name = document.getElementById('customer-name').value.trim();
            const phone = document.getElementById('customer-phone').value.trim();
            const address = document.getElementById('customer-address').value.trim();
            const neighborhood = document.getElementById('customer-neighborhood').value.trim();
            const payment = document.getElementById('customer-payment-method').value.trim();

            if (!name) {
                showFeedback('Por favor ingresa tu nombre completo', 'error');
                return;
            }

            if (!phone) {
                showFeedback('Por favor ingresa tu número de teléfono', 'error');
                return;
            }

            if (!isValidColombianPhone(phone)) {
                showFeedback('Por favor ingresa un número de teléfono colombiano válido', 'error');
                return;
            }

            if (!address) {
                showFeedback('Por favor ingresa tu dirección de entrega', 'error');
                return;
            }

            if (!neighborhood) {
                showFeedback('Por favor ingresa tu barrio de entrega', 'error');
                return;
            }

            if (!payment) {
                showFeedback('Por favor ingresa tu metodo de pago', 'error');
                return;
            }

            currentOrder.customerInfo = { name, phone, address, neighborhood, payment };
            const whatsappMessage = generateWhatsAppMessage();
            const encodedMessage = encodeURIComponent(whatsappMessage);
            const whatsappUrl = `https://wa.me/${whatsappNumber}?text=${encodedMessage}`;
            window.open(whatsappUrl, '_blank');
            document.body.removeChild(modal);
        });
    }

    function isValidColombianPhone(phone) {
        const regex = /^(?:\+57)?[ -]?(3[0-9]{2}|60[1-8])[ -]?[0-9]{3}[ -]?[0-9]{4}$/;
        return regex.test(phone);
    }

    function generateWhatsAppMessage() {
        let message = `¡Hola! Quiero hacer un pedido en la Heladeria Los Espejos:\n\n`;
        message += `*Pedido:*\n`;
        currentOrder.items.forEach((item, index) => {
            message += `${index + 1}. ${item.title}\n`;
            if (item.sundayFlavor) {
                message += `   *Sabor:* ${item.sundayFlavor}\n`;
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
                message += `   *Notas:* ${item.ingredientsNotes}\n`;
            }
            message += `   *Precio:* $${item.price.toLocaleString('es-CO')}\n\n`;
        });

        message += `*Total productos: $${currentOrder.total.toLocaleString('es-CO')}*\n`;
        message += `*Domicilio no incluido!* Nuestra asesora te dara el precio final con domicilio incluido\n\n`;
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

    function showFeedback(message, type) {
        const existingFeedback = document.querySelector('.order-feedback');
        if (existingFeedback) {
            existingFeedback.remove();
        }

        const feedback = document.createElement('div');
        feedback.className = `order-feedback ${type}`;
        feedback.textContent = message;
        document.body.appendChild(feedback);

        setTimeout(() => {
            if (document.body.contains(feedback)) {
                document.body.removeChild(feedback);
            }
        }, 3000);
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