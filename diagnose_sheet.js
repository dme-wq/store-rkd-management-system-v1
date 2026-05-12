const { google } = require('googleapis');
require('dotenv').config({ path: '.env.local' });

async function diagnose() {
  const email = process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL;
  const rawKey = process.env.GOOGLE_PRIVATE_KEY;
  const sheetId = process.env.GOOGLE_SHEET_ID;

  if (!email || !rawKey || !sheetId) {
    console.error("Missing env vars");
    return;
  }

  const private_key = rawKey.replace(/\\n/g, '\n').replace(/"/g, '').trim();
  const auth = new google.auth.GoogleAuth({
    credentials: { client_email: email, private_key },
    scopes: ["https://www.googleapis.com/auth/spreadsheets"],
  });
  const sheets = google.sheets({ version: "v4", auth });

  try {
    console.log("Fetching StoreDataEntry!A:P...");
    const res = await sheets.spreadsheets.values.get({
      spreadsheetId: sheetId,
      range: "StoreDataEntry!A:P",
    });

    const rows = res.data.values || [];
    console.log(`Total Rows Found: ${rows.length}`);
    
    if (rows.length > 0) {
      console.log("Header:", rows[0]);
      console.log("Last Row:", rows[rows.length - 1]);
      
      // Check for hidden characters in timestamp
      if (rows.length > 1) {
          const ts = rows[rows.length - 1][2];
          console.log(`Timestamp Sample: "${ts}"`);
          console.log(`Char Codes: ${[...ts].map(c => c.charCodeAt(0)).join(',')}`);
      }
    }
  } catch (e) {
    console.error("Fetch Error:", e.message);
  }
}

diagnose();
