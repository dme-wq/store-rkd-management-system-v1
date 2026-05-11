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
    
    // Batch fetch from MISC_SHEET_ID and IMS
    const [miscBatch, imsBatch] = await Promise.all([
      sheets.spreadsheets.values.batchGet({
        spreadsheetId: MISC_SHEET_ID,
        ranges: [
          "Person List!A2:A", 
          "Department!A2:A", 
          "Machine Name!A2:A", 
          "Machine ID!A2:A", 
          "Data!B2:F" // B=Item, C=Units, D=?, E=Rate, F=Vendor
        ],
      }),
      sheets.spreadsheets.values.batchGet({
        spreadsheetId: IMS_SHEET_ID,
        ranges: ["IMS!B1:B10000", "IMS!K1:K10000"],
      }).catch(e => {
        console.error("IMS Fetch failed", e.message);
        return { data: { valueRanges: [] } };
      })
    ]);

    const ranges = miscBatch.data.valueRanges || [];
    
    const persons = (ranges[0]?.values || []).map((row: any) => row[0]).filter(Boolean);
    const departments = (ranges[1]?.values || []).map((row: any) => row[0]).filter(Boolean);
    const machineNames = (ranges[2]?.values || []).map((row: any) => row[0]).filter(Boolean);
    const machineIDs = (ranges[3]?.values || []).map((row: any) => row[0]).filter(Boolean);
    
    const dataRows = ranges[4]?.values || [];
    const itemMap: Record<string, any> = {};
    dataRows.forEach((row: any) => {
      const item = (row[0] || "").trim();
      if (item) {
        itemMap[item] = {
          units: row[1] || "",    // C=1
          rate: row[3] || "",     // E=3
          vendor: row[4] || "",   // F=4
          stock: "0"
        };
      }
    });

    const imsNames = imsBatch.data.valueRanges?.[0]?.values || [];
    const imsStocks = imsBatch.data.valueRanges?.[1]?.values || [];
    imsNames.forEach((row: any, i: number) => {
      const item = (row[0] || "").trim();
      if (item && itemMap[item]) {
        itemMap[item].stock = imsStocks[i]?.[0] || "0";
      }
    });

    return NextResponse.json({
      success: true,
      options: { 
        persons, 
        departments, 
        machineNames, 
        machineIDs, 
        items: Object.keys(itemMap).sort(), 
        itemMap 
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
    let lastSerial = 32189; // Default before start
    for (let i = rows.length - 1; i >= 0; i--) {
      const val = parseInt(rows[i][0] || "0", 10);
      if (!isNaN(val) && val > 0) {
        lastSerial = val;
        break;
      }
    }
    
    const newSerial = lastSerial + 1;
    const year = new Date().getFullYear();
    const storeRkdNumber = `RKD_S_${year}_${newSerial}`;
    
    // Format timestamp
    const now = new Date();
    const months = ["जनवरी", "फरवरी", "मार्च", "अप्रैल", "मई", "जून", "जुलाई", "अगस्त", "सितंबर", "अक्टूबर", "नवंबर", "दिसंबर"];
    const timestamp = `${String(now.getDate()).padStart(2, '0')}-${months[now.getMonth()]}-${now.getFullYear()} ${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
    
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
      range: "StoreDataEntry!A:P",
      valueInputOption: "USER_ENTERED",
      insertDataOption: "INSERT_ROWS",
      requestBody: {
        values: [newRow]
      }
    });

    return NextResponse.json({ success: true, rkdNumber: storeRkdNumber });
  } catch (e: any) {
    return NextResponse.json({ success: false, error: e.message });
  }
}
