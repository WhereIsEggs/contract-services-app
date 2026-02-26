import { NextResponse } from "next/server";
import { createClient } from "../../lib/supabase/server";

export async function POST(request: Request) {
  const formData = await request.formData();
  const email = String(formData.get("email") ?? "").trim();

  if (!email) {
    return NextResponse.redirect(new URL("/forgot-password?error=1", request.url));
  }

  const supabase = await createClient();
  const origin = new URL(request.url).origin;

  const { error } = await supabase.auth.resetPasswordForEmail(email, {
    redirectTo: `${origin}/auth/callback?next=/reset-password`,
  });

  if (error) {
    return NextResponse.redirect(new URL("/forgot-password?error=1", request.url));
  }

  return NextResponse.redirect(new URL("/forgot-password?sent=1", request.url));
}
