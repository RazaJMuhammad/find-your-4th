import { mkdir, writeFile } from "node:fs/promises";

const ORIGIN = "https://findapadelcourt.co.za";

function decode(value) {
  return value
    .replaceAll("&amp;", "&")
    .replaceAll("&#39;", "'")
    .replaceAll("&quot;", '"')
    .replaceAll("&lt;", "<")
    .replaceAll("&gt;", ">")
    .trim();
}

function fact(html, label) {
  const match = html.match(new RegExp(`<label>${label}</label><b>([^<]*)</b>`));
  return match ? decode(match[1]) : null;
}

function slugFromUrl(url) {
  const match = url.match(/\/club\/([^/]+)\/?$/);
  return match ? match[1] : null;
}

async function fetchText(url) {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`${response.status} ${url}`);
  return response.text();
}

async function mapPool(items, limit, worker) {
  const results = new Array(items.length);
  let next = 0;
  async function run() {
    while (next < items.length) {
      const index = next;
      next += 1;
      results[index] = await worker(items[index], index);
    }
  }
  await Promise.all(Array.from({ length: limit }, run));
  return results;
}

const citiesHtml = await fetchText(`${ORIGIN}/cities/`);
const citySlugs = [...new Set([...citiesHtml.matchAll(/href="\/city\/([^"/]+)\/?"/g)].map((match) => match[1]))];

const clubUrls = new Set();
for (const city of citySlugs) {
  const html = await fetchText(`${ORIGIN}/city/${city}/`);
  for (const match of html.matchAll(/https:\/\/findapadelcourt\.co\.za\/club\/([^"/]+)\/?/g)) {
    clubUrls.add(`${ORIGIN}/club/${match[1]}/`);
  }
}

const clubs = (
  await mapPool([...clubUrls], 8, async (url) => {
    const html = await fetchText(url);
    const id = slugFromUrl(url);
    const name = fact(html, "Name") ?? html.match(/<h1>([^<]+)<\/h1>/)?.[1];
    const platformMatch = html.match(/<h1>[^<]+<\/h1>[\s\S]{0,240}?·\s*([^<]+)/);
    const platform = platformMatch ? decode(platformMatch[1]) : null;
    return {
      id,
      name: name ? decode(name) : id,
      suburb: fact(html, "Suburb"),
      city: fact(html, "City"),
      province: fact(html, "Province"),
      courtCount: Number(fact(html, "Courts")) || null,
      bookingPlatform: platform && platform.length < 40 ? platform : null,
    };
  })
)
  .filter((club) => club.id && club.city && club.province)
  .sort((a, b) => a.province.localeCompare(b.province) || a.city.localeCompare(b.city) || a.name.localeCompare(b.name));

await mkdir("data", { recursive: true });
await writeFile("data/clubs.json", `${JSON.stringify(clubs, null, 2)}\n`);

function sqlString(value) {
  if (value == null || value === "") return "null";
  return `'${String(value).replaceAll("'", "''")}'`;
}

const inserts = clubs
  .map(
    (club) =>
      `  (${sqlString(club.id)}, ${sqlString(club.name)}, ${sqlString(club.suburb)}, ${sqlString(club.city)}, ${sqlString(club.province)}, ${club.courtCount ?? "null"}, ${sqlString(club.bookingPlatform)})`,
  )
  .join(",\n");

const sql = `-- Snapshot of public club facts from findapadelcourt.co.za.
-- Names, places, and court counts only. Their venue descriptions are not copied.
insert into public.clubs (id, name, suburb, city, province, court_count, booking_platform)
values
${inserts}
on conflict (id) do update set
  name = excluded.name,
  suburb = excluded.suburb,
  city = excluded.city,
  province = excluded.province,
  court_count = excluded.court_count,
  booking_platform = excluded.booking_platform;
`;

await mkdir("supabase/snippets", { recursive: true });
await writeFile("supabase/snippets/clubs.sql", sql);
console.log(`Wrote ${clubs.length} clubs`);
