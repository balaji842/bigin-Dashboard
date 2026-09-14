import express from "express";
import { askAI } from "../lib/aiProvider.js";
import { getCRMContext, getRawDeals } from "../lib/crmContext.js";
import { findDonor } from "../lib/donorSearch.js";

const router = express.Router();

router.post("/ai/chat", async (req, res) => {
  try {
    const { message, history } = req.body;
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

    const { answer, provider } = await askAI({
      message,
      crmContext,
      donorMatch,
      history: Array.isArray(history) ? history : [],
    });

    res.json({ success: true, answer, provider });
  } catch (error) {
    console.error("AI chat error:", error);
    res.status(500).json({ success: false, error: "AI request failed" });
  }
});

export default router;