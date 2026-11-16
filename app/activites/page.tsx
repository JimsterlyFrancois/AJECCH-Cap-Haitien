import SiteHeader from "@/components/site-header";
import SiteFooter from "@/components/site-footer";
import { getPublishedPosts, getSiteMedia } from "@/lib/public-content";

export const metadata = {
  title: "Activités | AJECCH",
  description: "Les activités et événements publiés par l’Association des Jeunes Chrétiens du Cap-Haïtien."
};

export const dynamic = "force-dynamic";

export default async function ActivitiesPage() {
  const [media, posts] = await Promise.all([getSiteMedia(), getPublishedPosts()]);
  const events = posts.filter((post) => post.category === "event");
  const logoUrl = media["brand.logo"] ?? null;

  return (
    <>
      <SiteHeader active="/activites" logoUrl={logoUrl} />
      <main>
        <section className="page-hero">
          <div className="container">
            <div className="section-kicker">INFORMATIONS PUBLIÉES</div>
            <h1>Nos <em>activités.</em></h1>
            <p>Consultez les activités et événements annoncés par les responsables de l’association.</p>
            <div className="breadcrumb"><a href="/">Accueil</a><span>/</span>Activités</div>
          </div>
        </section>
        <section className="section-pad">
          <div className="container">
            <div className="section-heading">
              <div>
                <div className="section-kicker">AGENDA DE L’ASSOCIATION</div>
                <h2>Les activités <em>publiées.</em></h2>
              </div>
              <p>Seules les activités enregistrées et publiées dans l’espace de gestion apparaissent sur cette page.</p>
            </div>
            {events.length > 0 ? (
              <div className="public-news-list">
                {events.map((event) => (
                  <article className="public-news-card" key={event.id}>
                    <div className="public-news-copy">
                      <span className="public-news-category">Activité annoncée</span>
                      {event.event_starts_at && (
                        <time dateTime={event.event_starts_at}>
                          {new Date(event.event_starts_at).toLocaleString("fr-FR", {
                            day: "numeric", month: "long", year: "numeric",
                            hour: "2-digit", minute: "2-digit"
                          })}
                        </time>
                      )}
                      <h3><a href={`/actualites/${encodeURIComponent(event.slug)}`}>{event.title}</a></h3>
                      {event.excerpt && <p className="public-news-excerpt">{event.excerpt}</p>}
                      {event.event_location && <p>Lieu : {event.event_location}</p>}
                      {event.body && <p>{event.body}</p>}
                      <a className="text-link" href={`/actualites/${encodeURIComponent(event.slug)}`}>Voir les détails <span>↗</span></a>
                    </div>
                  </article>
                ))}
              </div>
            ) : (
              <div className="empty-news">
                <h3>Aucune activité confirmée n’est actuellement publiée.</h3>
                <p>Les activités seront affichées ici uniquement après leur annonce par l’association.</p>
              </div>
            )}
          </div>
        </section>
        <section className="join-section">
          <div className="container join-inner">
            <div className="section-kicker">PARTICIPER</div>
            <h2>Une question sur une activité ?<br /><em>Contactez l’association.</em></h2>
            <p>Pour obtenir des informations, utilisez la page officielle de l’AJECCH.</p>
            <a className="button button-gold" href="/#contact">Contacter AJECCH <span>→</span></a>
          </div>
        </section>
      </main>
      <SiteFooter logoUrl={logoUrl} />
    </>
  );
}
