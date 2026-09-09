import express from "express";
import { askGroq as askOllama } from "../lib/groqService.js";
import { getCRMContext, getRawDeals } from "../lib/crmContext.js";
import { findDonor } from "../lib/donorSearch.js";

const router = express.Router();

router.post("/ai/chat", async (req, res) => {
  try {
    const { message } = req.body;
    if (!message || !message.trim()) {
      return res.status(400).json({ success: false, error: "Message is required" });
    }

    let crmContext = null;
    let donorMatch = null;
    try {
      crmContext = await getCRMContext();
      const rawDeals = await getRawDeals();
      donorMatch = findDonor(rawDeals, message);
    } catch (ctxErr) {
      console.error("[ai] Failed to fetch CRM context:", ctxErr.message);
    }

    const answer = await askOllama(message, crmContext, donorMatch);
    res.json({ success: true, answer });
  } catch (error) {
    console.error("Groq AI error:", error);
    res.status(500).json({ success: false, error: "AI request failed" });
  }
});

export default router;