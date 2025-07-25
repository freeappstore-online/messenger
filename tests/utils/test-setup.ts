import { BrowserContext, Page, test as base } from '@playwright/test';

/**
 * Custom test fixture that provides two browser contexts and pages for testing P2P connections
 */
export const test = base.extend<{
  context1: BrowserContext;
  context2: BrowserContext;
  page1: Page;
  page2: Page;
}>({
  // Define the first browser context
  context1: async ({ browser }, use) => {
    // Create a browser context with specific viewport and user agent
    const context = await browser.newContext({
      viewport: { width: 1280, height: 720 },
      userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
    });
    
    // Use the context and then close it when done
    await use(context);
    await context.close();
  },
  
  // Define the second browser context
  context2: async ({ browser }, use) => {
    // Create a browser context with specific viewport and user agent
    const context = await browser.newContext({
      viewport: { width: 1280, height: 720 },
      userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
    });
    
    // Use the context and then close it when done
    await use(context);
    await context.close();
  },
  
  // Define the first page
  page1: async ({ context1 }, use) => {
    // Create a page in the first context
    const page = await context1.newPage();
    
    // Setup console logging
    page.on('console', msg => {
      console.log(`[Page1 Console] ${msg.type()}: ${msg.text()}`);
    });
    
    // Setup error handling
    page.on('pageerror', error => {
      console.error(`[Page1 Error] ${error.message}`);
    });
    
    // Setup WebRTC logging
    await page.evaluate(() => {
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
    });
    
    // Use the page
    await use(page);
  },
  
  // Define the second page
  page2: async ({ context2 }, use) => {
    // Create a page in the second context
    const page = await context2.newPage();
    
    // Setup console logging
    page.on('console', msg => {
      console.log(`[Page2 Console] ${msg.type()}: ${msg.text()}`);
    });
    
    // Setup error handling
    page.on('pageerror', error => {
      console.error(`[Page2 Error] ${error.message}`);
    });
    
    // Setup WebRTC logging
    await page.evaluate(() => {
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
    });
    
    // Use the page
    await use(page);
  },
});

/**
 * Helper function to navigate to the app with retry logic
 */
export async function navigateToApp(page: Page, url: string, maxRetries = 3): Promise<void> {
  let retryCount = 0;
  let success = false;
  
  console.log(`Navigating to ${url}...`);
  
  // Take a screenshot before navigation
  await page.screenshot({ path: `screenshots/before-navigation-${Date.now()}.png` });
  
  while (!success && retryCount < maxRetries) {
    try {
      // Use waitUntil: 'networkidle' to ensure the page is fully loaded
      await page.goto(url, { 
        timeout: 30000,
        waitUntil: 'networkidle'
      });
      
      // Verify we're not on about:blank
      const currentUrl = page.url();
      if (currentUrl === 'about:blank') {
        throw new Error('Navigation resulted in about:blank page');
      }
      
      // Take a screenshot after successful navigation
      await page.screenshot({ path: `screenshots/after-navigation-${Date.now()}.png` });
      
      // Wait for the page to be fully interactive
      await page.waitForLoadState('domcontentloaded');
      
      success = true;
    } catch (e) {
      retryCount++;
      console.log(`Navigation attempt ${retryCount} failed: ${e}. Retrying...`);
      await new Promise(resolve => setTimeout(resolve, 2000));
    }
  }
  
  if (!success) {
    // Take a screenshot of the failed state
    await page.screenshot({ path: `screenshots/navigation-failed-${Date.now()}.png` });
    throw new Error(`Failed to navigate to ${url} after ${maxRetries} attempts`);
  }
  
  console.log(`Successfully navigated to ${url}`);
}
