import { Link } from "wouter";
import { Check, Scale, Zap, Building2, Globe, Calendar, ArrowRight } from "lucide-react";

type Tier = {
  id: string;
  name: string;
  price: string;
  priceNote: string;
  quota: string;
  icon: any;
  color: string;
  badge?: string;
  features: string[];
  cta: string;
  href: string;
};

const TIERS: Tier[] = [
  {
    id: "free",
    name: "Free",
    price: "$0",
    priceNote: "Trial",
    quota: "1 analysis / month",
    icon: Scale,
    color: "#64748b",
    features: [
      "1 analysis per month",
      "Core triple-LLM pipeline",
      "Risk score (0–100)",
      "Executive summary",
      "Sample deal-room report",
    ],
    cta: "Get Started",
    href: "/sign-up",
  },
  {
    id: "professional",
    name: "Professional",
    price: "$1,500",
    priceNote: "/ month",
    quota: "10 analyses / month",
    icon: Zap,
    color: "#d4a843",
    badge: "Most Popular",
    features: [
      "10 analyses per month",
      "Everything in Free",
      "Full pipeline + PDF export",
      "Buyer & Seller perspectives",
      "Multi-document deal rooms",
      "3 team seats",
      "Email support",
    ],
    cta: "Request Access",
    href: "mailto:sales@hydraforge.com?subject=Professional%20Plan%20Request",
  },
  {
    id: "business",
    name: "Business",
    price: "$5,000",
    priceNote: "/ month",
    quota: "50 analyses / month",
    icon: Building2,
    color: "#00d4aa",
    features: [
      "50 analyses per month",
      "Everything in Professional",
      "10 team seats",
      "90-day analysis history",
      "Priority support",
      "Advanced risk calibration",
      "API access",
    ],
    cta: "Request Access",
    href: "mailto:sales@hydraforge.com?subject=Business%20Plan%20Request",
  },
  {
    id: "enterprise",
    name: "Enterprise",
    price: "Custom",
    priceNote: "from $15,000 / month",
    quota: "Unlimited analyses",
    icon: Globe,
    color: "#8b5cf6",
    features: [
      "Unlimited analyses",
      "Everything in Business",
      "99.9% SLA guarantee",
      "SSO / SAML",
      "White-label reports",
      "Dedicated onboarding & CSM",
      "Custom data retention",
      "Firm-precedent model training",
    ],
    cta: "Book a Demo",
    href: "mailto:sales@hydraforge.com?subject=Enterprise%20Demo%20Request",
  },
];

export default function PricingPage() {
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
          Built for the deal room.<br />Priced for the work it replaces.
        </h1>
        <p style={{ color: "var(--text-muted)", fontSize: "15px", maxWidth: "560px", margin: "0 auto 12px", lineHeight: 1.6 }}>
          Triple-layer AI analysis. Junior associate speed, senior partner scrutiny.
          Market-calibrated M&A risk scoring in minutes — at a fraction of a single
          associate's billable review.
        </p>
        <div style={{
          display: "inline-flex",
          alignItems: "center",
          gap: "8px",
          background: "rgba(212,168,67,0.08)",
          border: "1px solid rgba(212,168,67,0.25)",
          borderRadius: "20px",
          padding: "5px 16px",
          fontSize: "12px",
          color: "var(--accent-gold)",
          fontWeight: 600,
          marginTop: "4px",
        }}>
          <Calendar size={12} /> Annual billing saves 2 months
        </div>
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
        {TIERS.map((tier) => {
          const Icon = tier.icon;
          const isPro = tier.id === "professional";

          return (
            <div
              key={tier.id}
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
              {tier.badge && (
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
                  {tier.badge}
                </div>
              )}

              {/* Icon + name */}
              <div style={{ display: "flex", alignItems: "center", gap: "10px", marginBottom: "20px" }}>
                <div style={{
                  width: "36px", height: "36px",
                  background: `${tier.color}18`,
                  border: `1px solid ${tier.color}40`,
                  borderRadius: "8px",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                }}>
                  <Icon size={16} color={tier.color} />
                </div>
                <div>
                  <div style={{ fontFamily: "Poppins, sans-serif", fontWeight: 700, fontSize: "14px", color: "var(--text-primary)" }}>
                    {tier.name}
                  </div>
                  <div style={{ fontSize: "11px", color: "var(--text-muted)" }}>
                    {tier.quota}
                  </div>
                </div>
              </div>

              {/* Price */}
              <div style={{ marginBottom: "24px" }}>
                <span style={{ fontFamily: "Poppins, sans-serif", fontWeight: 800, fontSize: "2rem", color: "var(--text-primary)" }}>
                  {tier.price}
                </span>
                <span style={{ color: "var(--text-muted)", fontSize: "13px" }}> {tier.priceNote}</span>
              </div>

              {/* Features */}
              <div style={{ flex: 1, marginBottom: "24px" }}>
                {tier.features.map((f) => (
                  <div key={f} style={{ display: "flex", gap: "8px", marginBottom: "9px", alignItems: "flex-start" }}>
                    <Check size={13} color={tier.color} style={{ flexShrink: 0, marginTop: "2px" }} />
                    <span style={{ fontSize: "12px", color: "var(--text-secondary)", lineHeight: 1.4 }}>{f}</span>
                  </div>
                ))}
              </div>

              {/* CTA */}
              {tier.id === "free" ? (
                <Link to={tier.href} style={{ textDecoration: "none" }}>
                  <button
                    style={{
                      width: "100%",
                      padding: "10px 16px",
                      background: `${tier.color}18`,
                      border: `1px solid ${tier.color}40`,
                      borderRadius: "6px",
                      color: tier.color,
                      fontFamily: "Poppins, sans-serif",
                      fontWeight: 600,
                      fontSize: "12px",
                      cursor: "pointer",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      gap: "6px",
                    }}
                  >
                    {tier.cta} <ArrowRight size={13} />
                  </button>
                </Link>
              ) : (
                <a
                  href={tier.href}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    gap: "6px",
                    padding: "10px 16px",
                    background: isPro ? "var(--accent-gold)" : `${tier.color}18`,
                    border: isPro ? "none" : `1px solid ${tier.color}40`,
                    borderRadius: "6px",
                    color: isPro ? "#0a0d14" : tier.color,
                    fontFamily: "Poppins, sans-serif",
                    fontWeight: 600,
                    fontSize: "12px",
                    textDecoration: "none",
                    cursor: "pointer",
                  }}
                >
                  <Calendar size={13} /> {tier.cta}
                </a>
              )}
            </div>
          );
        })}
      </div>

      {/* Pricing rationale */}
      <div style={{
        maxWidth: "820px",
        margin: "0 auto 60px",
        padding: "0 24px",
      }}>
        <div style={{
          background: "var(--bg-secondary)",
          border: "1px solid var(--border)",
          borderRadius: "12px",
          padding: "36px",
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(340px, 1fr))",
          gap: "32px",
        }}>
          {/* Value prop */}
          <div>
            <h3 style={{ fontFamily: "Poppins, sans-serif", fontWeight: 700, fontSize: "1rem", color: "var(--text-primary)", marginBottom: "12px" }}>
              Why not $499/month?
            </h3>
            <p style={{ color: "var(--text-muted)", fontSize: "13px", lineHeight: 1.7, margin: 0 }}>
              A junior associate bills at <strong style={{ color: "var(--text-secondary)" }}>$350–600/hour</strong>. M&amp;A document review takes 8–20 hours — <strong style={{ color: "var(--text-secondary)" }}>$3,000–$12,000</strong> per document before markup.
              Even a single deal covers a month of Professional. Firms running 3–5 deals a month see <strong style={{ color: "var(--accent-gold)" }}>10–30x ROI</strong>.
              Comparable platforms (Kira, Luminance, Harvey) land enterprise contracts at $1,500–$10,000+/month. Hydraforge prices for institutional trust, not consumer convenience.
            </p>
          </div>
          {/* Enterprise CTA */}
          <div style={{ display: "flex", flexDirection: "column", justifyContent: "center", gap: "12px" }}>
            <h3 style={{ fontFamily: "Poppins, sans-serif", fontWeight: 700, fontSize: "1rem", color: "var(--text-primary)", marginBottom: "4px" }}>
              Enterprise M&amp;A clients don't self-serve.
            </h3>
            <p style={{ color: "var(--text-muted)", fontSize: "13px", lineHeight: 1.6, margin: 0 }}>
              Large law firms and advisory teams need SLAs, SSO, white-label, security reviews, and onboarding. Let's talk about what works for your firm.
            </p>
            <a
              href="mailto:sales@hydraforge.com?subject=Enterprise%20Demo%20Request"
              style={{
                display: "inline-flex",
                alignItems: "center",
                justifyContent: "center",
                gap: "6px",
                padding: "11px 22px",
                background: "rgba(139,92,246,0.12)",
                border: "1px solid rgba(139,92,246,0.4)",
                borderRadius: "7px",
                color: "#a78bfa",
                fontFamily: "Poppins, sans-serif",
                fontWeight: 600,
                fontSize: "13px",
                textDecoration: "none",
                alignSelf: "flex-start",
                cursor: "pointer",
              }}
            >
              <Calendar size={13} /> Book a Demo
            </a>
          </div>
        </div>

        {/* Quota note */}
        <p style={{
          textAlign: "center",
          fontSize: "11px",
          color: "var(--text-muted)",
          marginTop: "16px",
          lineHeight: 1.6,
        }}>
          Your plan determines your monthly analysis allowance, enforced at submission. Annual billing saves two months on paid plans.
        </p>
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
