import { Page } from '@playwright/test';

/**
 * Send a message from one user to another
 */
export async function sendMessage(page: Page, message: string): Promise<void> {
  console.log(`Sending message: "${message}"`);
  
  try {
    // Wait for the message input to be enabled
    await page.waitForSelector('[data-testid="message-input"]:not([disabled])', { timeout: 10000 });
    
    // Fill the message input
    await page.fill('[data-testid="message-input"]', message);
    
    // Wait until the Send button is actually enabled (Playwright-level)
    const sendBtn = page.locator('[data-testid="send-btn"]');
    await sendBtn.waitFor({ state: 'visible', timeout: 10000 });
    await sendBtn.waitFor({ state: 'attached', timeout: 10000 });
    await page.waitForFunction(
      (sel) => {
        const btn = document.querySelector<HTMLButtonElement>(sel);
        return !!btn && !btn.disabled;
      },
      '[data-testid="send-btn"]',
      { timeout: 10000 }
    );

    // Press Enter first (many React inputs submit on Enter)
    await page.press('[data-testid="message-input"]', 'Enter');

    // Fallback click only if button became enabled
    if (await sendBtn.isEnabled()) {
      await sendBtn.click();
    }
    
    console.log('Message sent successfully');
    
    // Take a screenshot after sending the message
    await page.screenshot({ path: `screenshots/after-send-message-${Date.now()}.png` });
  } catch (error) {
    console.error('Failed to send message:', error);
    
    // Take a screenshot of the failed state
    await page.screenshot({ path: `screenshots/send-message-failed-${Date.now()}.png` });
    
    throw error;
  }
}

/**
 * Verify that a message was received
 */
export async function verifyMessageReceived(page: Page, expectedMessage: string): Promise<void> {
  console.log(`Verifying message received: "${expectedMessage}"`);
  
  try {
    // Take a screenshot before waiting for the message
    await page.screenshot({ path: `screenshots/before-verify-message-${Date.now()}.png` });
    
    // Wait for any messages to appear first
    await page.waitForSelector('.messages .bubble', { timeout: 5000 })
      .catch(() => console.log('No message bubbles found yet'));
    
    // Log what messages are currently visible
    const visibleMessages = await page.$$eval('.messages .bubble', elements => 
      elements.map(el => el.textContent)
    );
    console.log('Visible messages:', visibleMessages);
    
    // Wait for the specific message to appear
    // Using a more specific selector targeting the message bubble that contains our text
    const messageSelector = `.messages .bubble:has-text("${expectedMessage}")`;
    
    // Wait for the message to appear with a timeout
    await page.waitForSelector(messageSelector, { timeout: 15000 });
    
    console.log('Message received successfully');
    
    // Take a screenshot after verifying the message
    await page.screenshot({ path: `screenshots/message-verified-${Date.now()}.png` });
  } catch (error) {
    console.error(`Failed to verify message "${expectedMessage}":`, error);
    
    // Take a screenshot of the failed state
    await page.screenshot({ path: `screenshots/verify-message-failed-${Date.now()}.png` });
    
    // Get all message bubbles for debugging
    const allMessages = await page.$$eval('.messages .bubble, .messages .msg', elements => 
      elements.map(el => el.textContent || el.innerText)
    );
    
    console.log('Current chat messages:', allMessages);
    
    throw error;
  }
}
