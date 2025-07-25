// Simple script to test our fix
import { chromium } from '@playwright/test';

async function testFix() {
  console.log('Starting browser to test fix...');
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext();
  const page = await context.newPage();
  
  // Set up console logging
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

  // Navigate to the app
  console.log('Navigating to http://localhost:5173...');
  await page.goto('http://localhost:5173');
  
  // Wait a bit to see if any errors occur
  console.log('Waiting for 5 seconds to check for errors...');
  await page.waitForTimeout(5000);
  
  // Check if we can see the app loaded
  const title = await page.title();
  console.log(`Page title: ${title}`);
  
  // Close browser
  await browser.close();
  console.log('Test completed.');
}

// Use top-level await in ES modules
try {
  await testFix();
} catch (err) {
  console.error('Test failed:', err);
  process.exit(1);
}
