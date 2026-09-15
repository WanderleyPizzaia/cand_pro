import { NextResponse } from "next/server";
import { limparCookieSessao } from "@/lib/auth";

export const dynamic = "force-dynamic";

export async function POST() {
  limparCookieSessao();
  return NextResponse.json({ ok: true });
}
