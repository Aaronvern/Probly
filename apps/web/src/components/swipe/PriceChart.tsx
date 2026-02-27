"use client";

interface PriceChartProps {
  marketId: string;
  currentPrice: number; // 0-1
  height?: number;
}

function seededRand(seed: string) {
  let h = 0;
  for (let i = 0; i < seed.length; i++) {
    h = Math.imul(31, h) + seed.charCodeAt(i) | 0;
  }
  return () => {
    h ^= h >>> 16;
    h = Math.imul(h, 0x45d9f3b) | 0;
    h ^= h >>> 16;
    return (h >>> 0) / 0xffffffff;
  };
}

function generateHistory(marketId: string, endPrice: number, points = 80): number[] {
  const rand = seededRand(marketId);
  let price = rand() * 0.5 + 0.05;
  const prices: number[] = [price];
  for (let i = 1; i < points - 1; i++) {
    const noise = (rand() - 0.5) * 0.055;
    const pull = (endPrice - price) * 0.04;
    price = Math.max(0.01, Math.min(0.99, price + noise + pull));
    prices.push(price);
  }
  prices.push(endPrice);
  return prices;
}

const W = 400;
const H = 200;
const PAD_LEFT = 8;
const PAD_RIGHT = 36;
const PAD_TOP = 8;
const PAD_BOTTOM = 24;
const CW = W - PAD_LEFT - PAD_RIGHT;
const CH = H - PAD_TOP - PAD_BOTTOM;

const GRID_LINES = [0, 0.25, 0.5, 0.75, 1];
const MONTHS = ["Jan", "Feb"];

export function PriceChart({ marketId, currentPrice, height }: PriceChartProps) {
  const prices = generateHistory(marketId, currentPrice);

  const toX = (i: number) => PAD_LEFT + (i / (prices.length - 1)) * CW;
  const toY = (p: number) => PAD_TOP + (1 - p) * CH;

  const points = prices.map((p, i) => `${toX(i)},${toY(p)}`).join(" ");

  // Area fill path
  const areaPoints = [
    `${toX(0)},${toY(0)}`,
    ...prices.map((p, i) => `${toX(i)},${toY(p)}`),
    `${toX(prices.length - 1)},${toY(0)}`,
  ].join(" ");

  return (
    <svg
      viewBox={`0 0 ${W} ${H}`}
      preserveAspectRatio="none"
      style={{ width: "100%", height: height ?? "100%" }}
      className="block"
    >
      {/* Horizontal dotted gridlines */}
      {GRID_LINES.map((g) => (
        <line
          key={g}
          x1={PAD_LEFT}
          y1={toY(g)}
          x2={W - PAD_RIGHT}
          y2={toY(g)}
          stroke="#2D2D3E"
          strokeDasharray="3 6"
          strokeWidth="0.8"
        />
      ))}

      {/* Y-axis labels */}
      {GRID_LINES.map((g) => (
        <text
          key={g}
          x={W - PAD_RIGHT + 4}
          y={toY(g) + 3.5}
          fontSize="10"
          fill="#475569"
          fontFamily="monospace"
        >
          {Math.round(g * 100)}%
        </text>
      ))}

      {/* X-axis month labels */}
      {MONTHS.map((m, i) => (
        <text
          key={m}
          x={PAD_LEFT + (i / (MONTHS.length - 1)) * CW}
          y={H - 4}
          fontSize="10"
          fill="#475569"
          fontFamily="monospace"
          textAnchor={i === 0 ? "start" : "end"}
        >
          {m}
        </text>
      ))}

      {/* Area fill */}
      <polygon
        points={areaPoints}
        fill="url(#areaGrad)"
        opacity="0.15"
      />

      {/* Price line */}
      <polyline
        points={points}
        fill="none"
        stroke="white"
        strokeWidth="1.5"
        strokeLinejoin="round"
        strokeLinecap="round"
      />

      {/* Current price dot */}
      <circle
        cx={toX(prices.length - 1)}
        cy={toY(currentPrice)}
        r="3"
        fill="white"
      />

      <defs>
        <linearGradient id="areaGrad" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="white" stopOpacity="0.8" />
          <stop offset="100%" stopColor="white" stopOpacity="0" />
        </linearGradient>
      </defs>
    </svg>
  );
}
