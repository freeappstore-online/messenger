import { test, expect, Page } from '@playwright/test';
import { mockFirebaseAuth, mockWebRTC, mockFirestore } from './mock-helpers';

// Test the full end-to-end flow with mocked services
test('end-to-end chat flow with mocked services', async ({ browser }) => {
  // Create two browser contexts to simulate two different users
  const userContext1 = await browser.newContext();
  const userContext2 = await browser.newContext();
  
  // Create pages for both users
  const page1 = await userContext1.newPage();
  const page2 = await userContext2.newPage();
  
  // Set up mocks for user 1
  await page1.goto('/');
  await mockFirebaseAuth(page1, 'user1');
  await mockWebRTC(page1);
  await mockFirestore(page1);
  
  // Set up mocks for user 2
  await page2.goto('/');
  await mockFirebaseAuth(page2, 'user2');
  await mockWebRTC(page2);
  await mockFirestore(page2);
  
  // Sign in both users
  await page1.getByText('Sign In With Google').click();
  await page2.getByText('Sign In With Google').click();
  
  // Wait for auth to complete
  await expect(page1.getByText('Signed in as:')).toBeVisible();
  await expect(page2.getByText('Signed in as:')).toBeVisible();
  
  // Get user IDs
  const userId1 = await page1.evaluate(() => {
    const authElement = document.querySelector('p:has-text("Signed in as:")');
    return authElement ? authElement.textContent?.replace('Signed in as: ', '') : null;
  });
  
  const userId2 = await page2.evaluate(() => {
    const authElement = document.querySelector('p:has-text("Signed in as:")');
    return authElement ? authElement.textContent?.replace('Signed in as: ', '') : null;
  });
  
  // Connect user1 to user2
  await page1.getByLabel('Peer UID').fill(userId2 as string);
  await page1.getByText('Connect To Peer').click();
  
  // Connect user2 to user1
  await page2.getByLabel('Peer UID').fill(userId1 as string);
  await page2.getByText('Connect To Peer').click();
  
  // Wait for connection to establish (would be handled by our mocks)
  await page1.waitForTimeout(500);
  
  // Send a message from user1 to user2
  await page1.getByLabel('Message').fill('Hello from user1!');
  await page1.getByText('Send').click();
  
  // Check that user2 received the message
  await expect(page2.getByText('Hello from user1!')).toBeVisible({ timeout: 5000 });
  
  // Send a message from user2 to user1
  await page2.getByLabel('Message').fill('Hi from user2!');
  await page2.getByText('Send').click();
  
  // Check that user1 received the message
  await expect(page1.getByText('Hi from user2!')).toBeVisible({ timeout: 5000 });
  
  // Test localStorage persistence by reloading page1
  await page1.reload();
  
  // Re-authenticate after reload
  await page1.getByText('Sign In With Google').click();
  
  // Wait for auth to complete
  await expect(page1.getByText('Signed in as:')).toBeVisible();
  
  // Check that messages are still visible after reload (from localStorage)
  await expect(page1.getByText('Hello from user1!')).toBeVisible();
  await expect(page1.getByText('Hi from user2!')).toBeVisible();
  
  // Clean up
  await page1.close();
  await page2.close();
  await userContext1.close();
  await userContext2.close();
});

// Test the UI components and interactions
test('UI components and interactions', async ({ page }) => {
  // Set up mocks
  await page.goto('/');
  await mockFirebaseAuth(page, 'testuser');
  await mockWebRTC(page);
  await mockFirestore(page);
  
  // Sign in
  await page.getByText('Sign In With Google').click();
  
  // Check that the main UI elements are visible
  await expect(page.getByText('Family Chat POC')).toBeVisible();
  await expect(page.getByText('Signed in as:')).toBeVisible();
  await expect(page.getByLabel('Peer UID')).toBeVisible();
  await expect(page.getByText('Connect To Peer')).toBeVisible();
  
  // Test the peer connection input
  await page.getByLabel('Peer UID').fill('test-peer-id');
  expect(await page.getByLabel('Peer UID').inputValue()).toBe('test-peer-id');
  
  // Test the message input
  await page.getByLabel('Message').fill('Test message');
  expect(await page.getByLabel('Message').inputValue()).toBe('Test message');
  
  // Test the send button (without actual sending)
  await expect(page.getByText('Send')).toBeVisible();
});

// Test error handling
test('error handling for invalid peer ID', async ({ page }) => {
  // Set up mocks
  await page.goto('/');
  await mockFirebaseAuth(page, 'testuser');
  await mockWebRTC(page);
  await mockFirestore(page);
  
  // Sign in
  await page.getByText('Sign In With Google').click();
  
  // Try to connect with an empty peer ID
  await page.getByText('Connect To Peer').click();
  
  // Check for error message or validation
  // Note: This depends on how your app handles this case
  // This is just a placeholder assertion
  await expect(page.getByLabel('Peer UID')).toBeFocused();
  
  // Try with an invalid format peer ID
  await page.getByLabel('Peer UID').fill('invalid-id-format');
  await page.getByText('Connect To Peer').click();
  
  // Check that no connection is established
  // This would depend on your app's specific behavior
});

// Test localStorage functionality directly
test('localStorage persistence', async ({ page }) => {
  // Set up initial localStorage state
  await page.goto('/');
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
  });
  
  // Set up mocks
  await mockFirebaseAuth(page, 'testuser');
  await mockWebRTC(page);
  await mockFirestore(page);
  
  // Sign in to load the app with the localStorage data
  await page.getByText('Sign In With Google').click();
  
  // Check that messages from localStorage are displayed
  await expect(page.getByText('Test message 1')).toBeVisible();
  await expect(page.getByText('Test message 2')).toBeVisible();
  
  // Add a new message
  await page.getByLabel('Message').fill('New test message');
  await page.getByText('Send').click();
  
  // Check that the new message is saved to localStorage
  const updatedMessages = await page.evaluate(() => {
    return JSON.parse(localStorage.getItem('familychat_msgs_demo-family-1') || '[]');
  });
  
  expect(updatedMessages.length).toBe(3);
  expect(updatedMessages[2].body).toBe('New test message');
});
