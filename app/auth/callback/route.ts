import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function GET(request: NextRequest) {
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const requestedNext = url.searchParams.get("next") || "/";
  const hasUnsafeSeparator = requestedNext.includes("\\") || /%5c/i.test(requestedNext);
  let next = "/";

  if (requestedNext.startsWith("/") && !requestedNext.startsWith("//") && !hasUnsafeSeparator) {
    const destination = new URL(requestedNext, url.origin);
    if (destination.origin === url.origin && !destination.pathname.startsWith("//")) {
      next = `${destination.pathname}${destination.search}${destination.hash}`;
    }
  }

  if (!code) {
    return NextResponse.redirect(new URL("/?auth=callback-error", url.origin));
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.exchangeCodeForSession(code);

  if (error) {
    return NextResponse.redirect(new URL("/?auth=callback-error", url.origin));
  }

  return NextResponse.redirect(new URL(next, url.origin));
}
