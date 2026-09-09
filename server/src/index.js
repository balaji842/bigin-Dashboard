import express from "express";
import cors from "cors";
import "dotenv/config";

import modulesRouter from "./routes/modules.js";
import analyticsRouter from "./routes/analytics.js";
import crmAnalysisRouter from "./routes/crmAnalysis.js";
import authRouter from "./routes/auth.js";

const app = express();
const PORT = process.env.PORT || 4000;

app.use(cors());
app.use(express.json());

app.get("/api/health", (_req, res) => res.json({ ok: true }));

app.use("/api", authRouter);
app.use("/api", modulesRouter);
app.use("/api", analyticsRouter);
app.use("/api", crmAnalysisRouter);

app.use((err, _req, res, _next) => {
  console.error(err);
  res.status(500).json({ error: "Internal server error" });
});

app.listen(PORT, () => {
  console.log(`Bigin dashboard API running at http://localhost:${PORT}`);
});