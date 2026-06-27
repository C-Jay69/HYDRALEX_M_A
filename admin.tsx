import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { authClient } from "../lib/auth";
import { Link } from "wouter";
import {
  Users, BarChart3, FileText, ShieldAlert, Activity,
  ChevronRight, TrendingUp, CheckCircle, XCircle,
  Crown,
} from "lucide-react";
import { formatDate, getRiskColor } from "../lib/utils";
import ScoreBadge from "../components/ScoreBadge";

type Tab = "overview" | "users" | "analyses" | "audit" | "health";

export default function AdminPage() {
  const [tab, setTab] = useState<Tab>("overview");
  const [selectedUser, setSelectedUser] = useState<string | null>(null);
  const { data: session } = authClient.useSession();
  const qc = useQueryClient();

  const { data: statsData, isLoading: statsLoading } = useQuery({
    queryKey: ["admin-stats"],
    queryFn: async () => {
      const res = await fetch("/api/admin/stats", {
        headers: { Authorization: `Bearer ${localStorage.getItem("bearer_token") ?? ""}` },
      });
      if (!res.ok) throw new Error("Unauthorized");
      return res.json();
    },
  });

  const { data: usersData } = useQuery({
    queryKey: ["admin-users"],
    queryFn: async () => {
      const res = await fetch("/api/admin/users", {
        headers: { Authorization: `Bearer ${localStorage.getItem("bearer_token") ?? ""}` },
      });
      return res.json();
    },
    enabled: tab === "users",
  });

  const { data: analysesData } = useQuery({
    queryKey: ["admin-analyses"],
    queryFn: async () => {
      const res = await fetch("/api/admin/analyses", {
        headers: { Authorization: `Bearer ${localStorage.getItem("bearer_token") ?? ""}` },
      });
      return res.json();
    },
    enabled: tab === "analyses",
  });

  const { data: auditData } = useQuery({
    queryKey: ["admin-audit"],
    queryFn: async () => {
      const res = await fetch("/api/admin/audit-logs", {
        headers: { Authorization: `Bearer ${localStorage.getItem("bearer_token") ?? ""}` },
      });
      return res.json();
    },
    enabled: tab === "audit",
  });

  const { data: healthData } = useQuery({
    queryKey: ["admin-health"],
    queryFn: async () => {
      const res = await fetch("/api/admin/health", {
        headers: { Authorization: `Bearer ${localStorage.getItem("bearer_token") ?? ""}` },
      });
      return res.json();
    },
    enabled: tab === "health",
    refetchInterval: tab === "health" ? 10000 : false,
  });

  const { data: userDetailData } = useQuery({
    queryKey: ["admin-user-detail", selectedUser],
    queryFn: async () => {
      const res = await fetch(`/api/admin/users/${selectedUser}`, {
        headers: { Authorization: `Bearer ${localStorage.getItem("bearer_token") ?? ""}` },
      });
      return res.json();
    },
    enabled: !!selectedUser,
  });

  const toggleAdminMutation = useMutation({
    mutationFn: async ({ userId, isAdmin }: { userId: string; isAdmin: boolean }) => {
      const res = await fetch(`/api/admin/users/${userId}`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${localStorage.getItem("bearer_token") ?? ""}`,
        },
        body: JSON.stringify({ isAdmin }),
      });
      return res.json();
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["admin-users"] }),
  });

  const stats = (statsData as any)?.stats;

  const tabs: { key: Tab; label: string; icon: any }[] = [
    { key: "overview", label: "Overview", icon: BarChart3 },
    { key: "users", label: "Users", icon: Users },
    { key: "analyses", label: "Analyses", icon: FileText },
    { key: "audit", label: "Audit Logs", icon: ShieldAlert },
    { key: "health", label: "System Health", icon: Activity },
  ];

  if (statsLoading && tab === "overview") {
    return (
      <div style={{ padding: "40px", textAlign: "center", color: "var(--text-muted)" }}>
        Checking access…
      </div>
    );
  }

  if (!statsData && !statsLoading) {
    return (
      <div style={{ padding: "40px", maxWidth: "500px", margin: "0 auto", textAlign: "center" }}>
        <ShieldAlert size={40} color="#ef4444" style={{ marginBottom: "16px" }} />
        <h2 style={{ fontFamily: "Poppins, sans-serif", color: "var(--text-primary)", marginBottom: "8px" }}>Access Denied</h2>
        <p style={{ color: "var(--text-muted)", fontSize: "13px" }}>Admin privileges required. Contact your system administrator.</p>
        <Link to="/" style={{ color: "var(--accent-gold)", fontSize: "13px" }}>← Back to dashboard</Link>
      </div>
    );
  }

  return (
    <div style={{ padding: "32px", maxWidth: "1200px", margin: "0 auto" }}>
      {/* Header */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "32px" }}>
        <div>
          <h1 style={{ fontFamily: "Poppins, sans-serif", fontSize: "1.5rem", fontWeight: 700, color: "var(--text-primary)", marginBottom: "4px", display: "flex", alignItems: "center", gap: "10px" }}>
            <Crown size={18} color="var(--accent-gold)" /> Admin Panel
          </h1>
          <p style={{ color: "var(--text-muted)", fontSize: "13px" }}>Signed in as {session?.user?.email}</p>
        </div>
        <Link to="/" style={{ color: "var(--text-muted)", fontSize: "12px", textDecoration: "none" }}>← Dashboard</Link>
      </div>

      {/* Tabs */}
      <div style={{ display: "flex", gap: "4px", marginBottom: "28px", background: "var(--bg-secondary)", border: "1px solid var(--border)", borderRadius: "8px", padding: "4px", width: "fit-content" }}>
        {tabs.map(({ key, label, icon: Icon }) => (
          <button
            key={key}
            onClick={() => { setTab(key); setSelectedUser(null); }}
            style={{
              display: "flex",
              alignItems: "center",
              gap: "6px",
              padding: "7px 14px",
              borderRadius: "5px",
              border: "none",
              background: tab === key ? "var(--bg-tertiary)" : "transparent",
              color: tab === key ? "var(--text-primary)" : "var(--text-muted)",
              fontSize: "12px",
              fontWeight: tab === key ? 600 : 400,
              cursor: "pointer",
              fontFamily: "Poppins, sans-serif",
            }}
          >
            <Icon size={13} /> {label}
          </button>
        ))}
      </div>

      {/* Overview */}
      {tab === "overview" && stats && (
        <div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: "16px", marginBottom: "32px" }}>
            {[
              { label: "Total Users", value: stats.totalUsers, icon: Users, color: "#d4a843" },
              { label: "Total Analyses", value: stats.totalAnalyses, icon: FileText, color: "#00d4aa" },
              { label: "Today's Analyses", value: stats.todayAnalyses, icon: Activity, color: "#8b5cf6" },
              { label: "Success Rate", value: `${stats.successRate}%`, icon: TrendingUp, color: "#10b981" },
            ].map(({ label, value, icon: Icon, color }) => (
              <div key={label} style={{
                background: "var(--bg-secondary)",
                border: "1px solid var(--border)",
                borderRadius: "10px",
                padding: "20px",
              }}>
                <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "12px" }}>
                  <div style={{
                    width: "30px", height: "30px",
                    background: `${color}18`,
                    border: `1px solid ${color}40`,
                    borderRadius: "6px",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                  }}>
                    <Icon size={14} color={color} />
                  </div>
                  <span style={{ fontSize: "11px", color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.06em" }}>{label}</span>
                </div>
                <div style={{ fontFamily: "Poppins, sans-serif", fontWeight: 700, fontSize: "1.8rem", color: "var(--text-primary)" }}>
                  {value}
                </div>
              </div>
            ))}
          </div>

          <div style={{
            background: "var(--bg-secondary)",
            border: "1px solid var(--border)",
            borderRadius: "10px",
            padding: "20px",
          }}>
            <h3 style={{ fontFamily: "Poppins, sans-serif", fontSize: "13px", fontWeight: 600, color: "var(--text-primary)", marginBottom: "12px" }}>
              Cost Estimates
            </h3>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: "16px" }}>
              {[
                { label: "Per analysis (avg)", value: "~$3" },
                { label: "Completed this month", value: stats.completedAnalyses },
                { label: "Est. monthly API cost", value: `~$${stats.completedAnalyses * 3}` },
              ].map(({ label, value }) => (
                <div key={label}>
                  <div style={{ fontSize: "11px", color: "var(--text-muted)", marginBottom: "4px" }}>{label}</div>
                  <div style={{ fontFamily: "JetBrains Mono, monospace", fontSize: "1rem", fontWeight: 600, color: "var(--text-primary)" }}>{value}</div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Users */}
      {tab === "users" && (
        <div>
          {selectedUser && userDetailData ? (
            <div>
              <button
                onClick={() => setSelectedUser(null)}
                style={{ background: "none", border: "none", color: "var(--text-muted)", cursor: "pointer", fontSize: "13px", marginBottom: "20px", display: "flex", alignItems: "center", gap: "6px" }}
              >
                ← All Users
              </button>
              <div style={{
                background: "var(--bg-secondary)",
                border: "1px solid var(--border)",
                borderRadius: "10px",
                padding: "24px",
                marginBottom: "20px",
              }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
                  <div>
                    <h2 style={{ fontFamily: "Poppins, sans-serif", fontWeight: 700, fontSize: "1.1rem", color: "var(--text-primary)", marginBottom: "4px" }}>
                      {(userDetailData as any).user.name}
                    </h2>
                    <p style={{ color: "var(--text-muted)", fontSize: "13px" }}>{(userDetailData as any).user.email}</p>
                  </div>
                  <div style={{ display: "flex", gap: "8px" }}>
                    <button
                      onClick={() => toggleAdminMutation.mutate({ userId: selectedUser, isAdmin: !(userDetailData as any).user.isAdmin })}
                      style={{
                        padding: "7px 14px",
                        background: (userDetailData as any).user.isAdmin ? "rgba(239,68,68,0.1)" : "rgba(212,168,67,0.1)",
                        border: `1px solid ${(userDetailData as any).user.isAdmin ? "rgba(239,68,68,0.3)" : "rgba(212,168,67,0.3)"}`,
                        borderRadius: "6px",
                        color: (userDetailData as any).user.isAdmin ? "#ef4444" : "var(--accent-gold)",
                        fontSize: "12px",
                        cursor: "pointer",
                        fontWeight: 600,
                      }}
                    >
                      {(userDetailData as any).user.isAdmin ? "Revoke Admin" : "Make Admin"}
                    </button>
                  </div>
                </div>
                <div style={{ display: "flex", gap: "24px", marginTop: "16px" }}>
                  {[
                    { label: "Joined", value: formatDate((userDetailData as any).user.createdAt) },
                    { label: "Docs this month", value: (userDetailData as any).user.docsUsedThisMonth ?? 0 },
                    { label: "Admin", value: (userDetailData as any).user.isAdmin ? "Yes" : "No" },
                  ].map(({ label, value }) => (
                    <div key={label}>
                      <div style={{ fontSize: "11px", color: "var(--text-muted)", marginBottom: "2px" }}>{label}</div>
                      <div style={{ fontSize: "13px", color: "var(--text-primary)", fontWeight: 500 }}>{value}</div>
                    </div>
                  ))}
                </div>
              </div>
              {/* User analyses */}
              <h3 style={{ fontFamily: "Poppins, sans-serif", fontSize: "13px", fontWeight: 600, color: "var(--text-primary)", marginBottom: "12px" }}>
                Recent Analyses ({(userDetailData as any).analyses.length})
              </h3>
              <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
                {(userDetailData as any).analyses.map((a: any) => (
                  <div key={a.id} style={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    background: "var(--bg-secondary)",
                    border: "1px solid var(--border)",
                    borderRadius: "8px",
                    padding: "12px 16px",
                  }}>
                    <div>
                      <div style={{ fontSize: "13px", color: "var(--text-primary)", fontWeight: 500 }}>{a.filename ?? "Untitled"}</div>
                      <div style={{ fontSize: "11px", color: "var(--text-muted)" }}>{formatDate(a.createdAt)}</div>
                    </div>
                    <div style={{ display: "flex", gap: "8px", alignItems: "center" }}>
                      {a.score != null && <ScoreBadge score={a.score} />}
                      <span style={{ fontSize: "11px", color: "var(--text-muted)" }}>{a.status}</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ) : (
            <div>
              <div style={{ overflowX: "auto" }}>
                <table style={{ width: "100%", borderCollapse: "collapse" }}>
                  <thead>
                    <tr style={{ borderBottom: "1px solid var(--border)" }}>
                      {["Name", "Email", "Admin", "Docs This Month", "Joined", ""].map(h => (
                        <th key={h} style={{ textAlign: "left", padding: "10px 12px", fontSize: "11px", color: "var(--text-muted)", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.05em" }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {((usersData as any)?.users ?? []).map((u: any) => (
                      <tr key={u.id} style={{ borderBottom: "1px solid var(--border)" }}>
                        <td style={{ padding: "12px", fontSize: "13px", color: "var(--text-primary)", fontWeight: 500 }}>{u.name}</td>
                        <td style={{ padding: "12px", fontSize: "13px", color: "var(--text-muted)" }}>{u.email}</td>
                        <td style={{ padding: "12px" }}>
                          {u.isAdmin ? <CheckCircle size={14} color="#10b981" /> : <XCircle size={14} color="#ef4444" />}
                        </td>
                        <td style={{ padding: "12px", fontSize: "13px", color: "var(--text-muted)", fontFamily: "JetBrains Mono, monospace" }}>{u.docsUsedThisMonth ?? 0}</td>
                        <td style={{ padding: "12px", fontSize: "12px", color: "var(--text-muted)" }}>{formatDate(u.createdAt)}</td>
                        <td style={{ padding: "12px" }}>
                          <button
                            onClick={() => setSelectedUser(u.id)}
                            style={{ background: "none", border: "none", cursor: "pointer", color: "var(--accent-gold)", display: "flex", alignItems: "center", gap: "4px", fontSize: "12px" }}
                          >
                            View <ChevronRight size={13} />
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Analyses */}
      {tab === "analyses" && (
        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead>
              <tr style={{ borderBottom: "1px solid var(--border)" }}>
                {["File", "Status", "Score", "Risk", "Perspective", "User ID", "Date"].map(h => (
                  <th key={h} style={{ textAlign: "left", padding: "10px 12px", fontSize: "11px", color: "var(--text-muted)", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.05em" }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {((analysesData as any)?.analyses ?? []).map((a: any) => (
                <tr key={a.id} style={{ borderBottom: "1px solid var(--border)" }}>
                  <td style={{ padding: "12px", fontSize: "13px", color: "var(--text-primary)", maxWidth: "200px", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    <Link to={`/reports/${a.id}`} style={{ color: "var(--accent-gold)", textDecoration: "none" }}>
                      {a.filename ?? "Untitled"}
                    </Link>
                  </td>
                  <td style={{ padding: "12px" }}>
                    <span style={{
                      fontSize: "11px",
                      padding: "2px 8px",
                      borderRadius: "4px",
                      background: a.status === "complete" ? "rgba(16,185,129,0.1)" : a.status === "error" ? "rgba(239,68,68,0.1)" : "rgba(212,168,67,0.1)",
                      color: a.status === "complete" ? "#10b981" : a.status === "error" ? "#ef4444" : "var(--accent-gold)",
                    }}>{a.status}</span>
                  </td>
                  <td style={{ padding: "12px" }}>{a.score != null ? <ScoreBadge score={a.score} /> : "—"}</td>
                  <td style={{ padding: "12px", fontSize: "12px", color: getRiskColor(a.riskLevel) }}>{a.riskLevel ?? "—"}</td>
                  <td style={{ padding: "12px", fontSize: "11px", color: "var(--text-muted)" }}>{a.reviewPerspective}</td>
                  <td style={{ padding: "12px", fontSize: "11px", color: "var(--text-muted)", fontFamily: "JetBrains Mono, monospace" }}>{a.userId ? a.userId.slice(0, 8) + "…" : "—"}</td>
                  <td style={{ padding: "12px", fontSize: "11px", color: "var(--text-muted)" }}>{formatDate(a.createdAt)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Audit Logs */}
      {tab === "audit" && (
        <div>
          <div style={{
            background: "rgba(212,168,67,0.06)",
            border: "1px solid rgba(212,168,67,0.2)",
            borderRadius: "8px",
            padding: "12px 16px",
            fontSize: "12px",
            color: "var(--text-muted)",
            marginBottom: "16px",
          }}>
            Audit log is append-only. No actions can be deleted.
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: "4px" }}>
            {((auditData as any)?.logs ?? []).map((log: any) => (
              <div key={log.id} style={{
                display: "flex",
                alignItems: "center",
                gap: "12px",
                padding: "10px 14px",
                background: "var(--bg-secondary)",
                border: "1px solid var(--border)",
                borderRadius: "6px",
                fontSize: "12px",
              }}>
                <span style={{ color: "var(--text-muted)", fontFamily: "JetBrains Mono, monospace", flexShrink: 0 }}>
                  {formatDate(log.createdAt)}
                </span>
                <span style={{
                  padding: "2px 8px",
                  borderRadius: "4px",
                  background: "rgba(139,92,246,0.1)",
                  color: "#8b5cf6",
                  fontWeight: 600,
                  flexShrink: 0,
                }}>
                  {log.action}
                </span>
                {log.resourceType && <span style={{ color: "var(--text-muted)" }}>{log.resourceType}</span>}
                {log.userId && (
                  <span style={{ color: "var(--text-muted)", fontFamily: "JetBrains Mono, monospace" }}>
                    user:{log.userId.slice(0, 8)}…
                  </span>
                )}
              </div>
            ))}
            {((auditData as any)?.logs ?? []).length === 0 && (
              <p style={{ color: "var(--text-muted)", fontSize: "13px", textAlign: "center", padding: "40px" }}>
                No audit events yet.
              </p>
            )}
          </div>
        </div>
      )}

      {/* System Health */}
      {tab === "health" && (
        <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
          <div style={{
            background: "var(--bg-secondary)", border: "1px solid var(--border)",
            borderRadius: "10px", padding: "24px",
          }}>
            <div style={{ fontFamily: "Poppins, sans-serif", fontWeight: 600, fontSize: "14px", marginBottom: "16px" }}>
              System Status
            </div>
            {healthData ? (
              <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
                <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
                  <div style={{
                    width: "10px", height: "10px", borderRadius: "50%",
                    background: (healthData as any).status === "ok" ? "var(--risk-low)" : "var(--risk-critical)",
                  }} />
                  <span style={{ fontWeight: 600, fontSize: "14px" }}>
                    {(healthData as any).status === "ok" ? "All systems operational" : "Degraded"}
                  </span>
                </div>
                {[
                  ["Database", (healthData as any).db?.ok ? "Healthy" : "Error", (healthData as any).db?.ok],
                  ["DB Latency", `${(healthData as any).db?.latencyMs ?? "—"}ms`, true],
                  ["Uptime", `${Math.floor(((healthData as any).uptime ?? 0) / 3600)}h ${Math.floor((((healthData as any).uptime ?? 0) % 3600) / 60)}m`, true],
                  ["Checked", (healthData as any).timestamp ? new Date((healthData as any).timestamp).toLocaleTimeString() : "—", true],
                ].map(([label, value, ok]) => (
                  <div key={String(label)} style={{
                    display: "flex", justifyContent: "space-between", alignItems: "center",
                    padding: "10px 14px", background: "var(--bg-tertiary)", borderRadius: "6px", border: "1px solid var(--border)",
                  }}>
                    <span style={{ fontSize: "13px", color: "var(--text-secondary)" }}>{label}</span>
                    <span style={{ fontSize: "13px", fontWeight: 500, color: ok ? "var(--text-primary)" : "var(--risk-critical)" }}>{String(value)}</span>
                  </div>
                ))}
              </div>
            ) : (
              <p style={{ color: "var(--text-muted)", fontSize: "13px" }}>Loading health data…</p>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
