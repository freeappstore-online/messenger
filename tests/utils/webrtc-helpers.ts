import { Page } from '@playwright/test';

/**
 * Initiate a connection to another user
 */
export async function initiateConnection(page: Page, targetUserId: string): Promise<void> {
  console.log(`Initiating connection to peer: ${targetUserId}`);
  
  try {
    // Inject helper script to monitor WebRTC connection process
    await page.evaluate(() => {
      // Define types for browser context
      interface ExtendedWindow extends Window {
        monitorWebRTCConnection?: () => () => void;
        stopWebRTCMonitor?: () => void;
        _webRTCMonitorInterval?: number;
        consoleMessages?: string[];
        checkWebRTCState?: () => Record<string, any>;
      }
      
      interface ReactElement extends Element {
        _reactInternalInstance?: { memoizedProps?: any };
        _reactInternals?: { memoizedProps?: any };
        __reactInternalInstance?: { memoizedProps?: any };
        __reactFiber?: { memoizedProps?: any };
      }
      
      // Define a type that represents the WebRTC peer connection with its state properties
      // We use type instead of interface to avoid the extension errors
      type RTCPeerConnectionWithState = RTCPeerConnection & {
        connectionState: RTCPeerConnectionState;
        iceConnectionState: RTCIceConnectionState;
        iceGatheringState: RTCIceGatheringState;
        signalingState: RTCSignalingState;
      };
      
      // Cast window to our extended interface
      const win = window as unknown as ExtendedWindow;
      
      win.monitorWebRTCConnection = () => {
        console.log('Starting WebRTC connection monitoring');
        
        // Store connection state history for debugging
        // @ts-ignore - Browser context
        window.webRTCStateHistory = [];
        
        // Find React components that might contain peer connection
        const findPeerComponents = () => {
          console.log('Searching for React components with WebRTC connections...');
          const allElements = Array.from(document.querySelectorAll('*'));
          console.log(`Found ${allElements.length} total DOM elements to search`);
          
          return allElements
            .filter(el => {
              try {
                const reactEl = el as ReactElement;
                return reactEl._reactInternalInstance || 
                       reactEl._reactInternals || 
                       reactEl.__reactInternalInstance || 
                       reactEl.__reactFiber;
              } catch (e) {
                return false;
              }
            }) as ReactElement[];
        };
        
        // Log React component structure for debugging
        const logReactComponentStructure = () => {
          try {
            const components = findPeerComponents();
            console.log(`Found ${components.length} React components`);
            
            // Look for useP2P hook or P2P related components
            const p2pComponents = components.filter(comp => {
              try {
                const props = comp._reactInternals?.memoizedProps || 
                              comp._reactInternalInstance?.memoizedProps || 
                              comp.__reactInternalInstance?.memoizedProps || 
                              comp.__reactFiber?.memoizedProps;
                
                // Check for any P2P related properties
                return props && (
                  props.peer || 
                  props.connection || 
                  props.webrtc || 
                  props.rtc || 
                  props.p2p ||
                  (typeof props.children === 'object' && props.children?.props?.peer)
                );
              } catch (e) {
                return false;
              }
            });
            
            console.log(`Found ${p2pComponents.length} potential P2P related components`);
            
            // Log component details for the first few P2P components
            p2pComponents.slice(0, 3).forEach((comp, i) => {
              try {
                const props = comp._reactInternals?.memoizedProps || 
                              comp._reactInternalInstance?.memoizedProps || 
                              comp.__reactInternalInstance?.memoizedProps || 
                              comp.__reactFiber?.memoizedProps;
                
                console.log(`P2P Component ${i} props keys:`, Object.keys(props || {}));
                if (props?.peer) {
                  console.log(`P2P Component ${i} peer keys:`, Object.keys(props.peer));
                }
              } catch (e) {
                console.log(`Error inspecting P2P component ${i}:`, e);
              }
            });
          } catch (e) {
            console.error('Error analyzing React components:', e);
          }
        };
        
        // Run initial component analysis
        logReactComponentStructure();
        
        // Monitor for connection state changes
        const monitorInterval = setInterval(() => {
          try {
            const components = findPeerComponents();
            let foundPeerConnection = false;
            
            components.forEach(comp => {
              try {
                const props = comp._reactInternals?.memoizedProps || 
                              comp._reactInternalInstance?.memoizedProps || 
                              comp.__reactInternalInstance?.memoizedProps || 
                              comp.__reactFiber?.memoizedProps;
                
                if (props?.peer?.pc) {
                  foundPeerConnection = true;
                  const pc = props.peer.pc as RTCPeerConnectionWithState;
                  
                  // Create detailed state object
                  const stateDetails = {
                    timestamp: new Date().toISOString(),
                    connectionState: pc.connectionState,
                    iceConnectionState: pc.iceConnectionState,
                    iceGatheringState: pc.iceGatheringState,
                    signalingState: pc.signalingState,
                    dataChannelState: props.peer.ch?.readyState,
                    iceCandidateCount: pc.onicecandidate ? 'Has handler' : 'No handler',
                    hasLocalDescription: !!pc.localDescription,
                    hasRemoteDescription: !!pc.remoteDescription,
                    localDescriptionType: pc.localDescription?.type || 'none',
                    remoteDescriptionType: pc.remoteDescription?.type || 'none'
                  };
                  
                  // Store in history
                  // @ts-ignore - Browser context
                  window.webRTCStateHistory.push(stateDetails);
                  
                  // Log the current state
                  console.log('WebRTC connection state:', stateDetails);
                  
                  // Log additional details about ICE candidates if available
                  if (pc.localDescription && pc.localDescription.sdp) {
                    const iceCandidates = pc.localDescription.sdp
                      .split('\n')
                      .filter(line => line.startsWith('a=candidate:'));
                    console.log(`Local ICE candidates (${iceCandidates.length}):`, 
                      iceCandidates.length > 0 ? iceCandidates[0] + '...' : 'None');
                  }
                }
              } catch (e) {
                console.error('Error monitoring specific component:', e);
              }
            });
            
            if (!foundPeerConnection) {
              console.log('No active WebRTC peer connections found in this monitoring cycle');
              // Re-run component analysis periodically if no connections found
              if (Math.random() < 0.2) { // 20% chance to avoid too much logging
                logReactComponentStructure();
              }
            }
          } catch (e) {
            console.error('Error in WebRTC monitoring:', e);
          }
        }, 1000);
        
        // Store the interval ID (TypeScript sees this as number in browser context)
        win._webRTCMonitorInterval = monitorInterval as unknown as number;
        
        // Return a function to stop monitoring
        return () => {
          clearInterval(monitorInterval);
          console.log('Stopped WebRTC connection monitoring');
        };
      };
    });
    
    // Start monitoring
    await page.evaluate(() => {
      // @ts-ignore - This is executed in the browser context
      if (window.monitorWebRTCConnection) {
        // @ts-ignore - This is executed in the browser context
        window.stopWebRTCMonitor = window.monitorWebRTCConnection();
      }
    });
    
    // Log all input fields and buttons to help with debugging
    const inputFields = await page.$$('input');
    console.log(`Found ${inputFields.length} input fields on the page`);
    
    for (const input of inputFields) {
      const type = await input.getAttribute('type');
      const placeholder = await input.getAttribute('placeholder');
      console.log(`Input type: ${type || 'none'}, placeholder: ${placeholder || 'none'}`);
    }
    
    const buttons = await page.$$('button');
    console.log(`Found ${buttons.length} buttons on the page`);
    
    for (const button of buttons) {
      const text = await button.textContent();
      console.log(`Button text: ${text?.trim() || 'empty'}`);
    }
    
    // Find the peer input field using multiple possible selectors
    const possibleInputSelectors = [
      'input[placeholder="Peer UID"]',
      'input[placeholder="Peer ID"]',
      'input[placeholder="Enter peer ID"]',
      // Add a more generic selector as fallback
      'input'
    ];
    
    let inputSelector: string | null = null;
    for (const selector of possibleInputSelectors) {
      try {
        if (await page.isVisible(selector)) {
          inputSelector = selector;
          console.log(`Found peer input with selector: ${selector}`);
          break;
        }
      } catch (e) {
        console.log(`Error checking selector ${selector}: ${e}`);
      }
    }
    
    if (!inputSelector) {
      console.error('Peer input not found with any of the expected selectors!');
      await page.screenshot({ path: `peer-input-not-found-${Date.now()}.png` });
      throw new Error('Peer input field not found');
    }
    
    // Clear the input field first to ensure we don't have any previous value
    await page.fill(inputSelector, '');
    await page.waitForTimeout(500); // Increased timeout for input clearing
    
    // Verify the input is cleared
    const clearedValue = await page.$eval(inputSelector, (el) => (el as HTMLInputElement).value);
    console.log(`Input field cleared. Current value: "${clearedValue}"`);
    
    // Fill the peer input with the target user ID
    await page.fill(inputSelector, targetUserId);
    await page.waitForTimeout(500); // Wait for input to be filled
    
    // Verify the input has the correct value
    const filledValue = await page.$eval(inputSelector, (el) => (el as HTMLInputElement).value);
    console.log(`Filled peer input with ID: ${targetUserId}. Actual value: "${filledValue}"`);
    
    // Check if the filled value matches the target user ID
    if (filledValue !== targetUserId) {
      console.error(`Input field value mismatch! Expected: "${targetUserId}", Actual: "${filledValue}"`);
      // Try again with a different approach
      console.log('Trying alternative input method...');
      await page.evaluate(([selector, value]) => {
        const input = document.querySelector(selector) as HTMLInputElement;
        if (input) {
          input.value = value;
          input.dispatchEvent(new Event('input', { bubbles: true }));
          input.dispatchEvent(new Event('change', { bubbles: true }));
        }
      }, [inputSelector, targetUserId]);
      
      // Verify again
      const retriedValue = await page.$eval(inputSelector, (el) => (el as HTMLInputElement).value);
      console.log(`After retry, input value: "${retriedValue}"`);
    }
    
    // Take a screenshot to verify the input is filled correctly
    await page.screenshot({ path: `peer-input-filled-${Date.now()}.png` });
    
    // Find the connect button using multiple possible selectors
    const possibleButtonSelectors = [
      'button:has-text("Connect To Peer")',
      'button:has-text("Connect")',
      'button:has-text("Connect to Peer")',
      // Add a more generic selector as fallback
      'button:not(:disabled)'
    ];
    
    let buttonSelector: string | null = null;
    for (const selector of possibleButtonSelectors) {
      try {
        if (await page.isVisible(selector)) {
          buttonSelector = selector;
          console.log(`Found connect button with selector: ${selector}`);
          break;
        }
      } catch (e) {
        console.log(`Error checking selector ${selector}: ${e}`);
      }
    }
    
    if (!buttonSelector) {
      console.error('Connect button not found with any of the expected selectors!');
      await page.screenshot({ path: `connect-button-not-found-${Date.now()}.png` });
      throw new Error('Connect button not found');
    }
    
    // Click the connect button
    console.log('Clicking connect button...');
    await page.click(buttonSelector);
    
    // Verify the button was clicked by checking for visual changes or state changes
    await page.waitForTimeout(500);
    
    // Check if button text or state changed after click
    const buttonTextAfterClick = await page.textContent(buttonSelector);
    console.log(`Button text after click: "${buttonTextAfterClick?.trim() || 'empty'}"`);
    
    // Check if button is disabled after click (which often happens during connection)
    const isDisabledAfterClick = await page.evaluate((selector) => {
      const button = document.querySelector(selector) as HTMLButtonElement;
      return button ? button.disabled : false;
    }, buttonSelector);
    
    console.log(`Button disabled after click: ${isDisabledAfterClick}`);
    console.log('Clicked connect button');
    
    // Add a small delay to allow the connection process to start
    await page.waitForTimeout(2000);
    
    // Check for any error messages that might appear immediately
    const errorMessages = await page.$$eval('div, p, span', elements => 
      elements.filter(el => 
        el.textContent && 
        (el.textContent.includes('error') || 
         el.textContent.includes('failed') || 
         el.textContent.includes('disconnected'))
      ).map(el => el.textContent)
    );
    
    if (errorMessages.length > 0) {
      console.log('Found potential error messages after connection attempt:', errorMessages);
    }
    
    // Take a screenshot after connection initiation
    await page.screenshot({ path: `after-connection-initiation-${Date.now()}.png` });
    
    // Check console logs for any WebRTC errors
    const logs = await page.evaluate(() => {
      // @ts-ignore - This is executed in the browser context
      return window.consoleMessages ? window.consoleMessages.filter(msg => 
        msg.includes('WebRTC') || 
        msg.includes('connection') || 
        msg.includes('peer') || 
        msg.includes('error') || 
        msg.includes('failed')
      ) : [];
    });
    
    if (logs.length > 0) {
      console.log('Relevant console logs after connection initiation:');
      logs.forEach(log => console.log(`- ${log}`));
    }
    
  } catch (error) {
    console.error('Failed to initiate connection:', error);
    await page.screenshot({ path: `connection-initiation-failed-${Date.now()}.png` });
    
    // Try to stop the monitoring before throwing
    try {
      await page.evaluate(() => {
        // @ts-ignore - This is executed in the browser context
        if (window.stopWebRTCMonitor) {
          // @ts-ignore - This is executed in the browser context
          window.stopWebRTCMonitor();
        }
      });
    } catch (e) {
      console.log('Failed to stop WebRTC monitoring:', e);
    }
    
    throw error;
  }
}

/**
 * Wait for the WebRTC connection to be established
 */
export async function waitForConnectionEstablished(page: Page, maxWaitTimeMs = 15000): Promise<void> {
  console.log('Waiting for WebRTC connection to be established...');
  
  // Take a screenshot before waiting
  await page.screenshot({ path: `before-connection-wait-${Date.now()}.png` });
  
  // Check WebRTC connection state via browser console
  try {
    // Inject a script to check WebRTC connection state
    await page.evaluate(() => {
      // Define types for browser context
      interface ExtendedWindow extends Window {
        checkWebRTCState?: () => Record<string, any>;
      }
      
      // Define a more comprehensive interface for React elements with various internal properties
      interface ReactElement extends Element {
        _reactInternals?: { memoizedProps?: any };
        // Add other possible React internal properties
        // Use optional properties to avoid TypeScript errors
        _reactInternalInstance?: { memoizedProps?: any };
        __reactInternalInstance?: { memoizedProps?: any };
        __reactFiber?: { memoizedProps?: any };
      }
      
      // Define a type that represents the WebRTC peer connection with its state properties
      // We use type instead of interface to avoid the extension errors
      type RTCPeerConnectionWithState = RTCPeerConnection & {
        connectionState: RTCPeerConnectionState;
        iceConnectionState: RTCIceConnectionState;
        iceGatheringState: RTCIceGatheringState;
        signalingState: RTCSignalingState;
        dataChannel?: { readyState: string };
      };
      
      // Cast window to our extended interface
      const win = window as unknown as ExtendedWindow;
      
      win.checkWebRTCState = () => {
        const states: Record<string, any> = {};
        
        // Try multiple ways to find peer connections in React components
        const findPeerComponents = () => {
          return Array.from(document.querySelectorAll('*'))
            .filter(el => {
              try {
                const reactEl = el as ReactElement;
                return reactEl._reactInternals || 
                       reactEl._reactInternalInstance || 
                       reactEl.__reactInternalInstance || 
                       reactEl.__reactFiber;
              } catch (e) {
                return false;
              }
            }) as ReactElement[];
        };
        
        // Get WebRTC state history if available
        // @ts-ignore - Browser context
        const stateHistory = window.webRTCStateHistory || [];
        if (stateHistory.length > 0) {
          states.historyEntries = stateHistory.length;
          states.lastHistoryEntry = stateHistory[stateHistory.length - 1];
        }
        
        // Check for React components with P2P properties
        const components = findPeerComponents();
        states.reactComponentsCount = components.length;
        
        // Count components with potential P2P properties
        const p2pComponents = components.filter(comp => {
          try {
            const props = comp._reactInternals?.memoizedProps || 
                          comp._reactInternalInstance?.memoizedProps || 
                          comp.__reactInternalInstance?.memoizedProps || 
                          comp.__reactFiber?.memoizedProps;
            
            return props && (
              props.peer || 
              props.connection || 
              props.webrtc || 
              props.rtc || 
              props.p2p ||
              (typeof props.children === 'object' && props.children?.props?.peer)
            );
          } catch (e) {
            return false;
          }
        });
        
        states.potentialP2PComponentsCount = p2pComponents.length;
        
        // Try to extract peer connections from various React prop structures
        const peerConnections: RTCPeerConnectionWithState[] = [];
        components.forEach(comp => {
          try {
            const props = comp._reactInternals?.memoizedProps || 
                          comp._reactInternalInstance?.memoizedProps || 
                          comp.__reactInternalInstance?.memoizedProps || 
                          comp.__reactFiber?.memoizedProps;
            
            if (props?.peer?.pc) {
              peerConnections.push(props.peer.pc as RTCPeerConnectionWithState);
              // Also capture data channel state if available
              if (props.peer.ch) {
                states.dataChannelState = props.peer.ch.readyState;
              }
              
              // Capture peer object details
              states.peerObjectKeys = Object.keys(props.peer);
            }
          } catch (e) {
            // Ignore errors for individual components
          }
        });
        
        states.peerConnectionsCount = peerConnections.length;
        
        if (peerConnections.length > 0) {
          const pc = peerConnections[0];
          states.connectionState = pc.connectionState;
          states.iceConnectionState = pc.iceConnectionState;
          states.iceGatheringState = pc.iceGatheringState;
          states.signalingState = pc.signalingState;
          states.hasLocalDescription = !!pc.localDescription;
          states.hasRemoteDescription = !!pc.remoteDescription;
          states.localDescriptionType = pc.localDescription?.type || 'none';
          states.remoteDescriptionType = pc.remoteDescription?.type || 'none';
          
          // Don't overwrite dataChannelState if we already found it
          if (!states.dataChannelState) {
            // Try to find data channel through various paths
            const dataChannel = pc.dataChannel || 
                               (pc as any).dataChannel || 
                               (pc as any)._dataChannel;
            if (dataChannel) {
              states.dataChannelState = dataChannel.readyState;
            }
          }
          
          // Check for ICE candidates
          if (pc.localDescription && pc.localDescription.sdp) {
            const iceCandidates = pc.localDescription.sdp
              .split('\n')
              .filter(line => line.startsWith('a=candidate:'));
            states.localIceCandidatesCount = iceCandidates.length;
            if (iceCandidates.length > 0) {
              states.sampleLocalIceCandidate = iceCandidates[0];
            }
          }
          
          return states;
        }
        
        // If we have history but no current connections, include that info
        if (stateHistory.length > 0) {
          return {
            ...states,
            error: 'No active peer connections found, but connection history exists'
          };
        }
        
        return { 
          ...states,
          error: 'No peer connections found' 
        };
      };
    });
    
    console.log('Injected WebRTC state check script');
  } catch (e) {
    console.log('Failed to inject WebRTC state check script:', e);
  }
  
  const startTime = Date.now();
  let connectionEstablished = false;
  
  try {
    // Check for various UI elements that indicate a successful connection
    const possibleSuccessIndicators = [
      // Message input being enabled
      'textarea:not([disabled])',
      // Any element containing connection status text
      'text=Connected',
      'text=Connection established',
      // The chat message container being visible
      'section div[style*="background"]'
    ];
    
    console.log('Looking for connection success indicators...');
    
    // Keep checking until we find a success indicator or timeout
    while (!connectionEstablished && (Date.now() - startTime) < maxWaitTimeMs) {
      // Try each UI indicator
      for (const selector of possibleSuccessIndicators) {
        try {
          console.log(`Checking for selector: ${selector}`);
          const isVisible = await page.isVisible(selector, { timeout: 1000 });
          if (isVisible) {
            console.log(`Found connection indicator: ${selector}`);
            connectionEstablished = true;
            break;
          }
        } catch (e) {
          // Continue to the next indicator
        }
      }
      
      if (connectionEstablished) break;
      
      // Check WebRTC state via console
      try {
        const rtcState = await page.evaluate(() => {
          // @ts-ignore - This is executed in the browser context
          return window.checkWebRTCState ? window.checkWebRTCState() : { error: 'Check function not available' };
        });
        
        console.log('Current WebRTC state:', JSON.stringify(rtcState));
        
        // Consider connection established if in good states
        if (rtcState.connectionState === 'connected' || 
            rtcState.iceConnectionState === 'connected' || 
            rtcState.iceConnectionState === 'completed' || 
            rtcState.dataChannelState === 'open') {
          console.log('WebRTC connection appears to be established based on connection state');
          connectionEstablished = true;
          break;
        }
        
        // Also check if we have any peer connections at all, which might indicate progress
        if (rtcState.connectionState || rtcState.iceConnectionState) {
          console.log('WebRTC peer connection exists, continuing to wait for connected state');
        }
      } catch (e) {
        console.log('Error checking WebRTC state:', e);
      }
      
      // Wait a bit before checking again
      await page.waitForTimeout(1000);
      
      // Take a progress screenshot every few seconds
      if ((Date.now() - startTime) % 5000 < 1000) {
        await page.screenshot({ path: `connection-progress-${Date.now()}.png` });
      }
    }
    
    if (connectionEstablished) {
      console.log('Connection established successfully!');
      await page.screenshot({ path: `connection-success-${Date.now()}.png` });
      return;
    }
    
    throw new Error(`Connection not established after ${maxWaitTimeMs}ms`);
  } catch (error) {
    console.error('Connection establishment timed out or failed:', error);
    
    // Log the current page state
    console.log('Current page state:');
    const html = await page.content();
    console.log(html.substring(0, 500) + '...');
    
    // Take a screenshot to help debug
    await page.screenshot({ path: `connection-failed-${Date.now()}.png` });
    
    // Check if there are any error messages on the page
    const errorTexts = await page.$$eval('div, p, span', elements => 
      elements.filter(el => 
        el.textContent && 
        (el.textContent.includes('error') || 
         el.textContent.includes('failed') || 
         el.textContent.includes('disconnected'))
      ).map(el => el.textContent)
    );
    
    if (errorTexts.length > 0) {
      console.log('Found potential error messages on page:', errorTexts);
    }
    
    // Try to get WebRTC state one last time
    try {
      const finalRtcState = await page.evaluate(() => {
        // @ts-ignore - This is executed in the browser context
        return window.checkWebRTCState ? window.checkWebRTCState() : { error: 'Check function not available' };
      });
      console.log('Final WebRTC state before failure:', JSON.stringify(finalRtcState));
    } catch (e) {
      console.log('Could not get final WebRTC state:', e);
    }
    
    throw error;
  }
}
