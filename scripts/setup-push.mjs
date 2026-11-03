import { execFileSync } from "node:child_process";
import { randomBytes } from "node:crypto";
import { readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import webpush from "web-push";

const envPath = ".env.local";
const dispatchUrl = process.env.PUSH_DISPATCH_URL || "http://host.docker.internal:3000/api/push/dispatch";

function readEnv(text) {
  const values = new Map();
  for (const line of text.split(/\r?\n/)) {
    const match = line.match(/^([A-Z0-9_]+)=(.*)$/);
    if (!match) continue;
    let value = match[2].trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    values.set(match[1], value);
  }
  return values;
}

function writeEnv(text, values) {
  let next = text.endsWith("\n") || text.length === 0 ? text : `${text}\n`;
  for (const [name, value] of values) {
    const line = `${name}=${value}`;
    const pattern = new RegExp(`^${name}=.*$`, "m");
    if (pattern.test(next)) next = next.replace(pattern, line);
    else next += `${line}\n`;
  }
  writeFileSync(envPath, next);
}

function statusEnv() {
  return readEnv(run("npx supabase status -o env"));
}

function run(command) {
  return execFileSync(command, { encoding: "utf8", shell: true });
}

function sql(statement) {
  const file = join(tmpdir(), `fy4-${randomBytes(4).toString("hex")}.sql`);
  writeFileSync(file, statement);
  try {
    return run(`npx supabase db query --local -f "${file}"`);
  } finally {
    rmSync(file, { force: true });
  }
}

function sqlLiteral(value) {
  return `'${value.replaceAll("'", "''")}'`;
}

function vaultId(name) {
  const output = sql(`select id::text as id from vault.secrets where name = ${sqlLiteral(name)}`);
  const match = output.match(/"id":\s*"([^"]+)"/);
  return match ? match[1] : null;
}

function setVault(name, value, description) {
  const id = vaultId(name);
  if (id) {
    sql(
      `select vault.update_secret(${sqlLiteral(id)}::uuid, ${sqlLiteral(value)}, ${sqlLiteral(name)}, ${sqlLiteral(description)})`,
    );
    return;
  }
  sql(`select vault.create_secret(${sqlLiteral(value)}, ${sqlLiteral(name)}, ${sqlLiteral(description)})`);
}

const currentText = readFileSync(envPath, "utf8");
const current = readEnv(currentText);
const status = statusEnv();
const pushLib = typeof webpush.generateVAPIDKeys === "function" ? webpush : webpush.default;
const keys = current.get("NEXT_PUBLIC_VAPID_PUBLIC_KEY") && current.get("VAPID_PRIVATE_KEY")
  ? {
      publicKey: current.get("NEXT_PUBLIC_VAPID_PUBLIC_KEY"),
      privateKey: current.get("VAPID_PRIVATE_KEY"),
    }
  : pushLib.generateVAPIDKeys();

const updates = new Map([
  ["NEXT_PUBLIC_VAPID_PUBLIC_KEY", keys.publicKey],
  ["VAPID_PRIVATE_KEY", keys.privateKey],
  ["VAPID_SUBJECT", current.get("VAPID_SUBJECT") || "mailto:push@findyour4th.app"],
  ["SUPABASE_SECRET_KEY", current.get("SUPABASE_SECRET_KEY") || status.get("SERVICE_ROLE_KEY")],
  ["PUSH_DISPATCH_SECRET", current.get("PUSH_DISPATCH_SECRET") || randomBytes(32).toString("hex")],
]);

if (!updates.get("SUPABASE_SECRET_KEY")) {
  throw new Error("Local Supabase service role key was not found");
}

writeEnv(currentText, updates);
setVault("push_dispatch_url", dispatchUrl, "FindYour4th push dispatch URL");
setVault("push_dispatch_secret", updates.get("PUSH_DISPATCH_SECRET"), "FindYour4th push dispatch secret");
console.log("Push keys are in .env.local and Vault. Restart the Next.js server.");
