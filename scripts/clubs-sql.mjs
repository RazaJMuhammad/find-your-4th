import { readFile, mkdir, writeFile } from "node:fs/promises";

const clubs = JSON.parse(await readFile("data/clubs.json", "utf8"));

function sqlString(value) {
  if (value == null || value === "") return "null";
  const clean = String(value).replace(/\s+/g, " ").trim();
  if (!clean) return "null";
  return `'${clean.replaceAll("'", "''")}'`;
}

const rows = clubs.map((club) => ({
  ...club,
  bookingPlatform:
    club.bookingPlatform && String(club.bookingPlatform).replace(/\s+/g, " ").trim().length < 40
      ? String(club.bookingPlatform).replace(/\s+/g, " ").trim()
      : null,
}));

const inserts = rows
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
await writeFile("data/clubs.json", `${JSON.stringify(rows, null, 2)}\n`);
console.log(`clubs ${rows.length}`);
