import { NextResponse } from 'next/server';
import { GoogleGenAI } from '@google/genai';

export const dynamic = 'force-dynamic';

export async function POST(req: Request) {
  try {
    const { prompt, contextData } = await req.json();

    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      return NextResponse.json({ success: false, error: 'MISSING_API_KEY', message: 'GEMINI_API_KEY is not set in environment variables.' });
    }

    const ai = new GoogleGenAI({ apiKey: apiKey });

    // Construct a robust prompt for the AI to interpret the user's intent based on the active rows
    const systemInstruction = `You are a Senior Supply Chain & Inventory Analyst AI for the RKD Store Management System.
The current system Date and Time is: ${new Date().toLocaleString("en-IN", { timeZone: "Asia/Kolkata" })}. Use this to determine relative dates like "today" (aaj) or "yesterday" (kal).
The user will give you a voice command in Hindi/English (Hinglish).
You will be provided with the current inventory dataset, including indents, stock levels, and inward/PO history.

Your job is to deeply understand their intent, analyze the data to answer their query, and propose actions if necessary.

Possible Intents:
1. "VIEW" (User just wants to see a report or analysis. e.g., "Show me out of stock items from last 7 days", "Sachin ne kitne indent kiye")
2. "ACTION" (User wants to modify data. e.g., "Close the last 5 indents", "Cancel all pending for Machine A")

Here is the context data:
${JSON.stringify(contextData, null, 2)}

Return ONLY a valid JSON object exactly in this format (no markdown wrappers, no \`\`\`json):
{
  "intent": "VIEW" | "ACTION" | "UNKNOWN",
  "analysis": "Conversational summary in English/Hinglish. ALWAYS include total counts, date range, and key insights. e.g. 'Last 60 days mein 347 indents hue — 280 Closed, 62 Open, 5 Cancelled.'",
  "scorecard": {
    "total": 0,
    "open": 0,
    "closed": 0,
    "cancelled": 0,
    "byPerson": { "PersonName": 5 },
    "byItem": { "ItemName": 3 }
  },
  "suggestedFilters": {
    "dateFilter": "Today" | "Yesterday" | "Last 7 Days" | "Last 14 Days" | "Last 30 Days" | "This Month" | "Last Month" | "All Time" | null,
    "statusFilter": "Requirement Open" | "Requirement Closed" | "Requirement Cancelled" | "All Status" | null,
    "personFilter": "exact person name from data" | null
  },
  "targets": [
    {
      "rkdNumber": "RKD_S_2026_32484",
      "proposedAction": "CLOSE" | "CANCEL" | "NONE",
      "reason": "Brief reason."
    }
  ]
}

CRITICAL RULES:
1. ALWAYS compute and populate "scorecard" with accurate aggregate totals — mandatory for EVERY response.
2. "scorecard.byPerson" and "scorecard.byItem" — list the top 5 only.
3. For VIEW queries: if there are <= 100 matching records, also populate "targets". If > 100 records, ONLY populate scorecard (leave targets empty) to prevent token overflow.
4. For ACTION queries: ALWAYS populate "targets" with the exact records to modify.
5. When RKD numbers are short (e.g. "32484"), reconstruct the full ID as "RKD_S_2026_32484" in the targets array.

Data Context Rules:
- All data covers the LAST 60 DAYS only.
- "indents" format: ShortRKD|Item|Qty|Status|User|Timestamp (Status values: Open/Closed/Cancelled)
- "stockLevels" format: Item|CurrentStock
- "inwardHistory" format: ShortRKD|InwardQty|InwardDate
- "poHistory" format: ShortRKD|PONumber|PODate|VendorName
- ShortRKD is the numeric suffix only (e.g. "32484"). Full RKD = "RKD_S_2026_32484".
`;


    const response = await ai.models.generateContent({
        model: 'gemini-2.5-flash',
        contents: [
            { role: 'user', parts: [{ text: systemInstruction }] },
            { role: 'user', parts: [{ text: `User Command: "${prompt}"` }] }
        ],
        config: {
            temperature: 0.2,
            responseMimeType: "application/json"
        }
    });

    const text = response.text || "{}";
    const result = JSON.parse(text);

    return NextResponse.json({ success: true, result });

  } catch (error: any) {
    console.error("[AI API Error]:", error);
    return NextResponse.json({ success: false, error: error.message });
  }
}
