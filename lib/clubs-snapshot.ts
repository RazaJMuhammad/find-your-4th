import rawClubs from "@/data/clubs.json";
import type { Club } from "@/lib/game-view";

export function snapshotClubs(): Club[] {
  return rawClubs.map((club) => ({
    id: club.id,
    name: club.name,
    suburb: club.suburb,
    city: club.city,
    province: club.province,
    court_count: club.courtCount,
    booking_platform: club.bookingPlatform,
  }));
}
