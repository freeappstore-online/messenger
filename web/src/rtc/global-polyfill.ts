/**
 * Polyfills for Node.js objects in the browser
 * Needed for libraries like simple-peer that expect Node.js globals
 */

if (typeof window !== 'undefined') {
  if (typeof window.global === 'undefined') {
    // @ts-ignore
    window.global = window;
  }

  if (typeof window.process === 'undefined') {
    // @ts-ignore
    window.process = {
      env: { DEBUG: undefined },
      nextTick: (callback: Function) => setTimeout(callback, 0),
      version: '',
      versions: { node: '0' } as any,
      platform: 'browser' as any,
    };
  }
}

export {};
