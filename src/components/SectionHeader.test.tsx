import { render, screen } from '@testing-library/react-native';
import { ThemeProvider } from '@/theme/theme';
import { SectionHeader } from './SectionHeader';

describe('SectionHeader', () => {
  it('is announced as a heading', async () => {
    await render(
      <ThemeProvider>
        <SectionHeader title="Today" />
      </ThemeProvider>,
    );
    expect(screen.getByRole('header', { name: 'Today' })).toBeOnTheScreen();
  });
});
