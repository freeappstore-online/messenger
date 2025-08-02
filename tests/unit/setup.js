// setup.js - ESM version
// Mock RTCPeerConnection and related classes for WebRTC testing
class MockRTCPeerConnection {
  constructor() {
    this.localDescription = null;
    this.remoteDescription = null;
    this.signalingState = 'stable';
    this.connectionState = 'new';
    this.iceConnectionState = 'new';
    this.onicecandidate = null;
    this.ondatachannel = null;
    this.onconnectionstatechange = null;
    this.oniceconnectionstatechange = null;
    this.onsignalingstatechange = null;
    this.onnegotiationneeded = null;
    this._senders = [];
  }

  createOffer() {
    return Promise.resolve({ type: 'offer', sdp: 'mock-offer-sdp' });
  }

  createAnswer() {
    return Promise.resolve({ type: 'answer', sdp: 'mock-answer-sdp' });
  }

  setLocalDescription(desc) {
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

  setRemoteDescription(desc) {
    this.remoteDescription = desc;
    if (desc.type === 'offer') {
      this.signalingState = 'have-remote-offer';
    } else if (desc.type === 'answer') {
      this.signalingState = 'stable';
    }
    if (this.onsignalingstatechange) this.onsignalingstatechange();
    return Promise.resolve();
  }

  addIceCandidate(candidate) {
    return Promise.resolve();
  }

  createDataChannel(label, options = {}) {
    return new MockRTCDataChannel(label);
  }

  close() {
    this.signalingState = 'closed';
    this.connectionState = 'closed';
    if (this.onconnectionstatechange) this.onconnectionstatechange();
    if (this.onsignalingstatechange) this.onsignalingstatechange();
  }
}

class MockRTCDataChannel {
  constructor(label) {
    this.label = label;
    this.readyState = 'connecting';
    this.binaryType = 'arraybuffer';
    this.onopen = null;
    this.onmessage = null;
    this.onclose = null;
    this.onerror = null;
    
    // Auto-open after a brief delay
    setTimeout(() => {
      this.readyState = 'open';
      if (this.onopen) this.onopen();
    }, 10);
  }

  send(data) {
    return true;
  }

  close() {
    this.readyState = 'closed';
    if (this.onclose) this.onclose();
  }
}

class MockRTCIceCandidate {
  constructor(init) {
    Object.assign(this, init);
  }

  toJSON() {
    return this;
  }
}

// Set up global mocks
global.RTCPeerConnection = MockRTCPeerConnection;
global.RTCIceCandidate = MockRTCIceCandidate;
global.RTCSessionDescription = function(init) { return init; };
