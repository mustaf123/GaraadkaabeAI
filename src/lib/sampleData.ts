// Sample data for building the screens before they talk to Supabase (the numbers
// from the Home mockup). Removed once the screens load real data.

export const SAMPLE = {
  phone: '615552046',
  balance: '121.50',
  todayIn: '15.00',
  unread: 3,
  transactions: [
    { id: 'tx-1', direction: 'sent', counterparty: '61X XXX 4521', when: 'Today, 19:12', amount: '10.00' },
    { id: 'tx-2', direction: 'received', counterparty: '61X XXX 7710', when: 'Today, 14:05', amount: '25.00' },
    { id: 'tx-3', direction: 'sent', counterparty: '61X XXX 3308', when: 'Yesterday, 20:41', amount: '5.50' },
  ],
} as const;
