"use client";

import { FormEvent, useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import type { AjecchAdmin } from "@/lib/admin-auth";

type Tab = "overview" | "media" | "posts" | "team";
type MediaItem = {
  id: string;
  slot: string;
  label: string;
  alt_text: string;
  caption: string | null;
  source_url: string | null;
  storage_path: string | null;
  is_visible: boolean;
};
type PostItem = {
  id: string;
  slug: string;
  title: string;
  excerpt: string;
  body: string;
  category: "news" | "announcement" | "event";
  status: "draft" | "published";
  published_at: string | null;
  event_starts_at: string | null;
  event_ends_at: string | null;
  event_location: string | null;
  cover_media_id: string | null;
};
type TeamItem = AjecchAdmin;
type AccessRequestItem = {
  id: string;
  user_id: string;
  display_name: string;
  email: string;
  status: "pending" | "approved" | "rejected";
  requested_at: string;
};

const SLOT_ORDER = ["brand.logo", "home.hero", "home.actions", "home.gallery", "home.contact"];
const CATEGORY_LABELS = { news: "Actualité", announcement: "Annonce", event: "Événement" };

function messageOf(error: unknown) {
  return error instanceof Error ? error.message : "Une erreur est survenue.";
}
function toLocalInput(value: string | null) {
  if (!value) return "";
  const date = new Date(value);
  const offset = date.getTimezoneOffset();
  return new Date(date.getTime() - offset * 60000).toISOString().slice(0, 16);
}

export default function AdminConsole({ admin }: { admin: AjecchAdmin }) {
  const router = useRouter();
  const supabase = createClient();
  const isSuper = admin.role === "super_admin";
  const [tab, setTab] = useState<Tab>("overview");
  const [media, setMedia] = useState<MediaItem[]>([]);
  const [posts, setPosts] = useState<PostItem[]>([]);
  const [team, setTeam] = useState<TeamItem[]>([]);
  const [accessRequests, setAccessRequests] = useState<AccessRequestItem[]>([]);
  const [requestRoles, setRequestRoles] = useState<Record<string, "super_admin" | "publisher">>({});
  const [busy, setBusy] = useState(false);
  const [loadingData, setLoadingData] = useState(true);
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");

  const loadData = useCallback(async () => {
    setLoadingData(true);
    setError("");
    try {
      const [mediaResult, postResult, teamResult, requestResult] = await Promise.all([
        supabase.from("ajecch_media").select("*").order("slot"),
        supabase.from("ajecch_posts").select("*").order("created_at", { ascending: false }),
        isSuper
          ? supabase.from("ajecch_admins").select("id,user_id,display_name,email,role,seat,is_active").order("role").order("seat")
          : Promise.resolve({ data: [], error: null }),
        isSuper
          ? supabase.from("ajecch_admin_access_requests").select("id,user_id,display_name,email,status,requested_at").eq("status", "pending").order("requested_at", { ascending: true })
          : Promise.resolve({ data: [], error: null })
      ]);

      const failures = [
        mediaResult.error && `Images : ${mediaResult.error.message}`,
        postResult.error && `Publications : ${postResult.error.message}`,
        teamResult.error && `Équipe : ${teamResult.error.message}`,
        requestResult.error && `Demandes d’accès : ${requestResult.error.message}`
      ].filter(Boolean);

      setMedia((mediaResult.data ?? []) as MediaItem[]);
      setPosts((postResult.data ?? []) as PostItem[]);
      setTeam((teamResult.data ?? []) as TeamItem[]);
      setAccessRequests((requestResult.data ?? []) as AccessRequestItem[]);

      if (failures.length) {
        setError(`Certaines données n’ont pas pu être chargées. ${failures.join(" · ")}`);
      }
    } catch (err) {
      setError(`Connexion aux données AJECCH impossible : ${messageOf(err)}`);
    } finally {
      setLoadingData(false);
    }
  }, [isSuper, supabase]);

  useEffect(() => { void loadData(); }, [loadData]);

  async function signOut() {
    await supabase.auth.signOut();
    router.replace("/administration/connexion");
    router.refresh();
  }

  async function saveMedia(item: MediaItem, event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError("");
    setNotice("");
    const form = new FormData(event.currentTarget);
    let uploadedPath: string | null = null;
    try {
      const file = form.get("file");
      const shouldBeVisible = form.get("is_visible") === "on";
      const publishedUses = item.id
        ? posts.filter((post) => post.cover_media_id === item.id && post.status === "published")
        : [];
      if (!shouldBeVisible && publishedUses.length > 0) {
        const titles = publishedUses.map((post) => "« " + post.title + " »").join(", ");
        throw new Error(
          "Cette image est encore utilisée par des publications en ligne : " + titles +
          ". Remplacez d’abord leur couverture ou repassez ces publications en brouillon."
        );
      }
      let storagePath = item.storage_path;
      let sourceUrl = item.source_url;
      if (file instanceof File && file.size > 0) {
        if (file.size > 8 * 1024 * 1024) throw new Error("L’image dépasse la limite de 8 Mo.");
        if (!["image/jpeg", "image/png", "image/webp", "image/avif"].includes(file.type)) {
          throw new Error("Formats acceptés : JPG, PNG, WebP ou AVIF.");
        }
        const extension = file.name.split(".").pop()?.toLowerCase() || "jpg";
        const newPath = `${item.slot.replaceAll(".", "/")}/${crypto.randomUUID()}.${extension}`;
        const { error: uploadError } = await supabase.storage.from("ajecch-public-media").upload(newPath, file, {
          upsert: false,
          contentType: file.type,
          cacheControl: "31536000"
        });
        if (uploadError) throw uploadError;
        uploadedPath = newPath;
        storagePath = newPath;
        sourceUrl = null;
      }
      const updates = {
        slot: item.slot,
        label: String(form.get("label") ?? item.label).trim(),
        alt_text: String(form.get("alt_text") ?? item.alt_text).trim(),
        caption: String(form.get("caption") ?? "").trim() || null,
        storage_path: storagePath,
        source_url: sourceUrl,
        is_visible: shouldBeVisible,
        updated_by: admin.user_id
      };
      const { error: saveError } = await supabase.from("ajecch_media").upsert(updates, { onConflict: "slot" });
      if (saveError) throw saveError;
      uploadedPath = null;
      let cleanupWarning = "";
      if (item.storage_path && item.storage_path !== storagePath) {
        const { error: cleanupError } = await supabase.storage.from("ajecch-public-media").remove([item.storage_path]);
        if (cleanupError) cleanupWarning = " Le nouveau visuel est actif, mais l’ancien fichier n’a pas pu être supprimé.";
      }
      setNotice(`Image « ${updates.label} » mise à jour.${cleanupWarning}`);
      await loadData();
    } catch (err) {
      if (uploadedPath) {
        await supabase.storage.from("ajecch-public-media").remove([uploadedPath]);
      }
      setError(messageOf(err));
    } finally {
      setBusy(false);
    }
  }

  async function deleteMedia(item: MediaItem) {
    if (!item.id) {
      setMedia((current) => current.filter((entry) => entry.slot !== item.slot));
      return;
    }

    const linkedPosts = posts.filter((post) => post.cover_media_id === item.id);
    if (linkedPosts.length > 0) {
      const titles = linkedPosts.map((post) => "« " + post.title + " »").join(", ");
      setError(
        "Suppression bloquée : cette image est encore associée à " + linkedPosts.length +
        " publication(s) : " + titles +
        ". Retirez ou remplacez d’abord la couverture dans l’onglet Publications."
      );
      return;
    }

    if (!window.confirm("Supprimer définitivement « " + item.label + " » ? Le visuel disparaîtra de son emplacement public. Cette action ne peut pas être annulée.")) return;
    setBusy(true);
    setError("");
    setNotice("");

    let hidden = false;
    try {
      // Hide the record first. If Storage fails, the metadata stays available for a safe retry.
      const { error: hideError } = await supabase
        .from("ajecch_media")
        .update({ is_visible: false, updated_by: admin.user_id })
        .eq("id", item.id);
      if (hideError) throw hideError;
      hidden = true;

      setMedia((current) =>
        current.map((entry) => entry.id === item.id ? { ...entry, is_visible: false } : entry)
      );

      if (item.storage_path) {
        const { error: storageError } = await supabase
          .storage
          .from("ajecch-public-media")
          .remove([item.storage_path]);
        if (storageError) {
          throw new Error(
            "Le visuel a été masqué, mais le fichier n’a pas pu être supprimé du stockage : " +
            storageError.message + ". Vous pouvez relancer la suppression."
          );
        }
      }

      const { error: deleteError } = await supabase
        .from("ajecch_media")
        .delete()
        .eq("id", item.id);
      if (deleteError) {
        throw new Error(
          "Le fichier a été supprimé et le visuel est masqué, mais son entrée reste à nettoyer : " +
          deleteError.message + ". Relancez la suppression."
        );
      }

      setNotice("Visuel supprimé du site et du stockage.");
      await loadData();
    } catch (err) {
      setError(messageOf(err));
      if (hidden) await loadData();
    } finally {
      setBusy(false);
    }
  }

  async function savePost(post: Partial<PostItem>, event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    setBusy(true);
    setError("");
    setNotice("");
    try {
      const title = String(form.get("title") ?? "").trim();
      const slug = String(form.get("slug") ?? "").trim().toLowerCase();
      if (!title || !slug) throw new Error("Le titre et l’identifiant URL sont obligatoires.");
      if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug)) {
        throw new Error("L’identifiant URL doit contenir uniquement des lettres minuscules, des chiffres et des tirets.");
      }
      const status = String(form.get("status")) as "draft" | "published";
      const category = String(form.get("category")) as PostItem["category"];
      if (!["draft", "published"].includes(status) || !["news", "announcement", "event"].includes(category)) {
        throw new Error("Le type ou le statut de la publication est invalide.");
      }
      const starts = String(form.get("event_starts_at") ?? "");
      const ends = String(form.get("event_ends_at") ?? "");
      const startDate = starts ? new Date(starts) : null;
      const endDate = ends ? new Date(ends) : null;
      if (startDate && Number.isNaN(startDate.getTime())) throw new Error("La date de début est invalide.");
      if (endDate && Number.isNaN(endDate.getTime())) throw new Error("La date de fin est invalide.");
      if (endDate && (!startDate || endDate < startDate)) {
        throw new Error("La date de fin doit être postérieure ou égale à la date de début.");
      }
      const values = {
        slug,
        cover_media_id: String(form.get("cover_media_id") ?? "") || null,
        title,
        excerpt: String(form.get("excerpt") ?? "").trim(),
        body: String(form.get("body") ?? "").trim(),
        category,
        status,
        published_at: status === "published" ? (post.published_at ?? new Date().toISOString()) : null,
        event_starts_at: category === "event" && startDate ? startDate.toISOString() : null,
        event_ends_at: category === "event" && endDate ? endDate.toISOString() : null,
        event_location: category === "event" ? String(form.get("event_location") ?? "").trim() || null : null,
        updated_by: admin.user_id,
        ...(post.id ? {} : { created_by: admin.user_id })
      };
      const query = post.id
        ? supabase.from("ajecch_posts").update(values).eq("id", post.id)
        : supabase.from("ajecch_posts").insert(values);
      const { error: saveError } = await query;
      if (saveError) throw saveError;
      setNotice(status === "published" ? "Publication mise en ligne." : "Brouillon enregistré.");
      await loadData();
    } catch (err) {
      setError(messageOf(err));
    } finally {
      setBusy(false);
    }
  }

  async function deletePost(post: PostItem) {
    const hasCover = Boolean(post.cover_media_id);
    const confirmation = hasCover
      ? "Supprimer « " + post.title + " » ? Son image sera conservée dans la bibliothèque des visuels, car elle peut être utilisée ailleurs."
      : "Supprimer « " + post.title + " » ?";
    if (!window.confirm(confirmation)) return;

    setBusy(true);
    setError("");
    setNotice("");
    const { error: deleteError } = await supabase.from("ajecch_posts").delete().eq("id", post.id);
    if (deleteError) {
      setError(deleteError.message);
    } else {
      setNotice(hasCover
        ? "Publication supprimée. Son image reste disponible dans la bibliothèque des visuels."
        : "Publication supprimée.");
      await loadData();
    }
    setBusy(false);
  }

  async function approveAccessRequest(request: AccessRequestItem) {
    setBusy(true);
    setError("");
    setNotice("");
    const role = requestRoles[request.id] ?? "publisher";
    const { error: approveError } = await supabase.rpc("ajecch_approve_admin_access_request", {
      p_request_id: request.id,
      p_role: role
    });
    if (approveError) setError(approveError.message);
    else {
      setNotice(`Accès attribué à ${request.display_name}.`);
      await loadData();
    }
    setBusy(false);
  }

  async function rejectAccessRequest(request: AccessRequestItem) {
    if (!window.confirm(`Refuser la demande d’accès de ${request.display_name} ?`)) return;
    setBusy(true);
    setError("");
    setNotice("");
    const { error: rejectError } = await supabase.rpc("ajecch_reject_admin_access_request", {
      p_request_id: request.id
    });
    if (rejectError) setError(rejectError.message);
    else {
      setNotice(`Demande de ${request.display_name} refusée.`);
      await loadData();
    }
    setBusy(false);
  }

  async function updateAdmin(person: TeamItem, patch: Partial<TeamItem>) {
    setBusy(true);
    setError("");
    const { error: updateError } = await supabase.from("ajecch_admins").update(patch).eq("id", person.id);
    if (updateError) setError(updateError.message);
    else { setNotice("Rôle ou accès mis à jour."); await loadData(); }
    setBusy(false);
  }

  async function revokeAdmin(person: TeamItem) {
    if (person.user_id === admin.user_id) {
      setError("Vous ne pouvez pas supprimer votre propre accès depuis cet écran.");
      return;
    }
    if (!window.confirm(`Révoquer l’accès de ${person.display_name} ?`)) return;
    setBusy(true);
    const { error: revokeError } = await supabase.from("ajecch_admins").delete().eq("id", person.id);
    if (revokeError) setError(revokeError.message);
    else { setNotice("Accès révoqué."); await loadData(); }
    setBusy(false);
  }

  const counts = {
    visibleMedia: media.filter((item) => item.is_visible).length,
    published: posts.filter((item) => item.status === "published").length,
    drafts: posts.filter((item) => item.status === "draft").length
  };

  return (
    <main className="admin-shell">
      <aside className="admin-sidebar">
        <a className="admin-sidebar-brand" href="/">AJECCH <small>GESTION</small></a>
        <div className="admin-user-card">
          <span className="admin-avatar">{admin.display_name.slice(0, 1).toUpperCase()}</span>
          <strong>{admin.display_name}</strong>
          <small>{isSuper ? `SUPER ADMIN · SIÈGE ${admin.seat}` : "PUBLICATION & MÉDIAS"}</small>
        </div>
        <nav className="admin-nav" aria-label="Navigation administration">
          <button className={tab === "overview" ? "active" : ""} onClick={() => setTab("overview")}>Vue générale</button>
          <button className={tab === "media" ? "active" : ""} onClick={() => setTab("media")}>Images publiques</button>
          <button className={tab === "posts" ? "active" : ""} onClick={() => setTab("posts")}>Publications</button>
          {isSuper && <button className={tab === "team" ? "active" : ""} onClick={() => setTab("team")}>Équipe & accès</button>}
        </nav>
        <div className="admin-sidebar-bottom">
          <a href="/" target="_blank" rel="noreferrer">Voir le site public ↗</a>
          <button onClick={signOut}>Se déconnecter</button>
        </div>
      </aside>

      <section className="admin-main">
        <header className="admin-topbar">
          <div><span className="admin-eyebrow">AJECCH · CAP-HAÏTIEN</span><h1>{tab === "overview" ? "Tableau de bord" : tab === "media" ? "Gestion des images" : tab === "posts" ? "Publications" : "Équipe & autorisations"}</h1></div>
          <span className="admin-role-chip">{isSuper ? "Super Admin" : "Éditeur"}</span>
        </header>
        {notice && <p className="admin-notice" role="status">{notice}</p>}
        {error && <p className="admin-alert" role="alert">{error}</p>}
        {loadingData && <p className="admin-empty" role="status">Connexion aux données et aux médias AJECCH…</p>}

        {!loadingData && tab === "overview" && (
          <div className="admin-content">
            <div className="admin-welcome-panel"><div><span className="admin-eyebrow">ESPACE DE GESTION</span><h2>Bonjour, {admin.display_name}.</h2><p>Gérez les informations, les visuels et les annonces affichés sur le site officiel de l’AJECCH.</p></div><a href="/" target="_blank" rel="noreferrer">Ouvrir le site ↗</a></div>
            <div className="admin-stat-grid">
              <article><span>Visuels visibles</span><strong>{counts.visibleMedia}<small> / {media.length}</small></strong></article>
              <article><span>Publications en ligne</span><strong>{counts.published}</strong></article>
              <article><span>Brouillons</span><strong>{counts.drafts}</strong></article>
            </div>
            <div className="admin-quick-grid">
              <button onClick={() => setTab("media")}><strong>Gérer les images</strong><span>Ajouter, remplacer, masquer ou supprimer les visuels du site public.</span><b>Ouvrir →</b></button>
              <button onClick={() => setTab("posts")}><strong>Écrire une publication</strong><span>Préparer une actualité, une annonce ou un événement.</span><b>Ouvrir →</b></button>
              {isSuper && <button onClick={() => setTab("team")}><strong>Gérer les accès</strong><span>Attribuer les deux sièges Super Admin et le rôle éditeur.</span><b>Ouvrir →</b></button>}
            </div>
            <div className="admin-security-note"><strong>Règles d’accès</strong><p>Les éditeurs gèrent les contenus et les images. Seuls les Super Admin peuvent attribuer, modifier ou révoquer les rôles de l’équipe.</p></div>
          </div>
        )}

        {!loadingData && tab === "media" && (
          <div className="admin-content">
            <div className="admin-section-intro"><h2>Tous les visuels de la page publique</h2><p>Chaque emplacement peut recevoir une nouvelle image, être masqué ou être supprimé. Formats : JPG, PNG, WebP et AVIF · 8 Mo maximum.</p></div>
            <button className="admin-secondary-button admin-add-media" type="button" onClick={() => setMedia((current) => [...current, { id: "", slot: `custom.${crypto.randomUUID()}`, label: "Nouvelle image", alt_text: "", caption: null, source_url: null, storage_path: null, is_visible: false }])}>+ Ajouter un emplacement image</button>
            <div className="admin-media-grid">
              {[...SLOT_ORDER.map((slot) => media.find((entry) => entry.slot === slot) ?? ({ id: "", slot, label: slot, alt_text: "", caption: "", source_url: null, storage_path: null, is_visible: false } as MediaItem)), ...media.filter((entry) => !SLOT_ORDER.includes(entry.slot))].map((item) => {
                const preview = item.storage_path
                  ? supabase.storage.from("ajecch-public-media").getPublicUrl(item.storage_path).data.publicUrl
                  : item.source_url;
                const linkedPosts = item.id
                  ? posts.filter((post) => post.cover_media_id === item.id)
                  : [];
                return (
                  <form className="admin-media-card" key={item.slot} onSubmit={(event) => saveMedia(item, event)}>
                    <div className="admin-media-preview">{preview && item.is_visible ? <img src={preview} alt={item.alt_text || item.label} loading="lazy" decoding="async" /> : <span>Visuel masqué ou absent</span>}</div>
                    <div className="admin-media-fields">
                      <span className="admin-slot">{item.slot}</span>
                      {linkedPosts.length > 0 ? (
                        <p className="admin-media-usage" role="note">
                          Couverture utilisée par {linkedPosts.length} publication(s) : {linkedPosts.map((post) => post.title).join(" · ")}.
                          Remplacez ou retirez cette couverture avant de supprimer le média.
                        </p>
                      ) : (
                        <p className="admin-media-usage is-unused">Aucune publication n’utilise actuellement ce visuel comme couverture.</p>
                      )}
                      <label>Nom de l’image<input name="label" defaultValue={item.label} required /></label>
                      <label>Texte alternatif<input name="alt_text" defaultValue={item.alt_text} placeholder="Description accessible de l’image" /></label>
                      <label>Légende<input name="caption" defaultValue={item.caption ?? ""} placeholder="Légende facultative" /></label>
                      <label className="admin-file-field">Remplacer / téléverser une image<input type="file" name="file" accept="image/jpeg,image/png,image/webp,image/avif" /></label>
                      <label className="admin-checkbox"><input type="checkbox" name="is_visible" defaultChecked={item.is_visible} /> Afficher sur le site public</label>
                      <div className="admin-card-actions">
                        <button className="admin-primary-button" disabled={busy} type="submit">Enregistrer</button>
                        {item.id && (
                          <button
                            className="admin-danger-button"
                            disabled={busy || linkedPosts.length > 0}
                            title={linkedPosts.length > 0 ? "Retirez d’abord cette image des publications qui l’utilisent." : "Supprimer ce média"}
                            type="button"
                            onClick={() => void deleteMedia(item)}
                          >
                            Supprimer
                          </button>
                        )}
                      </div>
                    </div>
                  </form>
                );
              })}
            </div>
          </div>
        )}

        {!loadingData && tab === "posts" && (
          <div className="admin-content">
            <div className="admin-section-intro"><h2>Actualités, annonces et événements</h2><p>Les brouillons ne sont pas visibles du public. Une publication est mise en ligne uniquement lorsque son statut est « Publié ».</p></div>
            <PostEditor key="new-post" media={media} onSave={(event) => savePost({}, event)} busy={busy} />
            <div className="admin-post-list">
              {posts.map((post) => <PostEditor key={post.id} post={post} media={media} onSave={(event) => savePost(post, event)} onDelete={() => void deletePost(post)} busy={busy} />)}
              {posts.length === 0 && <p className="admin-empty">Aucune publication enregistrée.</p>}
            </div>
          </div>
        )}

        {!loadingData && tab === "team" && isSuper && (
          <div className="admin-content">
            <div className="admin-section-intro"><h2>Trois accès administratifs</h2><p>Deux sièges Super Admin disposent du contrôle complet. Le rôle Publication & Médias gère les actualités et les images, sans accès à cette section. Tous les nouveaux accès sont validés ici après une connexion Google.</p></div>
            <div className="admin-seat-grid">
              {([1, 2] as const).map((seat) => {
                const person = team.find((item) => item.role === "super_admin" && item.seat === seat && item.is_active);
                return <div className="admin-seat-card" key={seat}><span>SUPER ADMIN · SIÈGE {seat}</span><strong>{person?.display_name ?? "Siège disponible"}</strong><small>{person?.email ?? "À attribuer"}</small></div>;
              })}
              {(() => {
                const person = team.find((item) => item.role === "publisher" && item.is_active);
                return <div className="admin-seat-card publisher"><span>PUBLICATION & MÉDIAS</span><strong>{person?.display_name ?? "Accès disponible"}</strong><small>{person?.email ?? "À attribuer"}</small></div>;
              })()}
            </div>
            <div className="admin-team-list admin-access-requests">
              <h3>Demandes Google en attente ({accessRequests.filter((request) => request.user_id !== admin.user_id).length})</h3>
              <p>Les personnes utilisent « Connecter Google » sur le site public. Choisissez leur rôle, puis approuvez ou refusez leur demande.</p>
              {accessRequests.filter((request) => request.user_id !== admin.user_id).map((request) => (
                <div className="admin-team-row admin-request-row" key={request.id}>
                  <div>
                    <strong>{request.display_name}</strong>
                    <small>{request.email} · Demande du {new Date(request.requested_at).toLocaleDateString("fr-FR")}</small>
                  </div>
                  <div className="admin-team-actions">
                    <select
                      aria-label={`Rôle demandé pour ${request.display_name}`}
                      value={requestRoles[request.id] ?? "publisher"}
                      onChange={(event) => setRequestRoles((current) => ({
                        ...current,
                        [request.id]: event.target.value as "super_admin" | "publisher"
                      }))}
                    >
                      <option value="publisher">Publication & Médias</option>
                      <option value="super_admin">Super Admin · siège 2</option>
                    </select>
                    <button type="button" disabled={busy} onClick={() => void approveAccessRequest(request)}>Approuver</button>
                    <button className="admin-danger-text" type="button" disabled={busy} onClick={() => void rejectAccessRequest(request)}>Refuser</button>
                  </div>
                </div>
              ))}
              {accessRequests.filter((request) => request.user_id !== admin.user_id).length === 0 && (
                <p className="admin-empty">Aucune demande en attente.</p>
              )}
            </div>
            <div className="admin-team-list">
              <h3>Accès enregistrés</h3>
              {team.map((person) => <div className="admin-team-row" key={person.id}><div><strong>{person.display_name}</strong><small>{person.email} · {person.role === "super_admin" ? `Super Admin · siège ${person.seat}` : "Publication & Médias"}</small></div><div className="admin-team-actions"><span className={person.is_active ? "admin-status-on" : "admin-status-off"}>{person.is_active ? "Actif" : "Désactivé"}</span>{person.user_id !== admin.user_id && <><select aria-label={`Rôle de ${person.display_name}`} value={person.role} onChange={(event) => void updateAdmin(person, { role: event.target.value as "super_admin" | "publisher", seat: event.target.value === "publisher" ? 1 : person.role === "super_admin" ? person.seat : 2 })}><option value="super_admin">Super Admin</option><option value="publisher">Publication & Médias</option></select>{person.role === "super_admin" && <select aria-label={`Siège de ${person.display_name}`} value={person.seat} onChange={(event) => void updateAdmin(person, { seat: Number(event.target.value) })}><option value={1}>Siège 1</option><option value={2}>Siège 2</option></select>}<button type="button" onClick={() => void updateAdmin(person, { is_active: !person.is_active })}>{person.is_active ? "Désactiver" : "Réactiver"}</button><button className="admin-danger-text" type="button" onClick={() => void revokeAdmin(person)}>Révoquer</button></>}</div></div>)}
            </div>
          </div>
        )}
      </section>
    </main>
  );
}

function PostEditor({ post, media, onSave, onDelete, busy }: {
  post?: PostItem;
  media: MediaItem[];
  onSave: (event: FormEvent<HTMLFormElement>) => void;
  onDelete?: () => void;
  busy: boolean;
}) {
  const [expanded, setExpanded] = useState(!post);
  return (
    <form className="admin-post-editor" onSubmit={onSave}>
      <button className="admin-post-toggle" type="button" onClick={() => setExpanded(!expanded)}>
        <span><strong>{post?.title ?? "Nouvelle publication"}</strong><small>{post ? `${CATEGORY_LABELS[post.category]} · ${post.status === "published" ? "En ligne" : "Brouillon"}` : "Créer une actualité, une annonce ou un événement"}</small></span><b>{expanded ? "−" : "+"}</b>
      </button>
      {expanded && <div className="admin-post-fields">
        <label>Image de couverture<select name="cover_media_id" defaultValue={post?.cover_media_id ?? ""}><option value="">Aucune image</option>{media.filter((item) => item.id && item.is_visible).map((item) => <option value={item.id} key={item.id}>{item.label}</option>)}</select></label>
        <div className="admin-form-two">
          <label>Titre<input name="title" required defaultValue={post?.title ?? ""} /></label>
          <label>Identifiant URL (slug)<input name="slug" required pattern="[a-z0-9-]+" defaultValue={post?.slug ?? ""} placeholder="exemple-annonce-ajecch" /></label>
        </div>
        <div className="admin-form-two">
          <label>Type<select name="category" defaultValue={post?.category ?? "news"}><option value="news">Actualité</option><option value="announcement">Annonce</option><option value="event">Événement</option></select></label>
          <label>Statut<select name="status" defaultValue={post?.status ?? "draft"}><option value="draft">Brouillon</option><option value="published">Publié</option></select></label>
        </div>
        <label>Résumé<input name="excerpt" defaultValue={post?.excerpt ?? ""} /></label>
        <label>Contenu<textarea name="body" rows={4} defaultValue={post?.body ?? ""} /></label>
        <div className="admin-form-two">
          <label>Date de début (événement)<input type="datetime-local" name="event_starts_at" defaultValue={toLocalInput(post?.event_starts_at ?? null)} /></label>
          <label>Date de fin<input type="datetime-local" name="event_ends_at" defaultValue={toLocalInput(post?.event_ends_at ?? null)} /></label>
        </div>
        <label>Lieu<input name="event_location" defaultValue={post?.event_location ?? ""} /></label>
        <div className="admin-card-actions"><button className="admin-primary-button" type="submit" disabled={busy}>Enregistrer la publication</button>{post && onDelete && <button className="admin-danger-button" type="button" disabled={busy} onClick={onDelete}>Supprimer</button>}</div>
      </div>}
    </form>
  );
}
