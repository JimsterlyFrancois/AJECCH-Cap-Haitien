"use client";

import { useEffect, useState } from "react";
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

export default function SiteHeader({ active = "", logoUrl }: { active?: string; logoUrl?: string | null }) {
  const pathname = usePathname();
  const isHome = pathname === "/";
  const [activeSection, setActiveSection] = useState("accueil");
  const [nightMode, setNightMode] = useState(false);
  const [googleEmail, setGoogleEmail] = useState("");
  const [googleLinked, setGoogleLinked] = useState(false);
  const [googleBusy, setGoogleBusy] = useState(false);
  const [googleError, setGoogleError] = useState("");

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
    void supabase.auth.getUser().then(({ data: { user } }) => {
      if (mounted) {
        setGoogleEmail(user?.email ?? "");
        const providers = (user?.app_metadata?.providers ?? []) as string[];
        setGoogleLinked(Boolean(user && (providers.includes("google") || user.app_metadata?.provider === "google")));
      }
    });
    const { data: authListener } = supabase.auth.onAuthStateChange((_event, session) => {
      if (mounted) {
        const user = session?.user;
        setGoogleEmail(user?.email ?? "");
        const providers = (user?.app_metadata?.providers ?? []) as string[];
        setGoogleLinked(Boolean(user && (providers.includes("google") || user.app_metadata?.provider === "google")));
      }
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
    setGoogleBusy(true);
    const supabase = createClient();
    try {
      if (googleLinked) {
        const { error } = await supabase.rpc("ajecch_request_admin_access");
        if (error) throw error;
        window.location.assign("/administration");
        return;
      }

      const { error } = await supabase.auth.signInWithOAuth({
        provider: "google",
        options: {
          redirectTo: `${window.location.origin}/auth/callback?next=%2Fadministration&admin_request=1`,
          scopes: "openid email profile"
        }
      });
      if (error) throw error;
    } catch (err) {
      setGoogleError(err instanceof Error ? err.message : "Connexion Google impossible.");
      setGoogleBusy(false);
    }
  }

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
            <button className="google-connect liquid-control" type="button" onClick={connectGoogle} disabled={googleBusy} title={googleLinked ? `Demander ou consulter un accès administrateur · ${googleEmail}` : "Se connecter avec Google pour demander un accès administrateur"}>
              <span className="google-g" aria-hidden="true">G</span>
              <small>{googleBusy ? "Connexion…" : googleLinked ? "Mon accès admin" : "Connecter Google"}</small>
            </button>
            <a className="nav-cta" href={isHome ? "#contact" : "/#contact"}>Rejoindre <span>↗</span></a>
            {googleError && <span className="google-connect-error" role="alert">{googleError}</span>}
          </div>
        </div>
      </header>
    </div>
  );
}
