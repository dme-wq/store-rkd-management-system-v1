import dns from "node:dns";
dns.setDefaultResultOrder("ipv4first");

import { google } from "googleapis";
import { NextResponse } from "next/server";

export const dynamic = 'force-dynamic';
export const revalidate = 0;
export const maxDuration = 30;

const IMS_SHEET_ID = "1qb6LF7uWTss8PjpN2MJ3iCRynEolm-Ryvjwe-GxiA_M";

let cachedSheets: any = null;
const getSheetsClient = () => {
  if (cachedSheets) return cachedSheets;
  const email = process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL;
  const rawKey = process.env.GOOGLE_PRIVATE_KEY;
  if (!email || !rawKey) throw new Error("Missing Auth Credentials");
  const private_key = rawKey.replace(/\\n/g, '\n').replace(/"/g, '').trim();
  const auth = new google.auth.GoogleAuth({
    credentials: { client_email: email, private_key },
    scopes: ["https://www.googleapis.com/auth/spreadsheets"],
  });
  cachedSheets = google.sheets({ version: "v4", auth });
  return cachedSheets;
};

// Column mapping: B to M (0-indexed from column B)
const IMS_HEADERS = [
  "Item Name",       // B
  "Units",           // C
  "Minimum Stock",   // D
  "Delivery Time",   // E
  "Safety Factor",   // F
  "Min Qty to Maintain", // G
  "Opening Stock",   // H
  "Issue Qty",       // I
  "Received Qty",    // J
  "Remaining Stock", // K
  "Price per Unit",  // L
  "Total Price Value" // M
];

let cachedImsResponse: any = null;
let lastImsFetchTime = 0;
const IMS_CACHE_DURATION = 30000; // 30 seconds

export async function GET() {
  const now = Date.now();

  if (cachedImsResponse && (now - lastImsFetchTime < IMS_CACHE_DURATION)) {
    return NextResponse.json(cachedImsResponse);
  }

  try {
    const sheets = getSheetsClient();

    const res = await sheets.spreadsheets.values.get({
      spreadsheetId: IMS_SHEET_ID,
      range: "IMS!B2:M7500", // Skip header row, columns B to M
    });

    const rows = res.data.values || [];

    const data = rows
      .map((row: any, idx: number) => {
        const obj: any = { _id: idx };
        IMS_HEADERS.forEach((h, i) => {
          obj[h] = row[i] !== undefined ? row[i] : "";
        });
        return obj;
      })
      .filter((r: any) => r["Item Name"] && String(r["Item Name"]).trim() !== "");

    const responseData = {
      success: true,
      data,
      fetchedAt: new Date().toISOString(),
      debug: { totalItems: data.length }
    };

    cachedImsResponse = responseData;
    lastImsFetchTime = now;

    return new NextResponse(JSON.stringify(responseData), {
      headers: {
        "Content-Type": "application/json",
        "Cache-Control": "no-store"
      }
    });
  } catch (error: any) {
    console.error("IMS API error:", error);
    if (cachedImsResponse) {
      return NextResponse.json({ ...cachedImsResponse, stale: true });
    }
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
