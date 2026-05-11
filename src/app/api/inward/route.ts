import dns from "node:dns";
dns.setDefaultResultOrder("ipv4first");

import { google } from "googleapis";
import { NextResponse } from "next/server";

export const dynamic = 'force-dynamic';
export const revalidate = 0;

let cachedSheets: any = null;

const getSheetsClient = () => {
  if (cachedSheets) return cachedSheets;
  const email = process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL;
  const rawKey = process.env.GOOGLE_PRIVATE_KEY;
  if (!email || !rawKey) throw new Error(`Missing Auth Credentials`);
  const private_key = rawKey.replace(/\\n/g, '\n').replace(/"/g, '').trim();
  const auth = new google.auth.GoogleAuth({
    credentials: { client_email: email, private_key },
    scopes: ["https://www.googleapis.com/auth/spreadsheets"],
  });
  cachedSheets = google.sheets({ version: "v4", auth });
  return cachedSheets;
};

const INWARD_SHEET_ID = "1mOM0OdePjpGzFet9LKn3_yvAcJBxIMY_4dHb8t0AzOc";
const TAB_NAME = "Gate & Inward_Entry";

// Headers as per the screenshot
const HEADERS = [
  "Timestamp", "Gate Entry Date", "Vendor Name", "Purchase Order Number",
  "Item Name", "Indent Request Number", "Received Qty", "Units",
  "Gate User Email", "Inward Qty", "Store User Email", "Timestamp of Inward Entry", "Rate"
];

export async function GET() {
  const sheets = getSheetsClient();
  try {
    const res = await sheets.spreadsheets.values.get({
      spreadsheetId: INWARD_SHEET_ID,
      range: `${TAB_NAME}!A2:M`,
    });

    const rows = res.data.values || [];
    
    // Process and format
    const data = rows.map((row: any[], idx: number) => {
      const obj: any = { _id: idx, rowNumber: idx + 2 }; // +2 because range starts at A2
      HEADERS.forEach((h: string, i: number) => { obj[h] = row[i] || ""; });
      return obj;
    });

    // We only want rows where Gate Entry is done, but Inward Qty (Index 9) is empty.
    const pendingInwards = data.filter((r: any) => 
      r["Indent Request Number"] && 
      (!r["Inward Qty"] || r["Inward Qty"].toString().trim() === "")
    );

    return new NextResponse(JSON.stringify({ success: true, data: pendingInwards.reverse() }), {
      headers: { "Content-Type": "application/json", "Cache-Control": "no-store" }
    });
  } catch (error: any) {
    console.error("Inward API GET error:", error);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { rowNumber, inwardQty, rate } = body;
    
    if (!rowNumber) throw new Error("Missing rowNumber");

    const sheets = getSheetsClient();
    
    const now = new Date();
    const mm = String(now.getMonth() + 1).padStart(2, '0');
    const dd = String(now.getDate()).padStart(2, '0');
    const yyyy = now.getFullYear();
    const hh = String(now.getHours()).padStart(2, '0');
    const min = String(now.getMinutes()).padStart(2, '0');
    const ss = String(now.getSeconds()).padStart(2, '0');
    const timestampStr = `${mm}/${dd}/${yyyy} ${hh}:${min}:${ss}`;

    const storeUserEmail = "store@rkd.in";

    await sheets.spreadsheets.values.update({
      spreadsheetId: INWARD_SHEET_ID,
      range: `${TAB_NAME}!J${rowNumber}:M${rowNumber}`,
      valueInputOption: "USER_ENTERED",
      requestBody: {
        values: [[inwardQty, storeUserEmail, timestampStr, rate || ""]]
      }
    });

    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error("Inward API POST error:", error);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
