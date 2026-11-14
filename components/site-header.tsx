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
      if (mounted) setGoogleEmail(user?.email ?? "");
    });
    const { data: authListener } = supabase.auth.onAuthStateChange((_event, session) => {
      if (mounted) setGoogleEmail(session?.user.email ?? "");
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
    const supabase = createClient();
    await supabase.auth.signInWithOAuth({
      provider: "google",
      options: {
        redirectTo: `${window.location.origin}/auth/callback?next=%2F&subscribe=1`,
        scopes: "openid email profile"
      }
    });
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
            <SiteLogo logoUrl={logoUrl} />
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
            <button className="google-connect liquid-control" type="button" onClick={connectGoogle} title={googleEmail || "Connecter un compte Google"}>
              <span className="google-g" aria-hidden="true">G</span>
              <small>{googleEmail ? "Connecté" : "Connecter Google"}</small>
            </button>
            <a className="nav-cta" href={isHome ? "#contact" : "/#contact"}>Rejoindre <span>↗</span></a>
          </div>
        </div>
      </header>
    </div>
  );
}
