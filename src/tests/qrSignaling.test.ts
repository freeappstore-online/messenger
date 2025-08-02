import { test, expect, Page, BrowserContext } from '@playwright/test';

/**
 * Tests for QR code signaling between two browser contexts
 */

// Helper function to sign in a user in a specific page
async function signIn(page: Page, email: string, password: string) {
  await page.goto('/');
  await page.fill('[data-testid="email-input"]', email);
  await page.fill('[data-testid="password-input"]', password);
  await page.click('[data-testid="signin-btn"]');
  // Wait for sign-in to complete
  await page.waitForSelector('text=Family Chat POC');
}

// Helper function to get user ID from a page
async function getUserId(page: Page): Promise<string> {
  return page.evaluate(() => {
    const userIdElement = document.querySelector('p:has-text("Signed in as:")');
    if (!userIdElement) throw new Error('User ID element not found');
    const text = userIdElement.textContent || '';
    // Extract just the user ID part from "Signed in as: {userId} 📋"
    const match = text.match(/Signed in as: ([^\s]+)/);
    return match ? match[1] : '';
  });
}

// Helper function to get offer data from initiator page
async function getOfferData(page: Page): Promise<string> {
  // Simulate clicking the "Copy to Clipboard" button, but extract the data directly
  return page.evaluate(() => {
    // Assuming the QR code contains data in a data attribute or is accessible in some way
    // This will need to be adjusted based on how your QR data is actually stored
    const qrImage = document.querySelector('.offer-container img');
    if (!qrImage) throw new Error('QR code image not found');
    return qrImage.getAttribute('src') || '';
  });
}

// Helper function to get answer data from receiver page
async function getAnswerData(page: Page): Promise<string> {
  return page.evaluate(() => {
    const qrImage = document.querySelector('.answer-container img');
    if (!qrImage) throw new Error('QR code image not found');
    return qrImage.getAttribute('src') || '';
  });
}

// Helper function to paste data into the QR input field and process it
async function pasteAndProcessData(page: Page, data: string) {
  await page.evaluate((qrData) => {
    const textarea = document.querySelector('.qr-input textarea') as HTMLTextAreaElement;
    if (!textarea) throw new Error('QR input textarea not found');
    textarea.value = qrData;
    // Trigger input event to make React state update
    const event = new Event('input', { bubbles: true });
    textarea.dispatchEvent(event);
  }, data);
  
  await page.click('button:has-text("Process Data")');
}

// Helper to check if a peer connection is established
async function isPeerConnected(page: Page, peerId: string): Promise<boolean> {
  return page.evaluate((pid) => {
    const connectionItems = document.querySelectorAll('.connections-list li');
    for (const item of connectionItems) {
      if (item.textContent?.includes(pid) && item.textContent?.includes('connected')) {
        return true;
      }
    }
    return false;
  }, peerId);
}

test('Two clients can establish connection using QR code signaling', async ({ browser }) => {
  // Create two separate browser contexts to simulate two different clients
  const contextA = await browser.newContext();
  const contextB = await browser.newContext();
  
  // Create pages for each context
  const clientA = await contextA.newPage();
  const clientB = await contextB.newPage();
  
  try {
    // Sign in both clients with test accounts
    await signIn(clientA, 'test1@user.com', 'testuser1');
    await signIn(clientB, 'test2@user.com', 'testuser2');
    
    // Get user IDs
    const userIdA = await getUserId(clientA);
    const userIdB = await getUserId(clientB);
    console.log(`Client A user ID: ${userIdA}`);
    console.log(`Client B user ID: ${userIdB}`);
    
    // Client A initiates connection by entering Client B's ID
    await clientA.fill('.connection-initiator input#peer-id', userIdB);
    await clientA.click('button:has-text("Generate Connection Offer")');
    
    // Wait for QR code to be generated
    await clientA.waitForSelector('.offer-container img');
    
    // Get the offer data from Client A
    const offerData = await getOfferData(clientA);
    console.log('Got offer data, length:', offerData.length);
    
    // Client B pastes and processes the offer data
    await pasteAndProcessData(clientB, offerData);
    
    // Wait for answer QR code to be generated on Client B
    await clientB.waitForSelector('.answer-container img');
    
    // Get the answer data from Client B
    const answerData = await getAnswerData(clientB);
    console.log('Got answer data, length:', answerData.length);
    
    // Client A pastes and processes the answer data
    await pasteAndProcessData(clientA, answerData);
    
    // Wait for connection to be established (max 10 seconds)
    await Promise.all([
      clientA.waitForFunction(
        (peerId) => document.querySelector(`li:has-text("${peerId}") span:has-text("connected")`) !== null,
        userIdB,
        { timeout: 10000 }
      ),
      clientB.waitForFunction(
        (peerId) => document.querySelector(`li:has-text("${peerId}") span:has-text("connected")`) !== null,
        userIdA,
        { timeout: 10000 }
      )
    ]);
    
    // Verify connections are established
    expect(await isPeerConnected(clientA, userIdB)).toBe(true);
    expect(await isPeerConnected(clientB, userIdA)).toBe(true);
    
    // Test sending a message (if you want to verify data channel works)
    await clientA.fill('.message-input', 'Hello from Client A');
    await clientA.click('button:has-text("Send")');
    
    // Wait for message to appear in Client B
    await clientB.waitForSelector('text=Hello from Client A');
    
  } finally {
    // Clean up
    await contextA.close();
    await contextB.close();
  }
});
