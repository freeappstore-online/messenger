// Vitest setup file for WebRTC mocks

// Export these mocks so we can use them in tests if needed
export class ViTestRTCPeerConnection {
  localDescription: any = null;
  remoteDescription: any = null;
  signalingState: string = 'stable';
  connectionState: string = 'new';
  iceConnectionState: string = 'new';
  onicecandidate: any = null;
  ondatachannel: any = null;
  onconnectionstatechange: any = null;
  oniceconnectionstatechange: any = null;
  onsignalingstatechange: any = null;
  onnegotiationneeded: any = null;
  _senders: any[] = [];

  constructor() {}

  createOffer() {
    return Promise.resolve({ type: 'offer', sdp: 'mock-offer-sdp' });
  }

  createAnswer() {
    return Promise.resolve({ type: 'answer', sdp: 'mock-answer-sdp' });
  }

  setLocalDescription(desc: any) {
    this.localDescription = desc;
    if (desc.type === 'offer') {
      this.signalingState = 'have-local-offer';
    } else if (desc.type === 'answer') {
      this.signalingState = 'stable';
    } else if (desc.type === 'rollback') {
      this.signalingState = 'stable';
    }
    if (this.onsignalingstatechange) this.onsignalingstatechange();
    return Promise.resolve();
  }

  setRemoteDescription(desc: any) {
    this.remoteDescription = desc;
    if (desc.type === 'offer') {
      this.signalingState = 'have-remote-offer';
      // Trigger negotiationneeded event to simulate browser behavior
      setTimeout(() => {
        if (this.onnegotiationneeded) this.onnegotiationneeded();
      }, 0);
    } else if (desc.type === 'answer') {
      this.signalingState = 'stable';
    }
    if (this.onsignalingstatechange) this.onsignalingstatechange();
    return Promise.resolve();
  }

  addIceCandidate(candidate: any) {
    return Promise.resolve();
  }

  createDataChannel(label: string, options: any = {}) {
    return new ViTestRTCDataChannel(label);
  }

  close() {
    this.signalingState = 'closed';
    this.connectionState = 'closed';
    if (this.onconnectionstatechange) this.onconnectionstatechange();
    if (this.onsignalingstatechange) this.onsignalingstatechange();
  }
}

export class ViTestRTCDataChannel {
  label: string;
  readyState: string = 'connecting';
  binaryType: string = 'arraybuffer';
  onopen: any = null;
  onmessage: any = null;
  onclose: any = null;
  onerror: any = null;
  
  constructor(label: string) {
    this.label = label;
    
    // Auto-open after a brief delay
    setTimeout(() => {
      this.readyState = 'open';
      if (this.onopen) this.onopen();
    }, 10);
  }

  send(data: any) {
    return true;
  }

  close() {
    this.readyState = 'closed';
    if (this.onclose) this.onclose();
  }
}

export class ViTestRTCIceCandidate {
  constructor(init: any) {
    Object.assign(this, init);
  }

  toJSON() {
    return this;
  }
}

// Set up global mocks
globalThis.RTCPeerConnection = ViTestRTCPeerConnection as any;
globalThis.RTCIceCandidate = ViTestRTCIceCandidate as any;
globalThis.RTCSessionDescription = function(init: any) { return init; } as any;
