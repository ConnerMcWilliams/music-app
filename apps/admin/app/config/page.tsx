"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";

import {
  Experiment,
  ExperimentResults,
  OnboardingVariant,
  createExperiment,
  deleteExperiment,
  deleteVariant,
  duplicateVariant,
  fieldError,
  getExperimentResults,
  getExperiments,
  getVariants,
  patchExperiment,
  patchVariant,
  setDefaultVariant,
} from "@/lib/api";
import { useRequireSession } from "@/lib/useSession";
import styles from "./config.module.css";

/**
 * The Config hub: everything about the app that can be changed without shipping
 * a build. Onboarding is the first — and so far only — module; later ones get a
 * section here rather than another top-level tab.
 */
export default function ConfigPage() {
  const ready = useRequireSession();
  const [variants, setVariants] = useState<OnboardingVariant[]>([]);
  const [experiments, setExperiments] = useState<Experiment[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const refresh = useCallback(() => {
    Promise.all([getVariants(), getExperiments()])
      .then(([nextVariants, nextExperiments]) => {
        setVariants(nextVariants);
        setExperiments(nextExperiments);
      })
      .catch(() =>
        setError("Could not load the config. Is the backend running?")
      );
  }, []);

  useEffect(() => {
    if (ready) refresh();
  }, [ready, refresh]);

  if (!ready) return null;

  // Every write refetches rather than patching local state — the same rule the
  // rest of this dashboard follows.
  async function run(action: () => Promise<unknown>, fallback: string) {
    setBusy(true);
    setError(null);
    try {
      await action();
      refresh();
    } catch (err) {
      setError(fieldError(err, fallback));
    } finally {
      setBusy(false);
    }
  }

  function duplicate(variant: OnboardingVariant) {
    const key = window.prompt(
      `Key for the copy of “${variant.name}”:`,
      `${variant.key}-b`
    );
    if (!key) return;
    void run(
      () => duplicateVariant(variant.key, { key, name: `${variant.name} (copy)` }),
      "Could not duplicate that variant."
    );
  }

  function remove(variant: OnboardingVariant) {
    if (!window.confirm(`Delete “${variant.name}”? This cannot be undone.`)) return;
    void run(() => deleteVariant(variant.key), "Could not delete that variant.");
  }

  return (
    <div className={styles.page}>
      <div className="card">
        <span className="kicker">Config</span>
        <h1 className={styles.title}>Editable features</h1>
        <p className="muted">
          Things you can change without shipping an app build. Edits reach players
          the next time they open the flow — no redeploy, no store review.
        </p>
      </div>

      {error && <p className="error">{error}</p>}

      <section className="card">
        <div className={styles.sectionHeader}>
          <h2 className={styles.sectionTitle}>Onboarding flows</h2>
          <p className="muted">
            The six-step flow every new account has to finish. The default is
            served to everyone outside a running experiment.
          </p>
        </div>

        <div className={styles.list}>
          {variants.length === 0 && (
            <p className="muted">
              No flows yet. Run <code>manage.py seed_onboarding_config</code> on the
              backend to load the one the app ships with.
            </p>
          )}
          {variants.map((variant) => (
            <div key={variant.key} className={styles.row}>
              <div className={styles.rowHeader}>
                <h3 className={styles.rowTitle}>{variant.name}</h3>
                <span className={styles.badges}>
                  {variant.is_default && (
                    <span className={styles.badgeLive}>Default</span>
                  )}
                  {variant.in_use && <span className={styles.badgeWarn}>In an experiment</span>}
                  {variant.archived && <span className={styles.badgeDraft}>Archived</span>}
                </span>
              </div>
              <p className={styles.meta}>
                <code>{variant.key}</code> ·{" "}
                {variant.steps.filter((step) => step.enabled).length} of{" "}
                {variant.steps.length} steps on · updated{" "}
                {new Date(variant.updated_at).toLocaleDateString()}
              </p>
              {variant.notes && <p className="muted">{variant.notes}</p>}
              <div className={styles.actions}>
                <Link className="btnPrimary" href={`/config/${variant.key}`}>
                  Edit
                </Link>
                <button
                  type="button"
                  className="btnGhost"
                  disabled={busy}
                  onClick={() => duplicate(variant)}
                >
                  Duplicate
                </button>
                {!variant.is_default && (
                  <button
                    type="button"
                    className="btnGhost"
                    disabled={busy}
                    onClick={() =>
                      run(
                        () => setDefaultVariant(variant.key),
                        "Could not make that the default."
                      )
                    }
                  >
                    Make default
                  </button>
                )}
                <button
                  type="button"
                  className="btnGhost"
                  disabled={busy}
                  onClick={() =>
                    run(
                      () => patchVariant(variant.key, { archived: !variant.archived }),
                      "Could not archive that variant."
                    )
                  }
                >
                  {variant.archived ? "Un-archive" : "Archive"}
                </button>
                {/* The default and anything an experiment references are kept:
                    deleting either would take results or the fallback with it. */}
                {!variant.is_default && !variant.in_use && (
                  <button
                    type="button"
                    className="btnDanger"
                    disabled={busy}
                    onClick={() => remove(variant)}
                  >
                    Delete
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      </section>

      <ExperimentsSection
        variants={variants}
        experiments={experiments}
        busy={busy}
        onRun={run}
      />
    </div>
  );
}

function ExperimentsSection({
  variants,
  experiments,
  busy,
  onRun,
}: {
  variants: OnboardingVariant[];
  experiments: Experiment[];
  busy: boolean;
  onRun: (action: () => Promise<unknown>, fallback: string) => void;
}) {
  const [key, setKey] = useState("");
  const [name, setName] = useState("");
  const [hypothesis, setHypothesis] = useState("");
  const [controlVariant, setControlVariant] = useState("");
  const [testVariant, setTestVariant] = useState("");
  const [split, setSplit] = useState(50);

  const pickable = variants.filter((variant) => !variant.archived);
  const running = experiments.find((e) => e.status === "running");

  function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    onRun(
      () =>
        createExperiment({
          key,
          name,
          hypothesis,
          arms: [
            { key: "control", variant: controlVariant, weight: 100 - split },
            { key: "b", variant: testVariant, weight: split },
          ],
        }),
      "Could not create that experiment."
    );
    setKey("");
    setName("");
    setHypothesis("");
  }

  return (
    <>
      <section className="card">
        <div className={styles.sectionHeader}>
          <h2 className={styles.sectionTitle}>A/B experiments</h2>
          <p className="muted">
            One experiment runs at a time. Each new account is assigned when it
            opens onboarding and stays on that flow — changing a weight later
            never moves anyone already in.
          </p>
        </div>

        <form className={styles.form} onSubmit={handleSubmit}>
          <div className={styles.formRow}>
            <input
              placeholder="Key (e.g. short-flow)"
              value={key}
              onChange={(e) => setKey(e.target.value)}
              required
            />
            <input
              placeholder="Name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
            />
          </div>
          <input
            placeholder="What do you expect to happen?"
            value={hypothesis}
            onChange={(e) => setHypothesis(e.target.value)}
          />
          <div className={styles.formRow}>
            <select
              value={controlVariant}
              onChange={(e) => setControlVariant(e.target.value)}
              required
            >
              <option value="">Control flow…</option>
              {pickable.map((variant) => (
                <option key={variant.key} value={variant.key}>
                  {variant.name}
                </option>
              ))}
            </select>
            <select
              value={testVariant}
              onChange={(e) => setTestVariant(e.target.value)}
              required
            >
              <option value="">Test flow…</option>
              {pickable.map((variant) => (
                <option key={variant.key} value={variant.key}>
                  {variant.name}
                </option>
              ))}
            </select>
            <select value={split} onChange={(e) => setSplit(Number(e.target.value))}>
              {[10, 20, 30, 40, 50, 60, 70, 80, 90].map((value) => (
                <option key={value} value={value}>
                  {100 - value}% control / {value}% test
                </option>
              ))}
            </select>
          </div>
          <div className={styles.formActions}>
            <button type="submit" className="btnPrimary" disabled={busy}>
              Create as draft
            </button>
          </div>
        </form>
      </section>

      {experiments.map((experiment) => (
        <ExperimentCard
          key={experiment.key}
          experiment={experiment}
          busy={busy}
          blockedByRunning={
            running !== undefined && running.key !== experiment.key
          }
          onRun={onRun}
        />
      ))}
    </>
  );
}

function ExperimentCard({
  experiment,
  busy,
  blockedByRunning,
  onRun,
}: {
  experiment: Experiment;
  busy: boolean;
  blockedByRunning: boolean;
  onRun: (action: () => Promise<unknown>, fallback: string) => void;
}) {
  const [results, setResults] = useState<ExperimentResults | null>(null);

  useEffect(() => {
    // Drafts have nothing to show yet.
    if (experiment.status === "draft") return;
    getExperimentResults(experiment.key)
      .then(setResults)
      .catch(() => setResults(null));
  }, [experiment.key, experiment.status]);

  return (
    <section className="card">
      <div className={styles.rowHeader}>
        <h3 className={styles.rowTitle}>{experiment.name}</h3>
        <span className={styles.badges}>
          <span
            className={
              experiment.status === "running" ? styles.badgeLive : styles.badgeDraft
            }
          >
            {experiment.status}
          </span>
        </span>
      </div>
      <p className={styles.meta}>
        <code>{experiment.key}</code> ·{" "}
        {experiment.arms
          .map((arm) => `${arm.key} → ${arm.variant_name} (${arm.weight})`)
          .join(" · ")}
      </p>
      {experiment.hypothesis && <p className="muted">{experiment.hypothesis}</p>}

      <div className={styles.actions}>
        {experiment.status !== "running" && (
          <button
            type="button"
            className="btnPrimary"
            disabled={busy || blockedByRunning}
            title={
              blockedByRunning
                ? "Stop the running experiment first — only one runs at a time."
                : undefined
            }
            onClick={() =>
              onRun(
                () => patchExperiment(experiment.key, { status: "running" }),
                "Could not start that experiment."
              )
            }
          >
            Start
          </button>
        )}
        {experiment.status === "running" && (
          <button
            type="button"
            className="btnGhost"
            disabled={busy}
            onClick={() =>
              onRun(
                () => patchExperiment(experiment.key, { status: "stopped" }),
                "Could not stop that experiment."
              )
            }
          >
            Stop
          </button>
        )}
        {experiment.status === "draft" && (
          <button
            type="button"
            className="btnDanger"
            disabled={busy}
            onClick={() => {
              if (!window.confirm(`Delete “${experiment.name}”?`)) return;
              onRun(
                () => deleteExperiment(experiment.key),
                "Could not delete that experiment."
              );
            }}
          >
            Delete
          </button>
        )}
      </div>

      {results && <Results results={results} />}
    </section>
  );
}

function Results({ results }: { results: ExperimentResults }) {
  const pct = (value: number) => `${Math.round(value * 100)}%`;

  return (
    <>
      <div className={styles.tableWrap}>
        <table>
          <thead>
            <tr>
              <th>Arm</th>
              <th className={styles.numeric}>Started</th>
              <th className={styles.numeric}>Completed</th>
              <th className={styles.numeric}>Completion</th>
              <th className={styles.numeric}>Practised</th>
              <th className={styles.numeric}>Activation</th>
            </tr>
          </thead>
          <tbody>
            {results.arms.map((arm) => (
              <tr key={arm.arm_key}>
                <td>
                  <span className={styles.armName}>
                    <strong>{arm.arm_key}</strong>
                    <span className={styles.armVariant}>{arm.variant_name}</span>
                  </span>
                </td>
                <td className={styles.numeric}>{arm.assigned}</td>
                <td className={styles.numeric}>{arm.completed}</td>
                <td className={styles.numeric}>{pct(arm.completion_rate)}</td>
                <td className={styles.numeric}>
                  {arm.activated} / {arm.matured}
                </td>
                <td className={styles.numeric}>
                  {arm.enough_data ? pct(arm.activation_rate) : "—"}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <p className="muted">
        “Practised” is accounts that recorded a gradable take within{" "}
        {results.activation_window_days} days of being assigned — the number that
        decides this, since a flow can be finished more often and still produce
        fewer players. Only assignments old enough to have had that full window
        count in it. Rates read “—” below {results.min_sample} accounts, where
        they are still noise.
      </p>

      {results.arms.map((arm) => (
        <div key={arm.arm_key} className={styles.dropoff}>
          <p className={styles.groupLabel}>Where {arm.arm_key} drops off</p>
          {arm.steps.map((step) => (
            <div key={step.step_key} className={styles.dropoffRow}>
              <span>{step.title || step.step_key}</span>
              <span className={styles.bar}>
                <span
                  className={styles.barFill}
                  style={{
                    width: arm.assigned > 0 ? pct(step.viewed / arm.assigned) : "0%",
                  }}
                />
              </span>
              <span className={styles.numeric}>{step.viewed}</span>
            </div>
          ))}
        </div>
      ))}
    </>
  );
}
