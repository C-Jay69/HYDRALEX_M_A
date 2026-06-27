import { useCustomer, useListPlans } from "autumn-js/react";
import { authClient } from "../lib/auth";
import { Link } from "wouter";
import { Check, Scale, Zap, Building2, Globe, Calendar } from "lucide-react";

const PLAN_META: Record<string, { icon: any; color: string; badge?: string; docs: string; features: string[] }> = {
  free: {
    icon: Scale,
    color: "#64748b",
    docs: "1 / month",
    features: [
      "1 analysis per month",
      "Triple-LLM pipeline",
      "Risk scoring (0–100)",
      "Executive summary",
      "Clause-by-clause breakdown",
    ],
  },
  professional: {
    icon: Zap,
    color: "#d4a843",
    badge: "Most Popular",
    docs: "10 / month",
    features: [
      "10 analyses per month",
      "Everything in Free",
      "Full Markdown report",
      "Buyer & Seller perspective",
      "30-day analysis history",
      "Email support",
    ],
  },
  business: {
    icon: Building2,
    color: "#00d4aa",
    docs: "50 / month",
    features: [
      "50 analyses per month",
      "Everything in Professional",
      "Priority support",
      "90-day analysis history",
      "Team collaboration (5 seats)",
      "Advanced risk calibration",
    ],
  },
  enterprise: {
    icon: Globe,
    color: "#8b5cf6",
    docs: "Unlimited",
    features: [
      "Unlimited analyses",
      "Everything in Business",
      "99.9% SLA",
      "White-label reports",
      "SSO / SAML",
      "Dedicated onboarding",
      "API access",
      "Custom data retention",
    ],
  },
};

const PLAN_ORDER = ["free", "professional", "business", "enterprise"];

export default function PricingPage() {
  const { data: customer, attach } = useCustomer();
  const { data: plans } = useListPlans();
  const { data: session } = authClient.useSession();

  const activePlanId = customer?.subscriptions?.[0]?.planId ?? "free";

  const sortedPlans = (plans ?? []).slice().sort(
    (a: any, b: any) => PLAN_ORDER.indexOf(a.id) - PLAN_ORDER.indexOf(b.id)
  );

  function handleUpgrade(planId: string) {
    if (!session) {
      window.location.href = "/sign-up";
      return;
    }
    attach({ planId, successUrl: window.location.origin });
  }

  return (
    <div style={{ minHeight: "100vh", background: "var(--bg-primary)" }}>
      {/* Hero */}
      <div style={{ textAlign: "center", padding: "80px 24px 48px" }}>
        <div style={{
          display: "inline-flex",
          alignItems: "center",
          gap: "6px",
          background: "var(--accent-gold-bg)",
          border: "1px solid rgba(212,168,67,0.3)",
          borderRadius: "20px",
          padding: "4px 14px",
          fontSize: "11px",
          fontWeight: 600,
          color: "var(--accent-gold)",
          textTransform: "uppercase",
          letterSpacing: "0.08em",
          marginBottom: "24px",
        }}>
          <Scale size={11} /> Hydraforge Pricing
        </div>
        <h1 style={{
          fontFamily: "Poppins, sans-serif",
          fontWeight: 800,
          fontSize: "clamp(2rem, 5vw, 3.2rem)",
          color: "var(--text-primary)",
          marginBottom: "16px",
          lineHeight: 1.2,
        }}>
          Replace $30K in associate<br />time for $499/month
        </h1>
        <p style={{ color: "var(--text-muted)", fontSize: "15px", maxWidth: "520px", margin: "0 auto 12px", lineHeight: 1.6 }}>
          Triple-layer AI analysis. Junior associate speed. Senior partner accuracy.
          Market-calibrated M&A risk scoring in under 5 minutes.
        </p>
        <p style={{ color: "var(--text-muted)", fontSize: "12px" }}>
          Annual billing saves 20%
        </p>
      </div>

      {/* Plans grid */}
      <div style={{
        maxWidth: "1100px",
        margin: "0 auto",
        padding: "0 24px 80px",
        display: "grid",
        gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))",
        gap: "20px",
      }}>
        {sortedPlans.map((plan: any) => {
          const meta = PLAN_META[plan.id] ?? PLAN_META.free;
          const Icon = meta.icon;
          const isActive = plan.id === activePlanId;
          const isPro = plan.id === "professional";
          const isEnterprise = plan.id === "enterprise";
          const action = plan.customerEligibility?.attachAction;

          return (
            <div
              key={plan.id}
              style={{
                background: isPro ? "linear-gradient(135deg, rgba(212,168,67,0.06) 0%, var(--bg-secondary) 100%)" : "var(--bg-secondary)",
                border: isPro ? "1px solid rgba(212,168,67,0.4)" : "1px solid var(--border)",
                borderRadius: "14px",
                padding: "28px",
                position: "relative",
                display: "flex",
                flexDirection: "column",
              }}
            >
              {meta.badge && (
                <div style={{
                  position: "absolute",
                  top: "-12px",
                  left: "50%",
                  transform: "translateX(-50%)",
                  background: "var(--accent-gold)",
                  color: "#0a0d14",
                  fontSize: "10px",
                  fontWeight: 700,
                  padding: "3px 12px",
                  borderRadius: "20px",
                  textTransform: "uppercase",
                  letterSpacing: "0.06em",
                  whiteSpace: "nowrap",
                }}>
                  {meta.badge}
                </div>
              )}

              {/* Icon + name */}
              <div style={{ display: "flex", alignItems: "center", gap: "10px", marginBottom: "20px" }}>
                <div style={{
                  width: "36px", height: "36px",
                  background: `${meta.color}18`,
                  border: `1px solid ${meta.color}40`,
                  borderRadius: "8px",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                }}>
                  <Icon size={16} color={meta.color} />
                </div>
                <div>
                  <div style={{ fontFamily: "Poppins, sans-serif", fontWeight: 700, fontSize: "14px", color: "var(--text-primary)" }}>
                    {plan.name}
                  </div>
                  <div style={{ fontSize: "11px", color: "var(--text-muted)" }}>
                    {meta.docs} analyses
                  </div>
                </div>
              </div>

              {/* Price */}
              <div style={{ marginBottom: "24px" }}>
                {isEnterprise ? (
                  <div>
                    <span style={{ fontFamily: "Poppins, sans-serif", fontWeight: 800, fontSize: "1.8rem", color: "var(--text-primary)" }}>
                      Custom
                    </span>
                    <div style={{ fontSize: "12px", color: "var(--text-muted)", marginTop: "2px" }}>
                      from $3,500/month
                    </div>
                  </div>
                ) : plan.price ? (
                  <div>
                    <span style={{ fontFamily: "Poppins, sans-serif", fontWeight: 800, fontSize: "2rem", color: "var(--text-primary)" }}>
                      ${(plan.price.amount / 100).toLocaleString()}
                    </span>
                    <span style={{ color: "var(--text-muted)", fontSize: "13px" }}>/month</span>
                    <div style={{ fontSize: "11px", color: "var(--text-muted)", marginTop: "2px" }}>
                      ~${Math.round(plan.price.amount / 100 / (plan.id === "professional" ? 10 : 50))}/analysis
                    </div>
                  </div>
                ) : (
                  <div>
                    <span style={{ fontFamily: "Poppins, sans-serif", fontWeight: 800, fontSize: "2rem", color: "var(--text-primary)" }}>
                      $0
                    </span>
                    <span style={{ color: "var(--text-muted)", fontSize: "13px" }}>/month</span>
                  </div>
                )}
              </div>

              {/* Features */}
              <div style={{ flex: 1, marginBottom: "24px" }}>
                {meta.features.map((f) => (
                  <div key={f} style={{ display: "flex", gap: "8px", marginBottom: "9px", alignItems: "flex-start" }}>
                    <Check size={13} color={meta.color} style={{ flexShrink: 0, marginTop: "2px" }} />
                    <span style={{ fontSize: "12px", color: "var(--text-secondary)", lineHeight: 1.4 }}>{f}</span>
                  </div>
                ))}
              </div>

              {/* CTA */}
              {isEnterprise ? (
                <a
                  href="mailto:enterprise@hydraforge.com?subject=Enterprise Demo Request"
                  style={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    gap: "6px",
                    padding: "10px 16px",
                    background: `${meta.color}18`,
                    border: `1px solid ${meta.color}40`,
                    borderRadius: "6px",
                    color: meta.color,
                    fontFamily: "Poppins, sans-serif",
                    fontWeight: 600,
                    fontSize: "12px",
                    textDecoration: "none",
                    cursor: "pointer",
                  }}
                >
                  <Calendar size={13} /> Book a Demo
                </a>
              ) : isActive ? (
                <div style={{
                  padding: "10px 16px",
                  background: "rgba(16,185,129,0.08)",
                  border: "1px solid rgba(16,185,129,0.3)",
                  borderRadius: "6px",
                  color: "#10b981",
                  fontSize: "12px",
                  fontWeight: 600,
                  textAlign: "center",
                }}>
                  ✓ Current Plan
                </div>
              ) : (
                <button
                  onClick={() => handleUpgrade(plan.id)}
                  style={{
                    width: "100%",
                    padding: "10px 16px",
                    background: isPro ? "var(--accent-gold)" : `${meta.color}18`,
                    border: isPro ? "none" : `1px solid ${meta.color}40`,
                    borderRadius: "6px",
                    color: isPro ? "#0a0d14" : meta.color,
                    fontFamily: "Poppins, sans-serif",
                    fontWeight: 600,
                    fontSize: "12px",
                    cursor: "pointer",
                  }}
                >
                  {action === "downgrade" ? "Downgrade" : plan.price ? "Upgrade" : "Get Started"}
                </button>
              )}
            </div>
          );
        })}
      </div>

      {/* Value prop */}
      <div style={{
        maxWidth: "700px",
        margin: "0 auto 80px",
        padding: "0 24px",
        textAlign: "center",
      }}>
        <div style={{
          background: "var(--bg-secondary)",
          border: "1px solid var(--border)",
          borderRadius: "12px",
          padding: "32px",
        }}>
          <h3 style={{ fontFamily: "Poppins, sans-serif", fontWeight: 700, fontSize: "1rem", color: "var(--text-primary)", marginBottom: "12px" }}>
            Why not $99/month?
          </h3>
          <p style={{ color: "var(--text-muted)", fontSize: "13px", lineHeight: 1.7, margin: 0 }}>
            A junior associate bills at $350–600/hour. M&A document review takes 8–20 hours per document — $3,000–$12,000 in associate time before client markup.
            Professional at $499/month delivers the equivalent of <strong style={{ color: "var(--text-secondary)" }}>$30,000–$120,000</strong> in associate time.
            Comparable platforms (Kira, Luminance, Harvey AI) charge $1,500–$10,000+/month.
            Hydraforge enters competitively without signaling consumer-grade tooling to this market.
          </p>
        </div>
      </div>

      {/* Back nav */}
      <div style={{ textAlign: "center", paddingBottom: "40px" }}>
        <Link to="/" style={{ color: "var(--text-muted)", fontSize: "13px", textDecoration: "none" }}>
          ← Back to dashboard
        </Link>
      </div>
    </div>
  );
}
