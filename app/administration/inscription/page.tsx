import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import FirstAdminSignupForm from "./signup-form";
import SecondAdminSignupForm from "./second-admin-signup-form";

export const dynamic = "force-dynamic";
export const metadata = {
  title: "Inscription administration | AJECCH",
  robots: { index: false, follow: false }
};

export default async function AdminSignupPage() {
  const supabase = await createClient();
  const { data: setupAvailable } = await supabase.rpc("ajecch_setup_available");

  if (setupAvailable) {
    return (
      <main className="admin-auth-page">
        <section className="admin-auth-card">
          <a className="admin-auth-brand" href="/">AJECCH <span>· PREMIÈRE CONFIGURATION</span></a>
          <p className="admin-eyebrow">CRÉATION DU PREMIER COMPTE</p>
          <h1>Créer le compte administrateur</h1>
          <p className="admin-auth-description">
            Créez le compte e-mail et mot de passe du premier responsable. Après confirmation de l’adresse e-mail, le compte pourra être activé avec le code privé d’initialisation.
          </p>
          <FirstAdminSignupForm />
          <a className="admin-back-link" href="/administration/connexion">← Retour à la connexion</a>
        </section>
      </main>
    );
  }

  const { data: secondSeatAvailable } = await supabase.rpc("ajecch_second_admin_signup_available");
  if (!secondSeatAvailable) {
    return (
      <main className="admin-auth-page">
        <section className="admin-auth-card">
          <a className="admin-auth-brand" href="/">AJECCH <span>· ESPACE DE GESTION</span></a>
          <p className="admin-eyebrow">INSCRIPTION FERMÉE</p>
          <h1>Demande non disponible</h1>
          <p className="admin-auth-description">Le second accès ADM est déjà attribué ou une demande est actuellement en cours de traitement.</p>
          <a className="admin-primary-button admin-back-to-site" href="/administration/connexion">Aller à la connexion</a>
          <a className="admin-back-link" href="/">← Retour au site public</a>
        </section>
      </main>
    );
  }

  return (
    <main className="admin-auth-page">
      <section className="admin-auth-card">
        <a className="admin-auth-brand" href="/">AJECCH <span>· CANDIDATURE ADM</span></a>
        <p className="admin-eyebrow">DEMANDE D’ACCÈS</p>
        <h1>Demander l’accès ADM</h1>
        <p className="admin-auth-description">
          Créez votre compte et confirmez votre adresse e-mail. La demande sera ensuite transmise pour validation. Les fonctions de gestion seront activées uniquement après approbation.
        </p>
        <SecondAdminSignupForm />
        <a className="admin-back-link" href="/administration/connexion">← Retour à la connexion</a>
      </section>
    </main>
  );
}
