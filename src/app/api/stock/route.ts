import dns from "node:dns";
dns.setDefaultResultOrder("ipv4first");

import { google } from "googleapis";
import { NextResponse } from "next/server";

export const dynamic = 'force-dynamic';
export const revalidate = 0;

let cachedAuth: any = null;
let cachedSheets: any = null;

const getSheetsClient = () => {
  if (cachedSheets) return cachedSheets;

  const email = process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL;
  const rawKey = process.env.GOOGLE_PRIVATE_KEY;

  if (!email || !rawKey) {
    throw new Error(`Missing Auth Credentials`);
  }

  let private_key = rawKey
    .replace(/\\n/g, '\n')
    .replace(/"/g, '')
    .trim();

  cachedAuth = new google.auth.GoogleAuth({
    credentials: { client_email: email, private_key },
    scopes: ["https://www.googleapis.com/auth/spreadsheets"],
  });

  cachedSheets = google.sheets({ version: "v4", auth: cachedAuth });
  return cachedSheets;
};

// IMS Sheet ID (different from StoreDataEntry sheet)
const IMS_SHEET_ID = "1qb6LF7uWTss8PjpN2MJ3iCRynEolm-Ryvjwe-GxiA_M";

export async function GET() {
  try {
    const sheets = getSheetsClient();

    // Fetch only Column B (Item Name) and Column K (Remaining Stock) from IMS tab
    // Row 1 is header row
    const response = await sheets.spreadsheets.values.get({
      spreadsheetId: IMS_SHEET_ID,
      range: "IMS!B:K",
    });

    const rows = response.data.values || [];
    if (rows.length < 2) return NextResponse.json({ success: true, stockMap: {} });

    // rows[0] is the header row → B=Item Name, K=Remaining Stock (index 9 since B:K = 10 cols, 0-indexed)
    // B is index 0, K is index 9 in the B:K range
    const stockMap: Record<string, string> = {};

    rows.slice(1).forEach((row: string[]) => {
      const itemName = (row[0] || "").trim();         // Column B → index 0
      const stockValue = (row[9] || "").trim();       // Column K → index 9
      if (itemName) {
        stockMap[itemName.toLowerCase()] = stockValue;
      }
    });

    return NextResponse.json({ success: true, stockMap });
  } catch (error: any) {
    console.error("IMS Stock API error:", error);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
