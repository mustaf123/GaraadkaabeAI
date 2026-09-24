@AGENTS.md

# CLAUDE.md — GaraadKaabeAI (mobile wallet)

Read this file fully before doing any work in this repository. `AGENTS.md` (imported above) holds the Expo rules: check the versioned Expo docs, and install packages with `npx expo install`.

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
| Icons | `lucide-react-native` + its peer `react-native-svg` (stroke icons, never emoji) |
| Device secret | `expo-crypto` (random 32-byte secret) |
| Copy buttons | `expo-clipboard` (wallet number, recovery code) |
| Privacy (NFR-07) | `expo-screen-capture` (block screenshots on PIN screens) |
| Appearance | light + dark themes (`src/theme/theme.tsx`, `useTheme()`); the System / Light / Dark choice is saved with `expo-secure-store` (key `appearance`) |
| App tests | `jest-expo` + `@testing-library/react-native` (`npm test`) |
| Supabase CLI | `supabase` dev dependency, run as `npx supabase …` against the **hosted** dev project (no Docker) |

Install each package with `npx expo install <package>` when the build step that needs it starts, not before.

`design/SPEC.md` (version 2.5) uses this same stack. If any older document mentions Flutter, Laravel or MySQL, ignore that part. Where documents conflict, this file wins.

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

## 4. Design tokens (in `src/theme/tokens.ts`; never hard-code colours in screens or components)

There are two palettes, **light** and **dark**, with the same token names (FR-38). Components and screens read colours **only** through `useTheme()` or `createStyles()`, never by importing a palette. A new colour goes into **both** palettes.

| Token | Light | Dark | Use |
|---|---|---|---|
| `brand` | `#0B6B57` | `#0B6B57` | primary button fill |
| `brandText` | `#0B6B57` | `#4FD1A5` | active tab, links, green icons and labels on the page |
| `brandSoft` | `#E3F1EC` | `#1F2B26` | icon backgrounds, success chips |
| `bg` | `#F3F5F2` | `#0E1512` | every screen background, **including the tab bar** |
| `surface` | `#FFFFFF` | `#1A2420` | cards, inputs, keypad keys |
| `text` | `#10201B` | `#F1F5F3` | main text |
| `muted` | `#56665F` | `#9DB0A8` | secondary text |
| `line` | `#E1E7E3` | `#26332D` | borders, dividers |
| `accent` | `#F2B544` | `#F2B544` | logo sparkle, small highlights only (never text) |
| `danger` / `dangerSoft` | `#B42318` / `#FCE8E6` | `#F4938B` / 16 % coral | sent money, delete account |
| `cardBg` / `cardText` | `#0B6B57` / `#FFFFFF` | `#DDF1E9` / `#0E1F19` | balance card |
| `badge` | `#D93036` | `#D93036` | unread count (the mockup's `#E5484D`, darkened so white text reaches 4.5:1) |
| `send` / `receive` / `history` / `security` | `#F07167` / `#2FBF8F` / `#6C8CF5` / `#F2A93B` | same | Home action circles |

The full list (disabled buttons, PIN boxes, segmented control, toggle, sheet, warning box, wallet-number card) is in `tokens.ts`. The dark palette is based on the Home mockup's dark theme. In the mockups, `accent` means the green that is `brandText` here.

- **Radius:** cards 20, **balance card 24** (`cardLarge`), buttons 16, PIN boxes 18, sheets 28 (top corners).
- **Touch targets:** at least 44 × 44.
- **Font sizes:** screen title 28, balance 40, body 15, captions 13. Text styles are in `src/theme/typography.ts`; each weight is its own font family, so never set `fontWeight`.
- **Contrast (NFR-11):** `src/theme/tokens.test.ts` checks every text colour against its backgrounds in both themes (at least 4.5:1). When a component puts text on a new background, add that pair to the test.
- Money always uses **Sora**, is formatted `$1,234.50` (`src/lib/format.ts`), and is stored and computed as integers or `numeric`, **never floats**.
- Honour "reduce motion": skip animations when the OS setting is on.

## 5. Screens and routes

| # | Screen | Route | Mockup |
|---|---|---|---|
| — | Onboarding 1–3 (animated first slide) | `src/app/(onboarding)/index.tsx` (pager) | `Main`, `Welcome2`, `Welcome3` |
| 1 | Enter phone number | `src/app/(auth)/phone.tsx` | `Phone` |
| 2 | Create PIN | `src/app/(auth)/create-pin.tsx` | `CreatePin` |
| 3 | Confirm PIN | `src/app/(auth)/confirm-pin.tsx` | `ConfirmPin` |
| 4 | Recovery code (shown once) | `src/app/(auth)/recovery-code.tsx` | `RecoveryCode` |
| 5 | Enable fingerprint (optional) | `src/app/(auth)/enable-fingerprint.tsx` | `EnableFingerprint` |
| 6 | Login: PIN **or** fingerprint | `src/app/(auth)/login.tsx` | `Login` |
| 7 | Home (tab) | `src/app/(tabs)/home.tsx` | `Home` |
| 8 | Send money | `src/app/send/index.tsx` | `SendMoney` |
| 9 | Confirm sending | `src/app/send/confirm.tsx` | `ConfirmSend` |
| 9b | Sending animation → success | `src/app/send/sending.tsx` | `Sending` |
| 10 | Receipt | `src/app/receipt/[id].tsx` | `Receipt` |
| 11 | History (tab) | `src/app/(tabs)/history.tsx` | `History` |
| 12 | Forgot PIN | `src/app/(auth)/forgot-pin.tsx` | `ForgotPin` |
| 13 | Profile (tab, scrollable) | `src/app/(tabs)/profile.tsx` | `Profile` |
| 14 | Alerts / Notifications (tab) | `src/app/(tabs)/alerts.tsx` | `Notifications` |

- **Tab bar** (Home · History · Alerts · Profile): same background as the page, no top border, active tab in `brandText`, unread badge on Alerts.
- **Icons:** send = paper plane, receive = arrow into tray. Never use diagonal ↗/↙ arrows, which look like call-log icons.

**Shared components** (build these before the screens): `PinBoxes`, `Keypad`, `Screen`, `PrimaryButton`, `SecondaryButton`, `IconButton`, `TextLink`, `StepProgress`, `Badge`, `BalanceCard`, `ActionCircle`, `TransactionRow`, `TabBar`, `BottomSheet`, `Toggle`, `SegmentedControl`, `LogoMark` (G + sparkle; `green` or `white` variant, size prop), `WalletNumberCard` (Home's "Your wallet number" card; Share opens the Receive sheet), `ReceiveSheet` (Home-receive.png; copies the number with `expo-clipboard`).

**Every screen is wrapped in `<Screen>`** (`src/components/Screen.tsx`): it applies the safe-area insets, so content starts below the status bar and above the navigation bar, and scrolled content never slides under the status bar. Use `edges={['top']}` on tab screens (the tab bar handles the bottom). Never add status-bar padding by hand.

**Pressed states never fade cards, circles or rows** (no `opacity` on them): change a background instead, so their colours and labels always stay at full strength. Buttons may dim slightly while pressed.

**Component gallery (development only):** `src/app/dev/gallery.tsx` shows every shared component in every state, with an Appearance switch and the screenshot to compare each one with. The root layout guards it with `Stack.Protected guard={__DEV__}`, so release builds cannot open it. Add every new shared component to it.

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
- 3 wrong PINs lock the login for 30 minutes. After 3 lockouts, it is locked for 24 hours. A successful login resets the lockout count. The lock lives **only** in `user_credentials.locked_until` (`app_users.status` stays `active`), so a locked user can still receive money.
- On a new phone: log in with PIN, bind the new device, deactivate the old one, and send the old device an alert with **"This wasn't me"** (freezes the account). Sending works immediately.
- **"This wasn't me"** calls `account-freeze` with the phone number and the old phone's device secret. It is accepted only from a device that was replaced in the last **7 days**.
- Unknown number at login: **E06**.

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

**Forgot PIN:** phone + recovery code + new PIN. This issues a **new** recovery code (the old one dies). 3 wrong codes lock recovery for 24 hours (E16 wrong code, E17 recovery locked). A successful reset also **clears the PIN lock** and **unfreezes** a frozen account, because the recovery code proves ownership.

**Profile**
- Fingerprint on/off (turning it on needs the PIN)
- Change PIN (needs the current PIN)
- Notifications on/off
- **Appearance** (FR-38): System / Light / Dark, a compact `SegmentedControl` in Preferences, where the mockup shows Language. The default, System, follows the phone and switches live. Saved **on the phone only** (SecureStore key `appearance`, never the database); Log out and account deletion do not clear it. The status bar follows the mode. The splash screen follows the phone's setting, because it shows before the app can read the choice (SPEC limitation 8).
- Log out
- **Delete this account**: allowed only when the balance is $0.00. Otherwise the button is disabled and the sheet explains why. Deleting keeps the row for audit but sets `phone` to NULL, so **the number can register again** as a new account.

**English only.** The app has no language setting and no Somali text. The Profile mockup still shows a **Language** row: do **not** build it; the Appearance row takes its place.

## 7. Supabase backend

### 7.1 Tables (`supabase/migrations/`)

Migrations already pushed to the hosted project are **never edited**. Every change is a new file from `npx supabase migration new <name>`.

- `app_users`: id, auth_user_id (→ `auth.users`, NULL only after deletion), phone UNIQUE (9 digits; **NULL only when deleted**), status (`active|locked|frozen|deleted`), notifications_on, created_at. **No secrets here**: the app can read this row.
- `user_credentials`: user_id (PK → app_users), pin_hash, recovery_hash, failed_pin_count, lockout_count, locked_until, recovery_failed_count, **recovery_locked_until** (the 24 h recovery lock), updated_at. **Server-only**: a 4-digit PIN hash can be cracked offline, which would skip the lockout, so the app must never read it.
- `devices`: id, user_id, device_secret_hash, biometric_secret_hash (nullable), **push_token** (nullable, Expo push token), name, is_active, bound_at, **replaced_at** (when a new phone took over; used for the 7-day "This wasn't me" window). At most **one active device per user** (partial unique index). **Server-only.**
- `wallets`: id, user_id (null for system), type (`user|system`), balance `numeric(12,2)`, currency `USD`. CHECK: `type='system' OR balance >= 0`. One wallet per user; exactly one System Treasury wallet (created by a migration, not the seed).
- `transactions`: id, reference UNIQUE (`TX-YYYYMMDD-000145`, filled by a column default from a sequence, date in Somalia time), type (`transfer|welcome_bonus`), sender_wallet_id, receiver_wallet_id, amount `numeric(12,2)` CHECK > 0, status (`completed`), idempotency_key `uuid` UNIQUE, created_at. CHECK sender ≠ receiver. At most one `welcome_bonus` per wallet (partial unique index).
- `ledger_entries`: id, transaction_id, wallet_id, amount (±, never 0), **balance_after** (wallet balance right after this line; used by receipts and History), **seq** (identity: exact order of lines), created_at. **Insert-only**: triggers reject UPDATE, DELETE and TRUNCATE for every role, including `service_role`.
- `notifications`: id, user_id, kind (`sent|received|security|welcome`), title, body, read_at, created_at
- `app_sessions`: id, user_id, device_id, **auth_session_id** (UNIQUE: the `session_id` claim of the Supabase login token), last_seen, revoked. Used for the server-side 60-second idle rule. **Server-only.**
- `audit_logs`: id, user_id (nullable, e.g. login with an unknown number), device_id, action, details `jsonb`, created_at. Insert-only (same triggers). **Server-only.**

Helpers used by policies live in the `private` schema (not reachable through the Data API): `private.current_app_user_id()` and `private.current_wallet_id()`. They return NULL for a deleted account.

### 7.2 Security (RLS)

- Enable RLS on **every** table.
- Clients may **SELECT** only their own rows in: `app_users`, `wallets`, `transactions` (ones they are part of), `ledger_entries` (lines of their wallet), `notifications`. A frozen user can still read; a deleted user sees nothing.
- Clients have **no access at all** to `user_credentials`, `devices`, `app_sessions`, `audit_logs`. Only Edge Functions (with `service_role`) use them.
- Clients may **UPDATE** only `app_users.notifications_on` and `notifications.read_at`, on their own rows. This is enforced with **column grants** (permission per column), because RLS policies only choose rows, not columns.
- Clients may **never** INSERT or DELETE anything. All money changes go through the function below.
- `anon` (not logged in) has no table access at all.
- **Closed by default:** Supabase normally grants new tables and functions to `anon`/`authenticated`. Our migrations revoke that (including default privileges for future objects), so **every new table or function must be granted explicitly** in its migration.
- Policies use `to authenticated` and `(select …)` around function calls (Supabase's recommended form for speed).
- Never ship the `service_role` key in the app. It is used only inside Edge Functions.

### 7.3 Money: `transfer_money(p_receiver_phone text, p_amount text, p_idempotency_key uuid)`

Code: `supabase/migrations/*_money_functions.sql`. A `SECURITY DEFINER` Postgres function with `set search_path = ''` and fully qualified names (`public.wallets`), as Supabase recommends: otherwise a caller could plant a look-alike table that the function would use with its owner's rights. Grant EXECUTE to `authenticated` explicitly (see 7.2). It runs in **one transaction**, in this order:

1. `private.require_session()`: the caller's `app_sessions` row (found via the token's `session_id` claim) exists, is not revoked and has `last_seen` within 60 s, else **E11**; a frozen account gets **E10**, a locked one **E05**. Updates `last_seen`.
2. Validate the amount **as text, before any rounding**: `^[0-9]{1,10}(\.[0-9]{1,2})?$` and > 0, else **E09** (a `numeric(12,2)` column would silently round 10.555 to 10.56). The phone must be 9 digits, else **E01**.
3. If the idempotency key was already used: same sender, amount and receiver → **return that earlier receipt**; anything different → **E15** "Request conflict".
4. The receiver exists and is active, else **E06** (a frozen account looks unregistered). Not sending to self, else **E07**.
5. `private.move_money()`: `SELECT … FOR UPDATE` both wallets, **ordered by wallet id**, to prevent deadlocks; **check the idempotency key again** (a parallel double tap may have committed while we waited: then step 3's rule applies); check balance ≥ amount, else **E08**.
6. Insert the transaction, **two** ledger lines (−amount / +amount, each with `balance_after`), update both cached balances, insert two notifications and an audit row.
7. Return the sender's `money_item`: transaction_id, reference, created_at, type, direction, amount, fee, counterparty_masked (`61X XXX 2046`), balance_after, status.

Errors are raised with the SPEC §11 code as the whole message (`E08`); the app maps each code to its English text.

*Plain English:* all or nothing, one sender at a time, and a double tap never pays twice.

**Other money functions** (same file, same rules: `security definer`, `search_path = ''`, `require_session()` first):
- `lookup_receiver(p_phone)` → masked number, or E01 / E06 / E07.
- `my_transactions(p_direction, p_before_created_at, p_before_id, p_limit)` → History rows (`money_item`), newest first, other person's number masked. Paging: pass the last row's created_at and transaction_id.
- `get_receipt(p_transaction_id)` → `money_item`, or NULL if the caller isn't part of it.
- `grant_welcome_bonus(p_user_id)` → the $100.00 bonus from the System Treasury. **`service_role` only**; idempotent (one per wallet).
- `private.move_money()` is the only code that moves money. Never write the money tables anywhere else.

Notification texts (English only, from the mockup) live in `private.notification_text()` and SPEC §11.

### 7.4 Auth (Edge Functions in `supabase/functions/`)

Supabase's built-in phone login needs an SMS code, and its passwords need at least 6 characters. That doesn't fit our rules (no OTP, 4-digit PIN), so use custom Edge Functions:

- `auth-check-phone`: returns whether the number is registered.
- `auth-register`: validates the phone and PIN rules; hashes the PIN and recovery code; creates the Supabase auth user (internal email such as `<phone>@users.garaadkaabe.invalid` plus a random server-only password, never sent to the phone); then `rpc('auth_register_user')` creates the user, credentials, wallet and device **and pays the welcome bonus by calling `grant_welcome_bonus` inside the same transaction** (all or nothing; on failure the auth user is deleted again); returns a session and the recovery code. A registered number gets **E18**.
- `auth-login`: checks lockout, device secret and PIN hash; handles the new-device flow; opens an `app_sessions` row with `auth_session_id` = the new token's `session_id` claim (without it every money function returns E11); returns a session.
- `auth-biometric-login`: same, but verifies the biometric-protected device secret instead of the PIN.
- `auth-enable-biometric` (needs the PIN), `auth-disable-biometric` (needs only a live session), `auth-reset-pin`, `auth-change-pin` (a wrong current PIN counts toward the lockout; an E05 from it or from `auth-enable-biometric` also ends that session, keeping the push token), `auth-logout`, `account-freeze`, `device-register-push`.
- `account-delete` (balance must be 0): sets `status = 'deleted'` and `phone = NULL`, deactivates devices, clears push tokens, revokes sessions, then **deletes the Supabase auth user** (`auth_user_id` becomes NULL). Removing the auth user frees its internal email, so the number can register again. The database refuses to remove the auth user of an account that is not deleted.
- PIN and recovery hashes, fail counters and lock times are read and written in `user_credentials`, never `app_users`.

**Hashing (server only; the app never hashes and sends the raw values over HTTPS):**
- PIN and recovery code: **bcrypt** (cost 10, `npm:bcryptjs`) of HMAC-SHA256(`PIN_PEPPER`, value). `PIN_PEPPER` is an Edge Function secret (`npx supabase secrets set`), never in the repo or the database, so a database leak alone can't be brute-forced.
- Device and biometric secrets (32 random bytes): **SHA-256**. They are too random to crack, and a plain hash can be looked up (`account-freeze`).
- Never log request bodies. Audit rows never contain a PIN, code or secret.

**Server-side helpers:** every multi-step database change is one Postgres function in `*_auth_functions.sql` (one transaction each), executable by `service_role` only: `auth_register_user`, `auth_attempt_begin/end` (the attempt is counted **before** the hash is checked, so parallel guesses can't skip the lockout), `auth_open_session`, `auth_check_session`, `auth_bind_device`, `auth_freeze`, `auth_reset_pin`, `auth_delete_account` and the small setters.

**Sessions:** `openSession` sets a new random password on the auth user, signs in with it, reads the token's `session_id` and calls `auth_open_session` (which revokes the user's other open sessions). Functions called with a user token first call `auth_check_session` (same 60 s / revoked / frozen rules as `transfer_money`).

**Device binding without native modules:**
- On first run, generate a random 32-byte **device secret** and store it in SecureStore. The app sends the secret itself (never a hash); the server stores only its SHA-256 hash.
- **Fingerprint login:** store a second secret with `requireAuthentication: true`. Reading it triggers the fingerprint prompt, so a successful read proves the fingerprint.
- Test this in a **development build**, not Expo Go.

⚠️ Supabase auth APIs change. Check the current Supabase docs before writing these functions, and tell me if a step above no longer works.

### 7.5 Realtime and push

- Subscribe to the user's `wallets` row and `notifications` inserts, so the balance and badge update live.
- **Push token:** after every successful login, the app gets its Expo push token (`getExpoPushTokenAsync`) and saves it on its own `devices` row (Edge Function `device-register-push`). *Plain English: the push token is the phone's delivery address.*
- Send pushes via Expo Push from the transfer path, using a DB webhook or trigger that calls an Edge Function (`send-push`).
- Push **only** to the user's **active** device, and **only** if `app_users.notifications_on` is true. The in-app `notifications` row is always created, even when push is off.
- **Security alerts (`kind = 'security'`) exist only for:** a new phone, freeze ("This wasn't me"), PIN reset, PIN change, fingerprint on, fingerprint off. **A normal login (same phone, PIN or fingerprint) creates no alert.** The Notifications mockup's "New login" sample stands for the new-phone alert: its title is **"New phone logged in to your wallet"**.
- **New-device alert:** read the **old** device's push token **before** deactivating it, and send the "This wasn't me" alert there. Never send it to the new device. **Security alerts ignore both rules above** (they go to the inactive old device, even with Notifications off).
- Only the **Log out** button (`auth-logout`) and account deletion clear the device's `push_token`. Automatic logouts (60 s idle, background) keep it, so a closed app still receives pushes.

## 8. Tests you must write and keep green

- `supabase/tests/*.test.sql`, run with `npm run test:db` (see "How database tests work" below):
  - RLS: user A cannot read user B's rows (TC-19), and the app can't write money tables (TC-18) ✔ step 1
  - unregistered receiver, send to self, insufficient balance (TC-10..12) ✔ step 2
  - amounts of 0, negative, or more than 2 decimals are rejected (TC-13) ✔ step 2
  - valid send, no PIN, same key → one transfer, same key + different request → E15 (TC-14..16, TC-40) ✔ step 2
  - 61 s idle → E11 (TC-24) ✔ step 2
  - after all tests, `SUM(ledger_entries.amount) = 0` and every balance equals the sum of its ledger lines (TC-36, checked over the whole database) ✔ step 2
- `scripts/test-concurrency.mjs` (Node, `npm run test:concurrency`):
  - **TC-17: two concurrent $8 sends from a $10 wallet, exactly one succeeds** (10 rounds), plus a parallel double tap with one key. Needs two parallel connections, so it is a Node script, not a SQL file.
  - Uses `SUPABASE_SECRET_KEY` for setup/cleanup only; the sends use the publishable key and the test users' own tokens. Leaves ~25 transactions from deleted test users in the dev database per run (ledger rows can't be deleted).
- Edge Functions: `scripts/test-functions.mjs` (`npm run test:functions`) calls the **deployed** functions on the hosted dev project with the publishable key; `SUPABASE_SECRET_KEY` only for setup, cleanup and moving the clock. Covers TC-03, 05, 07, 08, 09, 25, 26, 33, 34 (server side), 35, plus:
  - weak PIN rejected
  - duplicate phone rejected
  - 3 wrong PINs → locked 30 min
  - new device flow
  - reset PIN issues a new recovery code
  - delete is blocked when balance > 0
  - new-device alert goes to the OLD device's push token
  - Notifications off: no push is sent, but the in-app notification row is still created
- App (`npm test`, jest-expo; tests live next to the code, never under `src/app/`):
  - `PinBoxes`/`Keypad` behaviour ✔ step 4
  - money and phone formatting ✔ step 4
  - the theme follows the System setting live; Light and Dark override it; the choice is saved on the phone and read back at start-up (TC-41, TC-42) ✔ step 4
  - text contrast in both themes (TC-43) ✔ step 4
  - idle-logout hook (60 s)
  - logout on background

The full test-case list (TC-01 … TC-43) is in `design/SPEC.md`.

### How database tests work (no Docker)

`supabase test db` needs Docker, which this project does not use. Instead `npm run test:db` (`scripts/test-db.mjs`) runs every `supabase/tests/*.sql` file in name order with `npx supabase db query --linked -f <file>`, against the hosted dev project, and stops at the first failure.

Rules for every test file:
- Wrap the whole file in `begin; … rollback;` so no test data stays in the database.
- Each file is self-contained (each runs as its own request): it creates its helpers in `pg_temp` and its own fixtures.
- Put every check in a `do $$ … $$` block that does `raise exception 'TC-xx failed: <reason>'` when the check fails. Checks without a SPEC test case use `DB-xx`.
- End with one line: `select 'TC-xx passed' as result;` (the runner prints it).
- Helpers: `pg_temp.act_as('owner' | 'anon' | '<auth user id>')`, `expect_error(label, actor, sql, sqlstate)`, `expect_count(label, actor, sql, n)`, `exec_as(actor, sql)`.

- App errors: `expect_app_error(label, actor, sql, 'E08')` checks the error message. `make_user(auth_id, phone)` builds a user with a live session and the welcome bonus.

Numbers in use: DB-01..09 (schema), TC-18 + DB-10..11 (no client writes), TC-19 + DB-20..23 (RLS isolation), TC-10..16 + TC-24 + TC-40 + DB-30..35 (transfer_money; DB-35 = receiver re-check after locking), DB-40..44 (lookup, History, receipts), TC-36 (ledger invariants), DB-50..59 (auth helpers; DB-59 = a PIN lock ends the session). Edge Function checks without a SPEC test case (`scripts/test-functions.mjs`): FN-01 check-phone, FN-02 register, FN-03 login, FN-04 freeze, FN-05 biometric, FN-06 reset PIN, FN-07 change PIN, FN-08 push token + logout.

## 9. Project layout

```
src/app/            expo-router screens (see Section 5); dev/gallery.tsx (development only)
src/components/     shared UI components (+ their tests)
src/theme/          tokens.ts (light + dark), typography.ts, theme.tsx (ThemeProvider, useTheme, createStyles)
src/lib/            supabase.ts (client), api.ts (calls Edge Functions and RPC), format.ts
src/stores/         session.ts (in-memory token, user, lock state), appearance.ts (System / Light / Dark)
src/hooks/          useIdleLogout.ts, useAppStateLogout.ts, useRealtimeWallet.ts
supabase/           config.toml, migrations/, functions/, tests/, seed.sql (local-only, empty)
scripts/            test-db.mjs, test-concurrency.mjs (TC-17), test-functions.mjs
jest.setup.ts       app test setup (SecureStore stand-in, Reanimated test mode)
design/             mockups and specs (read-only for you, unless I ask you to update SPEC.md)
```

## 10. Commands

```bash
npx expo start                          # run the app
npx expo run:android                    # development build (needed for fingerprint)
npx supabase migration new <name>       # create a new migration file
npx supabase db push --linked           # apply new migrations to the hosted dev project
npx supabase migration list --linked    # which migrations the hosted project has
npm run test:db                         # database tests (hosted, no Docker; see Section 8)
npm run test:concurrency                # TC-17 (needs SUPABASE_SECRET_KEY in .env)
npx supabase db advisors --linked       # Supabase security/performance checks
npx supabase functions deploy <name>    # deploy an Edge Function (step 3)
npm run test:functions                  # Edge Function tests against the deployed functions
npx supabase secrets set PIN_PEPPER=... # one-time; keep a backup (changing it invalidates every PIN)
npm test                                # app unit tests (jest-expo)
npx tsc --noEmit && npm run lint        # type-check and lint before every commit
```

The Supabase project is **hosted and dev-only**, and there is no Docker. `supabase start`, `db reset`, `functions serve` and `supabase test db` need Docker and are not used.

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
- `SUPABASE_SECRET_KEY` (in `.env`, no `EXPO_PUBLIC_` prefix) is for test scripts only. **Never use it in app code**: ESLint fails on `process.env.*SECRET*` / `*SERVICE_ROLE*` or `sb_secret_` / `service_role` strings under `src/`. Edge Functions get their key from the Supabase runtime, not from `.env`.
- If something in the design, SPEC or this file is unclear or contradictory, **ask before building**.
