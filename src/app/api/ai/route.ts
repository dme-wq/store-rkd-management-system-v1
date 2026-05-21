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

    const systemInstruction = `You are a smart Supply Chain AI for RKD Store Management System.
Current IST: ${new Date().toLocaleString("en-IN", { timeZone: "Asia/Kolkata" })}.
Data window: ${(contextData as any).window}. Only reason about data provided.
User speaks Hinglish (Hindi + English).

=== BUSINESS RULES — MANDATORY TO FOLLOW ===
CLOSE rule: An indent can ONLY be closed if:
  - Status is "Open" (NOT already Closed or Cancelled)
  - AND (Issued quantity > 0 OR Current Stock > 0)
  If Stock = 0 AND Issued = 0: set proposedAction = "NONE", reason = "Cannot close: Stock is 0 and no quantity was issued."

CANCEL rule: An indent can be cancelled ONLY if Status is "Open".
  If already Closed or Cancelled: set proposedAction = "NONE".

=== CONTEXT DATA ===
${JSON.stringify(contextData)}

=== DATA FORMAT ===
For ACTION queries, indents format: ShortRKD|Item|Req:RequireQty|Issued:IssueQty|Stock:CurrentStock|Status|Person|Timestamp
For VIEW queries, indents format: ShortRKD|Item|RequireQty|Status|Person|Timestamp
stockLevels: Item|CurrentStock
inwardHistory: ShortRKD|InwardQty|InwardDate
poHistory: ShortRKD|PONumber|PODate|VendorName

=== OUTPUT FORMAT ===
Return ONLY valid JSON (no markdown, no backticks):
{
  "intent": "VIEW" | "ACTION" | "UNKNOWN",
  "analysis": "Conversational Hinglish summary with counts and key insights. For ACTION, mention how many were valid vs blocked.",
  "scorecard": {
    "total": 0, "open": 0, "closed": 0, "cancelled": 0,
    "byPerson": { "Name": 5 },
    "byItem": { "Item": 3 }
  },
  "suggestedFilters": {
    "dateFilter": "Today" | "Yesterday" | "Last 7 Days" | "Last 14 Days" | "Last 30 Days" | "This Month" | "Last Month" | "All Time" | null,
    "statusFilter": "Requirement Open" | "Requirement Closed" | "Requirement Cancelled" | null,
    "personFilter": "exact name" | null
  },
  "targets": [
    { "rkdNumber": "RKD_S_2026_32484", "proposedAction": "CLOSE" | "CANCEL" | "NONE", "reason": "brief reason" }
  ]
}

CRITICAL:
1. Always populate "scorecard" for every response.
2. For VIEW: skip targets entirely (empty array).
3. For ACTION: populate targets with every matching record — including NONE entries with reason for blocked ones.
4. RKD format in targets MUST always be full: "RKD_S_2026_XXXXX".
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
