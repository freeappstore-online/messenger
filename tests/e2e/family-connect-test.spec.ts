import { test, expect } from '@playwright/test';

/**
 * Test the family membership and auto-connect functionality
 */
test('family auto-connect flow', async ({ page, context }) => {
  // Load the application for the first user
  await page.goto('/');
  
  // Sign in using test account
  await page.fill('input[type="email"]', 'test1@user.com');
  await page.fill('input[type="password"]', 'testuser1');
  await page.click('button[type="submit"]');
  
  // Wait for sign-in to complete
  await page.waitForSelector('.chat-container', { timeout: 10000 });
  
  // Verify the welcome message appears
  const welcomeMessage = await page.waitForSelector('[data-testid="welcome-message"]', { timeout: 5000 });
  expect(await welcomeMessage.isVisible()).toBeTruthy();
  
  // Get the current user's ID
  const userIdElement = await page.locator('p:has-text("Signed in as:")');
  const userId = await userIdElement.textContent();
  console.log('Signed in as:', userId?.split('Signed in as:')[1].trim().split(' ')[0]);
  
  // Open a new browser window for the second user
  const secondBrowser = await context.newPage();
  await secondBrowser.goto('/');
  
  // Sign in with the second test account
  await secondBrowser.fill('input[type="email"]', 'test2@user.com');
  await secondBrowser.fill('input[type="password"]', 'testuser2');
  await secondBrowser.click('button[type="submit"]');
  
  // Wait for sign-in to complete for the second user
  await secondBrowser.waitForSelector('.chat-container', { timeout: 10000 });
  
  // Verify the second user's welcome message appears
  const secondWelcomeMessage = await secondBrowser.waitForSelector('[data-testid="welcome-message"]', { timeout: 5000 });
  expect(await secondWelcomeMessage.isVisible()).toBeTruthy();
  
  // Wait some time for auto-connect to happen (both users should be in the same family)
  await page.waitForTimeout(3000);
  
  // Check if connections are established on first user
  const connectionsListFirst = await page.locator('ul:has-text("Connections")');
  const hasConnectionsFirst = await connectionsListFirst.count() > 0;
  
  // Check connections on the second user
  const connectionsListSecond = await secondBrowser.locator('ul:has-text("Connections")');
  const hasConnectionsSecond = await connectionsListSecond.count() > 0;
  
  // At least one of the users should show a connection
  expect(hasConnectionsFirst || hasConnectionsSecond).toBeTruthy();
  
  // Test sending a message from the first user
  const testMessage = `Hello family! ${Date.now()}`;
  await page.fill('[data-testid="message-input"]', testMessage);
  await page.click('[data-testid="send-btn"]');
  
  // Wait for the message to appear in both chat windows
  await page.waitForSelector(`.bubble:has-text("${testMessage}")`, { timeout: 5000 });
  await secondBrowser.waitForSelector(`.bubble:has-text("${testMessage}")`, { timeout: 5000 });
  
  // Verify the message appears in both chat windows
  const messageInFirstChat = await page.locator(`.bubble:has-text("${testMessage}")`).count();
  const messageInSecondChat = await secondBrowser.locator(`.bubble:has-text("${testMessage}")`).count();
  
  expect(messageInFirstChat).toBeGreaterThan(0);
  expect(messageInSecondChat).toBeGreaterThan(0);
  
  // Close the second browser
  await secondBrowser.close();
});
