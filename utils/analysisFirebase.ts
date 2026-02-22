import { db } from '../firebaseConfig';

export interface AnalysisTreeNode {
  id: string;
  [key: string]: any;
}

export interface SavedAnalysis {
  name: string;
  folderId: string | null;
  nodes: Record<string, AnalysisTreeNode>;
  rootNodeId: string;
  createdAt: number;
  updatedAt: number;
  lastNodeId: string;
}

export interface AnalysisFolder {
  name: string;
  createdAt: number;
  updatedAt: number;
}

// Remove undefined values from objects (Firebase doesn't allow undefined)
const sanitizeForFirebase = (obj: any): any => {
  if (obj === null || obj === undefined) return obj;
  if (typeof obj !== 'object') return obj;
  if (Array.isArray(obj)) {
    return obj.map(item => sanitizeForFirebase(item));
  }

  const sanitized: any = {};
  for (const key in obj) {
    const value = obj[key];
    if (value !== undefined) {
      sanitized[key] = sanitizeForFirebase(value);
    }
  }
  return sanitized;
};

// Save analysis to Firebase
export const saveAnalysis = async (
  userId: string,
  analysisId: string,
  data: SavedAnalysis
): Promise<void> => {
  try {
    const sanitizedData = sanitizeForFirebase({
      ...data,
      updatedAt: Date.now()
    });
    await db.ref(`/analyses/${userId}/${analysisId}`).set(sanitizedData);
    // Also add to user's analysis list
    await db.ref(`/userAnalyses/${userId}/${analysisId}`).set(true);
  } catch (error) {
    console.error('Error saving analysis:', error);
    throw error;
  }
};

// Load analysis from Firebase
export const loadAnalysis = async (
  userId: string,
  analysisId: string
): Promise<SavedAnalysis | null> => {
  try {
    const snapshot = await db.ref(`/analyses/${userId}/${analysisId}`).once('value');
    return snapshot.val();
  } catch (error) {
    console.error('Error loading analysis:', error);
    throw error;
  }
};

// Delete analysis from Firebase
export const deleteAnalysis = async (
  userId: string,
  analysisId: string
): Promise<void> => {
  try {
    await db.ref(`/analyses/${userId}/${analysisId}`).remove();
    await db.ref(`/userAnalyses/${userId}/${analysisId}`).remove();
  } catch (error) {
    console.error('Error deleting analysis:', error);
    throw error;
  }
};

// Create folder
export const createFolder = async (
  userId: string,
  folderId: string,
  name: string
): Promise<void> => {
  try {
    await db.ref(`/analysisfolders/${userId}/${folderId}`).set({
      name,
      createdAt: Date.now(),
      updatedAt: Date.now()
    });
  } catch (error) {
    console.error('Error creating folder:', error);
    throw error;
  }
};

// Delete folder (only if no analyses in it)
export const deleteFolder = async (
  userId: string,
  folderId: string
): Promise<void> => {
  try {
    // Check if any analyses belong to this folder
    const snapshot = await db.ref(`/analyses/${userId}`).once('value');
    const analyses = snapshot.val() || {};

    const hasAnalysesInFolder = Object.values(analyses).some(
      (analysis: any) => analysis.folderId === folderId
    );

    if (hasAnalysesInFolder) {
      throw new Error('Cannot delete folder that contains analyses');
    }

    await db.ref(`/analysisfolders/${userId}/${folderId}`).remove();
  } catch (error) {
    console.error('Error deleting folder:', error);
    throw error;
  }
};

// Get all folders for user
export const getAllFolders = async (
  userId: string
): Promise<Record<string, AnalysisFolder>> => {
  try {
    const snapshot = await db.ref(`/analysisfolders/${userId}`).once('value');
    return snapshot.val() || {};
  } catch (error) {
    console.error('Error fetching folders:', error);
    throw error;
  }
};

// Get analyses in a specific folder
export const getAnalysesByFolder = async (
  userId: string,
  folderId: string | null
): Promise<Record<string, SavedAnalysis>> => {
  try {
    const snapshot = await db.ref(`/analyses/${userId}`).once('value');
    const analyses = snapshot.val() || {};

    const filtered: Record<string, SavedAnalysis> = {};
    Object.entries(analyses).forEach(([id, analysis]: [string, any]) => {
      if (analysis.folderId === folderId) {
        filtered[id] = analysis;
      }
    });

    return filtered;
  } catch (error) {
    console.error('Error fetching analyses by folder:', error);
    throw error;
  }
};

// Get all analyses for user
export const getAllAnalyses = async (
  userId: string
): Promise<Record<string, SavedAnalysis>> => {
  try {
    const snapshot = await db.ref(`/analyses/${userId}`).once('value');
    return snapshot.val() || {};
  } catch (error) {
    console.error('Error fetching all analyses:', error);
    throw error;
  }
};

// Move analysis to folder
export const moveAnalysisToFolder = async (
  userId: string,
  analysisId: string,
  newFolderId: string | null
): Promise<void> => {
  try {
    const analysis = await loadAnalysis(userId, analysisId);
    if (!analysis) {
      throw new Error('Analysis not found');
    }

    await db.ref(`/analyses/${userId}/${analysisId}/folderId`).set(newFolderId);
  } catch (error) {
    console.error('Error moving analysis:', error);
    throw error;
  }
};

// Rename folder
export const renameFolder = async (
  userId: string,
  folderId: string,
  newName: string
): Promise<void> => {
  try {
    await db.ref(`/analysisfolders/${userId}/${folderId}/name`).set(newName);
    await db.ref(`/analysisfolders/${userId}/${folderId}/updatedAt`).set(Date.now());
  } catch (error) {
    console.error('Error renaming folder:', error);
    throw error;
  }
};

// Rename analysis
export const renameAnalysis = async (
  userId: string,
  analysisId: string,
  newName: string
): Promise<void> => {
  try {
    await db.ref(`/analyses/${userId}/${analysisId}/name`).set(newName);
    await db.ref(`/analyses/${userId}/${analysisId}/updatedAt`).set(Date.now());
  } catch (error) {
    console.error('Error renaming analysis:', error);
    throw error;
  }
};

// Generate a unique ID for analyses and folders
export const generateId = (): string => {
  return Date.now().toString(36) + Math.random().toString(36).substr(2, 9);
};
