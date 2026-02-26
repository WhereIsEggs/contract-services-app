import { NextResponse } from "next/server";
import { createClient } from "../../lib/supabase/server";

export async function POST(request: Request) {
  const formData = await request.formData();
  const password = String(formData.get("password") ?? "");
  const confirmPassword = String(formData.get("confirm_password") ?? "");

  if (!password || password.length < 8) {
    return NextResponse.redirect(new URL("/reset-password?error=1", request.url));
  }

  if (password !== confirmPassword) {
    return NextResponse.redirect(new URL("/reset-password?mismatch=1", request.url));
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.updateUser({ password });

  if (error) {
    return NextResponse.redirect(new URL("/reset-password?error=1", request.url));
  }

  return NextResponse.redirect(new URL("/login?reset=1", request.url));
}
