interface Props {
  data: number[];
  width?: number;
  height?: number;
}

export function Sparkline({ data, width = 120, height = 36 }: Props) {
  if (data.length < 2) return null;

  const min = Math.min(...data);
  const max = Math.max(...data);
  const flat = max - min === 0;
  const range = max - min || 1;
  const stepX = width / (data.length - 1);

  const points = data.map((v, i) => {
    const x = i * stepX;
    // For a perfectly flat series (e.g. a UPS pinned at 100%), draw the line
    // through the vertical middle instead of pinned to the bottom edge.
    const y = flat ? height / 2 : height - ((v - min) / range) * (height - 4) - 2;
    return [x, y] as const;
  });

  const line = points.map(([x, y], i) => `${i === 0 ? 'M' : 'L'}${x.toFixed(1)} ${y.toFixed(1)}`).join(' ');
  const area = `${line} L${width} ${height} L0 ${height} Z`;
  const gid = `spark-${Math.round(min)}-${Math.round(max)}-${data.length}`;

  return (
    <svg className="sparkline" viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="none" aria-hidden>
      <defs>
        <linearGradient id={gid} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="var(--spark-color, #ff6b35)" stopOpacity="0.32" />
          <stop offset="100%" stopColor="var(--spark-color, #ff6b35)" stopOpacity="0" />
        </linearGradient>
      </defs>
      <path d={area} fill={`url(#${gid})`} />
      <path d={line} fill="none" stroke="var(--spark-color, #ff6b35)" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
