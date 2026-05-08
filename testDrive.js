const fs = require('fs');
fs.readFileSync('.env.local', 'utf8').split('\n').forEach(line => { 
  const parts = line.split('='); 
  if(parts[0]) process.env[parts[0].trim()] = parts.slice(1).join('=').replace(/^"|"$/g, '').trim(); 
});
const { google } = require('googleapis');
const stream = require('stream');

const email = process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL;
const rawKey = process.env.GOOGLE_PRIVATE_KEY;
const folderId = process.env.PO_DRIVE_FOLDER_ID;

const private_key = rawKey.replace(/\\n/g, '\n').replace(/"/g, '').trim();
const auth = new google.auth.GoogleAuth({
  credentials: { client_email: email, private_key },
  scopes: ["https://www.googleapis.com/auth/drive"],
});
const drive = google.drive({ version: "v3", auth });

async function run() {
  console.log("Testing Drive Upload to folder:", folderId);
  try {
    const dummyBuffer = Buffer.from("test pdf content", "utf-8");
    const s = stream.Readable.from(dummyBuffer);
    const fileRes = await drive.files.create({
      requestBody: {
        name: `test.pdf`,
        mimeType: "application/pdf",
        parents: [folderId],
      },
      media: { mimeType: "application/pdf", body: s },
      fields: "id",
    });
    console.log("SUCCESS:", fileRes.data);
  } catch (err) {
    console.error("ERROR:", err.message);
  }
}
run();
