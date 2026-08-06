import type { RatioYearValue } from "@/lib/ratios";

const WIDTH = 72;
const HEIGHT = 24;
const PAD = 3;

export function Sparkline({ years }: { years: RatioYearValue[] }) {
  const points = years
    .filter((y) => y.value !== null)
    .map((y) => ({ fiscalYear: y.fiscalYear, value: y.value as number }));

  if (points.length < 2) {
    return (
      <svg width={WIDTH} height={HEIGHT} aria-hidden="true">
        <line
          x1={PAD}
          y1={HEIGHT / 2}
          x2={WIDTH - PAD}
          y2={HEIGHT / 2}
          stroke="var(--border)"
          strokeWidth={2}
          strokeDasharray="2 3"
        />
      </svg>
    );
  }

  const values = points.map((p) => p.value);
  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = max - min || 1;

  const coords = points.map((p, i) => {
    const x = PAD + (i / (points.length - 1)) * (WIDTH - PAD * 2);
    const y = HEIGHT - PAD - ((p.value - min) / range) * (HEIGHT - PAD * 2);
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  });

  const last = coords[coords.length - 1].split(",").map(Number);

  return (
    <svg
      width={WIDTH}
      height={HEIGHT}
      role="img"
      aria-label={`Trend across ${points.map((p) => p.fiscalYear).join(", ")}`}
    >
      <polyline points={coords.join(" ")} fill="none" stroke="var(--accent)" strokeWidth={1.5} />
      <circle cx={last[0]} cy={last[1]} r={2} fill="var(--accent)" />
    </svg>
  );
}
