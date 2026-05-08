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
    const timeout = setTimeout(() => controller.abort(), 3000);
    const res = await fetch(`https://tinyurl.com/api-create.php?url=${encodeURIComponent(url)}`, { signal: controller.signal });
    clearTimeout(timeout);
    if (res.ok) return await res.text();
    return url;
  } catch (e) {
    console.log("TinyURL Failed or Timed Out, using original link.");
    return url;
  }
}

async function sendWhatsApp(to: string, message: string) {
  try {
    const url = `https://api.maytapi.com/api/v1/product/${MAYTAPI_PRODUCT_ID}/device/${MAYTAPI_PHONE_ID}/sendMessage`;
    console.log(`Sending WhatsApp to ${to}...`);
    const res = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-maytapi-key": MAYTAPI_TOKEN
      },
      body: JSON.stringify({ to_number: to, type: "text", message })
    });
    const result = await res.json();
    console.log(`Maytapi Response for ${to}:`, JSON.stringify(result));
    return result;
  } catch (e) {
    console.error("WhatsApp Send Error:", e);
    return { success: false };
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
      try {
        const [imsBatchRes, miscRes] = await Promise.all([
          sheets.spreadsheets.values.batchGet({
            spreadsheetId: IMS_SHEET_ID,
            ranges: ["IMS!B1:B3000", "IMS!K1:K3000"],
          }),
          sheets.spreadsheets.values.get({ spreadsheetId: MISC_SHEET_ID, range: "Data!B1:F1000" })
        ]);

        const stockMap: Record<string, string> = {};
        const names = imsBatchRes.data.valueRanges?.[0].values || [];
        const stocks = imsBatchRes.data.valueRanges?.[1].values || [];
        names.forEach((row: any, i: number) => {
          const name = (row[0] || "").trim().toLowerCase();
          if (name) stockMap[name] = stocks[i]?.[0] || "0";
        });
        cachedStockMap = stockMap;

        const miscMap: Record<string, { vendor: string, rate: string }> = {};
        const miscRows = miscRes.data.values || [];
        miscRows.forEach((row: any) => {
          const name = (row[0] || "").trim().toLowerCase();
          if (name) miscMap[name] = { vendor: row[4] || "", rate: row[3] || "" };
        });
        cachedMiscMap = miscMap;
        lastStaticFetchTime = now;
      } catch (e) {
        console.error("Static fetch failed, using old data", e);
      }
    }

    // 2. Return cached main data if still valid (30s)
    if (cachedApiResponse && (now - lastFetchTime < CACHE_DURATION)) {
      return NextResponse.json({
        ...cachedApiResponse,
        stockMap: cachedStockMap || {},
        miscMap: cachedMiscMap || {}
      });
    }

    // 3. Optimized Main Data Fetch (Direct range fetch for speed on Vercel)
    const range = `StoreDataEntry!A1:T3000`; 
    const storeRes = await sheets.spreadsheets.values.get({ 
      spreadsheetId: STORE_SHEET_ID, 
      range,
      majorDimension: "ROWS"
    });
    const storeRows = storeRes.data.values || [];

    const data = storeRows.map((row: any, idx: number) => {
      const actualRowNumber = idx + 1; // Simplifed for fixed range A1:T2000
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
      debug: { rangeUsed: range, rowsReturned: storeRows.length }
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
    const { rkdNumber, issueQty, status, itemName, rate, action, vendorName, approvedQty } = await req.json();
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

    if (action === "APPROVE") {
      // 1. Update Q (Approval Require?) and R (Approved Quantity) in StoreDataEntry
      // Note: Columns Q and R are indices 17 and 18 (1-based)
      await sheets.spreadsheets.values.update({
        spreadsheetId: STORE_SHEET_ID,
        range: `StoreDataEntry!Q${rowNumber}:R${rowNumber}`,
        valueInputOption: "USER_ENTERED",
        requestBody: {
          values: [[status, approvedQty]]
        }
      });

      // 2. Append to approvalDataBase
      await sheets.spreadsheets.values.append({
        spreadsheetId: STORE_SHEET_ID,
        range: "approvalDataBase!A:F",
        valueInputOption: "USER_ENTERED",
        requestBody: {
          values: [[formattedDate, rkdNumber, vendorName, rate, status, approvedQty]]
        }
      });

      // 3. If status is "Yes", send WhatsApp notifications
      console.log(`Manual Approval status detected: ${status}`);
      if (status === "Yes") {
        console.log("Triggering WhatsApp notification process...");
        // Fetch recipients from whatsappApproval tab
        const whatsappRes = await sheets.spreadsheets.values.get({
          spreadsheetId: STORE_SHEET_ID,
          range: "whatsappApproval!A:B",
        });
        const recipients = whatsappRes.data.values || [];
        // Skip header
        const contacts = recipients.slice(1).filter((r: any) => r[1]);

        if (contacts.length > 0) {
          // Detect the base URL from the request headers
          const host = req.headers.get("host") || "rkd-store.vercel.app";
          const protocol = req.headers.get("x-forwarded-proto") || (host.includes("localhost") ? "http" : "https");
          const appUrl = `${protocol}://${host}`;
          
          const rawLink = `${appUrl}/approve/${rkdNumber}`;
          const shortLink = await shortenUrl(rawLink);
          console.log(`Generated Link: ${shortLink}`);

          const message = `🚨 *RKD STORE APPROVAL REQUIRED* 🚨\n\n*RKD No:* ${rkdNumber}\n*Item:* ${itemName}\n*Vendor:* ${vendorName}\n*Qty:* ${approvedQty}\n*Rate:* ${rate}\n\n👉 *Click here to Approve/Reject:* ${shortLink}\n\n_System generated notification_`;

          for (const contact of contacts) {
            let phone = String(contact[1]).replace(/\D/g, "");
            // If it's a 10 digit Indian number, add 91
            if (phone.length === 10) phone = "91" + phone;
            // If it starts with 0, remove it and add 91
            else if (phone.startsWith("0") && phone.length === 11) phone = "91" + phone.slice(1);
            
            console.log(`Attempting to send WhatsApp to: ${contact[0]} at ${phone}`);
            const waRes = await sendWhatsApp(phone, message);
            console.log("Maytapi Final Result:", JSON.stringify(waRes));
          }

          // Log to WhatsappData in the new spreadsheet
          // Headers: Timestamp, RKD Store Number, Vendor Name, Item Name, Require Qty, Approved Qty, Rate, Approval Status
          // Fetch Require Qty from current row
          const rowRes = await sheets.spreadsheets.values.get({
            spreadsheetId: STORE_SHEET_ID,
            range: `StoreDataEntry!F${rowNumber}`, // Column F: Require Qty
          });
          const requireQty = rowRes.data.values?.[0]?.[0] || "0";

          await sheets.spreadsheets.values.append({
            spreadsheetId: WHATSAPP_LOG_SHEET_ID,
            range: "WhatsappData!A:I",
            valueInputOption: "USER_ENTERED",
            requestBody: {
              values: [[formattedDate, rkdNumber, vendorName, itemName, requireQty, approvedQty, rate, "Pending Owner Approval", shortLink]]
            }
          });
        }
      }
    } else if (action === "WHATSAPP_UPDATE") {
      // Action for the external approval page
      const { ownerStatus } = await req.json(); // ownerStatus: "Yes" or "No"
      
      // Update Q (Approval Require?) in StoreDataEntry
      await sheets.spreadsheets.values.update({
        spreadsheetId: STORE_SHEET_ID,
        range: `StoreDataEntry!Q${rowNumber}`,
        valueInputOption: "USER_ENTERED",
        requestBody: { values: [[ownerStatus]] }
      });

      // Update WhatsappData log
      // Find row by RKD in WhatsappData
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
          requestBody: { values: [[ownerStatus]] }
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
