import { NextResponse } from "next/server";

export async function GET() {
  const rawKey = process.env.GOOGLE_PRIVATE_KEY || "";
  return NextResponse.json({ 
    rawKeyType: typeof rawKey,
    rawKeyLength: rawKey.length,
    rawKeyPreview: rawKey.substring(0, 50),
    hasLiteralSlashN: rawKey.includes("\\n"),
    hasRealNewline: rawKey.includes("\n"),
    startsWithQuote: rawKey.startsWith('"'),
    endsWithQuote: rawKey.endsWith('"')
  });
}
