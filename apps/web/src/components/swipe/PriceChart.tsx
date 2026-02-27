"use client";

interface PriceChartProps {
  marketId: string;
  currentPrice: number; // 0-1
  height?: number | string;
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

const GRID_LINES = [1, 0.75, 0.5, 0.25, 0];
const PAD_RIGHT_PCT = 10; // % of width reserved for labels

export function PriceChart({ marketId, currentPrice, height = "100%" }: PriceChartProps) {
  const prices = generateHistory(marketId, currentPrice);

  // Build SVG polyline using 0-100 coordinate space (no padding in SVG itself)
  const toX = (i: number) => (i / (prices.length - 1)) * 100;
  const toY = (p: number) => (1 - p) * 100;

  const points = prices.map((p, i) => `${toX(i)},${toY(p)}`).join(" ");

  const areaPoints = [
    `0,100`,
    ...prices.map((p, i) => `${toX(i)},${toY(p)}`),
    `100,100`,
  ].join(" ");

  return (
    <div className="relative w-full" style={{ height }}>
      {/* Y-axis labels — plain HTML, never stretched */}
      <div className="absolute top-0 right-0 bottom-6 flex flex-col justify-between items-end pr-1 z-10" style={{ width: `${PAD_RIGHT_PCT}%` }}>
        {GRID_LINES.map((g) => (
          <span key={g} className="text-[10px] text-[#475569] font-mono leading-none">
            {Math.round(g * 100)}%
          </span>
        ))}
      </div>

      {/* X-axis labels */}
      <div className="absolute bottom-0 left-0 right-[10%] flex justify-between px-0 z-10">
        <span className="text-[10px] text-[#475569] font-mono">Jan</span>
        <span className="text-[10px] text-[#475569] font-mono">Feb</span>
      </div>

      {/* SVG chart — stretched to fill, labels are outside */}
      <div className="absolute inset-0 right-[10%] bottom-6">
        <svg
          viewBox="0 0 100 100"
          preserveAspectRatio="none"
          className="w-full h-full block"
        >
          {/* Horizontal dotted gridlines */}
          {GRID_LINES.map((g) => (
            <line
              key={g}
              x1="0" y1={toY(g)}
              x2="100" y2={toY(g)}
              stroke="#2D2D3E"
              strokeDasharray="1.5 3"
              strokeWidth="0.4"
              vectorEffect="non-scaling-stroke"
            />
          ))}

          {/* Area fill */}
          <polygon
            points={areaPoints}
            fill="url(#areaGrad)"
            opacity="0.12"
          />

          {/* Price line */}
          <polyline
            points={points}
            fill="none"
            stroke="white"
            strokeWidth="1.5"
            vectorEffect="non-scaling-stroke"
            strokeLinejoin="round"
            strokeLinecap="round"
          />

          {/* Current price dot */}
          <circle
            cx={toX(prices.length - 1)}
            cy={toY(currentPrice)}
            r="2.5"
            fill="white"
            vectorEffect="non-scaling-stroke"
          />

          <defs>
            <linearGradient id="areaGrad" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="white" stopOpacity="1" />
              <stop offset="100%" stopColor="white" stopOpacity="0" />
            </linearGradient>
          </defs>
        </svg>
      </div>
    </div>
  );
}
