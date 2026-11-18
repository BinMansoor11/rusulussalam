import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";

const privilegedNames = ["SUPABASE_SERVICE_ROLE_KEY", "SERVICE_ROLE_KEY", "SUPABASE_SECRET_KEY"];

function jwtPayload(value) {
  try {
    return JSON.parse(Buffer.from(value.split(".")[1], "base64url").toString("utf8"));
  } catch {
    return null;
  }
}

function privilegedCredential(value) {
  if (/sb_secret_[\w-]{8,}/.test(value)) return true;
  for (const token of value.match(/eyJ[\w-]+\.[\w-]+\.[\w-]+/g) ?? []) {
    if (jwtPayload(token)?.role === "service_role") return true;
  }
  return false;
}

function httpsOrigin(value) {
  try {
    const url = new URL(value);
    return url.protocol === "https:" && !url.port && url.origin === value &&
      url.hostname.includes(".") && !url.hostname.includes("*") ? url : null;
  } catch {
    return null;
  }
}

function checkStaging(env) {
  if ((env.VERCEL === "1" || env.VERCEL_ENV) && env.VERCEL_ENV !== "preview") {
    throw new Error("The staging build command requires the Vercel Preview environment.");
  }
  if (privilegedNames.some(name => env[name]) ||
      Object.entries(env).some(([name, value]) => name.startsWith("NEXT_PUBLIC_") && privilegedCredential(value))) {
    throw new Error("Remove privileged Supabase credentials from the app environment.");
  }

  const projectRef = env.STAGING_SUPABASE_PROJECT_REF;
  if (!projectRef || !/^[a-z]{20}$/.test(projectRef) ||
      env.NEXT_PUBLIC_SUPABASE_URL !== `https://${projectRef}.supabase.co`) {
    throw new Error("Set the staging project reference and its matching canonical Supabase URL.");
  }
  const key = env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  if (!key || !/^sb_publishable_[\w-]+$/.test(key)) {
    throw new Error("Set NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY to the staging publishable key.");
  }
  if (env.NEXT_PUBLIC_SUPABASE_ANON_KEY) {
    throw new Error("Remove the legacy anonymous fallback from the staging environment.");
  }
  const site = httpsOrigin(env.AUTH_SITE_URL);
  if (!site || site.hostname.endsWith(".localhost") || site.hostname.endsWith(".local") ||
      /^\d+\.\d+\.\d+\.\d+$/.test(site.hostname)) {
    throw new Error("Set AUTH_SITE_URL to the stable staging HTTPS hostname without a path or trailing slash.");
  }
  console.log("Staging environment checks passed.");
}

async function auditBundle() {
  const directory = ".next/static";
  let files;
  try {
    files = await readdir(directory, { recursive: true, withFileTypes: true });
  } catch {
    throw new Error("Build the application before auditing its browser bundle.");
  }
  let scanned = 0;
  for (const file of files) {
    if (!file.isFile() || !/\.(?:m?js|json|css|map)$/.test(file.name)) continue;
    const content = await readFile(join(file.parentPath, file.name), "utf8");
    if (privilegedCredential(content)) {
      throw new Error("A privileged Supabase credential pattern was found in a browser asset. Block deployment and investigate.");
    }
    scanned++;
  }
  if (!scanned) throw new Error("No compiled browser assets were available to audit.");
  console.log(`Browser credential audit passed (${scanned} assets checked).`);
}

try {
  const mode = process.argv[2];
  if (mode === "staging") checkStaging(process.env);
  else if (mode === "browser") await auditBundle();
  else throw new Error("Select the staging or browser deployment check.");
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
}
