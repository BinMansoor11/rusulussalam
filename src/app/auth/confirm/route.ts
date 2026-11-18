import { type NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl;
  const tokenHash = searchParams.get("token_hash");
  const code = searchParams.get("code");
  const supabase = await createClient("mutation");
  let confirmed = false;

  if (tokenHash && searchParams.get("type") === "email") {
    const { data, error } = await supabase.auth.verifyOtp({ token_hash: tokenHash, type: "email" });
    confirmed = !error && !!data.session;
  } else if (code) {
    const { data, error } = await supabase.auth.exchangeCodeForSession(code);
    confirmed = !error && !!data.session;
  }

  return new NextResponse(null, {
    status: 303,
    headers: {
      Location: confirmed ? "/dashboard" : "/login?notice=confirmation-failed",
      "Cache-Control": "private, no-store",
      "Referrer-Policy": "no-referrer",
    },
  });
}
