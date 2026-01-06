
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
    await setDoc(userDocRef, { email: user.email || `anonymous_${user.uid}@example.com` }, { merge: true });
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
          // A user is logged in.
          if (firebaseUser.isAnonymous) {
            // This is the correct, expected state.
            // Ensure profile exists and set the user.
            await ensureUserProfileExists(firestore, firebaseUser);
            setUser(firebaseUser);
            setUserError(null);
          } else {
            // This is an incorrect state (e.g., a previously signed-in non-anonymous user).
            // We must sign them out to enforce the anonymous-only policy.
            // The listener will be triggered again with `null`, which will then
            // trigger the anonymous sign-in flow.
            await signOut(auth);
            // We don't set user here, we let the auth state change trigger the next step.
          }
        } else {
          // No user is logged in. This is the trigger to sign in anonymously.
          await signInAnonymously(auth);
          // The onAuthStateChanged listener will be called again with the new anonymous user,
          // and the logic will proceed to the `if (firebaseUser.isAnonymous)` block above.
        }
      } catch (error) {
        console.error("FirebaseProvider: Auth state error:", error);
        setUser(null);
        setUserError(error as Error);
      } finally {
        // We set loading to false only after we have a confirmed user state (or an error).
        // The flow will cycle until a valid anonymous user is set.
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
  }, [auth, firestore, user, userError]);
  
  // This effect specifically handles the final loading state
  useEffect(() => {
      if(user && !isUserLoading) {
          // Final state is a valid user, we are done loading
          return;
      }
      if(userError) {
          // Final state is an error, we are done loading
          setIsUserLoading(false);
          return;
      }
       if (user === null && !isUserLoading) {
          // Transient state where user is null but not yet an error/final user
          // Keep loading until the auth flow completes
          setIsUserLoading(true);
      } else if (user !== null) {
          // We got a user, so we can stop loading
          setIsUserLoading(false);
      }
  }, [user, isUserLoading, userError]);

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
