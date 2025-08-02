// Import polyfill for Node.js global object in browser environment
// This must be imported before any other imports that might use the global object
import './rtc/global-polyfill';

// JSX requires React in scope
import ReactDOM from 'react-dom/client';
import App from './App';

ReactDOM.createRoot(document.getElementById('root')!).render(<App />);
