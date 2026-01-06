'use client';

import React, { createContext, useContext, ReactNode, useMemo, useState, useEffect } from 'react';
import { FirebaseApp } from 'firebase/app';
import { Firestore, doc, setDoc, getDoc } from 'firebase/firestore';
import { Auth, User, onAuthStateChanged, signInAnonymously, signOut } from 'firebase/auth';
import { FirebaseErrorListener } from '@/components/FirebaseErrorListener';

interface FirebaseProviderProps {
  children: ReactNode;
  firebaseApp: FirebaseApp;
  firestore: Firestore;
  auth: Auth;
}

// Combined state for the Firebase context
export interface FirebaseContextState {
  firebaseApp: FirebaseApp | null;
  firestore: Firestore | null;
  auth: Auth | null;
  user: User | null;
  isUserLoading: boolean;
  userError: Error | null;
}

// Return type for useUser() - specific to user auth state
export interface UserHookResult {
  user: User | null;
  isUserLoading: boolean;
  userError: Error | null;
}

// React Context
export const FirebaseContext = createContext<FirebaseContextState | undefined>(undefined);

/**
 * Ensures the user profile document exists in Firestore.
 * This is crucial for security rules that check against the user document.
 * @param firestoreInstance The Firestore instance.
 * @param user The authenticated user.
 */
const ensureUserProfileExists = async (firestoreInstance: Firestore, user: User) => {
  if (!user?.uid) return;
  const userDocRef = doc(firestoreInstance, 'users', user.uid);

  try {
    const userDoc = await getDoc(userDocRef);
    if (!userDoc.exists()) {
      // Use a generic email for anonymous users as it's not provided.
      await setDoc(userDocRef, { email: `anonymous_${user.uid}@example.com` }, { merge: true });
    }
  } catch (e) {
    console.error("FirebaseProvider: Failed to ensure user profile exists.", e);
    // This could be a permission error itself if rules are not set up for user creation.
    // Re-throwing allows the caller to handle it.
    throw e;
  }
};


/**
 * FirebaseProvider manages and provides Firebase services and user authentication state.
 */
export const FirebaseProvider: React.FC<FirebaseProviderProps> = ({
  children,
  firebaseApp,
  firestore,
  auth,
}) => {
  const [user, setUser] = useState<User | null>(null);
  const [isUserLoading, setIsUserLoading] = useState(true);
  const [userError, setUserError] = useState<Error | null>(null);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (currentUser) => {
      setIsUserLoading(true);
      setUserError(null);
      
      try {
        if (currentUser && currentUser.isAnonymous) {
          // User is signed in and is anonymous, proceed.
          await ensureUserProfileExists(firestore, currentUser);
          setUser(currentUser);
        } else {
          // If there is a user but they are not anonymous, or there is no user,
          // sign out to clear any invalid state, then sign in anonymously.
          if (currentUser) {
            await signOut(auth);
          }
          const userCredential = await signInAnonymously(auth);
          // The onAuthStateChanged listener will be re-triggered with the new anonymous user,
          // so we let the next call handle setting the user and creating the profile.
        }
      } catch (error) {
        console.error("FirebaseProvider: Error during auth state handling:", error);
        setUserError(error as Error);
        setUser(null);
      } finally {
        setIsUserLoading(false);
      }
    }, (error) => {
      // Handle listener errors specifically.
      console.error("FirebaseProvider: onAuthStateChanged listener error:", error);
      setUserError(error);
      setUser(null);
      setIsUserLoading(false);
    });

    // Cleanup the listener on unmount.
    return () => unsubscribe();
  }, [auth, firestore]);


  const contextValue = useMemo((): FirebaseContextState => {
    return {
      firebaseApp,
      firestore,
      auth,
      user,
      isUserLoading,
      userError,
    };
  }, [firebaseApp, firestore, auth, user, isUserLoading, userError]);

  return (
    <FirebaseContext.Provider value={contextValue}>
      <FirebaseErrorListener />
      {children}
    </FirebaseContext.Provider>
  );
};

const useFirebaseContext = (): FirebaseContextState => {
  const context = useContext(FirebaseContext);
  if (context === undefined) {
    throw new Error('useFirebaseContext must be used within a FirebaseProvider.');
  }
  return context;
};

/** Hook to access Firebase Auth instance. */
export const useAuth = (): Auth => {
  const { auth } = useFirebaseContext();
  if (!auth) throw new Error('Firebase Auth not available.');
  return auth;
};

/** Hook to access Firestore instance. */
export const useFirestore = (): Firestore => {
  const { firestore } = useFirebaseContext();
  if (!firestore) throw new Error('Firebase Firestore not available.');
  return firestore;
};

/** Hook to access Firebase App instance. */
export const useFirebaseApp = (): FirebaseApp => {
  const { firebaseApp } = useFirebaseContext();
  if (!firebaseApp) throw new Error('Firebase App not available.');
  return firebaseApp;
};

type MemoFirebase <T> = T & {__memo?: boolean};

export function useMemoFirebase<T>(factory: () => T, deps: React.DependencyList): T | (MemoFirebase<T>) {
  const memoized = useMemo(factory, deps);
  
  if(typeof memoized !== 'object' || memoized === null) return memoized;
  if(!('__memo' in memoized)) {
    try {
     (memoized as MemoFirebase<T>).__memo = true;
    } catch {}
  }
  
  return memoized;
}

/**
 * Hook specifically for accessing the authenticated user's state.
 * This provides the User object, loading status, and any auth errors.
 * @returns {UserHookResult} Object with user, isUserLoading, userError.
 */
export const useUser = (): UserHookResult => {
  const { user, isUserLoading, userError } = useFirebaseContext();
  return { user, isUserLoading, userError };
};
