import { render, screen } from '@testing-library/react-native';
import { ThemeProvider } from '@/theme/theme';
import { fonts } from '@/theme/typography';
import { InfoBanner, Strong } from './InfoBanner';

describe('InfoBanner', () => {
  it('keeps bold words inside the sentence, in Manrope', async () => {
    await render(
      <ThemeProvider>
        <InfoBanner tone="warning">
          You still have <Strong>$121.50</Strong>. Send it to another wallet first.
        </InfoBanner>
      </ThemeProvider>,
    );
    // Screen readers get one sentence, not three pieces.
    expect(screen.getByText('You still have $121.50. Send it to another wallet first.')).toBeOnTheScreen();
    expect(screen.getByText('$121.50')).toHaveStyle({ fontFamily: fonts.bodyBold });
  });
});
