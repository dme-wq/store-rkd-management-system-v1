const { google } = require('googleapis');
require('dotenv').config({ path: '.env.local' });

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
    const res = await sheets.spreadsheets.values.get({
      spreadsheetId: process.env.MISC_SHEET_ID,
      range: 'Data!A1:G5'
    });
    console.log('Data Tab:', res.data.values);

    const res2 = await sheets.spreadsheets.values.get({
      spreadsheetId: process.env.GOOGLE_SHEET_ID,
      range: 'StoreDataEntry!A6:P7'
    });
    console.log('StoreDataEntry Tab:', res2.data.values);
  } catch (e) {
    console.error(e);
  }
}
run();
