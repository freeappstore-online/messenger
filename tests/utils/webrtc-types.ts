/**
 * Type definitions for WebRTC testing
 */

import { Page } from '@playwright/test';

/**
 * Extended Window interface for browser context scripts
 */
export interface ExtendedWindow extends Window {
  monitorWebRTCConnection?: () => () => void;
  stopWebRTCMonitor?: () => void;
  _webRTCMonitorInterval?: number;
  consoleMessages?: string[];
  checkWebRTCState?: () => Record<string, any>;
  webRTCStateHistory?: any[];
}

/**
 * React element with internal properties needed for WebRTC detection
 */
export interface ReactElement extends Element {
  _reactInternalInstance?: { memoizedProps?: any };
  _reactInternals?: { memoizedProps?: any };
  __reactInternalInstance?: { memoizedProps?: any };
  __reactFiber?: { memoizedProps?: any };
}

/**
 * Extended RTCPeerConnection with state properties
 */
export type RTCPeerConnectionWithState = RTCPeerConnection & {
  connectionState: RTCPeerConnectionState;
  iceConnectionState: RTCIceConnectionState;
  iceGatheringState: RTCIceGatheringState;
  signalingState: RTCSignalingState;
};

/**
 * WebRTC connection state details
 */
export interface WebRTCStateDetails {
  timestamp?: string;
  connectionState?: RTCPeerConnectionState;
  iceConnectionState?: RTCIceConnectionState;
  iceGatheringState?: RTCIceGatheringState;
  signalingState?: RTCSignalingState;
  dataChannelState?: RTCDataChannelState;
  iceCandidateCount?: string | number;
  hasLocalDescription?: boolean;
  hasRemoteDescription?: boolean;
  localDescriptionType?: string;
  remoteDescriptionType?: string;
  error?: string;
}
