import { fireEvent, render, screen } from '@testing-library/react-native';
import { useState } from 'react';
import { ThemeProvider } from '@/theme/theme';
import { Checkbox } from './Checkbox';

const LABEL = 'I have written down my recovery code';

function Saved({ disabled = false }: { disabled?: boolean }) {
  const [saved, setSaved] = useState(false);
  return (
    <ThemeProvider>
      <Checkbox value={saved} onValueChange={setSaved} label={LABEL} disabled={disabled} />
    </ThemeProvider>
  );
}

describe('Checkbox', () => {
  it('a tap anywhere on the row ticks it, a second tap unticks it', async () => {
    await render(<Saved />);
    const box = screen.getByRole('checkbox', { name: LABEL });
    expect(box).not.toBeChecked();
    await fireEvent.press(box);
    expect(box).toBeChecked();
    await fireEvent.press(screen.getByText(LABEL));
    expect(box).not.toBeChecked();
  });

  it('does nothing while disabled', async () => {
    await render(<Saved disabled />);
    const box = screen.getByRole('checkbox', { name: LABEL });
    await fireEvent.press(box);
    expect(box).not.toBeChecked();
  });
});
