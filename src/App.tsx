/**
 * Root component. Holds the page selector (simple state-based router —
 * React Router would be overkill here) and subscribes to the Electron
 * color-picked IPC event so picked colors land in the store automatically.
 */
import { useEffect, useState } from 'react';
import { Sidebar } from './components/Sidebar';
import { DrawerPage } from './pages/DrawerPage';
import { ColorTheoryPage } from './pages/ColorTheoryPage';
import { SettingsPage } from './pages/SettingsPage';
import { Toaster, showToast } from './components/Toast';
import { useColorStore } from './stores/colorStore';
import { useSettingsStore } from './stores/settingsStore';

export type PageId = 'drawer' | 'theory' | 'settings';

function App(): JSX.Element {
  const [page, setPage] = useState<PageId>('drawer');
  const addColor = useColorStore((s) => s.addColor);
  const colors = useColorStore((s) => s.colors);
  const autoCopy = useSettingsStore((s) => s.autoCopyOnPick);

  // Wire up the main-process "color picked" IPC event.
  useEffect(() => {
    if (!window.sepia) return;
    const off = window.sepia.onColorPicked((c) => {
      addColor({
        hex: c.hex,
        rgb: c.rgb,
        hsl: c.hsl,
        cmyk: c.cmyk,
        timestamp: c.timestamp,
      });
      if (autoCopy) navigator.clipboard.writeText(c.hex).catch(() => {});
      showToast(`Picked ${c.hex}`);
    });
    return off;
  }, [addColor, autoCopy]);

  // Mirror the newest colors to the tray menu so the menu-bar icon shows
  // clickable swatches. The main process caps the list; we just hand over
  // the id+hex pairs sorted newest-first.
  useEffect(() => {
    if (!window.sepia) return;
    const list = Object.values(colors)
      .sort((a, b) => b.timestamp - a.timestamp)
      .map((c) => ({ id: c.id, hex: c.hex }));
    window.sepia.syncTrayColors(list);
  }, [colors]);

  return (
    <div className="flex h-screen overflow-hidden bg-app text-text-primary">
      <Sidebar page={page} onChange={setPage} />
      {page === 'drawer' && <DrawerPage onOpenSettings={() => setPage('settings')} />}
      {page === 'theory' && <ColorTheoryPage />}
      {page === 'settings' && <SettingsPage />}
      <Toaster />
    </div>
  );
}

export default App;
