interface VerificationBarsProps {
  verifiedLevel1: number;
  verifiedLevel2: number;
  verifiedLevel3: number;
}

export function VerificationBars({
  verifiedLevel1,
  verifiedLevel2,
  verifiedLevel3,
}: VerificationBarsProps) {
  const total = verifiedLevel1 + verifiedLevel2 + verifiedLevel3;

  if (total === 0) {
    return (
      <div className="space-y-1">
        <div className="flex items-center justify-between text-xs text-muted-foreground">
          <span>Verified distribution</span>
          <span>0 questions</span>
        </div>
        <div className="relative h-2 w-full overflow-hidden rounded-full bg-muted" />
        <div className="flex items-center gap-3 text-[11px] text-muted-foreground">
          <span className="inline-block h-2 w-2 rounded-full bg-accent" /> L1
          <span className="inline-block h-2 w-2 rounded-full bg-primary" /> L2
          <span
            className="inline-block h-2 w-2 rounded-full"
            style={{ backgroundColor: "color-mix(in oklab, var(--accent), var(--primary))" }}
          />{" "}
          L3
        </div>
      </div>
    );
  }

  const l1Pct = Math.round((verifiedLevel1 / total) * 100);
  const l2Pct = Math.round((verifiedLevel2 / total) * 100);
  const l3Pct = Math.round((verifiedLevel3 / total) * 100);

  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between text-xs text-muted-foreground">
        <span>Verified distribution</span>
        <span>{total} questions</span>
      </div>
      <div className="relative h-2 w-full overflow-hidden rounded-full bg-muted">
        <div
          className="absolute left-0 top-0 h-full bg-accent"
          style={{ width: `${l1Pct}%` }}
          aria-label={`Level 1: ${l1Pct}%`}
        />
        <div
          className="absolute top-0 h-full bg-primary"
          style={{ left: `${l1Pct}%`, width: `${l2Pct}%` }}
          aria-label={`Level 2: ${l2Pct}%`}
        />
        <div
          className="absolute top-0 h-full"
          style={{
            left: `${l1Pct + l2Pct}%`,
            width: `${l3Pct}%`,
            backgroundColor: "color-mix(in oklab, var(--accent), var(--primary))",
          }}
          aria-label={`Level 3: ${l3Pct}%`}
        />
      </div>
      <div className="flex items-center gap-3 text-[11px] text-muted-foreground">
        <span className="inline-flex items-center gap-1">
          <span className="inline-block h-2 w-2 rounded-full bg-accent" /> L1: {verifiedLevel1}
        </span>
        <span className="inline-flex items-center gap-1">
          <span className="inline-block h-2 w-2 rounded-full bg-primary" /> L2: {verifiedLevel2}
        </span>
        <span className="inline-flex items-center gap-1">
          <span
            className="inline-block h-2 w-2 rounded-full"
            style={{ backgroundColor: "color-mix(in oklab, var(--accent), var(--primary))" }}
          />{" "}
          L3: {verifiedLevel3}
        </span>
      </div>
    </div>
  );
}
