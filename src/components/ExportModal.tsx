/**
 * Export modal. Shows a format picker, a live preview of the generated file,
 * and a "Save File" button that invokes Electron's native save dialog via
 * window.sepia.saveExport. Works for a single collection or for the whole
 * drawer — the caller passes either `collection` or nothing.
 */
import { useMemo, useState, useEffect } from 'react';
import { Collection, ExportFormat, SavedColor } from '../types';
import {
  exportAll,
  exportCollection,
  EXPORT_FORMAT_LABELS,
} from '../utils/exportFormats';
import { useColorStore } from '../stores/colorStore';
import { showToast } from './Toast';

interface ExportModalProps {
  open: boolean;
  onClose: () => void;
  collection?: Collection;
}

export function ExportModal({ open, onClose, collection }: ExportModalProps): JSX.Element | null {
  const colors = useColorStore((s) => s.colors);
  const collections = useColorStore((s) => s.collections);
  const collectionOrder = useColorStore((s) => s.collectionOrder);
  const [format, setFormat] = useState<ExportFormat>('css');

  // Close on Escape.
  useEffect(() => {
    if (!open) return;
    const h = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  }, [open, onClose]);

  const result = useMemo(() => {
    if (collection) {
      const ordered: SavedColor[] = collection.colorIds
        .map((id) => colors[id])
        .filter((c): c is SavedColor => !!c);
      return exportCollection(collection, ordered, format);
    }
    const orderedCollections = collectionOrder
      .map((id) => collections[id])
      .filter((c): c is Collection => !!c);
    return exportAll(orderedCollections, Object.values(colors), format);
  }, [collection, colors, collections, collectionOrder, format]);

  const save = async () => {
    const defaultName = (collection ? slugish(collection.name) : 'sepia-colors') + result.extension;
    const res = await window.sepia.saveExport({
      format,
      data: result.content,
      defaultName,
      isBinary: result.isBinary,
    });
    if (res.saved) {
      showToast('Saved');
      onClose();
    }
  };

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60" onClick={onClose}>
      <div
        onClick={(e) => e.stopPropagation()}
        className="w-[560px] max-w-[92vw] rounded-modal border border-border-subtle bg-surface-elevated p-5 shadow-2xl"
      >
        <h3 className="text-base font-medium">
          Export {collection ? collection.name : 'All Collections'}
        </h3>

        <div className="mt-4 flex items-center gap-2">
          <label className="text-sm text-text-secondary">Format:</label>
          <select
            value={format}
            onChange={(e) => setFormat(e.target.value as ExportFormat)}
            className="rounded-button border border-border-subtle bg-app px-2 py-1 text-sm"
          >
            {(Object.keys(EXPORT_FORMAT_LABELS) as ExportFormat[]).map((f) => (
              <option key={f} value={f}>{EXPORT_FORMAT_LABELS[f]}</option>
            ))}
          </select>
        </div>

        <div className="mt-4">
          <div className="text-xs text-text-secondary mb-1">Preview</div>
          <textarea
            readOnly
            value={result.isBinary ? '[Binary .ase — click "Save File" to write to disk]' : result.content}
            className="h-56 w-full resize-none rounded-button border border-border-subtle bg-app p-2 font-mono text-xs text-text-primary"
          />
        </div>

        <div className="mt-4 flex justify-end gap-2">
          <button
            onClick={onClose}
            className="rounded-button px-3 py-1.5 text-sm text-text-secondary hover:bg-surface-hover hover:text-text-primary"
          >
            Cancel
          </button>
          <button
            onClick={save}
            className="rounded-button bg-accent px-3 py-1.5 text-sm text-white hover:bg-accent-hover"
          >
            Save File
          </button>
        </div>
      </div>
    </div>
  );
}

function slugish(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'colors';
}
