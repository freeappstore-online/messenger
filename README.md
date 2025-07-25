# Family Chat POC

A proof-of-concept for a peer-to-peer family chat application using WebRTC, Firebase Auth, and local storage.

## Features

- **Firebase Auth** for user authentication
- **Firestore** as a signaling relay for WebRTC connections
- **WebRTC DataChannel** for direct peer-to-peer messaging
- **Local Storage** for message persistence
- **Minimal UI** focused on demonstrating the core functionality

## Prerequisites

1. Create a Firebase project
2. Enable Email/Password or Google authentication
3. Enable Firestore in test mode
4. Add a web app to your Firebase project and get the configuration

## Setup

1. Update the Firebase configuration in `src/firebase.ts` with your own Firebase project details:

```typescript
const firebaseConfig = {
  apiKey: "YOUR_API_KEY",
  authDomain: "YOUR_AUTH_DOMAIN",
  projectId: "YOUR_PROJECT_ID",
  appId: "YOUR_APP_ID"
};
```

2. Install dependencies:

```bash
npm install
```

3. Start the development server:

```bash
npm run dev
```

## How to Test

1. Open the application in two different browsers or browser profiles (e.g., Chrome normal and incognito)
2. Sign in with different accounts on each browser
3. Copy the User ID from one browser and paste it into the "Peer UID" field in the other browser
4. Click "Connect To Peer" on both sides
5. Start sending messages
6. Messages will be delivered directly peer-to-peer via WebRTC
7. Refresh the page to verify that messages are persisted in localStorage

## Automated E2E Tests

This project now includes reliable Playwright end-to-end tests found in `tests/`.
The primary WebRTC scenario (`p2p-connection.spec.ts`) performs the following:

1. Starts two separate Chromium contexts and logs in distinct Firebase users.
2. Injects a global `RTCPeerConnection` tracker before app load for deterministic state checks.
3. Establishes a peer-to-peer data-channel using a “perfect negotiation” approach with glare handling (`makingOffer`, `polite`, rollback).
4. Waits until both peers report `connected` and their data channel is `open`.
5. Sends a chat message from User A and verifies receipt by User B.

A successful run prints logs such as:
```
Connection state ... connected
Data channel ... opened
Message received successfully
```

Run the suite with:
```bash
npm run test:e2e   # alias for: npx playwright test
```

---

## Continuous Deployment (Firebase Hosting)

The project is configured for automatic deploys to Firebase Hosting whenever commits are merged into `main`.

1. **Firebase setup**
   • Create a Firebase project (Web) and enable Hosting.  
   • Note your project ID and generate a service-account JSON with *Firebase Hosting Admin* role.

2. **Repository secrets**  
   Add these GitHub secrets in your repo **Settings → Secrets → Actions**:

   | Secret | Description |
   |--------|-------------|
   | `FIREBASE_SERVICE_ACCOUNT` | The contents of the service-account JSON (base64-encoded or raw JSON). |
   | `FIREBASE_PROJECT_ID` | Your Firebase project ID. |

3. **Workflow**  
   The file `.github/workflows/firebase-hosting.yml`:
   • Installs deps, runs e2e tests, builds the Vite app (`npm run build`).  
   • Deploys to Hosting via `FirebaseExtended/action-hosting-deploy@v0`.

4. **Local deploy preview**  
   You can still run `firebase serve` or `firebase emulators:start --only hosting` after a local `npm run build`.

---

## Architecture

- `src/firebase.ts` - Firebase initialization
- `src/services/firestoreService.ts` - Firestore service wrapper
- `src/services/signalingService.ts` - WebRTC signaling service using Firestore
- `src/rtc/useP2P.ts` - WebRTC peer connection management
- `src/chat/useChat.ts` - Chat message handling
- `src/chat/localStore.ts` - Local storage for messages
- `src/crypto/noopCrypto.ts` - Placeholder for future encryption
- `src/App.tsx` - Main application component

## Future Enhancements

- Replace localStorage with IndexedDB (Dexie.js)
- Add real encryption for messages
- Improve UI/UX
- Add offline support
- Auto-connect to family members
# site
