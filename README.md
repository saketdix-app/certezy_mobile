# CERTEZY Team — Android app

Native Android app (React Native + Expo) for the CERTEZY team. Staff sign in with the
same account as certezy.com and work their leads on the go. It talks to the same API
(`https://certezy.com/api/v1`), so every rule — who sees which lead, who may move a
stage — is enforced by the server exactly as on the web.

## What it does

| Tab | For |
|---|---|
| **Today** | Open leads, follow-ups due today and overdue, applications, exams, Course Done, payment-due alert |
| **My leads** | Leads assigned to you, by stage, with search, next follow-up and the latest client discussion |
| **Lead** | Call / WhatsApp / email; move the status (reasons, ticket size, exam date when needed); **close** as Not Interested or Junk; log calls and notes; schedule and complete follow-ups; application submitted; schedule / change / cancel the exam; mark Payment Done; full timeline |
| **Follow-ups** | Today / overdue / upcoming, mark done or missed |
| **Profile** | Who's signed in, open the full CRM on the web, sign out |
| **Notifications** | Bell on Today: new leads, students assigned for exams, follow-up reminders; tap opens the lead |

**Exam Coordinators** sign in too: Today shows applications, exams scheduled, exams in the next
7 days, payment due after the exam, Course Done and payments this month, plus upcoming exams.
Their list has the Application / Exam Scheduled / Course Done tabs (with the "exam done, payment
due" filter), and on a student they schedule, change or cancel the exam, mark Payment Done and
log notes — the same as the website.

Who can sign in: Consultants, Exam Coordinators (they see their students and the exam
workflow), Admins and Super Admins. Students are told to use the website.

## Run it on a phone while developing

```bash
npm ci
npx expo start
```
Install **Expo Go** from the Play Store on an Android phone and scan the QR code.

## Push notifications (one-time setup)

The server pushes every CRM notification (new lead assigned, new student for the exam,
follow-up due…) to signed-in phones. Android delivers pushes through Firebase, so once:

1. **console.firebase.google.com** → *Add project* → name it "CERTEZY Team" (Analytics not needed).
2. In the project: *Add app* → **Android** → package name **com.certezy.team** → *Register app* →
   download **google-services.json** and put it in this folder (next to `app.json`). Commit it —
   it only identifies the app and is safe to keep in the repo.
3. *Project settings → Service accounts* → **Generate new private key** (a `.json` file). Keep this
   one private — never commit it. Then:
   ```bash
   npx eas-cli credentials -p android
   ```
   choose the **preview** build profile → *Google Service Account* → *Manage your Google Service
   Account Key for Push Notifications (FCM V1)* → *Set up* → *Upload* → pick that `.json` file.
4. Build a new APK (`npm run build:apk`) and install it over the old app. On first sign-in Android
   asks to allow notifications → **Allow**.

Without these steps the app works normally; it just can't receive pushes.

## Share as an APK (no Play Store) — recommended for the team

1. Create a free account at expo.dev, then once on this computer:
   ```bash
   npx eas-cli login
   npx eas-cli init
   ```
2. Build the APK (runs on Expo's servers, about 15 minutes):
   ```bash
   npm run build:apk
   ```
   When it finishes you get a **download link** (also on expo.dev → your project → Builds).
   Expo creates the app's signing key and keeps it, so every later APK installs as an update.
3. Share the link (or the downloaded `.apk` file) with the team on WhatsApp / email.
4. Each person, on their Android phone:
   - opens the link and downloads the APK,
   - taps it; Android asks to allow installs from that app (Chrome, WhatsApp, Files) → **Allow**,
   - if Play Protect warns about an unknown developer → **More details → Install anyway**,
   - opens **CERTEZY Team** and signs in with their website account.

**Updating:** raise `version` (e.g. 1.0.1) and `android.versionCode` (e.g. 2) in `app.json`,
run `npm run build:apk` again and share the new link. Installing it over the old app keeps
everyone signed in. Never delete the Expo project: it holds the signing key, and an APK signed
with a different key can't update the installed app.

## Build for Google Play (internal testing)

Builds run on Expo's build servers (EAS), which also create and keep the app's signing key,
so nothing needs installing beyond Node.js.

1. Create a free account at expo.dev, then once:
   ```bash
   npx eas-cli login
   npx eas-cli init
   ```
2. Build the Play Store bundle (`.aab`):
   ```bash
   npm run build:android
   ```
   EAS prints a link to download the `.aab` when it finishes (about 15 minutes).
3. In **Google Play Console** → *Create app* → name **CERTEZY Team**, package
   **com.certezy.team** (set in `app.json`). Fill in the store listing and *App content*
   (privacy policy: https://certezy.com/privacy-policy; the app needs a login, so add a
   test staff account under *App access*).
4. *Testing → Internal testing* → create a release → upload the `.aab` (the first upload must
   be done by hand in Play Console) → add your team's emails as testers → share the opt-in link.
5. Later releases: raise `version` and `android.versionCode` in `app.json`, then
   `npm run build:android` and either upload the `.aab` again or run `npm run submit:android`
   (needs a Google Play service-account key — see Expo's *Submit to Google Play* guide).

Quick APK for testing without Play: `npx eas-cli build -p android --profile preview`.

## Code layout

- `app/` — screens (Expo Router): `login.tsx`, `(tabs)/` (Today, My leads, Follow-ups, Profile), `lead/[id].tsx`
- `src/api.ts` — API client (Bearer token in SecureStore; the server's refresh cookie renews it)
- `src/auth.tsx` — sign-in state; `src/crm.ts` — stages, labels, timeline wording; `src/ui.tsx` — shared UI
