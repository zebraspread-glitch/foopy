/**
 * One-time script: uploads all player images from public/players/
 * to Supabase Storage bucket "players".
 *
 * Usage:
 *   node scripts/upload-player-images.mjs
 *
 * Reads NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY from .env.local
 */

import { createClient } from "@supabase/supabase-js";
import { readFileSync, readdirSync, statSync } from "fs";
import { join, relative } from "path";
import { fileURLToPath } from "url";
import { dirname } from "path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..");

// ── Read .env.local ────────────────────────────────────────────────────────────
const env = {};
try {
  const lines = readFileSync(join(ROOT, ".env.local"), "utf8").split(/\r?\n/);
  for (const line of lines) {
    const match = line.match(/^([^#=]+)=(.*)$/);
    if (match) env[match[1].trim()] = match[2].trim().replace(/^["']|["']$/g, "");
  }
} catch {
  console.error("Could not read .env.local");
  process.exit(1);
}

const SUPABASE_URL = env.NEXT_PUBLIC_SUPABASE_URL;
const SERVICE_KEY  = env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SERVICE_KEY) {
  console.error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env.local");
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SERVICE_KEY);
const BUCKET   = "players";
const SRC_DIR  = join(ROOT, "public", "players");

// ── Verify bucket exists (create if needed) ────────────────────────────────────
console.log("Checking Supabase Storage connection...");
const { data: buckets, error: listErr } = await supabase.storage.listBuckets();
if (listErr) {
  console.error("Could not list buckets:", listErr.message);
  console.error("Check that SUPABASE_SERVICE_ROLE_KEY is the service_role key (not the anon key).");
  process.exit(1);
}
console.log("Buckets found:", buckets.map(b => b.name).join(", ") || "(none)");

const bucketExists = buckets.some(b => b.name === BUCKET);
if (!bucketExists) {
  console.log(`Bucket "${BUCKET}" not found — creating it...`);
  const { error: createErr } = await supabase.storage.createBucket(BUCKET, { public: true });
  if (createErr) {
    console.error("Failed to create bucket:", createErr.message);
    process.exit(1);
  }
  console.log(`Bucket "${BUCKET}" created.`);
} else {
  console.log(`Bucket "${BUCKET}" exists. Proceeding with upload...\n`);
}

// ── Walk directory recursively ─────────────────────────────────────────────────
function walk(dir) {
  const files = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) {
      files.push(...walk(full));
    } else if (entry.endsWith(".png") || entry.endsWith(".jpg") || entry.endsWith(".webp")) {
      files.push(full);
    }
  }
  return files;
}

// ── Upload ─────────────────────────────────────────────────────────────────────
const files = walk(SRC_DIR);
console.log(`Found ${files.length} images. Uploading to Supabase Storage bucket "${BUCKET}"...\n`);

let done = 0;
let failed = 0;

for (const filePath of files) {
  // e.g. "crows/hugohallkahan.png"
  const storagePath = relative(SRC_DIR, filePath).replace(/\\/g, "/");
  const ext = filePath.split(".").pop();
  const contentType = ext === "png" ? "image/png" : ext === "jpg" ? "image/jpeg" : "image/webp";

  const fileBuffer = readFileSync(filePath);

  const { error } = await supabase.storage
    .from(BUCKET)
    .upload(storagePath, fileBuffer, { contentType, upsert: true });

  if (error) {
    console.error(`  ✗ ${storagePath} — ${error.message}`);
    failed++;
  } else {
    done++;
    if (done % 50 === 0) console.log(`  ${done}/${files.length} uploaded...`);
  }
}

console.log(`\nDone! ${done} uploaded, ${failed} failed.`);

// ── Print the base URL to copy into playerImage.ts ────────────────────────────
const baseUrl = `${SUPABASE_URL}/storage/v1/object/public/${BUCKET}`;
console.log(`\nYour PLAYER_IMG_BASE URL:\n  ${baseUrl}`);
