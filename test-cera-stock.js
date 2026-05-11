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
  const res = await sheets.spreadsheets.values.batchGet({
    spreadsheetId: "1qb6LF7uWTss8PjpN2MJ3iCRynEolm-Ryvjwe-GxiA_M",
    ranges: ["IMS!B1:B20", "IMS!K1:K20"]
  });
  
  const names = res.data.valueRanges[0].values || [];
  const stocks = res.data.valueRanges[1].values || [];
  
  names.forEach((row, i) => {
      console.log('Item:', row[0]);
      console.log('Stock (K):', stocks[i] ? stocks[i][0] : 'N/A');
  });
}
run();
