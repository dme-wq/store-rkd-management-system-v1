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
    const systemInstruction = `You are a strict JSON-only AI assistant for an Inventory Indent Management System.
The user will give you a voice command in Hindi/English, and a list of currently open Indent records.
Your job is to figure out WHICH indents they are targeting, and WHAT action they want to take on them.

Possible actions:
1. "CLOSE" (This means fulfilling the indent completely. e.g. "aaj ke 5 indent close kar do")
2. "CANCEL" (This means rejecting/cancelling the indent. e.g. "sachin jain ke indents cancel kar do")

Here is the context data (the currently "Requirement Open" indents):
${JSON.stringify(contextData, null, 2)}

Return ONLY a JSON object exactly in this format without markdown wrappers, no \`\`\`json:
{
  "action": "CLOSE" | "CANCEL" | "UNKNOWN",
  "targetRkdNumbers": ["RKD_S_2026_...", ...],
  "reasoning": "Briefly explain why you selected these specific records based on the user's command."
}

Example Rules:
- "last 5 indent": Pick the 5 newest/latest indents based on Timestamp or order in the context array.
- "Sachin Jain ne jitne kiye aaj": Filter the list where "Person Filling Name" is heavily similar to "Sachin Jain" and the date matches today.
- "bearing 6204 wale": Pick indents where "Item Name" includes "Bearing 6204".
`;

    const response = await ai.models.generateContent({
        model: 'gemini-2.5-flash',
        contents: [
            { role: 'user', parts: [{ text: systemInstruction }] },
            { role: 'user', parts: [{ text: `User Command: "${prompt}"` }] }
        ],
        config: {
            temperature: 0.1,
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
