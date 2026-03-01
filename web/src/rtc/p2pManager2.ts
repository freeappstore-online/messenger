import type { ISignalingService } from '../services/signalingInterface';
import type { SignalPayload, StoredSignal } from '../services/signalingService';
import { handleSignal } from './signalHandlers';
import type { SignalHandlerContext } from './types';
import {
  MESSAGE_TYPE,
  type PeerInfo,
  type P2PMessage,
  type PresenceMessage
} from './p2pUtils';

export class P2PManager {
  private id: string;
  private signaling: ISignalingService;
  private peers: Map<string, PeerInfo> = new Map();
  private dataChannels: Map<string, RTCDataChannel> = new Map();
  private onMessage?: (fromId: string, message: P2PMessage) => void;
  private onConnectionStateChange?: (peerId: string, state: RTCPeerConnectionState) => void;
  private onPresenceUpdate?: (peerId: string, isOnline: boolean) => void;

  constructor(id: string, signaling: ISignalingService) {
    this.id = id;
    this.signaling = signaling;
    this.signaling.listen(this.onSignalReceived);
  }

  public setOnMessage(callback: (fromId: string, message: P2PMessage) => void): void {
    this.onMessage = callback;
  }

  public setOnConnectionStateChange(callback: (peerId: string, state: RTCPeerConnectionState) => void): void {
    this.onConnectionStateChange = callback;
  }

  public setOnPresenceUpdate(callback: (peerId: string, isOnline: boolean) => void): void {
    this.onPresenceUpdate = callback;
  }

  public connectTo = (peerId: string): void => {
    if (this.peers.has(peerId)) {
      console.log(`Already connected to peer ${peerId}`);
      return;
    }
    console.log(`Connecting to peer ${peerId}`);
    this.createPeerConnection(peerId, true);
  };

  public disconnectFrom = (peerId: string): void => {
    const peer = this.peers.get(peerId);
    if (peer) {
      peer.pc.close();
      this.peers.delete(peerId);
      this.dataChannels.delete(peerId);
      console.log(`Disconnected from peer ${peerId}`);
      if (this.onConnectionStateChange) {
        this.onConnectionStateChange(peerId, 'disconnected');
      }
    }
  };

  public sendMessage(peerId: string, message: P2PMessage): void {
    const dataChannel = this.dataChannels.get(peerId);
    if (dataChannel && dataChannel.readyState === 'open') {
      dataChannel.send(JSON.stringify(message));
    } else {
      console.warn(`Data channel to ${peerId} is not open.`);
    }
  }

  public broadcastMessage(message: P2PMessage): void {
    this.peers.forEach((_, peerId) => {
      this.sendMessage(peerId, message);
    });
  }

  public broadcast(bytes: ArrayBuffer): void {
    const msg: P2PMessage = { type: MESSAGE_TYPE.CHAT, payload: bytes };
    this.broadcastMessage(msg);
  }

  public broadcastPresence(isOnline: boolean): void {
    const presence: PresenceMessage = {
      userId: this.id,
      isOnline,
      timestamp: Date.now(),
    };
    const msg: P2PMessage = { type: MESSAGE_TYPE.PRESENCE, payload: presence };
    this.broadcastMessage(msg);
  }

  private onSignalReceived = async (fromId: string, signal: StoredSignal): Promise<void> => {
    console.log(`Signal received from ${fromId}`, signal);
    if (!this.peers.has(fromId)) {
      this.createPeerConnection(fromId, false);
    }
    const context: SignalHandlerContext = {
      myId: this.id,
      signaling: this.signaling,
      peers: this.peers,
      sendSignalingMessage: this.sendSignalingMessage.bind(this),
      flushPendingIceCandidates: this.flushPendingIceCandidates.bind(this),
      setupDataChannel: this.setupDataChannel.bind(this),
    };
    await handleSignal(context, fromId, signal);
  };

  private createPeerConnection(peerId: string, isInitiator: boolean): RTCPeerConnection {
    const pc = new RTCPeerConnection({
      iceServers: [{ urls: 'stun:stun.l.google.com:19302' }],
    });

    const peerInfo: PeerInfo = {
      id: peerId,
      connectionId: `${peerId}-${Date.now()}`,
      connectionType: 'auto',
      pc,
      polite: !isInitiator,
      makingOffer: false,
      settingRemoteAnswer: false,
      pendingCandidates: [],
      isOnline: false,
    };
    this.peers.set(peerId, peerInfo);

    pc.onicecandidate = ({ candidate }) => {
      if (candidate) {
        this.sendSignalingMessage(peerId, { type: 'ice', candidate });
      }
    };

    pc.oniceconnectionstatechange = () => {
      if (this.onConnectionStateChange) {
        this.onConnectionStateChange(peerId, pc.iceConnectionState as RTCPeerConnectionState);
      }
    };

    pc.ondatachannel = (event) => {
      this.setupDataChannel(peerId, event.channel);
    };

    if (isInitiator) {
      const dataChannel = pc.createDataChannel('dataChannel');
      this.setupDataChannel(peerId, dataChannel);
      pc.onnegotiationneeded = async () => {
        try {
          peerInfo.makingOffer = true;
          await pc.setLocalDescription();
          if (pc.localDescription) {
            this.sendSignalingMessage(peerId, { type: 'offer', sdp: pc.localDescription });
          }
        } catch (err) {
          console.error(err);
        } finally {
          peerInfo.makingOffer = false;
        }
      };
    }

    return pc;
  }

  private sendSignalingMessage(toId: string, signal: SignalPayload): void {
    this.signaling.send(toId, signal);
  }

  private flushPendingIceCandidates(peerId: string, pc: RTCPeerConnection): void {
    const peer = this.peers.get(peerId);
    if (peer?.pendingCandidates) {
      for (const candidate of peer.pendingCandidates) {
        pc.addIceCandidate(candidate);
      }
      peer.pendingCandidates = [];
    }
  }

  private setupDataChannel(peerId: string, channel: RTCDataChannel): void {
    channel.onopen = () => {
      console.log(`Data channel with ${peerId} opened.`);
      if (this.onConnectionStateChange) {
        this.onConnectionStateChange(peerId, 'connected');
      }
    };

    channel.onclose = () => {
      console.log(`Data channel with ${peerId} closed.`);
      this.disconnectFrom(peerId);
    };

    channel.onmessage = (event) => {
      try {
        const message: P2PMessage = JSON.parse(event.data);
        if (message.type === MESSAGE_TYPE.PRESENCE) {
          const presence = message.payload as PresenceMessage;
          if (this.onPresenceUpdate) {
            this.onPresenceUpdate(presence.userId, presence.isOnline);
          }
        } else if (this.onMessage) {
          this.onMessage(peerId, message);
        }
      } catch (error) {
        console.error('Error parsing message:', error);
      }
    };

    this.dataChannels.set(peerId, channel);
  }
}
