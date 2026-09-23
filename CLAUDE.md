# CLAUDE.md — GaraadKaabeAI (mobile wallet)

Read this file fully before doing any work in this repository.

## 1. What we are building

GaraadKaabeAI is a mobile wallet in the style of WAAFI / MyCash. It is a **portfolio / course project**.

- A user registers with a **phone number and a 4-digit PIN**, then **sends and receives money** by phone number.
- **Money is simulated.** No real bank or mobile-money network is connected. Each new wallet receives a **$100.00 demo balance**.
- **Scope:** send, receive, history, notifications, profile/settings. Nothing else.
- **Out of scope:** agents, merchants, bill pay, airtime, cards, loans, admin dashboard. Do not add them, and do not add any other feature without asking me first.

## 2. Tech stack (this overrides any other document)

| Layer | Choice |
|---|---|
| App | React Native + **Expo** (TypeScript, strict mode) |
| Navigation | **expo-router** (file-based routes) |
| Backend | **Supabase**: Postgres, Row Level Security, Edge Functions (Deno/TypeScript), Realtime |
| State | zustand (session and UI state only) |
| Fonts | `@expo-google-fonts/sora` (headings, money), `@expo-google-fonts/manrope` (body) |
| Animation | `react-native-reanimated` |
| Fingerprint | `expo-local-authentication` + `expo-secure-store` with `requireAuthentication` |
| Push | `expo-notifications` |
| Icons | `lucide-react-native` (stroke icons, never emoji) |

`design/SPEC.md` (version 2.0) uses this same stack. If any older document mentions Flutter, Laravel or MySQL, ignore that part. Where documents conflict, this file wins.

## 3. Where the design lives

```
design/
  SPEC.md                requirements, rules, test cases
  screens/*.dc.html      one HTML mockup per screen: exact colours, sizes, text
  screenshots/*.png      what each screen must look like (2x resolution)
```

Extra screenshots show states: `Home-receive` (Receive sheet), `Sending-success`, `Profile-bottom`, `Profile-delete`.
Colours, fonts and components are defined in Sections 4 and 5 below. There is no separate DESIGN.md.

- The UI must **match the mockups**. Read the matching `.dc.html` **and** `.png` before building a screen.
- The mockups are HTML, not React Native. Translate them; don't copy the HTML.
- If a mockup and this file disagree, ask me.

## 4. Design tokens (put these in `src/theme/tokens.ts`; never hard-code colours in screens)

| Token | Value | Use |
|---|---|---|
| `brand` | `#0B6B57` | primary buttons, active tab, balance card |
| `brandSoft` | `#E3F1EC` | icon backgrounds, success chips |
| `bg` | `#F3F5F2` | every screen background, **including the tab bar** |
| `surface` | `#FFFFFF` | cards, inputs, keypad keys |
| `text` | `#10201B` | main text |
| `muted` | `#56665F` | secondary text |
| `line` | `#E1E7E3` | borders, dividers |
| `accent` | `#F2B544` | logo sparkle, small highlights only (never text on white) |
| `danger` / `dangerSoft` | `#B42318` / `#FCE8E6` | sent money, delete account |
| `send` / `receive` / `history` / `security` | `#F07167` / `#2FBF8F` / `#6C8CF5` / `#F2A93B` | Home action circles |

- **Radius:** cards 20, buttons 16, PIN boxes 18, sheets 28 (top corners).
- **Touch targets:** at least 44 × 44.
- **Font sizes:** screen title 28, balance 40, body 15, captions 13.
- Money always uses **Sora**, is formatted `$1,234.50`, and is stored and computed as integers or `numeric`, **never floats**.
- Honour "reduce motion": skip animations when the OS setting is on.

## 5. Screens and routes

| # | Screen | Route | Mockup |
|---|---|---|---|
| — | Onboarding 1–3 (animated first slide) | `app/(onboarding)/index.tsx` (pager) | `Main`, `Welcome2`, `Welcome3` |
| 1 | Enter phone number | `app/(auth)/phone.tsx` | `Phone` |
| 2 | Create PIN | `app/(auth)/create-pin.tsx` | `CreatePin` |
| 3 | Confirm PIN | `app/(auth)/confirm-pin.tsx` | `ConfirmPin` |
| 4 | Recovery code (shown once) | `app/(auth)/recovery-code.tsx` | `RecoveryCode` |
| 5 | Enable fingerprint (optional) | `app/(auth)/enable-fingerprint.tsx` | `EnableFingerprint` |
| 6 | Login: PIN **or** fingerprint | `app/(auth)/login.tsx` | `Login` |
| 7 | Home (tab) | `app/(tabs)/home.tsx` | `Home` |
| 8 | Send money | `app/send/index.tsx` | `SendMoney` |
| 9 | Confirm sending | `app/send/confirm.tsx` | `ConfirmSend` |
| 9b | Sending animation → success | `app/send/sending.tsx` | `Sending` |
| 10 | Receipt | `app/receipt/[id].tsx` | `Receipt` |
| 11 | History (tab) | `app/(tabs)/history.tsx` | `History` |
| 12 | Forgot PIN | `app/(auth)/forgot-pin.tsx` | `ForgotPin` |
| 13 | Profile (tab, scrollable) | `app/(tabs)/profile.tsx` | `Profile` |
| 14 | Alerts / Notifications (tab) | `app/(tabs)/alerts.tsx` | `Notifications` |

- **Tab bar** (Home · History · Alerts · Profile): same background as the page, no top border, active tab in `brand`, unread badge on Alerts.
- **Icons:** send = paper plane, receive = arrow into tray. Never use diagonal ↗/↙ arrows, which look like call-log icons.

**Shared components** (build these before the screens): `PinBoxes`, `Keypad`, `PrimaryButton`, `SecondaryButton`, `BalanceCard`, `ActionCircle`, `TransactionRow`, `TabBar`, `BottomSheet`, `Toggle`, `SegmentedControl`.

## 6. Product rules (decided; do not change without asking)

**Launch**
- First launch (no phone saved in SecureStore): onboarding slides, then Enter phone number.
- Returning user: open directly on **Login**.
- If an entered phone number is already registered, go to **Login**, never to Create PIN.

**Registration**
- Phone number + 4-digit PIN + confirm PIN. **No OTP and no admin approval.**
- Phone format: 9 digits after `+252` (e.g. `615552046`).
- Reject weak PINs: the same digit four times, `1234`, `4321`, and the last 4 digits of the user's own number.
- Show a **recovery code** once (format `XXXX-XXXX`). Continue stays disabled until the user ticks "I have written it down".
- Credit a $100.00 demo balance **through the ledger**, from the System Treasury wallet.
- The user can send money **immediately**. There is no waiting period.

**Login**
- The login screen shows two options: **Login with PIN** and **Use your fingerprint** (the fingerprint option only if the user enabled it).
- 3 wrong PINs lock the account for 30 minutes. After 3 lockouts, it is locked for 24 hours.
- On a new phone: log in with PIN, bind the new device, deactivate the old one, and send the old device an alert with **"This wasn't me"** (freezes the account). Sending works immediately.

**Sessions**
- The access token lives **in memory only**, never on disk.
- **60 seconds with no touch** means logout. Every touch resets the timer (root-level responder).
- **Logout immediately** when the app goes to the background (`AppState` changes to `background` or `inactive`) or is closed.
- The server enforces the same 60-second idle rule (Section 7), so a tampered app cannot extend a session.

**Sending**
- Enter the receiver's number and amount. The server confirms the receiver exists and is active.
- A confirm screen shows the masked number, amount, fee ($0.00) and balance after.
- **No PIN on send while logged in. No per-send or daily limits.** The only cap is the balance.
- The amount must be > 0 with at most 2 decimals. Sending to yourself is not allowed.
- Show the sending animation, then success, then the receipt. The success state appears **only after the server confirms**, not on a timer.

**Receiving:** automatic. The receiver's balance updates via Realtime and they get a push and in-app notification.

**Forgot PIN:** phone + recovery code + new PIN. This issues a **new** recovery code (the old one dies). 3 wrong codes lock recovery for 24 hours.

**Profile**
- Fingerprint on/off (turning it on needs the PIN)
- Change PIN (needs the current PIN)
- Language: English / Soomaali
- Notifications on/off
- Log out
- **Delete this account**: allowed only when the balance is $0.00. Otherwise the button is disabled and the sheet explains why.

## 7. Supabase backend

### 7.1 Tables (`supabase/migrations/`)

- `app_users`: id, auth_user_id (→ `auth.users`), phone UNIQUE, pin_hash, recovery_hash, status (`active|locked|frozen|deleted`), failed_pin_count, lockout_count, locked_until, recovery_failed_count, language, notifications_on, created_at
- `devices`: id, user_id, device_secret_hash, biometric_secret_hash (nullable), **push_token** (nullable, Expo push token), name, is_active, bound_at. At most **one active device per user** (partial unique index).
- `wallets`: id, user_id (null for system), type (`user|system`), balance `numeric(12,2)`, currency `USD`. CHECK: `type='system' OR balance >= 0`.
- `transactions`: id, reference UNIQUE (`TX-YYYYMMDD-000145`), type (`transfer|welcome_bonus`), sender_wallet_id, receiver_wallet_id, amount `numeric(12,2)` CHECK > 0, status, idempotency_key `uuid` UNIQUE, created_at. CHECK sender ≠ receiver.
- `ledger_entries`: id, transaction_id, wallet_id, amount (±), created_at. **Insert-only**: no UPDATE or DELETE, ever.
- `notifications`: id, user_id, kind (`sent|received|security|welcome`), title, body, read_at, created_at
- `app_sessions`: id, user_id, device_id, last_seen, revoked. Used for the server-side 60-second idle rule.
- `audit_logs`: id, user_id, device_id, action, details `jsonb`, created_at. Insert-only.

### 7.2 Security (RLS)

- Enable RLS on **every** table.
- Clients may **SELECT** only their own rows (own user, wallet, transactions they are part of, ledger lines of their wallet, notifications). They may **UPDATE** only `notifications.read_at` and their own preferences.
- Clients may **never** INSERT, UPDATE or DELETE `wallets`, `transactions` or `ledger_entries`. All money changes go through the function below.
- Never ship the `service_role` key in the app. It is used only inside Edge Functions.

### 7.3 Money: `transfer_money(p_receiver_phone text, p_amount numeric, p_idempotency_key uuid)`

A `SECURITY DEFINER` Postgres function with `set search_path = public`. It runs in **one transaction**, in this order:

1. The caller is active and their `app_sessions` row is valid, with `last_seen` within 60 s. Update `last_seen`.
2. Validate the amount (> 0, 2 decimals). The receiver exists and is active. Not sending to self.
3. If the idempotency key was already used by this user, **return that earlier receipt** (no second transfer).
4. `SELECT … FOR UPDATE` both wallets, **ordered by wallet id**, to prevent deadlocks.
5. Check balance ≥ amount.
6. Insert the transaction, **two** ledger lines (−amount / +amount), update both cached balances, insert two notifications and an audit row.
7. Return the receipt: reference, date, receiver, amount, new balance.

*Plain English:* all or nothing, one sender at a time, and a double tap never pays twice.

### 7.4 Auth (Edge Functions in `supabase/functions/`)

Supabase's built-in phone login needs an SMS code, and its passwords need at least 6 characters. That doesn't fit our rules (no OTP, 4-digit PIN), so use custom Edge Functions:

- `auth-check-phone`: returns whether the number is registered.
- `auth-register`: validates the phone and PIN rules; bcrypt-hashes the PIN and recovery code; creates the Supabase auth user (internal email such as `<phone>@users.garaadkaabe.invalid` plus a random server-only password, never sent to the phone); creates the user, wallet, device and welcome bonus; returns a session and the recovery code.
- `auth-login`: checks lockout, device secret and PIN hash; handles the new-device flow; opens an `app_sessions` row; returns a session.
- `auth-biometric-login`: same, but verifies the biometric-protected device secret instead of the PIN.
- `auth-reset-pin`, `auth-change-pin`, `auth-logout`, `account-freeze`, `account-delete` (balance must be 0).

**Device binding without native modules:**
- On first run, generate a random 32-byte **device secret** and store it in SecureStore. The server stores only its hash.
- **Fingerprint login:** store a second secret with `requireAuthentication: true`. Reading it triggers the fingerprint prompt, so a successful read proves the fingerprint.
- Test this in a **development build**, not Expo Go.

⚠️ Supabase auth APIs change. Check the current Supabase docs before writing these functions, and tell me if a step above no longer works.

### 7.5 Realtime and push

- Subscribe to the user's `wallets` row and `notifications` inserts, so the balance and badge update live.
- **Push token:** after every successful login, the app gets its Expo push token (`getExpoPushTokenAsync`) and saves it on its own `devices` row (Edge Function `device-register-push`). *Plain English: the push token is the phone's delivery address.*
- Send pushes via Expo Push from the transfer path, using a DB webhook or trigger that calls an Edge Function (`send-push`).
- Push **only** to the user's **active** device, and **only** if `app_users.notifications_on` is true. The in-app `notifications` row is always created, even when push is off.
- **New-device alert:** read the **old** device's push token **before** deactivating it, and send the "This wasn't me" alert there. Never send it to the new device.
- Deleting the account or logging out clears that device's `push_token`.

## 8. Tests you must write and keep green

- `supabase/tests/` (pgTAP or SQL scripts):
  - insufficient balance is rejected
  - sending to self is rejected
  - amounts of 0, negative, or more than 2 decimals are rejected
  - the same idempotency key produces one transfer
  - **two concurrent $8 sends from a $10 wallet: exactly one succeeds**
  - after all tests, `SUM(ledger_entries.amount) = 0` and every balance equals the sum of its ledger lines
  - RLS: user A cannot read user B's rows
- Edge Functions:
  - weak PIN rejected
  - duplicate phone rejected
  - 3 wrong PINs → locked 30 min
  - new device flow
  - reset PIN issues a new recovery code
  - delete is blocked when balance > 0
  - new-device alert goes to the OLD device's push token
  - Notifications off: no push is sent, but the in-app notification row is still created
- App:
  - `PinBoxes`/`Keypad` behaviour
  - idle-logout hook (60 s)
  - logout on background

The full test-case list (TC-01 … TC-39) is in `design/SPEC.md`.

## 9. Project layout

```
app/                expo-router screens (see Section 5)
src/components/     shared UI components
src/theme/          tokens.ts, typography.ts
src/lib/            supabase.ts (client), api.ts (calls Edge Functions and RPC), format.ts
src/stores/         session.ts (in-memory token, user, lock state)
src/hooks/          useIdleLogout.ts, useAppStateLogout.ts, useRealtimeWallet.ts
supabase/           migrations/, functions/, tests/, seed.sql
design/             mockups and specs (read-only for you)
```

## 10. Commands

```bash
npx expo start                     # run the app
npx expo run:android               # development build (needed for fingerprint)
supabase start                     # local Supabase
supabase db reset                  # re-run migrations + seed
supabase functions serve           # run Edge Functions locally
supabase test db                   # run database tests
npm test                           # app unit tests
npx tsc --noEmit && npm run lint   # type-check and lint before every commit
```

## 11. How to work with me

- Build in this order:
  1. database and RLS
  2. `transfer_money` and its tests
  3. auth Edge Functions
  4. theme and shared components
  5. screens in the order of Section 5
  6. idle logout, fingerprint, Realtime, push, animations
- Do **one screen or one function per task**. When done, list the files you changed and how to test them.
- Explain decisions in plain language. When you use a technical term, add a one-line explanation.
- Never weaken a rule in Section 6 or 7 to make something easier. If a rule blocks you, stop and ask.
- Never put secrets, service keys or real personal data in the repo. Use `.env` (git-ignored) and `EXPO_PUBLIC_*` only for public values.
- If something in the design, SPEC or this file is unclear or contradictory, **ask before building**.
