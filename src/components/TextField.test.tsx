// TextField and PhoneInput.

import { fireEvent, render, screen } from '@testing-library/react-native';
import { useState } from 'react';
import { ThemeProvider } from '@/theme/theme';
import { PhoneInput } from './PhoneInput';
import { TextField } from './TextField';

function Phone({ onValueChange }: { onValueChange: (digits: string) => void }) {
  const [digits, setDigits] = useState('');
  return (
    <ThemeProvider>
      <PhoneInput
        testID="phone"
        value={digits}
        onValueChange={(d) => {
          setDigits(d);
          onValueChange(d);
        }}
      />
    </ThemeProvider>
  );
}

describe('PhoneInput', () => {
  it('shows 61 555 2046 and gives the screen 615552046', async () => {
    const onValueChange = jest.fn();
    await render(<Phone onValueChange={onValueChange} />);
    await fireEvent.changeText(screen.getByTestId('phone'), '61 555 2046');
    expect(onValueChange).toHaveBeenLastCalledWith('615552046');
    expect(screen.getByTestId('phone').props.value).toBe('61 555 2046');
  });

  it('stops at 9 digits and drops a pasted +252', async () => {
    const onValueChange = jest.fn();
    await render(<Phone onValueChange={onValueChange} />);
    await fireEvent.changeText(screen.getByTestId('phone'), '6155520461234');
    expect(onValueChange).toHaveBeenLastCalledWith('615552046');
    await fireEvent.changeText(screen.getByTestId('phone'), '+252 61 555 4521');
    expect(onValueChange).toHaveBeenLastCalledWith('615554521');
  });

  it('is labelled for screen readers, with the country code', async () => {
    await render(<Phone onValueChange={() => {}} />);
    expect(screen.getByLabelText('Phone number, after +252')).toBeTruthy();
  });
});

describe('TextField', () => {
  it('shows the error instead of the hint, as an alert', async () => {
    await render(
      <ThemeProvider>
        <TextField label="Recovery code" value="" hint="Format XXXX-XXXX" error="Wrong recovery code." />
      </ThemeProvider>,
    );
    expect(screen.getByRole('alert')).toHaveTextContent('Wrong recovery code.');
    expect(screen.queryByText('Format XXXX-XXXX')).toBeNull();
    expect(screen.getByLabelText('Recovery code')).toBeTruthy();
  });

  it('shows the green status when there is no error', async () => {
    await render(
      <ThemeProvider>
        <PhoneInput value="615554521" onValueChange={() => {}} success="Registered wallet · 61X XXX 4521" />
      </ThemeProvider>,
    );
    expect(screen.getByText('Registered wallet · 61X XXX 4521')).toBeTruthy();
    expect(screen.queryByRole('alert')).toBeNull();
  });
});
