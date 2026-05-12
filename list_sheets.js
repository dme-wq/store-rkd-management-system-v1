const { google } = require('googleapis');
require('dotenv').config({ path: '.env.local' });

async function listSheets() {
  const email = process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL;
  const rawKey = process.env.GOOGLE_PRIVATE_KEY;
  const sheetId = process.env.GOOGLE_SHEET_ID;

  const private_key = rawKey.replace(/\\n/g, '\n').replace(/"/g, '').trim();
  const auth = new google.auth.GoogleAuth({
    credentials: { client_email: email, private_key },
    scopes: ["https://www.googleapis.com/auth/spreadsheets"],
  });
  const sheets = google.sheets({ version: "v4", auth });

  try {
    const res = await sheets.spreadsheets.get({ spreadsheetId: sheetId });
    console.log("Sheets found:");
    res.data.sheets.forEach(s => console.log(`- ${s.properties.title}`));
  } catch (e) {
    console.error("Error:", e.message);
  }
}
listSheets();
