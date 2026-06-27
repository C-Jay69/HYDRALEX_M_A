import { Redirect } from "wouter";
import { authClient } from "../lib/auth";

export function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { data: session, isPending } = authClient.useSession();

  if (isPending) {
    return (
      <div style={{
        minHeight: "100vh",
        background: "var(--bg-primary)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        flexDirection: "column",
        gap: "12px",
        color: "var(--text-muted)",
        fontSize: "13px",
      }}>
        <div className="spinner" style={{
          width: "20px",
          height: "20px",
          border: "2px solid var(--border)",
          borderTop: "2px solid var(--accent-gold)",
          borderRadius: "50%",
        }} />
        Loading…
      </div>
    );
  }

  if (!session) return <Redirect to="/landing" />;
  return <>{children}</>;
}
