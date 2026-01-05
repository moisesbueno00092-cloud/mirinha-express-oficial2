
'use client';
    
import {
  setDoc,
  addDoc,
  updateDoc,
  deleteDoc,
  collection,
  CollectionReference,
  DocumentReference,
  SetOptions,
  DocumentData,
  WriteBatch,
  writeBatch
} from 'firebase/firestore';
import { errorEmitter } from '@/firebase/error-emitter';
import {FirestorePermissionError} from '@/firebase/errors';

/**
 * Initiates a setDoc operation for a document reference.
 * Does NOT await the write operation internally.
 */
export function setDocumentNonBlocking(docRef: DocumentReference, data: any, options?: SetOptions) {
  setDoc(docRef, data, options || {}).catch(error => {
    errorEmitter.emit(
      'permission-error',
      new FirestorePermissionError({
        path: docRef.path,
        operation: 'write', // or 'create'/'update' based on options
        requestResourceData: data,
      })
    )
  })
  // Execution continues immediately
}


/**
 * Initiates an addDoc operation for a collection reference.
 * Does NOT await the write operation internally.
 * Returns the Promise for the new doc ref, but typically not awaited by caller.
 */
export function addDocumentNonBlocking<T extends DocumentData>(colRef: CollectionReference<T>, data: T) {
    addDoc(colRef, data).catch(error => {
        errorEmitter.emit(
            'permission-error',
            new FirestorePermissionError({
                path: colRef.path,
                operation: 'create',
                requestResourceData: data,
            })
        );
    });
}


/**
 * Initiates an updateDoc operation for a document reference.
 * Does NOT await the write operation internally.
 */
export function updateDocumentNonBlocking(docRef: DocumentReference, data: any) {
  updateDoc(docRef, data)
    .catch(error => {
      errorEmitter.emit(
        'permission-error',
        new FirestorePermissionError({
          path: docRef.path,
          operation: 'update',
          requestResourceData: data,
        })
      )
    });
}


/**
 * Initiates a deleteDoc operation for a document reference.
 * Does NOT await the write operation internally.
 */
export function deleteDocumentNonBlocking(docRef: DocumentReference) {
  deleteDoc(docRef)
    .catch(error => {
      errorEmitter.emit(
        'permission-error',
        new FirestorePermissionError({
          path: docRef.path,
          operation: 'delete',
        })
      )
    });
}

/**
 * Executes a batch write operation.
 * It will await the commit and handle errors.
 */
export async function commitBatch(batch: WriteBatch) {
    try {
        await batch.commit();
    } catch (error) {
        // Since a batch can have multiple operations, we can't create a single
        // perfect contextual error. We'll emit a generic one.
        // A more advanced implementation could inspect the batch's operations.
        console.error("Batch commit failed:", error);
        errorEmitter.emit(
            'permission-error',
            new FirestorePermissionError({
                path: 'batch operation',
                operation: 'write',
            })
        );
        // Re-throw the original error to allow the caller to handle it
        throw error;
    }
}

    