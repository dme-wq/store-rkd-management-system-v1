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
  if (!email || !rawKey) throw new Error("Missing Auth Credentials");
  const private_key = rawKey.replace(/\\n/g, '\n').replace(/"/g, '').trim();
  const auth = new google.auth.GoogleAuth({
    credentials: { client_email: email, private_key },
    scopes: ["https://www.googleapis.com/auth/spreadsheets"],
  });
  cachedSheets = google.sheets({ version: "v4", auth });
  return cachedSheets;
};

const STORE_SHEET_ID = process.env.GOOGLE_SHEET_ID!;
const TAB_NAME = "approvalDataBase";

const HEADERS = [
  "Timestamp", "Store RKD Number", "Vendor Name", "Rate", "Approval Require?", "Approved Qty"
];

export async function GET(req: Request) {
  try {
    const sheets = getSheetsClient();
    
    // Fetch last 1000 rows (approx max for approval entries)
    // First find out total rows to prevent fetching too much empty space, or just fetch A:F
    const res = await sheets.spreadsheets.values.get({
      spreadsheetId: STORE_SHEET_ID,
      range: `${TAB_NAME}!A2:F`,
    });

    const rows = res.data.values || [];
    
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    const data = rows.map((row: any[], idx: number) => {
      const obj: any = { _id: idx, rowNumber: idx + 2 };
      HEADERS.forEach((h: string, i: number) => { obj[h] = row[i] || ""; });
      return obj;
    }).filter((r: any) => {
      if (!r["Store RKD Number"] || !r["Store RKD Number"].startsWith("RKD")) return false;
      const dateStr = r["Timestamp"];
      if (dateStr) {
        const entryDate = new Date(dateStr);
        if (!isNaN(entryDate.getTime()) && entryDate < thirtyDaysAgo) {
          return false;
        }
      }
      return true;
    });

    return new NextResponse(JSON.stringify({ success: true, data: data.reverse() }), {
      headers: { "Content-Type": "application/json", "Cache-Control": "no-store" }
    });
  } catch (error: any) {
    console.error("Approval API GET error:", error);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { action, approvalRowNumber, rkdNumber, newQty } = body;
    
    if (action === "EDIT_QTY") {
       const sheets = getSheetsClient();
       
       // 1. Update approvalDataBase column F (Approved Qty)
       await sheets.spreadsheets.values.update({
         spreadsheetId: STORE_SHEET_ID,
         range: `${TAB_NAME}!F${approvalRowNumber}`,
         valueInputOption: "USER_ENTERED",
         requestBody: { values: [[newQty]] }
       });
       
       // 2. Find row in StoreDataEntry
       const searchRes = await sheets.spreadsheets.values.get({
         spreadsheetId: STORE_SHEET_ID,
         range: "StoreDataEntry!B:B",
       });
       const rkdList = searchRes.data.values || [];
       const storeRowIndex = rkdList.findIndex((row: any) => row[0] === rkdNumber);
       
       // 3. Update StoreDataEntry Column R (Approved Qty) if found
       if (storeRowIndex !== -1) {
          const storeRowNumber = storeRowIndex + 1;
          await sheets.spreadsheets.values.update({
            spreadsheetId: STORE_SHEET_ID,
            range: `StoreDataEntry!R${storeRowNumber}`,
            valueInputOption: "USER_ENTERED",
            requestBody: { values: [[newQty]] }
          });
       }

       return NextResponse.json({ success: true });
    }
    
    return NextResponse.json({ success: false, error: "Invalid action" });
  } catch (error: any) {
    console.error("Approval API POST error:", error);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
