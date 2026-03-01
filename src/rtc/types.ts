import type { ISignalingService } from '../services/signalingInterface';
import type { SignalPayload } from '../services/signalingService';
import type { PeerInfo } from './p2pUtils';

export interface SignalHandlerContext {
  myId: string;
  signaling: ISignalingService;
  peers: Map<string, PeerInfo>;
  sendSignalingMessage(peerId: string, message: SignalPayload): void;
  flushPendingIceCandidates(peerId: string, pc: RTCPeerConnection): void;
  setupDataChannel(peerId: string, dataChannel: RTCDataChannel): void;
}
