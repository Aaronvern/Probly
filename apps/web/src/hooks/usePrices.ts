"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { getPrices, type MarketPrice } from "@/lib/api";

export function usePrices(intervalMs = 10000) {
  const [markets, setMarkets] = useState<MarketPrice[]>([]);
  const [updatedAt, setUpdatedAt] = useState<number>(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const orderRef = useRef<string[]>([]);

  const fetch = useCallback(async () => {
    try {
      const data = await getPrices();
      setMarkets(prev => {
        // Preserve row order from first load — only update values, don't re-sort
        if (prev.length === 0) {
          orderRef.current = data.markets.map((m: MarketPrice) => m.globalEventId);
          return data.markets;
        }
        const incoming = new Map(data.markets.map((m: MarketPrice) => [m.globalEventId, m]));
        const updated = orderRef.current
          .map(id => incoming.get(id))
          .filter(Boolean) as MarketPrice[];
        // Append any genuinely new markets at the bottom
        data.markets.forEach((m: MarketPrice) => {
          if (!orderRef.current.includes(m.globalEventId)) {
            orderRef.current.push(m.globalEventId);
            updated.push(m);
          }
        });
        return updated;
      });
      setUpdatedAt(data.updatedAt);
      setError(null);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetch();
    const id = setInterval(fetch, intervalMs);
    return () => clearInterval(id);
  }, [fetch, intervalMs]);

  const arbMarkets = markets.filter((m) => m.hasArb);
  const wsMarkets = markets.filter((m) => m.dataSource === "ws").length;

  return { markets, arbMarkets, updatedAt, loading, error, wsMarkets };
}
