// AmountInput: the typing filter and the quick amounts.

import { fireEvent, render, screen } from '@testing-library/react-native';
import { useState } from 'react';
import { ThemeProvider } from '@/theme/theme';
import { AmountInput } from './AmountInput';

function Amount({ start = '' }: { start?: string }) {
  const [value, setValue] = useState(start);
  return (
    <ThemeProvider>
      <AmountInput testID="amount" value={value} onValueChange={setValue} />
    </ThemeProvider>
  );
}

const field = () => screen.getByTestId('amount');
const type = (text: string) => fireEvent.changeText(field(), text);

describe('AmountInput', () => {
  it('takes an amount with up to 2 decimals', async () => {
    await render(<Amount />);
    await type('12.5');
    expect(field().props.value).toBe('12.5');
    await type('12.50');
    expect(field().props.value).toBe('12.50');
  });

  it('ignores a third decimal, a second dot, letters and an 11th digit', async () => {
    await render(<Amount start="10.55" />);
    for (const bad of ['10.555', '10.5.5', '10.55a', '-10.55', '99999999999']) {
      await type(bad);
      expect(field().props.value).toBe('10.55');
    }
  });

  it('a quick amount fills the field and shows as picked', async () => {
    await render(<Amount />);
    await fireEvent.press(screen.getByRole('button', { name: '$10' }));
    expect(field().props.value).toBe('10.00');
    expect(screen.getByRole('button', { name: '$10' })).toBeSelected();
    expect(screen.getByRole('button', { name: '$5' })).not.toBeSelected();
  });

  it('a typed amount equal to a quick amount picks it (compared in cents)', async () => {
    await render(<Amount />);
    await type('20');
    expect(screen.getByRole('button', { name: '$20' })).toBeSelected();
    await type('20.5');
    expect(screen.getByRole('button', { name: '$20' })).not.toBeSelected();
  });
});
