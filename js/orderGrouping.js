import { GOOGLE_MAPS_API_KEY } from "./googleApiConfig.js";

export const PROXIMITY_METERS = 180;

// 1 sola llamada a Route Matrix para todas las combinaciones de puntos, en vez
// de N*(N-1)/2 llamadas individuales a computeRoutes (mismo criterio de costo/
// latencia que routeDistance.js: TRAFFIC_UNAWARE, no hace falta ETA en vivo).
async function fetchDistanceMatrixMeters(points) {
    const waypoints = points.map(p => ({
        waypoint: { location: { latLng: { latitude: p.lat, longitude: p.lng } } }
    }));

    const response = await fetch("https://routes.googleapis.com/distanceMatrix/v2:computeRouteMatrix", {
        method: "POST",
        headers: {
            "Content-Type": "application/json",
            "X-Goog-Api-Key": GOOGLE_MAPS_API_KEY,
            "X-Goog-FieldMask": "originIndex,destinationIndex,distanceMeters,condition"
        },
        body: JSON.stringify({
            origins: waypoints,
            destinations: waypoints,
            travelMode: "DRIVE",
            routingPreference: "TRAFFIC_UNAWARE"
        })
    });

    if (!response.ok) throw new Error(`Route Matrix API HTTP ${response.status}`);
    return response.json();
}

// Agrupa pedidos por cercanía SOLO en pares (nunca 3 o más — evita que el
// helado se derrita por hacer una ruta mas larga de lo necesario). Un pedido
// que ya quedó emparejado no puede volver a aparecer en otro par.
//
// Se recorre de más antiguo a más nuevo (por createdAt), así el pedido que
// más tiempo lleva esperando siempre tiene la primera oportunidad de
// emparejarse con su vecino más cercano disponible dentro de PROXIMITY_METERS.
// Los pedidos sin coordenadas (dirección mal puesta por el cliente) quedan
// afuera del cálculo, tal como se sabe que va a pasar.
export async function groupOrdersByProximity(orders) {
    const geocoded = orders
        .filter(o => o.customerLatitude != null && o.customerLongitude != null)
        .sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt));

    const noCoordsCount = orders.length - geocoded.length;

    if (geocoded.length < 2) {
        return { pairs: [], geocodedCount: geocoded.length, noCoordsCount };
    }

    const points = geocoded.map(o => ({ lat: o.customerLatitude, lng: o.customerLongitude }));
    const elements = await fetchDistanceMatrixMeters(points);

    const n = geocoded.length;
    const matrix = Array.from({ length: n }, () => new Array(n).fill(Infinity));
    for (const el of elements) {
        if (el.condition === "ROUTE_EXISTS" && el.distanceMeters != null) {
            matrix[el.originIndex][el.destinationIndex] = el.distanceMeters;
        }
    }

    const claimed = new Array(n).fill(false);
    const pairs = [];

    for (let i = 0; i < n; i++) {
        if (claimed[i]) continue;

        let bestJ = -1;
        let bestDist = Infinity;
        for (let j = 0; j < n; j++) {
            if (j === i || claimed[j]) continue;
            const dist = Math.min(matrix[i][j], matrix[j][i]);
            if (dist <= PROXIMITY_METERS && dist < bestDist) {
                bestDist = dist;
                bestJ = j;
            }
        }

        if (bestJ !== -1) {
            claimed[i] = true;
            claimed[bestJ] = true;
            pairs.push({
                orderNumbers: [geocoded[i].orderNumber, geocoded[bestJ].orderNumber],
                distanceMeters: Math.round(bestDist)
            });
        }
    }

    return { pairs, geocodedCount: geocoded.length, noCoordsCount };
}
