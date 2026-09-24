// PinBoxes + Keypad + usePinInput, used together as on the PIN screens.

import { fireEvent, render, screen, within } from '@testing-library/react-native';
import { useState } from 'react';
import { usePinInput } from '@/hooks/usePinInput';
import { ThemeProvider } from '@/theme/theme';
import { Keypad } from './Keypad';
import { PinBoxes } from './PinBoxes';

function PinScreen({ onFull, error = null, disabled = false }: { onFull?: (pin: string) => void; error?: string | null; disabled?: boolean }) {
  const pin = usePinInput({ onFull });
  const [show, setShow] = useState(false);
  return (
    <ThemeProvider>
      <PinBoxes value={pin.value} show={show} onToggleShow={() => setShow((s) => !s)} error={error} />
      <Keypad onDigit={pin.append} onDelete={pin.remove} disabled={disabled} />
    </ThemeProvider>
  );
}

const press = (key: string) => fireEvent.press(screen.getByTestId(`keypad-${key}`));
const pressAll = async (keys: string[]) => {
  for (const key of keys) await press(key);
};
const dots = () => [0, 1, 2, 3].filter((i) => screen.queryByTestId(`pin-dot-${i}`)).length;

describe('PinBoxes + Keypad', () => {
  it('fills one box per digit, hidden as dots', async () => {
    await render(<PinScreen />);
    expect(dots()).toBe(0);
    await press('4');
    await press('8');
    expect(dots()).toBe(2);
    expect(screen.getByLabelText('Your PIN: 2 of 4 digits entered')).toBeTruthy();
  });

  it('takes at most 4 digits and reports the full PIN once', async () => {
    const onFull = jest.fn();
    await render(<PinScreen onFull={onFull} />);
    await pressAll(['4', '8', '2', '9', '1', '7']);
    expect(dots()).toBe(4);
    expect(onFull).toHaveBeenCalledTimes(1);
    expect(onFull).toHaveBeenCalledWith('4829');
  });

  it('Delete removes the last digit, and does nothing when empty', async () => {
    await render(<PinScreen />);
    await press('delete');
    expect(dots()).toBe(0);
    await press('4');
    await press('8');
    await press('2');
    await press('delete');
    expect(dots()).toBe(2);
    expect(screen.queryByTestId('pin-dot-2')).toBeNull();
  });

  it('Show reveals the digits, Hide hides them again', async () => {
    await render(<PinScreen />);
    await press('4');
    await press('8');
    expect(within(screen.getByTestId('pin-box-0')).queryByText('4')).toBeNull();

    await fireEvent.press(screen.getByLabelText('Show PIN'));
    expect(within(screen.getByTestId('pin-box-0')).getByText('4')).toBeTruthy();
    expect(within(screen.getByTestId('pin-box-1')).getByText('8')).toBeTruthy();

    await fireEvent.press(screen.getByLabelText('Hide PIN'));
    expect(within(screen.getByTestId('pin-box-0')).queryByText('4')).toBeNull();
    expect(dots()).toBe(2);
  });

  it('never puts the digits in what a screen reader hears', async () => {
    await render(<PinScreen />);
    await press('4');
    await press('8');
    const label = screen.getByLabelText(/digits entered/).props.accessibilityLabel as string;
    expect(label).toBe('Your PIN: 2 of 4 digits entered');
    expect(label).not.toContain('48');
  });

  it('shows the error text as an alert', async () => {
    await render(<PinScreen error="PINs don't match. Try again." />);
    expect(screen.getByRole('alert')).toHaveTextContent("PINs don't match. Try again.");
  });

  it('a disabled keypad ignores presses', async () => {
    await render(<PinScreen disabled />);
    await press('4');
    expect(dots()).toBe(0);
  });

  it('has keys 0-9 and Delete, each labelled', async () => {
    await render(<PinScreen />);
    for (const d of ['0', '1', '2', '3', '4', '5', '6', '7', '8', '9']) {
      expect(screen.getByTestId(`keypad-${d}`)).toBeTruthy();
    }
    expect(screen.getByLabelText('Delete last digit')).toBeTruthy();
  });
});
