import { loadGoogleMaps } from "./googleMapsLoader.js";
import { STORE_LOCATION } from "./googleApiConfig.js";

/// Fallback cuando el autocompletado de Places no encuentra la dirección: el
/// cliente marca el punto de entrega directo en el mapa con un click.
export function openMapPinPicker(onConfirm) {
    const overlay = document.createElement('div');
    overlay.className = 'map-pin-overlay';
    overlay.innerHTML = `
        <div class="map-pin-modal">
            <div class="map-pin-header">
                <h3>Marca tu punto de entrega</h3>
                <span class="map-pin-close">&times;</span>
            </div>
            <div id="map-pin-canvas" class="map-pin-canvas"></div>
            <p class="map-pin-hint">Toca el mapa donde debemos entregar tu pedido</p>
            <button class="map-pin-confirm" disabled>Confirmar ubicación</button>
        </div>
    `;
    document.body.appendChild(overlay);

    const hint = overlay.querySelector('.map-pin-hint');
    const confirmBtn = overlay.querySelector('.map-pin-confirm');
    const close = () => document.body.removeChild(overlay);

    overlay.querySelector('.map-pin-close').addEventListener('click', close);
    overlay.addEventListener('click', (e) => { if (e.target === overlay) close(); });

    let marker = null;
    let selectedCoordinate = null;

    loadGoogleMaps().then((maps) => {
        const map = new maps.Map(overlay.querySelector('#map-pin-canvas'), {
            center: STORE_LOCATION,
            zoom: 15
        });

        map.addListener('click', (event) => {
            selectedCoordinate = { lat: event.latLng.lat(), lng: event.latLng.lng() };
            if (marker) {
                marker.setPosition(event.latLng);
            } else {
                marker = new maps.Marker({ position: event.latLng, map });
            }
            confirmBtn.disabled = false;
        });

        confirmBtn.addEventListener('click', () => {
            if (!selectedCoordinate) return;
            confirmBtn.disabled = true;
            confirmBtn.textContent = 'Ubicando...';

            new maps.Geocoder().geocode({ location: selectedCoordinate }, (results, status) => {
                const address = (status === 'OK' && results?.[0])
                    ? results[0].formatted_address
                    : `Punto marcado en el mapa (${selectedCoordinate.lat.toFixed(5)}, ${selectedCoordinate.lng.toFixed(5)})`;
                onConfirm(address, selectedCoordinate);
                close();
            });
        });
    }).catch(() => {
        hint.textContent = 'No se pudo cargar el mapa. Revisa tu conexión e intenta de nuevo.';
    });
}
