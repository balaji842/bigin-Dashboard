import { askGroq } from "./groqService.js";
import { askGemini } from "./geminiService.js";

const PRIMARY = (process.env.AI_PROVIDER || "gemini").toLowerCase();

const PROVIDERS = { groq: askGroq, gemini: askGemini };
const order = PRIMARY === "groq" ? ["groq", "gemini"] : ["gemini", "groq"];

export async function askAI({ message, crmContext, donorMatch, history }) {
  let lastErr;
  for (const name of order) {
    const fn = PROVIDERS[name];
    if (!fn) continue;
    try {
      const answer = await fn(message, crmContext, donorMatch, history);
      return { answer, provider: name };
    } catch (err) {
      console.error(`[aiProvider] ${name} failed:`, err.message);
      lastErr = err;
    }
  }
  throw lastErr;
}