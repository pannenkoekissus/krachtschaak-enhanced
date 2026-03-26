
import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { BoardState, Color, GameStatus, PieceType, Position, GameState, PromotionData, Piece, Move } from '../types';
import { createInitialBoard, getValidMoves, isPowerMove, hasLegalMoves, isKingInCheck, generateBoardKey, canCaptureKing, isAmbiguousMove, getNotation, applyMoveToBoard, sanitizeBoard, boardToFen, fenToBoard, generatePGN, isInsufficientMaterial } from '../utils/game';
import { playMoveSound, playCaptureSound, playWinSound, playDrawSound, playLossSound } from '../utils/sounds';
import { saveAnalysis, loadAnalysis, generateId, AnalysisFolder, SavedAnalysis } from '../utils/analysisFirebase';
import { getAllFolders } from '../utils/analysisFirebase';
import Board from './Board';
import GameOverlay from './GameOverlay';
import PieceComponent from './Piece';
import useOnlineStatus from '../utils/useOnlineStatus';


/** Public folder entry (writable ones can be save destinations). */
export type PublicFolderOption = { ownerUserId: string; folderId: string; name: string; isPublicWritable?: boolean };

interface AnalysisProps {
    initialState?: GameState;
    onBack: () => void;
    analysisId?: string;
    analysisOwnerUserId?: string;
    analysisFolderId?: string;
    /** When false, saving and editing (moves, comments) are disabled (read-only view). */
    canEditAnalysis?: boolean;
    /** 'shared' | 'public' when opening from a shared/public folder, so save modal pre-selects that folder. */
    analysisSourceFolderType?: 'shared' | 'public';
    analysisSharedFolders?: Record<string, any>;
    /** Public folders (writable ones shown as save destinations). */
    analysisPublicFolders?: Record<string, PublicFolderOption>;
    currentUser?: { uid: string };
    onBackToAnalysisManager?: () => void;
    onBackToMenu?: () => void;
    onBackToWhereIcameFrom?: () => void;
}

interface AnalysisTreeNode {
    id: string;
    gameState: GameState;
    notation: string | null;
    children: string[];
    parentId: string | null;
    lastVisited?: boolean;
    comment?: string;
}

const Analysis: React.FC<AnalysisProps> = ({ initialState, onBack, analysisId, analysisOwnerUserId, analysisFolderId, canEditAnalysis = true, analysisSourceFolderType, analysisSharedFolders, analysisPublicFolders, currentUser, onBackToAnalysisManager, onBackToMenu, onBackToWhereIcameFrom }) => {

    const formatTimerSettingText = (settings: GameState['timerSettings']) => {
        if (!settings) return 'Unlimited';
        if ('daysPerMove' in settings) return `${settings.daysPerMove} day${settings.daysPerMove > 1 ? 's' : ''} / move`;
        return `${settings.initialTime / 60} min | ${settings.increment} sec`;
    };

    const [selectedFolderId, setSelectedFolderId] = useState<string | null>(null);
    const [folders, setFolders] = useState<Record<string, AnalysisFolder>>({});
    const [isSaving, setIsSaving] = useState(false);
    const [isLoadingAnalysis, setIsLoadingAnalysis] = useState(false);
    const [loadedOnceFromFirebase, setLoadedOnceFromFirebase] = useState(false);
    // Tracks the active analysis ID across saves; starts from the prop but persists after first save
    const [currentAnalysisId, setCurrentAnalysisId] = useState<string | undefined>(analysisId);

    // Selection and interaction
    const [selectedPiece, setSelectedPiece] = useState<Position | null>(null);
    const [validMoves, setValidMoves] = useState<Position[]>([]);
    const [promotionData, setPromotionData] = useState<PromotionData | null>(null);
    const [ambiguousEnPassantData, setAmbiguousEnPassantData] = useState<{ from: Position, to: Position } | null>(null);
    const [isForcePowerMode, setIsForcePowerMode] = useState(false);
    const [draggedPiece, setDraggedPiece] = useState<Position | null>(null);
    const [boardOrientation, setBoardOrientation] = useState<Color>(Color.White);

    // Normalize loaded game state and ensure explicit empty squares
    const normalizeGameState = (raw: any): GameState => {
        let lastMove = raw?.lastMove ?? null;
        if (!lastMove && moveHistory.length > 0) {
            const lastHistoryItem = moveHistory[moveHistory.length - 1];
            if (lastHistoryItem && lastHistoryItem.from && lastHistoryItem.to) {
                lastMove = { from: lastHistoryItem.from, to: lastHistoryItem.to };
            }
        }
        const board = sanitizeBoard(raw?.board || createInitialBoard());
        return {
            board,
            turn: raw?.turn ?? Color.White,
            status: raw?.status ?? 'playing',
            winner: raw?.winner ?? null,
            promotionData: raw?.promotionData ?? null,
            capturedPieces: raw?.capturedPieces ?? { white: [], black: [] },
            enPassantTarget: raw?.enPassantTarget ?? null,
            halfmoveClock: raw?.halfmoveClock ?? 0,
            positionHistory: raw?.positionHistory ?? {},
            ambiguousEnPassantData: raw?.ambiguousEnPassantData ?? null,
            drawOffer: raw?.drawOffer ?? null,
            playerTimes: raw?.playerTimes ?? null,
            turnStartTime: raw?.turnStartTime ?? null,
            moveDeadline: raw?.moveDeadline ?? null,
            timerSettings: raw?.timerSettings ?? null,
            ratingCategory: raw?.ratingCategory ?? 'unlimited' as any,
            players: raw?.players ?? {},
            playerColors: raw?.playerColors ?? { white: null, black: null },
            initialRatings: raw?.initialRatings ?? null,
            isRated: raw?.isRated ?? false,
            rematchOffer: raw?.rematchOffer ?? null,
            nextGameId: raw?.nextGameId ?? null,
            ratingChange: raw?.ratingChange ?? null,
            moveHistory: raw?.moveHistory ?? [],
            lastMove: lastMove ?? null // <--- DEZE REGEL TOEVOEGEN
        };
    };

    // Navigation Tree
    // If we have move history, the root should be the STARTING position (before any moves),
    // not the final board position passed in initialState.
    const hasMoveHistory = initialState?.moveHistory && initialState.moveHistory.length > 0;
    const initialRootState: GameState = {
        board: hasMoveHistory ? createInitialBoard() : sanitizeBoard(initialState?.board || createInitialBoard()),
        turn: hasMoveHistory ? Color.White : (initialState?.turn || Color.White),
        status: 'playing',
        winner: null,
        promotionData: null,
        capturedPieces: hasMoveHistory ? { white: [], black: [] } : (initialState?.capturedPieces || { white: [], black: [] }),
        enPassantTarget: null,
        halfmoveClock: 0,
        positionHistory: hasMoveHistory ? {} : (initialState?.positionHistory || {}),
        ambiguousEnPassantData: null,
        drawOffer: null,
        playerTimes: initialState?.playerTimes || null,
        turnStartTime: null,
        moveDeadline: null,
        timerSettings: initialState?.timerSettings || null,
        ratingCategory: initialState?.ratingCategory || 'unlimited' as any,
        players: initialState?.players || {},
        playerColors: initialState?.playerColors || { white: null, black: null },
        initialRatings: initialState?.initialRatings || null,
        isRated: initialState?.isRated || false,
        rematchOffer: null,
        nextGameId: null,
        ratingChange: initialState?.ratingChange || null,
        moveHistory: []
    };

    // Build initial tree if move history exists
    const buildInitialTree = () => {
        const rootId = 'root';
        const rootNode: AnalysisTreeNode = {
            id: rootId,
            gameState: initialRootState,
            notation: null,
            children: [],
            parentId: null
            , comment: ''
        };
        const initialNodes: Record<string, AnalysisTreeNode> = { [rootId]: rootNode };
        let leafId = rootId;

        if (initialState?.moveHistory && initialState.moveHistory.length > 0) {
            let lastId = rootId;
            let currentBoard = initialRootState.board;
            let currentTurn = initialRootState.turn;
            let currentCaptured = { ...initialRootState.capturedPieces };

            // Gebruik een index (i) voor 100% nauwkeurigheid
            for (let i = 0; i < initialState.moveHistory.length; i++) {
                const move = initialState.moveHistory[i];
                const newNodeId = Math.random().toString(36).substr(2, 9);

                // Safety check for board integrity
                if (!currentBoard || !Array.isArray(currentBoard)) {
                    currentBoard = createInitialBoard();
                }

                const nextBoard = applyMoveToBoard(currentBoard, move);
                const nextTurn = currentTurn === Color.White ? Color.Black : Color.White;
                var ActualLastMove = move;
                const nextState: GameState = {
                    ...initialRootState,
                    board: nextBoard,
                    turn: nextTurn,
                    lastMove: move,
                    status: (i === initialState.moveHistory.length - 1) ? initialState.status : 'playing',
                    winner: (i === initialState.moveHistory.length - 1) ? initialState.winner : null,
                    // VERBETERD: Gebruik i + 1 in plaats van indexOf(move)
                    moveHistory: initialState.moveHistory.slice(0, i + 1),
                    enPassantTarget: move.piece === PieceType.Pawn && Math.abs(move.from.row - move.to.row) === 2
                        ? { row: (move.from.row + move.to.row) / 2, col: move.from.col }
                        : null,
                    capturedPieces: move.captured ? {
                        ...currentCaptured,
                        [move.color === Color.White ? Color.Black : Color.White]: [...currentCaptured[move.color === Color.White ? Color.Black : Color.White], { type: move.captured, color: move.color === Color.White ? Color.Black : Color.White, originalType: move.captured, isKing: move.captured === PieceType.King, hasMoved: true }]
                    } : currentCaptured
                };

                initialNodes[newNodeId] = {
                    id: newNodeId,
                    gameState: nextState,
                    notation: move.notation,
                    children: [],
                    parentId: lastId,
                    lastVisited: i === initialState.moveHistory.length - 1,
                    comment: ''
                };
                initialNodes[lastId].children.push(newNodeId);

                lastId = newNodeId;
                currentBoard = nextBoard;
                currentTurn = nextTurn;
                currentCaptured = nextState.capturedPieces;
            }
            leafId = lastId;
        }

        return { initialNodes, leafId };
    };

    // Build initial tree based on initialState - rebuilds when initialState changes
    const initialTree = useMemo(() => buildInitialTree(), [initialState]);

    // Initialize and manage nodes and currentNodeId
    const [nodes, setNodes] = useState<Record<string, AnalysisTreeNode>>(initialTree.initialNodes);
    const [currentNodeId, setCurrentNodeId] = useState<string>(initialTree.leafId);

    // Reset tree when initialState changes (for new analyses only, not when loading from Firebase)
    useEffect(() => {
        if (!analysisId) {
            setNodes(initialTree.initialNodes);
            setCurrentNodeId(initialTree.leafId);
            // Sync board state with new tree for new analyses
            if (initialTree.initialNodes[initialTree.leafId]) {
                applyState(initialTree.initialNodes[initialTree.leafId].gameState);
            }
        }
    }, [initialTree, analysisId]);

    // Load analysis if analysisId is provided — only once per mount
    useEffect(() => {
        if (analysisId && currentUser?.uid && !loadedOnceFromFirebase) {
            const loadSavedAnalysis = async () => {
                try {
                    setIsLoadingAnalysis(true);
                    const ownerUserId = analysisOwnerUserId || currentUser.uid;
                    const saved = await loadAnalysis(ownerUserId, analysisId);
                    if (saved) {
                        // Rebuild the tree from saved nodes, ensuring proper structure
                        const newNodes: Record<string, AnalysisTreeNode> = {};

                        for (const [id, node] of Object.entries(saved.nodes || {})) {
                            const normalized = normalizeGameState((node as any).gameState || {});
                            newNodes[id] = {
                                id: (node as any).id || id,
                                children: (node as any).children || [],
                                parentId: (node as any).parentId || null,
                                notation: (node as any).notation || null,
                                gameState: normalized,
                                lastVisited: (node as any).lastVisited !== false,
                                comment: (node as any).comment || '',

                            };
                        }

                        setNodes(newNodes);
                        setCurrentNodeId((saved as any).lastNodeId || (saved as any).rootNodeId);
                        if (newNodes[(saved as any).lastNodeId || (saved as any).rootNodeId]) {
                            applyState(newNodes[(saved as any).lastNodeId || (saved as any).rootNodeId].gameState);
                        }
                        setSaveName((saved as any).name || '');
                        if (saved.folderId) {
                            setSelectedFolderId(saved.folderId);
                        }
                        // mark as loaded once so we don't re-query Firebase for this analysis
                        setLoadedOnceFromFirebase(true);
                    }
                } catch (error) {
                    console.error('Error loading analysis:', error);
                } finally {
                    setIsLoadingAnalysis(false);
                }
            };
            loadSavedAnalysis();
        }
    }, [analysisId, analysisOwnerUserId, analysisFolderId, currentUser?.uid, loadedOnceFromFirebase]);

    // Stop worker on unmount
    useEffect(() => {
        return () => {
            stopWorker();
        };
    }, []);

    // Load folders for save dialog
    useEffect(() => {
        if (currentUser?.uid) {
            const loadFoldersList = async () => {
                try {
                    const foldersData = await getAllFolders(currentUser.uid);
                    setFolders(foldersData);
                } catch (error) {
                    console.error('Error loading folders:', error);
                }
            };
            loadFoldersList();
        }
    }, [currentUser?.uid]);


    const getResultMessage = () => {
        const game = initialState;
        if (!game) return "Analysis Mode";
        switch (game.status) {
            case 'kingCaptured': return `${game.winner} wins by capturing the king!`;
            case 'resignation': return (game.moveHistory && game.moveHistory.length < 2) ? `${game.winner} wins by abort.` : `${game.winner} wins by resignation.`;
            case 'checkmate': return `${game.winner} wins by checkmate!`;
            case 'stalemate': return `Stalemate! It's a draw.`;
            case 'draw_threefold': return `Draw by threefold repetition.`;
            case 'draw_fiftyMove': return `Draw by 50-move rule.`;
            case 'draw_agreement': return `Draw by agreement.`;
            case 'timeout': return `${game.winner} wins on time!`;
            case 'opponent_disconnected': return `${game.winner} wins, opponent disconnected.`;
            default: return "Game Analysis";
        }
    };

    const sanitizedPlayers = initialState?.players || {};
    const whitePlayer = initialState?.playerColors?.white ? sanitizedPlayers[initialState.playerColors.white] : null;
    const blackPlayer = initialState?.playerColors?.black ? sanitizedPlayers[initialState.playerColors.black] : null;
    const isRated = initialState?.isRated || false;
    const ratingChange = initialState?.ratingChange;
    const initialRatings = initialState?.initialRatings;
    const ratingCategory = initialState?.ratingCategory;
    const timerSettings = initialState?.timerSettings;

    // Game State
    const [board, setBoard] = useState<BoardState>(initialTree.initialNodes[initialTree.leafId]?.gameState?.board || createInitialBoard());
    const [turn, setTurn] = useState<Color>(initialTree.initialNodes[initialTree.leafId]?.gameState?.turn || Color.White);
    const [status, setStatus] = useState<GameStatus>('playing');
    const [winner, setWinner] = useState<string | null>(null);
    const [capturedPieces, setCapturedPieces] = useState<{ white: Piece[]; black: Piece[] }>({ white: [], black: [] });
    const [enPassantTarget, setEnPassantTarget] = useState<Position | null>(null);
    const [halfmoveClock, setHalfmoveClock] = useState<number>(0);
    const [positionHistory, setPositionHistory] = useState<Record<string, number>>({});
    const [moveHistory, setMoveHistory] = useState<Move[]>([]);
    const [lastMove, setLastMove] = useState<Move | { from: Position; to: Position } | null>(null);
    const [saveName, setSaveName] = useState<string>('');
    const [saveModalOpen, setSaveModalOpen] = useState(false);
    const [showLinkCopied, setShowLinkCopied] = useState(false);
    const [pgnInput, setPgnInput] = useState('');
    const [showExportModal, setShowExportModal] = useState(false);
    const [exportData, setExportData] = useState<{ type: string; value: string } | null>(null);

    // UI State
    const [highlightedSquares, setHighlightedSquares] = useState<Position[]>([]);
    const [arrows, setArrows] = useState<{ from: Position; to: Position, color?: string }[]>([]);
    const [engineArrows, setEngineArrows] = useState<{ from: Position; to: Position, color?: string }[]>([]);
    const [showEngineArrow, setShowEngineArrow] = useState(true);
    const [rightClickStartSquare, setRightClickStartSquare] = useState<Position | null>(null);
    const [contextMenu, setContextMenu] = useState<{ x: number, y: number, nodeId: string | null }>({ x: 0, y: 0, nodeId: null });

    // Close context menu on global click
    useEffect(() => {
        const handleClick = () => {
            if (contextMenu.nodeId) {
                setContextMenu({ x: 0, y: 0, nodeId: null });
            }
        };
        window.addEventListener('click', handleClick);
        return () => window.removeEventListener('click', handleClick);
    }, [contextMenu.nodeId]);

    // Engine State
    const [engineThinking, setEngineThinking] = useState(false);
    const [engineDepth, setEngineDepth] = useState(99);
    const [numLines, setNumLines] = useState(1);
    const [engineResults, setEngineResults] = useState<any[]>([]);
    const workerRef = useRef<Worker | null>(null);
    const requestIdRef = useRef<number | null>(null);

    const stopWorker = () => {
        if (workerRef.current) {
            try {
                workerRef.current.postMessage({ type: 'stop', requestId: requestIdRef.current });
            } catch (e) { }
            workerRef.current.terminate();
            workerRef.current = null;
        }
        requestIdRef.current = null;
        setEngineThinking(false);
        setEngineResults([]);
        setEngineArrows([]);
    };

    const handleGoingBack = (target?: 'menu' | 'whereIcameFrom' | 'manager') => {
        // Stop worker and clear state before navigating away
        stopWorker();
        setHighlightedSquares([]);
        setArrows([]);
        setEngineArrows([]);
        setSelectedPiece(null);
        setValidMoves([]);
        setPromotionData(null);
        setAmbiguousEnPassantData(null);
        setSaveModalOpen(false);
        // reset to initial tree/state for a clean editor
        setNodes(initialTree.initialNodes);
        setCurrentNodeId(initialTree.leafId);
        if (initialTree.initialNodes[initialTree.leafId]) {
            applyState(initialTree.initialNodes[initialTree.leafId].gameState);
        }
        // clear temporary UI fields
        setSaveName('');
        setLoadedOnceFromFirebase(false);
        // Call the callback
        if (target === 'menu') onBackToMenu?.();
        else if (target === 'whereIcameFrom') onBackToWhereIcameFrom?.();
        else if (target === 'manager') onBackToAnalysisManager?.();
        else onBack();
    };

    const moveListRef = useRef<HTMLDivElement>(null);
    const currentMoveRef = useRef<HTMLDivElement>(null);
    const longTouchTimerRef = useRef<NodeJS.Timeout | null>(null);
    const isLongPressActive = useRef(false);

    const handleGetEngineMove = () => {
        if (engineThinking) {
            stopWorker();
            return;
        }

        setEngineThinking(true);
        setEngineResults([]);
        setEngineArrows([]);

        const requestId = Date.now();
        requestIdRef.current = requestId;

        if (!workerRef.current) {
            workerRef.current = new Worker(new URL('../engine.worker.ts', import.meta.url), { type: 'module' });
            workerRef.current.onmessage = (ev) => {
                const msg = ev.data || {};
                if (msg.requestId !== requestIdRef.current) return;

                if (msg.type === 'update' || msg.type === 'done') {
                    if (msg.results && msg.results.length > 0) {
                        setEngineResults(msg.results);
                        // Draw arrow for the very best move (first result)
                        const bestMove = msg.results[0].move;
                        if (bestMove) {
                            setEngineArrows([{ from: bestMove.from, to: bestMove.to, color: 'orange' }]);
                        }
                    }
                    if (msg.type === 'done') {
                        setEngineThinking(false);
                        requestIdRef.current = null;
                    }
                }
                if (msg.type === 'error') {
                    setEngineThinking(false);
                    workerRef.current?.terminate();
                    workerRef.current = null;
                }
            };
        }

        workerRef.current.postMessage({ type: 'start', board, turn, maxDepth: engineDepth, requestId, multiPv: numLines });
    };

    useEffect(() => {
        return () => {
            if (workerRef.current) workerRef.current.terminate();
        };
    }, []);

    useEffect(() => {
        const handleClick = () => {
            if (contextMenu.nodeId) {
                setContextMenu({ x: 0, y: 0, nodeId: null });
            }
        };
        window.addEventListener('click', handleClick);
        return () => window.removeEventListener('click', handleClick);
    }, [contextMenu.nodeId]);

    const deleteFromHere = (nodeId: string) => {
        if (nodeId === 'root') return;
        const nodeToDelete = nodes[nodeId];
        if (!nodeToDelete) return;

        const parentId = nodeToDelete.parentId;
        if (!parentId) return;

        const nodesToRemove: string[] = [];
        const collect = (id: string) => {
            nodesToRemove.push(id);
            const n = nodes[id];
            if (n && n.children) {
                n.children.forEach(cid => collect(cid));
            }
        };
        collect(nodeId);

        if (nodesToRemove.includes(currentNodeId)) {
            goToNode(parentId, false);
        }

        setNodes(prev => {
            const next = { ...prev };
            const parent = next[parentId];
            if (!parent) return prev;

            next[parentId] = {
                ...parent,
                children: parent.children.filter(id => id !== nodeId)
            };

            nodesToRemove.forEach(id => delete next[id]);
            return next;
        });

        setContextMenu({ x: 0, y: 0, nodeId: null });
        if (nodes[nodes[nodeId].parentId!]?.parentId === null) setLastMove(null);
    };

    const handleMoveTouchStart = (e: React.TouchEvent, nodeId: string) => {
        isLongPressActive.current = false;
        if (longTouchTimerRef.current) clearTimeout(longTouchTimerRef.current);

        const touch = e.touches[0];
        const clientX = touch.clientX;
        const clientY = touch.clientY;

        longTouchTimerRef.current = setTimeout(() => {
            isLongPressActive.current = true;
            setContextMenu({ x: clientX, y: clientY, nodeId: nodeId });
            if (navigator.vibrate) try { navigator.vibrate(50); } catch (e) { }
        }, 500);
    };

    const handleMoveTouchEnd = () => {
        if (longTouchTimerRef.current) {
            clearTimeout(longTouchTimerRef.current);
            longTouchTimerRef.current = null;
        }
    };

    const handleMoveTouchMove = () => {
        handleMoveTouchEnd();
    };


    const updateValidMoves = useCallback(() => {
        if (selectedPiece && status !== 'promotion' && status !== 'ambiguous_en_passant') {
            // Validate board state
            if (!board || !Array.isArray(board) || board.length !== 8 || !board.every(row => Array.isArray(row) && row.length === 8)) {
                console.error('Invalid board state detected');
                setValidMoves([]);
                return;
            }
            const moves = getValidMoves(board, selectedPiece, enPassantTarget, true);
            setValidMoves(moves);
        } else {
            setValidMoves([]);
        }
    }, [selectedPiece, board, enPassantTarget, status]);

    useEffect(() => {
        updateValidMoves();
        // Auto-scroll to current move within the move list only
        if (currentMoveRef.current && moveListRef.current) {
            const moveElement = currentMoveRef.current;
            const container = moveListRef.current;

            const elementTop = moveElement.offsetTop;
            const elementHeight = moveElement.offsetHeight;
            const containerScrollTop = container.scrollTop;
            const containerHeight = container.clientHeight;

            // Scroll if element is above or below visible area
            if (elementTop < containerScrollTop) {
                container.scrollTop = elementTop;
            } else if (elementTop + elementHeight > containerScrollTop + containerHeight) {
                container.scrollTop = elementTop + elementHeight - containerHeight;
            }
        }
    }, [updateValidMoves, currentNodeId]);

    const handleUndo = useCallback(() => {
        setDraggedPiece(null);
        const currentNode = nodes[currentNodeId];
        if (currentNode.parentId) {
            goToNode(currentNode.parentId, false); // No sound for undo
        }
        if (nodes[nodes[currentNodeId].parentId]?.parentId === null) setLastMove(null); // Clear highlights if we're at the root
    }, [currentNodeId, nodes]);

    const handleRedo = useCallback(() => {
        const currentNode = nodes[currentNodeId];
        if (currentNode.children.length > 0) {
            const lastVisitedChild = currentNode.children.find(id => nodes[id].lastVisited) || currentNode.children[0];
            goToNode(lastVisitedChild, true); // Sound for redo
        }
    }, [currentNodeId, nodes]);

    const handleSaveAnalysis = async () => {
        if (!canEditAnalysis || !currentUser?.uid || !saveName.trim()) return;

        try {
            setIsSaving(true);
            let saveToUserId: string;
            let finalFolderId: string | null;
            if (selectedFolderId?.startsWith('public_')) {
                const folderId = selectedFolderId.replace('public_', '');
                const pub = analysisPublicFolders?.[folderId];
                if (!pub?.isPublicWritable) {
                    alert('That public folder is not writable.');
                    return;
                }
                saveToUserId = pub.ownerUserId;
                finalFolderId = folderId;
            } else if (selectedFolderId?.startsWith('shared_')) {
                const folderId = selectedFolderId.replace('shared_', '');
                const shared = analysisSharedFolders?.[folderId];
                if (!shared?.permission || shared.permission !== 'edit') {
                    alert('You do not have edit access to that folder.');
                    return;
                }
                saveToUserId = shared.ownerUserId ?? currentUser.uid;
                finalFolderId = folderId;
            } else {
                saveToUserId = currentUser.uid;
                finalFolderId = selectedFolderId || null;
            }

            const currentOwner = analysisOwnerUserId || currentUser.uid;
            const isSameOwner = saveToUserId === currentOwner;
            const analysisToSave = currentAnalysisId ?? generateId();

            const rootId = 'root';
            const analysisData: SavedAnalysis = {
                name: saveName,
                folderId: finalFolderId,
                nodes: nodes,
                rootNodeId: rootId,
                createdAt: Date.now(),
                updatedAt: Date.now(),
                lastNodeId: currentNodeId,
            } as any;
            await saveAnalysis(saveToUserId, analysisToSave, analysisData);
            setSaveModalOpen(false);

            // Reload the freshly saved analysis and update component state
            const saved = await loadAnalysis(saveToUserId, analysisToSave);
            if (saved) {
                const newNodes: Record<string, AnalysisTreeNode> = {};
                for (const [id, node] of Object.entries(saved.nodes || {})) {
                    const normalized = normalizeGameState((node as any).gameState || {});
                    newNodes[id] = {
                        id: (node as any).id || id,
                        children: (node as any).children || [],
                        parentId: (node as any).parentId || null,
                        notation: (node as any).notation || null,
                        gameState: normalized,
                        lastVisited: (node as any).lastVisited !== false,
                        comment: (node as any).comment || '',
                    };
                }
                setNodes(newNodes);
                const newCurrentNodeId = (saved as any).lastNodeId || (saved as any).rootNodeId;
                setCurrentNodeId(newCurrentNodeId);
                if (newNodes[newCurrentNodeId]) {
                    applyState(newNodes[newCurrentNodeId].gameState);
                }
                setSaveName((saved as any).name || saveName);
                setCurrentAnalysisId(analysisToSave);
                setLoadedOnceFromFirebase(true);
            }

            alert('Analysis saved successfully!');
        } catch (error) {
            console.error('Error saving analysis:', error);
            alert('Failed to save analysis');
        } finally {
            setIsSaving(false);
        }
    };

    const handleShareLink = () => {
        if (!currentAnalysisId) return;
        const ownerId = analysisOwnerUserId || currentUser?.uid;
        if (!ownerId) return;

        let url = `${window.location.origin}${window.location.pathname}?analysisId=${currentAnalysisId}&ownerId=${ownerId}`;
        if (analysisFolderId) url += `&folderId=${analysisFolderId}`;
        if (analysisSourceFolderType) url += `&sourceType=${analysisSourceFolderType}`;

        navigator.clipboard.writeText(url).then(() => {
            setShowLinkCopied(true);
            setTimeout(() => setShowLinkCopied(false), 2000);
        });
    };

    const handleImportPGN = () => {
        if (!pgnInput) return;
        
        // Basic PGN parser
        let initialFen = "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1";
        const fenMatch = pgnInput.match(/\[FEN\s+"([^"]+)"\]/);
        if (fenMatch) initialFen = fenMatch[1];

        const startState = fenToBoard(initialFen) as GameState;
        if (!startState) {
            alert("Invalid starting FEN in PGN");
            return;
        }

        // Extract moves (strip tags, comments, variations, numbers, and extra space)
        const moveText = pgnInput
            .replace(/\[.*?\]/g, '')        // Remove tags
            .replace(/\{.*?\}/g, '')        // Remove comments { ... }
            .replace(/\(.*?\)/g, '')        // Remove variations ( ... ) - note: non-recursive
            .replace(/\d+\.+/g, '')         // Remove move numbers like 1., 1..., etc.
            .replace(/\$\d+/g, '')          // Remove NAGs like $1, $2
            .trim();
        const moveStrings = moveText.split(/\s+/).filter(s => s && !s.includes('*') && !s.match(/^[0-1]-[0-1]$/) && s !== '1/2-1/2');

        const doesMoveMatchSAN = (from: Position, to: Position, piece: Piece, capturedPiece: Piece | null, promotion: PieceType | null, sanNotation: string) => {
            const cleanSan = sanNotation.replace(/[+#!\?\^]/g, '');
            // check castling
            if (cleanSan === 'O-O' || cleanSan === '0-0') return piece.originalType === PieceType.King && to.col - from.col === 2;
            if (cleanSan === 'O-O-O' || cleanSan === '0-0-0') return piece.originalType === PieceType.King && from.col - to.col === 2;
            
            const match = cleanSan.match(/^([KQRBN])?([a-h])?([1-8])?(x)?([a-h][1-8])(?:=?([QRBN]))?$/);
            if (!match) return false;

            const sanPieceStr = match[1];
            const sanFromFile = match[2];
            const sanFromRank = match[3];
            const sanCapture = match[4];
            const sanToSquare = match[5];
            const sanPromotionStr = match[6];

            let expectedPieceType = PieceType.Pawn;
            if (sanPieceStr === 'K') expectedPieceType = PieceType.King;
            else if (sanPieceStr === 'Q') expectedPieceType = PieceType.Queen;
            else if (sanPieceStr === 'R') expectedPieceType = PieceType.Rook;
            else if (sanPieceStr === 'B') expectedPieceType = PieceType.Bishop;
            else if (sanPieceStr === 'N') expectedPieceType = PieceType.Knight;

            if (piece.originalType !== expectedPieceType) return false;

            const targetFile = String.fromCharCode('a'.charCodeAt(0) + to.col);
            const targetRank = (8 - to.row).toString();
            if (sanToSquare !== `${targetFile}${targetRank}`) return false;

            const fromFileStr = String.fromCharCode('a'.charCodeAt(0) + from.col);
            const fromRankStr = (8 - from.row).toString();

            if (sanFromFile && sanFromFile !== fromFileStr) return false;
            if (sanFromRank && sanFromRank !== fromRankStr) return false;

            if (sanCapture && !capturedPiece) return false; 

            if (sanPromotionStr) {
                let eprom = null;
                if (sanPromotionStr === 'Q') eprom = PieceType.Queen;
                else if (sanPromotionStr === 'R') eprom = PieceType.Rook;
                else if (sanPromotionStr === 'B') eprom = PieceType.Bishop;
                else if (sanPromotionStr === 'N') eprom = PieceType.Knight;
                if (promotion !== eprom) return false;
            } else if (promotion) {
                return false;
            }

            return true;
        };

        // Start from root node with initial FEN
        const importRootId = 'root';
        const newNodes: Record<string, AnalysisTreeNode> = {
            [importRootId]: {
                id: importRootId,
                gameState: startState,
                notation: null,
                children: [],
                parentId: null
            }
        };

        let tempBoard = startState.board;
        let tempTurn = startState.turn;
        let tempEp = startState.enPassantTarget;
        let tempHalfmove = startState.halfmoveClock;
        let lastNodeId = importRootId;
        for (const notation of moveStrings) {
            let foundMove: Move | null = null;

            // Find the move that matches this notation
            for (let r = 0; r < 8; r++) {
                for (let c = 0; c < 8; c++) {
                    const piece = tempBoard[r][c];
                    if (piece && piece.color === tempTurn) {
                        const from = { row: r, col: c };
                        const validMoves = getValidMoves(tempBoard, from, tempEp, true);
                        
                        for (const to of validMoves) {
                            // Determine captured piece for notation
                            let capturedPiece: Piece | null = tempBoard[to.row][to.col];
                            if (!capturedPiece && piece.type === PieceType.Pawn && tempEp && to.row === tempEp.row && to.col === tempEp.col) {
                                capturedPiece = tempBoard[from.row][to.col];
                            }

                            // Check standard move
                            const n = getNotation(tempBoard, from, to, piece, capturedPiece, null);
                            if (n === notation || doesMoveMatchSAN(from, to, piece, capturedPiece, null, notation)) {
                                foundMove = { from, to, notation: n, piece: piece.type, color: tempTurn, captured: capturedPiece?.type };
                                break;
                            }
                            // Check for possible promotion
                            if (piece.type === PieceType.Pawn && (to.row === 0 || to.row === 7)) {
                                for (const prom of [PieceType.Queen, PieceType.Rook, PieceType.Bishop, PieceType.Knight]) {
                                    const nProm = getNotation(tempBoard, from, to, piece, capturedPiece, prom);
                                    if (nProm === notation || doesMoveMatchSAN(from, to, piece, capturedPiece, prom, notation)) {
                                        foundMove = { from, to, notation: nProm, piece: piece.type, color: tempTurn, promotion: prom, captured: capturedPiece?.type };
                                        break;
                                    }
                                }
                            }
                            if (foundMove) break;
                        }
                    }
                    if (foundMove) break;
                }
                if (foundMove) break;
            }
            
            if (!foundMove) {
                console.warn(`Could not find legal move for notation: ${notation}`);
                break; 
            }

            const nextBoard = applyMoveToBoard(tempBoard, foundMove);
            
            // Calculate next EP target
            let nextEp: Position | null = null;
            if (foundMove.piece === PieceType.Pawn && Math.abs(foundMove.from.row - foundMove.to.row) === 2) {
                nextEp = { row: (foundMove.from.row + foundMove.to.row) / 2, col: foundMove.from.col };
            }

            const nextTurn = tempTurn === Color.White ? Color.Black : Color.White;
            const nextState = normalizeGameState({
                board: nextBoard,
                turn: nextTurn,
                enPassantTarget: nextEp,
                halfmoveClock: tempHalfmove + 1,
                lastMove: foundMove
            });

            const newNodeId = Date.now().toString() + Math.random().toString(36).substr(2, 5);
            
            newNodes[newNodeId] = {
                id: newNodeId,
                gameState: nextState,
                notation: foundMove.notation,
                children: [],
                parentId: lastNodeId
            };
            newNodes[lastNodeId].children.push(newNodeId);

            tempBoard = nextBoard;
            tempTurn = nextTurn;
            tempEp = nextEp;
            tempHalfmove = nextState.halfmoveClock;
            lastNodeId = newNodeId;
        }


        setNodes(newNodes);
        setCurrentNodeId(lastNodeId);
        applyState(newNodes[lastNodeId].gameState);
        setPgnInput("");
    };

    const handleCopyFen = () => {
        const fen = boardToFen(nodes[currentNodeId].gameState);
        navigator.clipboard.writeText(fen);
        setExportData({ type: 'FEN', value: fen });
        setShowExportModal(true);
    };

    const handleCopyPGN = () => {
        const history: Move[] = [];
        let currId = currentNodeId;
        while (currId && nodes[currId]) {
            const curr = nodes[currId];
            if (curr.notation) {
                history.unshift({ notation: curr.notation } as Move);
            }
            currId = curr.parentId || "";
            if (!currId) break;
        }
        
        const rootNode = nodes['root'];
        const initialFen = boardToFen(rootNode.gameState);
        const pgn = generatePGN(history, "*", initialFen);
        
        navigator.clipboard.writeText(pgn);
        setExportData({ type: 'PGN', value: pgn });
        setShowExportModal(true);
    };

    const commitNewState = (newState: GameState, notation: string) => {
        const newNodeId = Date.now().toString() + Math.random().toString(36).substr(2, 5);

        // Check if this move already exists as a child of the current node
        const currentNode = nodes[currentNodeId];
        const existingChildId = currentNode.children.find(childId => {
            const child = nodes[childId];
            return child.notation === notation;
        });

        if (existingChildId) {
            setCurrentNodeId(existingChildId);
            applyState(nodes[existingChildId].gameState);
            return;
        }

        const newNode: AnalysisTreeNode = {
            id: newNodeId,
            gameState: newState,
            notation: notation,
            children: [],
            parentId: currentNodeId
            , comment: ''
        };

        setNodes(prev => ({
            ...prev,
            [currentNodeId]: {
                ...prev[currentNodeId],
                children: [...prev[currentNodeId].children, newNodeId]
            },
            [newNodeId]: newNode
        }));

        setCurrentNodeId(newNodeId);
        applyState(newState);
        stopWorker();
    };


    const goToNode = (nodeId: string, playSound = true) => {
        setDraggedPiece(null);
        if (nodes[nodeId]) {
            // Mark path from root as last visited
            setNodes(prev => {
                const newNodes = { ...prev };
                const parentId = newNodes[nodeId].parentId;
                if (parentId) {
                    newNodes[parentId].children.forEach(childId => {
                        newNodes[childId] = { ...newNodes[childId], lastVisited: false };
                    });
                }
                newNodes[nodeId] = { ...newNodes[nodeId], lastVisited: true };
                return newNodes;
            });

            if (playSound) {
                const state = nodes[nodeId].gameState;
                const history = state.moveHistory || [];
                if (history.length > 0) {
                    const lastMoveInState = history[history.length - 1];
                    if (lastMoveInState.captured) {
                        playCaptureSound();
                    } else {
                        playMoveSound();
                    }
                } else {
                    playMoveSound();
                }
            }

            setCurrentNodeId(nodeId);
            applyState(nodes[nodeId].gameState);
        }
    };

    const promoteVariation = (nodeId: string) => {
        const node = nodes[nodeId];
        if (!node.parentId) return;

        setNodes(prev => {
            const parent = prev[node.parentId!];
            const newChildren = [nodeId, ...parent.children.filter(id => id !== nodeId)];
            return {
                ...prev,
                [node.parentId!]: { ...parent, children: newChildren }
            };
        });
    };

    const getCurrentLine = () => {
        const line: AnalysisTreeNode[] = [];
        // 1. Walk up to root to get the history
        let curr = nodes[currentNodeId];
        if (!curr) return [];

        while (curr && curr.id !== 'root') {
            line.unshift(curr);
            if (curr.parentId) {
                curr = nodes[curr.parentId];
            } else {
                break;
            }
        }

        // 2. Walk down from current node to get the "continuation"
        // We follow the last visited child, or the first one if none were specifically visited
        let future = nodes[currentNodeId];
        while (future && future.children.length > 0) {
            const nextId = future.children.find(id => nodes[id]?.lastVisited) || future.children[0];
            const nextNode = nodes[nextId];
            if (!nextNode) break;
            line.push(nextNode);
            future = nextNode;
        }

        return line;
    };

    const currentLine = getCurrentLine();

    const getCurrentState = (): GameState => ({
        board,
        turn,
        status,
        winner,
        capturedPieces,
        enPassantTarget,
        halfmoveClock,
        positionHistory,
        moveHistory,
        lastMove: lastMove as { from: Position; to: Position } | null,
        promotionData,
        ambiguousEnPassantData,
        drawOffer: null,
        playerTimes: initialState?.playerTimes || null,
        turnStartTime: initialState?.turnStartTime || null,
        moveDeadline: initialState?.moveDeadline || null,
        rematchOffer: null,
        nextGameId: null,
        ratingChange: initialState?.ratingChange || null,
        timerSettings: initialState?.timerSettings || null,
        players: initialState?.players || {},
        playerColors: initialState?.playerColors || { white: null, black: null },
        initialRatings: initialState?.initialRatings || null,
        isRated: initialState?.isRated || false,
        ratingCategory: initialState?.ratingCategory || 'unlimited' as any,
    });

    const applyState = (state: GameState) => {
        setBoard(state.board);
        setTurn(state.turn);
        setStatus(state.status || 'playing');
        setWinner(state.winner || null);
        setCapturedPieces(state.capturedPieces || { white: [], black: [] });
        setEnPassantTarget(state.enPassantTarget || null);
        setHalfmoveClock(state.halfmoveClock || 0);
        setPositionHistory(state.positionHistory || {});
        setMoveHistory(state.moveHistory || []);
        setLastMove(state.lastMove || null);
        setPromotionData(state.promotionData || null);
        setAmbiguousEnPassantData(state.ambiguousEnPassantData || null);
        setSelectedPiece(null);
        setValidMoves([]);
    };

    const handleKeyDown = useCallback((e: KeyboardEvent) => {
        if (e.repeat) return;
        if (['INPUT', 'TEXTAREA'].includes((e.target as HTMLElement).tagName)) return;

        if (e.key === 'ArrowLeft') {
            handleUndo();
        } else if (e.key === 'ArrowRight') {
            handleRedo();
        } else if (e.key === 'ArrowUp') {
            // Variation navigation up
            const currentNode = nodes[currentNodeId];
            if (currentNode.parentId) {
                const parent = nodes[currentNode.parentId];
                if (parent.children.length > 1) {
                    const idx = parent.children.indexOf(currentNodeId);
                    const nextIdx = (idx - 1 + parent.children.length) % parent.children.length;
                    goToNode(parent.children[nextIdx], true);
                }
            }
        } else if (e.key === 'ArrowDown') {
            // Variation navigation down
            const currentNode = nodes[currentNodeId];
            if (currentNode.parentId) {
                const parent = nodes[currentNode.parentId];
                if (parent.children.length > 1) {
                    const idx = parent.children.indexOf(currentNodeId);
                    const nextIdx = (idx + 1) % parent.children.length;
                    goToNode(parent.children[nextIdx], true);
                }
            }
        }
    }, [handleUndo, handleRedo, nodes, currentNodeId]);

    useEffect(() => {
        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [handleKeyDown]);


    const finalizeTurn = (
        currentBoard: BoardState,
        nextEnPassantTarget: Position | null,
        resetClock: boolean,
        newCaptured: typeof capturedPieces,
        move: { from: Position; to: Position },
        movingPiece: Piece,
        capturedPiece: Piece | null = null,
        promotion?: PieceType | null,
    ) => {
        const nextTurn = turn === Color.White ? Color.Black : Color.White;
        const newHalfmoveClock = resetClock ? 0 : halfmoveClock + 1;
        const key = generateBoardKey(currentBoard, nextTurn, nextEnPassantTarget);
        const isIrreversible = !!capturedPiece || movingPiece.type === PieceType.Pawn;
        const newCount = isIrreversible ? 1 : (positionHistory[key] || 0) + 1;
        const newPositionHistory = isIrreversible ? { [key]: 1 } : { ...positionHistory, [key]: newCount };
        let newStatus: GameStatus = 'playing';
        let newWinner: string | null = null;

        if (newHalfmoveClock >= 100) {
            newStatus = 'draw_fiftyMove';
        } else if (newCount >= 3) {
            newStatus = 'draw_threefold';
        } else if (isInsufficientMaterial(currentBoard)) {
            newStatus = 'draw_insufficient';
        } else {
            const capturedKing = newCaptured.white.some(p => p.isKing || p.originalType === PieceType.King || p.type === PieceType.King || p.power === PieceType.King) ||
                newCaptured.black.some(p => p.isKing || p.originalType === PieceType.King || p.type === PieceType.King || p.power === PieceType.King);
            if (capturedKing) {
                newStatus = 'kingCaptured';
                newWinner = nextTurn === Color.White ? 'Black' : 'White'; // Fixed winner logic: turn is the one who just moved
            } else {
                const hasStandardLegalMoves = hasLegalMoves(currentBoard, nextTurn, nextEnPassantTarget);
                const canPlayerCaptureKing = canCaptureKing(currentBoard, nextTurn);

                if (!hasStandardLegalMoves && !canPlayerCaptureKing) {
                    const isPlayerInCheck = isKingInCheck(currentBoard, nextTurn);
                    if (isPlayerInCheck) {
                        newStatus = 'checkmate';
                        newWinner = nextTurn === Color.White ? 'Black' : 'White';
                    } else {
                        newStatus = 'stalemate';
                    }
                }
            }
        }

        const notation = getNotation(board, move.from, move.to, movingPiece, capturedPiece, promotion || null, isForcePowerMode);
        const newMoveHistory = [...moveHistory, { ...move, notation, piece: movingPiece.type, color: turn, captured: capturedPiece?.type, promotion: promotion || undefined }];

        const newState: GameState = {
            ...getCurrentState(),
            board: currentBoard,
            turn: nextTurn,
            halfmoveClock: newHalfmoveClock,
            positionHistory: newPositionHistory,
            enPassantTarget: nextEnPassantTarget,
            status: newStatus,
            winner: newWinner,
            capturedPieces: newCaptured,
            moveHistory: newMoveHistory,
            lastMove: move,
            promotionData: null,
            ambiguousEnPassantData: null
        };

        // Play sounds
        if (newStatus === 'checkmate' || newStatus === 'kingCaptured') {
            playWinSound();
        } else if (newStatus === 'stalemate' || newStatus === 'draw_threefold' || newStatus === 'draw_fiftyMove' || newStatus === 'draw_insufficient') {
            playDrawSound();
        } else {
            const isCapture = !!capturedPiece;
            if (isCapture) {
                playCaptureSound();
            } else {
                playMoveSound();
            }
        }

        commitNewState(newState, notation);
    };

    const applyEngineMove = (move: Move) => {
        if (!canEditAnalysis) return;
        const newBoard = board.map(row => [...row]);
        const pieceToMove = { ...newBoard[move.from.row][move.from.col]! };
        const capturedPieceOnTarget = newBoard[move.to.row][move.to.col];
        let resetHalfmoveClock = pieceToMove.type === PieceType.Pawn;

        const newCapturedPieces = {
            white: [...capturedPieces.white],
            black: [...capturedPieces.black],
        };

        const isEnPassantCapture = (pieceToMove.type === PieceType.Pawn || pieceToMove.power === PieceType.Pawn) && enPassantTarget && move.to.row === enPassantTarget.row && move.to.col === enPassantTarget.col && !capturedPieceOnTarget;

        let actualCapturedPiece = capturedPieceOnTarget;
        if (isEnPassantCapture) {
            actualCapturedPiece = newBoard[move.from.row][move.to.col];
            newBoard[move.from.row][move.to.col] = null;
        }

        let acquiredPower: PieceType | null = null;
        if (actualCapturedPiece) {
            resetHalfmoveClock = true;
            newCapturedPieces[actualCapturedPiece.color].push(actualCapturedPiece);
            if (!(actualCapturedPiece.isKing || actualCapturedPiece.originalType === PieceType.King)) {
                acquiredPower = actualCapturedPiece.originalType;
            }
        }

        let powerAfterMove = pieceToMove.power;
        if (actualCapturedPiece && acquiredPower) {
            powerAfterMove = acquiredPower;
        } else if (move.isForcePower) {
            powerAfterMove = null;
        }
        pieceToMove.power = powerAfterMove;

        if (move.promotion) {
            pieceToMove.type = move.promotion;

            if (isEnPassantCapture && newBoard[move.from.row][move.to.col] === actualCapturedPiece) {
                pieceToMove.power = null;
            } else if (actualCapturedPiece) {
                pieceToMove.power = actualCapturedPiece.originalType === PieceType.Pawn ? null : actualCapturedPiece.originalType;
            } else {
                if (pieceToMove.originalType === PieceType.Pawn && !move.isForcePower) {
                    pieceToMove.power = pieceToMove.power === PieceType.Pawn ? null : pieceToMove.power;
                } else {
                    pieceToMove.power = null;
                }
            }
        }

        pieceToMove.hasMoved = true;
        newBoard[move.to.row][move.to.col] = pieceToMove;
        newBoard[move.from.row][move.from.col] = null;

        if (pieceToMove.type === PieceType.King && Math.abs(move.from.col - move.to.col) === 2) {
            const isKingside = move.to.col > move.from.col;
            const rookFromCol = isKingside ? 7 : 0;
            const rookToCol = isKingside ? 5 : 3;
            const rook = newBoard[move.from.row][rookFromCol];
            if (rook) {
                newBoard[move.from.row][rookToCol] = { ...rook, hasMoved: true };
                newBoard[move.from.row][rookFromCol] = null;
            }
        }

        let nextEnPassantTarget: Position | null = null;
        if (pieceToMove.type === PieceType.Pawn && Math.abs(move.from.row - move.to.row) === 2) {
            nextEnPassantTarget = { row: (move.from.row + move.to.row) / 2, col: move.from.col };
        }

        finalizeTurn(newBoard, nextEnPassantTarget, resetHalfmoveClock, newCapturedPieces, { from: move.from, to: move.to }, pieceToMove, actualCapturedPiece, move.promotion);
    };

    const movePiece = (from: Position, to: Position) => {
        const newBoard = board.map(row => [...row]);
        const pieceToMove = { ...newBoard[from.row][from.col]! };
        const capturedPieceOnTarget = newBoard[to.row][to.col];
        let resetHalfmoveClock = pieceToMove.type === PieceType.Pawn;

        const newCapturedPieces = {
            white: [...capturedPieces.white],
            black: [...capturedPieces.black],
        };

        const wasPowerMove = isPowerMove(board, from, to, enPassantTarget);
        const isEnPassantCapture = (pieceToMove.type === PieceType.Pawn || pieceToMove.power === PieceType.Pawn) && enPassantTarget && to.row === enPassantTarget.row && to.col === enPassantTarget.col && !capturedPieceOnTarget;

        if (isEnPassantCapture && pieceToMove.power === PieceType.Pawn && [PieceType.Queen, PieceType.Bishop, PieceType.King].includes(pieceToMove.originalType) && !isForcePowerMode) {
            setAmbiguousEnPassantData({ from, to });
            setStatus('ambiguous_en_passant');
            return;
        }

        let actualCapturedPiece = capturedPieceOnTarget;
        if (isEnPassantCapture) {
            actualCapturedPiece = newBoard[from.row][to.col];
            newBoard[from.row][to.col] = null;
        }

        let acquiredPower: PieceType | null = null;
        if (actualCapturedPiece) {
            resetHalfmoveClock = true;
            newCapturedPieces[actualCapturedPiece.color].push(actualCapturedPiece);
            if (actualCapturedPiece.isKing || actualCapturedPiece.originalType === PieceType.King) {
                // Potential king capture - finalized in finalizeTurn
            } else {
                acquiredPower = actualCapturedPiece.originalType;
            }
        }

        const promotionRank = turn === Color.White ? 0 : 7;
        const hasPawnAbility = pieceToMove.type === PieceType.Pawn || pieceToMove.power === PieceType.Pawn;
        const isMovingToPromotionRank = to.row === promotionRank;
        const isCapturingPawnOnPromotionRank = actualCapturedPiece &&
            actualCapturedPiece.originalType === PieceType.Pawn &&
            isMovingToPromotionRank;

        // Update power AFTER saving Pawn ability for promotion check
        let powerAfterMove = pieceToMove.power;
        if (actualCapturedPiece && acquiredPower) {
            powerAfterMove = acquiredPower;
        } else if (isForcePowerMode || wasPowerMove) {
            powerAfterMove = null;
        }
        pieceToMove.power = powerAfterMove;

        if ((isMovingToPromotionRank && hasPawnAbility) || isCapturingPawnOnPromotionRank) {
            // Determine power after promotion, mirroring App.tsx logic
            let promotionPowerAfterMove: PieceType | null = null;
            if (isCapturingPawnOnPromotionRank) {
                promotionPowerAfterMove = null;
            } else if (actualCapturedPiece) {
                promotionPowerAfterMove = actualCapturedPiece.originalType === PieceType.Pawn ? null : actualCapturedPiece.originalType;
            } else {
                if (pieceToMove.originalType === PieceType.Pawn && !wasPowerMove) {
                    promotionPowerAfterMove = pieceToMove.power === PieceType.Pawn ? null : pieceToMove.power;
                } else {
                    promotionPowerAfterMove = null;
                }
            }

            pieceToMove.hasMoved = true;
            newBoard[to.row][to.col] = pieceToMove;
            newBoard[from.row][from.col] = null;
            setBoard(newBoard);
            setCapturedPieces(newCapturedPieces);
            setPromotionData({ from, position: to, promotingPiece: pieceToMove, powerAfterPromotion: promotionPowerAfterMove, capturedPiece: actualCapturedPiece });
            setStatus('promotion');
            return;
        }

        pieceToMove.hasMoved = true;
        newBoard[to.row][to.col] = pieceToMove;
        newBoard[from.row][from.col] = null;

        // Castling
        if (pieceToMove.type === PieceType.King && Math.abs(from.col - to.col) === 2) {
            const isKingside = to.col > from.col;
            const rookFromCol = isKingside ? 7 : 0;
            const rookToCol = isKingside ? 5 : 3;
            const rook = newBoard[from.row][rookFromCol];
            if (rook) {
                newBoard[from.row][rookToCol] = { ...rook, hasMoved: true };
                newBoard[from.row][rookFromCol] = null;
            }
        }

        let nextEnPassantTarget: Position | null = null;
        if (pieceToMove.type === PieceType.Pawn && Math.abs(from.row - to.row) === 2) {
            nextEnPassantTarget = { row: (from.row + to.row) / 2, col: from.col };
        }

        finalizeTurn(newBoard, nextEnPassantTarget, resetHalfmoveClock, newCapturedPieces, { from, to }, pieceToMove, actualCapturedPiece);
    };

    const handleSquareClick = useCallback((row: number, col: number) => {
        if (status === 'promotion' || status === 'ambiguous_en_passant') return;
        if (!canEditAnalysis) {
            // Read-only: allow selecting pieces to view valid moves, but do not commit moves
            const piece = board[row][col];
            if (selectedPiece && selectedPiece.row === row && selectedPiece.col === col) setSelectedPiece(null);
            else if (selectedPiece && validMoves.some(m => m.row === row && m.col === col)) return;
            else if (piece && piece.color === turn) setSelectedPiece({ row, col });
            else setSelectedPiece(null);
            return;
        }

        if (selectedPiece) {
            if (selectedPiece.row === row && selectedPiece.col === col) {
                setSelectedPiece(null);
            } else if (validMoves.some(m => m.row === row && m.col === col)) {
                movePiece(selectedPiece, { row, col });
            } else {
                const piece = board[row][col];
                if (piece && piece.color === turn) {
                    setSelectedPiece({ row, col });
                } else {
                    setSelectedPiece(null);
                }
            }
        } else {
            const piece = board[row][col];
            if (piece && piece.color === turn) {
                setSelectedPiece({ row, col });
            }
        }
    }, [board, turn, status, selectedPiece, validMoves, canEditAnalysis]);

    const handlePromotion = (type: PieceType) => {
        if (!promotionData || !canEditAnalysis) return;
        const { from, position, promotingPiece, powerAfterPromotion, capturedPiece } = promotionData;
        const newBoard = board.map(r => [...r]);
        const promotedPiece: Piece = {
            ...promotingPiece,
            type: type,
            originalType: promotingPiece.originalType,
            isKing: type === PieceType.King || promotingPiece.isKing || promotingPiece.originalType === PieceType.King,
            hasMoved: true,
            power: powerAfterPromotion
        };

        newBoard[position.row][position.col] = promotedPiece;
        newBoard[from.row][from.col] = null;
        finalizeTurn(newBoard, null, true, capturedPieces, { from, to: position }, promotingPiece, capturedPiece, type);
    };

    const resolveAmbiguousEnPassant = (choice: 'move' | 'capture') => {
        if (!ambiguousEnPassantData || !canEditAnalysis) return;
        const { from, to } = ambiguousEnPassantData;
        const newBoard = board.map(r => [...r]);
        const pieceToMove = { ...newBoard[from.row][from.col]! };
        const newCaptured = { ...capturedPieces };

        if (choice === 'capture') {
            const captured = newBoard[from.row][to.col]!;
            newCaptured[captured.color].push(captured);
            pieceToMove.power = captured.originalType;
            newBoard[from.row][to.col] = null;
        } else {
            pieceToMove.power = PieceType.Pawn;
        }

        pieceToMove.hasMoved = true;
        newBoard[to.row][to.col] = pieceToMove;
        newBoard[from.row][from.col] = null;

        finalizeTurn(newBoard, null, true, newCaptured, { from, to }, pieceToMove, choice === 'capture' ? board[from.row][to.col] : null);
    };

    return (
        <div className="min-h-screen flex flex-col md:flex-row items-center md:items-start justify-center p-2 md:p-4 gap-4 md:gap-8 bg-gray-900 text-white overflow-x-hidden">
            <div className="w-full max-w-lg md:max-w-md lg:max-w-lg xl:max-w-2xl relative flex-shrink-0">
                <GameOverlay
                    status={status}
                    winner={winner}
                    onRestart={() => { goToNode('root', false); setLastMove(null); }}
                    onPromote={handlePromotion}
                    promotionData={promotionData}
                    onResolveAmbiguousEnPassant={resolveAmbiguousEnPassant}
                    gameMode="analysis"
                    isMyTurnForAction={true}
                    currentGameState={getCurrentState()}
                />
                <Board
                    board={board}
                    selectedPiece={selectedPiece}
                    validMoves={validMoves}
                    onSquareClick={handleSquareClick}
                    turn={turn}
                    playerColor={boardOrientation}
                    gameMode="online_playing"
                    isInteractionDisabled={status === 'promotion' || status === 'ambiguous_en_passant'}
                    onPieceDragStart={(e, r, c) => {
                        handleSquareClick(r, c);
                        setDraggedPiece({ row: r, col: c });
                    }}
                    onPieceDragEnd={() => setDraggedPiece(null)}
                    onSquareDrop={(e, r, c) => handleSquareClick(r, c)}
                    draggedPiece={draggedPiece}
                    premove={null}
                    lastMove={lastMove}
                    highlightedSquares={highlightedSquares}
                    arrows={[...arrows, ...(showEngineArrow ? engineArrows : [])]}
                    onBoardMouseDown={(e, r, c) => {
                        if (e.button === 0) {
                            setHighlightedSquares([]);
                            setArrows([]);
                        }
                        if (e.button === 2) {
                            e.preventDefault();
                            setRightClickStartSquare({ row: r, col: c });
                        }
                    }}
                    onBoardMouseUp={(e, r, c) => {
                        if (e.button === 2 && rightClickStartSquare) {
                            const end = { row: r, col: c };
                            if (rightClickStartSquare.row === end.row && rightClickStartSquare.col === end.col) {
                                setHighlightedSquares(prev => prev.some(s => s.row === end.row && s.col === end.col) ? prev.filter(s => s.row !== end.row || s.col !== end.col) : [...prev, end]);
                            } else {
                                setArrows(prev => prev.some(a => a.from.row === rightClickStartSquare.row && a.from.col === rightClickStartSquare.col && a.to.row === end.row && a.to.col === end.col) ? prev.filter(a => a.from.row !== rightClickStartSquare.row || a.from.col !== rightClickStartSquare.col || a.to.row !== end.row || a.to.col !== end.col) : [...prev, { from: rightClickStartSquare, to: end }]);
                            }
                        }
                        setRightClickStartSquare(null);
                    }}
                    onBoardContextMenu={(e) => e.preventDefault()}
                />
                {/* Per-node comment box (small, below the board) */}
                <div className="mt-2">
                    {nodes[currentNodeId] && (
                        <div className="bg-gray-800 p-2 rounded text-sm">
                            <label className="text-xs font-semibold mb-1 block text-gray-300">Comment for this move/position</label>
                            <textarea
                                value={nodes[currentNodeId].comment || ''}
                                onChange={(e) => {
                                    if (!canEditAnalysis) return;
                                    const text = e.target.value;
                                    setNodes(prev => ({
                                        ...prev,
                                        [currentNodeId]: {
                                            ...prev[currentNodeId],
                                            comment: text
                                        }
                                    }));
                                }}
                                placeholder="Short comment"
                                readOnly={!canEditAnalysis}
                                className={`w-full h-16 p-2 bg-gray-900 border border-gray-700 rounded text-white placeholder-gray-400 resize-none text-sm ${!canEditAnalysis ? 'opacity-75 cursor-not-allowed' : ''}`}
                            />
                        </div>
                    )}
                </div>
            </div>

            <div className="w-full md:w-96 bg-gray-800 p-4 rounded-xl shadow-2xl flex flex-col h-fit">
                <h2 className="text-2xl font-bold text-center text-green-400 mb-2">Analysis Board</h2>

                <div className="flex justify-between items-center mb-3 bg-gray-700 p-2 rounded">
                    <button onClick={() => { goToNode('root', false); setLastMove(null); }} className="px-4 py-2 bg-gray-700 hover:bg-gray-600 rounded disabled:opacity-50">&lt;&lt;</button>
                    <button onClick={handleUndo} className="px-4 py-2 bg-gray-700 hover:bg-gray-600 rounded disabled:opacity-50">&lt;</button>
                    <span className="font-bold text-xs">Depth: {currentLine.length}</span>
                    <button onClick={handleRedo} className="px-4 py-2 bg-gray-700 hover:bg-gray-600 rounded disabled:opacity-50">&gt;</button>
                    <button onClick={() => goToNode(currentLine[currentLine.length - 1].id, false)} className="px-4 py-2 bg-gray-700 hover:bg-gray-600 rounded disabled:opacity-50">&gt;&gt;</button>
                </div>

                {initialState && (
                    <>
                        <div className="mb-3 bg-gray-700 p-2 rounded text-xs space-y-1">
                            <p className="text-center text-gray-300 text-xs font-semibold mb-1">{getResultMessage()}</p>
                            <div className="flex justify-between items-center border-b border-gray-600 pb-1">
                                <span className="text-gray-400">White:</span>
                                <span className="font-bold flex items-center gap-1">
                                    {whitePlayer?.displayName || 'N/A'}
                                    {isRated && <span className="text-gray-500">({initialRatings?.white})</span>}
                                    {isRated && ratingChange && (
                                        <span className={`text-[10px] font-bold ${ratingChange.white >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                                            {ratingChange.white >= 0 ? '+' : ''}{ratingChange.white}
                                        </span>
                                    )}
                                </span>
                            </div>
                            <div className="flex justify-between items-center border-b border-gray-600 pb-1">
                                <span className="text-gray-400">Black:</span>
                                <span className="font-bold flex items-center gap-1">
                                    {blackPlayer?.displayName || 'N/A'}
                                    {isRated && <span className="text-gray-500">({initialRatings?.black})</span>}
                                    {isRated && ratingChange && (
                                        <span className={`text-[10px] font-bold ${ratingChange.black >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                                            {ratingChange.black >= 0 ? '+' : ''}{ratingChange.black}
                                        </span>
                                    )}
                                </span>
                            </div>
                            <div className="pt-1 text-center text-[10px] text-gray-500 italic">
                                {formatTimerSettingText(timerSettings)} • {isRated ? `Rated (${ratingCategory})` : 'Unrated'}
                            </div>
                        </div>

                    </>
                )}

                <div ref={moveListRef} className="overflow-y-auto mb-3 bg-gray-900 p-3 rounded font-sans text-sm custom-scrollbar min-h-[100px] max-h-[250px]" id="move-list-container">
                    {currentLine.length === 0 && <p className="text-gray-500 italic text-center py-4">No moves yet</p>}

                    <div className="flex flex-wrap items-start content-start gap-x-1 gap-y-2">
                        {currentLine.map((n, i) => {
                            const startingColor = nodes['root'].gameState.turn;
                            const isWhiteMove = startingColor === Color.White ? i % 2 === 0 : i % 2 !== 0;
                            const moveNumber = startingColor === Color.White
                                ? Math.floor(i / 2) + 1
                                : Math.floor((i + 1) / 2) + 1;

                            const parentId = n.parentId;
                            const hasVariations = parentId ? nodes[parentId].children.length > 1 : false;
                            const isSelected = currentNodeId === n.id;

                            // Find current node index in the line to determine if this move is in the "future"
                            const currentNodeInLineIdx = currentLine.findIndex(node => node.id === currentNodeId);
                            const isFutureMove = i > currentNodeInLineIdx;

                            return (
                                <React.Fragment key={n.id}>
                                    {/* Move Number Label */}
                                    {(isWhiteMove || i === 0) && (
                                        <span className="text-gray-500 font-bold min-w-[1.5rem] mt-1 pr-1">
                                            {moveNumber}{isWhiteMove ? '.' : '...'}
                                        </span>
                                    )}

                                    {/* Move Button */}
                                    <div
                                        ref={isSelected ? currentMoveRef : null}
                                        className={`group relative p-1 px-2 cursor-pointer hover:bg-gray-700 rounded transition-all flex items-center gap-1 min-h-[1.5rem]
                                            ${isSelected ? 'bg-green-600 text-white font-bold shadow-md ring-1 ring-green-400 z-10 scale-105' :
                                                isFutureMove ? 'text-gray-400 bg-gray-800/40 hover:text-white' :
                                                    'text-gray-300 hover:text-white hover:bg-gray-700/50'}`}
                                        onClick={(e) => {
                                            if (isLongPressActive.current) {
                                                e.preventDefault();
                                                e.stopPropagation();
                                                return;
                                            }
                                            goToNode(n.id, false);
                                        }}
                                        onTouchStart={(e) => handleMoveTouchStart(e, n.id)}
                                        onTouchEnd={handleMoveTouchEnd}
                                        onTouchMove={handleMoveTouchMove}
                                        onContextMenu={(e) => {
                                            e.preventDefault();
                                            e.stopPropagation();
                                            setContextMenu({ x: e.clientX, y: e.clientY, nodeId: n.id });
                                        }}
                                    >
                                        <span>{n.notation}</span>

                                        {/* Branch Indicator - Sibling exists (Incoming Variation) */}
                                        {hasVariations && (
                                            <span
                                                className={`text-[10px] flex items-center justify-center w-3 h-3 rounded-full 
                                                    ${isSelected ? 'bg-green-800 text-green-200' : 'bg-blue-900 text-blue-300'}`}
                                                title="Alternative variation available"
                                            >
                                                ⑂
                                            </span>
                                        )}

                                        {/* Branch Indicator - Multiple children (Outgoing Fork) */}
                                        {n.children.length > 1 && (
                                            <span
                                                className={`w-1 h-1 rounded-full ${isSelected ? 'bg-white' : 'bg-purple-400'}`}
                                                title={`${n.children.length} continuations available`}
                                            ></span>
                                        )}

                                        {/* Hover variations preview indicator */}
                                        {!isSelected && hasVariations && (
                                            <div className="absolute -top-1 -right-1 w-2 h-2 bg-blue-400 rounded-full animate-pulse shadow-sm"></div>
                                        )}
                                    </div>
                                </React.Fragment>
                            );
                        })}
                    </div>
                </div>

                {/* Variations & Continuations Panel */}
                {(() => {
                    const currentNode = nodes[currentNodeId];
                    if (!currentNode) return null;

                    const parent = currentNode.parentId ? nodes[currentNode.parentId] : null;
                    const siblingVariations = parent && parent.children.length > 1 ? parent.children : [];
                    const childVariations = currentNode.children.length > 1 ? currentNode.children : [];

                    if (siblingVariations.length === 0 && childVariations.length === 0) return null;

                    return (
                        <div className="mb-3 rounded-lg overflow-hidden border border-gray-600 bg-gray-900/80 shadow-lg flex-1 overflow-y-auto custom-scrollbar min-h-[150px]">
                            {siblingVariations.length > 1 && (
                                <div className="p-3 border-b border-gray-700 bg-blue-900/20">
                                    <p className="text-xs font-bold text-blue-400 uppercase mb-2 tracking-wider">⑂ Variations</p>
                                    <div className="flex flex-wrap gap-2">
                                        {siblingVariations.map(vId => (
                                            <div key={vId} className="flex flex-col gap-1">
                                                <button
                                                    onClick={() => goToNode(vId, true)}
                                                    className={`py-2 px-4 rounded-md text-sm font-semibold transition-all ${vId === currentNodeId
                                                        ? 'bg-blue-600 text-white shadow-md ring-1 ring-blue-400'
                                                        : 'bg-gray-700 text-gray-300 hover:bg-blue-700 hover:text-white'}`}
                                                >
                                                    {nodes[vId].notation}
                                                </button>
                                                {vId !== siblingVariations[0] && (
                                                    <button
                                                        onClick={() => promoteVariation(vId)}
                                                        className="text-[10px] text-gray-500 hover:text-green-400 text-center uppercase font-bold py-0.5"
                                                        title="Promote to main line"
                                                    >
                                                        ↑ Promote
                                                    </button>
                                                )}
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            )}
                            {childVariations.length > 1 && (
                                <div className="p-3 bg-purple-900/20">
                                    <p className="text-xs font-bold text-purple-400 uppercase mb-2 tracking-wider">▸ Continuations</p>
                                    <div className="flex flex-wrap gap-2">
                                        {childVariations.map(cId => (
                                            <div key={cId} className="flex flex-col gap-1">
                                                <button
                                                    onClick={() => goToNode(cId, true)}
                                                    className={`py-2 px-4 rounded-md text-sm font-semibold transition-all ${nodes[cId].lastVisited
                                                        ? 'bg-purple-600 text-white shadow-md ring-1 ring-purple-400'
                                                        : 'bg-gray-700 text-gray-300 hover:bg-purple-700 hover:text-white'}`}
                                                >
                                                    {nodes[cId].notation}
                                                </button>
                                                {cId !== childVariations[0] && (
                                                    <button
                                                        onClick={() => promoteVariation(cId)}
                                                        className="text-[10px] text-gray-500 hover:text-purple-400 text-center uppercase font-bold py-0.5"
                                                        title="Promote to main line"
                                                    >
                                                        ↑ Promote
                                                    </button>
                                                )}
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            )}
                        </div>
                    );
                })()}

                <div className="flex flex-col gap-3">
                    <div className="flex items-center justify-between gap-2">
                        <button
                            onClick={() => setIsForcePowerMode(!isForcePowerMode)}
                            className={`flex-1 py-2 rounded-lg font-bold text-sm transition-all ${isForcePowerMode ? 'bg-red-600 text-white' : 'bg-gray-700 text-gray-400 hover:bg-gray-600'}`}
                        >
                            {isForcePowerMode ? 'FORCE POWER ON' : 'FORCE POWER OFF'}
                        </button>
                        <button
                            onClick={() => setBoardOrientation(prev => prev === Color.White ? Color.Black : Color.White)}
                            className="flex-1 py-2 bg-gray-700 hover:bg-gray-600 text-white rounded-lg font-bold text-sm transition-all"
                        >
                            FLIP BOARD
                        </button>
                    </div>

                    <div className="bg-gray-700 p-3 rounded-lg flex flex-col gap-2">
                        <div className="flex items-center justify-between">
                            <span className="text-xs font-bold text-gray-400">ANALYSIS LINES</span>
                            <div className="flex items-center gap-3">
                                <label className="flex items-center gap-1 cursor-pointer" title="Toggle engine best move arrow">
                                    <input
                                        type="checkbox"
                                        checked={showEngineArrow}
                                        onChange={() => setShowEngineArrow(!showEngineArrow)}
                                        className="w-3 h-3 cursor-pointer accent-blue-500"
                                    />
                                    <span className="text-[10px] text-gray-400 font-bold uppercase">Show Arrow</span>
                                </label>
                                <div className="flex gap-1">
                                    {[1, 2, 3, 4, 5].map(n => (
                                        <button
                                            key={n}
                                            onClick={() => {
                                                setNumLines(n);
                                                if (engineThinking) stopWorker();
                                            }}
                                            className={`w-7 h-7 rounded flex items-center justify-center text-xs font-bold transition-all ${numLines === n ? 'bg-blue-600 text-white' : 'bg-gray-800 text-gray-400 hover:bg-gray-600'}`}
                                        >
                                            {n}
                                        </button>
                                    ))}
                                </div>
                            </div>
                        </div>
                        <button
                            onClick={handleGetEngineMove}
                            className={`w-full py-2 rounded-lg font-bold text-sm transition-all shadow-md ${engineThinking ? 'bg-red-600 animate-pulse' : 'bg-blue-600 hover:bg-blue-500'}`}
                        >
                            {engineThinking ? 'STOP ENGINE' : 'RUN ENGINE ANALYSIS'}
                        </button>

                        {engineResults.length > 0 && (
                            <div className="flex flex-col gap-2 max-h-[300px] overflow-y-auto custom-scrollbar pr-1 mt-1">
                                {engineResults.map((result, idx) => {
                                    const score = result.score;
                                    const isMate = Math.abs(score) > 19000;
                                    const forceWhiteScore = turn === Color.White ? score : -score;
                                    const formattedScore = isMate
                                        ? `${forceWhiteScore > 0 ? '+' : '-'}M${Math.max(1, Math.ceil((20000 - Math.abs(forceWhiteScore)) / 2))}`
                                        : (forceWhiteScore / 100).toFixed(2);

                                    return (
                                        <div key={idx} className="p-3 bg-gray-900 rounded-lg border border-gray-700 hover:border-blue-500/50 transition-all shadow-inner group mb-2 last:mb-0 cursor-pointer" onClick={() => { if (result.move) applyEngineMove(result.move); }}>
                                            <div className="flex items-center gap-2 mb-1.5">
                                                {idx === 0 && <span className="text-[9px] font-bold text-blue-500 uppercase tracking-widest animate-pulse">BEST</span>}
                                                <span className="text-[10px] w-4 h-4 flex items-center justify-center bg-gray-800 rounded text-gray-500 font-bold group-hover:text-blue-400 transition-colors">{idx + 1}</span>
                                                <span className="text-sm font-black text-green-400">{result.move?.notation}</span>
                                            </div>

                                            <div className="flex flex-wrap items-center gap-1">
                                                {result.pv.slice(0, 8).map((mv: string, mIdx: number) => (
                                                    <span key={mIdx} className="text-[10px] text-gray-500 bg-gray-800/50 px-1 rounded hover:text-gray-300 pointer-events-none">
                                                        {mv}
                                                    </span>
                                                ))}
                                                {result.pv.length > 8 && <span className="text-[10px] text-gray-600 italic">...</span>}
                                                <div className="flex-grow"></div>
                                                <span className={`text-xs font-mono font-bold px-1.5 py-0.5 rounded ml-auto ${forceWhiteScore >= 0 ? 'bg-green-900/30 text-green-400' : 'bg-red-900/30 text-red-400'}`}>
                                                    {forceWhiteScore > 0 && !isMate ? '+' : ''}{formattedScore}
                                                </span>
                                            </div>
                                        </div>
                                    );
                                })}




                            </div>
                        )}
                    </div>

                    {/* Share & Export Section */}
                    <div className="bg-gray-700 p-3 rounded-lg flex flex-col gap-2">
                        <span className="text-xs font-bold text-gray-400 uppercase tracking-wider">Share & Export</span>
                        <div className="flex gap-2">
                            <button
                                onClick={handleCopyFen}
                                className="flex-1 py-2 bg-gray-600 hover:bg-gray-500 text-white rounded-lg font-semibold text-sm transition-colors"
                                title="Copy current position as FEN"
                            >
                                📋 FEN
                            </button>
                            <button
                                onClick={handleCopyPGN}
                                className="flex-1 py-2 bg-gray-600 hover:bg-gray-500 text-white rounded-lg font-semibold text-sm transition-colors"
                                title="Copy move history as PGN"
                            >
                                📋 PGN
                            </button>
                            <button
                                onClick={handleShareLink}
                                className={`flex-1 py-2 bg-blue-600 hover:bg-blue-500 text-white rounded-lg font-semibold text-sm transition-all ${!currentAnalysisId ? 'opacity-50 cursor-not-allowed' : ''}`}
                                disabled={!currentAnalysisId}
                                title={!currentAnalysisId ? 'Save first' : 'Copy share link'}
                            >
                                {showLinkCopied ? '✅ Copied!' : '🔗 Link'}
                            </button>
                        </div>
                        <div className="flex gap-2">
                            <input
                                type="text"
                                value={pgnInput}
                                onChange={(e) => setPgnInput(e.target.value)}
                                placeholder="Paste PGN to import..."
                                className="flex-1 px-2 py-1.5 bg-gray-800 border border-gray-600 rounded text-white text-sm placeholder-gray-500 focus:border-blue-500 focus:outline-none"
                            />
                            <button
                                onClick={handleImportPGN}
                                disabled={!pgnInput.trim()}
                                className="px-3 py-1.5 bg-green-600 hover:bg-green-500 disabled:opacity-50 disabled:cursor-not-allowed text-white rounded font-semibold text-sm transition-colors"
                            >
                                Import
                            </button>
                        </div>
                    </div>

                    {/* Export Modal */}
                    {showExportModal && exportData && (
                        <div className="bg-gray-700 p-3 rounded-lg flex flex-col gap-2 border border-blue-500/30">
                            <div className="flex items-center justify-between">
                                <span className="text-xs font-bold text-blue-400">{exportData.type} Copied!</span>
                                <button onClick={() => setShowExportModal(false)} className="text-gray-400 hover:text-white text-sm">✕</button>
                            </div>
                            <textarea
                                readOnly
                                value={exportData.value}
                                className="w-full px-2 py-1.5 bg-gray-800 border border-gray-600 rounded text-white text-xs font-mono resize-none h-16"
                                onClick={(e) => (e.target as HTMLTextAreaElement).select()}
                            />
                        </div>
                    )}

                    <button
                        onClick={() => {
                            if (analysisFolderId && analysisSourceFolderType) {
                                setSelectedFolderId(`${analysisSourceFolderType}_${analysisFolderId}`);
                            } else if (!selectedFolderId) {
                                setSelectedFolderId(null);
                            }
                            setSaveModalOpen(true);
                            if (!saveName) setSaveName('Analysis ' + new Date().toLocaleDateString());
                        }}
                        className="w-full py-2 bg-green-600 hover:bg-green-500 text-white rounded-lg font-semibold transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                        disabled={!currentUser?.uid || !canEditAnalysis}
                        title={!canEditAnalysis ? 'Read-only: save a copy via Analysis Manager (Clone)' : undefined}
                    >
                        Save Analysis
                    </button>

                    <button
                        onClick={() => onBackToAnalysisManager ? handleGoingBack('manager') : onBack()}
                        className="w-full py-2 bg-gray-700 hover:bg-gray-600 text-white rounded-lg font-semibold transition-colors mt-auto"
                    >
                        {onBackToAnalysisManager && useOnlineStatus() ? 'Back to Manager' : 'Exit Analysis'}
                    </button>
                    <button
                        onClick={() => onBackToWhereIcameFrom ? handleGoingBack('whereIcameFrom') : onBack()}
                        className="w-full py-2 bg-gray-700 hover:bg-gray-600 text-white rounded-lg font-semibold transition-colors mt-auto"
                    >
                        {'Exit to where you came from'}
                    </button>
                    <button
                        onClick={() => onBackToMenu ? handleGoingBack('menu') : onBack()}
                        className="w-full py-2 bg-gray-700 hover:bg-gray-600 text-white rounded-lg font-semibold transition-colors mt-auto"
                    >
                        {'Exit to Menu'}
                    </button>
                </div>
            </div>

            {/* Save Modal */}
            {saveModalOpen && (
                <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
                    <div className="bg-gray-800 rounded-lg p-6 w-full max-w-md">
                        <h3 className="text-lg font-bold mb-4">Save Analysis</h3>
                        <input
                            type="text"
                            value={saveName}
                            onChange={(e) => setSaveName(e.target.value)}
                            placeholder="Analysis name"
                            className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded text-white placeholder-gray-400 mb-4"
                        />
                        <div className="mb-4">
                            <label className="block text-sm font-semibold mb-2">Folder</label>
                            <select
                                value={selectedFolderId || 'null'}
                                onChange={(e) => setSelectedFolderId(e.target.value === 'null' ? null : e.target.value)}
                                className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded text-white"
                            >
                                <option value="null">Unsorted</option>
                                {Object.entries(folders).map(([folderId, folder]) => (
                                    <option key={folderId} value={folderId}>
                                        {(folder as AnalysisFolder).name}
                                    </option>
                                ))}
                                {/* Shared folders with edit permission */}
                                {analysisSharedFolders && Object.entries(analysisSharedFolders).map(([folderId, folder]: [string, any]) => {
                                    if (folder.permission === 'edit') {
                                        return (
                                            <option key={`shared_${folderId}`} value={`shared_${folderId}`}>
                                                🔗 {folder.name} (shared)
                                            </option>
                                        );
                                    }
                                    return null;
                                })}
                                {/* Public writable folders */}
                                {analysisPublicFolders && Object.entries(analysisPublicFolders).map(([folderId, folder]: [string, PublicFolderOption]) => {
                                    if (folder.isPublicWritable) {
                                        return (
                                            <option key={`public_${folderId}`} value={`public_${folderId}`}>
                                                🌐 {folder.name} (public)
                                            </option>
                                        );
                                    }
                                    return null;
                                })}
                            </select>
                        </div>
                        <div className="flex gap-2">
                            <button
                                onClick={() => setSaveModalOpen(false)}
                                className="flex-1 px-3 py-2 bg-gray-600 hover:bg-gray-500 rounded font-semibold transition-colors"
                            >
                                Cancel
                            </button>
                            <button
                                onClick={handleSaveAnalysis}
                                disabled={isSaving || !saveName.trim()}
                                className="flex-1 px-3 py-2 bg-green-600 hover:bg-green-500 rounded font-semibold transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                            >
                                {isSaving ? 'Saving...' : 'Save'}
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Move List Context Menu */}
            {contextMenu.nodeId && (
                <div
                    className="fixed bg-gray-800 border border-gray-700 rounded shadow-2xl py-1 z-[999] min-w-[160px] overflow-hidden"
                    style={{ left: contextMenu.x, top: contextMenu.y }}
                    onClick={(e) => e.stopPropagation()}
                >
                    <button
                        className="w-full text-left px-4 py-2 text-sm text-red-400 hover:bg-red-900/40 hover:text-red-300 transition-colors flex items-center gap-2 group"
                        onClick={() => deleteFromHere(contextMenu.nodeId!)}
                    >
                        <span className="opacity-70 group-hover:opacity-100 transition-opacity">🗑️</span>
                        <span className="font-medium">Delete from here</span>
                    </button>
                    <button
                        className="w-full text-left px-4 py-2 text-[10px] text-gray-500 hover:bg-gray-700 hover:text-gray-300 transition-colors"
                        onClick={() => setContextMenu({ x: 0, y: 0, nodeId: null })}
                    >
                        Cancel
                    </button>
                </div>
            )}
        </div>
    );
};

export default Analysis;
