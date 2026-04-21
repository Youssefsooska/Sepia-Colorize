/**
 * Save-to-disk handler for export payloads from the renderer.
 *
 * The renderer generates the file content (via src/utils/exportFormats) and
 * sends it here. Main shows a native save dialog (anchored to the main
 * window) and writes the file, decoding base64 first for binary formats.
 */
import { dialog, BrowserWindow } from 'electron';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import type { ExportSavePayload } from '../src/types';

export async function saveExport(
  payload: ExportSavePayload,
  parent: BrowserWindow | null,
): Promise<{ saved: boolean; path?: string }> {
  if (!payload || typeof payload.data !== 'string') {
    return { saved: false };
  }

  const ext = path.extname(payload.defaultName) || '';
  const filters = ext
    ? [{ name: payload.format.toUpperCase(), extensions: [ext.replace(/^\./, '')] }]
    : [{ name: 'All files', extensions: ['*'] }];

  const result = await (parent
    ? dialog.showSaveDialog(parent, { defaultPath: payload.defaultName, filters })
    : dialog.showSaveDialog({ defaultPath: payload.defaultName, filters }));

  if (result.canceled || !result.filePath) return { saved: false };

  try {
    if (payload.isBinary) {
      await fs.writeFile(result.filePath, Buffer.from(payload.data, 'base64'));
    } else {
      await fs.writeFile(result.filePath, payload.data, 'utf-8');
    }
    return { saved: true, path: result.filePath };
  } catch (err) {
    console.error('Sepia: failed to write export file', err);
    return { saved: false };
  }
}
