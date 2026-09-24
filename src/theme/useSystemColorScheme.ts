// The phone's colour scheme, updated live. A separate module so tests can swap it
// for a fake phone setting.

import { useColorScheme } from 'react-native';
import type { Scheme } from './tokens';

export function useSystemColorScheme(): Scheme {
  return useColorScheme() === 'dark' ? 'dark' : 'light';
}
