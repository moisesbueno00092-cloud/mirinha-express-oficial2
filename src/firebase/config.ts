export const firebaseConfig = {
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID || "mirinha-express",
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID || "1:219322430193:web:33b723d7bfe06c06a36f50",
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY || "AIzaSyC00hHCf5tZtJS9DOOCAf8FdFndZsgIvwE",
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN || "mirinha-express.firebaseapp.com",
  measurementId: process.env.NEXT_PUBLIC_FIREBASE_MEASUREMENT_ID || "",
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID || "219322430193"
};
