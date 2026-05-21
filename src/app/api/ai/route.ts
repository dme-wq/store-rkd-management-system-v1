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
  "analysis": "A conversational, highly professional response in English (or Hinglish if appropriate) explaining what you found. e.g. 'I found 4 items that were out of stock. 2 of them were received yesterday...'",
  "targets": [
    {
      "rkdNumber": "RKD_S_2026_...",
      "proposedAction": "CLOSE" | "CANCEL" | "NONE",
      "reason": "Brief reason why this record is included."
    }
  ]
}

CRITICAL RULES FOR TARGETS:
1. You MUST ALWAYS populate the \`targets\` array with EVERY single record that matches the user's query, regardless of whether the intent is VIEW or ACTION.
2. If you say "I found 43 indents", the \`targets\` array MUST contain exactly those 43 RKD Numbers. Never leave it empty if you found matching data.
3. If intent is VIEW, set proposedAction to "NONE".

Data Context Rules:
- 'data' contains the indents.
- 'inwardMap' contains actual received quantities and dates.
- 'stockMap' contains current live stock.
- Use these maps to answer questions about 'out of stock' vs 'when it arrived'.
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
