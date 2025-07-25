/**
 * Functions for monitoring WebRTC connection state
 */

import { Page } from '@playwright/test';
import { getWebRTCState, stopWebRTCMonitoring, injectWebRTCMonitoringScript, startWebRTCMonitoring, initializeConsoleCapture, injectGlobalWebRTCTracker } from './webrtc-browser-scripts';
import { WebRTCStateDetails } from './webrtc-types';

/**
 * Wait for the WebRTC connection to be established
 */
export async function waitForConnectionEstablished(page: Page, maxWaitTimeMs = 15000): Promise<void> {
  console.log(`Waiting for WebRTC connection to be established (timeout: ${maxWaitTimeMs}ms)...`);
  
  // Ensure WebRTC monitoring is initialized
  await initializeConsoleCapture(page);
  await injectGlobalWebRTCTracker(page);
  await injectWebRTCMonitoringScript(page);
  await startWebRTCMonitoring(page);
  
  // Verify that the monitoring script was injected
  const isMonitoringAvailable = await page.evaluate(() => {
    // @ts-ignore - Browser context
    return typeof window.monitorWebRTCConnection === 'function' && typeof window.checkWebRTCState === 'function';
  });
  
  console.log(`WebRTC monitoring script available in waitForConnectionEstablished: ${isMonitoringAvailable}`);
  
  if (!isMonitoringAvailable) {
    console.error('WebRTC monitoring script was not properly injected in waitForConnectionEstablished!');
  }
  
  const startTime = Date.now();
  let lastState: WebRTCStateDetails = {};
  
  try {
    // Check for connection status indicators in the UI
    const checkForConnectionUI = async () => {
      try {
        // Check for text indicators
        for (const selector of [
          'text=Connected', 
          'text=Connection established',
          'section div[style*="background"]' // Look for video elements or connection indicators
        ]) {
          console.log(`Checking for selector: ${selector}`);
          if (await page.isVisible(selector, { timeout: 1000 }).catch(() => false)) {
            console.log(`Found connection indicator: ${selector}`);
            return true;
          }
        }
        
        // Check for enabled message input (often only enabled when connected)
        const messageInput = await page.isVisible('textarea:not([disabled])', { timeout: 1000 }).catch(() => false);
        if (messageInput) {
          console.log('Found enabled message input, which suggests connection is established');
          return true;
        }
      } catch (e) {
        console.log('Error checking UI for connection status:', e);
      }
      return false;
    };
    
    // Check WebRTC state in the browser
    const checkWebRTCState = async () => {
      try {
        const state = await getWebRTCState(page);
        console.log('Current WebRTC state:', state);
        lastState = state;
        
        // Check for established connection based on WebRTC state
        if (state.connectionState === 'connected' || 
            state.connectionState === 'completed' ||
            state.iceConnectionState === 'connected' || 
            state.iceConnectionState === 'completed' ||
            state.dataChannelState === 'open') {
          console.log('WebRTC connection established based on connection state');
          return true;
        }
        
        // If we have a peer connection but it's not fully connected yet, it might be in progress
        if (state.peerConnectionsCount > 0) {
          console.log('WebRTC peer connection exists but not fully established yet');
        }
      } catch (e) {
        console.log('Error checking WebRTC state:', e);
      }
      return false;
    };
    
    // Poll for connection status
    while (Date.now() - startTime < maxWaitTimeMs) {
      // Check both UI and WebRTC state
      const [uiConnected, webrtcConnected] = await Promise.all([
        checkForConnectionUI(),
        checkWebRTCState()
      ]);
      
      if (uiConnected || webrtcConnected) {
        console.log('Connection established!');
        return;
      }
      
      // Wait before checking again
      await page.waitForTimeout(1000);
    }
    
    // If we get here, the connection wasn't established within the timeout
    console.log('Final WebRTC state before failure:', lastState);
    throw new Error(`Connection not established after ${maxWaitTimeMs}ms`);
  } catch (error) {
    console.error('Connection establishment timed out or failed:', error);
    
    // Take a screenshot of the current page state
    await page.screenshot({ path: `screenshots/connection-failed-${Date.now()}.png` });
    
    // Log the current page state
    const pageContent = await page.content();
    console.log('Current page state:');
    console.log(pageContent.substring(0, 500) + '...'); // Log first 500 chars
    
    // Get final WebRTC state
    try {
      const finalState = await getWebRTCState(page);
      console.log('Final WebRTC state before failure:', finalState);
    } catch (e) {
      console.log('Error getting final WebRTC state:', e);
    }
    
    console.error('Connection establishment failed:', error);
    throw error;
  } finally {
    // Always try to stop monitoring to clean up
    try {
      await stopWebRTCMonitoring(page);
    } catch (e) {
      console.log('Error stopping WebRTC monitoring:', e);
    }
  }
}
