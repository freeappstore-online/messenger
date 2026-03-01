import { initializeApp } from 'firebase/app';
import { getAuth } from 'firebase/auth';
import { getFirestore, Firestore } from 'firebase/firestore';

// Firebase configuration
const firebaseConfig = {
  apiKey: "AIzaSyBZI2zq9o0AcVcHK8tlZg2iPg4Jr7AF8gM",
  authDomain: "xreact-ae672.firebaseapp.com",
  projectId: "xreact-ae672",
  storageBucket: "xreact-ae672.firebasestorage.app",
  messagingSenderId: "983257337319",
  appId: "1:983257337319:web:35c509737a3a3db8fd4142",
  measurementId: "G-RZ970RN8XZ"
};

const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db: Firestore = getFirestore(app);
