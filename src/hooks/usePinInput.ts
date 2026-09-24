// The digits typed on the Keypad, shown in PinBoxes. At most `length` digits;
// onFull runs once each time the last box is filled.

import { useCallback, useEffect, useRef, useState } from 'react';

export function usePinInput({ length = 4, onFull }: { length?: number; onFull?: (pin: string) => void } = {}) {
  const [value, setValue] = useState('');
  // The latest value, so two fast taps in one frame both count.
  const current = useRef('');
  const onFullRef = useRef(onFull);
  useEffect(() => {
    onFullRef.current = onFull;
  });

  const update = useCallback((next: string) => {
    current.current = next;
    setValue(next);
  }, []);

  const append = useCallback(
    (digit: string) => {
      if (!/^\d$/.test(digit) || current.current.length >= length) return;
      const next = current.current + digit;
      update(next);
      if (next.length === length) onFullRef.current?.(next);
    },
    [length, update],
  );

  const remove = useCallback(() => update(current.current.slice(0, -1)), [update]);
  const clear = useCallback(() => update(''), [update]);

  return { value, append, remove, clear, isFull: value.length === length };
}
