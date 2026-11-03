import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

const ROOT = path.resolve(import.meta.dirname, "..");
const CACHE = path.join(ROOT, "data", "geocode-cache.json");
const UA = "FindYour4th/0.1 (padel open-game directory; local seed)";

const PROVINCES = {
  gauteng: "Gauteng",
  "western-cape": "Western Cape",
  "kwazulu-natal": "KwaZulu-Natal",
  "eastern-cape": "Eastern Cape",
  "free-state": "Free State",
  mpumalanga: "Mpumalanga",
  limpopo: "Limpopo",
  "north-west": "North West",
  "northern-cape": "Northern Cape",
};

const STOP = new Set(["padel", "club", "the", "and", "at", "of"]);

async function get(url) {
  const res = await fetch(url, { headers: { "user-agent": UA, accept: "text/html,application/json" } });
  if (!res.ok) throw new Error(`${res.status} ${url}`);
  return res.text();
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function decode(value) {
  return value
    .replaceAll("&amp;", "&")
    .replaceAll("&nbsp;", " ")
    .replaceAll("&#39;", "'")
    .replaceAll("&quot;", '"')
    .replaceAll("&apos;", "'");
}

function norm(value) {
  return String(value || "")
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function tokens(value) {
  return new Set(norm(value).split(" ").filter((word) => word.length > 1 && !STOP.has(word)));
}

function parseMeta(meta) {
  const text = meta.replace(/\s+/g, " ").trim();
  const match = text.match(/(\d+)\s+courts?\s*·\s*(.+)/i);
  if (match) return { court_count: Number(match[1]), area: match[2].trim() };
  return { court_count: null, area: text || null };
}

async function loadClubs() {
  const citiesHtml = await get("https://findapadelcourt.co.za/cities/");
  const cityHrefs = [...citiesHtml.matchAll(/href="\/city\/([^/]+)\/"/g)].map((match) => match[1]);
  const citySlugs = [...new Set(cityHrefs)];

  const cityProvince = new Map();
  for (const slug of Object.keys(PROVINCES)) {
    const res = await fetch(`https://findapadelcourt.co.za/province/${slug}/`, {
      headers: { "user-agent": UA, accept: "text/html" },
    });
    if (!res.ok) continue;
    const html = (await res.text()).split("<footer")[0];
    for (const match of html.matchAll(/href="\/city\/([^/]+)\/"/g)) {
      cityProvince.set(match[1], PROVINCES[slug]);
    }
    await sleep(150);
  }

  const clubs = new Map();
  for (const slug of citySlugs) {
    const html = await get(`https://findapadelcourt.co.za/city/${slug}/`);
    const cityName = decode(html.match(/<h1>\s*Padel courts in\s+([^<]+)<\/h1>/i)?.[1]?.trim() || slug);
    const province = cityProvince.get(slug) || null;
    const card = /<a class="card" href="\/club\/([^/]+)\/">\s*<h3>([^<]+)<\/h3>\s*<div class="meta">([^<]*)<\/div>/g;
    for (const match of html.matchAll(card)) {
      const parsed = parseMeta(match[3]);
      if (parsed.area && /whatsapp|booking/i.test(parsed.area)) parsed.area = null;
      clubs.set(match[1], {
        slug: match[1],
        name: decode(match[2].trim()),
        city: cityName,
        province,
        area: parsed.area ? decode(parsed.area) : null,
        court_count: parsed.court_count,
        lat: null,
        lng: null,
      });
    }
    process.stdout.write(`city ${cityName}: ${clubs.size}\n`);
    await sleep(150);
  }
  return [...clubs.values()];
}

function matchCoordinates(clubs, remote) {
  const pool = remote.filter((club) => club.country === "ZA" && club.latitude && club.longitude);
  let matched = 0;
  for (const club of clubs) {
    let best = null;
    let bestScore = 0;
    const clubTokens = tokens(club.name);
    for (const candidate of pool) {
      const sameCity = norm(candidate.city) === norm(club.city) || norm(candidate.city) === norm(club.area);
      let score = 0;
      if (norm(candidate.name) === norm(club.name)) score = 1;
      else {
        const other = tokens(candidate.name);
        let shared = 0;
        for (const token of clubTokens) if (other.has(token)) shared += 1;
        const union = clubTokens.size + other.size - shared;
        score = union ? shared / union : 0;
        if (sameCity) score += 0.2;
      }
      if (score > bestScore) {
        bestScore = score;
        best = candidate;
      }
    }
    if (best && bestScore >= 0.72) {
      club.lat = Number(best.latitude);
      club.lng = Number(best.longitude);
      matched += 1;
    }
  }
  return matched;
}

async function lookup(cache, query) {
  if (cache[query]?.lat != null) return cache[query];
  if (Object.hasOwn(cache, query) && cache[query]?.lat == null && query.split(",").length > 3) {
    return null;
  }
  const url = `https://nominatim.openstreetmap.org/search?format=jsonv2&limit=1&countrycodes=za&q=${encodeURIComponent(query)}`;
  const res = await fetch(url, { headers: { "user-agent": UA, accept: "application/json" } });
  const rows = res.ok ? await res.json() : [];
  const hit = rows[0];
  cache[query] = hit ? { lat: Number(hit.lat), lng: Number(hit.lon) } : { lat: null, lng: null };
  await writeFile(CACHE, JSON.stringify(cache, null, 2));
  await sleep(1100);
  return cache[query].lat == null ? null : cache[query];
}

async function geocodeMissing(clubs) {
  let cache = {};
  try {
    cache = JSON.parse(await readFile(CACHE, "utf8"));
  } catch {
    cache = {};
  }
  for (const club of clubs.filter((item) => item.lat == null)) {
    const area = [club.area && club.area !== club.city ? club.area : null, club.city, "South Africa"]
      .filter(Boolean)
      .join(", ");
    const hit = await lookup(cache, area);
    if (hit) {
      club.lat = hit.lat;
      club.lng = hit.lng;
    }
    process.stdout.write(`geo ${club.name}: ${club.lat ?? "miss"}\n`);
  }
}

function sqlString(value) {
  if (value == null) return "null";
  return `'${String(value).replaceAll("'", "''")}'`;
}

function sqlNumber(value) {
  if (value == null || Number.isNaN(value)) return "null";
  return String(Math.round(value * 1e6) / 1e6);
}

function toSql(clubs) {
  const values = clubs
    .map(
      (club) =>
        `(${sqlString(club.name)}, ${sqlString(club.slug)}, ${sqlString(club.city)}, ${sqlString(club.province)}, ${sqlString(club.area)}, ${club.court_count ?? "null"}, ${sqlNumber(club.lat)}, ${sqlNumber(club.lng)})`,
    )
    .join(",\n");

  return `-- South African padel clubs.
-- Names, cities, areas, and court counts: findapadelcourt.co.za
-- Coordinates: Padel Snipe world clubs (CC-BY 4.0, https://padelsnipe.com/world) where names match,
-- otherwise OpenStreetMap Nominatim.
insert into public.clubs (name, slug, city, province, area, court_count, lat, lng)
values
${values}
on conflict (slug) do update set
  name = excluded.name,
  city = excluded.city,
  province = excluded.province,
  area = excluded.area,
  court_count = excluded.court_count,
  lat = excluded.lat,
  lng = excluded.lng;
`;
}

await mkdir(path.join(ROOT, "data"), { recursive: true });
const clubs = await loadClubs();
const remote = JSON.parse(await get("https://padelsnipe.com/api/world/clubs"));
const matched = matchCoordinates(clubs, remote.clubs || []);
process.stdout.write(`matched ${matched} of ${clubs.length} via Padel Snipe\n`);
await geocodeMissing(clubs);
const withCoords = clubs.filter((club) => club.lat != null).length;
process.stdout.write(`coordinates ${withCoords} of ${clubs.length}\n`);
await writeFile(path.join(ROOT, "data", "clubs.json"), JSON.stringify(clubs, null, 2));
await writeFile(path.join(ROOT, "supabase", "seed.sql"), toSql(clubs));
