'use client';

import { firebaseConfig } from '@/firebase/config';
import { initializeApp, getApps, getApp, FirebaseApp } from 'firebase/app';
import { getAuth, Auth } from 'firebase/auth';
import { getFirestore, Firestore } from 'firebase/firestore';

// This object will hold the singleton instances of the Firebase services.
let firebaseServices: { firebaseApp: FirebaseApp; auth: Auth; firestore: Firestore; } | null = null;

/**
 * Initializes Firebase and returns the SDK instances.
 * It ensures that initialization happens only once.
 * 
 * IMPORTANT: DO NOT MODIFY THIS FUNCTION. It ensures a stable and correct
 * connection to production Firebase services.
 */
export function initializeFirebase() {
  // If the services are already initialized, return them.
  if (firebaseServices) {
    return firebaseServices;
  }

  // Get the Firebase app instance, initializing it if it doesn't exist.
  const firebaseApp = !getApps().length ? initializeApp(firebaseConfig) : getApp();

  // Get the Auth and Firestore services.
  const auth = getAuth(firebaseApp);
  const firestore = getFirestore(firebaseApp);

  // Store the initialized services in the singleton object.
  firebaseServices = {
    firebaseApp,
    auth,
    firestore
  };
  
  return firebaseServices;
}


export * from './provider';
export * from './client-provider';
export * from './firestore/use-collection';
export * from './firestore/use-doc';
export * from './errors';
export * from './error-emitter';
