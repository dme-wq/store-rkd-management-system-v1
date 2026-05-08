import { NextResponse } from "next/server";

export const dynamic = 'force-dynamic';

export async function GET() {
  const MAYTAPI_TOKEN = process.env.MAYTAPI_TOKEN!;
  const MAYTAPI_PRODUCT_ID = process.env.MAYTAPI_PRODUCT_ID!;
  const MAYTAPI_PHONE_ID = process.env.MAYTAPI_PHONE_ID!;

  const url = `https://api.maytapi.com/api/${MAYTAPI_PRODUCT_ID}/${MAYTAPI_PHONE_ID}/sendMessage`;
  
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-maytapi-key": MAYTAPI_TOKEN
      },
      body: JSON.stringify({
        to_number: "919882830548",
        type: "text",
        message: "✅ RKD Store System: WhatsApp Test Message from Vercel!"
      })
    });

    const result = await res.json();
    return NextResponse.json({
      success: true,
      maytapi_response: result,
      url_used: url,
      credentials: {
        product_id: MAYTAPI_PRODUCT_ID,
        phone_id: MAYTAPI_PHONE_ID,
        token_present: !!MAYTAPI_TOKEN
      }
    });
  } catch (e: any) {
    return NextResponse.json({ success: false, error: e.message, url_used: url });
  }
}
