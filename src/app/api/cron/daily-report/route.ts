import { NextResponse } from "next/server";
import { google } from "googleapis";
import { Readable } from "stream";

// Dynamic import to avoid edge runtime issues, although API routes in app router use Node.js by default
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";

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
const WHATSAPP_LOG_SHEET_ID = process.env.WHATSAPP_LOG_SHEET_ID!;
const PO_DRIVE_FOLDER_ID   = process.env.PO_DRIVE_FOLDER_ID!;

const MAYTAPI_PRODUCT_ID = process.env.MAYTAPI_PRODUCT_ID!;
const MAYTAPI_TOKEN      = process.env.MAYTAPI_TOKEN!;
const MAYTAPI_PHONE_ID   = process.env.MAYTAPI_PHONE_ID!;

async function sendWhatsAppMedia(to: string, message: string, mediaUrl: string) {
  try {
    const url = `https://api.maytapi.com/api/${MAYTAPI_PRODUCT_ID}/${MAYTAPI_PHONE_ID}/sendMessage`;
    console.log(`[WhatsApp Cron] Sending media to ${to}...`);
    
    const res = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-maytapi-key": MAYTAPI_TOKEN
      },
      body: JSON.stringify({ 
        to_number: to, 
        type: "media", 
        message: mediaUrl,
        text: message
      })
    });

    const result = await res.json();
    console.log(`[WhatsApp Cron] API Response:`, JSON.stringify(result));
    return result;
  } catch (e) {
    console.error("[WhatsApp Cron] API Error:", e);
    return { success: false, error: String(e) };
  }
}

async function sendWhatsAppText(to: string, message: string) {
  try {
    const url = `https://api.maytapi.com/api/${MAYTAPI_PRODUCT_ID}/${MAYTAPI_PHONE_ID}/sendMessage`;
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-maytapi-key": MAYTAPI_TOKEN },
      body: JSON.stringify({ to_number: to, type: "text", message: message })
    });
    return await res.json();
  } catch (e) {
    return { success: false, error: String(e) };
  }
}

export async function GET(req: Request) {
  try {
    console.log("[CRON] Starting Daily Pending Report...");
    const { sheets, drive } = getClients();

    // 1. Fetch StoreDataEntry
    const res = await sheets.spreadsheets.values.get({
      spreadsheetId: STORE_SHEET_ID,
      range: "StoreDataEntry!A:T",
    });

    const rows = res.data.values || [];
    if (rows.length < 7) {
      return NextResponse.json({ success: true, message: "No data found." });
    }

    const headers = rows[5]; // Row 6 is header
    const dataRows = rows.slice(6);

    const pendingIndents = dataRows.filter(r => {
      const status = String(r[8] || "").trim(); // Column I is Status
      return status === "Requirement Open";
    });

    if (pendingIndents.length === 0) {
      console.log("[CRON] No pending indents today.");
      return NextResponse.json({ success: true, message: "No pending indents." });
    }

    console.log(`[CRON] Found ${pendingIndents.length} pending indents. Generating PDF...`);

    // 2. Generate PDF using jsPDF
    const doc = new jsPDF({ orientation: "landscape", unit: "mm", format: "a4" });
    const W = doc.internal.pageSize.getWidth();

    // Header
    doc.setFillColor(241, 245, 249);
    doc.rect(0, 0, W, 25, "F");
    doc.setFontSize(16); doc.setFont("helvetica","bold"); doc.setTextColor(30, 41, 59);
    doc.text("PENDING REQUIREMENT REPORT", W/2, 12, { align: "center" });
    
    const today = new Date().toLocaleString("en-IN", { timeZone: "Asia/Kolkata", dateStyle: "full", timeStyle: "short" });
    doc.setFontSize(10); doc.setFont("helvetica","normal"); doc.setTextColor(80, 80, 80);
    doc.text(`Generated: ${today}`, W/2, 18, { align: "center" });
    doc.text(`Total Pending Items: ${pendingIndents.length}`, W/2, 23, { align: "center" });

    // Table data
    const tableBody = pendingIndents.map((r, i) => [
      String(i + 1),
      r[1] || "-", // RKD Number
      r[2] || "-", // Timestamp
      r[4] || "-", // Item Name
      `${r[5] || "0"} ${r[6] || ""}`, // Require Qty + Units
      r[3] || "-", // Person
      r[9] || "-", // Department
      r[10] || "-" // Machine Name
    ]);

    autoTable(doc, {
      startY: 30,
      head: [["S.No", "RKD Number", "Date", "Item Name", "Required", "Person", "Department", "Machine"]],
      body: tableBody,
      theme: "grid",
      styles: { fontSize: 8, cellPadding: 2, textColor: 40, lineColor: [200, 205, 210], lineWidth: 0.2 },
      headStyles: { fillColor: [37, 99, 235], textColor: 255, fontStyle: "bold", halign: "center" },
      columnStyles: {
        0: { halign: "center", cellWidth: 12 },
        1: { halign: "center", cellWidth: 35 },
        2: { halign: "center", cellWidth: 35 },
        4: { halign: "center", cellWidth: 20 }
      }
    });

    const pdfBase64 = doc.output("datauristring").split(",")[1];
    const pdfBuffer = Buffer.from(pdfBase64, "base64");

    // 3. Upload to Google Drive
    console.log("[CRON] Uploading PDF to Google Drive...");
    const fileName = `Pending_Report_${new Date().toISOString().split("T")[0]}.pdf`;
    
    let pdfUrl = "";
    if (!PO_DRIVE_FOLDER_ID) {
      throw new Error("PO_DRIVE_FOLDER_ID not set.");
    }

    const fileRes = await drive.files.create({
      requestBody: {
        name: fileName,
        mimeType: "application/pdf",
        parents: [PO_DRIVE_FOLDER_ID],
      },
      media: {
        mimeType: "application/pdf",
        body: Readable.from(pdfBuffer),
      },
      supportsAllDrives: true,
    });

    // Make it publicly viewable
    await drive.permissions.create({
      fileId: fileRes.data.id!,
      requestBody: { role: "reader", type: "anyone" },
      supportsAllDrives: true,
    });

    pdfUrl = `https://drive.google.com/file/d/${fileRes.data.id}/view?usp=drivesdk`;
    console.log(`[CRON] PDF uploaded successfully: ${pdfUrl}`);

    // 4. Fetch DoerWhatsapp numbers
    console.log("[CRON] Fetching Doer contacts...");
    const doerRes = await sheets.spreadsheets.values.get({
      spreadsheetId: WHATSAPP_LOG_SHEET_ID,
      range: "DoerWhatsapp!A:B",
    });
    const doerRows = doerRes.data.values || [];
    const doerContacts = doerRows.slice(1).filter((r: any) => r[1]); 

    if (doerContacts.length === 0) {
      console.log("[CRON] No Doers found.");
      return NextResponse.json({ success: true, message: "PDF generated but no Doers found to notify.", pdfUrl });
    }

    // 5. Send WhatsApp message
    const msgText = `🔔 *Daily Pending Indent Report* 🔔\n\nTotal Pending Items: *${pendingIndents.length}*\n\nPlease find the attached PDF report for all open requirements.\n\n*Action Required:*\nhttps://store-rkd-management-system-v1.vercel.app/`;

    let sentCount = 0;
    for (const doer of doerContacts) {
      let doerPhone = String(doer[1]).replace(/\D/g, "");
      if (doerPhone.length === 10) doerPhone = "91" + doerPhone;
      else if (doerPhone.startsWith("0") && doerPhone.length === 11) doerPhone = "91" + doerPhone.slice(1);
      
      console.log(`[CRON] Sending to ${doer[0]} (${doerPhone})...`);
      
      // Maytapi takes 'message' as URL and 'text' as caption for type 'media'
      const waRes = await sendWhatsAppMedia(doerPhone, msgText, pdfUrl);
      if (waRes.success !== false) sentCount++;
    }

    console.log(`[CRON] Completed. Sent to ${sentCount} doers.`);
    return NextResponse.json({ success: true, sentCount, pdfUrl });

  } catch (err: any) {
    console.error("[CRON ERROR]", err);
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}
