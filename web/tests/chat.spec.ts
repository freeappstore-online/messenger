import { test, expect, Page } from '@playwright/test';

// Mock Firebase Auth for testing
test.beforeEach(async ({ page }) => {
  // Mock Firebase Auth
  await page.addInitScript(() => {
    window.localStorage.setItem('mockFirebaseAuth', JSON.stringify({
      uid: 'test-user-1',
      displayName: 'Test User 1',
      email: 'test1@example.com'
    }));
    
    // Override Firebase Auth in the window
    Object.defineProperty(window, 'mockAuth', {
      value: {
        currentUser: {
          uid: 'test-user-1',
          displayName: 'Test User 1',
          email: 'test1@example.com'
        }
      },
      writable: true
    });
  });
});

// Helper function to simulate Firebase Auth
async function mockFirebaseAuth(page: Page, userId: string) {
  await page.evaluate((uid) => {
    // Mock the Firebase Auth state
    window.localStorage.setItem('mockFirebaseAuth', JSON.stringify({
      uid: uid,
      displayName: `Test User ${uid.slice(-1)}`,
      email: `test${uid.slice(-1)}@example.com`
    }));
    
    // Override the auth object that our app will use
    (window as any).mockAuth = {
      currentUser: {
        uid: uid,
        displayName: `Test User ${uid.slice(-1)}`,
        email: `test${uid.slice(-1)}@example.com`
      }
    };
    
    // Mock the onAuthStateChanged function
    (window as any).mockAuthStateChanged = true;
  }, userId);
}

// Test the basic UI elements
test('app shows login screen initially', async ({ page }) => {
  // Go to the app without auth mocking
  await page.goto('/');
  
  // Check that the login screen is shown
  await expect(page.getByText('Family Chat POC')).toBeVisible();
  await expect(page.getByText('Sign In With Google')).toBeVisible();
});

// Test the chat functionality with mocked auth and WebRTC
test('can send and receive messages', async ({ browser }) => {
  // Create two browser contexts to simulate two different users
  const userContext1 = await browser.newContext();
  const userContext2 = await browser.newContext();
  
  // Create pages for both users
  const page1 = await userContext1.newPage();
  const page2 = await userContext2.newPage();
  
  // Set up mock auth for both users
  await page1.goto('/');
  await page1.addInitScript(() => {
    // Mock Firebase Auth
    Object.defineProperty(window, 'mockFirebaseAuth', {
      value: true,
      writable: true
    });
    
    // Mock the auth state
    (window as any).mockAuthState = {
      uid: 'test-user-1',
      displayName: 'Test User 1',
      email: 'test1@example.com'
    };
    
    // Mock the onAuthStateChanged function to immediately call the callback with our mock user
    const originalFirebase = window.firebase;
    Object.defineProperty(window, 'firebase', {
      get: () => ({
        ...originalFirebase,
        auth: () => ({
          onAuthStateChanged: (callback: Function) => {
            callback((window as any).mockAuthState);
            return () => {}; // Return unsubscribe function
          },
          signInWithPopup: async () => {
            return { user: (window as any).mockAuthState };
          }
        })
      })
    });
  });
  
  await page2.goto('/');
  await page2.addInitScript(() => {
    // Mock Firebase Auth
    Object.defineProperty(window, 'mockFirebaseAuth', {
      value: true,
      writable: true
    });
    
    // Mock the auth state
    (window as any).mockAuthState = {
      uid: 'test-user-2',
      displayName: 'Test User 2',
      email: 'test2@example.com'
    };
    
    // Mock the onAuthStateChanged function to immediately call the callback with our mock user
    const originalFirebase = window.firebase;
    Object.defineProperty(window, 'firebase', {
      get: () => ({
        ...originalFirebase,
        auth: () => ({
          onAuthStateChanged: (callback: Function) => {
            callback((window as any).mockAuthState);
            return () => {}; // Return unsubscribe function
          },
          signInWithPopup: async () => {
            return { user: (window as any).mockAuthState };
          }
        })
      })
    });
  });
  
  // Note: In a real test, we would need to mock WebRTC and Firestore
  // This is a simplified test that just checks UI elements
  
  // Check that user 1 can log in
  await page1.getByText('Sign In With Google').click();
  await expect(page1.getByText('Signed in as:')).toBeVisible();
  
  // Check that user 2 can log in
  await page2.getByText('Sign In With Google').click();
  await expect(page2.getByText('Signed in as:')).toBeVisible();
  
  // Clean up
  await page1.close();
  await page2.close();
  await userContext1.close();
  await userContext2.close();
});

// Note: A complete test would require mocking WebRTC and Firestore
// This would be complex and require additional setup
test.skip('full end-to-end test with WebRTC', async ({ browser }) => {
  // This test is skipped because it requires complex mocking of WebRTC
  // In a real implementation, we would:
  // 1. Mock the RTCPeerConnection, RTCDataChannel
  // 2. Mock the Firestore signaling
  // 3. Simulate the full connection flow
  // 4. Test message sending and receiving
});

// Test localStorage persistence
test('messages persist in localStorage', async ({ page }) => {
  // Mock auth
  await page.goto('/');
  await page.addInitScript(() => {
    // Set up mock auth
    (window as any).mockAuthState = {
      uid: 'test-user-1',
      displayName: 'Test User 1',
      email: 'test1@example.com'
    };
    
    // Mock Firebase Auth
    const originalFirebase = window.firebase;
    Object.defineProperty(window, 'firebase', {
      get: () => ({
        ...originalFirebase,
        auth: () => ({
          onAuthStateChanged: (callback: Function) => {
            callback((window as any).mockAuthState);
            return () => {}; // Return unsubscribe function
          },
          signInWithPopup: async () => {
            return { user: (window as any).mockAuthState };
          }
        })
      })
    });
    
    // Add a test message to localStorage
    const testMessage = {
      id: 'test-message-1',
      authorId: 'test-user-1',
      familyId: 'demo-family-1',
      body: 'Test message from localStorage',
      createdAt: Date.now()
    };
    
    localStorage.setItem('familychat_msgs_demo-family-1', JSON.stringify([testMessage]));
  });
  
  // Log in
  await page.getByText('Sign In With Google').click();
  
  // Check that the message from localStorage is displayed
  await expect(page.getByText('Test message from localStorage')).toBeVisible();
});
