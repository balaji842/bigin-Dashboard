import { Router } from "express";
import Parser from "rss-parser";

const router = Router();
const parser = new Parser();

const FEEDS = {
  CSR: "https://news.google.com/rss/search?q=CSR+India&hl=en-IN&gl=IN&ceid=IN:en",
  Tender: "https://news.google.com/rss/search?q=tender+%22Tamil+Nadu%22&hl=en-IN&gl=IN&ceid=IN:en",
};

const CACHE_MS = 10 * 60 * 1000; // normal page loads reuse the news for 10 minutes
let cache = { time: 0, items: [] };

// Google News titles look like "Headline - Source name"
function splitTitle(raw = "") {
  const i = raw.lastIndexOf(" - ");
  return i > 0
    ? { title: raw.slice(0, i), source: raw.slice(i + 3) }
    : { title: raw, source: "" };
}

async function loadAll() {
  const all = [];
  for (const [category, url] of Object.entries(FEEDS)) {
    try {
      const feed = await parser.parseURL(url);
      for (const it of feed.items) {
        const { title, source } = splitTitle(it.title);
        all.push({
          category,
          title,
          source,
          link: it.link,
          publishedAt: it.isoDate || it.pubDate || null,
        });
      }
    } catch (err) {
      console.error(`Daily updates: ${category} feed failed:`, err.message);
    }
  }
  all.sort((a, b) => new Date(b.publishedAt) - new Date(a.publishedAt));
  return all;
}

// GET /api/daily-updates?category=CSR|Tender&refresh=1
// refresh=1 skips the 10-minute saved copy and reads the feeds again.
router.get("/daily-updates", async (req, res) => {
  try {
    const force = req.query.refresh === "1";
    if (force || Date.now() - cache.time > CACHE_MS) {
      const fresh = await loadAll();
      // if every feed failed, keep showing the last good list
      if (fresh.length > 0 || cache.items.length === 0) {
        cache = { time: Date.now(), items: fresh };
      }
    }
    const { category } = req.query;
    const items = category
      ? cache.items.filter((i) => i.category === category)
      : cache.items;
    res.json({ count: items.length, data: items, fetchedAt: new Date(cache.time).toISOString() });
  } catch (err) {
    res.status(500).json({ error: "Could not read the news feeds" });
  }
});

export default router;