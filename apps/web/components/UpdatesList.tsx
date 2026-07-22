"use client";

import { useEffect, useState } from "react";
import styles from "./UpdatesList.module.css";

// Inlined at build time (static property access required), so production
// builds must set NEXT_PUBLIC_API_URL; unset, we target the local dev API.
const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";

type UpdatePost = {
  id: number;
  title: string;
  body: string;
  created_at: string;
};

type Status = "loading" | "loaded" | "error";

// Posts are fetched client-side on purpose: the site is a static build, so
// publishing from the dashboard shows up here with no redeploy.
export function UpdatesList() {
  const [posts, setPosts] = useState<UpdatePost[]>([]);
  const [status, setStatus] = useState<Status>("loading");

  useEffect(() => {
    // Trailing slash matters: Django redirects slash-less paths.
    fetch(`${API_URL}/api/updates/`)
      .then((response) => {
        if (!response.ok) throw new Error(`Updates fetch failed: ${response.status}`);
        return response.json();
      })
      // The endpoint is paginated; the newest page of posts is plenty here.
      .then((data: { results: UpdatePost[] }) => {
        setPosts(data.results);
        setStatus("loaded");
      })
      .catch(() => setStatus("error"));
  }, []);

  if (status === "loading") {
    return (
      <p className={styles.note} role="status" aria-live="polite">
        Loading updates…
      </p>
    );
  }
  if (status === "error") {
    return (
      <p className={styles.note} role="alert">
        Updates couldn&apos;t be loaded right now — please check back soon.
      </p>
    );
  }
  if (posts.length === 0) {
    return (
      <p className={styles.note} role="status">
        No updates yet — check back soon.
      </p>
    );
  }

  return (
    <div className={styles.list}>
      {posts.map((post) => (
        <article key={post.id} className={styles.post}>
          <h2 className={styles.postTitle}>{post.title}</h2>
          <p className={styles.postDate}>
            {new Date(post.created_at).toLocaleDateString(undefined, {
              year: "numeric",
              month: "long",
              day: "numeric",
            })}
          </p>
          {post.body.split(/\n\s*\n/).map((paragraph, index) => (
            <p key={index} className={styles.postBody}>
              {paragraph}
            </p>
          ))}
        </article>
      ))}
    </div>
  );
}
