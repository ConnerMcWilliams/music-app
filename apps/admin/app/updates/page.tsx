"use client";

import { useCallback, useEffect, useState } from "react";

import {
  UpdatePost,
  createUpdate,
  deleteUpdate,
  getUpdates,
  patchUpdate,
} from "@/lib/api";
import { useRequireSession } from "@/lib/useSession";
import styles from "./updates.module.css";

export default function UpdatesPage() {
  const ready = useRequireSession();
  const [posts, setPosts] = useState<UpdatePost[]>([]);
  const [error, setError] = useState<string | null>(null);

  // One form serves create and edit; editingId decides which on save.
  const [editingId, setEditingId] = useState<number | null>(null);
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [published, setPublished] = useState(false);
  const [busy, setBusy] = useState(false);

  const refresh = useCallback(() => {
    getUpdates()
      .then((page) => setPosts(page.results))
      .catch(() => setError("Could not load posts. Is the backend running?"));
  }, []);

  useEffect(() => {
    if (ready) refresh();
  }, [ready, refresh]);

  if (!ready) return null;

  function resetForm() {
    setEditingId(null);
    setTitle("");
    setBody("");
    setPublished(false);
  }

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      if (editingId === null) {
        await createUpdate({ title, body, published });
      } else {
        await patchUpdate(editingId, { title, body, published });
      }
      resetForm();
      refresh();
    } catch {
      setError("Saving failed — check the backend logs.");
    } finally {
      setBusy(false);
    }
  }

  async function togglePublished(post: UpdatePost) {
    await patchUpdate(post.id, { published: !post.published }).catch(() =>
      setError("Updating failed — check the backend logs.")
    );
    refresh();
  }

  async function remove(post: UpdatePost) {
    if (!window.confirm(`Delete “${post.title}”? This cannot be undone.`)) {
      return;
    }
    await deleteUpdate(post.id).catch(() =>
      setError("Deleting failed — check the backend logs.")
    );
    if (editingId === post.id) resetForm();
    refresh();
  }

  return (
    <div className={styles.page}>
      <form className={`card ${styles.form}`} onSubmit={handleSubmit}>
        <span className="kicker">Updates</span>
        <h1 className={styles.title}>
          {editingId === null ? "New post" : "Edit post"}
        </h1>
        <p className="muted">
          Published posts appear on the website&apos;s /updates page
          immediately — no redeploy. Paragraphs are split on blank lines.
        </p>
        <input
          placeholder="Title"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          required
        />
        <textarea
          placeholder="Write the update…"
          rows={8}
          value={body}
          onChange={(e) => setBody(e.target.value)}
          required
        />
        <label className={styles.publishToggle}>
          <input
            type="checkbox"
            checked={published}
            onChange={(e) => setPublished(e.target.checked)}
          />
          Published
        </label>
        {error && <p className="error">{error}</p>}
        <div className={styles.formActions}>
          <button type="submit" className="btnPrimary" disabled={busy}>
            {editingId === null ? "Create" : "Save changes"}
          </button>
          {editingId !== null && (
            <button type="button" className="btnGhost" onClick={resetForm}>
              Cancel edit
            </button>
          )}
        </div>
      </form>

      <section className={styles.list}>
        {posts.length === 0 && <p className="muted">No posts yet.</p>}
        {posts.map((post) => (
          <article key={post.id} className={`card ${styles.post}`}>
            <div className={styles.postHeader}>
              <h2 className={styles.postTitle}>{post.title}</h2>
              <span
                className={post.published ? styles.badgeLive : styles.badgeDraft}
              >
                {post.published ? "Published" : "Draft"}
              </span>
            </div>
            <p className={styles.postMeta}>
              {new Date(post.created_at).toLocaleDateString()} · edited{" "}
              {new Date(post.updated_at).toLocaleDateString()}
            </p>
            <p className={styles.postBody}>{post.body}</p>
            <div className={styles.postActions}>
              <button
                type="button"
                className="btnGhost"
                onClick={() => togglePublished(post)}
              >
                {post.published ? "Unpublish" : "Publish"}
              </button>
              <button
                type="button"
                className="btnGhost"
                onClick={() => {
                  setEditingId(post.id);
                  setTitle(post.title);
                  setBody(post.body);
                  setPublished(post.published);
                  window.scrollTo({ top: 0, behavior: "smooth" });
                }}
              >
                Edit
              </button>
              <button
                type="button"
                className="btnDanger"
                onClick={() => remove(post)}
              >
                Delete
              </button>
            </div>
          </article>
        ))}
      </section>
    </div>
  );
}
