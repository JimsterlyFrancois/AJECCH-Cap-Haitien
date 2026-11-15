"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

export default function FirstAdminSignupForm() {
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
      callback.searchParams.set("next", "/administration");

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
        router.replace("/administration");
        router.refresh();
        return;
      }

      setNotice(
        "La demande de création a été transmise. Consultez la boîte e-mail de cette adresse et confirmez-la avec le lien reçu. Vous serez ensuite redirigé vers l’activation du premier Super Administrateur."
      );
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
      <label htmlFor="first-admin-name">Nom complet</label>
      <input
        id="first-admin-name"
        type="text"
        autoComplete="name"
        required
        minLength={2}
        maxLength={120}
        value={name}
        onChange={(event) => setName(event.target.value)}
        placeholder="Nom du premier responsable"
      />

      <label htmlFor="first-admin-email">Adresse e-mail</label>
      <input
        id="first-admin-email"
        type="email"
        autoComplete="email"
        required
        value={email}
        onChange={(event) => setEmail(event.target.value)}
        placeholder="nom@exemple.com"
      />

      <label htmlFor="first-admin-password">Créer un mot de passe</label>
      <input
        id="first-admin-password"
        type="password"
        autoComplete="new-password"
        required
        minLength={10}
        value={password}
        onChange={(event) => setPassword(event.target.value)}
        placeholder="10 caractères minimum"
      />

      <label htmlFor="first-admin-confirmation">Confirmer le mot de passe</label>
      <input
        id="first-admin-confirmation"
        type="password"
        autoComplete="new-password"
        required
        minLength={10}
        value={confirmation}
        onChange={(event) => setConfirmation(event.target.value)}
        placeholder="Saisissez le mot de passe à nouveau"
      />

      {error && <p className="admin-form-error" role="alert">{error}</p>}
      {notice && <p className="admin-auth-hint" role="status">{notice}</p>}

      <button className="admin-primary-button" type="submit" disabled={loading}>
        {loading ? "Création du compte…" : "Créer le compte et continuer"}
      </button>
      <p className="admin-auth-hint">
        Cette création est disponible uniquement pendant la configuration initiale. Le compte ne reçoit les droits Super Admin qu’après confirmation de l’adresse e-mail et validation du code privé d’initialisation.
      </p>
    </form>
  );
}
