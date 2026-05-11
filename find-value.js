const { google } = require('googleapis');
require('dotenv').config({ path: '.env.local' });

async function run() {
  const auth = new google.auth.GoogleAuth({
    credentials: { 
      client_email: process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL, 
      private_key: process.env.GOOGLE_PRIVATE_KEY.replace(/\\n/g, '\n').replace(/"/g, '') 
    },
    scopes: ["https://www.googleapis.com/auth/spreadsheets"],
  });
  const sheets = google.sheets({ version: "v4", auth });
  const res = await sheets.spreadsheets.values.get({
    spreadsheetId: "1qb6LF7uWTss8PjpN2MJ3iCRynEolm-Ryvjwe-GxiA_M",
    range: "IMS!A1:N7000"
  });
  
  const rows = res.data.values || [];
  rows.forEach((row, i) => {
    if (row.includes('-28') || row.includes('-28.00') || row.includes(-28)) {
      console.log(`Found -28 in Row ${i+1}:`, row);
    }
  });
}
run();
