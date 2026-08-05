import { GOOGLE_MAPS_API_KEY } from "./googleApiConfig.js";

// Se usan solo si Firestore (settings/orderGrouping) no existe o falla la lectura.
export const DEFAULT_PROXIMITY_METERS = 180;
export const DEFAULT_MAX_GROUP_SIZE = 2;

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

// Agrupa pedidos por cercanía en grupos de hasta `maxGroupSize` pedidos, donde
// TODOS los miembros quedan a <=`proximityMeters` de TODOS los demás del mismo
// grupo (no solo del vecino más cercano) — evita rutas largas que derritan el
// helado, sea cual sea el tamaño de grupo configurado. Un pedido que ya quedó
// en un grupo no puede volver a aparecer en otro.
//
// Se recorre de más antiguo a más nuevo (por createdAt), así el pedido que
// más tiempo lleva esperando siempre tiene la primera oportunidad de armar
// grupo con sus vecinos disponibles más cercanos. Los pedidos sin coordenadas
// (dirección mal puesta por el cliente) quedan afuera del cálculo.
export async function groupOrdersByProximity(orders, config = {}) {
    const proximityMeters = config.proximityMeters ?? DEFAULT_PROXIMITY_METERS;
    const maxGroupSize    = config.maxGroupSize    ?? DEFAULT_MAX_GROUP_SIZE;

    const geocoded = orders
        .filter(o => o.customerLatitude != null && o.customerLongitude != null)
        .sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt));

    const noCoordsCount = orders.length - geocoded.length;

    if (geocoded.length < 2 || maxGroupSize < 2) {
        return { groups: [], geocodedCount: geocoded.length, noCoordsCount, proximityMeters, maxGroupSize };
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
    const distanceBetween = (i, j) => Math.min(matrix[i][j], matrix[j][i]);

    const claimed = new Array(n).fill(false);
    const groups = [];

    for (let i = 0; i < n; i++) {
        if (claimed[i]) continue;

        const candidates = [];
        for (let j = 0; j < n; j++) {
            if (j === i || claimed[j]) continue;
            const dist = distanceBetween(i, j);
            if (dist <= proximityMeters) candidates.push({ j, dist });
        }
        candidates.sort((a, b) => a.dist - b.dist);

        // Crece el grupo agregando el candidato disponible más cercano, pero
        // solo si sigue a <=proximityMeters de TODOS los ya incluidos.
        const clique = [i];
        for (const { j } of candidates) {
            if (clique.length >= maxGroupSize) break;
            const fitsAll = clique.every(k => distanceBetween(k, j) <= proximityMeters);
            if (fitsAll) clique.push(j);
        }

        if (clique.length >= 2) {
            clique.forEach(idx => { claimed[idx] = true; });

            let maxDistanceMeters = 0;
            for (let a = 0; a < clique.length; a++) {
                for (let b = a + 1; b < clique.length; b++) {
                    maxDistanceMeters = Math.max(maxDistanceMeters, distanceBetween(clique[a], clique[b]));
                }
            }

            groups.push({
                orderNumbers: clique.map(idx => geocoded[idx].orderNumber),
                maxDistanceMeters: Math.round(maxDistanceMeters)
            });
        }
    }

    return { groups, geocodedCount: geocoded.length, noCoordsCount, proximityMeters, maxGroupSize };
}
