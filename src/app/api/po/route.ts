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

  try {
    // ── 1. GET vendors ──────────────────────────────────────────
    if (action === "vendors") {
      const res = await sheets.spreadsheets.values.get({
        spreadsheetId: STORE_SHEET_ID,
        range: "approvalDataBase!A:T",
      });
      const rows = res.data.values || [];
      // Header is row 1 (index 0), data starts at index 1
      // Col N (index 13) = Vendor Name, Col R (index 17) = Approved Quantity
      const vendorSet = new Set<string>();
      rows.slice(1).forEach((row: any) => {
        const vendor = (row[13] || "").trim();
        const approvedQty = parseFloat(row[17] || "0");
        if (vendor && approvedQty > 0) vendorSet.add(vendor);
      });

      // Fetch vendor addresses from Misc Vendor List tab, col B=Name, col G=Address
      const vendorListRes = await sheets.spreadsheets.values.get({
        spreadsheetId: MISC_SHEET_ID,
        range: "Vendor List!B:G",
      });
      const vendorListRows = vendorListRes.data.values || [];
      const vendorAddressMap: Record<string, string> = {};
      vendorListRows.slice(1).forEach((row: any) => {
        const name = (row[0] || "").trim();
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
        range: "approvalDataBase!A:T",
      });
      const rows = res.data.values || [];
      // Headers: B=StoreRKD, D=PersonName, E=ItemName, F=RequireQty, G=Units, 
      //          H=IssueQty, N=VendorName, O=Price(Rate), R=ApprovedQty
      const items = rows.slice(1)
        .filter((row: any) => {
          const rowVendor = (row[13] || "").trim();
          const approvedQty = parseFloat(row[17] || "0");
          return rowVendor === vendor && approvedQty > 0;
        })
        .map((row: any) => ({
          rkdNumber:   row[1]  || "",   // B = Store RKD Number
          itemName:    row[4]  || "",   // E = Item Name
          units:       row[6]  || "",   // G = Units
          approvedQty: row[17] || "0",  // R = Approved Quantity
          rate:        row[14] || "0",  // O = Price/Rate
        }));

      // Fetch GST for each item from Misc Data tab (col B=ItemName, col J=GST)
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

    // ── 3. GET next PO number ───────────────────────────────────
    if (action === "nextPO") {
      let nextNum = 1;
      try {
        const res = await sheets.spreadsheets.values.get({
          spreadsheetId: PO_RESPONSES_SHEET_ID,
          range: "RESPONSES!E:E", // PO No column
        });
        const rows = res.data.values || [];
        const nums = rows.slice(1)
          .map((r: any) => {
            const match = String(r[0] || "").match(/PO_RKD_(\d+)/);
            return match ? parseInt(match[1], 10) : 0;
          })
          .filter((n: number) => n > 0);
        if (nums.length > 0) nextNum = Math.max(...nums) + 1;
      } catch (_) { nextNum = 1; }
      return NextResponse.json({ success: true, poNumber: `PO_RKD_${nextNum}` });
    }

    return NextResponse.json({ success: false, error: "Unknown action" }, { status: 400 });
  } catch (err: any) {
    console.error("[PO GET Error]:", err.message);
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}

// ───────────────────────────── POST ────────────────────────────
export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { sheets, drive } = getClients();

    const {
      poNumber, poDate, vendorName, vendorAddress,
      paymentTerms, termsOfDelivery, freightCharges, transporterName,
      quoteRefNo, packingCharges, discount, expectedArrival, poCheckedBy,
      items, // array: [{rkdNumber, itemName, units, approvedQty, rate, gst}]
      pdfBase64, // optional: client-generated PDF
    } = body;

    const CONSIGNEE = "RKD Furnishings Pvt Ltd.\nPlot No. 238-239, Sector-29, Part-II\nHUDA, Panipat-132103, Haryana";
    const now = new Date();
    const timestamp = now.toLocaleString("en-IN", { timeZone: "Asia/Kolkata" });

    // ── Save PDF to Drive ───────────────────────────────────────
    let pdfUrl = "";
    if (pdfBase64 && PO_DRIVE_FOLDER_ID) {
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
      } catch (driveErr: any) {
        console.error("Drive upload failed:", driveErr.message);
      }
    }

    // ── Save rows to RESPONSES sheet (one row per item) ─────────
    const rowsToAppend = items.map((item: any) => {
      const qty   = parseFloat(item.approvedQty || "0");
      const rate  = parseFloat(item.rate        || "0");
      const gstPc = parseFloat(item.gst         || "0");
      const total     = qty * rate;
      const gstAmt    = total * gstPc / 100;
      const totalGST  = total + gstAmt;

      return [
        timestamp,           // Timestamp
        poNumber,            // Unique
        vendorName,          // Vendor Name
        CONSIGNEE,           // Consignee Details
        poNumber,            // PO No
        poDate,              // PO Date
        paymentTerms || "",  // Payment Terms
        termsOfDelivery || "",
        freightCharges || "",
        transporterName || "",
        quoteRefNo || "",
        packingCharges || "",
        discount || "",
        expectedArrival || "",
        poCheckedBy || "",
        item.itemName,       // Item Description
        item.rkdNumber,      // RKD Request No
        qty,                 // Quantity
        item.units,          // Units
        rate,                // Rate
        gstPc,               // GST%
        total.toFixed(2),    // TOTAL
        gstAmt.toFixed(2),   // GST Amount
        totalGST.toFixed(2), // TOTAL with GST
        "",                  // EXCEL URL (blank)
        pdfUrl,              // PDF URL
      ];
    });

    await sheets.spreadsheets.values.append({
      spreadsheetId: PO_RESPONSES_SHEET_ID,
      range: "RESPONSES!A:Z",
      valueInputOption: "USER_ENTERED",
      requestBody: { values: rowsToAppend },
    });

    return NextResponse.json({ success: true, poNumber, pdfUrl });
  } catch (err: any) {
    console.error("[PO POST Error]:", err.message);
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}
