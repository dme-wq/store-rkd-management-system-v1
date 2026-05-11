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
  
  // Check IMS row count
  const r1 = await sheets.spreadsheets.values.get({
    spreadsheetId: "1qb6LF7uWTss8PjpN2MJ3iCRynEolm-Ryvjwe-GxiA_M",
    range: "IMS!A:A"
  });
  console.log("IMS total rows:", r1.data.values && r1.data.values.length);
  
  // Show first 5 rows of B and K to confirm alignment
  const r2 = await sheets.spreadsheets.values.batchGet({
    spreadsheetId: "1qb6LF7uWTss8PjpN2MJ3iCRynEolm-Ryvjwe-GxiA_M",
    ranges: ["IMS!B1:B5", "IMS!K1:K5"]
  });
  console.log("B1:B5 (Names):", JSON.stringify(r2.data.valueRanges[0].values));
  console.log("K1:K5 (Stock):", JSON.stringify(r2.data.valueRanges[1].values));
  
  // Check StoreDataEntry row count
  const r3 = await sheets.spreadsheets.values.get({
    spreadsheetId: process.env.GOOGLE_SHEET_ID,
    range: "StoreDataEntry!A:A"
  });
  console.log("StoreDataEntry total rows:", r3.data.values && r3.data.values.length);
}
run().catch(console.error);
