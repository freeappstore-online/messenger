import type { FirestoreService } from './firestoreService';

export type SignalPayload =
  | { type: 'offer'; sdp: RTCSessionDescriptionInit }
  | { type: 'answer'; sdp: RTCSessionDescriptionInit }
  | { type: 'ice'; candidate: RTCIceCandidateInit };

export interface StoredSignal {
  type: 'offer' | 'answer' | 'ice';
  sdp?: RTCSessionDescriptionInit;
  candidate?: RTCIceCandidateInit;
  from: string;
  createdAt: number;
}

export class SignalingService {
  private fs: FirestoreService;
  private me: string;
  
  constructor(fs: FirestoreService, me: string) {
    this.fs = fs;
    this.me = me;
  }

  async send(toUserId: string, payload: SignalPayload) {
    await this.fs.add<StoredSignal>(`signals/${toUserId}/inbox`, {
      ...payload,
      from: this.me,
      createdAt: Date.now()
    });
  }

  listen(cb: (id: string, sig: StoredSignal) => void) {
    return this.fs.listenCollection<StoredSignal>(`signals/${this.me}/inbox`, items => {
      items.forEach(({ id, data }) => cb(id, data));
    });
  }

  async ack(id: string) {
    await this.fs.remove(`signals/${this.me}/inbox/${id}`);
  }
}
