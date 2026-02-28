"use client";

interface SparklineProps {
    data: number[];
    width?: number;
    height?: number;
    color?: string;
    strokeWidth?: number;
}

export function Sparkline({
    data,
    width = 80,
    height = 24,
    color = "#22c55e",
    strokeWidth = 1.5,
}: SparklineProps) {
    if (!data || data.length < 2) {
        return (
            <span className="text-terminal-muted font-mono text-xs">—</span>
        );
    }

    const padding = 2;
    const drawW = width - padding * 2;
    const drawH = height - padding * 2;

    const min = Math.min(...data);
    const max = Math.max(...data);
    const range = max - min || 1;

    const points = data.map((v, i) => {
        const x = padding + (i / (data.length - 1)) * drawW;
        const y = padding + drawH - ((v - min) / range) * drawH;
        return `${x.toFixed(1)},${y.toFixed(1)}`;
    });

    // Determine trend color: green if last > first, red if down, muted if flat
    const trend = data[data.length - 1] - data[0];
    const lineColor = trend > 0 ? "#22c55e" : trend < 0 ? "#ef4444" : color;

    // Gradient fill under the line
    const fillPoints = [
        `${padding},${height - padding}`,
        ...points,
        `${width - padding},${height - padding}`,
    ];

    return (
        <svg
            width={width}
            height={height}
            viewBox={`0 0 ${width} ${height}`}
            className="inline-block"
            style={{ verticalAlign: "middle" }}
        >
            <defs>
                <linearGradient id={`grad-${lineColor.replace("#", "")}`} x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor={lineColor} stopOpacity={0.25} />
                    <stop offset="100%" stopColor={lineColor} stopOpacity={0} />
                </linearGradient>
            </defs>
            {/* Area fill */}
            <polygon
                points={fillPoints.join(" ")}
                fill={`url(#grad-${lineColor.replace("#", "")})`}
            />
            {/* Line */}
            <polyline
                points={points.join(" ")}
                fill="none"
                stroke={lineColor}
                strokeWidth={strokeWidth}
                strokeLinecap="round"
                strokeLinejoin="round"
            />
            {/* End dot */}
            <circle
                cx={parseFloat(points[points.length - 1].split(",")[0])}
                cy={parseFloat(points[points.length - 1].split(",")[1])}
                r={2}
                fill={lineColor}
            />
        </svg>
    );
}
