interface VerificationBarsProps {
  verifiedLevel1: number;
  verifiedLevel2: number;
  verifiedLevel3: number;
  verifiedLevel4: number;
  verifiedLevel5: number;
  unverifiedLevel1: number;
  unverifiedLevel2: number;
  unverifiedLevel3: number;
  unverifiedLevel4: number;
  unverifiedLevel5: number;
}

export function VerificationBars({
  verifiedLevel1,
  verifiedLevel2,
  verifiedLevel3,
  verifiedLevel4,
  verifiedLevel5,
  unverifiedLevel1,
  unverifiedLevel2,
  unverifiedLevel3,
  unverifiedLevel4,
  unverifiedLevel5,
}: VerificationBarsProps) {
  const verifiedLevels = [verifiedLevel1, verifiedLevel2, verifiedLevel3, verifiedLevel4, verifiedLevel5];
  const unverifiedLevels = [unverifiedLevel1, unverifiedLevel2, unverifiedLevel3, unverifiedLevel4, unverifiedLevel5];
  const totalLevels = verifiedLevels.map((verified, index) => verified + unverifiedLevels[index]);

  const totalVerified = verifiedLevels.reduce((sum, level) => sum + level, 0);
  const grandTotal = totalLevels.reduce((sum, level) => sum + level, 0);

  // Define colors for each level (easy to hard: green → yellow → orange → red → dark red)
  const levelColors = [
    "#10b981", // green-500 - Easiest (L1)
    "#84cc16", // lime-500
    "#eab308", // yellow-500 - Medium
    "#f97316", // orange-500
    "#dc2626", // red-600 - Hardest (L5)
  ];

  if (grandTotal === 0) {
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
              <span className="inline-block h-2 w-2 rounded-full" style={{ backgroundColor: color }} /> L{i + 1}: 0/0
            </span>
          ))}
        </div>
      </div>
    );
  }

  const percentages = totalVerified > 0
    ? verifiedLevels.map(level => Math.round((level / totalVerified) * 100))
    : [0, 0, 0, 0, 0];

  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between text-xs text-muted-foreground">
        <span>Verified distribution</span>
        <span>{totalVerified}/{grandTotal} questions</span>
      </div>
      <div className="relative h-2 w-full overflow-hidden rounded-full bg-muted">
        {verifiedLevels.map((level, index) => {
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
        {verifiedLevels.map((verified, index) => (
          <span key={index} className="inline-flex items-center gap-1">
            <span className="inline-block h-2 w-2 rounded-full" style={{ backgroundColor: levelColors[index] }} /> L{index + 1}: {verified}/{totalLevels[index]}
          </span>
        ))}
      </div>
    </div>
  );
}
