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
  const params = await searchParams;
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
          <h1>Activer le compte ADM</h1>
          <p className="admin-auth-description">Confirmez l’adresse e-mail du compte initial et utilisez le code privé d’initialisation pour activer l’accès.</p>
          <BootstrapForm />
        </section>
      </main>
    );
  }

  let requestError = params.request === "error";
  if (params.request === "submit") {
    const { error } = await supabase.rpc("ajecch_submit_admin_access_request");
    requestError = Boolean(error);
  }

  const { data: requests } = await supabase.rpc("ajecch_my_admin_access_request");
  const accessRequest = Array.isArray(requests) ? requests[0] : null;

  return (
    <main className="admin-auth-page">
      <section className="admin-auth-card">
        <a className="admin-auth-brand" href="/">AJECCH <span>· ESPACE DE GESTION</span></a>
        {requestError ? (
          <>
            <p className="admin-eyebrow">DEMANDE NON ENREGISTRÉE</p>
            <h1>Action impossible</h1>
            <p className="admin-auth-description">La demande n’a pas pu être enregistrée. Vérifiez que votre adresse e-mail est confirmée et que le poste est encore disponible.</p>
          </>
        ) : accessRequest?.status === "pending" ? (
          <>
            <p className="admin-eyebrow">DEMANDE TRANSMISE</p>
            <h1>En attente de validation</h1>
            <p className="admin-auth-description">Votre compte est créé et votre demande pour l’accès ADM est enregistrée. Les fonctions de gestion seront activées après validation.</p>
            <p className="admin-request-status">Demande envoyée le {new Date(accessRequest.requested_at).toLocaleString("fr-FR")}</p>
          </>
        ) : accessRequest?.status === "rejected" ? (
          <>
            <p className="admin-eyebrow">DEMANDE REFUSÉE</p>
            <h1>Accès non accordé</h1>
            <p className="admin-auth-description">Votre demande d’accès ADM a été refusée. Vous pouvez contacter l’association pour obtenir des informations complémentaires.</p>
          </>
        ) : (
          <>
            <p className="admin-eyebrow">ACCÈS NON AUTORISÉ</p>
            <h1>Aucun rôle actif</h1>
            <p className="admin-auth-description">Ce compte est connecté, mais ne possède aucun accès de gestion actif. Une demande doit être transmise pendant la période d’inscription.</p>
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
