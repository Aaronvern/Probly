/**
 * Ghost Market News Ingester
 *
 * Polls NewsAPI every 15 minutes for top headlines across key categories,
 * deduplicates by URL, and stores raw articles to MongoDB news_articles
 * collection with processed: false for the LLM extractor to pick up.
 */

import type { Db } from "mongodb";

const NEWS_API_KEY = process.env.NEWS_API_KEY;
const NEWS_API_BASE = "https://newsapi.org/v2";
const POLL_INTERVAL_MS = 15 * 60 * 1000; // 15 minutes

const CATEGORY_QUERIES: Record<string, string> = {
  crypto:   "bitcoin OR ethereum OR crypto OR BNB OR blockchain",
  politics: "election OR president OR government OR policy OR legislation",
  finance:  "stock market OR Fed OR interest rate OR GDP OR earnings",
  sports:   "championship OR tournament OR final OR world cup OR NBA OR NFL",
  tech:     "AI OR Apple OR Google OR Microsoft OR OpenAI OR Tesla",
};

interface NewsArticle {
  url: string;
  headline: string;
  body: string;
  source: string;
  category: string;
  fetchedAt: number;
  processed: boolean;
}

interface NewsApiArticle {
  url: string;
  title: string;
  description: string | null;
  content: string | null;
  source: { name: string };
}

async function fetchCategory(category: string, query: string): Promise<NewsArticle[]> {
  const params = new URLSearchParams({
    q: query,
    language: "en",
    sortBy: "publishedAt",
    pageSize: "20",
    apiKey: NEWS_API_KEY!,
  });

  const res = await fetch(`${NEWS_API_BASE}/everything?${params}`);
  if (!res.ok) throw new Error(`NewsAPI ${res.status}: ${await res.text()}`);

  const data = await res.json() as { articles: NewsApiArticle[] };

  return (data.articles ?? []).map((a) => ({
    url: a.url,
    headline: a.title ?? "",
    body: [a.description, a.content].filter(Boolean).join("\n"),
    source: a.source?.name ?? "unknown",
    category,
    fetchedAt: Date.now(),
    processed: false,
  }));
}

/**
 * Fetch all categories and store new articles to MongoDB.
 * Deduplicates by URL — skips articles already in the collection.
 * Returns number of new articles stored.
 */
export async function ingestNews(db: Db): Promise<number> {
  if (!NEWS_API_KEY) {
    console.warn("[NewsIngester] NEWS_API_KEY not set — skipping");
    return 0;
  }

  let totalNew = 0;

  for (const [category, query] of Object.entries(CATEGORY_QUERIES)) {
    try {
      const articles = await fetchCategory(category, query);

      for (const article of articles) {
        if (!article.headline || !article.url) continue;

        // Upsert by URL — skip duplicates
        const result = await db.collection("news_articles").updateOne(
          { url: article.url },
          { $setOnInsert: article },
          { upsert: true },
        );

        if (result.upsertedCount > 0) totalNew++;
      }
    } catch (err: any) {
      console.warn(`[NewsIngester] Failed to fetch category ${category}: ${err.message}`);
    }
  }

  console.log(`[NewsIngester] Ingested ${totalNew} new articles`);
  return totalNew;
}

/**
 * Start the recurring news ingestion loop.
 * Returns a stop function to clear the interval.
 */
export function startNewsIngester(db: Db): () => void {
  console.log("[NewsIngester] Starting — polling every 15 minutes");

  // Run immediately on start
  ingestNews(db).catch(console.error);

  const id = setInterval(() => {
    ingestNews(db).catch(console.error);
  }, POLL_INTERVAL_MS);

  return () => {
    clearInterval(id);
    console.log("[NewsIngester] Stopped");
  };
}
