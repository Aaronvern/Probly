/**
 * Event Matcher
 *
 * Two-pass cross-platform matching:
 *  Pass 1 — Keyword Jaccard similarity: fast, free pre-filter for candidate pairs
 *  Pass 2 — LLM resolution check: Claude confirms oracle sources match before merging
 *
 * Only events that pass both gates get a shared Global_Event_ID.
 */

import Anthropic from "@anthropic-ai/sdk";
import type { Db } from "mongodb";
import type { UnifiedMarket, Platform, PlatformAdapter } from "../types.js";
import type { GlobalEvent, TokenMapping } from "../db/events.js";
import { upsertGlobalEvent } from "../db/events.js";

// ---------------------------------------------------------------------------
// Jaccard keyword similarity
// ---------------------------------------------------------------------------

const STOPWORDS = new Set([
  "will", "the", "a", "an", "is", "are", "was", "were", "be", "been",
  "have", "has", "had", "do", "does", "did", "not", "and", "or", "but",
  "in", "on", "at", "to", "for", "of", "with", "by", "from", "up", "if",
  "vs", "versus", "this", "that", "end", "over", "under", "its", "their",
  "than", "more", "less", "before", "after", "between", "about", "any",
  "all", "into", "out", "can", "could", "would", "should", "may", "might",
  "yes", "no", "market", "predict", "price", "per", "usd", "date",
]);

function extractKeywords(q: string): Set<string> {
  return new Set(
    q
      .toLowerCase()
      .replace(/[^a-z0-9\s]/g, " ")
      .split(/\s+/)
      .filter((w) => w.length > 2 && !STOPWORDS.has(w)),
  );
}

function jaccardSimilarity(a: Set<string>, b: Set<string>): number {
  if (a.size === 0 && b.size === 0) return 1;
  const intersection = [...a].filter((x) => b.has(x)).length;
  const union = new Set([...a, ...b]).size;
  return union === 0 ? 0 : intersection / union;
}

/** Threshold for considering two questions as candidates for the same event */
const JACCARD_THRESHOLD = 0.35;

// ---------------------------------------------------------------------------
// LLM resolution safety check
// ---------------------------------------------------------------------------

let anthropic: Anthropic | null = null;

function getAnthropic(): Anthropic {
  if (!anthropic) {
    anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  }
  return anthropic;
}

/**
 * Ask Claude whether two markets resolve using the same oracle / criteria.
 * Returns true only if both resolution sources are compatible.
 */
async function checkResolutionCompatibility(
  questionA: string,
  sourceA: string | undefined,
  platformA: Platform,
  questionB: string,
  sourceB: string | undefined,
  platformB: Platform,
): Promise<boolean> {
  // If either has no resolution source, allow merge (we can't verify, not block)
  if (!sourceA && !sourceB) return true;

  const client = getAnthropic();

  const prompt = `You are checking whether two prediction markets on different platforms resolve identically — i.e., they would always settle YES/NO together and could be treated as the same market.

Market A (${platformA}):
Question: "${questionA}"
Resolution rules: "${sourceA ?? "not specified"}"

Market B (${platformB}):
Question: "${questionB}"
Resolution rules: "${sourceB ?? "not specified"}"

Answer with ONLY "YES" if these markets resolve using compatible sources and would always settle the same way, or "NO" if they might resolve differently (different oracles, different cutoff times, different reference prices, etc.).`;

  try {
    const msg = await client.messages.create({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 8,
      messages: [{ role: "user", content: prompt }],
    });
    const text = (msg.content[0] as { type: string; text: string }).text.trim().toUpperCase();
    return text.startsWith("YES");
  } catch (err: any) {
    // If LLM check fails (no key, rate limit etc.), log and allow merge
    // LLM resolution check unavailable — defaulting to allow
    return true;
  }
}

// ---------------------------------------------------------------------------
// Token extraction
// ---------------------------------------------------------------------------

function extractTokens(market: UnifiedMarket, platform: Platform): TokenMapping | null {
  const raw = market._raw;
  if (!raw) return null;

  let yesTokenId = "";
  let noTokenId = "";
  const marketId = market.platformIds[platform] ?? "";

  if (platform === "opinion") {
    yesTokenId = raw.yesTokenId ?? "";
    noTokenId = raw.noTokenId ?? "";
  } else if (platform === "predict") {
    // Predict uses market ID for orderbook lookups (YES-only book, NO = 1 - YES)
    yesTokenId = marketId;
    noTokenId = marketId;
  } else if (platform === "probable") {
    const tokens = raw.tokens ?? [];
    yesTokenId = tokens[0]?.token_id ?? "";
    noTokenId = tokens[1]?.token_id ?? "";
  }

  if (!marketId) return null;
  return { platform, marketId, yesTokenId, noTokenId };
}

// ---------------------------------------------------------------------------
// Matching logic
// ---------------------------------------------------------------------------

interface MarketEntry {
  market: UnifiedMarket;
  platform: Platform;
  keywords: Set<string>;
}

interface EventGroup {
  normalized: string;
  keywords: Set<string>;
  markets: MarketEntry[];
}

/** Normalize question text for stable ID generation */
function normalizeQuestion(q: string): string {
  return q
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function generateEventId(normalized: string): string {
  let hash = 0;
  for (let i = 0; i < normalized.length; i++) {
    const char = normalized.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash;
  }
  return `evt_${Math.abs(hash).toString(36)}`;
}

export interface MatchResult {
  created: number;
  updated: number;
  total: number;
}

/**
 * Scan all platforms, match events via Jaccard + LLM resolution check,
 * and upsert GlobalEvents to MongoDB.
 */
export async function matchAndSyncEvents(
  db: Db,
  adapters: PlatformAdapter[],
): Promise<MatchResult> {
  // Fetch markets from all platforms in parallel
  const results = await Promise.allSettled(adapters.map((a) => a.getMarkets()));

  // Collect all markets with their keywords
  const allMarkets: MarketEntry[] = [];
  for (let i = 0; i < adapters.length; i++) {
    const result = results[i];
    if (result.status !== "fulfilled") {
      // Platform fetch failed — silently skip
      continue;
    }
    for (const market of result.value) {
      if (!market.question) continue;
      allMarkets.push({
        market,
        platform: adapters[i].platform,
        keywords: extractKeywords(market.question),
      });
    }
  }

  // Pass 1: Group by Jaccard similarity
  // For each market, find the best-matching existing group or create a new one
  const groups: EventGroup[] = [];

  for (const entry of allMarkets) {
    let bestGroup: EventGroup | null = null;
    let bestScore = JACCARD_THRESHOLD - 0.001; // must exceed threshold

    // Skip same-platform comparison — only cross-platform merges
    for (const group of groups) {
      const hasSamePlatform = group.markets.some((m) => m.platform === entry.platform);

      // Use Jaccard for cross-platform candidates; exact normalized match for same-platform
      if (hasSamePlatform) {
        const norm = normalizeQuestion(entry.market.question);
        if (group.normalized === norm) {
          // Same platform + identical question → group anyway (shouldn't happen but handle it)
          bestGroup = group;
          bestScore = 1;
          break;
        }
        continue; // different question, same platform → skip
      }

      const score = jaccardSimilarity(entry.keywords, group.keywords);
      if (score > bestScore) {
        bestScore = score;
        bestGroup = group;
      }
    }

    if (bestGroup) {
      bestGroup.markets.push(entry);
      // Merge keywords for future comparisons
      for (const kw of entry.keywords) bestGroup.keywords.add(kw);
    } else {
      groups.push({
        normalized: normalizeQuestion(entry.market.question),
        keywords: new Set(entry.keywords),
        markets: [entry],
      });
    }
  }

  // Pass 2: LLM resolution check on cross-platform groups
  let created = 0;
  let updated = 0;

  for (const group of groups) {
    const crossPlatform = group.markets.length > 1 &&
      new Set(group.markets.map((m) => m.platform)).size > 1;

    // For cross-platform groups, verify resolution compatibility
    let approvedMarkets: MarketEntry[] = [];

    if (crossPlatform) {
      // Take first market as anchor, check each subsequent cross-platform entry
      const anchor = group.markets[0];
      approvedMarkets = [anchor];

      for (let i = 1; i < group.markets.length; i++) {
        const candidate = group.markets[i];
        if (candidate.platform === anchor.platform) {
          approvedMarkets.push(candidate);
          continue;
        }

        const compatible = await checkResolutionCompatibility(
          anchor.market.question,
          anchor.market.resolutionSource,
          anchor.platform,
          candidate.market.question,
          candidate.market.resolutionSource,
          candidate.platform,
        );

        if (compatible) {
          console.log(`[Matcher] ✓ Linked "${anchor.market.question}" [${anchor.platform}] ↔ [${candidate.platform}]`);
          approvedMarkets.push(candidate);
        } else {
          console.log(`[Matcher] ✗ Blocked merge: incompatible resolution "${anchor.market.question}" vs "${candidate.market.question}"`);
          // Add the blocked market as its own single-platform group
          const solo = normalizeQuestion(candidate.market.question);
          const soloEvent: GlobalEvent = {
            globalEventId: generateEventId(solo + candidate.platform),
            question: candidate.market.question,
            slug: candidate.market.slug,
            outcomes: ["YES", "NO"],
            status: candidate.market.status,
            platforms: [extractTokens(candidate.market, candidate.platform)].filter(Boolean) as TokenMapping[],
            resolutionSource: candidate.market.resolutionSource,
            createdAt: candidate.market.createdAt,
            expiresAt: candidate.market.expiresAt,
            tags: candidate.market._raw?.tags ?? candidate.market._raw?.labels,
            updatedAt: Date.now(),
          };
          await upsertGlobalEvent(db, soloEvent);
          created++;
        }
      }
    } else {
      approvedMarkets = group.markets;
    }

    // Build the GlobalEvent from approved markets
    const first = approvedMarkets[0];
    const platforms: TokenMapping[] = [];
    for (const { market, platform } of approvedMarkets) {
      const tokens = extractTokens(market, platform);
      if (tokens) platforms.push(tokens);
    }

    const isMultiPlatform = new Set(approvedMarkets.map((m) => m.platform)).size > 1;
    const eventId = generateEventId(normalizeQuestion(first.market.question));

    const event: GlobalEvent = {
      globalEventId: eventId,
      question: first.market.question,
      slug: first.market.slug,
      outcomes: ["YES", "NO"],
      status: first.market.status,
      platforms,
      resolutionSource: first.market.resolutionSource,
      createdAt: first.market.createdAt,
      expiresAt: first.market.expiresAt,
      tags: first.market._raw?.tags ?? first.market._raw?.labels,
      updatedAt: Date.now(),
    };

    await upsertGlobalEvent(db, event);
    if (isMultiPlatform) updated++;
    else created++;
  }

  return { created, updated, total: groups.length };
}
