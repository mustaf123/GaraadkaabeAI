// Appearance setting (Profile > Preferences, FR-38): System / Light / Dark.
//
// Saved on the phone only (SecureStore, never the database), so it survives logout
// and restart. It is read synchronously at start-up, so the first frame already
// has the right colours.
//
// The choice is also handed to React Native's Appearance, so native parts
// (keyboard, system dialogs) follow it too. 'unspecified' removes the override:
// the app then follows the phone, live.

import * as SecureStore from 'expo-secure-store';
import { Appearance } from 'react-native';
import { create } from 'zustand';

export type AppearancePreference = 'system' | 'light' | 'dark';

export const APPEARANCE_KEY = 'appearance';

function isPreference(value: unknown): value is AppearancePreference {
  return value === 'system' || value === 'light' || value === 'dark';
}

function readSaved(): AppearancePreference {
  try {
    const saved = SecureStore.getItem(APPEARANCE_KEY);
    return isPreference(saved) ? saved : 'system';
  } catch {
    return 'system';
  }
}

function applyToNative(preference: AppearancePreference): void {
  // Missing on web (only used there for dev previews).
  if (typeof Appearance.setColorScheme !== 'function') return;
  Appearance.setColorScheme(preference === 'system' ? 'unspecified' : preference);
}

interface AppearanceState {
  preference: AppearancePreference;
  setPreference: (preference: AppearancePreference) => void;
}

const initial = readSaved();
applyToNative(initial);

export const useAppearance = create<AppearanceState>((set) => ({
  preference: initial,
  setPreference: (preference) => {
    // Native first, so the next render already sees the new system value.
    applyToNative(preference);
    set({ preference });
    try {
      SecureStore.setItem(APPEARANCE_KEY, preference);
    } catch {
      // Not saved: the choice still applies until the app restarts.
    }
  },
}));
