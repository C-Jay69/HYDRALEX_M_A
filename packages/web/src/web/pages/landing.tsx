import { Link } from "wouter";
import { Scale, Shield, FileText, Zap, BarChart3, Users, ChevronRight, CheckCircle } from "lucide-react";

const PLANS = [
  { name: "Free", price: "0", period: "forever", features: ["3 document analyses/mo", "Buyer perspective", "PDF & text upload", "Risk score + report"], cta: "Get started free", href: "/sign-up", gold: false },
  { name: "Pro", price: "499", period: "mo", features: ["30 analyses/mo", "Buyer & Seller perspectives", "Priority processing", "Full audit logs", "API access"], cta: "Start Pro", href: "/sign-up", gold: true },
  { name: "Business", price: "1,299", period: "mo", features: ["90 analyses/mo", "Everything in Pro", "Team seats (5)", "Custom risk thresholds", "Dedicated support"], cta: "Start Business", href: "/sign-up", gold: false },
  { name: "Enterprise", price: "3,500", period: "mo", features: ["300 analyses/mo", "Everything in Business", "Unlimited seats", "White-label option", "SLA guarantee"], cta: "Contact sales", href: "/sign-up", gold: false },
];

const FEATURES = [
  { icon: Shield, title: "Three-Layer AI Pipeline", desc: "Analyst → Critic → Adjudicator. Three independent models check each other's work before a verdict is issued." },
  { icon: FileText, title: "Any M&A Document", desc: "NDAs, LOIs, share purchase agreements, due diligence reports — upload PDF or paste text directly." },
  { icon: Zap, title: "Dual Perspective", desc: "Switch between Buyer and Seller mode. The same document, analysed from the other side of the table." },
  { icon: BarChart3, title: "Actionable Risk Score", desc: "0–100 risk score with Low / Moderate / High / Critical classification and clause-level findings." },
  { icon: Users, title: "Team & Admin Controls", desc: "Role-based access, full audit logs, and per-user quota management for law firms and advisory teams." },
  { icon: Scale, title: "Audit-Grade Reporting", desc: "Full markdown reports with suppression reasoning, cross-referencing, and executive summary — ready to share." },
];

export default function LandingPage() {
  return (
    <div style={{ minHeight: "100vh", background: "var(--bg-primary)", color: "var(--text-primary)" }}>
      {/* Nav */}
      <nav style={{
        display: "flex", alignItems: "center", justifyContent: "space-between",
        padding: "0 40px", height: "64px",
        borderBottom: "1px solid var(--border)",
        background: "rgba(10,13,20,0.95)",
        backdropFilter: "blur(8px)",
        position: "sticky", top: 0, zIndex: 100,
      }}>
        <div style={{ display: "flex", alignItems: "center" }}>
          <img src="/logo.png" alt="HydraForge" style={{ height: "36px", width: "auto" }} />
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
          <Link to="/sign-in">
            <button style={{
              background: "none", border: "1px solid var(--border)", borderRadius: "6px",
              color: "var(--text-secondary)", padding: "7px 16px", fontSize: "13px",
              fontWeight: 500, cursor: "pointer",
            }}>Sign in</button>
          </Link>
          <Link to="/sign-up">
            <button style={{
              background: "var(--accent-gold)", border: "none", borderRadius: "6px",
              color: "#0a0d14", padding: "7px 16px", fontSize: "13px",
              fontFamily: "Poppins, sans-serif", fontWeight: 600, cursor: "pointer",
            }}>Get started free</button>
          </Link>
        </div>
      </nav>

      {/* Hero */}
      <section style={{ padding: "100px 40px 80px", textAlign: "center", maxWidth: "800px", margin: "0 auto" }}>
        <div style={{
          display: "inline-block",
          background: "var(--accent-gold-bg)",
          border: "1px solid rgba(212,168,67,0.25)",
          borderRadius: "20px",
          padding: "4px 14px",
          fontSize: "11px",
          fontWeight: 600,
          color: "var(--accent-gold)",
          letterSpacing: "0.08em",
          textTransform: "uppercase",
          marginBottom: "28px",
        }}>
          AI-powered M&A intelligence
        </div>
        <h1 style={{
          fontFamily: "Poppins, sans-serif",
          fontSize: "clamp(2.2rem, 5vw, 3.4rem)",
          fontWeight: 700,
          lineHeight: 1.15,
          color: "var(--text-primary)",
          marginBottom: "24px",
        }}>
          Review M&A documents in{" "}
          <span style={{ color: "var(--accent-gold)" }}>minutes,</span>{" "}
          not weeks.
        </h1>
        <p style={{ fontSize: "1.05rem", color: "var(--text-secondary)", lineHeight: 1.7, marginBottom: "40px", maxWidth: "600px", margin: "0 auto 40px" }}>
          A three-layer AI pipeline — Analyst, Critic, Adjudicator — independently scrutinises every clause in your deal documents and issues a verified risk verdict.
        </p>
        <div style={{ display: "flex", gap: "12px", justifyContent: "center", flexWrap: "wrap" }}>
          <Link to="/sign-up">
            <button style={{
              background: "var(--accent-gold)", border: "none", borderRadius: "8px",
              color: "#0a0d14", padding: "13px 28px", fontSize: "14px",
              fontFamily: "Poppins, sans-serif", fontWeight: 700, cursor: "pointer",
              display: "flex", alignItems: "center", gap: "8px",
            }}>
              Start free — no card needed <ChevronRight size={16} />
            </button>
          </Link>
          <Link to="/pricing">
            <button style={{
              background: "none", border: "1px solid var(--border)", borderRadius: "8px",
              color: "var(--text-secondary)", padding: "13px 28px", fontSize: "14px",
              fontWeight: 500, cursor: "pointer",
            }}>
              See pricing
            </button>
          </Link>
        </div>

        {/* Trust bar */}
        <div style={{ display: "flex", justifyContent: "center", gap: "32px", marginTop: "60px", flexWrap: "wrap" }}>
          {[["3,162-line", "AI pipeline"], ["<60s", "per document"], ["0–100", "risk scoring"], ["Buyer + Seller", "perspectives"]].map(([val, label]) => (
            <div key={label} style={{ textAlign: "center" }}>
              <div style={{ fontFamily: "Poppins, sans-serif", fontWeight: 700, fontSize: "1.4rem", color: "var(--accent-gold)" }}>{val}</div>
              <div style={{ fontSize: "11px", color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.06em" }}>{label}</div>
            </div>
          ))}
        </div>
      </section>

      {/* Features */}
      <section style={{ padding: "80px 40px", background: "var(--bg-secondary)", borderTop: "1px solid var(--border)", borderBottom: "1px solid var(--border)" }}>
        <div style={{ maxWidth: "1100px", margin: "0 auto" }}>
          <h2 style={{ fontFamily: "Poppins, sans-serif", fontSize: "1.8rem", fontWeight: 700, textAlign: "center", marginBottom: "60px" }}>
            Built for deal professionals
          </h2>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(300px, 1fr))", gap: "24px" }}>
            {FEATURES.map(({ icon: Icon, title, desc }) => (
              <div key={title} style={{
                background: "var(--bg-tertiary)",
                border: "1px solid var(--border)",
                borderRadius: "10px",
                padding: "24px",
              }}>
                <div style={{
                  width: "38px", height: "38px",
                  background: "var(--accent-gold-bg)",
                  border: "1px solid rgba(212,168,67,0.2)",
                  borderRadius: "8px",
                  display: "flex", alignItems: "center", justifyContent: "center",
                  marginBottom: "16px",
                }}>
                  <Icon size={18} color="var(--accent-gold)" />
                </div>
                <h3 style={{ fontFamily: "Poppins, sans-serif", fontSize: "0.95rem", fontWeight: 600, marginBottom: "8px" }}>{title}</h3>
                <p style={{ fontSize: "13px", color: "var(--text-secondary)", lineHeight: 1.65 }}>{desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* How it works */}
      <section style={{ padding: "80px 40px", maxWidth: "900px", margin: "0 auto" }}>
        <h2 style={{ fontFamily: "Poppins, sans-serif", fontSize: "1.8rem", fontWeight: 700, textAlign: "center", marginBottom: "60px" }}>
          How it works
        </h2>
        <div style={{ display: "flex", flexDirection: "column", gap: "24px" }}>
          {[
            ["01", "Upload or paste your document", "Support for PDF files and raw text. NDAs, SPA, LOI, due diligence reports — any format."],
            ["02", "Choose your perspective", "Analysing as the Buyer or the Seller? Toggle before you submit. The AI adapts its risk lens accordingly."],
            ["03", "Three models deliberate", "Analyst surfaces issues. Critic challenges the findings. Adjudicator issues the final verdict — with a reconciled risk score."],
            ["04", "Read your report", "Full markdown report: executive summary, clause-level findings, risk score, and actionable recommendation. Download or share."],
          ].map(([num, title, desc]) => (
            <div key={num} style={{
              display: "flex", gap: "24px", alignItems: "flex-start",
              background: "var(--bg-secondary)", border: "1px solid var(--border)",
              borderRadius: "10px", padding: "24px",
            }}>
              <div style={{
                flexShrink: 0, width: "40px", height: "40px",
                background: "var(--accent-gold-bg)",
                border: "1px solid rgba(212,168,67,0.2)",
                borderRadius: "8px",
                display: "flex", alignItems: "center", justifyContent: "center",
                fontFamily: "Poppins, sans-serif", fontWeight: 700,
                fontSize: "13px", color: "var(--accent-gold)",
              }}>{num}</div>
              <div>
                <h3 style={{ fontFamily: "Poppins, sans-serif", fontSize: "0.95rem", fontWeight: 600, marginBottom: "6px" }}>{title}</h3>
                <p style={{ fontSize: "13px", color: "var(--text-secondary)", lineHeight: 1.65 }}>{desc}</p>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* Pricing */}
      <section style={{ padding: "80px 40px", background: "var(--bg-secondary)", borderTop: "1px solid var(--border)", borderBottom: "1px solid var(--border)" }}>
        <div style={{ maxWidth: "1100px", margin: "0 auto" }}>
          <h2 style={{ fontFamily: "Poppins, sans-serif", fontSize: "1.8rem", fontWeight: 700, textAlign: "center", marginBottom: "12px" }}>Pricing</h2>
          <p style={{ textAlign: "center", color: "var(--text-muted)", marginBottom: "48px", fontSize: "14px" }}>Start free. Scale as your deal flow grows.</p>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(230px, 1fr))", gap: "20px" }}>
            {PLANS.map(p => (
              <div key={p.name} style={{
                background: p.gold ? "var(--bg-tertiary)" : "var(--bg-primary)",
                border: p.gold ? "1px solid rgba(212,168,67,0.4)" : "1px solid var(--border)",
                borderRadius: "12px",
                padding: "28px 24px",
                position: "relative",
              }}>
                {p.gold && (
                  <div style={{
                    position: "absolute", top: "-12px", left: "50%", transform: "translateX(-50%)",
                    background: "var(--accent-gold)", color: "#0a0d14",
                    fontSize: "10px", fontWeight: 700, padding: "3px 12px", borderRadius: "12px",
                    fontFamily: "Poppins, sans-serif", letterSpacing: "0.06em", textTransform: "uppercase",
                  }}>Most popular</div>
                )}
                <div style={{ fontFamily: "Poppins, sans-serif", fontWeight: 700, fontSize: "14px", marginBottom: "12px", color: p.gold ? "var(--accent-gold)" : "var(--text-primary)" }}>{p.name}</div>
                <div style={{ marginBottom: "20px" }}>
                  <span style={{ fontFamily: "Poppins, sans-serif", fontSize: "2rem", fontWeight: 700 }}>${p.price}</span>
                  <span style={{ fontSize: "12px", color: "var(--text-muted)" }}>/{p.period}</span>
                </div>
                <ul style={{ listStyle: "none", marginBottom: "24px", display: "flex", flexDirection: "column", gap: "8px" }}>
                  {p.features.map(f => (
                    <li key={f} style={{ display: "flex", gap: "8px", alignItems: "flex-start", fontSize: "13px", color: "var(--text-secondary)" }}>
                      <CheckCircle size={14} color="var(--accent-gold)" style={{ flexShrink: 0, marginTop: "2px" }} />
                      {f}
                    </li>
                  ))}
                </ul>
                <Link to={p.href}>
                  <button style={{
                    width: "100%",
                    background: p.gold ? "var(--accent-gold)" : "var(--bg-tertiary)",
                    border: p.gold ? "none" : "1px solid var(--border)",
                    borderRadius: "6px", padding: "10px",
                    color: p.gold ? "#0a0d14" : "var(--text-secondary)",
                    fontFamily: "Poppins, sans-serif", fontWeight: 600, fontSize: "13px",
                    cursor: "pointer",
                  }}>{p.cta}</button>
                </Link>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* CTA */}
      <section style={{ padding: "100px 40px", textAlign: "center" }}>
        <Scale size={36} color="var(--accent-gold)" style={{ marginBottom: "24px" }} />
        <h2 style={{ fontFamily: "Poppins, sans-serif", fontSize: "2rem", fontWeight: 700, marginBottom: "16px" }}>
          Your first 3 analyses are free.
        </h2>
        <p style={{ color: "var(--text-muted)", marginBottom: "36px", fontSize: "14px" }}>
          No credit card. No commitment. Upload your first document in under 2 minutes.
        </p>
        <Link to="/sign-up">
          <button style={{
            background: "var(--accent-gold)", border: "none", borderRadius: "8px",
            color: "#0a0d14", padding: "14px 36px", fontSize: "15px",
            fontFamily: "Poppins, sans-serif", fontWeight: 700, cursor: "pointer",
          }}>
            Create free account →
          </button>
        </Link>
      </section>

      {/* Footer */}
      <footer style={{
        borderTop: "1px solid var(--border)",
        padding: "32px 40px",
        display: "flex", justifyContent: "space-between", alignItems: "center",
        flexWrap: "wrap", gap: "16px",
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
          <Scale size={14} color="var(--accent-gold)" />
          <span style={{ fontFamily: "Poppins, sans-serif", fontWeight: 700, fontSize: "13px" }}>Hydraforge</span>
          <span style={{ color: "var(--text-muted)", fontSize: "12px" }}>— M&A Intelligence Platform</span>
        </div>
        <div style={{ display: "flex", gap: "24px" }}>
          <Link to="/pricing" style={{ color: "var(--text-muted)", fontSize: "12px", textDecoration: "none" }}>Pricing</Link>
          <Link to="/sign-in" style={{ color: "var(--text-muted)", fontSize: "12px", textDecoration: "none" }}>Sign in</Link>
          <Link to="/sign-up" style={{ color: "var(--text-muted)", fontSize: "12px", textDecoration: "none" }}>Sign up</Link>
        </div>
      </footer>
    </div>
  );
}
