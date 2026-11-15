import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import FirstAdminSignupForm from "./signup-form";

export const dynamic = "force-dynamic";
export const metadata = {
  title: "Créer le premier compte | AJECCH",
  robots: { index: false, follow: false }
};

export default async function FirstAdminSignupPage() {
  const supabase = await createClient();
  const { data: setupAvailable, error } = await supabase.rpc("ajecch_setup_available");

  if (error || !setupAvailable) {
    redirect("/administration/connexion");
  }

  return (
    <main className="admin-auth-page">
      <section className="admin-auth-card">
        <a className="admin-auth-brand" href="/">AJECCH <span>· PREMIÈRE CONFIGURATION</span></a>
        <p className="admin-eyebrow">CRÉATION DU PREMIER COMPTE</p>
        <h1>Créer le compte administrateur</h1>
        <p className="admin-auth-description">
          Créez le compte e-mail et mot de passe du premier responsable. Après la confirmation de l’adresse e-mail, vous pourrez activer le siège Super Admin 1 avec le code privé d’initialisation.
        </p>
        <FirstAdminSignupForm />
        <a className="admin-back-link" href="/administration/connexion">← Retour à la connexion</a>
      </section>
    </main>
  );
}
