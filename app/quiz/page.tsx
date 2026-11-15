import SiteHeader from "@/components/site-header";
import SiteFooter from "@/components/site-footer";
import QuizRunner from "./quiz-runner";
import { getSiteMedia } from "@/lib/public-content";

export const dynamic = "force-dynamic";
export const metadata = {
  title: "Quiz & connaissances | AJECCH",
  description: "Participez aux quiz de connaissance de l’AJECCH et suivez votre score personnel."
};

export default async function QuizPage() {
  const media = await getSiteMedia();
  const logoUrl = media["brand.logo"] ?? null;
  return (
    <main className="ajecch-home">
      <SiteHeader logoUrl={logoUrl} />
      <section className="section-shell quiz-page-section">
        <div className="container">
          <QuizRunner />
        </div>
      </section>
      <SiteFooter logoUrl={logoUrl} />
    </main>
  );
}
