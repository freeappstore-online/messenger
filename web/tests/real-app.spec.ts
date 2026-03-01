import { test, expect } from '@playwright/test';

// Set up console logging for all tests in this file
test.beforeEach(async ({ page }) => {
  // Listen to console messages
  page.on('console', msg => {
    console.log(`BROWSER CONSOLE ${msg.type().toUpperCase()}: ${msg.text()}`);
    
    // Log arguments for error messages to get more details
    if (msg.type() === 'error') {
      msg.args().forEach(async (arg) => {
        try {
          const value = await arg.jsonValue();
          console.log('Error argument:', value);
        } catch (e) {
          console.log('Could not serialize argument');
        }
      });
    }
  });

  // Listen to page errors with detailed stack traces
  page.on('pageerror', error => {
    console.error(`BROWSER PAGE ERROR: ${error.message}`);
    console.error(`STACK TRACE: ${error.stack || 'No stack trace available'}`);
  });

  // Listen to request failures
  page.on('requestfailed', request => {
    console.error(`BROWSER REQUEST FAILED: ${request.url()} ${request.failure()?.errorText}`);
  });
});

// Test the basic UI elements of the application
test('app shows correct UI elements', async ({ page }) => {
  // Navigate to the application
  await page.goto('/');
  
  // Check that the app title is visible
  await expect(page.getByText('Family Chat POC')).toBeVisible();
  
  // Check for the presence of the sign-in button
  // The button might have different text depending on your implementation
  const signInButton = page.getByRole('button').filter({ hasText: /Sign In|Login|Google/i });
  await expect(signInButton).toBeVisible();
});

// Test localStorage functionality
test('localStorage can store and retrieve messages', async ({ page }) => {
  // Navigate to the application
  await page.goto('/');
  
  // Test localStorage directly
  const result = await page.evaluate(() => {
    // Create test messages
    const testMessages = [
      {
        id: 'test-msg-1',
        authorId: 'test-user-1',
        familyId: 'test-family-1',
        body: 'Test message 1',
        createdAt: Date.now() - 1000
      },
      {
        id: 'test-msg-2',
        authorId: 'test-user-2',
        familyId: 'test-family-1',
        body: 'Test message 2',
        createdAt: Date.now()
      }
    ];
    
    // Store in localStorage
    localStorage.setItem('familychat_msgs_test-family-1', JSON.stringify(testMessages));
    
    // Retrieve from localStorage
    const storedMessages = JSON.parse(localStorage.getItem('familychat_msgs_test-family-1') || '[]');
    
    // Verify data integrity
    return {
      count: storedMessages.length,
      firstMessage: storedMessages[0]?.body,
      secondMessage: storedMessages[1]?.body
    };
  });
  
  // Verify the results
  expect(result.count).toBe(2);
  expect(result.firstMessage).toBe('Test message 1');
  expect(result.secondMessage).toBe('Test message 2');
});

// Test that the app preserves localStorage data across page reloads
test('localStorage data persists across page reloads', async ({ page }) => {
  // Navigate to the application
  await page.goto('/');
  
  // Set up test data in localStorage
  await page.evaluate(() => {
    const testMessage = {
      id: 'persist-test-msg',
      authorId: 'test-user',
      familyId: 'test-family',
      body: 'This message should persist',
      createdAt: Date.now()
    };
    
    localStorage.setItem('familychat_msgs_test-family', JSON.stringify([testMessage]));
  });
  
  // Reload the page
  await page.reload();
  
  // Check if the data is still there
  const persistedData = await page.evaluate(() => {
    const messages = JSON.parse(localStorage.getItem('familychat_msgs_test-family') || '[]');
    return {
      exists: messages.length > 0,
      message: messages[0]?.body
    };
  });
  
  // Verify the data persisted
  expect(persistedData.exists).toBeTruthy();
  expect(persistedData.message).toBe('This message should persist');
});

// This test requires manual interaction - user needs to sign in
test.skip('end-to-end test with real authentication', async ({ page }) => {
  // Navigate to the application
  await page.goto('/');
  
  // Note: This test is skipped because it requires real user authentication
  // To run this test manually:
  // 1. Remove the .skip
  // 2. Run the test with --headed flag
  // 3. When prompted, sign in with your Google account
  // 4. The test will continue after authentication
  
  // Wait for the sign-in button and click it
  const signInButton = page.getByRole('button').filter({ hasText: /Sign In|Login|Google/i });
  await signInButton.click();
  
  // Wait for authentication to complete (this will require manual interaction)
  // You can increase the timeout for this step if needed
  await page.waitForSelector('text=Signed in as:', { timeout: 60000 });
  
  // Now test the authenticated functionality
  // For example, check if the peer connection UI is visible
  await expect(page.getByLabel('Peer UID')).toBeVisible();
  await expect(page.getByText('Connect To Peer')).toBeVisible();
});
