import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "fs";

// Read env from .env.local
const envFile = readFileSync(".env.local", "utf8");
const env = Object.fromEntries(
  envFile.split("\n")
    .filter(l => l.includes("=") && !l.startsWith("#"))
    .map(l => { const i = l.indexOf("="); return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^["']|["']$/g, "")]; })
);

const NEW_URL = env.NEXT_PUBLIC_SUPABASE_URL;
const SERVICE_KEY = env.SUPABASE_SERVICE_ROLE_KEY;
const OLD_URL = "https://ogdtvdvdtxohgyrhlgfk.supabase.co";

if (!NEW_URL || !SERVICE_KEY) {
  console.error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env.local");
  process.exit(1);
}

const db = createClient(NEW_URL, SERVICE_KEY);

async function run() {
  console.log("Fetching profiles with old URLs...");

  const { data: profiles, error } = await db
    .from("profiles")
    .select("id, avatar_url, banner_url");

  if (error) { console.error("Failed to fetch profiles:", error.message); process.exit(1); }

  const toMigrate = profiles.filter(p =>
    (p.avatar_url && p.avatar_url.includes(OLD_URL)) ||
    (p.banner_url && p.banner_url.includes(OLD_URL))
  );

  console.log(`Found ${toMigrate.length} profiles to migrate.`);
  if (!toMigrate.length) { console.log("Nothing to do!"); return; }

  // Ensure buckets exist
  for (const bucket of ["avatars", "banners"]) {
    const { error } = await db.storage.createBucket(bucket, { public: true });
    if (error && !error.message.includes("already exists")) console.warn(`Bucket ${bucket}:`, error.message);
  }

  let migrated = 0, failed = 0;

  for (const profile of toMigrate) {
    for (const [field, bucket] of [["avatar_url", "avatars"], ["banner_url", "banners"]]) {
      const oldUrl = profile[field];
      if (!oldUrl || !oldUrl.includes(OLD_URL)) continue;

      const pathMatch = oldUrl.match(/\/storage\/v1\/object\/public\/(?:avatars|banners)\/(.+)/);
      if (!pathMatch) { console.warn(`Couldn't parse path from: ${oldUrl}`); failed++; continue; }
      const filePath = decodeURIComponent(pathMatch[1]);

      // Download
      let imageData, contentType;
      try {
        const res = await fetch(oldUrl);
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        contentType = res.headers.get("content-type") ?? "image/jpeg";
        imageData = Buffer.from(await res.arrayBuffer());
      } catch (e) {
        console.error(`Download failed for ${profile.id} ${field}:`, e.message);
        failed++; continue;
      }

      // Upload
      const { error: uploadErr } = await db.storage
        .from(bucket)
        .upload(filePath, imageData, { contentType, upsert: true });

      if (uploadErr) {
        console.error(`Upload failed for ${profile.id} ${field}:`, uploadErr.message);
        failed++; continue;
      }

      // Get new URL and update profile
      const { data: { publicUrl } } = db.storage.from(bucket).getPublicUrl(filePath);
      await db.from("profiles").update({ [field]: publicUrl }).eq("id", profile.id);

      console.log(`✓ ${profile.id} ${field} → ${publicUrl}`);
      migrated++;
    }
  }

  console.log(`\nDone! Migrated: ${migrated}, Failed: ${failed}`);
}

run().catch(console.error);
