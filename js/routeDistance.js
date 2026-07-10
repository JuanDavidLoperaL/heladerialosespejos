import { GOOGLE_MAPS_API_KEY, STORE_LOCATION } from "./googleApiConfig.js";

export async function fetchDrivingDistanceMeters(destination) {
    const response = await fetch("https://routes.googleapis.com/directions/v2:computeRoutes", {
        method: "POST",
        headers: {
            "Content-Type": "application/json",
            "X-Goog-Api-Key": GOOGLE_MAPS_API_KEY,
            // Solo se necesita la distancia, no un ETA en vivo — evita el costo/latencia
            // extra de TRAFFIC_AWARE (mismo criterio que en la app iOS).
            "X-Goog-FieldMask": "routes.distanceMeters"
        },
        body: JSON.stringify({
            origin: { location: { latLng: { latitude: STORE_LOCATION.lat, longitude: STORE_LOCATION.lng } } },
            destination: { location: { latLng: { latitude: destination.lat, longitude: destination.lng } } },
            travelMode: "DRIVE",
            routingPreference: "TRAFFIC_UNAWARE"
        })
    });

    if (!response.ok) throw new Error(`Routes API HTTP ${response.status}`);

    const data = await response.json();
    const meters = data.routes?.[0]?.distanceMeters;
    if (meters == null) throw new Error("Routes API: la respuesta no trajo distancia");
    return meters;
}
