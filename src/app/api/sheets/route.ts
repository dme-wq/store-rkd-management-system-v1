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

const STORE_SHEET_ID = process.env.GOOGLE_SHEET_ID!;
const IMS_SHEET_ID = "1qb6LF7uWTss8PjpN2MJ3iCRynEolm-Ryvjwe-GxiA_M";
const MISC_SHEET_ID = process.env.MISC_SHEET_ID!;
const WHATSAPP_LOG_SHEET_ID = process.env.WHATSAPP_LOG_SHEET_ID!;

const MAYTAPI_TOKEN = process.env.MAYTAPI_TOKEN!;
const MAYTAPI_PRODUCT_ID = process.env.MAYTAPI_PRODUCT_ID!;
const MAYTAPI_PHONE_ID = process.env.MAYTAPI_PHONE_ID!;

async function shortenUrl(url: string) {
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 1500); // Short timeout
    const res = await fetch(`https://tinyurl.com/api-create.php?url=${encodeURIComponent(url)}`, { signal: controller.signal });
    clearTimeout(timeout);
    if (res.ok) return await res.text();
    return url;
  } catch (e) {
    return url;
  }
}

async function sendWhatsApp(to: string, message: string) {
  try {
    // Corrected Maytapi URL (Removed /v1/ as per docs)
    const url = `https://api.maytapi.com/api/${MAYTAPI_PRODUCT_ID}/${MAYTAPI_PHONE_ID}/sendMessage`;
    console.log(`[WhatsApp] Sending to ${to}...`);
    
    const res = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-maytapi-key": MAYTAPI_TOKEN
      },
      body: JSON.stringify({ 
        to_number: to, 
        type: "text", 
        message: message 
      })
    });

    const result = await res.json();
    console.log(`[WhatsApp] API Response:`, JSON.stringify(result));
    return result;
  } catch (e) {
    console.error("[WhatsApp] API Error:", e);
    return { success: false, error: String(e) };
  }
}

// Hardcoded column headers (row 6 in the sheet)
const HEADERS = [
  "#", "Store RKD Number", "Timestamp", "Person Filling Name",
  "Item Name", "Require Qty", "Units", "Issue Qty",
  "Status", "Department", "Machine Name", "Machine ID",
  "Breakdown/Civil Complain Number", "Vendor Name", "Price",
  "Stock in Store", "Approval Require?", "Approved Quantity",
  "Debit Note Qty", "Reverse Entry Qty"
];

const monthMap: Record<string, number> = {
  "जनवरी": 0, "फरवरी": 1, "मार्च": 2, "अप्रैल": 3, "मई": 4, "जून": 5,
  "जुलाई": 6, "अगस्त": 7, "सितंबर": 8, "अक्टूबर": 9, "नवंबर": 10, "दिसंबर": 11,
  "jan": 0, "feb": 1, "mar": 2, "apr": 3, "may": 4, "jun": 5,
  "jul": 6, "aug": 7, "sep": 8, "oct": 9, "nov": 10, "dec": 11
};

function parseDate(dateStr: string): Date {
  if (!dateStr) return new Date(0);
  const d = new Date(dateStr);
  if (!isNaN(d.getTime())) return d;
  const parts = dateStr.split(/[-\s/:]+/);
  if (parts.length >= 3) {
    const day = parseInt(parts[0], 10);
    const mStr = parts[1].toLowerCase();
    const year = parseInt(parts[2], 10);
    let month = monthMap[mStr];
    if (month === undefined) {
      const key = Object.keys(monthMap).find(k => mStr.includes(k));
      if (key) {
        month = monthMap[key];
      } else {
        const mNum = parseInt(mStr, 10);
        if (!isNaN(mNum) && mNum >= 1 && mNum <= 12) month = mNum - 1;
        else month = 0;
      }
    }
    return new Date(year, month, day);
  }
  return new Date(0);
}

let lastFetchTime = 0;
let cachedApiResponse: any = null;
const CACHE_DURATION = 30000; // 30 seconds
let cachedStockMap: any = null;
let cachedMiscMap: any = null;
let lastStaticFetchTime = 0;
const STATIC_CACHE_DURATION = 300000; // 5 minutes

export async function GET() {
  if (!STORE_SHEET_ID) {
    return NextResponse.json({ error: "Missing GOOGLE_SHEET_ID" }, { status: 500 });
  }

  const now = Date.now();
  const sheets = getSheetsClient();

  try {
    // 1. Refresh Stock/Vendor Cache every 5 mins (Background)
    if (!cachedStockMap || !cachedMiscMap || (now - lastStaticFetchTime > STATIC_CACHE_DURATION)) {
      console.log("Background Refresh Starting...");
      
      // Fetch IMS Stock
      try {
        const imsBatchRes = await sheets.spreadsheets.values.batchGet({
          spreadsheetId: IMS_SHEET_ID,
          ranges: ["IMS!B1:B10000", "IMS!K1:K10000"],
        });
        const stockMap: Record<string, string> = {};
        const names = imsBatchRes.data.valueRanges?.[0].values || [];
        const stocks = imsBatchRes.data.valueRanges?.[1].values || [];
        names.forEach((row: any, i: number) => {
          const name = (row[0] || "").trim().toLowerCase();
          if (name) stockMap[name] = stocks[i]?.[0] || "0";
        });
        cachedStockMap = stockMap;
      } catch (e: any) {
        console.error("IMS Fetch Error (Stock will show No Stock):", e.message);
        if (!cachedStockMap) cachedStockMap = {};
      }

      // Fetch Misc Vendor/Rate
      try {
        const miscRes = await sheets.spreadsheets.values.get({ 
          spreadsheetId: MISC_SHEET_ID, 
          range: "Data!B1:F10000" 
        });
        const miscMap: Record<string, { vendor: string, rate: string }> = {};
        const miscRows = miscRes.data.values || [];
        miscRows.forEach((row: any) => {
          const name = (row[0] || "").trim().toLowerCase();
          if (name) miscMap[name] = { vendor: row[4] || "", rate: row[3] || "" };
        });
        cachedMiscMap = miscMap;
      } catch (e: any) {
        console.error("Misc Fetch Error (Vendors/Rates will be empty):", e.message);
        if (!cachedMiscMap) cachedMiscMap = {};
      }

      lastStaticFetchTime = now;
    }

    // 2. Return cached main data if still valid (30s)
    if (cachedApiResponse && (now - lastFetchTime < CACHE_DURATION)) {
      return NextResponse.json({
        ...cachedApiResponse,
        stockMap: cachedStockMap || {},
        miscMap: cachedMiscMap || {}
      });
    }

    // 3. Optimized Main Data Fetch
    let totalRows = 0;
    try {
      const idRes = await sheets.spreadsheets.values.get({
        spreadsheetId: STORE_SHEET_ID,
        range: "StoreDataEntry!A:A",
      });
      totalRows = idRes.data.values?.length || 0;
    } catch (e: any) {
      console.error("Main ID Fetch Failed:", e.message);
      return NextResponse.json({ 
        success: false, 
        error: `Cannot access StoreDataEntry tab. Please share the sheet with the service account. Error: ${e.message}` 
      }, { status: 500 });
    }

    const startRow = Math.max(1, totalRows - 2999);
    let storeRows: any[] = [];
    try {
      const storeRes = await sheets.spreadsheets.values.get({
        spreadsheetId: STORE_SHEET_ID,
        range: `StoreDataEntry!A${startRow}:T${totalRows}`,
      });
      storeRows = storeRes.data.values || [];
    } catch (e: any) {
      console.error("Main Data Fetch Failed:", e.message);
      return NextResponse.json({ 
        success: false, 
        error: `Failed to fetch records from Main Sheet (A${startRow}:T${totalRows}). ID: ${STORE_SHEET_ID}. Error: ${e.message}` 
      }, { status: 500 });
    }

    const data = storeRows.map((row: any, idx: number) => {
      const actualRowNumber = startRow + idx;
      const obj: any = { _id: idx, rowNumber: actualRowNumber };
      HEADERS.forEach((h: string, i: number) => { obj[h] = row[i] || ""; });
      return obj;
    }).filter((r: any) => r["Store RKD Number"] && r["Store RKD Number"] !== "#"); // Filter empty rows

    const responseData = { 
      success: true, 
      data: data.reverse(),
      stockMap: cachedStockMap || {},
      miscMap: cachedMiscMap || {},
      fetchedAt: new Date().toISOString(),
      debug: { rowsReturned: storeRows.length, totalRows }
    };

    cachedApiResponse = responseData;
    lastFetchTime = now;

    return new NextResponse(JSON.stringify(responseData), {
      headers: {
        "Content-Type": "application/json",
        "Cache-Control": "public, s-maxage=1, stale-while-revalidate=59"
      }
    });
  } catch (error: any) {
    console.error("API error:", error);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { rkdNumber, issueQty, status, itemName, rate, action, vendorName, approvedQty } = body;
    console.log(`Processing ${action || 'ISSUE'} for RKD: ${rkdNumber}`);
    
    if (!rkdNumber) throw new Error("Missing rkdNumber");

    const sheets = getSheetsClient();
    
    const searchRes = await sheets.spreadsheets.values.get({
      spreadsheetId: STORE_SHEET_ID,
      range: "StoreDataEntry!B:B",
    });

    const rkdList = searchRes.data.values || [];
    const rowIndex = rkdList.findIndex((row: any) => row[0] === rkdNumber);
    if (rowIndex === -1) throw new Error(`RKD Number ${rkdNumber} not found.`);

    const rowNumber = rowIndex + 1;
    
    // Date formatting (shared)
    const now = new Date();
    const day = now.getDate();
    const monthNames = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
    const month = monthNames[now.getMonth()];
    const year = now.getFullYear();
    let hours = now.getHours();
    const minutes = now.getMinutes().toString().padStart(2, '0');
    const ampm = hours >= 12 ? 'PM' : 'AM';
    hours = hours % 12 || 12;
    const formattedDate = `${day} ${month} ${year} ${hours}:${minutes} ${ampm}`;

    let finalRate = rate;
    let finalItemName = itemName;
    let finalVendorName = vendorName;

    // If Rate or Item Name is missing, fetch from sheet directly as fallback
    if (!finalRate || !finalItemName || finalRate === "0") {
      const rowDataRes = await sheets.spreadsheets.values.get({
        spreadsheetId: STORE_SHEET_ID,
        range: `StoreDataEntry!A${rowNumber}:T${rowNumber}`,
      });
      const rowValues = rowDataRes.data.values?.[0] || [];
      if (!finalItemName) finalItemName = rowValues[4]; // Column E
      if (!finalVendorName) finalVendorName = rowValues[13]; // Column N
      if (!finalRate || finalRate === "0") finalRate = rowValues[14]; // Column O
    }

    if (action === "APPROVE") {
      // CLERK SIDE: Only trigger WhatsApp, do NOT update StoreDataEntry yet
      console.log(`Clerk Requesting Approval for RKD: ${rkdNumber}. Qty: ${approvedQty}, Rate: ${finalRate}`);

      if (status === "Yes") {
        const whatsappRes = await sheets.spreadsheets.values.get({
          spreadsheetId: STORE_SHEET_ID,
          range: "whatsappApproval!A:B",
        });
        const recipients = whatsappRes.data.values || [];
        const contacts = recipients.slice(1).filter((r: any) => r[1]);

        if (contacts.length > 0) {
          const host = req.headers.get("host") || "rkd-store.vercel.app";
          const protocol = req.headers.get("x-forwarded-proto") || (host.includes("localhost") ? "http" : "https");
          const appUrl = `${protocol}://${host}`;
          
          // Pass details in URL so owner has context
          const rawLink = `${appUrl}/approve/${rkdNumber}?qty=${approvedQty}&rate=${finalRate}&vendor=${encodeURIComponent(finalVendorName)}`;
          const shortLink = await shortenUrl(rawLink);
          
          const message = `🚨 *RKD STORE APPROVAL REQUIRED* 🚨\n\n*RKD No:* ${rkdNumber}\n*Item:* ${finalItemName}\n*Vendor:* ${finalVendorName}\n*Qty:* ${approvedQty}\n*Rate:* ${finalRate}\n\n👉 *Click here to Approve/Reject:* ${shortLink}\n\n_System generated notification_`;

          for (const contact of contacts) {
            let phone = String(contact[1]).replace(/\D/g, "");
            if (phone.length === 10) phone = "91" + phone;
            else if (phone.startsWith("0") && phone.length === 11) phone = "91" + phone.slice(1);
            await sendWhatsApp(phone, message);
          }

          // Log to WhatsappData (Log Spreadsheet) with "Pending" status
          const rowRes = await sheets.spreadsheets.values.get({
            spreadsheetId: STORE_SHEET_ID,
            range: `StoreDataEntry!F${rowNumber}`,
          });
          const requireQty = rowRes.data.values?.[0]?.[0] || "0";

          await sheets.spreadsheets.values.append({
            spreadsheetId: WHATSAPP_LOG_SHEET_ID,
            range: "WhatsappData!A:I",
            valueInputOption: "USER_ENTERED",
            requestBody: {
              values: [[formattedDate, rkdNumber, finalVendorName, finalItemName, requireQty, approvedQty, finalRate, "Pending Owner Approval", shortLink]]
            }
          });
        }
      }
      return NextResponse.json({ success: true, message: "Approval Notification Sent" });
    } else if (action === "WHATSAPP_UPDATE") {
      // OWNER SIDE: Owner clicked the link and decided. NOW we update StoreDataEntry.
      const { ownerStatus, approvedQty: finalQty, rate: finalOwnRate, vendor: finalVendor } = body;
      
      console.log(`Owner decision: ${ownerStatus} for RKD: ${rkdNumber}`);

      // 1. Update ONLY Q (Approval Require?) and R (Approved Qty) in StoreDataEntry
      //    Vendor and Rate in N and O are set from the Miscellaneous list already — don't overwrite
      await sheets.spreadsheets.values.update({
        spreadsheetId: STORE_SHEET_ID,
        range: `StoreDataEntry!Q${rowNumber}:R${rowNumber}`,
        valueInputOption: "USER_ENTERED",
        requestBody: { 
          values: [[ownerStatus, finalQty || ""]] 
        }
      });

      // 2. Update WhatsappData log — set column H to owner's decision
      const logRes = await sheets.spreadsheets.values.get({
        spreadsheetId: WHATSAPP_LOG_SHEET_ID,
        range: "WhatsappData!B:B",
      });
      const logList = logRes.data.values || [];
      const logIdx = logList.findIndex((r: any) => r[0] === rkdNumber);
      if (logIdx !== -1) {
        const logRowNum = logIdx + 1;
        await sheets.spreadsheets.values.update({
          spreadsheetId: WHATSAPP_LOG_SHEET_ID,
          range: `WhatsappData!H${logRowNum}`,
          valueInputOption: "USER_ENTERED",
          requestBody: { values: [[ownerStatus === "Yes" ? "Approved" : "Rejected"]] }
        });
      }

      // NEW: If Approved, save to approvalDataBase
      if (ownerStatus === "Yes") {
        const fullRowRes = await sheets.spreadsheets.values.get({
          spreadsheetId: STORE_SHEET_ID,
          range: `StoreDataEntry!A${rowNumber}:T${rowNumber}`,
        });
        const rowData = fullRowRes.data.values?.[0] || [];
        
        await sheets.spreadsheets.values.append({
          spreadsheetId: STORE_SHEET_ID,
          range: "approvalDataBase!A:T",
          valueInputOption: "USER_ENTERED",
          requestBody: {
            values: [rowData]
          }
        });
      }
    } else {
      // Default: ISSUE action
      // Update H (Issue Qty) and I (Status) in StoreDataEntry
      await sheets.spreadsheets.values.update({
        spreadsheetId: STORE_SHEET_ID,
        range: `StoreDataEntry!H${rowNumber}:I${rowNumber}`,
        valueInputOption: "USER_ENTERED",
        requestBody: {
          values: [[issueQty, status]]
        }
      });

      // Append to IssueDataBase
      await sheets.spreadsheets.values.append({
        spreadsheetId: STORE_SHEET_ID,
        range: "IssueDataBase!A:E",
        valueInputOption: "USER_ENTERED",
        requestBody: {
          values: [[formattedDate, rkdNumber, issueQty, rate, itemName]]
        }
      });
    }

    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error("Update error:", error);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
