import dns from "node:dns";
dns.setDefaultResultOrder("ipv4first");

import { google } from "googleapis";
import { NextResponse } from "next/server";

export const dynamic = 'force-dynamic';
export const revalidate = 0;

// ---------- Auth ----------
const getClients = () => {
  const email = process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL;
  const rawKey = process.env.GOOGLE_PRIVATE_KEY;
  if (!email || !rawKey) throw new Error("Missing Auth Credentials");
  const private_key = rawKey.replace(/\\n/g, '\n').replace(/"/g, '').trim();
  const auth = new google.auth.GoogleAuth({
    credentials: { client_email: email, private_key },
    scopes: [
      "https://www.googleapis.com/auth/spreadsheets",
      "https://www.googleapis.com/auth/drive",
    ],
  });
  const sheets = google.sheets({ version: "v4", auth });
  const drive  = google.drive({ version: "v3", auth });
  return { sheets, drive };
};

const STORE_SHEET_ID       = process.env.GOOGLE_SHEET_ID!;
const MISC_SHEET_ID        = process.env.MISC_SHEET_ID!;
const PO_RESPONSES_SHEET_ID = process.env.PO_RESPONSES_SHEET_ID!;
const PO_DRIVE_FOLDER_ID   = process.env.PO_DRIVE_FOLDER_ID!;

// ───────────────────────────── GET ─────────────────────────────
export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const action = searchParams.get("action");
  const { sheets } = getClients();

  const YEAR = new Date().getFullYear();

  // Helper: isDataRow — StoreDataEntry has header rows (1-6), data rows have
  // a numeric value in col A (the row sequence #). We skip anything non-numeric.
  const isDataRow = (row: any[]) => {
    const colA = String(row[0] || "").trim();
    return colA !== "" && !isNaN(Number(colA));
  };

  try {
    // ── 1. GET vendors ──────────────────────────────────────────
    if (action === "vendors") {
      // Read StoreDataEntry — source of truth for all requirements
      const res = await sheets.spreadsheets.values.get({
        spreadsheetId: STORE_SHEET_ID,
        range: "StoreDataEntry!A:T",
      });
      const rows = res.data.values || [];

      // Column indices (0-based in A:T):
      // A=0:#, B=1:RKDNum, E=4:ItemName, G=6:Units, I=8:Status,
      // N=13:VendorName, O=14:Rate, Q=16:ApprovalRequire, R=17:ApprovedQty
      const vendorSet = new Set<string>();
      rows.forEach((row: any) => {
        if (!isDataRow(row)) return;
        const vendor      = (row[13] || "").trim();
        const approvedQty = parseFloat(row[17] || "0");
        // Include if: vendor assigned AND approved qty > 0
        if (vendor && approvedQty > 0) vendorSet.add(vendor);
      });

      // Fetch vendor addresses from Misc Vendor List tab — col B=Name, col G=Address
      const vendorListRes = await sheets.spreadsheets.values.get({
        spreadsheetId: MISC_SHEET_ID,
        range: "Vendor List!B:G",
      });
      const vendorListRows = vendorListRes.data.values || [];
      const vendorAddressMap: Record<string, string> = {};
      vendorListRows.slice(1).forEach((row: any) => {
        const name    = (row[0] || "").trim();
        const address = (row[5] || "").trim(); // Col G is index 5 in B:G slice
        if (name) vendorAddressMap[name] = address;
      });

      const vendors = Array.from(vendorSet).sort().map(v => ({
        name: v,
        address: vendorAddressMap[v] || "",
      }));

      return NextResponse.json({ success: true, vendors });
    }

    // ── 2. GET items for vendor ─────────────────────────────────
    if (action === "items") {
      const vendor = searchParams.get("vendor") || "";
      const res = await sheets.spreadsheets.values.get({
        spreadsheetId: STORE_SHEET_ID,
        range: "StoreDataEntry!A:T",
      });
      const rows = res.data.values || [];

      const items = rows
        .filter((row: any) => {
          if (!isDataRow(row)) return false;
          const rowVendor   = (row[13] || "").trim();
          const approvedQty = parseFloat(row[17] || "0");
          return rowVendor === vendor && approvedQty > 0;
        })
        .map((row: any) => ({
          rkdNumber:   (row[1]  || "").trim(),   // B = Store RKD Number
          itemName:    (row[4]  || "").trim(),   // E = Item Name
          units:       (row[6]  || "").trim(),   // G = Units
          approvedQty: (row[17] || "0").trim(),  // R = Approved Quantity
          rate:        (row[14] || "0").trim(),  // O = Price/Rate
        }));

      // Fetch GST% per item from Misc Data tab (col B=ItemName, col J=GST%)
      const miscRes = await sheets.spreadsheets.values.get({
        spreadsheetId: MISC_SHEET_ID,
        range: "Data!B:J",
      });
      const miscRows = miscRes.data.values || [];
      const gstMap: Record<string, string> = {};
      miscRows.slice(1).forEach((row: any) => {
        const name = (row[0] || "").trim().toLowerCase();
        const gst  = (row[8] || "0").trim(); // Col J is index 8 in B:J slice
        if (name) gstMap[name] = gst;
      });

      const itemsWithGST = items.map((item: any) => ({
        ...item,
        gst: gstMap[item.itemName.toLowerCase()] || "0",
      }));

      return NextResponse.json({ success: true, items: itemsWithGST });
    }

    // ── 3. GET next PO number (with year) ──────────────────────
    if (action === "nextPO") {
      let nextNum = 1;
      try {
        const res = await sheets.spreadsheets.values.get({
          spreadsheetId: PO_RESPONSES_SHEET_ID,
          range: "RESPONSES!E:E", // PO No column
        });
        const rows = res.data.values || [];
        // Match PO_RKD_YYYY_NNN or legacy PO_RKD_NNN
        const nums = rows.slice(1)
          .map((r: any) => {
            const s = String(r[0] || "");
            const m = s.match(/PO_RKD_(?:\d{4}_)?(\d+)/);
            return m ? parseInt(m[1], 10) : 0;
          })
          .filter((n: number) => n > 0);
        if (nums.length > 0) nextNum = Math.max(...nums) + 1;
      } catch (_) { nextNum = 1; }
      return NextResponse.json({ success: true, poNumber: `PO_RKD_${YEAR}_${nextNum}` });
    }

    return NextResponse.json({ success: false, error: "Unknown action" }, { status: 400 });
  } catch (err: any) {
    console.error("[PO GET Error]:", err.message);
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}

// ───────────────────────────── POST ────────────────────────────
export async function POST(req: Request) {
  // Validate required env vars first
  if (!PO_RESPONSES_SHEET_ID) {
    return NextResponse.json({ success: false, error: "PO_RESPONSES_SHEET_ID env variable is not set in Vercel. Please add it under Settings → Environment Variables." }, { status: 500 });
  }

  try {
    const body = await req.json();
    const { sheets, drive } = getClients();

    const {
      poNumber, poDate, vendorName, vendorAddress,
      paymentTerms, termsOfDelivery, freightCharges, transporterName,
      quoteRefNo, packingCharges, discount, expectedArrival, poCheckedBy,
      items,       // array: [{rkdNumber, itemName, units, approvedQty, rate, gst}]
      pdfBase64,   // optional: client-generated PDF base64
    } = body;

    const CONSIGNEE = "RKD Furnishings Pvt Ltd., Plot No. 238-239, Sector-29, Part-II, HUDA, Panipat-132103, Haryana";
    const now = new Date();
    const timestamp = now.toLocaleString("en-IN", { timeZone: "Asia/Kolkata" });

    // ── 1. Save PDF to Drive (fully non-blocking) ───────────────
    let pdfUrl = "";
    let driveError = "";
    if (pdfBase64) {
      if (!PO_DRIVE_FOLDER_ID) {
        driveError = "PO_DRIVE_FOLDER_ID not set — PDF not uploaded to Drive.";
        console.warn(driveError);
      } else {
        try {
          const pdfBuffer = Buffer.from(pdfBase64, "base64");
          const { Readable } = await import("stream");
          const stream = Readable.from(pdfBuffer);
          const fileRes = await drive.files.create({
            requestBody: {
              name: `${poNumber}.pdf`,
              mimeType: "application/pdf",
              parents: [PO_DRIVE_FOLDER_ID],
            },
            media: { mimeType: "application/pdf", body: stream },
            fields: "id, webViewLink",
          });
          // Make file publicly viewable
          await drive.permissions.create({
            fileId: fileRes.data.id!,
            requestBody: { role: "reader", type: "anyone" },
          });
          pdfUrl = fileRes.data.webViewLink || "";
          console.log(`[PO] PDF saved to Drive: ${pdfUrl}`);
        } catch (driveErr: any) {
          driveError = `Drive upload failed: ${driveErr.message}`;
          console.error("[PO] Drive upload failed:", driveErr.message);
          // Continue — PDF download in browser still works
        }
      }
    }

    // ── 2. Save rows to RESPONSES sheet (one row per item) ──────
    const rowsToAppend = items.map((item: any) => {
      const qty   = parseFloat(item.approvedQty || "0");
      const rate  = parseFloat(item.rate        || "0");
      const gstPc = parseFloat(item.gst         || "0");
      const total    = qty * rate;
      const gstAmt   = total * gstPc / 100;
      const totalGST = total + gstAmt;

      return [
        timestamp,            // Timestamp
        poNumber,             // Unique
        vendorName,           // Vendor Name
        CONSIGNEE,            // Consignee Details
        poNumber,             // PO No
        poDate,               // PO Date
        paymentTerms || "",   // Payment Terms
        termsOfDelivery || "",
        freightCharges || "",
        transporterName || "",
        quoteRefNo || "",
        packingCharges || "",
        discount || "",
        expectedArrival || "",
        poCheckedBy || "",
        item.itemName,        // Item Description
        item.rkdNumber,       // RKD Request No
        qty,                  // Quantity
        item.units,           // Units
        rate,                 // Rate
        gstPc,                // GST%
        total.toFixed(2),     // TOTAL
        gstAmt.toFixed(2),    // GST Amount
        totalGST.toFixed(2),  // TOTAL with GST
        "",                   // EXCEL URL (blank)
        pdfUrl,               // PDF URL
      ];
    });

    try {
      await sheets.spreadsheets.values.append({
        spreadsheetId: PO_RESPONSES_SHEET_ID,
        range: "RESPONSES!A:Z",
        valueInputOption: "USER_ENTERED",
        requestBody: { values: rowsToAppend },
      });
      console.log(`[PO] Saved ${rowsToAppend.length} rows to RESPONSES sheet`);
    } catch (sheetErr: any) {
      // Give a clear actionable error message
      const msg = sheetErr.message || "";
      if (msg.includes("not found") || msg.includes("404")) {
        throw new Error(
          `RESPONSES sheet not accessible. Please share the sheet (ID: ${PO_RESPONSES_SHEET_ID}) with "${process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL}" (Editor access) and ensure the tab name is exactly "RESPONSES".`
        );
      }
      throw sheetErr;
    }

    return NextResponse.json({
      success: true,
      poNumber,
      pdfUrl,
      driveWarning: driveError || undefined,
    });
  } catch (err: any) {
    console.error("[PO POST Error]:", err.message);
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}
