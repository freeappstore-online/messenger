# Family Chat POC Architecture

This document describes the architecture of the Family Chat POC application, highlighting the key components, their interactions, and design decisions.

## System Overview

Family Chat POC is a peer-to-peer (P2P) messaging application designed for secure family communication. It uses WebRTC for direct peer-to-peer communication, Firebase/Firestore for authentication and persistent data storage, and offers multiple signaling mechanisms for WebRTC connection establishment.

## Core Components

The application is structured into several logical modules:

```
src/
├── chat/         # Chat UI and state management
├── crypto/       # Encryption adapters 
├── rtc/          # WebRTC P2P connection management
├── services/     # Backend services and abstractions
├── App.tsx       # Main application component
└── firebase.ts   # Firebase configuration
```

## Service Layer

The service layer provides abstractions over external dependencies and core functionalities:

### Firebase and Firestore

- **`firebase.ts`**: Initializes Firebase app, authentication, and Firestore database
- **`services/firestoreService.ts`**: Provides an abstraction over Firestore operations (add, remove, listen, etc.)
- **`services/familyService.ts`**: Manages family-related operations (members, invites) using Firestore

### Signaling Architecture

The application uses a flexible signaling system for WebRTC connection establishment, with two implementations:

- **`services/signalingInterface.ts`**: Common interface (`ISignalingService`) that all signaling implementations follow
- **`services/wsSignalingService.ts`**: WebSocket-based signaling for production use
- **`tests/unit/mockSignalingService.ts`**: In-memory mock signaling for tests

The signaling service implementations provide three core functions:
1. `send()`: Send a signal to a specific peer
2. `listen()`: Listen for incoming signals
3. `ack()`: Acknowledge receipt of a signal

Configuration in `App.tsx`:
- `WS_SIGNALING_SERVER`: URL for the WebSocket signaling server used in production

## WebRTC Layer

The WebRTC layer manages peer connections, data channels, and the negotiation process:

- **`rtc/p2pManager.ts`**: Core WebRTC implementation using native browser APIs
- **`rtc/simplePeerManager.ts`**: Alternative implementation using the simple-peer library
- **`rtc/p2pManagerFactory.ts`**: Factory that selects which implementation to use
- **`rtc/useP2P.ts`**: React hook that exposes P2P functionality to the UI

The WebRTC layer implements the "Perfect Negotiation" pattern for robust connection establishment and handles various scenarios like ICE candidate collection, connection state management, and data channel setup.

## Chat Layer

The chat layer manages messages, UI components, and persistence:

- **`chat/useChat.ts`**: React hook managing chat state and message handling
- **`chat/db.ts`**: Utilities for message storage
- **`chat/localStore.ts`**: Local storage utilities
- UI Components:
  - `FamilyInviteForm.tsx`
  - `PendingInvites.tsx`
  - `WelcomeMessage.tsx`

## Application Flow

1. **Authentication**: Users authenticate using Firebase authentication
2. **Family Management**: Users join or create a family group
3. **Signaling Setup**: Based on configuration, either WebSocket or Firestore signaling is initialized
4. **P2P Connection**: WebRTC connections are established between peers using the signaling service
5. **Messaging**: Once connected, messages flow directly between peers via WebRTC data channels

## Key Design Decisions

### WebRTC Implementation

The application offers two WebRTC implementations:
- Native WebRTC APIs: More control, smaller bundle size
- SimplePeer library: Easier to use, but larger dependency

A feature flag `USE_SIMPLE_PEER` in `p2pManagerFactory.ts` controls which implementation is used.

### Signaling Strategy

The application uses a clear signaling strategy:
- **Development/Testing**: Uses in-memory mock signaling to avoid external dependencies
- **Production**: Uses WebSocket signaling exclusively for efficiency and lower latency

This design eliminates all Firestore document operations for signaling, significantly reducing costs and improving performance.

### Polling Intervals

The application uses different polling intervals for production vs. development:
- `REFRESH_INTERVAL_PROD`: 10 seconds (10000ms) for production
- `REFRESH_INTERVAL_DEV`: 1 minute (60000ms) for development

This reduces Firestore read operations during development and testing.

## Testing

Tests use the in-memory mock signaling service to avoid hitting Firestore. This provides several benefits:
- Faster test execution
- No Firestore costs during testing
- Deterministic test behavior
- No external dependencies

## Future Improvements

1. **WebSocket Server Deployment**: Deploy a dedicated WebSocket signaling server
2. **End-to-End Encryption**: Implement proper encryption (currently using NoopCryptoAdapter)
3. **Multiple Family Support**: Allow users to be part of multiple family groups
4. **Offline Support**: Add better handling for offline scenarios

## Deployment Considerations

When deploying to production:
1. Set `IS_PRODUCTION` flag to true
2. Configure `WS_SIGNALING_SERVER` to point to your deployed WebSocket server
3. Consider adjusting Firestore security rules for optimal protection
4. Remove Firestore rules for the `signals` collection as it's no longer used
