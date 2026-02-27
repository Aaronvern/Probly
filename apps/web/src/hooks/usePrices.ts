"use client";

import { useState, useEffect, useCallback } from "react";
import { getPrices, type MarketPrice } from "@/lib/api";

export function usePrices(intervalMs = 2000) {
  const [markets, setMarkets] = useState<MarketPrice[]>([]);
  const [updatedAt, setUpdatedAt] = useState<number>(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetch = useCallback(async () => {
    try {
      const data = await getPrices();
      setMarkets(data.markets);
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
