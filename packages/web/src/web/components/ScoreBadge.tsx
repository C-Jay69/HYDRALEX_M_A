import { getRiskColor, getRiskBg, getRiskBorder, getRiskLabel } from "../lib/utils";

interface ScoreBadgeProps {
  score: number | null | undefined;
  size?: "sm" | "md" | "lg";
  showLabel?: boolean;
}

export default function ScoreBadge({ score, size = "md", showLabel = false }: ScoreBadgeProps) {
  const color = getRiskColor(score);
  const bg = getRiskBg(score);
  const border = getRiskBorder(score);
  const label = getRiskLabel(score);

  const sizes = {
    sm: { fontSize: "12px", padding: "2px 8px", fontWeight: 600 },
    md: { fontSize: "13px", padding: "3px 10px", fontWeight: 600 },
    lg: { fontSize: "28px", padding: "10px 20px", fontWeight: 700 },
  };

  const s = sizes[size];

  return (
    <div style={{ display: "flex", alignItems: "center", gap: "8px", flexWrap: "wrap" }}>
      <span
        style={{
          background: bg,
          border: `1px solid ${border}`,
          color,
          borderRadius: "5px",
          fontFamily: "Poppins, sans-serif",
          ...s,
        }}
      >
        {score != null ? `${score}/100` : "—"}
      </span>
      {showLabel && score != null && (
        <span style={{ color, fontSize: "12px", fontWeight: 500 }}>
          {label}
        </span>
      )}
    </div>
  );
}
