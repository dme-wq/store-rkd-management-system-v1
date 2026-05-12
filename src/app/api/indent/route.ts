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
const MISC_SHEET_ID = process.env.MISC_SHEET_ID!;
const IMS_SHEET_ID = "1qb6LF7uWTss8PjpN2MJ3iCRynEolm-Ryvjwe-GxiA_M"; 

export async function GET() {
  try {
    const sheets = getSheetsClient();
    
    // Batch fetch all data in parallel
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
        ranges: ["IMS!B2:B7500", "IMS!K2:K7500"], // Start from row 2 to skip header
      }).catch((e: any) => {
        console.error("IMS Fetch failed", e.message);
        return { data: { valueRanges: [] } };
      }),
      sheets.spreadsheets.values.get({
        spreadsheetId: STORE_SHEET_ID,
        range: "StoreDataEntry!A:L", // A=Serial, D=Person, E=Item, J=Dept, K=Machine Name, L=Machine ID
      }).catch(() => ({ data: { values: [] } }))
    ]);

    // ── Frequency Counter ──
    // Columns: A(0)=Serial, D(3)=Person, E(4)=Item, J(9)=Dept, K(10)=MachineName, L(11)=MachineID
    const freq: Record<string, Record<string, number>> = {
      person: {}, item: {}, dept: {}, machineName: {}, machineId: {}
    };

    const storeRows = (storeFreqRes as any).data?.values || [];
    
    // Find Next RKD Number
    let lastSerial = 0;
    for (let i = storeRows.length - 1; i >= 0; i--) {
      const val = parseInt(storeRows[i][0] || "0", 10);
      if (!isNaN(val) && val > 0) {
        lastSerial = val;
        break;
      }
    }
    const nextSerial = lastSerial + 1;
    const istOffset = 5.5 * 60 * 60 * 1000;
    const istDate = new Date(Date.now() + istOffset);
    const nextRkdNumber = `RKD_S_${istDate.getUTCFullYear()}_${nextSerial}`;

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
    
    // First, get the last serial number from StoreDataEntry
    const idRes = await sheets.spreadsheets.values.get({
      spreadsheetId: STORE_SHEET_ID,
      range: "StoreDataEntry!A:A", 
    });
    
    const rows = idRes.data.values || [];
    
    // Find the last numeric serial number
    let lastSerial = 0; // Start fresh from 1
    for (let i = rows.length - 1; i >= 0; i--) {
      const val = parseInt(rows[i][0] || "0", 10);
      if (!isNaN(val) && val > 0) {
        lastSerial = val;
        break;
      }
    }
    
    const newSerial = lastSerial + 1;
    // Generate IST Timestamp
    const now = new Date();
    const istOffset = 5.5 * 60 * 60 * 1000;
    const istDate = new Date(now.getTime() + istOffset);
    
    const day = String(istDate.getUTCDate()).padStart(2, '0');
    const monthIndex = istDate.getUTCMonth();
    const months = ["जनवरी", "फरवरी", "मार्च", "अप्रैल", "मई", "जून", "जुलाई", "अगस्त", "सितंबर", "अक्टूबर", "नवंबर", "दिसंबर"];
    const month = months[monthIndex];
    const yearPrefix = istDate.getUTCFullYear();
    const hours = String(istDate.getUTCHours()).padStart(2, '0');
    const mins = String(istDate.getUTCMinutes()).padStart(2, '0');
    
    const timestamp = `${day}-${month}-${yearPrefix} ${hours}:${mins}`;
    const storeRkdNumber = `RKD_S_${yearPrefix}_${newSerial}`;
    
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

    const newRow = [
      newSerial,              // A: #
      storeRkdNumber,         // B: Store RKD Number
      timestamp,              // C: Timestamp
      personFillingName,      // D: Person Filling Name
      itemName,               // E: Item Name
      requireQty,             // F: Require Qty
      units,                  // G: Units
      "",                     // H: Issue Qty
      "Requirement Open",     // I: Status
      department,             // J: Department
      machineName,            // K: Machine Name
      machineId,              // L: Machine ID
      "",                     // M: Breakdown Number
      vendorName,             // N: Vendor Name
      price,                  // O: Price
      stockInStore            // P: Stock in Store
    ];

    await sheets.spreadsheets.values.append({
      spreadsheetId: STORE_SHEET_ID,
      range: "StoreDataEntry!A:A",
      valueInputOption: "USER_ENTERED",
      insertDataOption: "INSERT_ROWS",
      requestBody: {
        values: [newRow]
      }
    });

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
