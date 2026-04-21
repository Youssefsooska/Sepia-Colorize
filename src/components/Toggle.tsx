/**
 * iOS-style toggle switch — a single-purpose on/off control.
 * Semantically a <button role="switch"> so screen readers announce it
 * correctly; keyboard users can toggle with Space/Enter. Amber when on,
 * dim gray when off. Pairs with the settings row helpers below.
 */
import type { ReactNode } from 'react';

interface ToggleProps {
  checked: boolean;
  onChange: (next: boolean) => void;
  label?: string;
}

export function Toggle({ checked, onChange, label }: ToggleProps): JSX.Element {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      onClick={() => onChange(!checked)}
      className={`relative h-5 w-9 flex-shrink-0 rounded-full transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-accent/70 ${
        checked ? 'bg-accent' : 'bg-border-subtle'
      }`}
    >
      <span
        className={`absolute top-0.5 h-4 w-4 rounded-full transition-all ${
          checked ? 'left-[18px] bg-app' : 'left-0.5 bg-text-muted'
        }`}
      />
    </button>
  );
}

/**
 * A two-line settings row — label on top, dim description below, control
 * on the right. Keeps the Settings page rhythm consistent across toggles,
 * selects, and segmented controls.
 */
export function SettingsRow({
  label,
  description,
  children,
}: {
  label: string;
  description?: string;
  children: ReactNode;
}): JSX.Element {
  return (
    <div className="flex items-center justify-between gap-4 py-1">
      <div className="min-w-0 flex-1">
        <div className="text-sm font-medium text-text-primary">{label}</div>
        {description && (
          <div className="mt-0.5 text-xs text-text-muted">{description}</div>
        )}
      </div>
      {children}
    </div>
  );
}
