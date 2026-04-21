/**
 * electron-builder afterPack hook.
 *
 * Re-sign the packaged macOS .app bundle with the real \`com.sepia.app\`
 * bundle identifier. electron-builder's default ad-hoc sign (identity: null)
 * uses \`Identifier=Electron\`, which makes macOS conflate this build with
 * every other Electron-based app for TCC purposes (Screen Recording
 * permission, etc.). Re-signing here binds the TCC entry to Sepia
 * specifically so the user only has to grant permission once, and doing
 * it as a hook means every build comes out correct with no manual step.
 */
import { execFileSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { join } from 'node:path';

export default async function afterPack(context) {
  // Only macOS needs re-signing; Windows handles this through signtool.
  if (context.electronPlatformName !== 'darwin') return;

  const appPath = join(context.appOutDir, `${context.packager.appInfo.productFilename}.app`);
  if (!existsSync(appPath)) {
    console.warn(`[afterPack] app bundle not found at ${appPath}`);
    return;
  }

  console.log(`[afterPack] re-signing ${appPath} with identifier com.sepia.app`);
  try {
    execFileSync(
      'codesign',
      ['--force', '--deep', '--sign', '-', '--identifier', 'com.sepia.app', appPath],
      { stdio: 'inherit' },
    );
  } catch (err) {
    console.error('[afterPack] codesign failed:', err);
    throw err;
  }
}
