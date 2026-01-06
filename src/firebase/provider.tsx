'use client';

import React, { createContext, useContext, ReactNode, useMemo, useState, useEffect } from 'react';
import { FirebaseApp } from 'firebase/app';
import { Firestore, doc, setDoc } from 'firebase/firestore';
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
  // Use setDoc with merge:true to create the doc if it doesn't exist,
  // or update it if it does, without overwriting other fields.
  try {
    // Set a minimal profile. The email will be null for anonymous users.
    await setDoc(userDocRef, { email: user.email || null }, { merge: true });
  } catch (e) {
    // This error will be caught and surfaced by the global error handler
    // if it's a permission issue. We log it here for server-side debugging.
    console.error("FirebaseProvider: Failed to ensure user profile exists.", e);
    // We re-throw the error to make it visible in the UI during development
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
    const unsubscribe = onAuthStateChanged(auth, async (firebaseUser) => {
      try {
        if (firebaseUser) {
          // A user is signed in. We must ensure it's an anonymous one.
          if (firebaseUser.isAnonymous) {
             // It's the anonymous user we want. Ensure their profile exists.
            await ensureUserProfileExists(firestore, firebaseUser);
            setUser(firebaseUser);
          } else {
            // If it's a persistent, non-anonymous user, sign them out.
            // onAuthStateChanged will be called again with `null`, triggering the sign-in flow below.
            await signOut(auth);
            // We set the user to null immediately to avoid using a non-anonymous user briefly.
            setUser(null);
          }
        } else {
          // No user is signed in at all. Let's sign in anonymously.
          // After signing in, `onAuthStateChanged` will fire again with the new user object,
          // and the logic above will handle it.
          await signInAnonymously(auth);
        }
      } catch (error) {
        console.error("FirebaseProvider: Auth state error:", error);
        setUser(null);
        setUserError(error as Error);
      } finally {
        // We only stop loading once we have a definitive user state (either a user or an error).
        if (user || userError) {
          setIsUserLoading(false);
        }
      }
    }, (error) => {
        console.error("FirebaseProvider: onAuthStateChanged listener error:", error);
        setUser(null);
        setUserError(error);
        setIsUserLoading(false);
    });

    return () => unsubscribe();
  }, [auth, firestore, user, userError]); // Added user and userError to dependencies

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
