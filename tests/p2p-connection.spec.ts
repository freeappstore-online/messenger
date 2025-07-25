import { test, expect, Page } from '@playwright/test';
// Import our utility functions
import { login, getUserId } from './utils/auth-helpers';
import { installPCTracker, waitForRTCConnected } from './utils/pc-tracker';
import { sendMessage, verifyMessageReceived } from './utils/message-helpers';

// Helper function to check if server is available
async function isServerAvailable(url: string): Promise<boolean> {
  try {
    const response = await fetch(url);
    return response.status === 200;
  } catch (e) {
    return false;
  }
}

// Setup console logging for debugging
function setupConsoleLogging(page: Page, label: string): void {
  page.on('console', msg => {
    console.log(`[${label} Console] ${msg.type()}: ${msg.text()}`);
  });
  
  page.on('pageerror', error => {
    console.error(`[${label} Error] ${error.message}`);
  });
  
  // Setup WebRTC logging
  page.evaluate(() => {
    // Store console messages for later retrieval
    // @ts-ignore - Browser context
    window.consoleMessages = [];
    // @ts-ignore - Browser context
    const originalConsoleLog = console.log;
    // @ts-ignore - Browser context
    console.log = function(...args) {
      // @ts-ignore - Browser context
      window.consoleMessages.push(args.join(' '));
      originalConsoleLog.apply(console, args);
    };
  }).catch(e => console.error('Failed to setup console logging:', e));
}

// Test for P2P connection between two browser contexts
test('Two users can connect via WebRTC and exchange messages', async ({ browser, baseURL }) => {
  // Allow up to 90 s while we stabilise tests
  test.setTimeout(90000);
  
  // Check if the server is available
  const serverUrl = baseURL || 'http://localhost:5173';
  const isAvailable = await isServerAvailable(serverUrl);
  
  if (!isAvailable) {
    console.log('Server is not available. Please start the development server with: npm run dev -- --host');
    test.skip();
    return;
  }
  
  // Test accounts
  const userA = { email: 'test1@user.com', password: 'testuser1', displayName: 'Test User 1' };
  const userB = { email: 'test2@user.com', password: 'testuser2', displayName: 'Test User 2' };
  
  // Create two independent contexts (separate storage) to allow distinct logins
  const userAContext = await browser.newContext({
    viewport: { width: 1280, height: 720 },
    userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
  });
    // Install PC tracker before any navigation on each context
  await installPCTracker(userAContext);
  
  const userBContext = await browser.newContext({
    viewport: { width: 1280, height: 720 },
    userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
  });
  await installPCTracker(userBContext);

  const userAPage = await userAContext.newPage();
  const userBPage = await userBContext.newPage();

  try {
    // Set up console logging for both pages
    setupConsoleLogging(userAPage, 'User A');
    setupConsoleLogging(userBPage, 'User B');

    // Navigate both users to the app using our improved navigation helper
    const appUrl = baseURL!;
    
    // Import the navigateToApp function from test-setup
    const { navigateToApp } = await import('./utils/test-setup');
    
    // Navigate both users to the app with retry logic and proper error handling
    await navigateToApp(userAPage, appUrl);
    await navigateToApp(userBPage, appUrl);
    
    // Take screenshots of initial state after successful navigation
    await userAPage.screenshot({ path: `screenshots/userA-initial-${Date.now()}.png` });
    await userBPage.screenshot({ path: `screenshots/userB-initial-${Date.now()}.png` });
    
    // Log in both users
    console.log('Logging in users...');
    await login(userAPage, userA.email, userA.password);
    await login(userBPage, userB.email, userB.password);
    
    // Get user IDs
    const userAId = await getUserId(userAPage);
    const userBId = await getUserId(userBPage);
    
    console.log(`User A ID: ${userAId}`);
    console.log(`User B ID: ${userBId}`);
    
    expect(userAId).toBeTruthy();
    expect(userBId).toBeTruthy();
    
    // Verify that the user IDs are different
    if (userAId === userBId) {
      console.error('ERROR: User A and User B have the same ID! This will prevent proper connection.');
    } else {
      console.log('User IDs are different, which is good for connection.');
    }
    
    // Take screenshots after login
    await userAPage.screenshot({ path: `screenshots/userA-after-login-${Date.now()}.png` });
    await userBPage.screenshot({ path: `screenshots/userB-after-login-${Date.now()}.png` });
    
    // Log the UI state before connection
    console.log('Checking UI state before connection...');
    
    // Check for connection UI elements on User A page
    const userAInputFields = await userAPage.$$('input');
    console.log(`User A page has ${userAInputFields.length} input fields`);
    
    const userAButtons = await userAPage.$$('button');
    console.log(`User A page has ${userAButtons.length} buttons`);
    
    // Check for any existing connection status
    const userAConnectionStatus = await userAPage.$$eval('div, p, span', elements => 
      elements.filter(el => 
        el.textContent && 
        (el.textContent.includes('Connected') || 
         el.textContent.includes('Connection') || 
         el.textContent.includes('Status'))
      ).map(el => el.textContent)
    );
    
    if (userAConnectionStatus.length > 0) {
      console.log('User A connection status elements found:', userAConnectionStatus);
    }
    
    // Connect peers using deterministic selectors
    await userAPage.fill('[data-testid="peer-id-input"]', userBId);
    await userAPage.click('[data-testid="connect-btn"]');

    // User B waits passively; only User A initiates the connection
    await userBPage.fill('[data-testid="peer-id-input"]', userAId);
    // No click on connect for User B to avoid simultaneous offers

    // Wait for WebRTC connection on both pages (data-channel open or pc connected)
    await Promise.all([
      waitForRTCConnected(userAPage, 45000),
      waitForRTCConnected(userBPage, 45000)
    ]);

    console.log('Connection established successfully on both sides!');
    
    // Take screenshots after connection
    await userAPage.screenshot({ path: `screenshots/userA-connected-${Date.now()}.png` });
    await userBPage.screenshot({ path: `screenshots/userB-connected-${Date.now()}.png` });
    
    // Wait a moment to ensure connection is stable
    await userAPage.waitForTimeout(2000);
    
    // Send a message from user A to user B
    const testMessage = 'Hello from User A!';
    console.log(`Sending message from User A: "${testMessage}"`);
    await sendMessage(userAPage, testMessage);
    
    // Verify user B received the message
    console.log('Verifying message received by User B...');
    await verifyMessageReceived(userBPage, testMessage);
    
    // Send a message from user B to user A
    const responseMessage = 'Hello back from User B!';
    console.log(`Sending message from User B: "${responseMessage}"`);
    await sendMessage(userBPage, responseMessage);
    
    // Verify user A received the message
    console.log('Verifying message received by User A...');
    await verifyMessageReceived(userAPage, responseMessage);
    
    // Take final screenshots
    await userAPage.screenshot({ path: `screenshots/userA-final-${Date.now()}.png` });
    await userBPage.screenshot({ path: `screenshots/userB-final-${Date.now()}.png` });
    
    console.log('Test passed: Two users successfully connected and exchanged messages');
  } catch (err) {
    console.error('Test failed:', err);
    await userAPage.screenshot({ path: `screenshots/error-userA-${Date.now()}.png` });
    await userBPage.screenshot({ path: `screenshots/error-userB-${Date.now()}.png` });
    throw err;
  } finally {
    await userAContext.close();
    await userBContext.close();
  }
});
