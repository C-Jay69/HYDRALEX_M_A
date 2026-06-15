export function getRiskColor(score: number | null | undefined): string {
  if (score == null) return "var(--text-muted)";
  if (score >= 90) return "var(--risk-low)";
  if (score >= 75) return "var(--risk-moderate)";
  if (score >= 50) return "var(--risk-high)";
  return "var(--risk-critical)";
}

export function getRiskBg(score: number | null | undefined): string {
  if (score == null) return "rgba(84,93,114,0.15)";
  if (score >= 90) return "rgba(34,197,94,0.12)";
  if (score >= 75) return "rgba(234,179,8,0.12)";
  if (score >= 50) return "rgba(249,115,22,0.12)";
  return "rgba(239,68,68,0.12)";
}

export function getRiskBorder(score: number | null | undefined): string {
  if (score == null) return "rgba(84,93,114,0.3)";
  if (score >= 90) return "rgba(34,197,94,0.3)";
  if (score >= 75) return "rgba(234,179,8,0.3)";
  if (score >= 50) return "rgba(249,115,22,0.3)";
  return "rgba(239,68,68,0.3)";
}

export function formatDate(date: Date | string | number | null): string {
  if (!date) return "";
  return new Date(typeof date === "number" ? date * 1000 : date).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function getRiskLabel(score: number | null | undefined): string {
  if (score == null) return "Unknown";
  if (score >= 90) return "Low Risk";
  if (score >= 75) return "Moderate-Low Risk";
  if (score >= 50) return "High Risk";
  return "Critical Risk";
}
