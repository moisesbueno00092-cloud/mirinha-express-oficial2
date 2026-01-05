
'use client';

import { useState, useEffect } from 'react';
import {
  Query,
  onSnapshot,
  DocumentData,
  FirestoreError,
  QuerySnapshot,
  CollectionReference,
  query,
  where,
} from 'firebase/firestore';
import { errorEmitter } from '@/firebase/error-emitter';
import { FirestorePermissionError } from '@/firebase/errors';
import { useUser } from '../provider';

export type WithId<T> = T & { id: string };

export interface UseCollectionResult<T> {
  data: WithId<T>[] | null;
  isLoading: boolean;
  error: FirestoreError | Error | null;
}

export interface InternalQuery extends Query<DocumentData> {
  _query: {
    path: {
      canonicalString(): string;
      toString(): string;
    },
    filters: {
        field: {
            segments: string[]
        },
        op: string,
        value: any
    }[]
  }
}

// Function to check if a query object has a 'userId' filter.
const isUserIdFilteredQuery = (q: any): q is InternalQuery => {
    if (q && q._query && Array.isArray(q._query.filters)) {
        return q._query.filters.some((f: any) => 
            f.field && Array.isArray(f.field.segments) && f.field.segments.join('/') === 'userId'
        );
    }
    return false;
};

export function useCollection<T = any>(
    memoizedTargetRefOrQuery: ((CollectionReference<DocumentData> | Query<DocumentData>) & {__memo?: boolean})  | null | undefined,
): UseCollectionResult<T> {
  type ResultItemType = WithId<T>;
  type StateDataType = ResultItemType[] | null;

  const [data, setData] = useState<StateDataType>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [error, setError] = useState<FirestoreError | Error | null>(null);
  
  const { user, isUserLoading } = useUser();

  useEffect(() => {
    // If the query is null, not ready, or auth state is still loading, do nothing and wait.
    if (!memoizedTargetRefOrQuery || isUserLoading) {
      setIsLoading(true);
      return;
    }
    
    const path = memoizedTargetRefOrQuery.type === 'collection'
        ? (memoizedTargetRefOrQuery as CollectionReference).path
        : (memoizedTargetRefOrQuery as unknown as InternalQuery)._query.path.canonicalString();

    // CRITICAL SECURITY CHECK: For protected collections, ensure userId filter exists.
    if (path === 'order_items' && !isUserIdFilteredQuery(memoizedTargetRefOrQuery)) {
        // This is an unsafe query because the `userId` filter hasn't been applied yet,
        // likely due to `user` not being available in the parent component's memo.
        // We will simply wait for the memoized query to update with the correct filter.
        setIsLoading(true); // Keep loading state until a valid query is provided.
        return;
    }


    setIsLoading(true);
    setError(null);

    const unsubscribe = onSnapshot(
      memoizedTargetRefOrQuery,
      (snapshot: QuerySnapshot<DocumentData>) => {
        const results: ResultItemType[] = [];
        for (const doc of snapshot.docs) {
          results.push({ ...(doc.data() as T), id: doc.id });
        }
        setData(results);
        setError(null);
        setIsLoading(false);
      },
      (error: FirestoreError) => {
        const contextualError = new FirestorePermissionError({
          operation: 'list',
          path: path
        })

        setError(contextualError)
        setData(null)
        setIsLoading(false)

        errorEmitter.emit('permission-error', contextualError);
      }
    );

    return () => unsubscribe();
  }, [memoizedTargetRefOrQuery, isUserLoading, user]); // Add isUserLoading and user as dependencies

  if(memoizedTargetRefOrQuery && !memoizedTargetRefOrQuery.__memo) {
    throw new Error('Query was not properly memoized using useMemoFirebase. This can cause infinite loops.');
  }
  
  return { data, isLoading, error };
}

