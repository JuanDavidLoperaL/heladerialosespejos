import { GOOGLE_MAPS_API_KEY } from "./googleApiConfig.js";

let loadPromise = null;

// Carga el script de Google Maps solo la primera vez que hace falta (cuando el
// cliente abre el selector de pin) — no en cada carga de página, para no pagar
// "map loads" de clientes que nunca lo necesitan porque el autocompletado sí encontró su dirección.
export function loadGoogleMaps() {
    if (loadPromise) return loadPromise;

    loadPromise = new Promise((resolve, reject) => {
        if (window.google?.maps) {
            resolve(window.google.maps);
            return;
        }

        const callbackName = "__hleGoogleMapsLoaded";
        window[callbackName] = () => {
            delete window[callbackName];
            resolve(window.google.maps);
        };

        const script = document.createElement("script");
        script.src = `https://maps.googleapis.com/maps/api/js?key=${GOOGLE_MAPS_API_KEY}&callback=${callbackName}&loading=async`;
        script.async = true;
        script.onerror = () => reject(new Error("No se pudo cargar Google Maps"));
        document.head.appendChild(script);
    });

    return loadPromise;
}
