// Server-only admin authorisation. Import ONLY from API routes (route.ts).
// Admin access is granted by being signed in as a configured admin account —
// never by a shared/hardcoded secret.
import { createClient } from "@supabase/supabase-js";

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { autoRefreshToken: false, persistSession: false } },
);

/** Configured admin email(s), lower-cased. FOOPY_ADMIN_EMAIL may be comma-separated. */
function adminEmails(): string[] {
  return (process.env.FOOPY_ADMIN_EMAIL ?? "")
    .split(",")
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);
}

/** Returns the authenticated user IF their bearer token belongs to a configured admin, else null. */
export async function getAdminUser(req: Request) {
  const allowed = adminEmails();
  if (!allowed.length) return null;

  const auth = req.headers.get("authorization");
  const token = auth?.startsWith("Bearer ") ? auth.slice(7) : null;
  if (!token) return null;

  const { data: { user }, error } = await supabaseAdmin.auth.getUser(token);
  if (error || !user) return null;
  if (!allowed.includes((user.email ?? "").toLowerCase())) return null;

  return user;
}

export async function isAdminRequest(req: Request): Promise<boolean> {
  return (await getAdminUser(req)) !== null;
}
