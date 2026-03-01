/**
 * WebRTC connection initiation and verification functions
 */

import { Page } from '@playwright/test';
import { injectWebRTCMonitoringScript, startWebRTCMonitoring, initializeConsoleCapture, injectGlobalWebRTCTracker } from './webrtc-browser-scripts';

/**
 * Initiate a connection to another user
 */
export async function initiateConnection(page: Page, targetUserId: string): Promise<void> {
  console.log(`Initiating connection to peer: ${targetUserId}`);
  
  try {
    // Initialize console message capture
    await initializeConsoleCapture(page);
    
    // Inject global WebRTC tracker to monitor all peer connections
    await injectGlobalWebRTCTracker(page);
    
    // Inject and start WebRTC monitoring
    await injectWebRTCMonitoringScript(page);
    await startWebRTCMonitoring(page);
    
    // Verify that the monitoring script was injected
    const isMonitoringAvailable = await page.evaluate(() => {
      // @ts-ignore - Browser context
      return typeof window.monitorWebRTCConnection === 'function';
    });
    
    console.log(`WebRTC monitoring script available: ${isMonitoringAvailable}`);
    
    if (!isMonitoringAvailable) {
      console.error('WebRTC monitoring script was not properly injected!');
    }
    
    // Log all input fields and buttons to help with debugging
    const inputFields = await page.$$('input');
    console.log(`Found ${inputFields.length} input fields on the page`);
    
    for (const input of inputFields) {
      const type = await input.getAttribute('type');
      const placeholder = await input.getAttribute('placeholder');
      console.log(`Input type: ${type || 'none'}, placeholder: ${placeholder || 'none'}`);
    }
    
    // Log initial button count and text for debugging
    const initialButtons = await page.$$('button');
    console.log(`Found ${initialButtons.length} buttons on the page`);
    
    for (const button of initialButtons) {
      const text = await button.textContent();
      console.log(`Initial button text: ${text?.trim() || 'empty'}`);
    }
    
    // Find the peer input field using multiple possible selectors
    const possibleInputSelectors = [
      'input[placeholder="Peer UID"]',
      'input[placeholder="Peer ID"]',
      'input[placeholder="Enter peer ID"]',
      // Add a more generic selector as fallback
      'input'
    ];
    
    let inputSelector: string | null = null;
    for (const selector of possibleInputSelectors) {
      try {
        if (await page.isVisible(selector)) {
          inputSelector = selector;
          console.log(`Found peer input with selector: ${selector}`);
          break;
        }
      } catch (e) {
        console.log(`Error checking selector ${selector}: ${e}`);
      }
    }
    
    if (!inputSelector) {
      console.error('Peer input not found with any of the expected selectors!');
      await page.screenshot({ path: `peer-input-not-found-${Date.now()}.png` });
      throw new Error('Peer input field not found');
    }
    
    // Clear the input field first to ensure we don't have any previous value
    await page.fill(inputSelector, '');
    await page.waitForTimeout(500); // Increased timeout for input clearing
    
    // Verify the input is cleared
    const clearedValue = await page.$eval(inputSelector, (el) => (el as HTMLInputElement).value);
    console.log(`Input field cleared. Current value: "${clearedValue}"`);
    
    // Fill the peer input with the target user ID
    await page.fill(inputSelector, targetUserId);
    await page.waitForTimeout(500); // Wait for input to be filled
    
    // After fill, dispatch React events to ensure state updates
    await page.evaluate(([selector, value]) => {
      const input = document.querySelector(selector) as HTMLInputElement | null;
      if (input) {
        const nativeInputValueSetter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value')?.set;
        nativeInputValueSetter?.call(input, value);
        input.dispatchEvent(new Event('input', { bubbles: true }));
        input.dispatchEvent(new Event('change', { bubbles: true }));
      }
    }, [inputSelector, targetUserId]);

    // Verify the input has the correct value
    const filledValue = await page.$eval(inputSelector, (el) => (el as HTMLInputElement).value);
    console.log(`Filled peer input with ID: ${targetUserId}. Actual value: "${filledValue}"`);

    if (filledValue !== targetUserId) {
      console.warn('Input value still mismatched after event dispatch');
    }
    
    // Take a screenshot to verify the input is filled correctly
    await page.screenshot({ path: `peer-input-filled-${Date.now()}.png` });
    
    // Find the connect button using multiple possible selectors
    const possibleButtonSelectors = [
      // Use standard CSS selectors that work with both Playwright and DOM
      'button',
      'input[type="button"]',
      '.connect-button',
      '#connect-button'
    ];
    
    let buttonSelector: string | null = null;
    
    // First try to find buttons by their text content
    const buttons = await page.$$('button');
    console.log(`Searching through ${buttons.length} buttons for connect button`);
    
    for (const button of buttons) {
      const text = await button.textContent();
      console.log(`Button text: "${text?.trim() || 'empty'}"`); 
      
      if (text && (
          text.includes('Connect To Peer') || 
          text.includes('Connect to Peer') || 
          text.includes('Connect')
        )) {
        // Use the button's selector
        buttonSelector = await button.evaluate(el => {
          // Generate a unique selector for this button
          if (el.id) return `#${el.id}`;
          if (el.className) return `button.${el.className.split(' ')[0]}`;
          
          // Find position among siblings
          const parent = el.parentElement;
          if (parent) {
            const siblings = Array.from(parent.children);
            const index = siblings.indexOf(el);
            return `${parent.tagName.toLowerCase()} > button:nth-child(${index + 1})`;
          }
          
          return 'button';
        });
        
        console.log(`Found connect button with text: "${text.trim()}", using selector: ${buttonSelector}`);
        break;
      }
    }
    
    // If no button found by text, try the predefined selectors
    if (!buttonSelector) {
      for (const selector of possibleButtonSelectors) {
        try {
          if (await page.isVisible(selector)) {
            buttonSelector = selector;
            console.log(`Found connect button with selector: ${selector}`);
            break;
          }
        } catch (e) {
          console.log(`Error checking selector ${selector}: ${e}`);
        }
      }
    }
    
    if (!buttonSelector) {
      console.error('Connect button not found with any of the expected selectors!');
      await page.screenshot({ path: `connect-button-not-found-${Date.now()}.png` });
      throw new Error('Connect button not found');
    }
    
    // Click the connect button
    console.log('Clicking connect button...');
    await page.click(buttonSelector);
    
    // Verify the button was clicked by checking for visual changes or state changes
    await page.waitForTimeout(500);
    
    // Check if button text or state changed after click
    const buttonTextAfterClick = await page.textContent(buttonSelector);
    console.log(`Button text after click: "${buttonTextAfterClick?.trim() || 'empty'}"`);
    
    // Check if button is disabled after click (which often happens during connection)
    const isDisabledAfterClick = await page.isDisabled(buttonSelector).catch(() => false);
    
    console.log(`Button disabled after click: ${isDisabledAfterClick}`);
    console.log('Clicked connect button');
    
    // Add a small delay to allow the connection process to start
    await page.waitForTimeout(2000);
    
    // Check for any error messages that might appear immediately
    const errorMessages = await page.$$eval('div, p, span', elements => 
      elements.filter(el => 
        el.textContent && 
        (el.textContent.includes('error') || 
         el.textContent.includes('failed') || 
         el.textContent.includes('disconnected'))
      ).map(el => el.textContent)
    );
    
    if (errorMessages.length > 0) {
      console.log('Found potential error messages after connection attempt:', errorMessages);
    }
    
    // Take a screenshot after connection initiation
    await page.screenshot({ path: `after-connection-initiation-${Date.now()}.png` });
    
    // Check console logs for any WebRTC errors
    const logs = await page.evaluate(() => {
      // @ts-ignore - This is executed in the browser context
      return window.consoleMessages ? window.consoleMessages.filter(msg => 
        msg.includes('WebRTC') || 
        msg.includes('connection') || 
        msg.includes('peer') || 
        msg.includes('error') || 
        msg.includes('failed')
      ) : [];
    });
    
    if (logs.length > 0) {
      console.log('Relevant console logs after connection initiation:');
      logs.forEach(log => console.log(`- ${log}`));
    }
    
  } catch (error) {
    console.error('Failed to initiate connection:', error);
    await page.screenshot({ path: `connection-initiation-failed-${Date.now()}.png` });
    throw error;
  }
}
