"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

export default function SecondAdminSignupForm() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [loading, setLoading] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setNotice("");
    if (password.length < 10) {
      setError("Choisissez un mot de passe d’au moins 10 caractères.");
      return;
    }
    if (password !== confirmation) {
      setError("Les deux mots de passe ne correspondent pas.");
      return;
    }

    setLoading(true);
    try {
      const supabase = createClient();
      const callback = new URL("/auth/callback", window.location.origin);
      callback.searchParams.set("next", "/administration?request=submit");
      const { data, error: signupError } = await supabase.auth.signUp({
        email: email.trim().toLowerCase(),
        password,
        options: {
          data: { full_name: name.trim() },
          emailRedirectTo: callback.toString()
        }
      });
      if (signupError) throw signupError;

      if (data.session) {
        const { error: requestError } = await supabase.rpc("ajecch_submit_admin_access_request");
        if (requestError) throw requestError;
        router.replace("/administration");
        router.refresh();
        return;
      }

      setNotice("Compte créé. Confirmez votre adresse e-mail depuis le message reçu. Votre demande pour le second accès ADM sera alors transmise automatiquement et restera en attente de validation.");
      setPassword("");
      setConfirmation("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "La création du compte est impossible pour le moment.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <form className="admin-auth-form" onSubmit={submit}>
      <label htmlFor="second-admin-name">Nom complet</label>
      <input id="second-admin-name" type="text" autoComplete="name" required minLength={2} maxLength={120}
        value={name} onChange={(event) => setName(event.target.value)} placeholder="Votre nom complet" />
      <label htmlFor="second-admin-email">Adresse e-mail</label>
      <input id="second-admin-email" type="email" autoComplete="email" required
        value={email} onChange={(event) => setEmail(event.target.value)} placeholder="nom@exemple.com" />
      <label htmlFor="second-admin-password">Créer un mot de passe</label>
      <input id="second-admin-password" type="password" autoComplete="new-password" required minLength={10}
        value={password} onChange={(event) => setPassword(event.target.value)} placeholder="10 caractères minimum" />
      <label htmlFor="second-admin-confirmation">Confirmer le mot de passe</label>
      <input id="second-admin-confirmation" type="password" autoComplete="new-password" required minLength={10}
        value={confirmation} onChange={(event) => setConfirmation(event.target.value)} placeholder="Saisissez le mot de passe à nouveau" />
      {error && <p className="admin-form-error" role="alert">{error}</p>}
      {notice && <p className="admin-auth-hint" role="status">{notice}</p>}
      <button className="admin-primary-button" type="submit" disabled={loading}>
        {loading ? "Création du compte…" : "Créer le compte et transmettre la demande"}
      </button>
      <p className="admin-auth-hint">
        L’accès de gestion n’est pas immédiat. Le compte doit d’abord confirmer son adresse e-mail, puis attendre la validation de la demande.
      </p>
    </form>
  );
}
