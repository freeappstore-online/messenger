import { useEffect, useRef, useState } from "react";
import { SignalingService } from "../services/signalingService";

export interface P2POptions {
  onMessage: (bytes: ArrayBuffer) => void;
}

export interface P2PAPI {
  connectTo: (peerId: string) => Promise<void>;
  disconnectFrom: (peerId: string) => void;
  send: (bytes: ArrayBuffer) => void;
  connections: Record<string, RTCPeerConnectionState>;
}

export function useP2P(
  _myId: string,
  signaling: SignalingService,
  opts: P2POptions
): P2PAPI {
  interface PeerInfo {
    pc: RTCPeerConnection;
    ch?: RTCDataChannel;
    pendingCandidates?: RTCIceCandidateInit[];
    makingOffer: boolean;
    polite: boolean;
  }

  const peersRef = useRef<Map<string, PeerInfo>>(new Map());
  const [connections, setConnections] = useState<
    Record<string, RTCPeerConnectionState>
  >({});

  // Helper to flush any queued ICE candidates once remote description is set
  function flushPendingCandidates(peer: PeerInfo) {
    if (peer.pendingCandidates && peer.pendingCandidates.length) {
      console.log(
        `Flushing ${peer.pendingCandidates.length} queued ICE candidates`
      );
      peer.pendingCandidates.forEach(async (c) => {
        try {
          await peer.pc.addIceCandidate(c);
        } catch (err) {
          console.warn("Failed to add queued ICE candidate:", err);
        }
      });
      peer.pendingCandidates = [];
    }
  }

  // Handle incoming signals
  useEffect(() => {
    // Early return if signaling is null
    if (!signaling) return () => {};

    const unsub = signaling.listen(async (docId, sig) => {
      try {
        let peer = peersRef.current.get(sig.from);
        if (!peer) {
          peer = createPeer(sig.from);
          peersRef.current.set(sig.from, peer);
        }

        // Handle offer - glare-safe answer logic
        if (sig.type === "offer" && sig.sdp) {
          console.log(
            `Received offer from ${sig.from}, state: ${peer.pc.signalingState}`
          );

          const offerCollision =
            peer.makingOffer || peer.pc.signalingState !== "stable";
          if (offerCollision) {
            if (!peer.polite) {
              console.warn("Ignoring offer due to collision (impolite)");
              return;
            }
            // Polite peer rolls back
            await peer.pc.setLocalDescription({ type: "rollback" } as any);
          }

          await peer.pc.setRemoteDescription(sig.sdp);
          flushPendingCandidates(peer);
          const answer = await peer.pc.createAnswer();
          await peer.pc.setLocalDescription(answer);
          await signaling.send(sig.from, { type: "answer", sdp: answer });
          console.log(`Sent glare-safe answer to ${sig.from}`);
        }
        // Handle answer - set remote description
        else if (sig.type === "answer" && sig.sdp) {
          console.log(
            `Received answer from ${sig.from}, state:`,
            peer.pc.signalingState
          );

          // Skip if we already have a remote answer (duplicate message)
          if (peer.pc.remoteDescription?.type === "answer") {
            console.log("Duplicate answer received - already have remote answer");
          }
          // Only set remote description if we're in the right state (have a local offer)
          else if (peer.pc.signalingState === "have-local-offer") {
            await peer.pc.setRemoteDescription(sig.sdp);
            flushPendingCandidates(peer);
            console.log(`Set remote description from ${sig.from}`);
          } else {
            console.log(
              `Ignoring answer in ${peer.pc.signalingState} state - connection may already be established`
            );
          }
        }
        // Handle ICE candidate
        else if (sig.type === "ice" && sig.candidate) {
          try {
            if (peer.pc.remoteDescription) {
              await peer.pc.addIceCandidate(sig.candidate);
            } else {
              console.log(
                "Queueing ICE candidate until remote description is set"
              );
              (peer.pendingCandidates = peer.pendingCandidates || []).push(
                sig.candidate
              );
            }
          } catch (e) {
            console.warn("Error handling ICE candidate:", e);
          }
        }

        // Acknowledge the signal
        await signaling.ack(docId);
      } catch (error) {
        console.error("Error handling signal:", error);
        // Still try to acknowledge the signal to prevent processing it again
        try {
          await signaling.ack(docId);
        } catch (ackError) {
          console.error("Failed to acknowledge signal:", ackError);
        }
      }
    });
    return unsub;
  }, [signaling]);

  function createPeer(peerId: string) {
    setConnections((conn) => ({
      ...conn,
      [peerId]: "new" as RTCPeerConnectionState,
    }));
    console.log(`Creating new peer connection for ${peerId}`);
    // Deterministic polite flag to resolve glare (lexicographic order)
    const polite = _myId > peerId;
    const pc = new RTCPeerConnection({
      iceServers: [
        { urls: 'stun:stun.l.google.com:19302' },
        { urls: 'stun:stun1.l.google.com:19302' },
        { urls: 'stun:stun2.l.google.com:19302' },
        { urls: 'stun:stun3.l.google.com:19302' },
        { urls: 'stun:stun4.l.google.com:19302' },
      ],
      iceCandidatePoolSize: 10,
    });

    // Log connection state changes
    pc.onconnectionstatechange = () => {
      setConnections((conn) => ({ ...conn, [peerId]: pc.connectionState }));
      console.log(
        `Connection state for ${peerId} changed to: ${pc.connectionState}`
      );
      if (
        pc.connectionState === "closed" ||
        pc.connectionState === "failed" ||
        pc.connectionState === "disconnected"
      ) {
        setConnections((conn) => {
          const { [peerId]: _removed, ...rest } = conn;
          return rest;
        });
      }
    };

    pc.oniceconnectionstatechange = () => {
      console.log(
        `ICE connection state for ${peerId} changed to: ${pc.iceConnectionState}`
      );
    };

    pc.onsignalingstatechange = () => {
      console.log(
        `Signaling state for ${peerId} changed to: ${pc.signalingState}`
      );
    };

    pc.onicecandidate = (e) => {
      if (e.candidate && signaling) {
        console.log(`Sending ICE candidate to ${peerId}`);
        signaling
          .send(peerId, { type: "ice", candidate: e.candidate.toJSON() })
          .catch((err) =>
            console.error(`Failed to send ICE candidate to ${peerId}:`, err)
          );
      }
    };

    pc.ondatachannel = (ev) => {
      console.log(`Received data channel from ${peerId}`);
      const ch = ev.channel;
      ch.binaryType = "arraybuffer";

      ch.onopen = () => {
        console.log(`Data channel with ${peerId} opened`);
      };

      ch.onclose = () => {
        console.log(`Data channel with ${peerId} closed`);
      };

      ch.onerror = (err) => {
        console.error(`Data channel error with ${peerId}:`, err);
      };

      ch.onmessage = (m) => opts.onMessage(m.data as ArrayBuffer);

      const peer = peersRef.current.get(peerId);
      if (peer) {
        peer.ch = ch;
      } else {
        console.warn(`Received data channel for unknown peer ${peerId}`);
      }
    };

    // we create channel when we are initiator; for incoming, ondatachannel fires

    // Disable automatic renegotiation; connectTo() drives offers explicitly.
    pc.onnegotiationneeded = () => {
      console.log('onnegotiationneeded ignored – manual negotiation handled in connectTo');
    };

    return { pc, pendingCandidates: [], makingOffer: false, polite };
  }

  async function connectTo(peerId: string) {
    console.log(`Initiating connection to peer: ${peerId}`);

    // Return early if signaling is null
    if (!signaling) {
      console.error("Cannot connect: signaling service is null");
      return;
    }

    try {
      let peer = peersRef.current.get(peerId);
      if (!peer) {
        peer = createPeer(peerId);
        peersRef.current.set(peerId, peer);
      }

      // Check if we're already connected or connecting
      if (peer.pc.connectionState === "connected") {
        console.log(`Already connected to ${peerId}`);
        return;
      }

      // Only proceed if we're in a valid state to create an offer
      if (peer.pc.signalingState !== "stable") {
        console.log(
          `Cannot create offer in state: ${peer.pc.signalingState}, resetting connection`
        );
        // Close existing connection and create a new one
        peer.pc.close();
        peer = createPeer(peerId);
        peersRef.current.set(peerId, peer);
      }

      // Create data channel if it doesn't exist
      if (!peer.ch) {
        console.log(`Creating data channel for ${peerId}`);
        const ch = peer.pc.createDataChannel("chat");
        ch.binaryType = "arraybuffer";

        ch.onopen = () => {
          console.log(`Data channel with ${peerId} opened`);
        };

        ch.onclose = () => {
          console.log(`Data channel with ${peerId} closed`);
        };

        ch.onerror = (err) => {
          console.error(`Data channel error with ${peerId}:`, err);
        };

        ch.onmessage = (m) => opts.onMessage(m.data as ArrayBuffer);
        peer.ch = ch;
      }

      // Create and send offer
      console.log(`Creating offer for ${peerId}`);
      const offer = await peer.pc.createOffer();
      console.log(`Setting local description for ${peerId}`);
      await peer.pc.setLocalDescription(offer);
      console.log(`Sending offer to ${peerId}`);
      await signaling.send(peerId, { type: "offer", sdp: offer });
    } catch (error) {
      console.error(`Failed to connect to ${peerId}:`, error);
      throw error;
    }
  }

  function sendMessage(peerId: string, data: ArrayBuffer) {
    // Early return if signaling is null
    if (!signaling) {
      console.error("Cannot send message: signaling service is null");
      return false;
    }

    const peer = peersRef.current.get(peerId);
    if (!peer) {
      console.warn(`Cannot send message: peer ${peerId} not found`);
      return false;
    }

    if (!peer.ch) {
      console.warn(`Cannot send message: no data channel for peer ${peerId}`);
      return false;
    }

    if (peer.ch.readyState === "open") {
      try {
        peer.ch.send(data);
        return true;
      } catch (error) {
        console.error(`Error sending message to ${peerId}:`, error);
        return false;
      }
    } else {
      console.warn(
        `Cannot send message: data channel for ${peerId} is in state ${peer.ch.readyState}`
      );
      return false;
    }
  }

  function disconnectFrom(peerId: string) {
    const peer = peersRef.current.get(peerId);
    if (!peer) return;
    peer.pc.close();
    peersRef.current.delete(peerId);
    setConnections((conn) => {
      const { [peerId]: _removed, ...rest } = conn;
      return rest;
    });
  }

  function send(bytes: ArrayBuffer) {
    // Early return if signaling is null
    if (!signaling) return;

    // Send to all connected peers
    peersRef.current.forEach((_, peerId) => {
      sendMessage(peerId, bytes);
    });
  }

  return { connectTo, disconnectFrom, send, connections };
}
