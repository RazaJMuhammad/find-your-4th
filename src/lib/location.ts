import type { Coords } from "@/lib/geo";

export const COORDS_KEY = "fy4-coords";
export const CITY_KEY = "fy4-city";

let coordsRaw: string | null = null;
let coordsSnapshot: Coords | null = null;

export function subscribeLocation(onStoreChange: () => void) {
  window.addEventListener("storage", onStoreChange);
  window.addEventListener("fy4-location", onStoreChange);
  return () => {
    window.removeEventListener("storage", onStoreChange);
    window.removeEventListener("fy4-location", onStoreChange);
  };
}

export function readCitySnapshot() {
  if (typeof window === "undefined") return null;
  return localStorage.getItem(CITY_KEY);
}

export function readCoordsSnapshot() {
  if (typeof window === "undefined") return null;
  const raw = localStorage.getItem(COORDS_KEY);
  if (raw === coordsRaw) return coordsSnapshot;
  coordsRaw = raw;
  if (!raw) {
    coordsSnapshot = null;
    return null;
  }
  try {
    coordsSnapshot = JSON.parse(raw) as Coords;
  } catch {
    coordsSnapshot = null;
  }
  return coordsSnapshot;
}

export function publishLocation() {
  window.dispatchEvent(new Event("fy4-location"));
}

export function saveCoords(coords: Coords) {
  const raw = JSON.stringify(coords);
  localStorage.setItem(COORDS_KEY, raw);
  coordsRaw = raw;
  coordsSnapshot = coords;
  publishLocation();
}

export function saveCity(city: string) {
  localStorage.setItem(CITY_KEY, city);
  publishLocation();
}
