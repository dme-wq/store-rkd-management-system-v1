import dns from "node:dns";
dns.setDefaultResultOrder("ipv4first");

import { google } from "googleapis";
import { NextResponse } from "next/server";

export const dynamic = 'force-dynamic';
export const revalidate = 0;
export const maxDuration = 60; // 60s on Vercel Pro — gives headroom for multi-step flows

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
const PO_RESPONSES_SHEET_ID = process.env.PO_RESPONSES_SHEET_ID!;
const INWARD_SHEET_ID = "1mOM0OdePjpGzFet9LKn3_yvAcJBxIMY_4dHb8t0AzOc";

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
  if (!dateStr || typeof dateStr !== 'string') return new Date(0);

  // Try native parsing first
  let d = new Date(dateStr);
  if (!isNaN(d.getTime())) return d;

  // Split by anything that isn't a word character or a Hindi character
  const parts = dateStr.split(/[^\w\u0900-\u097F]+/).filter(Boolean);
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
const CACHE_DURATION = 3000; // 3 seconds (near real-time)
let cachedStockMap: any = null;
let cachedMiscMap: any = null;
let lastStaticFetchTime = 0;
const STATIC_CACHE_DURATION = 300000; // 5 minutes
let imsRefreshing = false;
let lastKnownRowCount = 0; // Persists across warm Lambda instances for faster speculation
let cachedPoMap: Record<string, { poNumber: string; poDate: string; vendorName: string }> = {};
let cachedInwardMap: Record<string, { inwardQty: string; inwardDate: string }> = {};

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
    const [imsBatchRes, miscRes, poRes, inwardRes] = await Promise.all([
      sheets.spreadsheets.values.batchGet({
        spreadsheetId: IMS_SHEET_ID,
        ranges: ["IMS!B2:B7500", "IMS!K2:K7500"],
      }),
      sheets.spreadsheets.values.get({ 
        spreadsheetId: MISC_SHEET_ID, 
        range: "Data!B2:F5000"
      }),
      // PO: RESPONSES!E=PONo, F=PODate, C=VendorName, T=RKDNumber
      PO_RESPONSES_SHEET_ID ? sheets.spreadsheets.values.get({
        spreadsheetId: PO_RESPONSES_SHEET_ID,
        range: "RESPONSES!C:T",
      }).catch(() => ({ data: { values: [] } })) : Promise.resolve({ data: { values: [] } }),
      // Inward: F=IndentRequestNumber (RKD), J=InwardQty, L=TimestampOfInward
      sheets.spreadsheets.values.get({
        spreadsheetId: INWARD_SHEET_ID,
        range: "Gate & Inward_Entry!F2:L",
      }).catch(() => ({ data: { values: [] } })),
    ]);

    // Process Stock
    const stockMap: Record<string, string> = {};
    const namesRaw = imsBatchRes.data.valueRanges?.[0].values || [];
    const stocksRaw = imsBatchRes.data.valueRanges?.[1].values || [];
    namesRaw.forEach((row: any, i: number) => {
      const name = (row[0] || "").toString().trim().toLowerCase();
      if (!name) return;
      const rawVal = (stocksRaw[i]?.[0] ?? "").toString().trim();
      stockMap[name] = rawVal || "0";
    });
    cachedStockMap = stockMap;

    // Process Misc
    const miscMap: Record<string, { vendor: string, rate: string }> = {};
    const miscRows = miscRes.data.values || [];
    miscRows.forEach((row: any) => {
      const name = (row[0] || "").trim().toLowerCase();
      if (name) miscMap[name] = { vendor: row[4] || "", rate: row[3] || "" };
    });
    cachedMiscMap = miscMap;

    // Process PO map: RESPONSES!C=VendorName, E=PONo(col3), F=PODate(col4), T=RKDNumber(col17 from C)
    // Range C:T means col0=C(VendorName), col2=E(PONo), col3=F(PODate), col17=T(RKDNo)
    const newPoMap: Record<string, { poNumber: string; poDate: string; vendorName: string }> = {};
    const poRows = (poRes as any).data?.values || [];
    poRows.slice(1).forEach((row: any) => {
      const rkdNo   = (row[17] || "").trim(); // T column = index 17 from C
      const poNum   = (row[2]  || "").trim(); // E column = index 2 from C
      const poDate  = (row[3]  || "").trim(); // F column = index 3 from C
      const vendor  = (row[0]  || "").trim(); // C column = index 0
      if (rkdNo && poNum && !newPoMap[rkdNo]) {
        newPoMap[rkdNo] = { poNumber: poNum, poDate, vendorName: vendor };
      }
    });
    cachedPoMap = newPoMap;

    // Process Inward map: F=IndentRequestNumber(rkd), J=InwardQty(col4 from F), L=InwardTimestamp(col6 from F)
    const newInwardMap: Record<string, { inwardQty: string; inwardDate: string }> = {};
    const inwardRows = (inwardRes as any).data?.values || [];
    inwardRows.forEach((row: any) => {
      const rkdNo    = (row[0] || "").trim(); // F col = idx 0
      const inwardQty = (row[4] || "").trim(); // J col = idx 4
      const inwardDate = (row[6] || "").trim(); // L col = idx 6
      if (rkdNo && inwardQty && !newInwardMap[rkdNo]) {
        newInwardMap[rkdNo] = { inwardQty, inwardDate };
      }
    });
    cachedInwardMap = newInwardMap;

    lastStaticFetchTime = Date.now();
    console.log(`[Cache] stockMap:${Object.keys(stockMap).length}, PO:${Object.keys(newPoMap).length}, Inward:${Object.keys(newInwardMap).length}`);

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

export async function GET(req: Request) {
  if (!STORE_SHEET_ID) {
    return NextResponse.json({ error: "Missing GOOGLE_SHEET_ID" }, { status: 500 });
  }

  const url = new URL(req.url);
  const isFullMode = url.searchParams.get("mode") === "full";
  // Initial load fetches only last 350 rows (fast, ~14 days). Full mode fetches 3000.
  const FETCH_LIMIT = isFullMode ? 3000 : 350;

  const now = Date.now();
  const sheets = getSheetsClient();

  // ── 1. Serve hot cache immediately (< 3s old) — only for same mode ────────
  if (cachedApiResponse && !isFullMode && (now - lastFetchTime < CACHE_DURATION)) {
    return NextResponse.json({
      ...cachedApiResponse,
      stockMap: cachedStockMap || {},
      miscMap: cachedMiscMap || {},
      poMap: cachedPoMap || {},
      inwardMap: cachedInwardMap || {},
    });
  }

  // ── 2. Kick off background IMS/Misc/PO/Inward refresh ─────────────────────
  if (!cachedStockMap || !cachedMiscMap || (now - lastStaticFetchTime > STATIC_CACHE_DURATION)) {
    refreshStaticCaches(sheets).catch(() => {});
  }

  try {
    // ── 3. SINGLE batchGet: count column A + speculative last-N-rows ──────────
    // Initial load: 500 rows (fast, ~30 days). Full mode: 3000 rows.
    const speculativeStart = lastKnownRowCount > FETCH_LIMIT
      ? Math.max(2, lastKnownRowCount - FETCH_LIMIT)
      : 2;
    const speculativeEnd = lastKnownRowCount > 0
      ? lastKnownRowCount + 50 // buffer for new rows added since last fetch
      : 33000; // first cold-start estimate

    const batchRes = await sheets.spreadsheets.values.batchGet({
      spreadsheetId: STORE_SHEET_ID,
      ranges: [
        "StoreDataEntry!A:A",                                           // for actual row count
        `StoreDataEntry!A${speculativeStart}:T${speculativeEnd}`,       // speculative data range
      ],
    });

    const countValues = batchRes.data.valueRanges?.[0]?.values || [];
    const totalRows = countValues.length;
    lastKnownRowCount = totalRows; // update for next warm request

    let storeRows = batchRes.data.valueRanges?.[1]?.values || [];

    // If speculation missed (too few RKD rows returned), do one targeted refetch
    const validCount = storeRows.filter((r: any) => String(r[1] || "").startsWith("RKD")).length;
    if (validCount < 5 && totalRows > 10) {
      const actualStart = Math.max(2, totalRows - FETCH_LIMIT + 1);
      const refetch = await sheets.spreadsheets.values.get({
        spreadsheetId: STORE_SHEET_ID,
        range: `StoreDataEntry!A${actualStart}:T${totalRows}`,
      });
      storeRows = refetch.data.values || [];
    }

    // ── 4. Map rows to objects ────────────────────────────────────────────────
    const startRow = Math.max(2, totalRows > FETCH_LIMIT ? totalRows - FETCH_LIMIT : 2);
    const data = storeRows
      .map((row: any, idx: number) => {
        const obj: any = { _id: idx, rowNumber: startRow + idx };
        HEADERS.forEach((h: string, i: number) => { obj[h] = row[i] || ""; });
        return obj;
      })
      .filter((r: any) => r["Store RKD Number"] && r["Store RKD Number"].startsWith("RKD"));

    const responseData = {
      success: true,
      data: data.reverse(),
      totalRows,
      isFullData: isFullMode,
      stockMap: cachedStockMap || {},
      miscMap: cachedMiscMap || {},
      poMap: cachedPoMap || {},
      inwardMap: cachedInwardMap || {},
      fetchedAt: new Date().toISOString(),
      debug: { startRow, totalRows, rowsFetched: storeRows.length, validRows: validCount, mode: isFullMode ? 'full' : 'initial' }
    };

    // Only cache initial-mode responses (full-mode is on-demand)
    if (!isFullMode) {
      cachedApiResponse = responseData;
      lastFetchTime = now;
    }

    return new NextResponse(JSON.stringify(responseData), {
      headers: { "Content-Type": "application/json", "Cache-Control": "no-store" }
    });

  } catch (error: any) {
    console.error("[API] GET error:", error.message);
    // ALWAYS return stale cache — NEVER return empty to the frontend
    if (cachedApiResponse) {
      console.log("[API] Returning stale cache due to error");
      return NextResponse.json({
        ...cachedApiResponse,
        stockMap: cachedStockMap || {},
        miscMap: cachedMiscMap || {},
        poMap: cachedPoMap || {},
        inwardMap: cachedInwardMap || {},
        stale: true
      });
    }
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
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

    // ── CRITICAL: Bust the GET cache immediately on any write ──────────────
    // Without this, the 3-second server cache would serve stale data to the
    // next polling GET, overwriting the client's optimistic update with old state.
    cachedApiResponse = null;
    // ── EDIT ITEM MASTER DATA ──
    if (action === "EDIT_ITEM_MASTER") {
      const { itemName, updatedFields } = body;
      const sheets = getSheetsClient();
      
      const searchRes = await sheets.spreadsheets.values.get({
        spreadsheetId: MISC_SHEET_ID,
        range: "Data!B:B",
      });
      const namesList = searchRes.data.values || [];
      const rowIndex = namesList.findIndex((row: any) => (row[0] || "").toLowerCase().trim() === itemName.toLowerCase().trim());
      
      if (rowIndex === -1) throw new Error(`Item ${itemName} not found in Master Data.`);
      const rowNumber = rowIndex + 1; // 1-indexed

      // B=1, C=2 (opening stock - skip), D=Unit, E=Price, F=Party, G=MinQty, H=Safety, I=GST, J=Rack
      const { unit, price, vendor, minQty, safetyFactor, gst, rackNo } = updatedFields;
      
      await sheets.spreadsheets.values.update({
        spreadsheetId: MISC_SHEET_ID,
        range: `Data!D${rowNumber}:J${rowNumber}`,
        valueInputOption: "USER_ENTERED",
        requestBody: {
          values: [[unit, price, vendor, minQty, safetyFactor, gst, rackNo]]
        }
      });
      
      if (cachedMiscMap && cachedMiscMap[itemName.toLowerCase()]) {
         cachedMiscMap[itemName.toLowerCase()] = { vendor, rate: price };
      }
      return NextResponse.json({ success: true, message: "Item Master Data Updated" });
    }

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
          // Hard 4-second timeout so a slow is.gd never kills the whole request
          let approvalLink = longLink;
          try {
            const isgdController = new AbortController();
            const isgdTimer = setTimeout(() => isgdController.abort(), 4000);
            const isgdRes = await fetch(`https://is.gd/create.php?format=json&url=${encodeURIComponent(longLink)}`, { signal: isgdController.signal });
            clearTimeout(isgdTimer);
            const isgdData = await isgdRes.json();
            if (isgdData.shorturl) approvalLink = isgdData.shorturl;
          } catch (e) {
            console.warn("is.gd shortening failed, using full link:", e);
          }

          const totalPrice = (parseFloat(approvedQty) * parseFloat(finalRate || "0")).toFixed(2);

          // Send all WhatsApp messages in PARALLEL — don't await them one-by-one
          await Promise.all(contacts.map(async (contact: any) => {
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

            return sendWhatsApp(phone, personalizedMessage);
          }));

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
      // INSTANT_APPROVE: Fetch row data, then run update + approvalDataBase append in PARALLEL
      const fullRowRes = await sheets.spreadsheets.values.get({
        spreadsheetId: STORE_SHEET_ID,
        range: `StoreDataEntry!A${rowNumber}:T${rowNumber}`,
      });
      const rowData = fullRowRes.data.values?.[0] || [];
      const { vendorName, rate } = body;
      const requireQty = rowData[5] || "0"; // F is index 5
      const vendorVal = vendorName !== undefined ? vendorName : (rowData[13] || "");  // N is index 13
      const rateVal = rate !== undefined ? rate : (rowData[14] || "");    // O is index 14

      const d = new Date(new Date().getTime() + (5.5 * 60 * 60 * 1000));
      const cleanTimestamp = `${d.getUTCMonth()+1}/${d.getUTCDate()}/${d.getUTCFullYear()} ${d.getUTCHours().toString().padStart(2,'0')}:${d.getUTCMinutes().toString().padStart(2,'0')}:${d.getUTCSeconds().toString().padStart(2,'0')}`;

      // Run StoreDataEntry update + approvalDataBase append SIMULTANEOUSLY (not sequentially)
      const updatePromises: Promise<any>[] = [
        sheets.spreadsheets.values.update({
          spreadsheetId: STORE_SHEET_ID,
          range: `StoreDataEntry!Q${rowNumber}:R${rowNumber}`,
          valueInputOption: "USER_ENTERED",
          requestBody: { values: [["No", requireQty]] }
        }),
        sheets.spreadsheets.values.append({
          spreadsheetId: STORE_SHEET_ID,
          range: "approvalDataBase!A:F",
          valueInputOption: "USER_ENTERED",
          requestBody: {
            values: [[cleanTimestamp, rkdNumber, vendorVal, rateVal, "No", requireQty]]
          }
        })
      ];

      // If UI sent an explicitly updated vendor/rate, also update N and O
      if (vendorName !== undefined && rate !== undefined) {
        updatePromises.push(
          sheets.spreadsheets.values.update({
            spreadsheetId: STORE_SHEET_ID,
            range: `StoreDataEntry!N${rowNumber}:O${rowNumber}`,
            valueInputOption: "USER_ENTERED",
            requestBody: { values: [[vendorName, rate]] }
          })
        );
      }

      await Promise.all(updatePromises);

      return NextResponse.json({ success: true, message: "Instant Approval Completed" });
    } else if (action === "WHATSAPP_UPDATE") {
      // OWNER SIDE: Owner clicked Approve/Reject.
      // STRATEGY: Do the critical StoreDataEntry update FIRST, return success immediately,
      // then run secondary tasks (log update, approvalDB, doer WhatsApp) in the background.
      const { ownerStatus, approvedQty: finalQty, rate: finalOwnRate, vendor: finalVendor } = body;
      
      console.log(`Owner decision: ${ownerStatus} for RKD: ${rkdNumber}`);

      // CRITICAL: Update StoreDataEntry Q+R first — this is what the frontend shows
      await sheets.spreadsheets.values.update({
        spreadsheetId: STORE_SHEET_ID,
        range: `StoreDataEntry!Q${rowNumber}:R${rowNumber}`,
        valueInputOption: "USER_ENTERED",
        requestBody: { 
          values: [[ownerStatus, finalQty || ""]] 
        }
      });

      // Run all secondary tasks in PARALLEL (non-blocking for the response)
      const d2 = new Date(new Date().getTime() + (5.5 * 60 * 60 * 1000));
      const cleanTimestamp2 = `${d2.getUTCMonth()+1}/${d2.getUTCDate()}/${d2.getUTCFullYear()} ${d2.getUTCHours().toString().padStart(2,'0')}:${d2.getUTCMinutes().toString().padStart(2,'0')}:${d2.getUTCSeconds().toString().padStart(2,'0')}`;

      // Fire secondary tasks without waiting (they don't affect the user response)
      Promise.all([
        // Task A: Update WhatsappData log column H
        sheets.spreadsheets.values.get({
          spreadsheetId: WHATSAPP_LOG_SHEET_ID,
          range: "WhatsappData!B:B",
        }).then((logRes: any) => {
          const logList = logRes.data.values || [];
          const logIdx = logList.findIndex((r: any) => r[0] === rkdNumber);
          if (logIdx !== -1) {
            return sheets.spreadsheets.values.update({
              spreadsheetId: WHATSAPP_LOG_SHEET_ID,
              range: `WhatsappData!H${logIdx + 1}`,
              valueInputOption: "USER_ENTERED",
              requestBody: { values: [[ownerStatus === "Yes" ? "Approved" : "Rejected"]] }
            });
          }
        }).catch((e: any) => console.error("[BG] WhatsappData log update failed:", e.message)),

        // Task B: Save to approvalDataBase + notify doer (only if Approved)
        ownerStatus === "Yes"
          ? sheets.spreadsheets.values.get({
              spreadsheetId: STORE_SHEET_ID,
              range: `StoreDataEntry!A${rowNumber}:T${rowNumber}`,
            }).then(async (fullRowRes: any) => {
              const rowData2 = fullRowRes.data.values?.[0] || [];
              const vendorVal2 = rowData2[13] || finalVendor || "";
              const rateVal2 = rowData2[14] || finalOwnRate || "";
              return sheets.spreadsheets.values.append({
                spreadsheetId: STORE_SHEET_ID,
                range: "approvalDataBase!A:F",
                valueInputOption: "USER_ENTERED",
                requestBody: {
                  values: [[cleanTimestamp2, rkdNumber, vendorVal2, rateVal2, ownerStatus, finalQty || approvedQty || ""]]
                }
              });
            }).catch((e: any) => console.error("[BG] approvalDataBase append failed:", e.message))
          : Promise.resolve(),

        // Task C: Notify Doer via WhatsApp
        sheets.spreadsheets.values.get({
          spreadsheetId: WHATSAPP_LOG_SHEET_ID,
          range: "DoerWhatsapp!A:B",
        }).then(async (doerRes: any) => {
          const doerRows = doerRes.data.values || [];
          const doerContacts = doerRows.slice(1).filter((r: any) => r[1]);
          if (doerContacts.length === 0) return;

          const isApproved = ownerStatus === "Yes";
          const statusEmoji = isApproved ? "✅" : "❌";
          const statusText  = isApproved ? "APPROVED" : "REJECTED";
          const statusColor = isApproved ? "🟢" : "🔴";

          return Promise.all(doerContacts.map((doer: any) => {
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

            return sendWhatsApp(doerPhone, doerMessage);
          }));
        }).catch((e: any) => console.error("[BG] Doer WhatsApp failed:", e.message))
      ]).catch((e: any) => console.error("[BG] Secondary tasks error:", e.message));
    } else if (action === "EDIT_INDENT") {
      const { personFillingName, department, machineName, machineId, itemName, requireQty, units } = body;
      
      const updatePromises: Promise<any>[] = [];
      
      // Update D, E, F (Person, Item, Require Qty)
      updatePromises.push(
        sheets.spreadsheets.values.update({
          spreadsheetId: STORE_SHEET_ID,
          range: `StoreDataEntry!D${rowNumber}:F${rowNumber}`,
          valueInputOption: "USER_ENTERED",
          requestBody: { values: [[personFillingName, itemName, requireQty]] }
        })
      );
      
      // Update J, K, L (Department, Machine Name, Machine ID)
      updatePromises.push(
        sheets.spreadsheets.values.update({
          spreadsheetId: STORE_SHEET_ID,
          range: `StoreDataEntry!J${rowNumber}:L${rowNumber}`,
          valueInputOption: "USER_ENTERED",
          requestBody: { values: [[department, machineName, machineId]] }
        })
      );

      // If units provided, update G (Units)
      if (units) {
        updatePromises.push(
          sheets.spreadsheets.values.update({
            spreadsheetId: STORE_SHEET_ID,
            range: `StoreDataEntry!G${rowNumber}`,
            valueInputOption: "USER_ENTERED",
            requestBody: { values: [[units]] }
          })
        );
      }

      await Promise.all(updatePromises);
      return NextResponse.json({ success: true, message: "Indent updated successfully" });

    } else if (action === "REFRESH_VENDOR_RATE") {
      const rowDataRes = await sheets.spreadsheets.values.get({
        spreadsheetId: STORE_SHEET_ID,
        range: `StoreDataEntry!A${rowNumber}:T${rowNumber}`,
      });
      const rowValues = rowDataRes.data.values?.[0] || [];
      const itemNameStr = (rowValues[4] || "").trim(); // E is index 4

      const miscRes = await sheets.spreadsheets.values.get({
        spreadsheetId: MISC_SHEET_ID,
        range: "Data!B:F",
      });
      const miscRows = miscRes.data.values || [];
      let latestVendor = "";
      let latestRate = "";
      for (const misc of miscRows.slice(1)) {
        if ((misc[0] || "").trim().toLowerCase() === itemNameStr.toLowerCase()) {
          latestVendor = (misc[4] || "").trim(); // Party Name (F is index 4)
          latestRate = (misc[3] || "").trim(); // Price Per Unit (E is index 3)
          break;
        }
      }

      await sheets.spreadsheets.values.update({
        spreadsheetId: STORE_SHEET_ID,
        range: `StoreDataEntry!N${rowNumber}:O${rowNumber}`,
        valueInputOption: "USER_ENTERED",
        requestBody: { values: [[latestVendor, latestRate]] }
      });
      
      if (cachedMiscMap) {
        cachedMiscMap[itemNameStr.toLowerCase()] = { vendor: latestVendor, rate: latestRate };
      }
      return NextResponse.json({ success: true, message: "Vendor Rate Refreshed" });

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
      
      // Fetch full row to get details for IMS Issue tab
      const rowDataRes = await sheets.spreadsheets.values.get({
        spreadsheetId: STORE_SHEET_ID,
        range: `StoreDataEntry!A${rowNumber}:T${rowNumber}`,
      });
      const rowValues = rowDataRes.data.values?.[0] || [];
      const personFilling = rowValues[3] || "";
      const requireQty = rowValues[5] || "";
      const units = rowValues[6] || "";
      const machineName = rowValues[10] || "";
      const machineId = rowValues[11] || "";

      // Run StoreDataEntry update + IssueDataBase append + IMS Issue append in PARALLEL
      await Promise.all([
        sheets.spreadsheets.values.update({
          spreadsheetId: STORE_SHEET_ID,
          range: `StoreDataEntry!H${rowNumber}:I${rowNumber}`,
          valueInputOption: "USER_ENTERED",
          requestBody: {
            values: [[issueQty, status]]
          }
        }),
        sheets.spreadsheets.values.append({
          spreadsheetId: STORE_SHEET_ID,
          range: "IssueDataBase!A:E",
          valueInputOption: "USER_ENTERED",
          requestBody: {
            values: [[formattedDate, rkdNumber, issueQty, rate, itemName]]
          }
        }),
        // Add to IMS sheet's "Issue" tab
        sheets.spreadsheets.values.append({
          spreadsheetId: IMS_SHEET_ID,
          range: "Issue!A:I",
          valueInputOption: "USER_ENTERED",
          requestBody: {
            values: [[formattedDate, rkdNumber, personFilling, itemName, requireQty, units, issueQty, machineName, machineId]]
          }
        })
      ]);
    }

    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error("Update error:", error);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
