"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";

type QuizQuestion = {
  id: string;
  prompt: string;
  options: string[];
  correctIndex: number;
};
type QuizRecord = {
  id: string;
  title: string;
  description: string;
  questions: Array<{ id: string; prompt: string; options: string[] }>;
  answer_keys: Record<string, number>;
  status: "draft" | "published";
  published_at: string | null;
  created_at: string;
};
type QuizDraft = {
  id: string | null;
  title: string;
  description: string;
  questions: QuizQuestion[];
};
type QuizListItem = Pick<QuizRecord, "id" | "title" | "description" | "status" | "published_at" | "created_at"> & {
  questionCount: number;
};

function blankQuestion(): QuizQuestion {
  return { id: crypto.randomUUID(), prompt: "", options: ["", "", "", ""], correctIndex: 0 };
}

export default function QuizManager() {
  const supabase = useMemo(() => createClient(), []);
  const [quizzes, setQuizzes] = useState<QuizListItem[]>([]);
  const [draft, setDraft] = useState<QuizDraft | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const load = useCallback(async () => {
    const { data, error: loadError } = await supabase.rpc("ajecch_list_quizzes_admin");
    if (loadError) {
      setError(loadError.message);
      return;
    }
    const rows = (data ?? []) as QuizRecord[];
    setQuizzes(rows.map((quiz) => ({
      id: quiz.id,
      title: quiz.title,
      description: quiz.description,
      status: quiz.status,
      published_at: quiz.published_at,
      created_at: quiz.created_at,
      questionCount: quiz.questions?.length ?? 0
    })));
  }, [supabase]);

  useEffect(() => { void load(); }, [load]);

  async function editQuiz(id: string) {
    setBusy(true);
    setError("");
    try {
      const { data, error: loadError } = await supabase.rpc("ajecch_list_quizzes_admin");
      if (loadError) throw loadError;
      const quiz = ((data ?? []) as QuizRecord[]).find((item) => item.id === id);
      if (!quiz) throw new Error("Ce quiz n’est plus disponible.");
      setDraft({
        id: quiz.id,
        title: quiz.title,
        description: quiz.description,
        questions: quiz.questions.map((question) => ({
          ...question,
          options: [...question.options],
          correctIndex: Number(quiz.answer_keys?.[question.id] ?? 0)
        }))
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Impossible d’ouvrir ce quiz.");
    } finally {
      setBusy(false);
    }
  }

  function updateQuestion(questionId: string, patch: Partial<QuizQuestion>) {
    setDraft((current) => current ? ({
      ...current,
      questions: current.questions.map((question) => question.id === questionId ? { ...question, ...patch } : question)
    }) : current);
  }

  function updateOption(questionId: string, optionIndex: number, value: string) {
    setDraft((current) => current ? ({
      ...current,
      questions: current.questions.map((question) => question.id === questionId
        ? { ...question, options: question.options.map((option, index) => index === optionIndex ? value : option) }
        : question)
    }) : current);
  }

  async function save(status: "draft" | "published") {
    if (!draft) return;
    setError("");
    setNotice("");
    const title = draft.title.trim();
    if (title.length < 3) {
      setError("Le titre du quiz doit contenir au moins 3 caractères.");
      return;
    }
    if (draft.questions.length === 0) {
      setError("Ajoutez au moins une question.");
      return;
    }
    for (let index = 0; index < draft.questions.length; index += 1) {
      const question = draft.questions[index];
      if (question.prompt.trim().length < 3 || question.options.length < 2 || question.options.length > 5) {
        setError(`Complétez la question ${index + 1} et proposez entre 2 et 5 réponses.`);
        return;
      }
      if (question.options.some((option) => !option.trim())) {
        setError(`Complétez tous les choix de la question ${index + 1}.`);
        return;
      }
      if (question.correctIndex < 0 || question.correctIndex >= question.options.length) {
        setError(`Désignez la bonne réponse de la question ${index + 1}.`);
        return;
      }
    }

    setBusy(true);
    try {
      const questions = draft.questions.map(({ id, prompt, options }) => ({
        id, prompt: prompt.trim(), options: options.map((option) => option.trim())
      }));
      const answerKeys = Object.fromEntries(draft.questions.map((question) => [question.id, question.correctIndex]));
      const { data, error: saveError } = await supabase.rpc("ajecch_save_quiz", {
        p_quiz_id: draft.id,
        p_title: title,
        p_description: draft.description.trim(),
        p_questions: questions,
        p_answer_keys: answerKeys,
        p_status: status
      });
      if (saveError) throw saveError;
      setNotice(status === "published" ? "Quiz publié. Il est maintenant accessible aux participants." : "Brouillon du quiz enregistré.");
      setDraft(null);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Impossible d’enregistrer ce quiz.");
    } finally {
      setBusy(false);
    }
  }

  async function deleteQuiz(quiz: QuizListItem) {
    if (!window.confirm(`Supprimer le quiz « ${quiz.title} » ? Les quiz déjà commencés ne peuvent pas être supprimés.`)) return;
    setBusy(true);
    setError("");
    setNotice("");
    const { error: deleteError } = await supabase.rpc("ajecch_delete_quiz", { p_quiz_id: quiz.id });
    if (deleteError) setError(deleteError.message);
    else {
      setNotice("Quiz supprimé.");
      await load();
    }
    setBusy(false);
  }

  return (
    <section className="admin-quiz-manager">
      <div className="admin-section-intro">
        <h2>Quiz de connaissance</h2>
        <p>Créez de courtes séries de questions. Choisissez les propositions et indiquez une seule bonne réponse par question. Chaque bonne réponse rapporte 1 point au compte du participant.</p>
      </div>

      {notice && <p className="admin-notice" role="status">{notice}</p>}
      {error && <p className="admin-alert" role="alert">{error}</p>}

      {!draft ? (
        <>
          <button className="admin-primary-button admin-quiz-new" type="button" onClick={() => {
            setError("");
            setNotice("");
            setDraft({ id: null, title: "", description: "", questions: [blankQuestion()] });
          }}>+ Créer un quiz</button>
          <div className="admin-quiz-list">
            {quizzes.map((quiz) => (
              <article className="admin-quiz-row" key={quiz.id}>
                <div>
                  <strong>{quiz.title}</strong>
                  <p>{quiz.description || "Sans description"}</p>
                  <small>{quiz.questionCount} question(s) · {quiz.status === "published" ? "Publié" : "Brouillon"}</small>
                </div>
                <div className="admin-card-actions">
                  <button className="admin-secondary-button" type="button" disabled={busy} onClick={() => void editQuiz(quiz.id)}>Modifier</button>
                  <button className="admin-danger-button" type="button" disabled={busy} onClick={() => void deleteQuiz(quiz)}>Supprimer</button>
                </div>
              </article>
            ))}
            {quizzes.length === 0 && <p className="admin-empty">Aucun quiz créé. Commencez par ajouter votre première série de questions.</p>}
          </div>
        </>
      ) : (
        <div className="admin-quiz-editor">
          <div className="admin-quiz-editor-heading">
            <div><span className="admin-eyebrow">{draft.id ? "MODIFICATION" : "NOUVEAU CONTENU"}</span><h3>{draft.id ? "Modifier le quiz" : "Composer un quiz"}</h3></div>
            <button className="admin-secondary-button" type="button" disabled={busy} onClick={() => setDraft(null)}>Fermer</button>
          </div>
          <label>Titre du quiz<input value={draft.title} maxLength={140} onChange={(event) => setDraft({ ...draft, title: event.target.value })} placeholder="Ex. Les valeurs et la mission de l’AJECCH" /></label>
          <label>Présentation courte<textarea rows={2} maxLength={500} value={draft.description} onChange={(event) => setDraft({ ...draft, description: event.target.value })} placeholder="Expliquez brièvement le thème du quiz…" /></label>

          <div className="admin-quiz-question-list">
            {draft.questions.map((question, questionIndex) => (
              <article className="admin-quiz-question" key={question.id}>
                <div className="admin-quiz-question-heading">
                  <strong>Question {questionIndex + 1}</strong>
                  <button type="button" className="admin-danger-text" disabled={busy || draft.questions.length === 1} onClick={() => setDraft({
                    ...draft, questions: draft.questions.filter((item) => item.id !== question.id)
                  })}>Retirer</button>
                </div>
                <label>Énoncé<textarea rows={2} maxLength={500} value={question.prompt} onChange={(event) => updateQuestion(question.id, { prompt: event.target.value })} placeholder="Écrivez la question…" /></label>
                <div className="admin-quiz-options">
                  <span className="admin-quiz-option-caption">Choix proposés — cochez la réponse correcte</span>
                  {question.options.map((option, optionIndex) => (
                    <div className="admin-quiz-option" key={optionIndex}>
                      <input type="radio" name={`correct-${question.id}`} checked={question.correctIndex === optionIndex}
                        onChange={() => updateQuestion(question.id, { correctIndex: optionIndex })}
                        aria-label={`Définir le choix ${optionIndex + 1} comme bonne réponse`} />
                      <input type="text" maxLength={240} value={option} onChange={(event) => updateOption(question.id, optionIndex, event.target.value)}
                        placeholder={`Réponse ${optionIndex + 1}`} aria-label={`Texte de la réponse ${optionIndex + 1}`} />
                      <button type="button" className="admin-quiz-remove-option" disabled={busy || question.options.length <= 2}
                        onClick={() => updateQuestion(question.id, {
                          options: question.options.filter((_, index) => index !== optionIndex),
                          correctIndex: question.correctIndex === optionIndex ? 0 : question.correctIndex > optionIndex ? question.correctIndex - 1 : question.correctIndex
                        })} aria-label={`Retirer la réponse ${optionIndex + 1}`}>×</button>
                    </div>
                  ))}
                  {question.options.length < 5 && <button className="admin-quiz-add-option" type="button" onClick={() => updateQuestion(question.id, { options: [...question.options, ""] })}>+ Ajouter un choix</button>}
                </div>
              </article>
            ))}
          </div>

          <button className="admin-secondary-button" type="button" disabled={busy || draft.questions.length >= 12}
            onClick={() => setDraft({ ...draft, questions: [...draft.questions, blankQuestion()] })}>+ Ajouter une question</button>
          <div className="admin-card-actions admin-quiz-save-actions">
            <button className="admin-secondary-button" type="button" disabled={busy} onClick={() => void save("draft")}>{busy ? "Enregistrement…" : "Enregistrer comme brouillon"}</button>
            <button className="admin-primary-button" type="button" disabled={busy} onClick={() => void save("published")}>{busy ? "Publication…" : "Publier le quiz"}</button>
          </div>
          <p className="admin-auth-hint">Une question ne peut être modifiée après sa première réponse. Cela protège les scores déjà attribués.</p>
        </div>
      )}
    </section>
  );
}
