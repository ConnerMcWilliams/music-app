// Route-transition fallback for the dashboard while a segment loads.
export default function Loading() {
  return (
    <p className="muted" role="status" aria-live="polite" style={{ padding: "48px 0", textAlign: "center" }}>
      Loading…
    </p>
  );
}
