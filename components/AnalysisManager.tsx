import React, { useState, useEffect } from 'react';
import {
  getAllFolders,
  getAllAnalyses,
  getAnalysesByFolder,
  createFolder,
  deleteFolder,
  renameFolder,
  deleteAnalysis,
  renameAnalysis,
  moveAnalysisToFolder,
  generateId,
  AnalysisFolder,
  SavedAnalysis
} from '../utils/analysisFirebase';

interface AnalysisManagerProps {
  userId: string;
  onSelectAnalysis: (analysisId: string) => void;
  onBack: () => void;
}

interface ModalState {
  type: 'create_folder' | 'create_analysis' | 'rename_folder' | 'rename_analysis' | null;
  targetId?: string; // For rename operations
  targetName?: string;
}

const AnalysisManager: React.FC<AnalysisManagerProps> = ({
  userId,
  onSelectAnalysis,
  onBack
}) => {
  const [folders, setFolders] = useState<Record<string, AnalysisFolder>>({});
  const [analyses, setAnalyses] = useState<Record<string, SavedAnalysis>>({});
  const [selectedFolderId, setSelectedFolderId] = useState<string | null>(null);
  const [modal, setModal] = useState<ModalState>({ type: null });
  const [inputValue, setInputValue] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Load data on mount
  useEffect(() => {
    loadData();
  }, [userId]);

  const loadData = async () => {
    try {
      setLoading(true);
      setError(null);
      const foldersData = await getAllFolders(userId);
      const analysesData = await getAllAnalyses(userId);
      setFolders(foldersData);
      setAnalyses(analysesData);
      // Default to showing root folder
      setSelectedFolderId(null);
    } catch (err) {
      console.error('Error loading analysis data:', err);
      setError('Failed to load analyses');
    } finally {
      setLoading(false);
    }
  };

  const handleCreateFolder = async () => {
    if (!inputValue.trim()) return;
    try {
      const folderId = generateId();
      await createFolder(userId, folderId, inputValue);
      setFolders(prev => ({
        ...prev,
        [folderId]: { name: inputValue, createdAt: Date.now(), updatedAt: Date.now() }
      }));
      setModal({ type: null });
      setInputValue('');
    } catch (err) {
      console.error('Error creating folder:', err);
      setError('Failed to create folder');
    }
  };

  const handleRenameFolder = async () => {
    if (!inputValue.trim() || !modal.targetId) return;
    try {
      await renameFolder(userId, modal.targetId, inputValue);
      setFolders(prev => ({
        ...prev,
        [modal.targetId!]: {
          ...prev[modal.targetId!],
          name: inputValue
        }
      }));
      setModal({ type: null });
      setInputValue('');
    } catch (err) {
      console.error('Error renaming folder:', err);
      setError('Failed to rename folder');
    }
  };

  const handleDeleteFolder = async (folderId: string) => {
    if (!confirm('Delete this folder? (Only empty folders can be deleted)')) return;
    try {
      await deleteFolder(userId, folderId);
      setFolders(prev => {
        const updated = { ...prev };
        delete updated[folderId];
        return updated;
      });
      if (selectedFolderId === folderId) {
        setSelectedFolderId(null);
      }
    } catch (err) {
      console.error('Error deleting folder:', err);
      setError(err instanceof Error ? err.message : 'Failed to delete folder');
    }
  };

  const handleRenameAnalysis = async () => {
    if (!inputValue.trim() || !modal.targetId) return;
    try {
      await renameAnalysis(userId, modal.targetId, inputValue);
      setAnalyses(prev => ({
        ...prev,
        [modal.targetId!]: {
          ...prev[modal.targetId!],
          name: inputValue
        }
      }));
      setModal({ type: null });
      setInputValue('');
    } catch (err) {
      console.error('Error renaming analysis:', err);
      setError('Failed to rename analysis');
    }
  };

  const handleDeleteAnalysis = async (analysisId: string) => {
    if (!confirm('Delete this analysis?')) return;
    try {
      await deleteAnalysis(userId, analysisId);
      setAnalyses(prev => {
        const updated = { ...prev };
        delete updated[analysisId];
        return updated;
      });
    } catch (err) {
      console.error('Error deleting analysis:', err);
      setError('Failed to delete analysis');
    }
  };

  const handleMoveAnalysis = async (analysisId: string, folderId: string | null) => {
    try {
      await moveAnalysisToFolder(userId, analysisId, folderId);
      setAnalyses(prev => ({
        ...prev,
        [analysisId]: {
          ...prev[analysisId],
          folderId
        }
      }));
    } catch (err) {
      console.error('Error moving analysis:', err);
      setError('Failed to move analysis');
    }
  };

  // Get analyses for current folder (treat missing folderId as null)
  const currentAnalyses = Object.entries(analyses)
    .filter(([, analysis]: [string, SavedAnalysis]) => (analysis.folderId ?? null) === selectedFolderId)
    .sort(([, a]: [string, SavedAnalysis], [, b]: [string, SavedAnalysis]) => b.updatedAt - a.updatedAt);

  const formatDate = (timestamp: number) => {
    return new Date(timestamp).toLocaleDateString();
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-900 text-white">
        <p>Loading analyses...</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex flex-col bg-gray-900 text-white p-4">
      <div className="flex items-center justify-between mb-4">
        <h1 className="text-3xl font-bold text-green-400">Analysis Manager</h1>
        <button
          onClick={onBack}
          className="px-4 py-2 bg-gray-700 hover:bg-gray-600 rounded-lg font-semibold transition-colors"
        >
          Back to Menu
        </button>
      </div>

      {error && (
        <div className="bg-red-900/40 border border-red-600 text-red-200 px-4 py-2 rounded mb-4">
          {error}
          <button
            onClick={() => setError(null)}
            className="float-right text-red-400 hover:text-red-300"
          >
            ✕
          </button>
        </div>
      )}

      <div className="flex gap-4 flex-1 min-h-0">
        {/* Left sidebar: Folders */}
        <div className="w-64 bg-gray-800 rounded-lg p-4 overflow-y-auto">
          <div className="mb-4">
            <button
              onClick={() => {
                setModal({ type: 'create_folder' });
                setInputValue('');
              }}
              className="w-full px-3 py-2 bg-green-600 hover:bg-green-500 rounded font-semibold text-sm transition-colors"
            >
              + New Folder
            </button>
          </div>

          {/* Root/Unsorted folder */}
          <div
            onClick={() => setSelectedFolderId(null)}
            className={`p-3 rounded mb-2 cursor-pointer transition-colors ${
              selectedFolderId === null
                ? 'bg-green-600 text-white'
                : 'bg-gray-700 hover:bg-gray-600'
            }`}
          >
            <div className="text-sm font-semibold">📁 Unsorted</div>
            <div className="text-xs text-gray-400 mt-1">
              {Object.values(analyses).filter((a: SavedAnalysis) => (a.folderId ?? null) === null).length} analyses
            </div>
          </div>

          {/* User folders */}
          <div className="space-y-2">
            {Object.entries(folders)
              .sort(([, a]: [string, AnalysisFolder], [, b]: [string, AnalysisFolder]) => b.updatedAt - a.updatedAt)
              .map(([folderId, folder]: [string, AnalysisFolder]) => (
                <div
                  key={folderId}
                  className={`p-3 rounded group transition-colors ${
                    selectedFolderId === folderId
                      ? 'bg-green-600 text-white'
                      : 'bg-gray-700 hover:bg-gray-600'
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <div
                      onClick={() => setSelectedFolderId(folderId)}
                      className="flex-1 cursor-pointer"
                    >
                      <div className="text-sm font-semibold">📁 {folder.name}</div>
                      <div className="text-xs text-gray-400 mt-1">
                        {Object.values(analyses).filter((a: SavedAnalysis) => (a.folderId ?? null) === folderId).length}{' '}
                        analyses
                      </div>
                    </div>
                    {selectedFolderId === folderId && (
                      <div className="flex gap-1">
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            setModal({ type: 'rename_folder', targetId: folderId });
                            setInputValue(folder.name);
                          }}
                          className="p-1 text-xs bg-gray-600 hover:bg-gray-500 rounded"
                          title="Rename"
                        >
                          ✎
                        </button>
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            handleDeleteFolder(folderId);
                          }}
                          className="p-1 text-xs bg-red-700 hover:bg-red-600 rounded"
                          title="Delete"
                        >
                          ✕
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              ))}
          </div>
        </div>

        {/* Right panel: Analyses */}
        <div className="flex-1 bg-gray-800 rounded-lg p-4 overflow-y-auto">
          <div className="mb-4">
            <h2 className="text-xl font-bold text-green-400 mb-3">
              {selectedFolderId === null
                ? 'Unsorted Analyses'
                : folders[selectedFolderId]?.name || 'Analyses'}
            </h2>
          </div>

          {currentAnalyses.length === 0 ? (
            <div className="text-center text-gray-400 py-8">
              <p>No analyses in this folder</p>
            </div>
          ) : (
            <div className="space-y-2">
              {currentAnalyses.map(([analysisId, analysis]: [string, SavedAnalysis]) => (
                <div
                  key={analysisId}
                  className="p-4 bg-gray-700 hover:bg-gray-600 rounded transition-colors"
                >
                  <div className="flex items-center justify-between">
                    <div
                      onClick={() => onSelectAnalysis(analysisId)}
                      className="flex-1 cursor-pointer"
                    >
                      <h3 className="font-semibold text-white hover:text-green-400 transition-colors">
                        {analysis.name}
                      </h3>
                      <div className="text-xs text-gray-400 mt-1">
                        Created: {formatDate(analysis.createdAt)} • Updated:{' '}
                        {formatDate(analysis.updatedAt)}
                      </div>
                    </div>

                    {/* Folder selector */}
                    <select
                      onClick={(e) => e.stopPropagation()}
                      onChange={(e) => {
                        const newFolderId = e.target.value === 'null' ? null : e.target.value;
                        handleMoveAnalysis(analysisId, newFolderId);
                      }}
                      value={analysis.folderId || 'null'}
                      className="mx-2 px-2 py-1 text-xs bg-gray-600 text-white rounded border border-gray-500"
                    >
                      <option value="null">Unsorted</option>
                      {Object.entries(folders).map(([folderId, folder]: [string, AnalysisFolder]) => (
                        <option key={folderId} value={folderId}>
                          {folder.name}
                        </option>
                      ))}
                    </select>

                    {/* Action buttons */}
                    <div className="flex gap-2">
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          setModal({ type: 'rename_analysis', targetId: analysisId });
                          setInputValue(analysis.name);
                        }}
                        className="px-2 py-1 text-xs bg-blue-700 hover:bg-blue-600 rounded font-semibold"
                        title="Rename"
                      >
                        Rename
                      </button>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          handleDeleteAnalysis(analysisId);
                        }}
                        className="px-2 py-1 text-xs bg-red-700 hover:bg-red-600 rounded font-semibold"
                        title="Delete"
                      >
                        Delete
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Modal */}
      {modal.type && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-gray-800 rounded-lg p-6 w-full max-w-md">
            <h3 className="text-lg font-bold mb-4 capitalize">
              {modal.type.replace('_', ' ')}
            </h3>
            <input
              type="text"
              value={inputValue}
              onChange={(e) => setInputValue(e.target.value)}
              placeholder={
                modal.type === 'create_folder' ? 'Folder name' : 'Analysis name'
              }
              className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded text-white placeholder-gray-400 mb-4"
              onKeyPress={(e) => {
                if (e.key === 'Enter') {
                  if (modal.type === 'create_folder') handleCreateFolder();
                  else if (modal.type === 'rename_folder') handleRenameFolder();
                  else if (modal.type === 'rename_analysis') handleRenameAnalysis();
                }
              }}
              autoFocus
            />
            <div className="flex gap-2">
              <button
                onClick={() => {
                  setModal({ type: null });
                  setInputValue('');
                }}
                className="flex-1 px-3 py-2 bg-gray-600 hover:bg-gray-500 rounded font-semibold transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={() => {
                  if (modal.type === 'create_folder') handleCreateFolder();
                  else if (modal.type === 'rename_folder') handleRenameFolder();
                  else if (modal.type === 'rename_analysis') handleRenameAnalysis();
                }}
                className="flex-1 px-3 py-2 bg-green-600 hover:bg-green-500 rounded font-semibold transition-colors"
              >
                Save
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default AnalysisManager;
