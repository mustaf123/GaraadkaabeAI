# GaraadKaabeAI

A mobile wallet in the style of WAAFI / MyCash: register with a phone number and a 4-digit PIN, then send and receive money by phone number. **Portfolio / course project — money is simulated.**

- App: React Native + Expo (TypeScript), expo-router
- Backend: Supabase (Postgres, Row Level Security, Edge Functions, Realtime)
- Requirements and test cases: [design/SPEC.md](design/SPEC.md) · build guide: [CLAUDE.md](CLAUDE.md)

## Status

| Step | | |
|---|---|---|
| 1 | Database schema and Row Level Security | done |
| 2 | `transfer_money`, receiver lookup, history, receipts | done |
| 3 | Auth Edge Functions (register, login, lockout, new device, PIN reset) | next |
| 4–6 | Theme, components, screens, fingerprint, Realtime, push | planned |

## Setup

```bash
npm install
```

Create `.env` (git-ignored):

```bash
EXPO_PUBLIC_SUPABASE_URL=...              # public, bundled into the app
EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY=...  # public, bundled into the app
SUPABASE_SECRET_KEY=...                   # server-only: used by the TC-17 test script, never by the app
```

The Supabase project is hosted; there is no local Docker setup.

```bash
npx expo start                 # run the app
npx supabase db push --linked  # apply database migrations
npm run test:db                # database tests (TC-10..TC-19, TC-24, TC-36, TC-40, DB-xx)
npm run test:concurrency       # TC-17: two sends at the same moment
npm run lint && npx tsc --noEmit
```

`npx supabase db advisors --linked` shows 4 intentional warnings ("Signed-In Users Can Execute SECURITY DEFINER Function") for `transfer_money`, `lookup_receiver`, `my_transactions` and `get_receipt`: the app has no write access to the money tables, so these functions must run with the owner's rights, and each one checks the caller's live session first and acts only on the caller's behalf.

## Known limitations

1. **Money is simulated.** A real wallet needs a Central Bank licence. Each new wallet gets a $100.00 demo balance.
2. **No OTP**, so the app cannot prove that a user owns the phone number they register.
3. **No PIN on send and no limits.** Anyone who unlocks a logged-in phone could send the whole balance within the 60-second window.
4. **If a user loses both their PIN and recovery code,** the account cannot be recovered.
5. **The server's 60-second idle rule covers function calls only.** Sending, receiver lookup, history and receipts are rejected after 60 s without a request. Plain reads of the user's own rows (balance, notifications) and Realtime updates are not checked by the server; the app's own 60-second no-touch logout covers them. Tying those reads to the session would break live updates after 60 s without a function call.
