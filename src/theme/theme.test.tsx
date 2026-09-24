// The Appearance setting (FR-38): System follows the phone live; Light and Dark
// override it; the choice is saved on the phone and read back at start-up.

import { act, render, screen } from '@testing-library/react-native';
import * as SecureStore from 'expo-secure-store';
import { Appearance, Text } from 'react-native';
import { APPEARANCE_KEY, useAppearance } from '@/stores/appearance';
import { ThemeProvider, useTheme } from './theme';
import { darkColors, lightColors, type Scheme } from './tokens';

// A fake phone setting that can change while the app is open.
const mockPhone = {
  scheme: 'light' as Scheme,
  listeners: new Set<() => void>(),
  set(next: Scheme) {
    this.scheme = next;
    this.listeners.forEach((l) => l());
  },
};

jest.mock('./useSystemColorScheme', () => {
  const { useSyncExternalStore } = jest.requireActual('react');
  return {
    useSystemColorScheme: () =>
      useSyncExternalStore(
        (listener: () => void) => {
          mockPhone.listeners.add(listener);
          return () => mockPhone.listeners.delete(listener);
        },
        () => mockPhone.scheme,
      ),
  };
});

function Probe() {
  const { scheme, colors } = useTheme();
  return <Text testID="probe">{`${scheme} ${colors.bg}`}</Text>;
}

async function renderApp() {
  await render(
    <ThemeProvider>
      <Probe />
    </ThemeProvider>,
  );
}

const shown = () => screen.getByTestId('probe').props.children as string;

let setColorScheme: jest.SpyInstance;

beforeEach(async () => {
  setColorScheme = jest.spyOn(Appearance, 'setColorScheme').mockImplementation(() => {});
  await act(() => mockPhone.set('light'));
  await act(() => useAppearance.getState().setPreference('system'));
});

afterEach(() => setColorScheme.mockRestore());

describe('System (default)', () => {
  it('follows the phone and switches live when the phone changes', async () => {
    await renderApp();
    expect(shown()).toBe(`light ${lightColors.bg}`);

    await act(() => mockPhone.set('dark'));
    expect(shown()).toBe(`dark ${darkColors.bg}`);

    await act(() => mockPhone.set('light'));
    expect(shown()).toBe(`light ${lightColors.bg}`);
  });

  it('removes any native override, so the keyboard and dialogs follow the phone too', async () => {
    await act(() => useAppearance.getState().setPreference('system'));
    expect(setColorScheme).toHaveBeenLastCalledWith('unspecified');
  });
});

describe('Light and Dark', () => {
  it('override the phone setting', async () => {
    await renderApp();
    await act(() => mockPhone.set('dark'));
    await act(() => useAppearance.getState().setPreference('light'));
    expect(shown()).toBe(`light ${lightColors.bg}`);
    expect(setColorScheme).toHaveBeenLastCalledWith('light');

    await act(() => mockPhone.set('light'));
    await act(() => useAppearance.getState().setPreference('dark'));
    expect(shown()).toBe(`dark ${darkColors.bg}`);
    expect(setColorScheme).toHaveBeenLastCalledWith('dark');
  });

  it('going back to System follows the phone again', async () => {
    await renderApp();
    await act(() => useAppearance.getState().setPreference('light'));
    await act(() => mockPhone.set('dark'));
    expect(shown()).toBe(`light ${lightColors.bg}`);

    await act(() => useAppearance.getState().setPreference('system'));
    expect(shown()).toBe(`dark ${darkColors.bg}`);
  });
});

describe('saved on the phone', () => {
  it('is written to SecureStore (never the database)', async () => {
    await act(() => useAppearance.getState().setPreference('dark'));
    expect(SecureStore.setItem).toHaveBeenLastCalledWith(APPEARANCE_KEY, 'dark');
  });

  it('is read back at start-up', async () => {
    SecureStore.setItem(APPEARANCE_KEY, 'dark');
    jest.isolateModules(() => {
      const { useAppearance: fresh } = require('@/stores/appearance');
      expect(fresh.getState().preference).toBe('dark');
    });
  });

  it('falls back to System for a missing or unknown value, or a failed read', async () => {
    jest.isolateModules(() => {
      expect(require('@/stores/appearance').useAppearance.getState().preference).toBe('system');
    });
    SecureStore.setItem(APPEARANCE_KEY, 'purple');
    jest.isolateModules(() => {
      expect(require('@/stores/appearance').useAppearance.getState().preference).toBe('system');
    });
    jest.isolateModules(() => {
      (require('expo-secure-store').getItem as jest.Mock).mockImplementationOnce(() => {
        throw new Error('keystore unavailable');
      });
      expect(require('@/stores/appearance').useAppearance.getState().preference).toBe('system');
    });
  });
});
