import express from "express";
import cors from "cors";
import path from "path";
import { fileURLToPath } from "url";
import "dotenv/config";

import modulesRouter from "./routes/modules.js";
import analyticsRouter from "./routes/analytics.js";
import crmAnalysisRouter from "./routes/crmAnalysis.js";
import authRouter from "./routes/auth.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 4000;

app.use(cors());
app.use(express.json());

app.get("/api/health", (_req, res) => res.json({ ok: true }));

app.use("/api", authRouter);
app.use("/api", modulesRouter);
app.use("/api", analyticsRouter);
app.use("/api", crmAnalysisRouter);

// Serve the built React app (client/dist), produced by `npm run build`
// in the client folder as part of the Render build step.
const clientDistPath = path.join(__dirname, "../../client/dist");
app.use(express.static(clientDistPath));

// Any non-API GET request falls through to the SPA's index.html.
app.get("*", (req, res, next) => {
  if (req.path.startsWith("/api")) return next();
  res.sendFile(path.join(clientDistPath, "index.html"));
});

app.use((err, _req, res, _next) => {
  console.error(err);
  res.status(500).json({ error: "Internal server error" });
});

app.listen(PORT, () => {
  console.log(`Bigin dashboard running at http://localhost:${PORT}`);
});