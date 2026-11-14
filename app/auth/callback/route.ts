import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function GET(request: NextRequest) {
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const requestedNext = url.searchParams.get("next") || "/";
  const next = requestedNext.startsWith("/") && !requestedNext.startsWith("//") ? requestedNext : "/";
  const origin = url.origin;

  if (code) {
    const supabase = await createClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error && url.searchParams.get("subscribe") === "1") {
      const { data: { user } } = await supabase.auth.getUser();
      if (user?.email) {
        await supabase.from("ajecch_notification_subscribers").upsert({
          user_id: user.id,
          email: user.email,
          is_active: true,
          consent_at: new Date().toISOString()
        }, { onConflict: "user_id" });
      }
    }
    if (!error) return NextResponse.redirect(new URL(next, origin));
  }

  return NextResponse.redirect(new URL("/?google=connection-error", origin));
}
