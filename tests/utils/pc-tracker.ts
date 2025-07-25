import { BrowserContext, Page } from '@playwright/test';

/**
 * Install a tracker for every RTCPeerConnection created in the page. Must be
 * called on the BrowserContext (preferred) or on each Page *before* any page
 * navigates to the app so that the global `window.RTCPeerConnection` constructor
 * is wrapped in time.
 */
export async function installPCTracker(contextOrPage: BrowserContext | Page) {
  // @ts-ignore - playwright types overload addInitScript differently on Page vs Context
  const addInitScript: (fn: () => void) => Promise<void> = contextOrPage.addInitScript.bind(contextOrPage);

  await addInitScript(() => {
    const OriginalPC = (window as any).RTCPeerConnection as typeof RTCPeerConnection;
    if (!(OriginalPC && OriginalPC.prototype)) {
      console.warn('RTCPeerConnection constructor not found – tracker not installed');
      return;
    }

    // Keep references on window for debugging.
    (window as any).__pcs = [];
    (window as any).__channels = [];

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    function PatchedPeerConnection(this: any, ...args: any[]) {
      // eslint-disable-next-line prefer-rest-params
      const pc = new OriginalPC(...args);
      (window as any).__pcs.push(pc);

      pc.addEventListener('connectionstatechange', () => {
        (window as any).__lastConnectionState = pc.connectionState;
      });
      pc.addEventListener('iceconnectionstatechange', () => {
        (window as any).__lastIceState = pc.iceConnectionState;
      });
      pc.addEventListener('datachannel', (e: RTCDataChannelEvent) => {
        (window as any).__channels.push(e.channel);
        e.channel.addEventListener('open', () => {
          (window as any).__hasOpenDataChannel = true;
        });
      });
      return pc;
    }

    // Copy static properties and prototype so that feature detection still works.
    Object.assign(PatchedPeerConnection, OriginalPC);
    PatchedPeerConnection.prototype = OriginalPC.prototype;

    (window as any).RTCPeerConnection = PatchedPeerConnection;
  });
}

/**
 * Wait until any RTCPeerConnection reaches the connected/completed state OR a
 * data channel opens. Returns once the predicate is satisfied or rejects on
 * timeout.
 */
export async function waitForRTCConnected(page: Page, timeout = 45000) {
  await page.waitForFunction(() => {
    const pcs: RTCPeerConnection[] = (window as any).__pcs || [];
    const dcOpen = (window as any).__hasOpenDataChannel;
    return (
      dcOpen ||
      pcs.some(
        (pc) =>
          pc.connectionState === 'connected' ||
          pc.iceConnectionState === 'connected' ||
          pc.iceConnectionState === 'completed'
      )
    );
  }, { timeout });
}
