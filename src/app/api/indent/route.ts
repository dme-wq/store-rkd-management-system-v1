import { google } from "googleapis";
import { NextResponse } from "next/server";

export const dynamic = 'force-dynamic';
export const revalidate = 0;
export const maxDuration = 30; // Vercel Pro: extend to 30s

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
const MISC_SHEET_ID = process.env.MISC_SHEET_ID!;
const IMS_SHEET_ID = "1qb6LF7uWTss8PjpN2MJ3iCRynEolm-Ryvjwe-GxiA_M"; 

export async function GET(req: Request) {
  const url = new URL(req.url);
  const action = url.searchParams.get("action");

  // ── action=meta: Fetch units and vendors for Master Add forms ──────────
  if (action === "meta") {
    try {
      const sheets = getSheetsClient();
      const res = await sheets.spreadsheets.values.batchGet({
        spreadsheetId: MISC_SHEET_ID,
        ranges: ["Data!D2:D", "Vendor List!B2:B"],
      });
      const ranges = res.data.valueRanges || [];
      const units = Array.from(new Set((ranges[0]?.values || []).map((r: any) => (r[0] || "").trim()).filter(Boolean)));
      const vendors = Array.from(new Set((ranges[1]?.values || []).map((r: any) => (r[0] || "").trim()).filter(Boolean)));
      return NextResponse.json({ success: true, units, vendors });
    } catch (e: any) {
      return NextResponse.json({ success: false, error: e.message });
    }
  }

  // ── action=list: Fast last-3-months data for Master View ──────────────────
  if (action === "list") {
    try {
      const sheets = getSheetsClient();

      // Step 1: Get total row count cheaply
      const countRes = await sheets.spreadsheets.values.get({
        spreadsheetId: STORE_SHEET_ID,
        range: "StoreDataEntry!A:A",
      });
      const totalRows = (countRes.data.values || []).length;

      // Step 2: Fetch only last 500 rows (≈3 months)
      const FETCH_LIMIT = 500;
      const startRow = Math.max(2, totalRows - FETCH_LIMIT + 1);
      const endRow = totalRows;

      let rows: any[] = [];
      if (endRow >= startRow) {
        const res = await sheets.spreadsheets.values.get({
          spreadsheetId: STORE_SHEET_ID,
          range: `StoreDataEntry!A${startRow}:R${endRow}`,
        });
        rows = res.data.values || [];
      }

      const HDRS = [
        "#", "Store RKD Number", "Timestamp", "Person Filling Name",
        "Item Name", "Require Qty", "Units", "Issue Qty",
        "Status", "Department", "Machine Name", "Machine ID",
        "Breakdown/Civil Complain Number", "Vendor Name", "Price", "Stock in Store",
        "Approval Require?", "Approved Quantity"
      ];

      const data = rows
        .map((row: any, idx: number) => {
          const obj: any = { _id: idx, rowNumber: startRow + idx };
          HDRS.forEach((h, i) => { obj[h] = row[i] || ""; });
          return obj;
        })
        .filter((r: any) => r["Store RKD Number"] && String(r["Store RKD Number"]).startsWith("RKD"))
        .reverse(); // newest first

      return new NextResponse(JSON.stringify({ success: true, data }), {
        headers: { "Content-Type": "application/json", "Cache-Control": "no-store" }
      });
    } catch (e: any) {
      return NextResponse.json({ success: false, error: e.message }, { status: 500 });
    }
  }
  // ─────────────────────────────────────────────────────────────────────────

  try {
    const sheets = getSheetsClient();
    
    // Fetch MISC (critical - form needs this) and IMS + Store in parallel
    // IMS has a 6-second timeout so it never blocks the form from loading
    const imsController = new AbortController();
    const imsTimer = setTimeout(() => imsController.abort(), 6000);
    
    const [miscBatch, imsBatch, storeFreqRes] = await Promise.all([
      sheets.spreadsheets.values.batchGet({
        spreadsheetId: MISC_SHEET_ID,
        ranges: [
          "Person List!A2:A", 
          "Department!A2:A", 
          "Machine Name!A2:A", 
          "Machine ID!A2:A", 
          "Data!B2:F"  // B=Item, C=Units, D=?, E=Rate, F=Vendor
        ],
      }),
      sheets.spreadsheets.values.batchGet({
        spreadsheetId: IMS_SHEET_ID,
        ranges: ["IMS!B2:B7500", "IMS!K2:K7500"],
      }).catch((e: any) => {
        console.warn("IMS Fetch failed/timed out:", e.message);
        return { data: { valueRanges: [] } };
      }),
      sheets.spreadsheets.values.get({
        spreadsheetId: STORE_SHEET_ID,
        range: "StoreDataEntry!A:L",
      }).catch(() => ({ data: { values: [] } }))
    ]);
    clearTimeout(imsTimer);

    // ── Frequency Counter ──
    // Columns: A(0)=Serial, D(3)=Person, E(4)=Item, J(9)=Dept, K(10)=MachineName, L(11)=MachineID
    const freq: Record<string, Record<string, number>> = {
      person: {}, item: {}, dept: {}, machineName: {}, machineId: {}
    };

    const storeRows = (storeFreqRes as any).data?.values || [];
    
    // Find Next RKD Number — now row number IS the serial (row 2 = serial 1, etc.)
    // So next serial = current total data rows + 1
    const istOffset = 5.5 * 60 * 60 * 1000;
    const istDate = new Date(Date.now() + istOffset);
    const yearPrefix = istDate.getUTCFullYear();

    const totalDataRows = storeRows.length; // includes header row 1
    const nextSerial = totalDataRows; // next row will be totalDataRows + 1, serial = (totalDataRows + 1) - 1 = totalDataRows
    const nextRkdNumber = `RKD_S_${yearPrefix}_${nextSerial}`;

    // Take last 2000 rows for recency-weighted analysis
    const recentRows = storeRows.slice(-2000);
    recentRows.forEach((row: any) => {
      const person = (row[3] || "").trim();
      const item   = (row[4] || "").trim();
      const dept   = (row[9] || "").trim();
      const mName  = (row[10] || "").trim();
      const mId    = (row[11] || "").trim();
      if (person) freq.person[person] = (freq.person[person] || 0) + 1;
      if (item)   freq.item[item]     = (freq.item[item] || 0) + 1;
      if (dept)   freq.dept[dept]     = (freq.dept[dept] || 0) + 1;
      if (mName)  freq.machineName[mName] = (freq.machineName[mName] || 0) + 1;
      if (mId)    freq.machineId[mId]     = (freq.machineId[mId] || 0) + 1;
    });

    // Helper: sort by frequency descending, keep remaining items alphabetically
    const sortByFreq = (arr: string[], freqMap: Record<string, number>) => {
      return [...arr].sort((a, b) => {
        const fa = freqMap[a] || 0;
        const fb = freqMap[b] || 0;
        if (fb !== fa) return fb - fa;
        return a.localeCompare(b);
      });
    };

    const ranges = miscBatch.data.valueRanges || [];
    
    const personsRaw = (ranges[0]?.values || []).map((row: any) => row[0]).filter(Boolean);
    const departmentsRaw = (ranges[1]?.values || []).map((row: any) => row[0]).filter(Boolean);
    const machineNamesRaw = (ranges[2]?.values || []).map((row: any) => row[0]).filter(Boolean);
    const machineIDsRaw = (ranges[3]?.values || []).map((row: any) => row[0]).filter(Boolean);
    
    const dataRows = ranges[4]?.values || [];
    const itemMap: Record<string, any> = {};
    dataRows.forEach((row: any) => {
      const item = (row[0] || "").trim();
      if (item) {
        itemMap[item] = {
          units: row[2] || "",
          rate: row[3] || "",
          vendor: row[4] || "",
          stock: "0"
        };
      }
    });

    // IMS stock lookup (row 2 onwards — no header offset)
    const imsNames = imsBatch.data.valueRanges?.[0]?.values || [];
    const imsStocks = imsBatch.data.valueRanges?.[1]?.values || [];
    imsNames.forEach((row: any, i: number) => {
      const item = (row[0] || "").trim();
      if (item && itemMap[item]) {
        itemMap[item].stock = imsStocks[i]?.[0] || "0";
      }
    });

    // Sort all options by frequency
    const persons = sortByFreq(personsRaw, freq.person);
    const departments = sortByFreq(departmentsRaw, freq.dept);
    const machineNames = sortByFreq(machineNamesRaw, freq.machineName);
    const machineIDs = sortByFreq(machineIDsRaw, freq.machineId);
    const itemsRaw = Object.keys(itemMap);
    const items = sortByFreq(itemsRaw, freq.item);

    return NextResponse.json({
      success: true,
      options: { 
        persons, 
        departments, 
        machineNames, 
        machineIDs, 
        items,
        itemMap,
        freq,  // Pass frequency data to frontend for badge display
        nextRkdNumber
      }
    });
  } catch (e: any) {
    return NextResponse.json({ success: false, error: e.message });
  }
}


export async function POST(req: Request) {
  try {
    const body = await req.json();
    const sheets = getSheetsClient();
    
    // ── action=master-add: Handle Master Sidebar additions ──────────────────
    if (body.action === "master-add") {
      const { type, payload } = body;
      let range = "";
      if (type === "item") range = "Data!A:K";
      else if (type === "vendor") range = "Vendor List!A:H";
      else if (type === "department") range = "Department!A:A";
      else if (type === "machineName") range = "Machine Name!A:A";
      else if (type === "machineId") range = "Machine ID!A:A";
      else if (type === "person") range = "Person List!A:A";
      else return NextResponse.json({ success: false, error: "Invalid type" });

      if (type === "vendor") {
        const vendorRes = await sheets.spreadsheets.values.get({
          spreadsheetId: MISC_SHEET_ID,
          range: "Vendor List!A:A"
        });
        const existingRows = vendorRes.data.values || [];
        let nextSno = 1;
        if (existingRows.length > 1) {
          const lastSno = parseInt(existingRows[existingRows.length - 1][0], 10);
          if (!isNaN(lastSno)) nextSno = lastSno + 1;
        }
        payload.forEach((row: any[], i: number) => {
          row[0] = nextSno + i;
        });
      }

      await sheets.spreadsheets.values.append({
        spreadsheetId: MISC_SHEET_ID,
        range: range,
        valueInputOption: "USER_ENTERED",
        insertDataOption: "INSERT_ROWS",
        requestBody: { values: payload }
      });
      return NextResponse.json({ success: true });
    }

    // Generate IST Timestamp & Year Prefix
    const now = new Date();
    const istOffset = 5.5 * 60 * 60 * 1000;
    const istDate = new Date(now.getTime() + istOffset);
    const yearPrefix = istDate.getUTCFullYear();

    // First, get the last serial number from StoreDataEntry by checking Column B
    const day = String(istDate.getUTCDate()).padStart(2, '0');
    const monthIndex = istDate.getUTCMonth();
    const months = ["जनवरी", "फरवरी", "मार्च", "अप्रैल", "मई", "जून", "जुलाई", "अगस्त", "सितंबर", "अक्टूबर", "नवंबर", "दिसंबर"];
    const month = months[monthIndex];
    const hours = String(istDate.getUTCHours()).padStart(2, '0');
    const mins = String(istDate.getUTCMinutes()).padStart(2, '0');
    const timestamp = `${day}-${month}-${yearPrefix} ${hours}:${mins}`;

    const { 
      personFillingName, 
      itemName, 
      requireQty, 
      units, 
      department, 
      machineName, 
      machineId, 
      vendorName, 
      price, 
      stockInStore 
    } = body;

    // ── RACE-CONDITION-SAFE SERIAL GENERATION ──
    // Step 1: Append a placeholder row — Google Sheets append is ATOMIC
    // The response tells us the EXACT row number written, with no race condition possible
    const appendRes = await sheets.spreadsheets.values.append({
      spreadsheetId: STORE_SHEET_ID,
      range: "StoreDataEntry!A:A",
      valueInputOption: "USER_ENTERED",
      insertDataOption: "INSERT_ROWS",
      requestBody: {
        values: [["PENDING", "PENDING", timestamp, personFillingName, itemName, requireQty, units, "", "Requirement Open", department, machineName, machineId, "", vendorName, price, stockInStore]]
      }
    });

    // Step 2: Extract the actual row number from the append response
    // e.g. "StoreDataEntry!A271:P271" → row 271
    const updatedRange = (appendRes as any).data?.updates?.updatedRange || "";
    const rowMatch = updatedRange.match(/(\d+):/);
    const actualRowNumber = rowMatch ? parseInt(rowMatch[1], 10) : null;

    // Step 3: Derive serial from actual row (row 2 = serial 1, row 3 = serial 2, etc.)
    const newSerial = actualRowNumber ? actualRowNumber - 1 : Date.now(); // fallback to timestamp if row unknown
    const storeRkdNumber = `RKD_S_${yearPrefix}_${newSerial}`;

    // Step 4: Backfill the correct serial and RKD number into the exact row we wrote
    if (actualRowNumber) {
      await sheets.spreadsheets.values.update({
        spreadsheetId: STORE_SHEET_ID,
        range: `StoreDataEntry!A${actualRowNumber}:B${actualRowNumber}`,
        valueInputOption: "USER_ENTERED",
        requestBody: { values: [[newSerial, storeRkdNumber]] }
      });
    }

    const rowData = {
      _id: Date.now(),
      "Store RKD Number": storeRkdNumber,
      "Timestamp": timestamp,
      "Person Filling Name": personFillingName,
      "Item Name": itemName,
      "Require Qty": requireQty,
      "Units": units,
      "Status": "Requirement Open",
      "Department": department,
      "Machine Name": machineName,
      "Machine ID": machineId
    };

    return NextResponse.json({ success: true, rkdNumber: storeRkdNumber, rowData });
  } catch (e: any) {
    return NextResponse.json({ success: false, error: e.message });
  }
}
