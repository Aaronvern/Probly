/**
 * Ghost Market Matcher
 *
 * When a real market arrives from an adapter, embeds its question and
 * searches for similar ghost markets. If a match is found above the
 * threshold, runs an LLM resolution risk check and binds the ghost
 * market to the real GlobalEvent — annotating with resolutionRisk.
 *
 * Never hard-blocks a match — always binds and surfaces risk to user.
 */

import Anthropic from "@anthropic-ai/sdk";
import type { Db } from "mongodb";
import { embed, findSimilar, type ResolutionRisk } from "./embedder.js";

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

const SIMILARITY_THRESHOLD = 0.85;

const RISK_CHECK_PROMPT = `You are a prediction market risk analyst. Two platforms list what appears to be the same market event. Compare their resolution rules and score the risk.

Risk levels:
- "low"      — same resolution source, dates within 1 day
- "medium"   — different sources but same criteria (e.g. CoinGecko vs Binance — both price feeds)
- "high"     — resolution dates differ by more than 7 days
- "critical" — fundamentally different resolution criteria (e.g. closing price vs 24h average, different election definitions)

IMPORTANT: compatible is ALWAYS true — we never block the match. We only annotate risk.

Respond with JSON only:
{
  "riskLevel": "low" | "medium" | "high" | "critical",
  "reasons": string[],       // list specific differences found
  "recommendation": string   // one sentence for the user
}`;

/**
 * Run LLM risk check between a ghost market and a real market's resolution rules.
 */
async function checkResolutionRisk(
  ghostQuestion: string,
  ghostResolutionDate: string,
  ghostResolutionSource: string,
  realQuestion: string,
  realResolutionDate?: string,
  realResolutionSource?: string,
): Promise<ResolutionRisk> {
  const content = `
Ghost Market:
  Question: ${ghostQuestion}
  Resolution Date: ${ghostResolutionDate}
  Resolution Source: ${ghostResolutionSource}

Real Market:
  Question: ${realQuestion}
  Resolution Date: ${realResolutionDate ?? "unknown"}
  Resolution Source: ${realResolutionSource ?? "unknown"}
`.trim();

  try {
    const response = await client.messages.create({
      model: "claude-haiku-4-5",
      max_tokens: 512,
      messages: [
        { role: "user", content: `${RISK_CHECK_PROMPT}\n\n${content}` },
      ],
    });

    const text = response.content[0].type === "text" ? response.content[0].text : "";
    const parsed = JSON.parse(text.trim());

    return {
      level: parsed.riskLevel ?? "medium",
      reasons: parsed.reasons ?? [],
      recommendation: parsed.recommendation ?? "Verify resolution criteria before trading.",
      checkedAt: Date.now(),
    };
  } catch {
    // Fallback if LLM or parse fails
    return {
      level: "medium",
      reasons: ["Could not automatically assess resolution risk — review manually."],
      recommendation: "Verify resolution criteria before trading.",
      checkedAt: Date.now(),
    };
  }
}

export interface MatchResult {
  ghostId: string;
  question: string;
  similarityScore: number;
  resolutionRisk: ResolutionRisk;
}

/**
 * Try to match a newly synced real market to an existing ghost market.
 * If matched: binds ghost → globalEventId, writes resolutionRisk to both.
 * Returns null if no ghost match found above threshold.
 */
export async function matchRealMarket(
  db: Db,
  globalEventId: string,
  realQuestion: string,
  realResolutionDate?: string,
  realResolutionSource?: string,
): Promise<MatchResult | null> {
  // Embed the real market question
  const realEmbedding = await embed(realQuestion);

  // Search ghost markets for similarity
  const matches = await findSimilar(db, realEmbedding, SIMILARITY_THRESHOLD);
  if (matches.length === 0) return null;

  const best = matches[0];
  const ghost = best.ghost;

  // Run resolution risk check
  const resolutionRisk = await checkResolutionRisk(
    ghost.question,
    ghost.resolutionDate,
    ghost.resolutionSource,
    realQuestion,
    realResolutionDate,
    realResolutionSource,
  );

  // Bind ghost → globalEventId
  await db.collection("ghost_markets").updateOne(
    { _id: ghost._id as any },
    {
      $set: {
        status: "matched",
        globalEventId,
        resolutionRisk,
        matchedAt: Date.now(),
        similarityScore: best.score,
      },
    },
  );

  // Write resolutionRisk back to GlobalEvent
  await db.collection("global_events").updateOne(
    { globalEventId },
    { $set: { resolutionRisk } },
  );

  console.log(
    `[GhostMatcher] Matched "${realQuestion.slice(0, 60)}" → ghost "${ghost.question.slice(0, 60)}" ` +
    `(score: ${best.score.toFixed(3)}, risk: ${resolutionRisk.level})`,
  );

  return {
    ghostId: String(ghost._id),
    question: ghost.question,
    similarityScore: best.score,
    resolutionRisk,
  };
}
