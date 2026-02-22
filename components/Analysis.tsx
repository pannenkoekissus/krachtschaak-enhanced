
import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { BoardState, Color, GameStatus, PieceType, Position, GameState, PromotionData, Piece, Move } from '../types';
import { createInitialBoard, getValidMoves, isPowerMove, hasLegalMoves, isKingInCheck, generateBoardKey, canCaptureKing, isAmbiguousMove, getNotation, applyMoveToBoard, sanitizeBoard } from '../utils/game';
import { playMoveSound, playCaptureSound, playWinSound, playDrawSound, playLossSound } from '../utils/sounds';
import { saveAnalysis, loadAnalysis, generateId, AnalysisFolder, SavedAnalysis } from '../utils/analysisFirebase';
import { getAllFolders } from '../utils/analysisFirebase';
import Board from './Board';
import GameOverlay from './GameOverlay';
import PieceComponent from './Piece';

interface AnalysisProps {
    initialState?: GameState;
    onBack: () => void;
    analysisId?: string;
    currentUser?: { uid: string };
    onBackToAnalysisManager?: () => void;
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

const Analysis: React.FC<AnalysisProps> = ({ initialState, onBack, analysisId, currentUser, onBackToAnalysisManager }) => {

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
        ,    comment: ''
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
                    const saved = await loadAnalysis(currentUser.uid, analysisId);
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
    }, [analysisId, currentUser?.uid, loadedOnceFromFirebase]);

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
            case 'resignation': return `${game.winner} wins by resignation.`;
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
    const [lastMove, setLastMove] = useState<Move | null>(null);
    const [saveName, setSaveName] = useState<string>('');
    const [saveModalOpen, setSaveModalOpen] = useState(false);

    // UI State
    const [highlightedSquares, setHighlightedSquares] = useState<Position[]>([]);
    const [arrows, setArrows] = useState<{ from: Position; to: Position }[]>([]);
    const [rightClickStartSquare, setRightClickStartSquare] = useState<Position | null>(null);

    // Engine State
    const [engineThinking, setEngineThinking] = useState(false);
    const [engineSuggestion, setEngineSuggestion] = useState<string | null>(null);
    const [engineDepth, setEngineDepth] = useState(3);
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
    };

    const handleBackToManager = () => {
        // Stop worker and clear state before navigating away
        stopWorker();
        setHighlightedSquares([]);
        setArrows([]);
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
        onBackToAnalysisManager?.();
    };

    const moveListRef = useRef<HTMLDivElement>(null);
    const currentMoveRef = useRef<HTMLDivElement>(null);

    const handleGetEngineMove = () => {
        if (engineThinking) {
            stopWorker();
            return;
        }

        setEngineThinking(true);
        setEngineSuggestion(null);

        const requestId = Date.now();
        requestIdRef.current = requestId;

        if (!workerRef.current) {
            workerRef.current = new Worker(new URL('../engine.worker.ts', import.meta.url), { type: 'module' });
            workerRef.current.onmessage = (ev) => {
                const msg = ev.data || {};
                if (msg.requestId !== requestIdRef.current) return;

                if (msg.type === 'update') {
                    setEngineSuggestion(`${msg.move.notation} (depth ${msg.depth})`);
                }
                if (msg.type === 'done') {
                    if (msg.move) setEngineSuggestion(msg.move.notation);
                    setEngineThinking(false);
                    requestIdRef.current = null;
                }
                if (msg.type === 'error') {
                    setEngineSuggestion('Error');
                    setEngineThinking(false);
                    workerRef.current?.terminate();
                    workerRef.current = null;
                }
            };
        }

        workerRef.current.postMessage({ type: 'start', board, turn, maxDepth: engineDepth, requestId });
    };

    useEffect(() => {
        return () => {
            if (workerRef.current) workerRef.current.terminate();
        };
    }, []);

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
        const currentNode = nodes[currentNodeId];
        if (currentNode.parentId) {
            goToNode(currentNode.parentId, false); // No sound for undo
        }
        if (nodes[nodes[currentNodeId].parentId].parentId === null) setLastMove(null); // Clear highlights if we're at the root
    }, [currentNodeId, nodes]);

    const handleRedo = useCallback(() => {
        const currentNode = nodes[currentNodeId];
        if (currentNode.children.length > 0) {
            const lastVisitedChild = currentNode.children.find(id => nodes[id].lastVisited) || currentNode.children[0];
            goToNode(lastVisitedChild, true); // Sound for redo
        }
    }, [currentNodeId, nodes]);

    const handleSaveAnalysis = async () => {
        if (!currentUser?.uid || !saveName.trim()) return;

        try {
            setIsSaving(true);
            const analysisToSave = analysisId || generateId();

            // Get the root node
            const rootId = 'root';
            const analysisData: SavedAnalysis = {
                name: saveName,
                folderId: selectedFolderId,
                nodes: nodes,
                rootNodeId: rootId,
                createdAt: Date.now(),
                updatedAt: Date.now(),
                lastNodeId: currentNodeId,
                // per-node comments are stored inside `nodes`
            } as any;

            await saveAnalysis(currentUser.uid, analysisToSave, analysisData);
            setSaveModalOpen(false);
            // Show success message (you could use a toast notification here)
            alert('Analysis saved successfully!');
        } catch (error) {
            console.error('Error saving analysis:', error);
            alert('Failed to save analysis');
        } finally {
            setIsSaving(false);
        }
    };

    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
            if (e.key === 'ArrowLeft') {
                handleUndo();
            } else if (e.key === 'ArrowRight') {
                handleRedo();
            }
        };
        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [handleUndo, handleRedo]);

    const getCurrentState = (): GameState => ({
        board, turn, status, winner, promotionData, capturedPieces,
        enPassantTarget, halfmoveClock, positionHistory,
        ambiguousEnPassantData, drawOffer: null, playerTimes: null,
        turnStartTime: null, moveDeadline: null, timerSettings: null,
        ratingCategory: 'unlimited' as any, players: {},
        playerColors: { white: null, black: null }, initialRatings: null,
        isRated: false, rematchOffer: null, nextGameId: null,
        ratingChange: null, moveHistory
    });

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

    const applyState = (state: GameState) => {
        const safe = normalizeGameState(state || {});
        setBoard(safe.board);
        setTurn(safe.turn);
        setStatus(safe.status);
        setWinner(safe.winner);
        setCapturedPieces(safe.capturedPieces || { white: [], black: [] });
        setEnPassantTarget(safe.enPassantTarget);
        setHalfmoveClock(safe.halfmoveClock || 0);
        setPositionHistory(safe.positionHistory || {});
        setMoveHistory(safe.moveHistory || []);
        setPromotionData(safe.promotionData || null);
        setAmbiguousEnPassantData(safe.ambiguousEnPassantData || null);
        setLastMove((safe as any)?.lastMove || null);
        setSelectedPiece(null);
        setValidMoves([]);
        setHighlightedSquares([]);
        setArrows([]);
        setDraggedPiece(null);
    };

    const goToNode = (nodeId: string, playSound = true) => {
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

    const finalizeTurn = (
        currentBoard: BoardState,
        nextEnPassantTarget: Position | null,
        resetClock: boolean,
        newCaptured: typeof capturedPieces,
        move: { from: Position; to: Position },
        promotion?: PieceType | null,
    ) => {
        const nextTurn = turn === Color.White ? Color.Black : Color.White;
        const newHalfmoveClock = resetClock ? 0 : halfmoveClock + 1;
        const key = generateBoardKey(currentBoard, nextTurn, nextEnPassantTarget);
        const newCount = (positionHistory[key] || 0) + 1;
        const newPositionHistory = { ...positionHistory, [key]: newCount };

        let newStatus: GameStatus = 'playing';
        let newWinner: string | null = null;

        const capturedKing = newCaptured.white.some(p => p.isKing) || newCaptured.black.some(p => p.isKing);
        if (capturedKing) {
            newStatus = 'kingCaptured';
            newWinner = turn === Color.White ? 'White' : 'Black';
        } else {
            const hasStandardLegalMoves = hasLegalMoves(currentBoard, nextTurn, nextEnPassantTarget);
            const canPlayerCaptureKing = canCaptureKing(currentBoard, nextTurn);

            if (!hasStandardLegalMoves && !canPlayerCaptureKing) {
                const isPlayerInCheck = isKingInCheck(currentBoard, nextTurn);
                if (isPlayerInCheck) {
                    newStatus = 'checkmate';
                    newWinner = turn === Color.White ? 'White' : 'Black';
                } else {
                    newStatus = 'stalemate';
                }
            }
        }

        const notation = getNotation(board, move.from, move.to, board[move.from.row][move.from.col]!, null, promotion || null, isForcePowerMode);
        const newMoveHistory = [...moveHistory, { ...move, notation, piece: board[move.from.row][move.from.col]!.type, color: turn, captured: board[move.to.row][move.to.col]?.type, promotion: promotion || undefined }];

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
        } else if (newStatus === 'stalemate') {
            playDrawSound();
        } else {
            const isCapture = newCaptured.white.length > capturedPieces.white.length || newCaptured.black.length > capturedPieces.black.length;
            if (isCapture) {
                playCaptureSound();
            } else {
                playMoveSound();
            }
        }

        commitNewState(newState, notation);
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
            if (actualCapturedPiece.isKing) {
                // Game Over logic in analysis? Usually just move and set status
            } else {
                acquiredPower = actualCapturedPiece.originalType;
            }
        }

        // Only clear power if NOT a capture
        let powerAfterMove = pieceToMove.power;
        if (actualCapturedPiece && acquiredPower) {
            powerAfterMove = acquiredPower;
        } else if (isForcePowerMode || wasPowerMove) {
            powerAfterMove = null;
        }
        pieceToMove.power = powerAfterMove;

        const promotionRank = turn === Color.White ? 0 : 7;
        if (to.row === promotionRank && (pieceToMove.type === PieceType.Pawn || pieceToMove.power === PieceType.Pawn)) {
            // Determine power after promotion, mirroring App.tsx logic
            let promotionPowerAfterMove: PieceType | null = null;
            const isCapturingPawnOnPromotionRank = actualCapturedPiece && actualCapturedPiece?.originalType === PieceType.Pawn;

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

            setPromotionData({ from, position: to, promotingPiece: pieceToMove, powerAfterPromotion: promotionPowerAfterMove });
            setStatus('promotion');
            return;
        }

        // Special handling for Power-move consumption if it wasn't a standard move and not explicit power move?
        // Actually isPowerMove handles it. If it's a power move, power is already consumed above.

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

        finalizeTurn(newBoard, nextEnPassantTarget, resetHalfmoveClock, newCapturedPieces, { from, to });
    };

    const handleSquareClick = useCallback((row: number, col: number) => {
        if (status === 'promotion' || status === 'ambiguous_en_passant') return;

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
    }, [board, turn, status, selectedPiece, validMoves]);

    const handlePromotion = (type: PieceType) => {
        if (!promotionData) return;
        const { from, position, promotingPiece, powerAfterPromotion } = promotionData;
        const newBoard = board.map(r => [...r]);
        newBoard[position.row][position.col] = { ...promotingPiece, type, hasMoved: true, power: powerAfterPromotion };
        newBoard[from.row][from.col] = null;
        finalizeTurn(newBoard, null, true, capturedPieces, { from, to: position }, type);
    };

    const resolveAmbiguousEnPassant = (choice: 'move' | 'capture') => {
        if (!ambiguousEnPassantData) return;
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

        finalizeTurn(newBoard, null, true, newCaptured, { from, to });
    };

    return (
        <div className="min-h-screen flex flex-col md:flex-row items-center justify-center p-2 md:p-4 gap-4 md:gap-8 bg-gray-900 text-white">
            <div className="w-full max-w-lg md:max-w-md lg:max-w-lg xl:max-w-2xl relative">
                <GameOverlay
                    status={status}
                    winner={winner}
                    onRestart={() => goToNode('root', false)}
                    onPromote={handlePromotion}
                    promotionData={promotionData}
                    onResolveAmbiguousEnPassant={resolveAmbiguousEnPassant}
                    gameMode="analysis"
                    isMyTurnForAction={true}
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
                    arrows={arrows}
                    onBoardMouseDown={(e, r, c) => {
                        if (e.button === 0) setHighlightedSquares([]);
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
                                className="w-full h-16 p-2 bg-gray-900 border border-gray-700 rounded text-white placeholder-gray-400 resize-none text-sm"
                            />
                        </div>
                    )}
                </div>
            </div>

            <div className="w-full md:w-96 bg-gray-800 p-4 rounded-xl shadow-2xl flex flex-col h-[85vh] min-h-[400px]">
                <h2 className="text-2xl font-bold text-center text-green-400 mb-2">Analysis Board</h2>

                <div className="flex justify-between items-center mb-3 bg-gray-700 p-2 rounded">
                    <button onClick={() => goToNode('root', false)} className="px-4 py-2 bg-gray-700 hover:bg-gray-600 rounded disabled:opacity-50">&lt;&lt;</button>
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
                                        onClick={() => goToNode(n.id, false)}
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
                                                        ↑ Main
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
                                                        ↑ Main
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

                    <div className="bg-gray-700 p-3 rounded-lg">
                        <div className="flex items-center justify-between mb-2">
                            <label className="text-xs font-bold text-gray-400">DEPTH: {engineDepth}</label>
                            <input
                                type="range" min="1" max="100" value={engineDepth}
                                onChange={(e) => setEngineDepth(parseInt(e.target.value))}
                                className="w-2/3 h-1 bg-gray-600 rounded-lg appearance-none cursor-pointer"
                            />
                        </div>
                        <button
                            onClick={handleGetEngineMove}
                            className={`w-full py-2 rounded-lg font-bold text-sm transition-all ${engineThinking ? 'bg-red-600 animate-pulse' : 'bg-blue-600 hover:bg-blue-500'}`}
                        >
                            {engineThinking ? 'STOP ENGINE' : 'ENGINE ANALYSIS'}
                        </button>
                        {engineSuggestion && (
                            <div className="mt-2 p-2 bg-gray-900 rounded border border-green-500 text-center">
                                <span className="text-green-400 font-bold">{engineSuggestion}</span>
                            </div>
                        )}
                    </div>

                    <button
                        onClick={() => {
                            setSaveModalOpen(true);
                            if (!saveName) setSaveName('Analysis ' + new Date().toLocaleDateString());
                        }}
                        className="w-full py-2 bg-green-600 hover:bg-green-500 text-white rounded-lg font-semibold transition-colors"
                        disabled={!currentUser?.uid}
                    >
                        Save Analysis
                    </button>

                    <button
                        onClick={onBackToAnalysisManager ? handleBackToManager : onBack}
                        className="w-full py-2 bg-gray-700 hover:bg-gray-600 text-white rounded-lg font-semibold transition-colors mt-auto"
                    >
                        {onBackToAnalysisManager ? 'Back to Manager' : 'Exit Analysis'}
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
        </div>
    );
};

export default Analysis;
