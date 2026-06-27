import { Link, useLocation } from "wouter";
import { LayoutDashboard, FilePlus, Tag, Crown, LogOut, User } from "lucide-react";
import { authClient, clearToken } from "../lib/auth";
import { useQuery } from "@tanstack/react-query";

interface LayoutProps {
  children: React.ReactNode;
}

export default function Layout({ children }: LayoutProps) {
  const [location] = useLocation();
  const { data: session } = authClient.useSession();

  const { data: meData } = useQuery({
    queryKey: ["me"],
    queryFn: async () => {
      const res = await fetch("/api/me", {
        headers: { Authorization: `Bearer ${localStorage.getItem("bearer_token") ?? ""}` },
      });
      if (!res.ok) return null;
      return res.json();
    },
    enabled: !!session,
    staleTime: 60_000,
  });

  const isAdmin = (meData as any)?.isAdmin === true;

  const navItems = [
    { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
    { href: "/analyze", label: "New Analysis", icon: FilePlus },
    { href: "/pricing", label: "Pricing", icon: Tag },
  ];

  async function handleSignOut() {
    await authClient.signOut();
    clearToken();
    window.location.href = "/";
  }

  return (
    <div style={{ display: "flex", height: "100vh", overflow: "hidden" }}>
      {/* Sidebar */}
      <aside style={{
        width: "220px", flexShrink: 0,
        background: "var(--bg-secondary)",
        borderRight: "1px solid var(--border)",
        display: "flex", flexDirection: "column",
      }}>
        {/* Logo */}
        <div style={{ padding: "20px 16px 16px", borderBottom: "1px solid var(--border)" }}>
          <Link to="/dashboard">
            <img
              src="/logo.png"
              alt="HydraForge"
              style={{ width: "140px", height: "auto", display: "block" }}
            />
          </Link>
        </div>

        {/* Nav */}
        <nav style={{ padding: "12px 8px", flex: 1 }}>
          {navItems.map(({ href, label, icon: Icon }) => {
            const active = location === href;
            return (
              <Link key={href} to={href}>
                <div style={{
                  display: "flex", alignItems: "center", gap: "10px",
                  padding: "9px 12px", borderRadius: "6px", cursor: "pointer", marginBottom: "2px",
                  background: active ? "var(--bg-tertiary)" : "transparent",
                  color: active ? "var(--text-primary)" : "var(--text-secondary)",
                  borderLeft: active ? "2px solid var(--accent-gold)" : "2px solid transparent",
                  transition: "all 0.15s", fontSize: "13px", fontWeight: active ? 500 : 400,
                }}>
                  <Icon size={15} />
                  {label}
                </div>
              </Link>
            );
          })}

          {/* Admin link — only shown to admins */}
          {isAdmin && (
            <Link to="/admin">
              <div style={{
                display: "flex", alignItems: "center", gap: "10px",
                padding: "9px 12px", borderRadius: "6px", cursor: "pointer", marginBottom: "2px",
                background: location === "/admin" ? "var(--bg-tertiary)" : "transparent",
                color: location === "/admin" ? "var(--accent-gold)" : "var(--text-muted)",
                borderLeft: location === "/admin" ? "2px solid var(--accent-gold)" : "2px solid transparent",
                transition: "all 0.15s", fontSize: "13px",
              }}>
                <Crown size={15} />
                Admin
              </div>
            </Link>
          )}
        </nav>

        {/* User / Auth footer */}
        <div style={{ padding: "12px 8px", borderTop: "1px solid var(--border)" }}>
          {session ? (
            <div>
              <div style={{ display: "flex", alignItems: "center", gap: "8px", padding: "8px 12px", marginBottom: "4px" }}>
                <div style={{
                  width: "24px", height: "24px",
                  background: "var(--accent-gold-bg)",
                  borderRadius: "50%",
                  display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0,
                }}>
                  <User size={12} color="var(--accent-gold)" />
                </div>
                <div style={{ overflow: "hidden" }}>
                  <div style={{ fontSize: "12px", color: "var(--text-primary)", fontWeight: 500, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {session.user.name}
                  </div>
                  <div style={{ fontSize: "10px", color: "var(--text-muted)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {session.user.email}
                    {isAdmin && <span style={{ marginLeft: "6px", color: "var(--accent-gold)", fontWeight: 700 }}>ADMIN</span>}
                  </div>
                </div>
              </div>
              <button
                onClick={handleSignOut}
                style={{
                  display: "flex", alignItems: "center", gap: "8px", width: "100%",
                  padding: "8px 12px", borderRadius: "6px", background: "none", border: "none",
                  color: "var(--text-muted)", fontSize: "12px", cursor: "pointer",
                }}
              >
                <LogOut size={13} /> Sign out
              </button>
            </div>
          ) : null}
        </div>
      </aside>

      {/* Main */}
      <main style={{ flex: 1, overflow: "auto", background: "var(--bg-primary)" }}>
        {children}
      </main>
    </div>
  );
}
