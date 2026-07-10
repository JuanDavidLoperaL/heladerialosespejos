import { GOOGLE_MAPS_API_KEY, STORE_LOCATION } from "./googleApiConfig.js";

export async function fetchAddressSuggestions(query) {
    if (!query || !query.trim()) return [];

    const response = await fetch("https://places.googleapis.com/v1/places:autocomplete", {
        method: "POST",
        headers: {
            "Content-Type": "application/json",
            "X-Goog-Api-Key": GOOGLE_MAPS_API_KEY
        },
        body: JSON.stringify({
            input: query,
            languageCode: "es",
            includedRegionCodes: ["co"],
            locationBias: {
                circle: {
                    center: { latitude: STORE_LOCATION.lat, longitude: STORE_LOCATION.lng },
                    radius: 50000.0
                }
            }
        })
    });

    if (!response.ok) throw new Error(`Places autocomplete HTTP ${response.status}`);

    const data = await response.json();
    return (data.suggestions ?? [])
        .map(s => s.placePrediction)
        .filter(Boolean)
        .map(p => ({
            placeId: p.placeId,
            mainText: p.structuredFormat?.mainText?.text ?? p.text?.text ?? "",
            secondaryText: p.structuredFormat?.secondaryText?.text ?? ""
        }));
}

export async function fetchPlaceDetails(placeId) {
    const response = await fetch(`https://places.googleapis.com/v1/places/${placeId}`, {
        headers: {
            "X-Goog-Api-Key": GOOGLE_MAPS_API_KEY,
            "X-Goog-FieldMask": "formattedAddress,location"
        }
    });

    if (!response.ok) throw new Error(`Place details HTTP ${response.status}`);

    const data = await response.json();
    return {
        address: data.formattedAddress,
        coordinate: { lat: data.location.latitude, lng: data.location.longitude }
    };
}
