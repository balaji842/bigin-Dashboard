import { Router } from "express";
import { fetchAllRecords, biginRequest } from "../zohoClient.js";

const router = Router();

// Whitelist of modules this dashboard is allowed to touch (read-only)
const ALLOWED_MODULES = new Set([
  "Pipelines",
  "Accounts",
  "Contacts",
  "Tasks",
  "Calls",
  "Events",
  "Products",
  "Pipelines",
]);

// GET /api/modules  -> list what's available from Bigin itself
router.get("/modules", async (_req, res) => {
  try {
    const data = await biginRequest("/settings/modules");
    res.json(data);
  } catch (err) {
    res.status(err.status || 500).json({ error: err.message });
  }
});

// GET /api/modules/:module/fields -> field metadata (useful for building filters)
router.get("/modules/:module/fields", async (req, res) => {
  const { module } = req.params;
  if (!ALLOWED_MODULES.has(module)) {
    return res.status(400).json({ error: `Module ${module} not allowed` });
  }
  try {
    const data = await biginRequest("/settings/fields", { params: { module } });
    res.json(data);
  } catch (err) {
    res.status(err.status || 500).json({ error: err.message });
  }
});

// GET /api/modules/:module -> all records, live, paginated internally
router.get("/modules/:module", async (req, res) => {
  const { module } = req.params;
  if (!ALLOWED_MODULES.has(module)) {
    return res.status(400).json({ error: `Module ${module} not allowed` });
  }
  try {
    const records = await fetchAllRecords(module);
    res.json({ module, count: records.length, data: records });
  } catch (err) {
    res.status(err.status || 500).json({ error: err.message });
  }
});

// POST /api/modules/:module/search  { criteria: "(Stage:equals:Won)" }  (COQL-lite via search API)
router.get("/modules/:module/search", async (req, res) => {
  const { module } = req.params;
  const { criteria, word, email, phone } = req.query;
  if (!ALLOWED_MODULES.has(module)) {
    return res.status(400).json({ error: `Module ${module} not allowed` });
  }
  try {
    const data = await biginRequest(`/${module}/search`, {
      params: { criteria, word, email, phone },
    });
    res.json(data);
  } catch (err) {
    res.status(err.status || 500).json({ error: err.message });
  }
});

// POST /api/coql  { select_query: "select ... from Deals where ..." }
router.post("/coql", async (req, res) => {
  const { select_query } = req.body || {};
  if (!select_query) {
    return res.status(400).json({ error: "select_query is required" });
  }
  try {
    const data = await biginRequest("/coql", {
      method: "POST",
      data: { select_query },
    });
    res.json(data);
  } catch (err) {
    res.status(err.status || 500).json({ error: err.message });
  }
});

export default router;