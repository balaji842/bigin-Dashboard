import Groq from "groq-sdk";
import "dotenv/config";
import { buildSystemPrompt, trimHistory } from "./aiPromptBuilder.js";

const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });

export async function askGroq(message, crmContext, donorMatch, history = []) {
  const systemPrompt = buildSystemPrompt(crmContext, donorMatch);
  const pastTurns = trimHistory(history).map((h) => ({
    role: h.role === "assistant" ? "assistant" : "user",
    content: h.content,
  }));

  const response = await groq.chat.completions.create({
    model: "openai/gpt-oss-120b",
    temperature: 0,
    messages: [
      { role: "system", content: systemPrompt },
      ...pastTurns,
      { role: "user", content: message },
    ],
  });

  return response.choices[0].message.content;
}