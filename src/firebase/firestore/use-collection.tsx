
'use client';

import { useState, useEffect } from 'react';
import {
  Query,
  onSnapshot,
  DocumentData,
  FirestoreError,
  QuerySnapshot,
  CollectionReference,
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

const isUserIdFilteredQuery = (q: any): q is InternalQuery => {
    if (q && q._query && Array.isArray(q._query.filters)) {
        return q._query.filters.some((f: any) => 
            f.field && Array.isArray(f.field.segments) && f.field.segments.join('/') === 'userId' && f.op === '==' && f.value
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
    // Se a query não estiver pronta, ou o utilizador estiver a carregar, esperamos.
    if (!memoizedTargetRefOrQuery || isUserLoading) {
      setIsLoading(true);
      return;
    }
    
    const path = memoizedTargetRefOrQuery.type === 'collection'
        ? (memoizedTargetRefOrQuery as CollectionReference).path
        : (memoizedTargetRefOrQuery as unknown as InternalQuery)._query.path.canonicalString();

    // Esta é a verificação crucial para coleções protegidas por `userId`.
    const isProtectedPath = path === 'order_items';

    // Se for um caminho protegido:
    if (isProtectedPath) {
        // E não tivermos um ID de utilizador, esperamos. Isto previne a consulta durante a autenticação.
        if (!user?.uid) {
            setIsLoading(true);
            setData(null);
            return;
        }
        // E a query não estiver a filtrar por userId, é um erro de programação.
        // Por segurança, não executamos a query.
        if (!isUserIdFilteredQuery(memoizedTargetRefOrQuery)) {
            setIsLoading(false);
            const devError = new Error("Developer Error: Query to 'order_items' must include a 'where(\"userId\", \"==\", uid)' filter.");
            setError(devError);
            console.error(devError.message);
            setData(null);
            return;
        }
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
  }, [memoizedTargetRefOrQuery, isUserLoading, user]);

  if(memoizedTargetRefOrQuery && !memoizedTargetRefOrQuery.__memo) {
    throw new Error('Query was not properly memoized using useMemoFirebase. This can cause infinite loops.');
  }
  
  return { data, isLoading, error };
}
