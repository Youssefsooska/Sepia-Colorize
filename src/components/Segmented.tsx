/**
 * Two related controls for picking one value from a small set — replaces
 * native <select> on the settings and color-theory pages.
 *
 *   Segmented  — compact pill-track. Good when there are 3–5 short options
 *                that fit on one line (e.g. HEX / RGB / HSL / CMYK).
 *   ChipGroup  — wraps onto multiple rows. Good when options are longer
 *                or there are 6+ of them (e.g. harmony types, export
 *                formats).
 *
 * Both are semantically a <div role="radiogroup"> with <button role="radio">
 * children so screen readers and keyboard users can traverse the options.
 */

interface Option<V extends string> {
  value: V;
  label: string;
}

interface BaseProps<V extends string> {
  value: V;
  onChange: (next: V) => void;
  options: Option<V>[];
  ariaLabel?: string;
}

export function Segmented<V extends string>({
  value,
  onChange,
  options,
  ariaLabel,
}: BaseProps<V>): JSX.Element {
  return (
    <div
      role="radiogroup"
      aria-label={ariaLabel}
      className="inline-flex gap-0.5 rounded-button border border-border-subtle bg-app p-0.5"
    >
      {options.map((o) => {
        const selected = o.value === value;
        return (
          <button
            key={o.value}
            role="radio"
            aria-checked={selected}
            onClick={() => onChange(o.value)}
            className={`rounded px-3 py-1 font-mono text-xs transition-colors ${
              selected
                ? 'bg-elevated text-accent'
                : 'text-text-secondary hover:text-text-primary'
            }`}
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
}

export function ChipGroup<V extends string>({
  value,
  onChange,
  options,
  ariaLabel,
}: BaseProps<V>): JSX.Element {
  return (
    <div
      role="radiogroup"
      aria-label={ariaLabel}
      className="flex flex-wrap gap-1.5"
    >
      {options.map((o) => {
        const selected = o.value === value;
        return (
          <button
            key={o.value}
            role="radio"
            aria-checked={selected}
            onClick={() => onChange(o.value)}
            className={`rounded-button px-3 py-1.5 text-xs transition-colors ${
              selected
                ? 'border border-accent bg-elevated text-accent'
                : 'border border-border-subtle bg-transparent text-text-secondary hover:border-border-accent hover:text-text-primary'
            }`}
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
}
