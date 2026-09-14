import { GoogleGenAI } from "@google/genai";
import "dotenv/config";
import { buildSystemPrompt, trimHistory } from "./aiPromptBuilder.js";

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

export async function askGemini(message, crmContext, donorMatch, history = []) {
  const systemPrompt = buildSystemPrompt(crmContext, donorMatch);

  // Gemini's chat history uses role "model" (not "assistant") and wraps
  // each turn's text in a parts[] array rather than a plain string.
  const geminiHistory = trimHistory(history).map((h) => ({
    role: h.role === "assistant" ? "model" : "user",
    parts: [{ text: h.content }],
  }));

  const chat = ai.chats.create({
    model: "gemini-3.6-flash",
    config: { systemInstruction: systemPrompt },
    history: geminiHistory,
  });

  const response = await chat.sendMessage({ message });
  return response.text;
}