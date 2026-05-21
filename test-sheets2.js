require('dotenv').config({ path: '.env.local' });
const { google } = require('googleapis');
const auth = new google.auth.GoogleAuth({
  credentials: {
    client_email: process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL,
    private_key: process.env.GOOGLE_PRIVATE_KEY.replace(/\\n/g, '\n').replace(/"/g, '')
  },
  scopes: ['https://www.googleapis.com/auth/spreadsheets']
});
const sheets = google.sheets({ version: 'v4', auth });

async function run() {
  try {
    console.log("Checking STORE_SHEET_ID...");
    await sheets.spreadsheets.get({ spreadsheetId: process.env.GOOGLE_SHEET_ID });
    console.log("STORE_SHEET_ID exists.");
    
    console.log("Checking StoreDataEntry!B:B...");
    await sheets.spreadsheets.values.get({ spreadsheetId: process.env.GOOGLE_SHEET_ID, range: 'StoreDataEntry!B:B' });
    console.log("StoreDataEntry!B:B works.");
    
    console.log("Checking MISC_SHEET_ID...");
    await sheets.spreadsheets.get({ spreadsheetId: process.env.MISC_SHEET_ID });
    console.log("MISC_SHEET_ID exists.");
    
    console.log("Checking Data!B:E in MISC_SHEET_ID...");
    await sheets.spreadsheets.values.get({ spreadsheetId: process.env.MISC_SHEET_ID, range: 'Data!B:E' });
    console.log("Data!B:E works.");
  } catch (e) {
    console.error("ERROR:", e.message);
  }
}
run();
