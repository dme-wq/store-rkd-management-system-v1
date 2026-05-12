import dns from "node:dns";
dns.setDefaultResultOrder("ipv4first");

import { google } from "googleapis";
import { NextResponse } from "next/server";

export const dynamic = 'force-dynamic';
export const revalidate = 0;
export const maxDuration = 30; // Extend to 30s on Vercel

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
const CACHE_DURATION = 25000; // 25 seconds
let cachedStockMap: any = null;
let cachedMiscMap: any = null;
let lastStaticFetchTime = 0;
const STATIC_CACHE_DURATION = 300000; // 5 minutes
let imsRefreshing = false; // prevent concurrent IMS refreshes

// Fetch IMS + Misc in background with timeout
async function refreshStaticCaches(sheets: any) {
  if (imsRefreshing) return;
  imsRefreshing = true;
  // console.log("[Cache] Refreshing IMS + Misc...");

  // 8-second timeout for the entire static refresh
  const controller = new AbortController();
  const timer = setTimeout(() => {
    controller.abort();
    console.warn("[Cache] IMS refresh timed out after 8s");
  }, 8000);

  try {
    // IMS: B2:B7500 and K2:K7500 — start from row 2 to SKIP the header row
    // Row 1 = "Item Name" | ... | "Remaining Stock" — skipping prevents the 1-row offset bug
    const [imsBatchRes, miscRes] = await Promise.all([
      sheets.spreadsheets.values.batchGet({
        spreadsheetId: IMS_SHEET_ID,
        ranges: ["IMS!B2:B7500", "IMS!K2:K7500"], // row 2 onwards — skip header!
      }),
      sheets.spreadsheets.values.get({ 
        spreadsheetId: MISC_SHEET_ID, 
        range: "Data!B2:F5000" // skip header
      })
    ]);

    // Process Stock — B and K are now perfectly aligned (both start at row 2)
    const stockMap: Record<string, string> = {};
    const namesRaw = imsBatchRes.data.valueRanges?.[0].values || [];
    const stocksRaw = imsBatchRes.data.valueRanges?.[1].values || [];
    namesRaw.forEach((row: any, i: number) => {
      const name = (row[0] || "").toString().trim().toLowerCase();
      if (!name) return; // skip blank item name rows
      const rawVal = (stocksRaw[i]?.[0] ?? "").toString().trim();
      stockMap[name] = rawVal || "0";
    });
    cachedStockMap = stockMap;
    console.log(`[Cache] stockMap built: ${Object.keys(stockMap).length} items`);

    // Process Misc
    const miscMap: Record<string, { vendor: string, rate: string }> = {};
    const miscRows = miscRes.data.values || [];
    miscRows.forEach((row: any) => {
      const name = (row[0] || "").trim().toLowerCase();
      if (name) miscMap[name] = { vendor: row[4] || "", rate: row[3] || "" };
    });
    cachedMiscMap = miscMap;
    lastStaticFetchTime = Date.now();
    console.log(`[Cache] miscMap built: ${Object.keys(miscMap).length} items`);

  } catch (e: any) {
    if (e.name === "AbortError") {
      console.error("[Cache] IMS refresh aborted (timeout)");
    } else {
      console.error("[Cache] IMS refresh error:", e.message);
    }
    // Keep old cache on error — don't wipe it
    if (!cachedStockMap) cachedStockMap = {};
    if (!cachedMiscMap) cachedMiscMap = {};
  } finally {
    clearTimeout(timer);
    imsRefreshing = false;
  }
}

export async function GET() {
  if (!STORE_SHEET_ID) {
    return NextResponse.json({ error: "Missing GOOGLE_SHEET_ID" }, { status: 500 });
  }

  const now = Date.now();
  const sheets = getSheetsClient();

  // If we have fresh main data cache, return immediately with latest stockMap
  if (cachedApiResponse && (now - lastFetchTime < CACHE_DURATION)) {
    return NextResponse.json({
      ...cachedApiResponse,
      stockMap: cachedStockMap || {},
      miscMap: cachedMiscMap || {}
    });
  }

  // Define static refresh promise — fire and forget, don't await
  if (!cachedStockMap || !cachedMiscMap || (now - lastStaticFetchTime > STATIC_CACHE_DURATION)) {
    refreshStaticCaches(sheets).catch(() => {}); // background, no await
  }

  // If we have STALE main data but no cache at all yet — fetch it
  try {
    // ── Main Data Fetch (only if cache is expired) ──
    let totalRows = 0;
    try {
      const idRes = await sheets.spreadsheets.values.get({
        spreadsheetId: STORE_SHEET_ID,
        range: "StoreDataEntry!A:A",
      });
      totalRows = idRes.data.values?.length || 0;
    } catch (e: any) {
      // If we have stale cache, return it rather than failing completely
      if (cachedApiResponse) {
        console.warn("[API] Using stale cache due to fetch error:", e.message);
        return NextResponse.json({
          ...cachedApiResponse,
          stockMap: cachedStockMap || {},
          miscMap: cachedMiscMap || {},
          stale: true
        });
      }
      return NextResponse.json({ 
        success: false, 
        error: `Cannot access StoreDataEntry: ${e.message}` 
      }, { status: 500 });
    }

    // Fetch only last 1500 rows for speed (was 3000 — unnecessarily large)
    const startRow = Math.max(1, totalRows - 1499);
    let storeRows: any[] = [];
    try {
      const storeRes = await sheets.spreadsheets.values.get({
        spreadsheetId: STORE_SHEET_ID,
        range: `StoreDataEntry!A${startRow}:T${totalRows}`,
      });
      storeRows = storeRes.data.values || [];
    } catch (e: any) {
      if (cachedApiResponse) {
        return NextResponse.json({
          ...cachedApiResponse,
          stockMap: cachedStockMap || {},
          miscMap: cachedMiscMap || {},
          stale: true
        });
      }
      return NextResponse.json({ 
        success: false, 
        error: `Failed to fetch store data: ${e.message}` 
      }, { status: 500 });
    }

    const data = storeRows.map((row: any, idx: number) => {
      const actualRowNumber = startRow + idx;
      const obj: any = { _id: idx, rowNumber: actualRowNumber };
      HEADERS.forEach((h: string, i: number) => { obj[h] = row[i] || ""; });
      return obj;
    }).filter((r: any) => r["Store RKD Number"] && r["Store RKD Number"] !== "#");

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
    // Always return a valid response even on error
    if (cachedApiResponse) {
      return NextResponse.json({ ...cachedApiResponse, stale: true });
    }
    return NextResponse.json({ success: true, data: [], stockMap: {}, miscMap: {} });
  }
}

function toTitleCase(str: string) {
  if (!str) return "";
  return str.toLowerCase().split(' ').map(word => word.charAt(0).toUpperCase() + word.slice(1)).join(' ');
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
    
    // Date formatting — always use IST (Vercel serverless runs in UTC)
    const now = new Date();
    // Also build individual parts for the formatted date used in sheets
    const istParts = new Intl.DateTimeFormat('en-IN', {
      timeZone: 'Asia/Kolkata',
      day: 'numeric', month: 'long', year: 'numeric',
      hour: 'numeric', minute: '2-digit', hour12: true
    }).formatToParts(now);
    const partMap: Record<string,string> = {};
    istParts.forEach(p => { partMap[p.type] = p.value; });
    const day = partMap['day'];
    const month = partMap['month'];
    const year = partMap['year'];
    const hours12 = partMap['hour'];
    const minutes = partMap['minute'];
    const ampm = partMap['dayPeriod']?.toUpperCase() || '';
    const formattedDate = `${day} ${month} ${year} ${hours12}:${minutes} ${ampm}`;

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
      console.log(`Clerk Requesting Approval for RKD: ${rkdNumber}. Qty: ${approvedQty}, Rate: ${finalRate}`);

      if (status === "Yes") {
        // Save "Pending" and the requested approvedQty to StoreDataEntry
        await sheets.spreadsheets.values.update({
          spreadsheetId: STORE_SHEET_ID,
          range: `StoreDataEntry!Q${rowNumber}:R${rowNumber}`,
          valueInputOption: "USER_ENTERED",
          requestBody: { values: [["Pending", approvedQty || ""]] }
        });

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
          
          const longLink = `${appUrl}/approve/${rkdNumber}?qty=${approvedQty}&rate=${encodeURIComponent(finalRate)}&vendor=${encodeURIComponent(finalVendorName)}`;
          
          // Shorten URL using is.gd (free, no API key, links never expire)
          let approvalLink = longLink;
          try {
            const isgdRes = await fetch(`https://is.gd/create.php?format=json&url=${encodeURIComponent(longLink)}`);
            const isgdData = await isgdRes.json();
            if (isgdData.shorturl) approvalLink = isgdData.shorturl;
          } catch (e) {
            console.warn("is.gd shortening failed, using full link:", e);
          }

          const totalPrice = (parseFloat(approvedQty) * parseFloat(finalRate || "0")).toFixed(2);

          for (const contact of contacts) {
            const contactName = contact[0] || "Sir/Ma'am";
            let phone = String(contact[1]).replace(/\D/g, "");
            if (phone.length === 10) phone = "91" + phone;
            else if (phone.startsWith("0") && phone.length === 11) phone = "91" + phone.slice(1);

            const personalizedMessage =
`👋 *Namaste ${toTitleCase(contactName)} Sir!*

🏪 *Store Miscellaneous Approval*

📋 *Approval Required*

🔖 RKD No: *${rkdNumber}*
📦 Item: *${toTitleCase(finalItemName)}*
🏪 Vendor: *${toTitleCase(finalVendorName)}*
🔢 Qty: *${approvedQty}*
💰 Rate: *₹ ${finalRate}*
🧾 Total: *₹ ${totalPrice}*

👆 Tap To Approve / Reject:
${approvalLink}

⏰ ${formattedDate}
🤖 _Store Miscellaneous System_`;

            await sendWhatsApp(phone, personalizedMessage);
          }

          // Log to WhatsappData with "Pending" status
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
              values: [[formattedDate, rkdNumber, finalVendorName, finalItemName, requireQty, approvedQty, finalRate, "Pending Owner Approval", approvalLink]]
            }
          });
        }

      } else if (status === "No") {
        // Immediate update for "No Approval Required"
        await sheets.spreadsheets.values.update({
          spreadsheetId: STORE_SHEET_ID,
          range: `StoreDataEntry!Q${rowNumber}:R${rowNumber}`,
          valueInputOption: "USER_ENTERED",
          requestBody: { 
            values: [["No", approvedQty || ""]] 
          }
        });
        return NextResponse.json({ success: true, message: "Approval Status set to No" });
      }
      return NextResponse.json({ success: true, message: "Action Completed" });
    } else if (action === "INSTANT_APPROVE") {
      // Instant Approval: Update Q (Approval Require?) to No and R (Approved Qty) to Require Qty
      // Fetch Require Qty first to be safe
      const rowRes = await sheets.spreadsheets.values.get({
        spreadsheetId: STORE_SHEET_ID,
        range: `StoreDataEntry!F${rowNumber}`,
      });
      const requireQty = rowRes.data.values?.[0]?.[0] || "0";

      await sheets.spreadsheets.values.update({
        spreadsheetId: STORE_SHEET_ID,
        range: `StoreDataEntry!Q${rowNumber}:R${rowNumber}`,
        valueInputOption: "USER_ENTERED",
        requestBody: { 
          values: [["No", requireQty]] 
        }
      });
      return NextResponse.json({ success: true, message: "Instant Approval Completed" });
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

      // 3. Save to approvalDataBase if Approved
      if (ownerStatus === "Yes") {
        const fullRowRes = await sheets.spreadsheets.values.get({
          spreadsheetId: STORE_SHEET_ID,
          range: `StoreDataEntry!A${rowNumber}:T${rowNumber}`,
        });
        const rowData = fullRowRes.data.values?.[0] || [];
        
        // Format timestamp to match existing approvalDataBase format: M/D/YYYY HH:MM:SS
        const d = new Date(new Date().getTime() + (5.5 * 60 * 60 * 1000));
        const cleanTimestamp = `${d.getUTCMonth()+1}/${d.getUTCDate()}/${d.getUTCFullYear()} ${d.getUTCHours().toString().padStart(2,'0')}:${d.getUTCMinutes().toString().padStart(2,'0')}:${d.getUTCSeconds().toString().padStart(2,'0')}`;
        
        // Match approvalDataBase columns: Timestamp, Store RKD Number, Vendor Name, Rate, Approval Require?, Approved Qty
        const timestampVal = cleanTimestamp;
        const vendorVal = rowData[13] || finalVendor || "";
        const rateVal = rowData[14] || finalOwnRate || "";
        
        await sheets.spreadsheets.values.append({
          spreadsheetId: STORE_SHEET_ID,
          range: "approvalDataBase!A:F",
          valueInputOption: "USER_ENTERED",
          requestBody: {
            values: [[timestampVal, rkdNumber, vendorVal, rateVal, ownerStatus, finalQty || approvedQty || ""]]
          }
        });
      }

      // 4. Notify Doer via WhatsApp (DoerWhatsapp tab)
      try {
        const doerRes = await sheets.spreadsheets.values.get({
          spreadsheetId: WHATSAPP_LOG_SHEET_ID,
          range: "DoerWhatsapp!A:B",
        });
        const doerRows = doerRes.data.values || [];
        const doerContacts = doerRows.slice(1).filter((r: any) => r[1]); // Skip header, need phone

        if (doerContacts.length > 0) {
          const isApproved = ownerStatus === "Yes";
          const statusEmoji = isApproved ? "✅" : "❌";
          const statusText  = isApproved ? "APPROVED" : "REJECTED";
          const statusColor = isApproved ? "🟢" : "🔴";

          for (const doer of doerContacts) {
            const doerName = doer[0] || "Team";
            let doerPhone = String(doer[1]).replace(/\D/g, "");
            if (doerPhone.length === 10) doerPhone = "91" + doerPhone;
            else if (doerPhone.startsWith("0") && doerPhone.length === 11) doerPhone = "91" + doerPhone.slice(1);

            const doerMessage =
`👋 *Namaste ${toTitleCase(doerName)} Sir!*

🏪 *Store Miscellaneous Approval*

${statusColor} *Request ${toTitleCase(statusText)}* ${statusEmoji}

🔖 RKD No: *${rkdNumber}*
📦 Item: *${toTitleCase(finalItemName)}*
🔢 Qty: *${finalQty || approvedQty}*
💰 Rate: *₹ ${finalRate}*

${isApproved
  ? "✅ Your Material Request Has Been *Approved* By The Management. It Will Be Processed Shortly."
  : "❌ Your Material Request Has Been *Rejected* By The Management. Please Contact The Store."}

⏰ ${formattedDate}
🤖 _Store Miscellaneous System_`;

            await sendWhatsApp(doerPhone, doerMessage);
          }
        }
      } catch (doerErr: any) {
        // Non-blocking — log but don't fail the whole request
        console.error("Doer WhatsApp notification failed:", doerErr.message);
      }
    } else if (action === "UPDATE_COLUMN") {
      // Debit Note (S) or Reverse Entry (T) update
      const { column, value } = body;
      if (!["S", "T"].includes(column)) throw new Error("Invalid column. Must be S or T.");
      
      console.log(`Updating column ${column} for RKD ${rkdNumber} with value: ${value}`);
      await sheets.spreadsheets.values.update({
        spreadsheetId: STORE_SHEET_ID,
        range: `StoreDataEntry!${column}${rowNumber}`,
        valueInputOption: "USER_ENTERED",
        requestBody: { values: [[value]] }
      });
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
