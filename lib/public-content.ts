import { createClient } from "@supabase/supabase-js";

const DEFAULT_MEDIA: Record<string, { url: string; alt: string }> = {
  "brand.logo": { url: "", alt: "Logo officiel de l’AJECCH" },
  "home.hero": { url: "", alt: "Image principale de l’association" },
  "home.actions": { url: "", alt: "Visuel des engagements de l’association" },
  "home.gallery": { url: "", alt: "Visuel de galerie" },
  "home.contact": { url: "", alt: "Visuel de contact de l’association" }
};

const DEMO_MEDIA_PATHS = ["/photos/8868160/", "/photos/17772875/"];
const DEMO_POST_SLUGS = new Set(["reflexe-genie-premiere-edition"]);

function isDemoMedia(sourceUrl: string | null) {
  return Boolean(sourceUrl && DEMO_MEDIA_PATHS.some((path) => sourceUrl.includes(path)));
}

type MediaRecord = {
  slot: string;
  source_url: string | null;
  storage_path: string | null;
  is_visible: boolean;
  alt_text: string | null;
};

function publicClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  if (!url || !key) return null;
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
}

export async function getSiteMedia() {
  const client = publicClient();
  if (!client) {
    return Object.fromEntries(Object.entries(DEFAULT_MEDIA).map(([slot, item]) => [slot, item.url || null])) as Record<string, string | null>;
  }

  const { data, error } = await client
    .from("ajecch_media")
    .select("slot,source_url,storage_path,is_visible,alt_text");

  if (error) {
    // Do not resurrect default images when the database is temporarily unavailable:
    // an administrator may have intentionally hidden or replaced those assets.
    return Object.fromEntries(Object.keys(DEFAULT_MEDIA).map((slot) => [slot, null])) as Record<string, string | null>;
  }

  const result: Record<string, string | null> = {};
  for (const row of (data ?? []) as MediaRecord[]) {
    if (!row.is_visible || (!row.storage_path && isDemoMedia(row.source_url))) {
      result[row.slot] = null;
      continue;
    }
    if (row.storage_path) {
      result[row.slot] = client.storage.from("ajecch-public-media").getPublicUrl(row.storage_path).data.publicUrl;
    } else {
      result[row.slot] = row.source_url;
    }
  }
  return result;
}

export type PublicPost = {
  id: string;
  slug: string;
  title: string;
  excerpt: string;
  body: string;
  category: "news" | "announcement" | "event";
  published_at: string | null;
  event_starts_at: string | null;
  event_ends_at: string | null;
  event_location: string | null;
  cover_media_id: string | null;
  cover_url?: string | null;
};

export async function getPublishedPosts() {
  const client = publicClient();
  if (!client) return [] as PublicPost[];

  const { data, error } = await client
    .from("ajecch_posts")
    .select("id,slug,title,excerpt,body,category,published_at,event_starts_at,event_ends_at,event_location,cover_media_id")
    .eq("status", "published")
    .order("published_at", { ascending: false });

  if (error || !data) return [] as PublicPost[];

  const publishedPosts = (data as PublicPost[]).filter((post) => !DEMO_POST_SLUGS.has(post.slug));

  const mediaIds = [...new Set(
    publishedPosts
      .map((post) => post.cover_media_id)
      .filter((id): id is string => Boolean(id))
  )];

  if (mediaIds.length === 0) return publishedPosts;

  const { data: media, error: mediaError } = await client
    .from("ajecch_media")
    .select("id,source_url,storage_path,is_visible")
    .in("id", mediaIds);

  if (mediaError) return publishedPosts;

  const mediaById = new Map((media ?? []).map((item) => [item.id, item]));
  return publishedPosts.map((post) => {
    const cover = post.cover_media_id ? mediaById.get(post.cover_media_id) : null;
    const coverUrl = !cover || !cover.is_visible
      ? null
      : cover.storage_path
        ? client.storage.from("ajecch-public-media").getPublicUrl(cover.storage_path).data.publicUrl
        : cover.source_url;
    return { ...post, cover_url: coverUrl };
  });
}
