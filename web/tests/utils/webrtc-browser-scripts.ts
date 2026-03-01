/**
 * Browser-context scripts for monitoring and checking WebRTC state
 */

import { Page } from '@playwright/test';
import { ExtendedWindow, ReactElement, RTCPeerConnectionWithState } from './webrtc-types';

/**
 * Initialize console message capture in the browser context
 */
export async function initializeConsoleCapture(page: Page): Promise<void> {
  await page.evaluate(() => {
    // Initialize console message capture
    const win = window as unknown as ExtendedWindow;
    win.consoleMessages = [];
    
    // Store original console methods
    const originalConsoleLog = console.log;
    const originalConsoleError = console.error;
    const originalConsoleWarn = console.warn;
    
    // Override console methods to capture messages
    console.log = (...args: any[]) => {
      const message = args.map(arg => 
        typeof arg === 'object' ? JSON.stringify(arg) : String(arg)
      ).join(' ');
      win.consoleMessages?.push(message);
      originalConsoleLog.apply(console, args);
    };
    
    console.error = (...args: any[]) => {
      const message = args.map(arg => 
        typeof arg === 'object' ? JSON.stringify(arg) : String(arg)
      ).join(' ');
      win.consoleMessages?.push(`ERROR: ${message}`);
      originalConsoleError.apply(console, args);
    };
    
    console.warn = (...args: any[]) => {
      const message = args.map(arg => 
        typeof arg === 'object' ? JSON.stringify(arg) : String(arg)
      ).join(' ');
      win.consoleMessages?.push(`WARN: ${message}`);
      originalConsoleWarn.apply(console, args);
    };
    
    console.log('Console message capture initialized');
  });
}

/**
 * Injects the WebRTC monitoring script into the browser context
 */
/**
 * Injects a global WebRTC connection tracker
 */
export async function injectGlobalWebRTCTracker(page: Page): Promise<void> {
  await page.evaluate(() => {
    console.log('Injecting global WebRTC connection tracker');
    
    // Store original RTCPeerConnection constructor
    // @ts-ignore - Browser context
    const originalRTCPeerConnection = window.RTCPeerConnection;
    
    // Create a global array to track all peer connections
    // Extend Window interface in the browser context
    interface ExtendedWindowWithTracker extends Window {
      _rtcPeerConnections: RTCPeerConnection[];
    }
    
    // Cast window to our extended interface with tracker
    const extWindow = window as unknown as ExtendedWindowWithTracker;
    extWindow._rtcPeerConnections = [];
    
    // Override RTCPeerConnection constructor to track instances
    // @ts-ignore - Browser context
    window.RTCPeerConnection = function(...args) {
      console.log('New RTCPeerConnection created with args:', JSON.stringify(args));
      
      // Create the peer connection using the original constructor
      const pc = new originalRTCPeerConnection(...args);
      
      // Add connection state change listener
      pc.addEventListener('connectionstatechange', () => {
        console.log(`RTCPeerConnection state changed to: ${pc.connectionState}`);
      });
      
      // Add ice connection state change listener
      pc.addEventListener('iceconnectionstatechange', () => {
        console.log(`RTCPeerConnection ICE state changed to: ${pc.iceConnectionState}`);
      });
      
      // Add signaling state change listener
      pc.addEventListener('signalingstatechange', () => {
        console.log(`RTCPeerConnection signaling state changed to: ${pc.signalingState}`);
      });
      
      // Track data channel events
      pc.addEventListener('datachannel', (event) => {
        console.log('Data channel received:', event.channel.label);
      });
      
      // Add to our tracking array
      extWindow._rtcPeerConnections.push(pc);
      
      console.log(`RTCPeerConnection created. Total connections: ${extWindow._rtcPeerConnections.length}`);
      return pc;
    };
    
    // Copy prototype properties from original RTCPeerConnection
    for (const prop in originalRTCPeerConnection) {
      // @ts-ignore - Browser context
      if (!(prop in window.RTCPeerConnection)) {
        // @ts-ignore - Browser context
        window.RTCPeerConnection[prop] = originalRTCPeerConnection[prop];
      }
    }
    
    // Copy prototype
    // @ts-ignore - Browser context
    window.RTCPeerConnection.prototype = originalRTCPeerConnection.prototype;
    
    console.log('Global WebRTC connection tracker injected');
  });
}

/**
 * Injects the WebRTC monitoring script into the browser context
 */
export async function injectWebRTCMonitoringScript(page: Page): Promise<void> {
  await page.evaluate(() => {
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
        
        // Get React DevTools global hook if available
        // @ts-ignore - Browser context
        const hook = window.__REACT_DEVTOOLS_GLOBAL_HOOK__;
        if (hook) {
          console.log('React DevTools hook found, using it to find components');
          try {
            // Get React Fiber root nodes
            const roots = Array.from(hook.getFiberRoots(1) || []);
            console.log(`Found ${roots.length} React Fiber roots`);
            
            if (roots.length > 0) {
              // Extract all components from fiber tree
              const components: ReactElement[] = [];
              
              // Walk the fiber tree to find all components
              const walkFiber = (fiber: any) => {
                if (!fiber) return;
                
                // Check if this fiber has a stateNode (DOM element)
                if (fiber.stateNode && fiber.stateNode instanceof HTMLElement) {
                  components.push(fiber.stateNode as ReactElement);
                }
                
                // Walk child fibers
                if (fiber.child) walkFiber(fiber.child);
                
                // Walk sibling fibers
                if (fiber.sibling) walkFiber(fiber.sibling);
              };
              
              // Start walking from each root
              roots.forEach((root: any) => {
                if (root && typeof root === 'object' && root.current) {
                  walkFiber(root.current);
                }
              });
              
              console.log(`Found ${components.length} React components via Fiber tree`);
              return components;
            }
          } catch (e) {
            console.error('Error using React DevTools hook:', e);
          }
        }
        
        // Fallback to traditional method if DevTools hook doesn't work
        console.log('Using traditional method to find React components');
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
          
          // Check if a component has a peer connection
          const hasPeerConnection = (component: any): boolean => {
            try {
              console.log('Checking component for peer connection:', component.tagName || 'Unknown');
              
              // Check component props and state for RTCPeerConnection instances
              const checkObject = (obj: any, depth = 0, path = ''): boolean => {
                if (!obj || typeof obj !== 'object' || depth > 3) return false; // Limit recursion depth
                
                // Direct check for RTCPeerConnection
                if (obj instanceof RTCPeerConnection) {
                  console.log(`Found RTCPeerConnection at path: ${path}`);
                  return true;
                }
                
                // Check for common property names that might hold peer connection
                const peerProps = ['peerConnection', 'pc', 'rtcPeerConnection', 'webrtcPeer', 'connection'];
                for (const prop of peerProps) {
                  if (obj[prop] instanceof RTCPeerConnection) {
                    console.log(`Found RTCPeerConnection at path: ${path}.${prop}`);
                    return true;
                  }
                }
                
                // Check for useP2P hook state
                if (obj.p2pState || obj.p2p || obj.webrtc || obj.rtc) {
                  const potentialState = obj.p2pState || obj.p2p || obj.webrtc || obj.rtc;
                  if (checkObject(potentialState, depth + 1, `${path}.(p2pState|p2p|webrtc|rtc)`)) {
                    return true;
                  }
                }
                
                // Recursively check object properties (limited depth)
                for (const key in obj) {
                  // Skip React internal properties and functions
                  if (key.startsWith('_') || key.startsWith('__') || typeof obj[key] === 'function') {
                    continue;
                  }
                  
                  if (obj[key] && typeof obj[key] === 'object') {
                    if (obj[key] instanceof RTCPeerConnection) {
                      console.log(`Found RTCPeerConnection at path: ${path}.${key}`);
                      return true;
                    }
                    
                    // Recursively check deeper
                    if (checkObject(obj[key], depth + 1, `${path}.${key}`)) {
                      return true;
                    }
                  }
                }
                
                return false;
              };
              
              // Check for global RTCPeerConnection instances
              // @ts-ignore - Browser context
              if (window._rtcPeerConnections && window._rtcPeerConnections.length > 0) {
                console.log('Found global RTCPeerConnection instances');
                return true;
              }
              
              // Check component's fiber for peer connection
              const fiber = component._reactInternalInstance || 
                           component._reactInternals || 
                           component.__reactInternalInstance || 
                           component.__reactFiber;
              
              if (fiber) {
                console.log('Checking React fiber for peer connection');
                // Check memoizedState and props
                if (fiber.memoizedState && checkObject(fiber.memoizedState, 0, 'fiber.memoizedState')) return true;
                if (fiber.memoizedProps && checkObject(fiber.memoizedProps, 0, 'fiber.memoizedProps')) return true;
                
                // Check hooks
                if (fiber.memoizedState && fiber.memoizedState.memoizedState) {
                  if (checkObject(fiber.memoizedState.memoizedState, 0, 'fiber.memoizedState.memoizedState')) return true;
                }
                
                // Check stateNode (class component instance)
                if (fiber.stateNode && fiber.stateNode !== component) {
                  if (checkObject(fiber.stateNode, 0, 'fiber.stateNode')) return true;
                  
                  // Check for state and props on class component
                  if (fiber.stateNode.state && checkObject(fiber.stateNode.state, 0, 'fiber.stateNode.state')) return true;
                  if (fiber.stateNode.props && checkObject(fiber.stateNode.props, 0, 'fiber.stateNode.props')) return true;
                }
              }
              
              return false;
            } catch (e) {
              console.error('Error checking for peer connection:', e);
              return false;
            }
          };
          
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
                    .split('\\n')
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
          // Note: dataChannel is not a standard property of RTCPeerConnection
          // We're checking for custom properties that might exist in the app's implementation
          const dataChannel = (pc as any).dataChannel || 
                             (pc as any)._dataChannel || 
                             (pc as any).channel;
          if (dataChannel) {
            states.dataChannelState = dataChannel.readyState;
          }
        }
        
        // Check for ICE candidates
        if (pc.localDescription && pc.localDescription.sdp) {
          const iceCandidates = pc.localDescription.sdp
            .split('\\n')
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
}

/**
 * Starts WebRTC connection monitoring in the browser
 */
export async function startWebRTCMonitoring(page: Page): Promise<void> {
  await page.evaluate(() => {
    // @ts-ignore - This is executed in the browser context
    if (window.monitorWebRTCConnection) {
      // @ts-ignore - This is executed in the browser context
      window.stopWebRTCMonitor = window.monitorWebRTCConnection();
    }
  });
}

/**
 * Stops WebRTC connection monitoring in the browser
 */
export async function stopWebRTCMonitoring(page: Page): Promise<void> {
  await page.evaluate(() => {
    // @ts-ignore - This is executed in the browser context
    if (window.stopWebRTCMonitor) {
      // @ts-ignore - This is executed in the browser context
      window.stopWebRTCMonitor();
    }
  });
}

/**
 * Gets the current WebRTC state from the browser
 */
export async function getWebRTCState(page: Page): Promise<Record<string, any>> {
  return await page.evaluate(() => {
    // @ts-ignore - This is executed in the browser context
    if (window.checkWebRTCState) {
      // @ts-ignore - This is executed in the browser context
      return window.checkWebRTCState();
    }
    return { error: 'WebRTC state check function not available' };
  });
}
