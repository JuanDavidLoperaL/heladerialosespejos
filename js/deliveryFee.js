import { getValue } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-remote-config.js";
import { fetchDrivingDistanceMeters } from "./routeDistance.js";

const DEFAULT_TIERS = [
    { maxMeters: 400, price: 3000 },
    { maxMeters: 850, price: 4000 },
    { maxMeters: 1100, price: 5000 },
    { maxMeters: 1350, price: 6000 },
    { maxMeters: 1550, price: 7000 },
    { maxMeters: 1800, price: 8000 },
    { maxMeters: 2000, price: 9000 },
    { maxMeters: null, price: 10000 }
];

// Mismo parámetro de Remote Config que usa la app iOS (`delivery_fee_tiers`) — es el
// mismo proyecto de Firebase, así que editar el rango en la consola aplica a ambos.
export const DEFAULT_DELIVERY_FEE_TIERS_JSON = JSON.stringify(DEFAULT_TIERS);

export function feeForMeters(meters, tiers) {
    const sorted = [...tiers].sort((a, b) => (a.maxMeters ?? Infinity) - (b.maxMeters ?? Infinity));
    const match = sorted.find(t => t.maxMeters == null || meters <= t.maxMeters);
    return match ? match.price : (sorted[sorted.length - 1]?.price ?? 0);
}

function currentTiers(remoteConfig) {
    try {
        const parsed = JSON.parse(getValue(remoteConfig, "delivery_fee_tiers").asString());
        if (Array.isArray(parsed) && parsed.length > 0) return parsed;
    } catch {
        // usa DEFAULT_TIERS
    }
    return DEFAULT_TIERS;
}

export async function calculateDeliveryFee(remoteConfig, destination) {
    const meters = await fetchDrivingDistanceMeters(destination);
    return feeForMeters(meters, currentTiers(remoteConfig));
}
