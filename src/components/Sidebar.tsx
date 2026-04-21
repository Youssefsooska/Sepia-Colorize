/**
 * Left icon-only navigation rail — 56px wide, fixed full height.
 * The active page icon is painted in the accent color so the user always
 * knows where they are. App version is pinned to the bottom.
 */
import { PageId } from '../App';

interface SidebarProps {
  page: PageId;
  onChange: (p: PageId) => void;
}

const iconBtn =
  'flex h-10 w-10 items-center justify-center rounded-button transition-colors';

export function Sidebar({ page, onChange }: SidebarProps): JSX.Element {
  const items: Array<{ id: PageId; label: string; icon: JSX.Element }> = [
    { id: 'drawer', label: 'Drawer', icon: <DrawerIcon /> },
    { id: 'theory', label: 'Color Theory', icon: <PrismIcon /> },
    { id: 'settings', label: 'Settings', icon: <GearIcon /> },
  ];

  return (
    <nav className="flex h-full w-14 flex-col items-center border-r border-border-subtle bg-surface py-3">
      <div className="flex flex-col gap-2">
        {items.map((it) => (
          <button
            key={it.id}
            title={it.label}
            onClick={() => onChange(it.id)}
            className={`${iconBtn} ${
              page === it.id
                ? 'bg-surface-hover text-accent'
                : 'text-text-secondary hover:bg-surface-hover hover:text-text-primary'
            }`}
          >
            {it.icon}
          </button>
        ))}
      </div>
      <div className="mt-auto text-[10px] text-text-muted">v1.0.0</div>
    </nav>
  );
}

// --- SVG icon primitives (inline so we don't ship an icon library) --------

function DrawerIcon(): JSX.Element {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="3" width="7" height="7" rx="1.5" />
      <rect x="14" y="3" width="7" height="7" rx="1.5" />
      <rect x="3" y="14" width="7" height="7" rx="1.5" />
      <rect x="14" y="14" width="7" height="7" rx="1.5" />
    </svg>
  );
}

function PrismIcon(): JSX.Element {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="9" />
      <path d="M12 3v18" />
      <path d="M3 12h18" />
    </svg>
  );
}

function GearIcon(): JSX.Element {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="3" />
      <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09a1.65 1.65 0 0 0-1-1.51 1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09a1.65 1.65 0 0 0 1.51-1 1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
    </svg>
  );
}
