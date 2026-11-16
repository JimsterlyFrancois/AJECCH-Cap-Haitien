"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

function getErrorMessage(error: unknown) {
  if (typeof error === "string" && error.trim()) return error;
  if (typeof error === "object" && error !== null && "message" in error) {
    const message = (error as { message?: unknown }).message;
    if (typeof message === "string" && message.trim()) return message;
  }
  return "L’activation a échoué. Vérifiez le code d’initialisation et la confirmation de votre adresse e-mail, puis réessayez.";
}

export default function BootstrapForm() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [token, setToken] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setLoading(true);
    try {
      const supabase = createClient();
      const { error: setupError } = await supabase.rpc("ajecch_bootstrap_super_admin", {
        p_token: token.trim(),
        p_display_name: name.trim()
      });
      if (setupError) throw setupError;
      router.replace("/administration");
      router.refresh();
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setLoading(false);
    }
  }

  return (
    <form className="admin-auth-form" onSubmit={submit}>
      <label htmlFor="bootstrap-name">Nom à afficher</label>
      <input id="bootstrap-name" required minLength={2} maxLength={120} value={name} onChange={(event) => setName(event.target.value)} />
      <label htmlFor="bootstrap-token">Code unique d’initialisation</label>
      <input id="bootstrap-token" type="password" required autoComplete="off" value={token} onChange={(event) => setToken(event.target.value)} />
      {error && <p className="admin-form-error" role="alert">{error}</p>}
      <button className="admin-primary-button" type="submit" disabled={loading}>{loading ? "Activation…" : "Activer le siège Super Admin 1"}</button>
    </form>
  );
}
