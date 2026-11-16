"use client";

import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import type { User } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/client";

type PublicQuestion = { id: string; prompt: string; options: string[] };
type PublicQuiz = { id: string; title: string; description: string; questions: PublicQuestion[] };
type SavedResponse = {
  quiz_id: string;
  question_id: string;
  selected_index: number;
  is_correct: boolean;
  points_awarded: number;
};
type SubmitResult = {
  is_correct: boolean;
  points_awarded: number;
  total_score: number;
  already_answered: boolean;
};

export default function QuizRunner() {
  const supabase = useMemo(() => createClient(), []);
  const [user, setUser] = useState<User | null>(null);
  const [quizzes, setQuizzes] = useState<PublicQuiz[]>([]);
  const [responses, setResponses] = useState<Record<string, SavedResponse>>({});
  const [score, setScore] = useState(0);
  const [authMode, setAuthMode] = useState<"login" | "register">("login");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [authBusy, setAuthBusy] = useState(false);
  const [busyQuestion, setBusyQuestion] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const loadUserData = useCallback(async (userId: string) => {
    const [scoreResult, responseResult] = await Promise.all([
      supabase.rpc("ajecch_my_quiz_score"),
      supabase.from("ajecch_quiz_responses")
        .select("quiz_id,question_id,selected_index,is_correct,points_awarded")
        .eq("user_id", userId)
    ]);
    if (scoreResult.error) setError(scoreResult.error.message);
    else setScore(Number(scoreResult.data ?? 0));
    if (responseResult.error) setError(responseResult.error.message);
    else {
      const byQuestion: Record<string, SavedResponse> = {};
      for (const response of (responseResult.data ?? []) as SavedResponse[]) {
        byQuestion[`${response.quiz_id}:${response.question_id}`] = response;
      }
      setResponses(byQuestion);
    }
  }, [supabase]);

  useEffect(() => {
    let active = true;
    void (async () => {
      const { data, error: quizError } = await supabase
        .from("ajecch_quizzes")
        .select("id,title,description,questions")
        .eq("status", "published")
        .order("published_at", { ascending: false });
      if (!active) return;
      if (quizError) setError(quizError.message);
      else setQuizzes((data ?? []) as PublicQuiz[]);

      const { data: userData } = await supabase.auth.getUser();
      if (!active) return;
      const currentUser = userData.user ?? null;
      setUser(currentUser);
      if (currentUser) await loadUserData(currentUser.id);
    })();

    const { data: authListener } = supabase.auth.onAuthStateChange((_event, session) => {
      if (!active) return;
      const currentUser = session?.user ?? null;
      setUser(currentUser);
      if (currentUser) void loadUserData(currentUser.id);
      else {
        setResponses({});
        setScore(0);
      }
    });

    return () => {
      active = false;
      authListener.subscription.unsubscribe();
    };
  }, [supabase, loadUserData]);

  async function submitAuth(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setNotice("");
    setAuthBusy(true);
    try {
      if (authMode === "register") {
        if (name.trim().length < 2) throw new Error("Saisissez votre nom complet.");
        if (password.length < 10) throw new Error("Le mot de passe doit contenir au moins 10 caractères.");
        const callback = new URL("/auth/callback", window.location.origin);
        callback.searchParams.set("next", "/quiz");
        const { data, error: signupError } = await supabase.auth.signUp({
          email: email.trim().toLowerCase(),
          password,
          options: { data: { full_name: name.trim() }, emailRedirectTo: callback.toString() }
        });
        if (signupError) throw signupError;
        if (data.session?.user) {
          setUser(data.session.user);
          await loadUserData(data.session.user.id);
          setNotice("Votre compte participant est créé. Votre score sera conservé.");
        } else {
          setNotice("Compte créé. Confirmez votre adresse e-mail depuis le message reçu, puis revenez sur cette page pour participer.");
        }
      } else {
        const { error: loginError } = await supabase.auth.signInWithPassword({
          email: email.trim().toLowerCase(), password
        });
        if (loginError) throw loginError;
        const { data } = await supabase.auth.getUser();
        if (data.user) {
          setUser(data.user);
          await loadUserData(data.user.id);
          setNotice("Connexion réussie. Vos réponses et votre score sont chargés.");
        }
      }
      setPassword("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Impossible de traiter cette demande.");
    } finally {
      setAuthBusy(false);
    }
  }

  async function answer(quiz: PublicQuiz, question: PublicQuestion, selectedIndex: number) {
    if (!user) {
      setError("Connectez-vous ou créez un compte participant pour enregistrer votre réponse.");
      return;
    }
    const key = `${quiz.id}:${question.id}`;
    if (responses[key]) return;
    setBusyQuestion(key);
    setError("");
    setNotice("");
    try {
      const { data, error: answerError } = await supabase.rpc("ajecch_submit_quiz_answer", {
        p_quiz_id: quiz.id,
        p_question_id: question.id,
        p_selected_index: selectedIndex
      });
      if (answerError) throw answerError;
      const result = (Array.isArray(data) ? data[0] : data) as SubmitResult | null;
      if (!result) throw new Error("La réponse n’a pas été enregistrée.");
      setResponses((current) => ({
        ...current,
        [key]: {
          quiz_id: quiz.id,
          question_id: question.id,
          selected_index: selectedIndex,
          is_correct: result.is_correct,
          points_awarded: result.points_awarded
        }
      }));
      setScore(Number(result.total_score));
      setNotice(result.is_correct ? "Bonne réponse : 1 point ajouté à votre score." : "Réponse enregistrée. Aucun point n’a été ajouté.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Impossible d’enregistrer cette réponse.");
    } finally {
      setBusyQuestion("");
    }
  }

  async function signOut() {
    await supabase.auth.signOut();
    setUser(null);
    setResponses({});
    setScore(0);
    setNotice("Vous êtes déconnecté.");
  }

  return (
    <div className="quiz-page-content">
      <header className="quiz-page-heading">
        <span className="section-kicker">AJECCH · APPRENDRE ET PARTICIPER</span>
        <h1>Quiz & connaissances</h1>
        <p>Répondez aux questions, vérifiez vos connaissances et faites progresser votre score personnel.</p>
      </header>

      {user ? (
        <div className="quiz-user-panel">
          <div><span>PARTICIPANT</span><strong>{user.user_metadata?.full_name || user.email}</strong></div>
          <div className="quiz-score"><span>VOTRE SCORE</span><strong>{score} <small>pt{score === 1 ? "" : "s"}</small></strong></div>
          <button type="button" onClick={() => void signOut()}>Se déconnecter</button>
        </div>
      ) : (
        <section className="quiz-auth-panel">
          <div className="quiz-auth-heading">
            <h2>Enregistrer vos points</h2>
            <p>Connectez-vous ou créez un compte participant. Votre score sera lié à votre compte et restera distinct de celui des autres utilisateurs.</p>
          </div>
          <div className="quiz-auth-switch">
            <button type="button" className={authMode === "login" ? "active" : ""} onClick={() => setAuthMode("login")}>Connexion</button>
            <button type="button" className={authMode === "register" ? "active" : ""} onClick={() => setAuthMode("register")}>Créer un compte</button>
          </div>
          <form className="quiz-auth-form" onSubmit={submitAuth}>
            {authMode === "register" && <label>Nom complet<input autoComplete="name" required value={name} onChange={(event) => setName(event.target.value)} placeholder="Votre nom" /></label>}
            <label>Adresse e-mail<input type="email" autoComplete="email" required value={email} onChange={(event) => setEmail(event.target.value)} placeholder="nom@exemple.com" /></label>
            <label>Mot de passe<input type="password" autoComplete={authMode === "login" ? "current-password" : "new-password"} minLength={10} required value={password} onChange={(event) => setPassword(event.target.value)} placeholder="10 caractères minimum" /></label>
            <button className="button button-gold" type="submit" disabled={authBusy}>{authBusy ? "Traitement…" : authMode === "login" ? "Se connecter" : "Créer mon compte"}</button>
          </form>
        </section>
      )}

      {error && <p className="quiz-feedback quiz-feedback-error" role="alert">{error}</p>}
      {notice && <p className="quiz-feedback" role="status">{notice}</p>}

      <div className="quiz-list">
        {quizzes.map((quiz, quizIndex) => (
          <article className="quiz-card glass-card" key={quiz.id}>
            <div className="quiz-card-heading">
              <div><span className="quiz-number">QUIZ {String(quizIndex + 1).padStart(2, "0")}</span><h2>{quiz.title}</h2></div>
              <span>{quiz.questions.length} question{quiz.questions.length > 1 ? "s" : ""}</span>
            </div>
            {quiz.description && <p className="quiz-description">{quiz.description}</p>}
            <div className="quiz-questions">
              {quiz.questions.map((question, questionIndex) => {
                const key = `${quiz.id}:${question.id}`;
                const response = responses[key];
                return (
                  <section className="quiz-question-card" key={question.id}>
                    <h3><span>{questionIndex + 1}.</span> {question.prompt}</h3>
                    <div className="quiz-answer-list">
                      {question.options.map((option, optionIndex) => (
                        <button
                          type="button"
                          key={optionIndex}
                          className={response?.selected_index === optionIndex ? (response.is_correct ? "quiz-answer-button selected correct" : "quiz-answer-button selected incorrect") : "quiz-answer-button"}
                          disabled={!user || Boolean(response) || busyQuestion === key}
                          onClick={() => void answer(quiz, question, optionIndex)}
                        >
                          <span className="quiz-answer-letter">{String.fromCharCode(65 + optionIndex)}</span>
                          <span>{option}</span>
                          {response?.selected_index === optionIndex && <strong>{response.is_correct ? "+1 point" : "Réponse enregistrée"}</strong>}
                        </button>
                      ))}
                    </div>
                    {response && <p className={response.is_correct ? "quiz-question-result good" : "quiz-question-result"}>
                      {response.is_correct ? "Bonne réponse. Votre point a été ajouté." : "Cette réponse est enregistrée. Vous ne pouvez répondre qu’une fois à chaque question."}
                    </p>}
                    {!user && <p className="quiz-question-hint">Connectez-vous pour répondre et conserver vos points.</p>}
                  </section>
                );
              })}
            </div>
          </article>
        ))}
        {quizzes.length === 0 && <p className="quiz-empty glass-card">Aucun quiz n’est publié pour le moment. Revenez découvrir les prochaines questions.</p>}
      </div>
    </div>
  );
}
