import { getDesktopAPI, type ElectronAPI } from "../lib/desktop.js";

/** Returns the typed Electron API if running in desktop, otherwise null. */
export function useDesktop(): ElectronAPI | null {
  return getDesktopAPI();
}
