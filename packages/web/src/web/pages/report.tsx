import { useQuery } from "@tanstack/react-query";
import { useParams, Link } from "wouter";
import { api } from "../lib/api";
import { formatDate, getRiskColor, getRiskBg, getRiskBorder } from "../lib/utils";
import ScoreBadge from "../components/ScoreBadge";
import { marked } from "marked";
import {
  ArrowLeft,
  Loader,
  CheckCircle,
  XCircle,
  User,
  Users,
  Gavel,
  FileText,
} from "lucide-react";

const STEPS = [
  { id: "analyst", label: "Analyst", sublabel: "First-pass review", icon: User },
  { id: "critic", label: "Critic", sublabel: "Adversarial audit", icon: Users },
  { id: "adjudicator", label: "Adjudicator", sublabel: "Final synthesis", icon: Gavel },
];

function getStepStatus(currentStep: string | null, status: string, stepId: string) {
  if (status === "complete") return "done";
  if (status === "error") return "error";
  const order = ["analyst", "critic", "adjudicator"];
  const current = order.indexOf(currentStep ?? "");
  const idx = order.indexOf(stepId);
  if (idx < current) return "done";
  if (idx === current) return "active";
  return "pending";
}

export default function ReportPage() {
  const { id } = useParams<{ id: string }>();

  const { data, isLoading } = useQuery({
    queryKey: ["analysis", id],
    queryFn: async () => {
      const res = await api.analyses[":id"].$get({ param: { id } });
      return res.json();
    },
    refetchInterval: (query) => {
      const a = (query.state.data as any)?.analysis;
      return a?.status === "analyzing" ? 3000 : false;
    },
  });

  const analysis = (data as any)?.analysis;

  if (isLoading) {
    return (
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          height: "100%",
          gap: "12px",
          color: "var(--text-muted)",
        }}
      >
        <Loader size={20} className="spinner" />
        Loading report…
      </div>
    );
  }

  if (!analysis) {
    return (
      <div style={{ padding: "32px", textAlign: "center", color: "var(--text-muted)" }}>
        <p>Report not found.</p>
        <Link to="/">
          <button style={{ marginTop: "16px", color: "var(--accent-gold)", background: "none", border: "none", cursor: "pointer" }}>
            ← Back to dashboard
          </button>
        </Link>
      </div>
    );
  }

  const reportHtml = analysis.reportMarkdown
    ? marked.parse(analysis.reportMarkdown) as string
    : null;

  return (
    <div style={{ padding: "32px", maxWidth: "1000px", margin: "0 auto" }}>
      {/* Back */}
      <Link to="/">
        <button
          style={{
            display: "flex",
            alignItems: "center",
            gap: "6px",
            background: "none",
            border: "none",
            color: "var(--text-muted)",
            cursor: "pointer",
            fontSize: "13px",
            marginBottom: "24px",
            padding: 0,
          }}
        >
          <ArrowLeft size={14} />
          Back to Dashboard
        </button>
      </Link>

      {/* Report header */}
      <div
        style={{
          background: "var(--bg-secondary)",
          border: "1px solid var(--border)",
          borderRadius: "10px",
          padding: "24px",
          marginBottom: "24px",
        }}
      >
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap", gap: "16px" }}>
          <div>
            <div style={{ display: "flex", alignItems: "center", gap: "10px", marginBottom: "8px" }}>
              <FileText size={18} color="var(--text-muted)" />
              <h1
                style={{
                  fontFamily: "Poppins, sans-serif",
                  fontSize: "1.2rem",
                  fontWeight: 700,
                  color: "var(--text-primary)",
                }}
              >
                {analysis.filename ?? "Contract Analysis"}
              </h1>
            </div>
            <div style={{ fontSize: "12px", color: "var(--text-muted)" }}>
              {formatDate(analysis.createdAt)}
            </div>
          </div>

          {analysis.status === "complete" && (
            <div style={{ textAlign: "right" }}>
              <ScoreBadge score={analysis.score} size="lg" showLabel />
            </div>
          )}
        </div>

        {analysis.status === "complete" && analysis.recommendation && (
          <div
            style={{
              marginTop: "16px",
              padding: "10px 14px",
              background: getRiskBg(analysis.score),
              border: `1px solid ${getRiskBorder(analysis.score)}`,
              borderRadius: "6px",
              display: "flex",
              alignItems: "center",
              gap: "8px",
            }}
          >
            <span
              style={{
                fontFamily: "Poppins, sans-serif",
                fontWeight: 600,
                fontSize: "12px",
                color: "var(--text-muted)",
                textTransform: "uppercase",
                letterSpacing: "0.07em",
              }}
            >
              Recommendation:
            </span>
            <span
              style={{
                color: getRiskColor(analysis.score),
                fontWeight: 600,
                fontSize: "13px",
              }}
            >
              {analysis.recommendation}
            </span>
          </div>
        )}
      </div>

      {/* Pipeline progress */}
      {analysis.status === "analyzing" && (
        <div
          style={{
            background: "var(--bg-secondary)",
            border: "1px solid var(--border)",
            borderRadius: "10px",
            padding: "24px",
            marginBottom: "24px",
          }}
        >
          <div
            style={{
              fontFamily: "Poppins, sans-serif",
              fontWeight: 600,
              fontSize: "14px",
              color: "var(--text-primary)",
              marginBottom: "20px",
              display: "flex",
              alignItems: "center",
              gap: "8px",
            }}
          >
            <span
              style={{
                width: "8px",
                height: "8px",
                borderRadius: "50%",
                background: "var(--accent-gold)",
              }}
              className="animate-pulse-dot"
            />
            Analysis in Progress
          </div>

          <div style={{ display: "flex", gap: "0", position: "relative" }}>
            {STEPS.map(({ id: stepId, label, sublabel, icon: Icon }, idx) => {
              const stepStatus = getStepStatus(analysis.step, analysis.status, stepId);
              const color =
                stepStatus === "done"
                  ? "var(--risk-low)"
                  : stepStatus === "active"
                  ? "var(--accent-gold)"
                  : "var(--text-muted)";

              return (
                <div
                  key={stepId}
                  style={{ flex: 1, textAlign: "center", position: "relative" }}
                >
                  {/* Connector line */}
                  {idx > 0 && (
                    <div
                      style={{
                        position: "absolute",
                        left: 0,
                        top: "19px",
                        width: "50%",
                        height: "2px",
                        background:
                          stepStatus === "done" || stepStatus === "active"
                            ? "var(--accent-gold)"
                            : "var(--border)",
                        transform: "translateX(-50%)",
                        zIndex: 0,
                      }}
                    />
                  )}
                  {idx < STEPS.length - 1 && (
                    <div
                      style={{
                        position: "absolute",
                        right: 0,
                        top: "19px",
                        width: "50%",
                        height: "2px",
                        background:
                          stepStatus === "done"
                            ? "var(--accent-gold)"
                            : "var(--border)",
                        transform: "translateX(50%)",
                        zIndex: 0,
                      }}
                    />
                  )}

                  <div style={{ position: "relative", zIndex: 1 }}>
                    {/* Circle */}
                    <div
                      style={{
                        width: "38px",
                        height: "38px",
                        borderRadius: "50%",
                        margin: "0 auto 10px",
                        background:
                          stepStatus === "active"
                            ? "var(--accent-gold-bg)"
                            : stepStatus === "done"
                            ? "rgba(34,197,94,0.12)"
                            : "var(--bg-tertiary)",
                        border: `2px solid ${color}`,
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                      }}
                    >
                      {stepStatus === "done" ? (
                        <CheckCircle size={16} color="var(--risk-low)" />
                      ) : stepStatus === "active" ? (
                        <Loader size={16} color="var(--accent-gold)" className="spinner" />
                      ) : (
                        <Icon size={16} color="var(--text-muted)" />
                      )}
                    </div>

                    <div
                      style={{
                        fontFamily: "Poppins, sans-serif",
                        fontWeight: 600,
                        fontSize: "12px",
                        color,
                        marginBottom: "2px",
                      }}
                    >
                      {label}
                    </div>
                    <div style={{ fontSize: "10px", color: "var(--text-muted)" }}>
                      {sublabel}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>

          <p style={{ textAlign: "center", color: "var(--text-muted)", fontSize: "12px", marginTop: "20px" }}>
            This may take 1–3 minutes depending on model availability
          </p>
        </div>
      )}

      {/* Error */}
      {analysis.status === "error" && (
        <div
          style={{
            background: "rgba(239,68,68,0.08)",
            border: "1px solid rgba(239,68,68,0.3)",
            borderRadius: "10px",
            padding: "24px",
            display: "flex",
            gap: "14px",
            alignItems: "flex-start",
          }}
        >
          <XCircle size={20} color="var(--risk-critical)" style={{ flexShrink: 0, marginTop: "2px" }} />
          <div>
            <div style={{ fontFamily: "Poppins, sans-serif", fontWeight: 600, color: "var(--risk-critical)", marginBottom: "4px" }}>
              Analysis Failed
            </div>
            <div style={{ color: "var(--text-secondary)", fontSize: "13px" }}>
              {analysis.errorMessage ?? "An unknown error occurred."}
            </div>
          </div>
        </div>
      )}

      {/* Executive Summary card */}
      {analysis.status === "complete" && analysis.executiveSummary && (
        <div
          style={{
            background: "var(--accent-gold-bg)",
            border: "1px solid rgba(212,168,67,0.2)",
            borderRadius: "10px",
            padding: "20px 24px",
            marginBottom: "24px",
          }}
        >
          <div
            style={{
              fontFamily: "Poppins, sans-serif",
              fontWeight: 600,
              fontSize: "11px",
              color: "var(--accent-gold)",
              textTransform: "uppercase",
              letterSpacing: "0.08em",
              marginBottom: "10px",
            }}
          >
            Executive Summary
          </div>
          <p style={{ color: "var(--text-secondary)", lineHeight: 1.7, fontSize: "13px" }}>
            {analysis.executiveSummary}
          </p>
        </div>
      )}

      {/* Full Report */}
      {analysis.status === "complete" && reportHtml && (
        <div
          style={{
            background: "var(--bg-secondary)",
            border: "1px solid var(--border)",
            borderRadius: "10px",
            padding: "28px 32px",
          }}
          className="animate-fade-in"
        >
          <div
            className="report-markdown"
            dangerouslySetInnerHTML={{ __html: reportHtml }}
          />
        </div>
      )}

      {/* Agent Outputs (collapsed) */}
      {analysis.status === "complete" && (analysis.llm1Output || analysis.llm2Output) && (
        <details
          style={{
            marginTop: "20px",
            background: "var(--bg-secondary)",
            border: "1px solid var(--border)",
            borderRadius: "10px",
            padding: "16px 20px",
          }}
        >
          <summary
            style={{
              cursor: "pointer",
              fontFamily: "Poppins, sans-serif",
              fontWeight: 600,
              fontSize: "13px",
              color: "var(--text-muted)",
              listStyle: "none",
            }}
          >
            ▶ View Raw Agent Outputs (Debug)
          </summary>

          {analysis.llm1Output && (
            <div style={{ marginTop: "16px" }}>
              <div style={{ fontSize: "11px", color: "var(--accent-gold)", textTransform: "uppercase", letterSpacing: "0.07em", marginBottom: "8px" }}>
                LLM 1 — Analyst Output
              </div>
              <pre
                style={{
                  background: "var(--bg-primary)",
                  border: "1px solid var(--border)",
                  borderRadius: "6px",
                  padding: "12px",
                  fontSize: "11px",
                  color: "var(--text-secondary)",
                  overflow: "auto",
                  maxHeight: "300px",
                  whiteSpace: "pre-wrap",
                  wordBreak: "break-word",
                }}
              >
                {analysis.llm1Output}
              </pre>
            </div>
          )}

          {analysis.llm2Output && (
            <div style={{ marginTop: "16px" }}>
              <div style={{ fontSize: "11px", color: "var(--risk-high)", textTransform: "uppercase", letterSpacing: "0.07em", marginBottom: "8px" }}>
                LLM 2 — Critic Output
              </div>
              <pre
                style={{
                  background: "var(--bg-primary)",
                  border: "1px solid var(--border)",
                  borderRadius: "6px",
                  padding: "12px",
                  fontSize: "11px",
                  color: "var(--text-secondary)",
                  overflow: "auto",
                  maxHeight: "300px",
                  whiteSpace: "pre-wrap",
                  wordBreak: "break-word",
                }}
              >
                {analysis.llm2Output}
              </pre>
            </div>
          )}
        </details>
      )}
    </div>
  );
}
