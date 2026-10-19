interface LoaderProps {
  visible: boolean;
  /** 0…1 of the clip's buffered range. */
  progress: number;
  label: string;
  detail: string | null;
}

/**
 * First-paint curtain.
 *
 * Deliberately not a spinner: a thin red rule under the mark, a percentage and
 * the name of the thing being fetched. It holds for a beat even on a warm cache
 * so the opening dissolves rather than snaps, and it never intercepts a scroll
 * the visitor has already started.
 */
export function Loader({ visible, progress, label, detail }: LoaderProps) {
  const pct = Math.round(Math.min(Math.max(progress, 0), 1) * 100);

  return (
    <div className={`loader${visible ? '' : ' is-hidden'}`} role="status" aria-live="polite">
      <div className="loader__inner">
        <p className="loader__eyebrow">Scuderia · Maranello</p>
        <p className="loader__mark">
          <span>Ferrari</span>
          <span className="loader__model">F40</span>
        </p>
        <div className="loader__track" aria-hidden="true">
          <div className="loader__bar" style={{ transform: `scaleX(${Math.max(progress, 0.015)})` }} />
        </div>
        <p className="loader__meta">
          <span>{detail ?? label}</span>
          <span className="loader__pct">{String(pct).padStart(3, '0')}%</span>
        </p>
      </div>
    </div>
  );
}