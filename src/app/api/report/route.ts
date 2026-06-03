import dns from "node:dns";
dns.setDefaultResultOrder("ipv4first");

import { google } from "googleapis";
import { NextResponse } from "next/server";

export const dynamic = 'force-dynamic';
export const revalidate = 0;
export const maxDuration = 60;

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

const HEADERS = [
  "#", "Store RKD Number", "Timestamp", "Person Filling Name",
  "Item Name", "Require Qty", "Units", "Issue Qty",
  "Status", "Department", "Machine Name", "Machine ID",
  "Breakdown/Civil Complain Number", "Vendor Name", "Price",
  "Stock in Store", "Approval Require?", "Approved Quantity",
  "Debit Note Qty", "Reverse Entry Qty"
];

let cachedReportData: Map<number, any> = new Map();
let lastReportFetch: Map<number, number> = new Map();
const REPORT_CACHE_DURATION = 60000; // 1 minute per year

export async function GET(req: Request) {
  const now = Date.now();
  const url = new URL(req.url);
  const forceRefresh = url.searchParams.get("refresh") === "1";

  // Year filter — default to current year
  const yearParam = url.searchParams.get("year");
  const filterYear = yearParam ? parseInt(yearParam) : new Date().getFullYear();

  // Serve from cache if fresh
  if (!forceRefresh
    && cachedReportData.has(filterYear)
    && (now - (lastReportFetch.get(filterYear) ?? 0)) < REPORT_CACHE_DURATION) {
    return NextResponse.json(cachedReportData.get(filterYear));
  }

  if (!STORE_SHEET_ID) {
    return NextResponse.json({ success: false, error: "Missing GOOGLE_SHEET_ID" }, { status: 500 });
  }

  try {
    const sheets = getSheetsClient();

    // Fetch all StoreDataEntry rows — column A (for count) and A:T (data)
    const batchRes = await sheets.spreadsheets.values.batchGet({
      spreadsheetId: STORE_SHEET_ID,
      ranges: ["StoreDataEntry!A:A", "StoreDataEntry!A:T"],
    });

    const countRows = batchRes.data.valueRanges?.[0]?.values || [];
    const allRows = batchRes.data.valueRanges?.[1]?.values || [];

    // Map rows to objects, filter by year + status
    const data = allRows
      .map((row: any, idx: number) => {
        const obj: any = { _rowIdx: idx + 1 };
        HEADERS.forEach((h, i) => { obj[h] = row[i] !== undefined ? String(row[i]) : ""; });
        return obj;
      })
      .filter((r: any) => {
        const rkd      = String(r["Store RKD Number"] || "").trim();
        const status   = String(r["Status"]           || "").trim();
        const issueQty = parseFloat(r["Issue Qty"]    || "0") || 0;
        const ts       = String(r["Timestamp"]        || "");
        // Extract year from timestamp with regex (handles "2 June 2026 4:35 PM" etc.)
        const yearMatch = ts.match(/\b(20\d{2})\b/);
        const rowYear   = yearMatch ? parseInt(yearMatch[1]) : 0;
        return rkd.startsWith("RKD") && status === "Requirement Closed" && issueQty > 0 && rowYear === filterYear;
      })
      .map((r: any) => {
        const issueQty = parseFloat(r["Issue Qty"] || "0") || 0;
        const price    = parseFloat(r["Price"]     || "0") || 0;
        return { ...r, "Total Price": (issueQty * price).toFixed(2) };
      });

    const responseData = {
      success: true,
      data,
      year: filterYear,
      totalRows: countRows.length,
      fetchedAt: new Date().toISOString(),
    };

    cachedReportData.set(filterYear, responseData);
    lastReportFetch.set(filterYear, now);

    return new NextResponse(JSON.stringify(responseData), {
      headers: { "Content-Type": "application/json", "Cache-Control": "no-store" }
    });
  } catch (error: any) {
    console.error("[Report API] Error:", error.message);
    const stale = cachedReportData.get(filterYear);
    if (stale) return NextResponse.json({ ...stale, stale: true });
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
