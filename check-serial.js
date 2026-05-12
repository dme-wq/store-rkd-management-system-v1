const { google } = require('googleapis');
require('dotenv').config({ path: '.env.local' });
const auth = new google.auth.GoogleAuth({
  credentials: {
    client_email: process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL,
    private_key: process.env.GOOGLE_PRIVATE_KEY.replace(/\\n/g, '\n').replace(/"/g, '')
  },
  scopes: ['https://www.googleapis.com/auth/spreadsheets'],
});
const sheets = google.sheets({ version: 'v4', auth });
sheets.spreadsheets.values.get({
  spreadsheetId: process.env.GOOGLE_SHEET_ID,
  range: 'StoreDataEntry!A:B'
}).then(res => {
  const rows = res.data.values || [];
  console.log('Total rows:', rows.length);
  console.log('Last 10 rows:', rows.slice(-10));
}).catch(console.error);
