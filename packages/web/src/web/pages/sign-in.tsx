import { useState } from "react";
import { Link, useLocation } from "wouter";
import { authClient, captureToken } from "../lib/auth";
import { Eye, EyeOff, Loader } from "lucide-react";

export default function SignInPage() {
  const [, navigate] = useLocation();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPwd, setShowPwd] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    const res = await authClient.signIn.email(
      { email, password },
      { onSuccess: captureToken }
    );
    setLoading(false);
    if (res.error) {
      setError(res.error.message ?? "Invalid credentials");
    } else {
      navigate("/dashboard");
    }
  }

  return (
    <div style={{
      minHeight: "100vh",
      background: "var(--bg-primary)",
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      padding: "24px",
    }}>
      <div style={{ width: "100%", maxWidth: "400px" }}>
        {/* Logo */}
        <div style={{ textAlign: "center", marginBottom: "36px" }}>
          <img src="/logo.png" alt="HydraForge" style={{ width: "160px", height: "auto", marginBottom: "20px" }} />
          <h1 style={{ fontFamily: "Poppins, sans-serif", fontWeight: 700, fontSize: "1.5rem", color: "var(--text-primary)", marginBottom: "6px" }}>
            Sign in to HydraForge
          </h1>
          <p style={{ color: "var(--text-muted)", fontSize: "13px" }}>
            M&A document intelligence platform
          </p>
        </div>

        {/* Card */}
        <div style={{
          background: "var(--bg-secondary)",
          border: "1px solid var(--border)",
          borderRadius: "12px",
          padding: "32px",
        }}>
          <form onSubmit={handleSubmit}>
            {error && (
              <div style={{
                background: "rgba(239,68,68,0.08)",
                border: "1px solid rgba(239,68,68,0.3)",
                borderRadius: "6px",
                padding: "10px 14px",
                color: "#ef4444",
                fontSize: "13px",
                marginBottom: "20px",
              }}>
                {error}
              </div>
            )}

            <div style={{ marginBottom: "18px" }}>
              <label htmlFor="signin-email" style={{ display: "block", fontSize: "12px", fontWeight: 600, color: "var(--text-secondary)", marginBottom: "6px", textTransform: "uppercase", letterSpacing: "0.05em" }}>
                Email
              </label>
              <input
                id="signin-email"
                aria-label="Email"
                type="email"
                value={email}
                onChange={e => setEmail(e.target.value)}
                required
                placeholder="you@firm.com"
                style={{
                  width: "100%",
                  background: "var(--bg-tertiary)",
                  border: "1px solid var(--border)",
                  borderRadius: "6px",
                  padding: "10px 12px",
                  color: "var(--text-primary)",
                  fontSize: "13px",
                  outline: "none",
                  boxSizing: "border-box",
                }}
              />
            </div>

            <div style={{ marginBottom: "24px" }}>
              <label htmlFor="signin-password" style={{ display: "block", fontSize: "12px", fontWeight: 600, color: "var(--text-secondary)", marginBottom: "6px", textTransform: "uppercase", letterSpacing: "0.05em" }}>
                Password
              </label>
              <div style={{ position: "relative" }}>
                <input
                  id="signin-password"
                  aria-label="Password"
                  type={showPwd ? "text" : "password"}
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  required
                  placeholder="••••••••"
                  style={{
                    width: "100%",
                    background: "var(--bg-tertiary)",
                    border: "1px solid var(--border)",
                    borderRadius: "6px",
                    padding: "10px 40px 10px 12px",
                    color: "var(--text-primary)",
                    fontSize: "13px",
                    outline: "none",
                    boxSizing: "border-box",
                  }}
                />
                <button
                  type="button"
                  onClick={() => setShowPwd(!showPwd)}
                  style={{ position: "absolute", right: "10px", top: "50%", transform: "translateY(-50%)", background: "none", border: "none", cursor: "pointer", color: "var(--text-muted)", padding: "2px" }}
                >
                  {showPwd ? <EyeOff size={15} /> : <Eye size={15} />}
                </button>
              </div>
            </div>

            <button
              type="submit"
              disabled={loading}
              style={{
                width: "100%",
                background: loading ? "rgba(212,168,67,0.5)" : "var(--accent-gold)",
                color: "#0a0d14",
                border: "none",
                borderRadius: "6px",
                padding: "11px",
                fontFamily: "Poppins, sans-serif",
                fontWeight: 600,
                fontSize: "13px",
                cursor: loading ? "not-allowed" : "pointer",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                gap: "8px",
              }}
            >
              {loading ? <><Loader size={14} className="animate-spin" /> Signing in…</> : "Sign In"}
            </button>
          </form>
        </div>

        <p style={{ textAlign: "center", marginTop: "20px", fontSize: "13px", color: "var(--text-muted)" }}>
          No account?{" "}
          <Link to="/sign-up" style={{ color: "var(--accent-gold)", textDecoration: "none", fontWeight: 500 }}>
            Create one →
          </Link>
        </p>
        <p style={{ textAlign: "center", marginTop: "10px", fontSize: "13px", color: "var(--text-muted)" }}>
          <Link to="/pricing" style={{ color: "var(--text-muted)", textDecoration: "none" }}>
            View pricing
          </Link>
        </p>
      </div>
    </div>
  );
}
