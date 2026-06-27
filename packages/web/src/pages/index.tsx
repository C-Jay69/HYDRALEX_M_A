import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Link } from "wouter";
import { api } from "../lib/api";
import { formatDate, getRiskColor } from "../lib/utils";
import ScoreBadge from "../components/ScoreBadge";
import { authClient } from "../lib/auth";
import { useCustomer } from "autumn-js/react";
import {
  FilePlus,
  FileText,
  Trash2,
  BarChart3,
  CheckCircle,
  Loader,
  Scale,
  LogIn,
  Zap,
} from "lucide-react";

export default function DashboardPage() {
  const queryClient = useQueryClient();
  const { data: session } = authClient.useSession();
  const { data: customer } = useCustomer();

  const { data, isLoading } = useQuery({
    queryKey: ["analyses"],
    queryFn: async () => {
      const res = await api.analyses.$get();
      return res.json();
    },
    refetchInterval: (query) => {
      const list = (query.state.data as any)?.analyses ?? [];
      const hasActive = list.some((a: any) => a.status === "analyzing");
      return hasActive ? 3000 : false;
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: number) => {
      const res = await api.analyses[":id"].$delete({ param: { id: String(id) } });
      return res.json();
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["analyses"] }),
  });

  const analyses = (data as any)?.analyses ?? [];
  const completed = analyses.filter((a: any) => a.status === "complete");
  const avgScore =
    completed.length > 0
      ? Math.round(
          completed.reduce((s: number, a: any) => s + (a.score ?? 0), 0) /
            completed.length
        )
      : null;

  // Quota from Autumn
  const analysesBalance = (customer as any)?.features?.analyses;
  const quotaUnlimited = analysesBalance?.unlimited === true;
  const quotaRemaining = quotaUnlimited ? null : (analysesBalance?.balance ?? null);
  const quotaGranted = quotaUnlimited ? null : (analysesBalance?.included ?? analysesBalance?.limit ?? null);
  const quotaUsed =
    quotaRemaining !== null && quotaGranted !== null
      ? Math.max(0, quotaGranted - quotaRemaining)
      : null;
  const quotaPct =
    quotaGranted != null && quotaGranted > 0
      ? Math.min(100, Math.round(((quotaUsed ?? 0) / quotaGranted) * 100))
      : 0;
  const quotaLow = !quotaUnlimited && quotaRemaining !== null && quotaRemaining <= 1;

  return (
    <div style={{ padding: "32px", maxWidth: "1100px", margin: "0 auto" }}>
      {/* Header */}
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "flex-start",
          marginBottom: "32px",
        }}
      >
        <div>
          <h1
            style={{
              fontFamily: "Poppins, sans-serif",
              fontSize: "1.6rem",
              fontWeight: 700,
              color: "var(--text-primary)",
              marginBottom: "4px",
            }}
          >
            Contract Analyses
          </h1>
          <p style={{ color: "var(--text-muted)", fontSize: "13px" }}>
            Multi-agent M&A contract risk assessment platform
          </p>
        </div>
        <Link to="/analyze">
          <button
            style={{
              display: "flex",
              alignItems: "center",
              gap: "8px",
              background: "var(--accent-gold)",
              color: "#0a0d14",
              border: "none",
              borderRadius: "6px",
              padding: "10px 18px",
              fontFamily: "Poppins, sans-serif",
              fontWeight: 600,
              fontSize: "13px",
              cursor: "pointer",
            }}
          >
            <FilePlus size={15} />
            New Analysis
          </button>
        </Link>
      </div>

      {/* Quota meter — only when logged in */}
      {session && (
        <div
          style={{
            background: "var(--bg-secondary)",
            border: `1px solid ${quotaLow ? "rgba(239,68,68,0.4)" : "var(--border)"}`,
            borderRadius: "8px",
            padding: "14px 20px",
            marginBottom: "20px",
            display: "flex",
            alignItems: "center",
            gap: "16px",
          }}
        >
          <Zap
            size={16}
            color={quotaLow ? "var(--risk-critical)" : "var(--accent-gold)"}
            style={{ flexShrink: 0 }}
          />
          <div style={{ flex: 1 }}>
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "baseline",
                marginBottom: "6px",
              }}
            >
              <span style={{ fontSize: "12px", color: "var(--text-muted)", fontWeight: 500 }}>
                Monthly Analyses
              </span>
              {quotaUnlimited ? (
                <span style={{ fontSize: "12px", color: "var(--risk-low)", fontWeight: 600 }}>
                  Unlimited
                </span>
              ) : quotaGranted !== null ? (
                <span
                  style={{
                    fontSize: "12px",
                    fontWeight: 600,
                    color: quotaLow ? "var(--risk-critical)" : "var(--text-secondary)",
                  }}
                >
                  {quotaRemaining} remaining of {quotaGranted}
                </span>
              ) : (
                <span style={{ fontSize: "12px", color: "var(--text-muted)" }}>Loading…</span>
              )}
            </div>
            {!quotaUnlimited && quotaGranted != null && (
              <div
                style={{
                  height: "4px",
                  borderRadius: "2px",
                  background: "var(--border)",
                  overflow: "hidden",
                }}
              >
                <div
                  style={{
                    height: "100%",
                    width: `${quotaPct}%`,
                    background: quotaLow
                      ? "var(--risk-critical)"
                      : quotaPct > 70
                      ? "var(--risk-medium)"
                      : "var(--accent-gold)",
                    borderRadius: "2px",
                    transition: "width 0.4s ease",
                  }}
                />
              </div>
            )}
          </div>
          {quotaLow && (
            <Link to="/pricing">
              <button
                style={{
                  background: "rgba(239,68,68,0.1)",
                  border: "1px solid rgba(239,68,68,0.3)",
                  color: "var(--risk-critical)",
                  borderRadius: "6px",
                  padding: "5px 12px",
                  fontSize: "11px",
                  fontWeight: 600,
                  cursor: "pointer",
                  whiteSpace: "nowrap",
                  fontFamily: "Poppins, sans-serif",
                }}
              >
                Upgrade
              </button>
            </Link>
          )}
        </div>
      )}

      {/* Stats Row */}
      {analyses.length > 0 && (
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(3, 1fr)",
            gap: "16px",
            marginBottom: "28px",
          }}
        >
          {[
            {
              label: "Total Analyses",
              value: analyses.length,
              icon: FileText,
              color: "var(--text-secondary)",
            },
            {
              label: "Completed",
              value: completed.length,
              icon: CheckCircle,
              color: "var(--risk-low)",
            },
            {
              label: "Avg Risk Score",
              value: avgScore != null ? `${avgScore}/100` : "—",
              icon: BarChart3,
              color: getRiskColor(avgScore),
            },
          ].map(({ label, value, icon: Icon, color }) => (
            <div
              key={label}
              style={{
                background: "var(--bg-secondary)",
                border: "1px solid var(--border)",
                borderRadius: "8px",
                padding: "16px 20px",
                display: "flex",
                alignItems: "center",
                gap: "14px",
              }}
            >
              <Icon size={20} color={color} />
              <div>
                <div
                  style={{
                    fontFamily: "Poppins, sans-serif",
                    fontSize: "1.3rem",
                    fontWeight: 700,
                    color,
                  }}
                >
                  {value}
                </div>
                <div style={{ fontSize: "11px", color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.06em" }}>
                  {label}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Table / Empty states */}
      {isLoading ? (
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            height: "200px",
            gap: "12px",
            color: "var(--text-muted)",
          }}
        >
          <Loader size={18} className="spinner" />
          Loading...
        </div>
      ) : !session ? (
        /* Not signed in — show sign-in nudge */
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            height: "300px",
            gap: "16px",
            color: "var(--text-muted)",
            background: "var(--bg-secondary)",
            border: "1px solid var(--border)",
            borderRadius: "10px",
          }}
        >
          <LogIn size={40} color="var(--border-light)" />
          <div style={{ textAlign: "center" }}>
            <p
              style={{
                fontFamily: "Poppins, sans-serif",
                fontWeight: 600,
                color: "var(--text-secondary)",
                marginBottom: "6px",
              }}
            >
              Sign in to view your analyses
            </p>
            <p style={{ fontSize: "13px" }}>
              Your past reviews are saved to your account
            </p>
          </div>
          <div style={{ display: "flex", gap: "10px" }}>
            <Link to="/sign-in">
              <button
                style={{
                  background: "var(--accent-gold)",
                  border: "none",
                  color: "#0a0d14",
                  borderRadius: "6px",
                  padding: "8px 18px",
                  cursor: "pointer",
                  fontFamily: "Poppins, sans-serif",
                  fontWeight: 600,
                  fontSize: "13px",
                }}
              >
                Sign In
              </button>
            </Link>
            <Link to="/analyze">
              <button
                style={{
                  background: "var(--accent-gold-bg)",
                  border: "1px solid rgba(212,168,67,0.3)",
                  color: "var(--accent-gold)",
                  borderRadius: "6px",
                  padding: "8px 16px",
                  cursor: "pointer",
                  fontFamily: "Poppins, sans-serif",
                  fontWeight: 500,
                  fontSize: "13px",
                }}
              >
                Try without account
              </button>
            </Link>
          </div>
        </div>
      ) : analyses.length === 0 ? (
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            height: "300px",
            gap: "16px",
            color: "var(--text-muted)",
            background: "var(--bg-secondary)",
            border: "1px solid var(--border)",
            borderRadius: "10px",
          }}
        >
          <Scale size={40} color="var(--border-light)" />
          <div style={{ textAlign: "center" }}>
            <p style={{ fontFamily: "Poppins, sans-serif", fontWeight: 600, color: "var(--text-secondary)", marginBottom: "6px" }}>
              No analyses yet
            </p>
            <p style={{ fontSize: "13px" }}>Upload your first M&A contract to get started</p>
          </div>
          <Link to="/analyze">
            <button
              style={{
                background: "var(--accent-gold-bg)",
                border: "1px solid rgba(212,168,67,0.3)",
                color: "var(--accent-gold)",
                borderRadius: "6px",
                padding: "8px 16px",
                cursor: "pointer",
                fontFamily: "Poppins, sans-serif",
                fontWeight: 500,
                fontSize: "13px",
              }}
            >
              Start First Analysis
            </button>
          </Link>
        </div>
      ) : (
        <div
          style={{
            background: "var(--bg-secondary)",
            border: "1px solid var(--border)",
            borderRadius: "10px",
            overflow: "hidden",
          }}
        >
          {/* Table header */}
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "1fr 130px 200px 120px 36px",
              gap: "16px",
              padding: "10px 20px",
              borderBottom: "1px solid var(--border)",
              fontSize: "10px",
              color: "var(--text-muted)",
              textTransform: "uppercase",
              letterSpacing: "0.08em",
              fontWeight: 600,
            }}
          >
            <span>Contract</span>
            <span>Score</span>
            <span>Recommendation</span>
            <span>Date</span>
            <span></span>
          </div>

          {analyses.map((a: any, i: number) => {
            const isAnalyzing = a.status === "analyzing";
            const isError = a.status === "error";

            return (
              <div
                key={a.id}
                style={{
                  display: "grid",
                  gridTemplateColumns: "1fr 130px 200px 120px 36px",
                  gap: "16px",
                  padding: "14px 20px",
                  borderBottom:
                    i < analyses.length - 1
                      ? "1px solid var(--border)"
                      : "none",
                  alignItems: "center",
                  transition: "background 0.15s",
                }}
                onMouseEnter={(e) => {
                  if (a.status === "complete")
                    (e.currentTarget as HTMLElement).style.background =
                      "var(--bg-tertiary)";
                }}
                onMouseLeave={(e) => {
                  (e.currentTarget as HTMLElement).style.background =
                    "transparent";
                }}
              >
                {/* Filename — links to report when complete */}
                <Link
                  to={a.status === "complete" ? `/reports/${a.id}` : "#"}
                  style={{ display: "flex", alignItems: "center", gap: "10px", minWidth: 0, textDecoration: "none" }}
                >
                  <FileText size={15} color="var(--text-muted)" style={{ flexShrink: 0 }} />
                  <div style={{ minWidth: 0 }}>
                    <div
                      style={{
                        color: "var(--text-primary)",
                        fontWeight: 500,
                        fontSize: "13px",
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                        whiteSpace: "nowrap",
                      }}
                    >
                      {a.filename ?? "Untitled"}
                    </div>
                    {isAnalyzing && (
                      <div
                        style={{
                          display: "flex",
                          alignItems: "center",
                          gap: "5px",
                          color: "var(--accent-gold)",
                          fontSize: "11px",
                          marginTop: "2px",
                        }}
                      >
                        <span
                          style={{
                            width: "6px",
                            height: "6px",
                            borderRadius: "50%",
                            background: "var(--accent-gold)",
                          }}
                          className="animate-pulse-dot"
                        />
                        Analyzing...
                      </div>
                    )}
                    {isError && (
                      <div style={{ color: "var(--risk-critical)", fontSize: "11px", marginTop: "2px" }}>
                        Analysis failed
                      </div>
                    )}
                  </div>
                </Link>

                {/* Score */}
                <div>
                  {a.status === "complete" ? (
                    <ScoreBadge score={a.score} size="sm" />
                  ) : isAnalyzing ? (
                    <span style={{ color: "var(--text-muted)", fontSize: "12px" }}>Processing…</span>
                  ) : (
                    <span style={{ color: "var(--risk-critical)", fontSize: "12px" }}>Error</span>
                  )}
                </div>

                {/* Recommendation */}
                <div
                  style={{
                    fontSize: "12px",
                    color: "var(--text-secondary)",
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                    whiteSpace: "nowrap",
                  }}
                >
                  {a.recommendation ?? "—"}
                </div>

                {/* Date */}
                <div style={{ fontSize: "11px", color: "var(--text-muted)" }}>
                  {formatDate(a.createdAt)}
                </div>

                {/* Actions */}
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    if (confirm("Delete this analysis?"))
                      deleteMutation.mutate(a.id);
                  }}
                  style={{
                    background: "transparent",
                    border: "none",
                    color: "var(--text-muted)",
                    cursor: "pointer",
                    padding: "4px",
                    borderRadius: "4px",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                  }}
                  title="Delete"
                >
                  <Trash2 size={14} />
                </button>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
