import { Suspense } from "react";
import LoginForm from "./login-form";
import { createClient } from "@/lib/supabase/server";

export const metadata = {
  title: "Connexion administration | AJECCH",
  robots: { index: false, follow: false }
};

export default async function AdminLoginPage() {
  const supabase = await createClient();
  const { data: firstAdminSetupAvailable } = await supabase.rpc("ajecch_setup_available");
  const { data: secondAdminSignupAvailable } = await supabase.rpc("ajecch_second_admin_signup_available");

  return (
    <main className="admin-auth-page">
      <section className="admin-auth-card">
        <a className="admin-auth-brand" href="/">AJECCH <span>· ESPACE DE GESTION</span></a>
        <p className="admin-eyebrow">ACCÈS RÉSERVÉ</p>
        <h1>Administration</h1>
        <p className="admin-auth-description">Connectez-vous avec l’adresse e-mail et le mot de passe du compte administrateur autorisé.</p>
        <Suspense fallback={<p>Chargement du formulaire…</p>}><LoginForm /></Suspense>
        {firstAdminSetupAvailable && (
          <div className="admin-signup-prompt">
            <span>Première configuration du site ?</span>
            <a className="admin-back-link" href="/administration/inscription">Créer le premier compte administrateur</a>
          </div>
        )}
        {!firstAdminSetupAvailable && secondAdminSignupAvailable && (
          <div className="admin-signup-prompt">
            <span>Vous êtes invité à demander le second accès ADM ?</span>
            <a className="admin-back-link" href="/administration/inscription">Créer un compte et demander l’accès ADM</a>
          </div>
        )}
        <a className="admin-back-link" href="/">← Retour au site public</a>
      </section>
    </main>
  );
}
