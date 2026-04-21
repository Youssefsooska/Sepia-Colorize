/**
 * The main drawer view — matches the reference screenshot. Shows "All Colors"
 * on top (always first), then user collections in their stored order, then a
 * "+ New Collection" control at the bottom. A sticky top toolbar has a search
 * input, an "Export All" button, and a shortcut badge that navigates to
 * Settings when clicked.
 */
import { useState, useMemo, useEffect } from 'react';
import { useColorStore } from '../stores/colorStore';
import { useSettingsStore } from '../stores/settingsStore';
import { CollectionSection } from '../components/CollectionSection';
import { ExportModal } from '../components/ExportModal';
import { acceleratorDisplay } from '../components/HotkeyRecorder';
import { Collection, SavedColor } from '../types';

interface DrawerPageProps {
  onOpenSettings: () => void;
}

export function DrawerPage({ onOpenSettings }: DrawerPageProps): JSX.Element {
  const colors = useColorStore((s) => s.colors);
  const collections = useColorStore((s) => s.collections);
  const collectionOrder = useColorStore((s) => s.collectionOrder);
  const createCollection = useColorStore((s) => s.createCollection);
  const toggleCollectionExpanded = useColorStore((s) => s.toggleCollectionExpanded);
  const getAllColorsSortedByNewest = useColorStore((s) => s.getAllColorsSortedByNewest);
  const getColorsInCollection = useColorStore((s) => s.getColorsInCollection);

  const pickHotkey = useSettingsStore((s) => s.hotkeys.pickColor);
  const [platform, setPlatform] = useState<NodeJS.Platform>('darwin');
  useEffect(() => { window.sepia?.getPlatform().then(setPlatform).catch(() => {}); }, []);

  const [query, setQuery] = useState('');
  const [allExpanded, setAllExpanded] = useState(false);
  const [newCollectionDraft, setNewCollectionDraft] = useState<string | null>(null);
  const [exportTarget, setExportTarget] = useState<Collection | null>(null);
  const [exportAllOpen, setExportAllOpen] = useState(false);

  const q = query.trim().toLowerCase();
  const matches = (c: SavedColor): boolean => !q || c.hex.toLowerCase().includes(q);

  const allColors = useMemo(() => {
    // getAllColorsSortedByNewest is not reactive via selector; recompute on change.
    return Object.values(colors).sort((a, b) => b.timestamp - a.timestamp).filter(matches);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [colors, q]);

  void getAllColorsSortedByNewest; // referenced for API compatibility; see above.

  return (
    <div className="flex-1 overflow-y-auto">
      {/* Toolbar */}
      <div className="sticky top-0 z-10 flex items-center gap-3 border-b border-border-subtle bg-app/90 px-6 py-3 backdrop-blur">
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search by hex…"
          className="w-64 rounded-button border border-border-subtle bg-surface px-3 py-1.5 text-sm outline-none focus:border-border-accent"
        />
        <div className="flex-1" />
        <button
          onClick={() => setExportAllOpen(true)}
          className="rounded-button border border-border-subtle bg-surface px-3 py-1.5 text-sm hover:bg-surface-hover"
        >
          Export All
        </button>
        <button
          onClick={onOpenSettings}
          title="Change shortcut"
          className="rounded-button border border-border-subtle bg-surface px-2.5 py-1 font-mono text-xs text-text-secondary hover:text-text-primary"
        >
          {acceleratorDisplay(pickHotkey, platform)}
        </button>
      </div>

      {/* Sections */}
      <div className="space-y-4 p-6">
        <CollectionSection
          title="All Colors"
          colors={allColors}
          expanded={allExpanded}
          onToggle={() => setAllExpanded((v) => !v)}
        />

        {collectionOrder.map((cid) => {
          const c = collections[cid];
          if (!c) return null;
          const items = getColorsInCollection(cid).filter(matches);
          return (
            <CollectionSection
              key={cid}
              title={c.name}
              colors={items}
              expanded={c.isExpanded}
              onToggle={() => toggleCollectionExpanded(cid)}
              collectionId={cid}
              onExport={() => setExportTarget(c)}
            />
          );
        })}

        {/* New Collection */}
        {newCollectionDraft === null ? (
          <button
            onClick={() => setNewCollectionDraft('')}
            className="w-full rounded-card border border-dashed border-border-subtle p-4 text-sm text-text-secondary hover:border-border-accent hover:text-text-primary"
          >
            + New Collection
          </button>
        ) : (
          <div className="flex items-center gap-2 rounded-card bg-surface p-4">
            <input
              autoFocus
              value={newCollectionDraft}
              onChange={(e) => setNewCollectionDraft(e.target.value)}
              placeholder="Collection name"
              className="flex-1 rounded-button border border-border-subtle bg-app px-3 py-1.5 text-sm outline-none focus:border-border-accent"
              onKeyDown={(e) => {
                if (e.key === 'Enter' && newCollectionDraft.trim()) {
                  createCollection(newCollectionDraft.trim());
                  setNewCollectionDraft(null);
                }
                if (e.key === 'Escape') setNewCollectionDraft(null);
              }}
            />
            <button
              onClick={() => {
                if (newCollectionDraft.trim()) {
                  createCollection(newCollectionDraft.trim());
                  setNewCollectionDraft(null);
                }
              }}
              className="rounded-button bg-accent px-3 py-1.5 text-sm text-white hover:bg-accent-hover"
            >
              Create
            </button>
            <button
              onClick={() => setNewCollectionDraft(null)}
              className="rounded-button px-3 py-1.5 text-sm text-text-secondary hover:bg-surface-hover"
            >
              Cancel
            </button>
          </div>
        )}
      </div>

      <ExportModal
        open={!!exportTarget}
        onClose={() => setExportTarget(null)}
        collection={exportTarget ?? undefined}
      />
      <ExportModal open={exportAllOpen} onClose={() => setExportAllOpen(false)} />
    </div>
  );
}
