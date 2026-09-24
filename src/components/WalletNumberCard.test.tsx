// The wallet-number card on Home.

import { fireEvent, render, screen } from '@testing-library/react-native';
import { ThemeProvider } from '@/theme/theme';
import { WalletNumberCard } from './WalletNumberCard';

describe('WalletNumberCard', () => {
  it('shows the full number and opens sharing', async () => {
    const onShare = jest.fn();
    await render(
      <ThemeProvider>
        <WalletNumberCard phone="615552046" onShare={onShare} />
      </ThemeProvider>,
    );
    expect(screen.getByText('+252 61 555 2046')).toBeTruthy();
    expect(screen.getByLabelText('Your wallet number +252 61 555 2046')).toBeTruthy();
    await fireEvent.press(screen.getByLabelText('Share your wallet number'));
    expect(onShare).toHaveBeenCalledTimes(1);
  });
});
