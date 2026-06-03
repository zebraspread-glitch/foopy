import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

const OLD_PROJECT_URL = "https://ogdtvdvdtxohgyrhlgfk.supabase.co";
const NEW_PROJECT_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;

function adminSupabase() {
  return createClient(NEW_PROJECT_URL, process.env.SUPABASE_SERVICE_ROLE_KEY!);
}

async function downloadImage(url: string): Promise<{ data: Buffer; contentType: string } | null> {
  try {
    const res = await fetch(url);
    if (!res.ok) return null;
    const contentType = res.headers.get("content-type") ?? "image/jpeg";
    const arrayBuffer = await res.arrayBuffer();
    return { data: Buffer.from(arrayBuffer), contentType };
  } catch {
    return null;
  }
}

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const secret = searchParams.get("secret");
  if (!secret || secret !== process.env.CRON_SECRET) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const db = adminSupabase();
  const results: any[] = [];

  // Ensure buckets exist in new project
  for (const bucket of ["avatars", "banners"]) {
    const { error } = await db.storage.createBucket(bucket, { public: true });
    if (error && !error.message.includes("already exists")) {
      console.error(`Failed to create bucket ${bucket}:`, error.message);
    }
  }

  // Fetch all profiles with old URLs
  const { data: profiles } = await db
    .from("profiles")
    .select("id, avatar_url, banner_url")
    .or(`avatar_url.ilike.%${OLD_PROJECT_URL}%,banner_url.ilike.%${OLD_PROJECT_URL}%`);

  if (!profiles?.length) {
    return NextResponse.json({ message: "No profiles with old URLs found", results });
  }

  for (const profile of profiles) {
    const updates: Record<string, string> = {};

    for (const [field, bucket] of [["avatar_url", "avatars"], ["banner_url", "banners"]] as const) {
      const oldUrl: string | null = profile[field];
      if (!oldUrl || !oldUrl.includes(OLD_PROJECT_URL)) continue;

      // Extract the file path from the old URL
      const pathMatch = oldUrl.match(/\/storage\/v1\/object\/public\/(?:avatars|banners)\/(.+)/);
      if (!pathMatch) continue;
      const filePath = pathMatch[1];

      // Download from old project
      const downloaded = await downloadImage(oldUrl);
      if (!downloaded) {
        results.push({ profile_id: profile.id, field, status: "download_failed", url: oldUrl });
        continue;
      }

      // Upload to new project
      const { error: uploadError } = await db.storage
        .from(bucket)
        .upload(filePath, downloaded.data, {
          contentType: downloaded.contentType,
          upsert: true,
        });

      if (uploadError) {
        results.push({ profile_id: profile.id, field, status: "upload_failed", error: uploadError.message });
        continue;
      }

      // Get new public URL
      const { data: { publicUrl } } = db.storage.from(bucket).getPublicUrl(filePath);
      updates[field] = publicUrl;
      results.push({ profile_id: profile.id, field, status: "migrated", newUrl: publicUrl });
    }

    if (Object.keys(updates).length > 0) {
      await db.from("profiles").update(updates).eq("id", profile.id);
    }
  }

  return NextResponse.json({
    migrated: results.filter(r => r.status === "migrated").length,
    failed: results.filter(r => r.status !== "migrated").length,
    results,
  });
}
