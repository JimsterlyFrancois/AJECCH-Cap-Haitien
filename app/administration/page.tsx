import { redirect } from "next/navigation";
import { getAjecchAdmin } from "@/lib/admin-auth";
import AdminConsole from "./admin-console";
import BootstrapForm from "./bootstrap-form";

export const dynamic = "force-dynamic";
export const metadata = {
  title: "Administration | AJECCH",
  robots: { index: false, follow: false }
};

export default async function AdministrationPage({
  searchParams
}: {
  searchParams: Promise<{ request?: string }>;
}) {
  const { supabase, claims, admin } = await getAjecchAdmin();

  if (!claims) redirect("/administration/connexion");
  if (admin) return <AdminConsole admin={admin} />;

  const { data: canBootstrap } = await supabase.rpc("ajecch_setup_available");
  if (canBootstrap) {
    return (
      <main className="admin-auth-page">
        <section className="admin-auth-card">
          <a className="admin-auth-brand" href="/">AJECCH <span>· INITIALISATION</span></a>
          <p className="admin-eyebrow">CONFIGURATION INITIALE</p>
          <h1>Activer le premier Super Admin</h1>
          <p className="admin-auth-description">Connectez-vous avec le compte Google du premier responsable, puis utilisez le code privé d’initialisation pour activer le siège Super Admin 1.</p>
          <BootstrapForm />
        </section>
      </main>
    );
  }

  const { data: accessRequest } = await supabase
    .from("ajecch_admin_access_requests")
    .select("email,display_name,status,requested_at,reviewed_at")
    .eq("user_id", String(claims.sub))
    .maybeSingle();

  const params = await searchParams;
  const requestError = params.request === "error";

  return (
    <main className="admin-auth-page">
      <section className="admin-auth-card">
        <a className="admin-auth-brand" href="/">AJECCH <span>· ESPACE ADMINISTRATEUR</span></a>
        {requestError ? (
          <>
            <p className="admin-eyebrow">DEMANDE NON ENREGISTRÉE</p>
            <h1>Action impossible</h1>
            <p className="admin-auth-description">La demande Google n’a pas pu être enregistrée. Réessayez depuis le bouton « Connecter Google » du site public.</p>
          </>
        ) : accessRequest?.status === "pending" ? (
          <>
            <p className="admin-eyebrow">DEMANDE TRANSMISE</p>
            <h1>En attente de validation</h1>
            <p className="admin-auth-description">La demande d’accès pour <strong>{accessRequest.email}</strong> a été transmise aux Super Admin de l’AJECCH. L’accès de gestion sera activé après leur approbation.</p>
            <p className="admin-request-status">Demande envoyée le {new Date(accessRequest.requested_at).toLocaleString("fr-FR")}</p>
          </>
        ) : accessRequest?.status === "rejected" ? (
          <>
            <p className="admin-eyebrow">DEMANDE REFUSÉE</p>
            <h1>Accès non accordé</h1>
            <p className="admin-auth-description">La demande liée à <strong>{accessRequest.email}</strong> a été refusée. Contactez un Super Admin de l’AJECCH avant de soumettre une nouvelle demande.</p>
          </>
        ) : (
          <>
            <p className="admin-eyebrow">ACCÈS NON AUTORISÉ</p>
            <h1>Aucun rôle actif</h1>
            <p className="admin-auth-description">Ce compte est connecté, mais aucune demande d’accès administrateur n’est enregistrée. Revenez au site public et utilisez « Connecter Google » pour envoyer une demande.</p>
          </>
        )}
        <a className="admin-primary-button admin-back-to-site" href="/">Retour au site public</a>
        <form action="/administration/deconnexion" method="post">
          <button className="admin-secondary-button" type="submit">Se déconnecter</button>
        </form>
      </section>
    </main>
  );
}
