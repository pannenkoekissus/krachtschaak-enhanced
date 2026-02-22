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
  ownerUserId?: string;
  ownerDisplayName?: string;
  isShared?: boolean;
  isPublic?: boolean;
  permission?: 'read' | 'edit';
  sharedWith?: Record<string, string | 'read' | 'edit'>; // userId -> permission
}

export interface FolderShare {
  recipientUserId: string;
  recipientUsername: string;
  permission: 'read' | 'edit';
  sharedAt: number;
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

// ==================== SHARING FUNCTIONS ====================

// Get user profile by username to find userId
export const getUserIdByUsername = async (username: string): Promise<string | null> => {
  try {
    const snapshot = await db.ref(`/usernames/${username.toLowerCase().trim()}`).once('value');
    const userId = snapshot.val();
    if (!userId) return null;
    return userId;
  } catch (error) {
    console.error('Error finding user by username:', error);
    throw error;
  }
};

// Get username by userId - fetch displayName from users/{uid}/displayName
export const getUsernameByUserId = async (userId: string): Promise<string | null> => {
  try {
    const snapshot = await db.ref(`/users/${userId}/displayName`).once('value');
    const displayName = snapshot.val();
    if (displayName) return displayName;
    // Fallback to userId if displayName not found
    return userId;
  } catch (error) {
    console.error('Error getting username:', error);
    // Fallback to userId on error
    return userId;
  }
};

// Share a folder with another user
export const shareFolder = async (
  ownerUserId: string,
  folderId: string,
  recipientUsername: string,
  permission: 'read' | 'edit'
): Promise<void> => {
  try {
    const recipientUserId = await getUserIdByUsername(recipientUsername);
    if (!recipientUserId) {
      throw new Error(`User "${recipientUsername}" not found`);
    }

    if (recipientUserId === ownerUserId) {
      throw new Error('Cannot share folder with yourself');
    }

    // Get folder data
    const folderSnapshot = await db.ref(`/analysisfolders/${ownerUserId}/${folderId}`).once('value');
    const folder = folderSnapshot.val();
    if (!folder) {
      throw new Error('Folder not found');
    }

    // Store share permission in owner's folder
    await db.ref(`/analysisfolders/${ownerUserId}/${folderId}/sharedWith/${recipientUserId}`).set(permission);

    // Store shared folder in recipient's profile
    const sharedFolderData = {
      ...folder,
      folderId,
      ownerUserId,
      permission,
      sharedAt: Date.now()
    };

    await db.ref(`/sharedFolders/${recipientUserId}/${folderId}`).set(sharedFolderData);
  } catch (error) {
    console.error('Error sharing folder:', error);
    throw error;
  }
};

// Unshare a folder with another user
export const unshareFolder = async (
  ownerUserId: string,
  folderId: string,
  recipientUserId: string
): Promise<void> => {
  try {
    // Remove from owner's folder
    await db.ref(`/analysisfolders/${ownerUserId}/${folderId}/sharedWith/${recipientUserId}`).remove();

    // Remove from recipient's shared folders
    await db.ref(`/sharedFolders/${recipientUserId}/${folderId}`).remove();
  } catch (error) {
    console.error('Error unsharing folder:', error);
    throw error;
  }
};

// Get all folders shared with current user
export const getSharedFolders = async (userId: string): Promise<Record<string, AnalysisFolder & { folderId: string; ownerUserId: string }>> => {
  try {
    const snapshot = await db.ref(`/sharedFolders/${userId}`).once('value');
    const sharedFolders = snapshot.val() || {};
    return sharedFolders;
  } catch (error) {
    console.error('Error fetching shared folders:', error);
    throw error;
  }
};

// Get all shares for a specific folder (for the owner)
export const getFolderShares = async (
  ownerUserId: string,
  folderId: string
): Promise<FolderShare[]> => {
  try {
    const sharesSnapshot = await db.ref(`/analysisfolders/${ownerUserId}/${folderId}/sharedWith`).once('value');
    const shares = sharesSnapshot.val() || {};

    const folderShares: FolderShare[] = [];
    for (const [recipientUserId, permission] of Object.entries(shares)) {
      const username = await getUsernameByUserId(recipientUserId);
      if (username) {
        folderShares.push({
          recipientUserId,
          recipientUsername: username,
          permission: permission as 'read' | 'edit',
          sharedAt: Date.now()
        });
      }
    }

    return folderShares;
  } catch (error) {
    console.error('Error fetching folder shares:', error);
    throw error;
  }
};

// Update permission for a shared folder
export const updateFolderShare = async (
  ownerUserId: string,
  folderId: string,
  recipientUserId: string,
  newPermission: 'read' | 'edit'
): Promise<void> => {
  try {
    // Update in owner's folder
    await db.ref(`/analysisfolders/${ownerUserId}/${folderId}/sharedWith/${recipientUserId}`).set(newPermission);

    // Update in recipient's shared folder
    await db.ref(`/sharedFolders/${recipientUserId}/${folderId}/permission`).set(newPermission);
  } catch (error) {
    console.error('Error updating folder share:', error);
    throw error;
  }
};

// Get analyses from a shared folder with permission checking
export const getAnalysesBySharedFolder = async (
  recipientUserId: string,
  folderId: string,
  ownerUserId: string,
  userPermission: 'read' | 'edit'
): Promise<Record<string, SavedAnalysis>> => {
  try {
    const snapshot = await db.ref(`/analyses/${ownerUserId}`).once('value');
    const analyses = snapshot.val() || {};

    const filtered: Record<string, SavedAnalysis> = {};
    Object.entries(analyses).forEach(([id, analysis]: [string, any]) => {
      if (analysis.folderId === folderId) {
        filtered[id] = analysis;
      }
    });

    return filtered;
  } catch (error) {
    console.error('Error fetching shared folder analyses:', error);
    throw error;
  }
};

// Load analysis from any user (for shared analyses)
export const loadAnalysisFromUser = async (
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

// Save analysis to a shared folder (for edit permission)
export const saveAnalysisToFolder = async (
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
  } catch (error) {
    console.error('Error saving analysis:', error);
    throw error;
  }
};

// ==================== PUBLIC FOLDER FUNCTIONS ====================

// Make a folder public
export const makePublic = async (
  ownerUserId: string,
  folderId: string
): Promise<void> => {
  try {
    const folderSnapshot = await db.ref(`/analysisfolders/${ownerUserId}/${folderId}`).once('value');
    const folder = folderSnapshot.val();
    if (!folder) {
      throw new Error('Folder not found');
    }

    const displayName = await getUsernameByUserId(ownerUserId);

    // Set folder as public
    await db.ref(`/analysisfolders/${ownerUserId}/${folderId}/isPublic`).set(true);
    await db.ref(`/analysisfolders/${ownerUserId}/${folderId}/ownerDisplayName`).set(displayName);

    // Add to public folders index
    await db.ref(`/publicFolders/${folderId}`).set({
      ownerUserId,
      folderId,
      name: folder.name,
      ownerDisplayName: displayName,
      createdAt: folder.createdAt,
      isPublic: true
    });
  } catch (error) {
    console.error('Error making folder public:', error);
    throw error;
  }
};

// Make a folder private
export const makePrivate = async (
  ownerUserId: string,
  folderId: string
): Promise<void> => {
  try {
    // Set folder as private
    await db.ref(`/analysisfolders/${ownerUserId}/${folderId}/isPublic`).set(false);

    // Remove from public folders index
    await db.ref(`/publicFolders/${folderId}`).remove();
  } catch (error) {
    console.error('Error making folder private:', error);
    throw error;
  }
};

// Get all public folders
export const getPublicFolders = async (): Promise<Record<string, AnalysisFolder & { folderId: string; ownerUserId: string }>> => {
  try {
    const snapshot = await db.ref(`/publicFolders`).once('value');
    const publicFolders = snapshot.val() || {};
    return publicFolders;
  } catch (error) {
    console.error('Error fetching public folders:', error);
    throw error;
  }
};

// Get analyses from a public folder
export const getAnalysesByPublicFolder = async (
  folderId: string,
  ownerUserId: string
): Promise<Record<string, SavedAnalysis>> => {
  try {
    const snapshot = await db.ref(`/analyses/${ownerUserId}`).once('value');
    const analyses = snapshot.val() || {};

    const filtered: Record<string, SavedAnalysis> = {};
    Object.entries(analyses).forEach(([id, analysis]: [string, any]) => {
      if (analysis.folderId === folderId) {
        filtered[id] = analysis;
      }
    });

    return filtered;
  } catch (error) {
    console.error('Error fetching public folder analyses:', error);
    throw error;
  }
};
