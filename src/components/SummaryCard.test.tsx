import { render, screen } from '@testing-library/react-native';
import { Check } from 'lucide-react-native';
import { ThemeProvider } from '@/theme/theme';
import { fonts } from '@/theme/typography';
import { Chip } from './Chip';
import { SummaryCard, SummaryDivider, SummaryRow } from './SummaryCard';

describe('SummaryCard', () => {
  beforeEach(async () => {
    await render(
      <ThemeProvider>
        <SummaryCard>
          <SummaryRow label="Transaction ID" value="TX-20260923-000145" />
          <SummaryRow label="Fee" value="$0.00" money />
          <SummaryDivider dashed />
          <SummaryRow label="New balance" value="$121.50" money strong />
          <SummaryRow label="Status" value={<Chip label="Completed" icon={Check} />} />
        </SummaryCard>
      </ThemeProvider>,
    );
  });

  it('sets amounts in Sora and other values in Manrope', () => {
    expect(screen.getByText('$0.00')).toHaveStyle({ fontFamily: fonts.heading });
    expect(screen.getByText('$121.50')).toHaveStyle({ fontFamily: fonts.headingBold });
    expect(screen.getByText('TX-20260923-000145')).toHaveStyle({ fontFamily: fonts.bodyBold });
    expect(screen.getByText('Transaction ID')).toHaveStyle({ fontFamily: fonts.body });
  });

  it('shows a component as the value', () => {
    expect(screen.getByText('Completed')).toBeOnTheScreen();
  });
});
