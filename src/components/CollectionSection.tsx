/**
 * A single collection block on the drawer page: header with name + count,
 * 4-column grid of cards when expanded, and an expand/collapse toggle
 * attached to a divider line — this mirrors the reference screenshot.
 *
 * "All Colors" reuses this component by passing allColorsMode + the full
 * color list so the same visual rhythm is preserved for the aggregate view.
 */
import { useState } from 'react';
import { SavedColor } from '../types';
import { ColorCard, ContextMenu } from './ColorCard';
import { useColorStore } from '../stores/colorStore';

interface CollectionSectionProps {
  title: string;
  colors: SavedColor[];
  expanded: boolean;
  onToggle: () => void;
  collectionId?: string; // omitted for "All Colors"
  onExport?: () => void; // opens the export modal for this collection
}

export function CollectionSection({
  title,
  colors,
  expanded,
  onToggle,
  collectionId,
  onExport,
}: CollectionSectionProps): JSX.Element {
  const [menu, setMenu] = useState<{ x: number; y: number } | null>(null);
  const [renaming, setRenaming] = useState(false);
  const [draftName, setDraftName] = useState(title);
  const renameCollection = useColorStore((s) => s.renameCollection);
  const deleteCollection = useColorStore((s) => s.deleteCollection);
  const moveColorToCollection = useColorStore((s) => s.moveColorToCollection);

  const isAllColors = !collectionId;

  // When collapsed, show a limited preview (first 4) only for "All Colors"
  // per spec; user collections show nothing until expanded.
  const visibleColors = expanded ? colors : isAllColors ? colors.slice(0, 4) : [];

  const onHeaderContext = (e: React.MouseEvent) => {
    if (isAllColors) return;
    e.preventDefault();
    setMenu({ x: e.clientX, y: e.clientY });
  };

  const onDrop = (e: React.DragEvent) => {
    if (!collectionId) return;
    const colorId = e.dataTransfer.getData('text/sepia-color-id');
    if (colorId) moveColorToCollection(colorId, collectionId);
  };

  return (
    <section
      className="rounded-card bg-surface p-5"
      onDragOver={(e) => { if (collectionId) e.preventDefault(); }}
      onDrop={onDrop}
    >
      <header
        onContextMenu={onHeaderContext}
        className="flex items-center justify-between"
      >
        {renaming && collectionId ? (
          <input
            autoFocus
            value={draftName}
            onChange={(e) => setDraftName(e.target.value)}
            onBlur={() => { renameCollection(collectionId, draftName); setRenaming(false); }}
            onKeyDown={(e) => {
              if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
              if (e.key === 'Escape') { setDraftName(title); setRenaming(false); }
            }}
            className="bg-transparent text-base font-medium text-text-primary outline-none border-b border-border-accent"
          />
        ) : (
          <h2 className="text-base font-medium text-text-primary">{title}</h2>
        )}
        <span className="font-mono text-sm text-text-secondary">{colors.length}</span>
      </header>

      {visibleColors.length > 0 && (
        <div className="mt-4 grid grid-cols-4 gap-3">
          {visibleColors.map((c) => (
            <ColorCard key={c.id} color={c} collectionId={collectionId} />
          ))}
        </div>
      )}

      <div className="mt-4 flex items-center gap-3">
        <div className="h-px flex-1 bg-border-subtle" />
        <button
          onClick={onToggle}
          className="text-xs text-text-secondary hover:text-text-primary"
        >
          {expanded ? 'collapse ∧' : 'expand ∨'}
        </button>
      </div>

      {menu && collectionId && (
        <ContextMenu
          x={menu.x}
          y={menu.y}
          onClose={() => setMenu(null)}
          items={[
            { label: 'Rename', onClick: () => { setRenaming(true); setMenu(null); } },
            { label: 'Export Collection', onClick: () => { onExport?.(); setMenu(null); } },
            { label: 'Delete', danger: true, onClick: () => { deleteCollection(collectionId); setMenu(null); } },
          ]}
        />
      )}
    </section>
  );
}
