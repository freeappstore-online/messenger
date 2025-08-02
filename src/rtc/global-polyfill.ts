/**
 * Polyfills for Node.js objects in the browser
 * This is needed for libraries like simple-peer that expect Node.js objects
 */

// Make sure the global object exists in browser context
if (typeof window !== 'undefined') {
  // Polyfill global object
  if (typeof window.global === 'undefined') {
    // @ts-ignore - intentionally adding global to window
    window.global = window;
  }

  // Polyfill process object
  if (typeof window.process === 'undefined') {
    // @ts-ignore - intentionally adding process to window
    window.process = {
      env: { DEBUG: undefined },
      nextTick: (callback: Function) => setTimeout(callback, 0),
      version: '',
      versions: { node: '0' },
      platform: 'browser'
    };
  }
}

export {};
