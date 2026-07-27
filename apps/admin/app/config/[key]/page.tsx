"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useCallback, useEffect, useState } from "react";

import {
  CatalogStep,
  ConfiguredOption,
  OnboardingVariant,
  VariantStep,
  fieldError,
  getOnboardingCatalog,
  getVariant,
  patchVariant,
} from "@/lib/api";
import { useRequireSession } from "@/lib/useSession";
import styles from "../config.module.css";

/**
 * Edit one onboarding flow.
 *
 * The form is built from `GET /api/features/onboarding/catalog/` rather than
 * hard-coded per step: the backend says which copy slots and option groups each
 * step has and which of them are writable, so this page cannot offer a field the
 * serializer would reject, and a slot added in Python appears here on its own.
 */
export default function VariantEditorPage() {
  const ready = useRequireSession();
  const params = useParams<{ key: string }>();
  const variantKey = params.key;

  const [catalog, setCatalog] = useState<CatalogStep[]>([]);
  const [variant, setVariant] = useState<OnboardingVariant | null>(null);
  const [steps, setSteps] = useState<VariantStep[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [busy, setBusy] = useState(false);

  const load = useCallback(() => {
    Promise.all([getOnboardingCatalog(), getVariant(variantKey)])
      .then(([schema, loaded]) => {
        setCatalog(schema.steps);
        setVariant(loaded);
        setSteps(loaded.steps);
      })
      .catch(() => setError("Could not load that flow. Is the backend running?"));
  }, [variantKey]);

  useEffect(() => {
    if (ready) load();
  }, [ready, load]);

  if (!ready) return null;

  function update(index: number, next: Partial<VariantStep>) {
    setSaved(false);
    setSteps((current) =>
      current.map((step, i) => (i === index ? { ...step, ...next } : step))
    );
  }

  // List position is the step order, so reordering is a list move — there is no
  // order field that could drift out of sync with it.
  function move(index: number, delta: number) {
    const target = index + delta;
    if (target < 0 || target >= steps.length) return;
    setSaved(false);
    setSteps((current) => {
      const next = [...current];
      [next[index], next[target]] = [next[target], next[index]];
      return next;
    });
  }

  async function save() {
    setBusy(true);
    setError(null);
    try {
      const updated = await patchVariant(variantKey, { steps });
      setVariant(updated);
      setSteps(updated.steps);
      setSaved(true);
    } catch (err) {
      setError(fieldError(err, "Saving failed — check the backend logs."));
    } finally {
      setBusy(false);
    }
  }

  const enabledCount = steps.filter((step) => step.enabled).length;

  return (
    <div className={styles.page}>
      <div className="card">
        <span className="kicker">Onboarding flow</span>
        <h1 className={styles.title}>{variant?.name ?? variantKey}</h1>
        <p className="muted">
          {enabledCount} of {steps.length} steps on.{" "}
          {variant?.is_default
            ? "This is the default flow — everyone outside a running experiment sees it."
            : "Served only to the experiment arms that point at it."}
        </p>
        <div className={styles.actions}>
          <Link className="btnGhost" href="/config">
            Back to config
          </Link>
        </div>
      </div>

      {error && <p className="error">{error}</p>}

      {steps.map((step, index) => {
        const spec = catalog.find((entry) => entry.step_key === step.step_key);
        if (!spec) return null;
        return (
          <section
            key={step.step_key}
            className={`card ${styles.step} ${step.enabled ? "" : styles.disabled}`}
          >
            <div className={styles.stepHeader}>
              <h2 className={styles.stepTitle}>
                {index + 1}. {spec.name}
              </h2>
              <div className={styles.actions}>
                <label className={styles.toggle}>
                  <input
                    type="checkbox"
                    checked={step.enabled}
                    onChange={(e) => update(index, { enabled: e.target.checked })}
                  />
                  Shown
                </label>
                <button
                  type="button"
                  className="btnGhost"
                  disabled={index === 0}
                  onClick={() => move(index, -1)}
                >
                  ↑
                </button>
                <button
                  type="button"
                  className="btnGhost"
                  disabled={index === steps.length - 1}
                  onClick={() => move(index, 1)}
                >
                  ↓
                </button>
              </div>
            </div>

            {spec.copy_slots.map((slot) => (
              <label key={slot.key} className={styles.field}>
                <span className={styles.fieldLabel}>
                  {slot.label}
                  {slot.required ? "" : " (optional)"}
                </span>
                {slot.multiline ? (
                  <textarea
                    rows={2}
                    maxLength={slot.max_length}
                    value={step.copy[slot.key] ?? ""}
                    onChange={(e) =>
                      update(index, {
                        copy: { ...step.copy, [slot.key]: e.target.value },
                      })
                    }
                  />
                ) : (
                  <input
                    type="text"
                    maxLength={slot.max_length}
                    placeholder={
                      slot.key === "cta" ? "Continue" : `Up to ${slot.max_length} characters`
                    }
                    value={step.copy[slot.key] ?? ""}
                    onChange={(e) =>
                      update(index, {
                        copy: { ...step.copy, [slot.key]: e.target.value },
                      })
                    }
                  />
                )}
              </label>
            ))}

            {spec.option_groups.map((group) => (
              <OptionGroup
                key={group.key}
                group={group}
                chosen={step.options[group.key] ?? []}
                onChange={(next) =>
                  update(index, { options: { ...step.options, [group.key]: next } })
                }
              />
            ))}
          </section>
        );
      })}

      <div className={styles.sticky}>
        <button type="button" className="btnPrimary" disabled={busy} onClick={save}>
          {busy ? "Saving…" : "Save changes"}
        </button>
        <button type="button" className="btnGhost" disabled={busy} onClick={load}>
          Discard
        </button>
        {saved && <span className="muted">Saved. Players see it on their next run.</span>}
      </div>
    </div>
  );
}

function OptionGroup({
  group,
  chosen,
  onChange,
}: {
  group: CatalogStep["option_groups"][number];
  chosen: ConfiguredOption[];
  onChange: (next: ConfiguredOption[]) => void;
}) {
  const byValue = new Map(chosen.map((option) => [option.value, option]));
  const writable = group.editable.length > 0;

  function toggle(value: string | number, on: boolean) {
    if (!on) {
      onChange(chosen.filter((option) => option.value !== value));
      return;
    }
    // Re-added in the catalog's canonical order, so a variant's list always
    // reads the way the app will render it.
    const next = new Map(byValue);
    next.set(value, { value });
    onChange(group.values.filter((v) => next.has(v)).map((v) => next.get(v)!));
  }

  function write(value: string | number, field: "label" | "hint", text: string) {
    onChange(
      chosen.map((option) =>
        option.value === value ? { ...option, [field]: text } : option
      )
    );
  }

  return (
    <>
      <p className={styles.groupLabel}>
        {group.label}
        {!writable && " — names come from the app"}
      </p>
      {group.values.map((value) => {
        const option = byValue.get(value);
        return (
          <div key={String(value)} className={styles.option}>
            <label className={styles.toggle}>
              <input
                type="checkbox"
                checked={option !== undefined}
                onChange={(e) => toggle(value, e.target.checked)}
              />
            </label>
            <span className={styles.optionValue}>{String(value)}</span>
            {writable && option !== undefined && (
              <>
                {group.editable.includes("label") && (
                  <input
                    type="text"
                    placeholder="Label"
                    value={option.label ?? ""}
                    onChange={(e) => write(value, "label", e.target.value)}
                  />
                )}
                {group.editable.includes("hint") && (
                  <input
                    type="text"
                    placeholder="Hint"
                    value={option.hint ?? ""}
                    onChange={(e) => write(value, "hint", e.target.value)}
                  />
                )}
              </>
            )}
          </div>
        );
      })}
    </>
  );
}
