import { Page } from '@playwright/test';

/**
 * Login a user with the given email and password
 */
export async function login(page: Page, email: string, password: string): Promise<void> {
  console.log(`Logging in user: ${email}`);
  
  try {
    // Take a screenshot before login
    await page.screenshot({ path: `screenshots/before-login-${Date.now()}.png` });
    
    // Wait for the login form to be visible
    await page.waitForSelector('input[type="email"]', { timeout: 10000 });
    
    // Fill in the login form
    await page.fill('input[type="email"]', email);
    await page.fill('input[type="password"]', password);
    
    // Click the login button
    await page.click('button:has-text("Sign In")');
    
    // Wait for login to complete - look for "Signed in as:" text
    await page.waitForSelector('text=Signed in as:', { timeout: 15000 });
    
    console.log(`Successfully logged in as ${email}`);
    
    // Take a screenshot after successful login
    await page.screenshot({ path: `screenshots/after-login-${Date.now()}.png` });
  } catch (error) {
    console.error(`Login failed for ${email}:`, error);
    
    // Take a screenshot of the failed login state
    await page.screenshot({ path: `screenshots/login-failed-${Date.now()}.png` });
    
    // Log the current page content to help debug
    const content = await page.content();
    console.log('Page content at login failure:', content.substring(0, 500) + '...');
    
    throw error;
  }
}

/**
 * Get the user ID from the page
 */
export async function getUserId(page: Page): Promise<string> {
  console.log('Getting user ID...');
  
  try {
    // Wait for the user ID to be visible in the UI
    await page.waitForSelector('text=Signed in as:', { timeout: 10000 });
    
    // Extract the user ID from the UI
    const userIdElement = await page.locator('text=Signed in as:').first();
    const userIdText = await userIdElement.textContent();
    
    if (!userIdText) {
      throw new Error('User ID text not found');
    }
    
    // Extract the ID from the text "Signed in as: <ID>"
    const match = userIdText.match(/Signed in as: (.*)/);
    if (!match || !match[1]) {
      throw new Error(`Could not extract user ID from text: ${userIdText}`);
    }
    
    const userId = match[1].trim();
    console.log(`Found user ID: ${userId}`);
    return userId;
  } catch (error) {
    console.error('Failed to get user ID:', error);
    
    // Take a screenshot to help debug
    await page.screenshot({ path: `screenshots/get-user-id-failed-${Date.now()}.png` });
    
    throw error;
  }
}
