"use client";

import { useEffect, useState } from "react";
import type { User } from "@supabase/supabase-js";
import { usePathname } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import SiteLogo from "@/components/site-logo";

const links = [
  { id: "accueil", hash: "#accueil", label: "Accueil" },
  { id: "mission", hash: "#mission", label: "Mission" },
  { id: "actions", hash: "#actions", label: "Actions" },
  { id: "evenements", hash: "#evenements", label: "Événements" },
  { id: "contact", hash: "#contact", label: "Contact" }
];

type AdminAccess = { role: "super_admin" | "publisher"; seat: number } | null;
type AccessRequestStatus = "pending" | "approved" | "rejected" | null;

export default function SiteHeader({ active = "", logoUrl }: { active?: string; logoUrl?: string | null }) {
  const pathname = usePathname();
  const isHome = pathname === "/";
  const [activeSection, setActiveSection] = useState("accueil");
  const [nightMode, setNightMode] = useState(false);
  const [accountEmail, setAccountEmail] = useState("");
  const [accountName, setAccountName] = useState("");
  const [adminAccess, setAdminAccess] = useState<AdminAccess>(null);
  const [accessRequestStatus, setAccessRequestStatus] = useState<AccessRequestStatus>(null);
  const [googleBusy, setGoogleBusy] = useState(false);
  const [googleError, setGoogleError] = useState("");
  const [googleMessage, setGoogleMessage] = useState("");

  useEffect(() => {
    const savedTheme = window.localStorage.getItem("ajecch-theme");
    const prefersNight = window.matchMedia("(prefers-color-scheme: dark)").matches;
    const enabled = savedTheme ? savedTheme === "night" : prefersNight;
    setNightMode(enabled);
    document.documentElement.dataset.theme = enabled ? "night" : "day";
  }, []);

  useEffect(() => {
    const supabase = createClient();
    let mounted = true;

    async function loadAccount(user: User | null) {
      if (!user) {
        if (mounted) {
          setAccountEmail("");
          setAccountName("");
          setAdminAccess(null);
          setAccessRequestStatus(null);
        }
        return;
      }

      const name = user.user_metadata?.full_name || user.user_metadata?.name || user.email?.split("@")[0] || "Compte connecté";
      const [adminResult, requestResult] = await Promise.all([
        supabase
          .from("ajecch_admins")
          .select("role,seat")
          .eq("user_id", user.id)
          .eq("is_active", true)
          .maybeSingle(),
        supabase
          .from("ajecch_admin_access_requests")
          .select("status")
          .eq("user_id", user.id)
          .maybeSingle()
      ]);

      if (!mounted) return;
      setAccountEmail(user.email ?? "");
      setAccountName(String(name));
      setAdminAccess((adminResult.data as AdminAccess) ?? null);
      setAccessRequestStatus((requestResult.data?.status as AccessRequestStatus) ?? null);
    }

    void supabase.auth.getUser().then(({ data: { user } }) => loadAccount(user));
    const { data: authListener } = supabase.auth.onAuthStateChange((_event, session) => {
      void loadAccount(session?.user ?? null);
    });

    return () => {
      mounted = false;
      authListener.subscription.unsubscribe();
    };
  }, []);

  useEffect(() => {
    if (!isHome || !("IntersectionObserver" in window)) return;
    const sections = links
      .map((link) => document.getElementById(link.id))
      .filter((section): section is HTMLElement => Boolean(section));
    const observer = new IntersectionObserver(
      (entries) => {
        const visible = entries
          .filter((entry) => entry.isIntersecting)
          .sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top);
        if (visible[0]?.target instanceof HTMLElement) setActiveSection(visible[0].target.id);
      },
      { rootMargin: "-28% 0px -62% 0px", threshold: 0 }
    );
    sections.forEach((section) => observer.observe(section));
    return () => observer.disconnect();
  }, [isHome]);

  function toggleTheme() {
    const next = !nightMode;
    setNightMode(next);
    document.documentElement.dataset.theme = next ? "night" : "day";
    window.localStorage.setItem("ajecch-theme", next ? "night" : "day");
  }

  async function connectGoogle() {
    setGoogleError("");
    setGoogleMessage("");
    setGoogleBusy(true);
    const supabase = createClient();

    try {
      if (accountEmail) {
        const { error } = await supabase.rpc("ajecch_request_admin_access");
        if (error) throw error;
        setAccessRequestStatus("pending");
        setGoogleMessage("Demande envoyée. Elle sera examinée par un Super Admin.");
        return;
      }

      const { error } = await supabase.auth.signInWithOAuth({
        provider: "google",
        options: {
          // A normal sign-in returns to the public homepage. Admin access is
          // requested separately, only when the signed-in visitor asks for it.
          redirectTo: `${window.location.origin}/auth/callback?next=%2F`,
          scopes: "openid email profile"
        }
      });
      if (error) throw error;
    } catch (err) {
      setGoogleError(err instanceof Error ? err.message : "Connexion Google impossible.");
    } finally {
      setGoogleBusy(false);
    }
  }

  const accountTitle = accountEmail
    ? `${accountName} · ${accountEmail}`
    : "Se connecter avec Google";

  return (
    <div className="site-header-stack">
      <div className="topline">
        <div className="container topline-inner">
          <span>Association des Jeunes Chrétiens du Cap-Haïtien</span>
          <span className="topline-note">Foi · Fraternité · Service</span>
        </div>
      </div>
      <header className="site-header">
        <div className="container nav-wrap">
          <a className="brand" href="/" aria-label="AJECCH, accueil">
            <SiteLogo logoUrl={logoUrl} variant="header" />
            <span className="brand-copy">
              <strong>AJECCH</strong>
              <small>JEUNES CHRÉTIENS · CAP-HAÏTIEN</small>
            </span>
          </a>
          <nav className="main-nav" aria-label="Navigation principale">
            {links.map((link) => {
              const href = isHome ? link.hash : `/${link.hash}`;
              const isActive = isHome && activeSection === link.id;
              return (
                <a key={link.id} className={isActive ? "active" : ""} href={href} aria-current={isActive ? "location" : undefined}>
                  {link.label}
                </a>
              );
            })}
          </nav>
          <div className="nav-actions">
            <button className="theme-toggle liquid-control" type="button" onClick={toggleTheme} aria-label={nightMode ? "Activer le mode jour" : "Activer le mode nuit"} aria-pressed={nightMode}>
              <span aria-hidden="true">{nightMode ? "☀" : "☾"}</span>
              <small>{nightMode ? "Jour" : "Nuit"}</small>
            </button>
            {accountEmail && (
              <a className="nav-cta admin-dashboard-link" href="/administration" title={`${adminAccess ? "Espace de gestion" : "Consulter mon accès AJECCH"} · ${accountEmail}`}>
                {adminAccess ? "Espace admin" : "Mon espace"} <span>↗</span>
              </a>
            )}
            {!adminAccess && (
              <button
                className="google-connect liquid-control"
                type="button"
                onClick={connectGoogle}
                disabled={googleBusy || accessRequestStatus === "pending"}
                title={accountTitle}
              >
                <span className="google-g" aria-hidden="true">{accountEmail ? "✓" : "G"}</span>
                <small>
                  {googleBusy ? "Connexion…" : accountEmail
                    ? accessRequestStatus === "pending" ? "Demande envoyée" : accessRequestStatus === "rejected" ? "Renvoyer la demande" : "Demander un accès"}
                    : "Connecter Google"}
                </small>
              </button>
            )}
            <a className="nav-cta" href={isHome ? "#contact" : "/#contact"}>Rejoindre <span>↗</span></a>
            {googleError && <span className="google-connect-error" role="alert">{googleError}</span>}
            {googleMessage && <span className="google-connect-message" role="status">{googleMessage}</span>}
          </div>
        </div>
      </header>
    </div>
  );
}
