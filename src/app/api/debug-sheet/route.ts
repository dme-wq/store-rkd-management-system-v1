import { google } from "googleapis";
import { NextResponse } from "next/server";

export const dynamic = 'force-dynamic';

export async function GET() {
  const email = process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL;
  const rawKey = process.env.GOOGLE_PRIVATE_KEY;
  const sheetId = process.env.GOOGLE_SHEET_ID;

  if (!email || !rawKey || !sheetId) {
    return NextResponse.json({ error: "Missing Env Vars" });
  }

  try {
    const private_key = rawKey.replace(/\\n/g, '\n').replace(/"/g, '').trim();
    const auth = new google.auth.GoogleAuth({
      credentials: { client_email: email, private_key },
      scopes: ["https://www.googleapis.com/auth/spreadsheets"],
    });
    const sheets = google.sheets({ version: "v4", auth });

    const res = await sheets.spreadsheets.get({ spreadsheetId: sheetId });
    const sheetNames = (res.data.sheets || []).map((s: any) => s.properties?.title || "unknown");
    
    return NextResponse.json({ 
      success: true, 
      spreadsheetId: sheetId,
      serviceAccount: email,
      sheets: sheetNames 
    });
  } catch (e: any) {
    return NextResponse.json({ success: false, error: e.message });
  }
}
