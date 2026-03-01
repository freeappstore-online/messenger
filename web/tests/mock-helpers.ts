import { Page } from '@playwright/test';

// Helper to mock Firebase Auth
export async function mockFirebaseAuth(page: Page, userId: string) {
  await page.addInitScript(({ uid }) => {
    // Create a mock user
    const mockUser = {
      uid,
      displayName: `Test User ${uid}`,
      email: `test-${uid}@example.com`,
    };

    // Mock Firebase Auth
    window.localStorage.setItem('firebase:authUser:AIzaSyBZI2zq9o0AcVcHK8tlZg2iPg4Jr7AF8gM:[DEFAULT]', 
      JSON.stringify(mockUser));

    // Mock the Firebase Auth module
    Object.defineProperty(window, 'mockFirebaseAuth', {
      value: {
        currentUser: mockUser,
        onAuthStateChanged: (callback: (user: any) => void) => {
          setTimeout(() => callback(mockUser), 0);
          return () => {}; // Unsubscribe function
        },
        signInWithPopup: async () => ({ user: mockUser }),
      },
      writable: true,
    });

    // Intercept Firebase Auth imports
    const originalImport = window.require;
    window.require = function(module: string) {
      if (module === 'firebase/auth') {
        return {
          getAuth: () => window.mockFirebaseAuth,
          onAuthStateChanged: (auth: any, callback: (user: any) => void) => {
            setTimeout(() => callback(mockUser), 0);
            return () => {}; // Unsubscribe function
          },
          signInWithPopup: async () => ({ user: mockUser }),
          GoogleAuthProvider: class GoogleAuthProvider {}
        };
      }
      return originalImport ? originalImport(module) : {};
    };
  }, { uid: userId });
}

// Helper to mock WebRTC connections
export async function mockWebRTC(page: Page) {
  await page.addInitScript(() => {
    // Store original RTCPeerConnection
    const originalRTCPeerConnection = window.RTCPeerConnection;
    
    // Mock RTCPeerConnection
    window.RTCPeerConnection = class MockRTCPeerConnection {
      private listeners: Record<string, Function[]> = {};
      private mockDataChannel: any = null;
      private mockIceCandidate = { candidate: 'mock-ice-candidate' };
      
      constructor() {
        setTimeout(() => {
          // Simulate ICE candidate
          this.dispatchEvent('icecandidate', { candidate: this.mockIceCandidate });
        }, 100);
      }

      addEventListener(event: string, callback: Function) {
        if (!this.listeners[event]) {
          this.listeners[event] = [];
        }
        this.listeners[event].push(callback);
      }

      dispatchEvent(event: string, data: any) {
        if (this.listeners[event]) {
          this.listeners[event].forEach(callback => callback(data));
        }
      }

      createDataChannel(label: string) {
        this.mockDataChannel = {
          label,
          readyState: 'connecting',
          send: (data: any) => {
            // Simulate message sending
            setTimeout(() => {
              // Broadcast to all mock connections
              if (window.mockRTCConnections) {
                window.mockRTCConnections.forEach((conn: any) => {
                  if (conn !== this && conn.mockDataChannel) {
                    const event = new MessageEvent('message', { data });
                    conn.mockDataChannel.dispatchEvent('message', event);
                  }
                });
              }
            }, 50);
          },
          addEventListener: (event: string, callback: Function) => {
            if (!this.mockDataChannel.listeners) {
              this.mockDataChannel.listeners = {};
            }
            if (!this.mockDataChannel.listeners[event]) {
              this.mockDataChannel.listeners[event] = [];
            }
            this.mockDataChannel.listeners[event].push(callback);
          },
          dispatchEvent: (event: string, data: any) => {
            if (this.mockDataChannel.listeners && this.mockDataChannel.listeners[event]) {
              this.mockDataChannel.listeners[event].forEach((callback: Function) => callback(data));
            }
          }
        };
        
        // Simulate connection after a delay
        setTimeout(() => {
          this.mockDataChannel.readyState = 'open';
          if (this.mockDataChannel.listeners && this.mockDataChannel.listeners['open']) {
            this.mockDataChannel.listeners['open'].forEach((callback: Function) => callback());
          }
        }, 200);
        
        return this.mockDataChannel;
      }

      async createOffer() {
        return { type: 'offer', sdp: 'mock-sdp-offer' };
      }

      async createAnswer() {
        return { type: 'answer', sdp: 'mock-sdp-answer' };
      }

      async setLocalDescription(desc: any) {
        // No-op for mock
      }

      async setRemoteDescription(desc: any) {
        // Simulate remote data channel if this is an offer
        if (desc.type === 'offer') {
          setTimeout(() => {
            this.dispatchEvent('datachannel', { 
              channel: {
                binaryType: 'arraybuffer',
                readyState: 'open',
                addEventListener: (event: string, callback: Function) => {
                  if (!this.mockDataChannel) {
                    this.mockDataChannel = {
                      listeners: {}
                    };
                  }
                  if (!this.mockDataChannel.listeners) {
                    this.mockDataChannel.listeners = {};
                  }
                  if (!this.mockDataChannel.listeners[event]) {
                    this.mockDataChannel.listeners[event] = [];
                  }
                  this.mockDataChannel.listeners[event].push(callback);
                },
                send: (data: any) => {
                  // Simulate message sending
                  setTimeout(() => {
                    // Broadcast to all mock connections
                    if (window.mockRTCConnections) {
                      window.mockRTCConnections.forEach((conn: any) => {
                        if (conn !== this && conn.mockDataChannel) {
                          const event = new MessageEvent('message', { data });
                          conn.mockDataChannel.dispatchEvent('message', event);
                        }
                      });
                    }
                  }, 50);
                }
              }
            });
          }, 150);
        }
      }

      async addIceCandidate(candidate: any) {
        // No-op for mock
      }

      get onicecandidate() {
        return null;
      }

      set onicecandidate(callback: any) {
        this.addEventListener('icecandidate', callback);
      }

      get ondatachannel() {
        return null;
      }

      set ondatachannel(callback: any) {
        this.addEventListener('datachannel', callback);
      }
    };

    // Store all mock connections to simulate peer-to-peer
    window.mockRTCConnections = [];
    const originalRTCPeerConnectionConstructor = window.RTCPeerConnection;
    window.RTCPeerConnection = function(...args: any[]) {
      const conn = new originalRTCPeerConnectionConstructor(...args);
      window.mockRTCConnections.push(conn);
      return conn;
    };
  });
}

// Helper to mock Firestore
export async function mockFirestore(page: Page) {
  await page.addInitScript(() => {
    // Create a simple in-memory database
    const mockDb = {
      collections: {},
      docs: {},
      
      // Add a document to a collection
      addDoc: async (path: string, data: any) => {
        const id = `doc-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
        if (!mockDb.collections[path]) {
          mockDb.collections[path] = {};
        }
        mockDb.collections[path][id] = { ...data, id };
        mockDb.docs[`${path}/${id}`] = { ...data, id };
        
        // Trigger any listeners
        if (mockDb.listeners && mockDb.listeners[path]) {
          mockDb.listeners[path].forEach((callback: Function) => {
            callback({
              docs: Object.entries(mockDb.collections[path]).map(([id, data]) => ({
                id,
                data: () => data,
                exists: () => true
              }))
            });
          });
        }
        
        return { id };
      },
      
      // Set a document at a specific path
      setDoc: async (path: string, data: any) => {
        const pathParts = path.split('/');
        const id = pathParts.pop();
        const collectionPath = pathParts.join('/');
        
        if (!mockDb.collections[collectionPath]) {
          mockDb.collections[collectionPath] = {};
        }
        mockDb.collections[collectionPath][id] = data;
        mockDb.docs[path] = data;
        
        // Trigger any listeners
        if (mockDb.listeners && mockDb.listeners[path]) {
          mockDb.listeners[path].forEach((callback: Function) => {
            callback({
              data: () => data,
              exists: () => true
            });
          });
        }
      },
      
      // Delete a document
      deleteDoc: async (path: string) => {
        const pathParts = path.split('/');
        const id = pathParts.pop();
        const collectionPath = pathParts.join('/');
        
        if (mockDb.collections[collectionPath] && mockDb.collections[collectionPath][id]) {
          delete mockDb.collections[collectionPath][id];
        }
        
        if (mockDb.docs[path]) {
          delete mockDb.docs[path];
        }
        
        // Trigger any listeners
        if (mockDb.listeners && mockDb.listeners[path]) {
          mockDb.listeners[path].forEach((callback: Function) => {
            callback({
              exists: () => false
            });
          });
        }
      },
      
      // Listen to a document
      onSnapshot: (path: string, callback: Function) => {
        if (!mockDb.listeners) {
          mockDb.listeners = {};
        }
        
        if (!mockDb.listeners[path]) {
          mockDb.listeners[path] = [];
        }
        
        mockDb.listeners[path].push(callback);
        
        // Initial callback
        if (path.includes('/')) {
          // Document path
          const doc = mockDb.docs[path];
          callback({
            data: () => doc,
            exists: () => !!doc
          });
        } else {
          // Collection path
          const collection = mockDb.collections[path] || {};
          callback({
            docs: Object.entries(collection).map(([id, data]) => ({
              id,
              data: () => data,
              exists: () => true
            }))
          });
        }
        
        // Return unsubscribe function
        return () => {
          if (mockDb.listeners && mockDb.listeners[path]) {
            mockDb.listeners[path] = mockDb.listeners[path].filter(
              (cb: Function) => cb !== callback
            );
          }
        };
      }
    };
    
    // Mock Firestore module
    Object.defineProperty(window, 'mockFirestore', {
      value: mockDb,
      writable: true
    });
    
    // Intercept Firestore imports
    const originalImport = window.require;
    window.require = function(module: string) {
      if (module === 'firebase/firestore') {
        return {
          getFirestore: () => mockDb,
          doc: (db: any, path: string) => path,
          collection: (db: any, path: string) => path,
          setDoc: async (path: string, data: any) => mockDb.setDoc(path, data),
          addDoc: async (path: string, data: any) => mockDb.addDoc(path, data),
          deleteDoc: async (path: string) => mockDb.deleteDoc(path),
          onSnapshot: (path: string, callback: Function) => mockDb.onSnapshot(path, callback),
          getDocs: async (path: string) => {
            const collection = mockDb.collections[path] || {};
            return {
              docs: Object.entries(collection).map(([id, data]) => ({
                id,
                data: () => data,
                exists: () => true
              }))
            };
          }
        };
      }
      return originalImport ? originalImport(module) : {};
    };
  });
}
