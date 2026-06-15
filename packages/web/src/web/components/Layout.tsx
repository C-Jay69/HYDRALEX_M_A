import { Link, useLocation } from "wouter";
import { LayoutDashboard, FilePlus, Scale, Tag, Crown, LogOut, User } from "lucide-react";
import { authClient, clearToken } from "../lib/auth";

interface LayoutProps {
  children: React.ReactNode;
}

export default function Layout({ children }: LayoutProps) {
  const [location] = useLocation();
  const { data: session } = authClient.useSession();

  const navItems = [
    { href: "/", label: "Dashboard", icon: LayoutDashboard },
    { href: "/analyze", label: "New Analysis", icon: FilePlus },
    { href: "/pricing", label: "Pricing", icon: Tag },
  ];

  async function handleSignOut() {
    await authClient.signOut();
    clearToken();
    window.location.href = "/sign-in";
  }

  return (
    <div style={{ display: "flex", height: "100vh", overflow: "hidden" }}>
      {/* Sidebar */}
      <aside
        style={{
          width: "220px",
          flexShrink: 0,
          background: "var(--bg-secondary)",
          borderRight: "1px solid var(--border)",
          display: "flex",
          flexDirection: "column",
          padding: "0",
        }}
      >
        {/* Logo */}
        <div
          style={{
            padding: "24px 20px 20px",
            borderBottom: "1px solid var(--border)",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
            <div
              style={{
                width: "32px",
                height: "32px",
                background: "var(--accent-gold-bg)",
                border: "1px solid rgba(212,168,67,0.3)",
                borderRadius: "6px",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              <Scale size={16} color="var(--accent-gold)" />
            </div>
            <div>
              <div
                style={{
                  fontFamily: "Poppins, sans-serif",
                  fontWeight: 700,
                  fontSize: "13px",
                  color: "var(--text-primary)",
                  lineHeight: 1.2,
                }}
              >
                Hydraforge
              </div>
              <div
                style={{
                  fontSize: "10px",
                  color: "var(--text-muted)",
                  textTransform: "uppercase",
                  letterSpacing: "0.08em",
                }}
              >
                M&A Intelligence
              </div>
            </div>
          </div>
        </div>

        {/* Nav */}
        <nav style={{ padding: "12px 8px", flex: 1 }}>
          {navItems.map(({ href, label, icon: Icon }) => {
            const active = location === href;
            return (
              <Link key={href} to={href}>
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: "10px",
                    padding: "9px 12px",
                    borderRadius: "6px",
                    cursor: "pointer",
                    marginBottom: "2px",
                    background: active ? "var(--bg-tertiary)" : "transparent",
                    color: active ? "var(--text-primary)" : "var(--text-secondary)",
                    borderLeft: active
                      ? "2px solid var(--accent-gold)"
                      : "2px solid transparent",
                    transition: "all 0.15s",
                    fontSize: "13px",
                    fontWeight: active ? 500 : 400,
                  }}
                >
                  <Icon size={15} />
                  {label}
                </div>
              </Link>
            );
          })}

          {/* Admin link — only shown if user is logged in, we don't know admin status here so show always and let page guard */}
          {session && (
            <Link to="/admin">
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: "10px",
                  padding: "9px 12px",
                  borderRadius: "6px",
                  cursor: "pointer",
                  marginBottom: "2px",
                  background: location === "/admin" ? "var(--bg-tertiary)" : "transparent",
                  color: location === "/admin" ? "var(--accent-gold)" : "var(--text-muted)",
                  borderLeft: location === "/admin"
                    ? "2px solid var(--accent-gold)"
                    : "2px solid transparent",
                  transition: "all 0.15s",
                  fontSize: "13px",
                }}
              >
                <Crown size={15} />
                Admin
              </div>
            </Link>
          )}
        </nav>

        {/* User / Auth footer */}
        <div
          style={{
            padding: "12px 8px",
            borderTop: "1px solid var(--border)",
          }}
        >
          {session ? (
            <div>
              <div style={{
                display: "flex",
                alignItems: "center",
                gap: "8px",
                padding: "8px 12px",
                marginBottom: "4px",
              }}>
                <div style={{
                  width: "24px", height: "24px",
                  background: "var(--accent-gold-bg)",
                  borderRadius: "50%",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  flexShrink: 0,
                }}>
                  <User size={12} color="var(--accent-gold)" />
                </div>
                <div style={{ overflow: "hidden" }}>
                  <div style={{ fontSize: "12px", color: "var(--text-primary)", fontWeight: 500, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {session.user.name}
                  </div>
                  <div style={{ fontSize: "10px", color: "var(--text-muted)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {session.user.email}
                  </div>
                </div>
              </div>
              <button
                onClick={handleSignOut}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: "8px",
                  width: "100%",
                  padding: "8px 12px",
                  borderRadius: "6px",
                  background: "none",
                  border: "none",
                  color: "var(--text-muted)",
                  fontSize: "12px",
                  cursor: "pointer",
                }}
              >
                <LogOut size={13} /> Sign out
              </button>
            </div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: "4px" }}>
              <Link to="/sign-in">
                <div style={{
                  padding: "8px 12px",
                  borderRadius: "6px",
                  fontSize: "12px",
                  color: "var(--text-muted)",
                  cursor: "pointer",
                  fontWeight: 500,
                }}>
                  Sign in
                </div>
              </Link>
              <Link to="/sign-up">
                <div style={{
                  padding: "8px 12px",
                  borderRadius: "6px",
                  background: "var(--accent-gold-bg)",
                  fontSize: "12px",
                  color: "var(--accent-gold)",
                  cursor: "pointer",
                  fontWeight: 600,
                  textAlign: "center",
                }}>
                  Get started free
                </div>
              </Link>
            </div>
          )}
        </div>
      </aside>

      {/* Main */}
      <main
        style={{
          flex: 1,
          overflow: "auto",
          background: "var(--bg-primary)",
        }}
      >
        {children}
      </main>
    </div>
  );
}
