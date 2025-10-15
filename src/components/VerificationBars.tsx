interface VerificationBarsProps {
  verifiedLevel1: number;
  verifiedLevel2: number;
  verifiedLevel3: number;
  verifiedLevel4: number;
  verifiedLevel5: number;
}

export function VerificationBars({
  verifiedLevel1,
  verifiedLevel2,
  verifiedLevel3,
  verifiedLevel4,
  verifiedLevel5,
}: VerificationBarsProps) {
  const total = verifiedLevel1 + verifiedLevel2 + verifiedLevel3 + verifiedLevel4 + verifiedLevel5;

  // Define colors for each level (easy to hard: green → yellow → orange → red → dark red)
  const levelColors = [
    "#10b981", // green-500 - Easiest (L1)
    "#84cc16", // lime-500
    "#eab308", // yellow-500 - Medium
    "#f97316", // orange-500
    "#dc2626", // red-600 - Hardest (L5)
  ];

  if (total === 0) {
    return (
      <div className="space-y-1">
        <div className="flex items-center justify-between text-xs text-muted-foreground">
          <span>Verified distribution</span>
          <span>0 questions</span>
        </div>
        <div className="relative h-2 w-full overflow-hidden rounded-full bg-muted" />
        <div className="flex items-center gap-2 text-[11px] text-muted-foreground flex-wrap">
          {levelColors.map((color, i) => (
            <span key={i} className="inline-flex items-center gap-1">
              <span className="inline-block h-2 w-2 rounded-full" style={{ backgroundColor: color }} /> L{i + 1}
            </span>
          ))}
        </div>
      </div>
    );
  }

  const levels = [verifiedLevel1, verifiedLevel2, verifiedLevel3, verifiedLevel4, verifiedLevel5];
  const percentages = levels.map(level => Math.round((level / total) * 100));

  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between text-xs text-muted-foreground">
        <span>Verified distribution</span>
        <span>{total} questions</span>
      </div>
      <div className="relative h-2 w-full overflow-hidden rounded-full bg-muted">
        {levels.map((level, index) => {
          const leftOffset = percentages.slice(0, index).reduce((sum, pct) => sum + pct, 0);
          return level > 0 ? (
            <div
              key={index}
              className="absolute top-0 h-full"
              style={{
                left: `${leftOffset}%`,
                width: `${percentages[index]}%`,
                backgroundColor: levelColors[index],
              }}
              aria-label={`Level ${index + 1}: ${percentages[index]}%`}
            />
          ) : null;
        })}
      </div>
      <div className="flex items-center gap-2 text-[11px] text-muted-foreground flex-wrap">
        {levels.map((level, index) => (
          <span key={index} className="inline-flex items-center gap-1">
            <span className="inline-block h-2 w-2 rounded-full" style={{ backgroundColor: levelColors[index] }} /> L{index + 1}: {level}
          </span>
        ))}
      </div>
    </div>
  );
}
