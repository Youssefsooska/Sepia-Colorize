/**
 * Color swatch card — matches the reference screenshot: rounded color square
 * on the left, hex/date/rgb stacked on the right. Click copies the hex to
 * the clipboard; right-click opens a context menu with all format copiers +
 * move/delete; the card is draggable so users can move colors between
 * collections with the native HTML5 drag API.
 */
import { useState } from 'react';
import type { MouseEvent, DragEvent } from 'react';
import { SavedColor } from '../types';
import { formatRgb, formatHsl, formatCmyk } from '../utils/colorConversion';
import { relativeTime } from '../utils/time';
import { useColorStore } from '../stores/colorStore';
import { showToast } from './Toast';

interface ColorCardProps {
  color: SavedColor;
  /** Present when the card lives inside a user collection. Reserved for
   * future per-collection actions (e.g. remove from this collection). */
  collectionId?: string;
}

export function ColorCard({ color, collectionId: _collectionId }: ColorCardProps): JSX.Element {
  const [menu, setMenu] = useState<{ x: number; y: number } | null>(null);
  const deleteColor = useColorStore((s) => s.deleteColor);
  const moveColorToCollection = useColorStore((s) => s.moveColorToCollection);
  const collections = useColorStore((s) => s.collections);
  const collectionOrder = useColorStore((s) => s.collectionOrder);

  const copy = (value: string, label: string) => {
    navigator.clipboard.writeText(value).catch(() => {});
    showToast(`Copied ${label}`);
    setMenu(null);
  };

  const onClick = () => copy(color.hex, color.hex);

  const onContextMenu = (e: MouseEvent) => {
    e.preventDefault();
    setMenu({ x: e.clientX, y: e.clientY });
  };

  const onDragStart = (e: DragEvent) => {
    e.dataTransfer.setData('text/sepia-color-id', color.id);
    e.dataTransfer.effectAllowed = 'move';
  };

  return (
    <div
      draggable
      onDragStart={onDragStart}
      onClick={onClick}
      onContextMenu={onContextMenu}
      className="group flex cursor-pointer items-center gap-3 rounded-card bg-surface p-3 transition-colors hover:bg-surface-hover"
      title="Click to copy hex"
    >
      <div
        className="h-12 w-12 flex-shrink-0 rounded-card shadow-inner"
        style={{ backgroundColor: color.hex }}
      />
      <div className="min-w-0 flex-1">
        <div className="flex items-baseline gap-2">
          <span className="font-mono text-sm font-medium text-text-primary">{color.hex}</span>
          <span className="text-xs text-text-secondary">{relativeTime(color.timestamp)}</span>
        </div>
        <div className="truncate font-mono text-xs text-text-secondary">
          {formatRgb(color.rgb)}
        </div>
      </div>

      {menu && (
        <ContextMenu
          x={menu.x}
          y={menu.y}
          onClose={() => setMenu(null)}
          items={[
            { label: 'Copy as HEX', onClick: () => copy(color.hex, 'HEX') },
            { label: 'Copy as RGB', onClick: () => copy(formatRgb(color.rgb), 'RGB') },
            { label: 'Copy as HSL', onClick: () => copy(formatHsl(color.hsl), 'HSL') },
            { label: 'Copy as CMYK', onClick: () => copy(formatCmyk(color.cmyk), 'CMYK') },
            ...(collectionOrder.length
              ? [{
                  label: 'Move to Collection ▸',
                  submenu: collectionOrder.map((id) => ({
                    label: collections[id]?.name ?? '',
                    onClick: () => {
                      moveColorToCollection(color.id, id);
                      setMenu(null);
                      showToast(`Moved to ${collections[id]?.name}`);
                    },
                  })),
                }]
              : []),
            { label: 'Delete', danger: true, onClick: () => { deleteColor(color.id); setMenu(null); } },
          ]}
        />
      )}
    </div>
  );
}

// --- Minimal context menu --------------------------------------------------

interface MenuItem {
  label: string;
  onClick?: () => void;
  danger?: boolean;
  submenu?: MenuItem[];
}

interface ContextMenuProps {
  x: number;
  y: number;
  items: MenuItem[];
  onClose: () => void;
}

export function ContextMenu({ x, y, items, onClose }: ContextMenuProps): JSX.Element {
  const [openSub, setOpenSub] = useState<number | null>(null);
  return (
    <>
      <div className="fixed inset-0 z-40" onClick={onClose} onContextMenu={(e) => { e.preventDefault(); onClose(); }} />
      <ul
        className="fixed z-50 min-w-[180px] overflow-hidden rounded-button border border-border-subtle bg-surface-elevated py-1 text-sm shadow-lg"
        style={{ left: x, top: y }}
      >
        {items.map((it, i) => (
          <li
            key={i}
            onMouseEnter={() => setOpenSub(it.submenu ? i : null)}
            className={`relative cursor-pointer px-3 py-1.5 ${
              it.danger ? 'text-danger hover:bg-danger/10' : 'text-text-primary hover:bg-surface-hover'
            }`}
            onClick={(e) => { e.stopPropagation(); if (!it.submenu) it.onClick?.(); }}
          >
            {it.label}
            {it.submenu && openSub === i && (
              <ul className="absolute left-full top-0 ml-1 min-w-[160px] overflow-hidden rounded-button border border-border-subtle bg-surface-elevated py-1 shadow-lg">
                {it.submenu.map((sub, j) => (
                  <li
                    key={j}
                    onClick={(e) => { e.stopPropagation(); sub.onClick?.(); }}
                    className="cursor-pointer px-3 py-1.5 text-text-primary hover:bg-surface-hover"
                  >
                    {sub.label}
                  </li>
                ))}
              </ul>
            )}
          </li>
        ))}
      </ul>
    </>
  );
}
