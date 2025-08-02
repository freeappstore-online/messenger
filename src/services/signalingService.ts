import type { FirestoreService } from './firestoreService';
import type { ISignalingService } from './signalingInterface';

export type SignalPayload =
  | { type: 'offer'; sdp: RTCSessionDescriptionInit; connectionId?: string }
  | { type: 'answer'; sdp: RTCSessionDescriptionInit; connectionId?: string }
  | { type: 'ice'; candidate: RTCIceCandidateInit; connectionId?: string }
  | { type: 'simple-peer'; data: any; connectionId?: string }; // Simple-Peer signaling data

export interface StoredSignal {
  type: 'offer' | 'answer' | 'ice' | 'simple-peer';
  sdp?: RTCSessionDescriptionInit;
  candidate?: RTCIceCandidateInit;
  data?: any; // Simple-Peer signaling data
  from: string;
  createdAt: number;
  connectionId?: string; // Unique ID to distinguish parallel connections between the same peers
}

export class SignalingService implements ISignalingService {
  private fs: FirestoreService;
  readonly me: string; // Changed from private to public readonly to match interface

  // Remove whitespace and common clipboard symbol from any copied ID
  private static sanitizeId(id: string): string {
    return id.replace(/\s|\u{1F4CB}/gu, "");
  }
  
  constructor(fs: FirestoreService, me: string) {
    this.fs = fs;
    this.me = me;
  }

  async send(toUserId: string, payload: SignalPayload) {
    const cleanId = SignalingService.sanitizeId(toUserId);
    console.log(`[Signal] send ${payload.type} to ${cleanId}`);
    await this.fs.add<StoredSignal>(`signals/${cleanId}/inbox`, {
      ...payload,
      from: SignalingService.sanitizeId(this.me),
      createdAt: Date.now()
    });
  }

  listen(cb: (id: string, sig: StoredSignal) => void) {
    const cleanMe = SignalingService.sanitizeId(this.me);
    return this.fs.listenCollection<StoredSignal>(`signals/${cleanMe}/inbox`, items => {
      items.forEach(({ id, data }) => {
        console.log(`[Signal] received ${data.type} from ${data.from}`);
        cb(id, data);
      });
    });
  }

  async ack(id: string) {
    const cleanMe = SignalingService.sanitizeId(this.me);
    await this.fs.remove(`signals/${cleanMe}/inbox/${id}`);
  }
}
