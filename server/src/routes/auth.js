import express from "express";

const router = express.Router();

// The password lives only in the backend .env file — it is never sent to
// the browser except as a pass/fail result, so it can't be read from the
// client bundle or devtools.
const DASHBOARD_PASSWORD = process.env.DASHBOARD_PASSWORD || "";

router.post("/auth/login", (req, res) => {
  const { password } = req.body || {};

  if (!DASHBOARD_PASSWORD) {
    // Fail safe: if no password is configured on the server, don't silently
    // let everyone in — force the operator to set one.
    return res
      .status(500)
      .json({ error: "DASHBOARD_PASSWORD is not set in server/.env" });
  }

  if (typeof password === "string" && password === DASHBOARD_PASSWORD) {
    return res.json({ ok: true });
  }

  return res.status(401).json({ ok: false, error: "Incorrect password" });
});

export default router;