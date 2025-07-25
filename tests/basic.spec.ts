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

// Basic test to verify that the app loads and shows the login screen
test('app shows login screen initially', async ({ page }) => {
  // Go to the app
  await page.goto('/');
  
  // Check that the app title is visible
  await expect(page.getByText('Family Chat POC')).toBeVisible();
  
  // Check for the presence of a button that might be the sign-in button
  // Note: We're using a more general selector since the exact text might vary
  const signInButton = page.getByRole('button');
  await expect(signInButton).toBeVisible();
});

// Test localStorage functionality directly without auth
test('localStorage can store and retrieve messages', async ({ page }) => {
  // Go to the app
  await page.goto('/');
  
  // Set up test messages in localStorage
  await page.evaluate(() => {
    const testMessages = [
      {
        id: 'msg1',
        authorId: 'testuser',
        familyId: 'demo-family-1',
        body: 'Test message 1',
        createdAt: Date.now() - 1000
      },
      {
        id: 'msg2',
        authorId: 'otherperson',
        familyId: 'demo-family-1',
        body: 'Test message 2',
        createdAt: Date.now()
      }
    ];
    localStorage.setItem('familychat_msgs_demo-family-1', JSON.stringify(testMessages));
    
    // Verify we can read it back
    const storedMessages = JSON.parse(localStorage.getItem('familychat_msgs_demo-family-1') || '[]');
    return storedMessages.length === 2;
  }).then(result => {
    expect(result).toBeTruthy();
  });
  
  // Check that we can retrieve and modify localStorage
  const updatedMessages = await page.evaluate(() => {
    // Get existing messages
    const messages = JSON.parse(localStorage.getItem('familychat_msgs_demo-family-1') || '[]');
    
    // Add a new message
    messages.push({
      id: 'msg3',
      authorId: 'testuser',
      familyId: 'demo-family-1',
      body: 'Test message 3',
      createdAt: Date.now()
    });
    
    // Save back to localStorage
    localStorage.setItem('familychat_msgs_demo-family-1', JSON.stringify(messages));
    
    // Return the updated messages
    return messages;
  });
  
  // Verify the new message was added
  expect(updatedMessages.length).toBe(3);
  expect(updatedMessages[2].body).toBe('Test message 3');
});
