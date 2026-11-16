import type { Metadata } from "next";
import { notFound } from "next/navigation";
import SiteHeader from "@/components/site-header";
import SiteFooter from "@/components/site-footer";
import { getPublishedPosts, getSiteMedia } from "@/lib/public-content";

export const dynamic = "force-dynamic";

type PageProps = {
  params: Promise<{ slug: string }>;
};

async function getPost(slug: string) {
  const posts = await getPublishedPosts();
  return posts.find((post) => post.slug === slug) ?? null;
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { slug } = await params;
  const post = await getPost(slug);
  if (!post) return { title: "Publication introuvable | AJECCH" };

  return {
    title: `${post.title} | AJECCH`,
    description: post.excerpt || post.body.slice(0, 160),
    openGraph: {
      title: post.title,
      description: post.excerpt || post.body.slice(0, 160),
      images: post.cover_url ? [{ url: post.cover_url, alt: post.title }] : []
    }
  };
}

export default async function PublicationPage({ params }: PageProps) {
  const [{ slug }, media] = await Promise.all([params, getSiteMedia()]);
  const post = await getPost(slug);
  if (!post) notFound();

  const logoUrl = media["brand.logo"] ?? null;
  const category = post.category === "event"
    ? "Événement"
    : post.category === "announcement"
      ? "Annonce"
      : "Actualité";

  return (
    <>
      <SiteHeader active="/actualites" logoUrl={logoUrl} />
      <main className="section-pad">
        <div className="container news-layout publication-detail-layout">
          <article className="news-main public-news-card publication-detail-card">
            <div className="public-news-copy">
              <div className="breadcrumb">
                <a href="/">Accueil</a><span>/</span>
                <a href="/actualites">Actualités</a><span>/</span>
                <span>{category}</span>
              </div>
              <span className="public-news-category">{category}</span>
              {post.published_at && (
                <time dateTime={post.published_at}>
                  {new Date(post.published_at).toLocaleDateString("fr-FR", {
                    day: "numeric", month: "long", year: "numeric"
                  })}
                </time>
              )}
              <h1>{post.title}</h1>
              {post.excerpt && <p className="public-news-excerpt">{post.excerpt}</p>}
            </div>
            {post.cover_url ? (
              <img
                className="public-news-cover publication-detail-cover"
                src={post.cover_url}
                alt={`Image de couverture : ${post.title}`}
                fetchPriority="high"
                decoding="async"
              />
            ) : (
              <div className="public-image-empty">Aucune image de couverture pour cette publication</div>
            )}
            <div className="public-news-copy publication-detail-body">
              {post.body && <p>{post.body}</p>}
              {post.category === "event" && (post.event_starts_at || post.event_location) && (
                <p className="public-news-event-meta">
                  {post.event_starts_at && <>Date : {new Date(post.event_starts_at).toLocaleDateString("fr-FR", {
                    day: "numeric", month: "long", year: "numeric"
                  })}</>}
                  {post.event_location && <> · Lieu : {post.event_location}</>}
                </p>
              )}
              <a className="text-link" href="/actualites">← Retour aux actualités</a>
            </div>
          </article>
          <aside className="news-aside">
            <div className="section-kicker">PUBLICATIONS AJECCH</div>
            <h2>Rester informé.</h2>
            <p>Consultez les autres actualités, annonces et événements publiés par l’association.</p>
            <a className="text-link" href="/actualites">Voir toutes les publications <span>↗</span></a>
          </aside>
        </div>
      </main>
      <SiteFooter logoUrl={logoUrl} />
    </>
  );
}
