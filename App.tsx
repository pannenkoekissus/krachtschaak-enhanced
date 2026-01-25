
import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import Board from './components/Board';
import GameOverlay from './components/GameOverlay';
import PieceComponent from './components/Piece';
import OnlineLobby from './components/OnlineLobby';
import GameReview from './components/GameReview';
import Auth from './components/Auth';
import PowerLegend from './components/PowerLegend';
import ConfirmationModal from './components/ConfirmationModal';
import { BoardState, Color, GameStatus, PieceType, Position, GameState, PromotionData, Piece, GameMode, TimerSettings, PlayerInfo, SentChallenge, Move, ChatMessage, LobbyGame } from './types';
import { createInitialBoard, getValidMoves, isPowerMove, hasLegalMoves, isKingInCheck, generateBoardKey, canCaptureKing, isAmbiguousMove, getNotation } from './utils/game';
import { getRatingCategory, RatingCategory, RATING_CATEGORIES } from './utils/ratings';
import { isFirebaseConfigured, auth, db } from './firebaseConfig';
import SettingsModal from './components/SettingsModal';

var continueGameClicks = -1;
const formatTime = (totalSeconds: number | null | undefined): string => {
    if (totalSeconds === null || totalSeconds === undefined) return '∞';
    if (totalSeconds < 0) totalSeconds = 0;
    const minutes = Math.floor(totalSeconds / 60);
    const seconds = Math.floor(totalSeconds % 60);
    return `${minutes}:${seconds < 10 ? '0' : ''}${seconds}`;
};

const formatDailyTime = (deadline: number | null): string => {
    if (deadline === null) return '∞';
    const remaining = deadline - Date.now();
    if (remaining <= 0) return '0s';

    const seconds = Math.floor((remaining / 1000) % 60);
    const minutes = Math.floor((remaining / (1000 * 60)) % 60);
    const hours = Math.floor((remaining / (1000 * 60 * 60)) % 24);
    const days = Math.floor(remaining / (1000 * 60 * 60 * 24));

    if (days > 0) return `${days}d ${hours}h ${minutes}m`;
    if (hours > 0) return `${hours}h ${minutes}m`;
    return `${minutes}m ${seconds}s`;
};

const formatTimerSettingText = (settings: TimerSettings) => {
    if (!settings) return 'Unlimited';
    if ('daysPerMove' in settings) return `${settings.daysPerMove} day${settings.daysPerMove > 1 ? 's' : ''} / move`;
    return `${settings.initialTime / 60} min | ${settings.increment} sec`;
};


const App: React.FC = () => {
    const [board, setBoard] = useState<BoardState>(() => createInitialBoard());
    const [turn, setTurn] = useState<Color>(Color.White);
    const [selectedPiece, setSelectedPiece] = useState<Position | null>(null);
    const [validMoves, setValidMoves] = useState<Position[]>([]);
    const [status, setStatus] = useState<GameStatus>('playing');
    const [winner, setWinner] = useState<string | null>(null);
    const [promotionData, setPromotionData] = useState<PromotionData | null>(null);
    const [capturedPieces, setCapturedPieces] = useState<Record<Color, Piece[]>>({ white: [], black: [] });
    const [enPassantTarget, setEnPassantTarget] = useState<Position | null>(null);
    const [halfmoveClock, setHalfmoveClock] = useState(0);
    const [positionHistory, setPositionHistory] = useState<Record<string, number>>({});
    const [ambiguousEnPassantData, setAmbiguousEnPassantData] = useState<{ from: Position, to: Position } | null>(null);
    const [drawOffer, setDrawOffer] = useState<Color | null>(null);
    const [history, setHistory] = useState<GameState[]>([]);
    const [playerTimes, setPlayerTimes] = useState<{ white: number; black: number; } | null>(null);
    const [displayedTime, setDisplayedTime] = useState<{ white: number; black: number; } | null>(null);
    const [moveDeadline, setMoveDeadline] = useState<number | null>(null);
    const [timerSettings, setTimerSettings] = useState<TimerSettings>(null);
    const [turnStartTime, setTurnStartTime] = useState<number | null>(null);
    const [completedAt, setCompletedAt] = useState<number | null>(null);
    
    const [gameMode, setGameMode] = useState<GameMode>('menu');
    const [showLocalSetup, setShowLocalSetup] = useState(false);
    const [showSettings, setShowSettings] = useState(false);
    
    // Online state
    const [gameId, setGameId] = useState<string | null>(null);
    const [myOnlineColor, setMyOnlineColor] = useState<Color | null>(null);
    const [players, setPlayers] = useState<{ [uid: string]: PlayerInfo }>({});
    const [playerColors, setPlayerColors] = useState<{ white: string | null; black: string | null; }>({ white: null, black: null });
    const [gameRef, setGameRef] = useState<any>(null);
    const [nextGameColor, setNextGameColor] = useState<Color>(() => Math.random() < 0.5 ? Color.White : Color.Black);
    const [initialRatings, setInitialRatings] = useState<{ white: number; black: number; } | null>(null);
    const [ratingChange, setRatingChange] = useState<{ white: number, black: number } | null>(null);
    const [ratingCategory, setRatingCategory] = useState<RatingCategory>(RatingCategory.Unlimited);
    const [isRated, setIsRated] = useState<boolean>(true);
    const [rematchOffer, setRematchOffer] = useState<Color | null>(null);
    const [nextGameId, setNextGameId] = useState<string | null>(null);
    const [isForcePowerMode, setIsForcePowerMode] = useState(false);
    const [challengedPlayerInfo, setChallengedPlayerInfo] = useState<{ uid: string; displayName: string } | null>(null);
    const [draggedPiece, setDraggedPiece] = useState<Position | null>(null);
    const [rejoinCountdown, setRejoinCountdown] = useState<number | null>(null);
    const [reviewingGame, setReviewingGame] = useState<GameState | null>(null);
    const [showPowerLegend, setShowPowerLegend] = useState(false);
    const [showConfirmation, setShowConfirmation] = useState<'draw' | 'resign' | 'move' | 'premove' | null>(null);
    const [pendingMove, setPendingMove] = useState<{from: Position, to: Position} | null>(null);
    const [pendingPremove, setPendingPremove] = useState<{from: Position, to: Position, isForcePower: boolean} | null>(null);
    const [showLogoutWarning, setShowLogoutWarning] = useState(false);

    // New Features: History & Chat
    const [moveHistory, setMoveHistory] = useState<Move[]>([]);
    const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);
    const [chatInput, setChatInput] = useState("");
    const [activeTab, setActiveTab] = useState<'controls' | 'chat' | 'moves'>('controls');

    // Local state for online interactions to prevent sending premature game state updates
    const [localPromotionState, setLocalPromotionState] = useState<PromotionData | null>(null);
    const [localAmbiguousEnPassantState, setLocalAmbiguousEnPassantState] = useState<{ from: Position, to: Position } | null>(null);

    // Settings State
    const [premovesEnabled, _setPremovesEnabled] = useState(true);
    const [moveConfirmationEnabled, _setMoveConfirmationEnabled] = useState(true);
    const [drawConfirmationEnabled, _setDrawConfirmationEnabled] = useState(true);
    const [resignConfirmationEnabled, _setResignConfirmationEnabled] = useState(true);
    const [premoves, setPremoves] = useState<GameState['premoves']>({});
    
    // Commit confirmation interception state
    const [pendingCommitState, setPendingCommitState] = useState<GameState | null>(null);
    const [preCommitState, setPreCommitState] = useState<GameState | null>(null);
    const preInteractionStateRef = useRef<GameState | null>(null); // Snapshot before promotion/ambiguous interaction

    // Menu Message State
    const [menuMessage, setMenuMessage] = useState<{ text: string, type: 'info' | 'error' } | null>(null);
    
    // UI State for highlighting and arrows
    const [lastMove, setLastMove] = useState<{ from: Position, to: Position } | null>(null);
    const [playersLeft, setPlayersLeft] = useState<{ [uid: string]: boolean }>({});
    const [highlightedSquares, setHighlightedSquares] = useState<Position[]>([]);
    const [arrows, setArrows] = useState<{ from: Position; to: Position }[]>([]);
    const [rightClickStartSquare, setRightClickStartSquare] = useState<Position | null>(null);
    
    // Lifted Lobby State
    const [lobbyView, setLobbyView] = useState<'games' | 'players' | 'current_games' | 'finished_games' | 'challenges'>('games');

    // Auth State
    const [currentUser, setCurrentUser] = useState<any>(null);
    const [myRatings, setMyRatings] = useState<Record<RatingCategory, number> | null>(null);
    const [authLoading, setAuthLoading] = useState(true);
    const [showAuthModal, setShowAuthModal] = useState(false);
    
    const statusRef = useRef(status);
    const timerRef = useRef<number | null>(null);
    const gameStateRef = useRef<GameState | null>(null);
    const rejoinTimerRef = useRef<number | null>(null);
    const countdownIntervalRef = useRef<number | null>(null);
    const presenceListeners = useRef<{ connectedRef?: any; userSessionsRef?: any }>({});
    const sessionRef = useRef<any>(null);
    const chatContainerRef = useRef<HTMLDivElement>(null);
    const movesContainerRef = useRef<HTMLDivElement>(null);

    // Local Game Custom Time State
    const [localCustomBase, setLocalCustomBase] = useState('10');
    const [localCustomInc, setLocalCustomInc] = useState('5');

    useEffect(() => {
        statusRef.current = status;
    }, [status]);

    useEffect(() => {
        if (chatContainerRef.current) {
            chatContainerRef.current.scrollTop = chatContainerRef.current.scrollHeight;
        }
    }, [chatMessages, activeTab]);

    useEffect(() => {
        if (activeTab === 'moves' && movesContainerRef.current) {
             movesContainerRef.current.scrollTop = movesContainerRef.current.scrollHeight;
        }
    }, [moveHistory, activeTab]);

    // Persistent Chat Read Status
    useEffect(() => {
        if (currentUser && gameRef && (activeTab === 'chat')) {
            // Update last read timestamp in Firebase if we are in chat tab and messages exist
            if (chatMessages.length > 0) {
                 const now = Date.now();
                 // Use update instead of set to avoid overwriting other user data
                 gameRef.child(`players/${currentUser.uid}`).update({ lastReadChatTimestamp: now });
            }
        }
    }, [activeTab, chatMessages.length, currentUser, gameRef]);

    const unreadChatCount = useMemo(() => {
        if (!currentUser) return 0;
        if (activeTab === 'chat') return 0;
        
        const myPlayer = players[currentUser.uid];
        const lastRead = myPlayer?.lastReadChatTimestamp || 0;
        
        return chatMessages.filter(msg => 
            msg.uid !== currentUser.uid && msg.timestamp > lastRead
        ).length;
    }, [chatMessages, players, currentUser, activeTab]);

    
    const randomizeNextGameColor = useCallback(() => {
        setNextGameColor(Math.random() < 0.5 ? Color.White : Color.Black);
    }, []);

    const onAuthSuccessCallback = useCallback((initialData?: { ratings: Record<RatingCategory, number> } | null) => {
        randomizeNextGameColor();
        if (initialData?.ratings) {
            setMyRatings(initialData.ratings);
        }
    }, [randomizeNextGameColor]);

    const setPremovesEnabled = (enabled: boolean) => {
        _setPremovesEnabled(enabled);
        if (currentUser && isFirebaseConfigured) {
            db.ref(`userSettings/${currentUser.uid}/premovesEnabled`).set(enabled);
        }
    };

    const setMoveConfirmationEnabled = (enabled: boolean) => {
        _setMoveConfirmationEnabled(enabled);
        if (currentUser && isFirebaseConfigured) {
            db.ref(`userSettings/${currentUser.uid}/moveConfirmationEnabled`).set(enabled);
        }
    };
    const setDrawConfirmationEnabled = (enabled: boolean) => {
        _setDrawConfirmationEnabled(enabled);
        if (currentUser && isFirebaseConfigured) {
            db.ref(`userSettings/${currentUser.uid}/drawConfirmationEnabled`).set(enabled);
        }
    };

    const setResignConfirmationEnabled = (enabled: boolean) => {
        _setResignConfirmationEnabled(enabled);
        if (currentUser && isFirebaseConfigured) {
            db.ref(`userSettings/${currentUser.uid}/resignConfirmationEnabled`).set(enabled);
        }
    };
    const updateSettings = (key: string, value: boolean) => {
        if (currentUser && isFirebaseConfigured) {
            db.ref(`userSettings/${currentUser.uid}/${key}`).set(value);
        }
    };
    
    // Load settings from Firebase
    useEffect(() => {
        if (currentUser && isFirebaseConfigured) {
            const settingsRef = db.ref(`userSettings/${currentUser.uid}`);
            settingsRef.once('value', (snapshot: any) => {
                const val = snapshot.val();
                if (val) {
                    if (val.premovesEnabled !== undefined) _setPremovesEnabled(val.premovesEnabled);
                    if (val.moveConfirmationEnabled !== undefined) _setMoveConfirmationEnabled(val.moveConfirmationEnabled);
                    if (val.drawConfirmationEnabled !== undefined) _setDrawConfirmationEnabled(val.drawConfirmationEnabled);
                    if (val.resignConfirmationEnabled !== undefined) _setResignConfirmationEnabled(val.resignConfirmationEnabled);
                }
            });
        }
    }, [currentUser]);

    // AUTH & PRESENCE EFFECT
    useEffect(() => {
        if (!isFirebaseConfigured) {
            setAuthLoading(false);
            setCurrentUser(null);
            setShowAuthModal(true);
            return;
        }
    
        const unsubscribe = auth.onAuthStateChanged(async (user: any) => {
            // Clean up any listeners from the previous user
            if (presenceListeners.current.connectedRef) presenceListeners.current.connectedRef.off();
            if (presenceListeners.current.userSessionsRef) presenceListeners.current.userSessionsRef.off();
            presenceListeners.current = {};
            sessionRef.current = null;

            const isAllowedIn = user && (user.isAnonymous || user.emailVerified);
    
            if (isAllowedIn) {
                const ratingRef = db.ref(`userRatings/${user.uid}`);
                const ratingSnap = await ratingRef.once('value');

                if (!ratingSnap.exists()) {
                    const initialRatings = RATING_CATEGORIES.reduce((acc, category) => {
                        acc[category] = 1200;
                        return acc;
                    }, {} as Record<RatingCategory, number>);
                    const ratingsData = { ratings: initialRatings };
                    await db.ref(`userRatings/${user.uid}`).set(ratingsData);
                    await db.ref(`users/${user.uid}`).set({ displayName: user.displayName, isOnline: false });
                }

                setCurrentUser(user);
                setShowAuthModal(false);
    
                const liveRatingRef = db.ref(`userRatings/${user.uid}/ratings`);
                liveRatingRef.on('value', (snapshot: any) => {
                    setMyRatings(snapshot.val());
                });
    
                // Multi-session presence system
                const userRef = db.ref(`users/${user.uid}`);
                const connectedRef = db.ref('.info/connected');
                const userSessionsRef = db.ref(`sessions/${user.uid}`);
                const userIsOnlineRef = userRef.child('isOnline');
                
                presenceListeners.current = { connectedRef, userSessionsRef };

                connectedRef.on('value', (snap: any) => {
                    if (snap.val() !== true) return;
                    
                    const session = userSessionsRef.push(true);
                    sessionRef.current = session;
                    
                    // When this session disconnects, remove it from the list.
                    session.onDisconnect().remove(() => {});

                    // Also, queue a status update to offline. 
                    // If other sessions are open, their listener will override this back to true.
                    // If this is the last session, it will correctly stay false.
                    userIsOnlineRef.onDisconnect().set(false);

                    if (!user.isAnonymous && user.displayName) {
                        userRef.child('displayName').set(user.displayName);
                    }
                });
                
                userSessionsRef.on('value', (snapshot: any) => {
                    userIsOnlineRef.set(snapshot.exists());
                });

            } else {
                setCurrentUser(null);
                setMyRatings(null);
                setShowAuthModal(true);
            }
            setAuthLoading(false);
        });
    
        return () => {
            unsubscribe();
            if (presenceListeners.current.connectedRef) presenceListeners.current.connectedRef.off();
            if (presenceListeners.current.userSessionsRef) presenceListeners.current.userSessionsRef.off();
        };
    }, []);
    
    const currentGameState = useMemo((): GameState => ({
        board, turn, status, winner, promotionData, capturedPieces,
        enPassantTarget, halfmoveClock, positionHistory,
        ambiguousEnPassantData, drawOffer, playerTimes, moveDeadline, timerSettings, ratingCategory, players, playerColors, initialRatings,
        isRated, rematchOffer, nextGameId, ratingChange, challengedPlayerInfo, turnStartTime, premoves, lastMove, playersLeft,
        completedAt, moveHistory, chat: chatMessages
    }), [
        board, turn, status, winner, promotionData, capturedPieces,
        enPassantTarget, halfmoveClock, positionHistory,
        ambiguousEnPassantData, drawOffer, playerTimes, moveDeadline, timerSettings, ratingCategory, players, playerColors, initialRatings,
        isRated, rematchOffer, nextGameId, ratingChange, challengedPlayerInfo, turnStartTime, premoves, lastMove, playersLeft,
        completedAt, moveHistory, chatMessages
    ]);
    
    useEffect(() => {
        gameStateRef.current = currentGameState;
    }, [currentGameState]);

    const updateGameInDb = useCallback((newState: GameState) => {
        if (gameMode === 'online_playing' && gameRef) {
            try {
                gameRef.set(newState);
            } catch (e) {
                console.error("Error updating game in DB:", e);
            }
        }
    }, [gameMode, gameRef]);
    
    const loadGameState = useCallback((state: GameState | null) => {
        if (!state) {
            return;
        }

        const sanitizePiece = (p: any): Piece | null => {
            if (p && typeof p === 'object' && p.type && p.color) {
                return {
                    type: p.type,
                    color: p.color,
                    power: p.power || null,
                    originalType: p.originalType || p.type,
                    isKing: !!p.isKing,
                    hasMoved: typeof p.hasMoved === 'boolean' ? p.hasMoved : false,
                };
            }
            return null;
        };
    
        const sanitizePieceArray = (arr: any[] | undefined): Piece[] => {
            if (!Array.isArray(arr)) return [];
            return arr.map(sanitizePiece).filter((p): p is Piece => p !== null);
        };
    
        const rawBoard = state.board;
        const safeBoard: BoardState = Array(8).fill(null).map(() => Array(8).fill(null));
        if (rawBoard && Array.isArray(rawBoard)) {
            for (let r = 0; r < 8; r++) {
                const rawRow = rawBoard[r];
                if (rawRow && (Array.isArray(rawRow) || typeof rawRow === 'object')) {
                     for (let c = 0; c < 8; c++) {
                        safeBoard[r][c] = sanitizePiece((rawRow as any)[c]);
                    }
                }
            }
        }
        setBoard(safeBoard);
    
        const rawCaptured = state.capturedPieces;
        const safeCaptured: Record<Color, Piece[]> = { white: [], black: [] };
        if (rawCaptured && typeof rawCaptured === 'object') {
            safeCaptured.white = sanitizePieceArray(rawCaptured.white);
            safeCaptured.black = sanitizePieceArray(rawCaptured.black);
        }
        setCapturedPieces(safeCaptured);
    
        setTurn(state.turn || Color.White);
        setStatus(state.status || 'playing');
        setWinner(state.winner || null);
        setPromotionData(state.promotionData || null);
        setEnPassantTarget(state.enPassantTarget || null);
        setHalfmoveClock(state.halfmoveClock || 0);
        setPositionHistory(state.positionHistory || {});
        setAmbiguousEnPassantData(state.ambiguousEnPassantData || null);
        setDrawOffer(state.drawOffer || null);
    
        setPlayerTimes(state.playerTimes || null);
        setDisplayedTime(state.playerTimes || null);
        setTurnStartTime(state.turnStartTime || null);
        setMoveDeadline(state.moveDeadline || null);
        setCompletedAt(state.completedAt || null);
        setTimerSettings(state.timerSettings || null);
        setRatingCategory(state.ratingCategory || RatingCategory.Unlimited);
        setInitialRatings(state.initialRatings || null);
        setIsRated(typeof state.isRated === 'boolean' ? state.isRated : true);
        setRematchOffer(state.rematchOffer || null);
        setNextGameId(state.nextGameId || null);
        setRatingChange(state.ratingChange || null);
        setChallengedPlayerInfo(state.challengedPlayerInfo || null);
        setPremoves(state.premoves || {});
        setLastMove(state.lastMove || null);
        setMoveHistory(state.moveHistory || []);
        setChatMessages(state.chat || []);
        
        // This is a transient UI state and should be reset whenever the game state is loaded.
        setDraggedPiece(null);


        const rawPlayers = state.players;
        const safePlayers: { [uid: string]: PlayerInfo } = {};
        if (typeof rawPlayers === 'object' && rawPlayers !== null) {
            // Provide a default ratings object for players loaded from the database who might be missing this data.
            const defaultRatings: Record<RatingCategory, number> = RATING_CATEGORIES.reduce((acc, category) => {
                acc[category] = 1200;
                return acc;
            }, {} as Record<RatingCategory, number>);
            for (const uid in rawPlayers) {
                const p = rawPlayers[uid];
                if (p && typeof p === 'object' && p.uid && p.displayName) {
                    safePlayers[uid] = {
                        uid: p.uid,
                        displayName: p.displayName,
                        disconnectTimestamp: p.disconnectTimestamp || null,
                        ratings: p.ratings || defaultRatings,
                        lastReadChatTimestamp: p.lastReadChatTimestamp || 0
                    };
                }
            }
        }
        setPlayers(safePlayers);
    
        const rawPlayerColors = state.playerColors;
        let safePlayerColors = { white: null, black: null };
        if (typeof rawPlayerColors === 'object' && rawPlayerColors !== null) {
            safePlayerColors = {
                white: rawPlayerColors.white || null,
                black: rawPlayerColors.black || null,
            };
        }
        setPlayerColors(safePlayerColors);
    }, []);

    const commitNewGameState = useCallback((newState: GameState, isFromRemote = false, skipConfirmation = false) => {
        if (!isFromRemote) {
             const isCorrespondence = !newState.timerSettings || 'daysPerMove' in newState.timerSettings;
             // Intercept commit for confirmation if enabled for Correspondence/Daily games
             // Important: Do NOT loadGameState here to prevent visual update until confirmed
             if (!skipConfirmation && moveConfirmationEnabled && isCorrespondence && gameMode != 'local') {
                 setPendingCommitState(newState);
                 
                 // If we have a state snapshot from before an online interaction (promotion/ambiguous), use that as the base for reversion.
                 // Otherwise use current state (for simple moves).
                 const revertState = preInteractionStateRef.current || gameStateRef.current;
                 setPreCommitState(revertState);
                 
                 // Clear the interaction ref now that we've used it
                 if (preInteractionStateRef.current) {
                     preInteractionStateRef.current = null;
                 }

                 setShowConfirmation('move');
                 return;
             }

            loadGameState(newState);
            setSelectedPiece(null);
            setValidMoves([]);
            setIsForcePowerMode(false);
            if (gameMode === 'local') {
                setHistory(prev => [...prev, newState]);
            }
             updateGameInDb(newState);
        } else {
            loadGameState(newState);
        }
    }, [gameMode, loadGameState, updateGameInDb, moveConfirmationEnabled]);

    const calculateElo = (ratingA: number, ratingB: number, scoreA: number) => {
        const kFactor = 32;
        const expectedA = 1 / (1 + 10 ** ((ratingB - ratingA) / 400));
        const newRatingA = ratingA + kFactor * (scoreA - expectedA);
        return Math.round(newRatingA);
    };

    const handleGameOver = useCallback(async (baseState: GameState, newStatus: GameStatus, newWinner: string | null) => {
        if (statusRef.current !== 'playing' && statusRef.current !== 'promotion') return;

        let finalState: GameState = { 
            ...baseState, 
            status: newStatus, 
            winner: newWinner, 
            playersLeft: baseState.playersLeft || {},
            completedAt: gameMode === 'online_playing' ? (window.firebase.database.ServerValue.TIMESTAMP as any) : Date.now()
        };
    
        if (gameMode === 'online_playing' && finalState.isRated && finalState.playerColors.white && finalState.playerColors.black) {
            const whiteUid = finalState.playerColors.white!;
            const blackUid = finalState.playerColors.black!;
            const category = finalState.ratingCategory;

            // Use rating at the end of the game
            let whiteRating = 1200;
            let blackRating = 1200;
            
            try {
                // Fetch current ratings
                const whiteRatingSnap = await db.ref(`userRatings/${whiteUid}/ratings/${category}`).once('value');
                const blackRatingSnap = await db.ref(`userRatings/${blackUid}/ratings/${category}`).once('value');
                
                if (whiteRatingSnap.exists()) whiteRating = whiteRatingSnap.val();
                if (blackRatingSnap.exists()) blackRating = blackRatingSnap.val();

            } catch (e) {
                console.error("Error fetching final ratings", e);
                // Fallback to initial ratings if fetch fails
                if (finalState.initialRatings) {
                    whiteRating = finalState.initialRatings.white;
                    blackRating = finalState.initialRatings.black;
                }
            }
            
            let whiteScore = 0.5;
            if (newWinner === 'White' || newWinner === 'white') whiteScore = 1;
            if (newWinner === 'Black' || newWinner === 'black') whiteScore = 0;
            const blackScore = 1 - whiteScore;
    
            const newWhiteRating = calculateElo(whiteRating, blackRating, whiteScore);
            const newBlackRating = calculateElo(blackRating, whiteRating, blackScore);
            
            const calculatedRatingChange = {
                white: newWhiteRating - whiteRating,
                black: newBlackRating - blackRating
            };
            finalState.ratingChange = calculatedRatingChange;
    
            if (myOnlineColor) { // Only the player(s) still in the game should write the result
                db.ref(`userRatings/${whiteUid}/ratings/${category}`).set(newWhiteRating);
                db.ref(`userRatings/${blackUid}/ratings/${category}`).set(newBlackRating);
            }
        }
        // Force commit for game over, bypassing move confirmation logic
        commitNewGameState(finalState, false, true);
    }, [gameMode, myOnlineColor, commitNewGameState, gameId]);


    const finalizeTurn = useCallback((
        baseState: GameState,
        currentBoard: BoardState,
        nextEnPassantTarget: Position | null,
        resetClock: boolean,
        newCaptured: typeof capturedPieces,
        move: { from: Position; to: Position } | null,
        promotion?: PieceType | null,
        moveDetails?: { isForcePower?: boolean }
    ) => {
        const { turn, halfmoveClock, positionHistory, drawOffer, timerSettings, players, playerColors, initialRatings, isRated, ratingCategory, challengedPlayerInfo, playersLeft, moveHistory } = baseState;
        
        const newPlayerTimes = (baseState.playerTimes && timerSettings && 'increment' in timerSettings) ? { ...baseState.playerTimes, [turn]: baseState.playerTimes[turn] + timerSettings.increment } : baseState.playerTimes;

        const nextTurn = turn === Color.White ? Color.Black : Color.White;
        const newHalfmoveClock = resetClock ? 0 : halfmoveClock + 1;
        const key = generateBoardKey(currentBoard, nextTurn, nextEnPassantTarget);
        const newCount = (positionHistory[key] || 0) + 1;
        const newPositionHistory = { ...positionHistory, [key]: newCount };
        let newStatus: GameStatus = 'playing';
        let newWinner: string | null = null;
    
        if (newHalfmoveClock >= 100) {
            newStatus = 'draw_fiftyMove';
        } else if (newCount >= 3) {
            newStatus = 'draw_threefold';
        } else {
            const hasStandardLegalMoves = hasLegalMoves(currentBoard, nextTurn, nextEnPassantTarget);
            const canPlayerCaptureKing = canCaptureKing(currentBoard, nextTurn);
    
            if (!hasStandardLegalMoves && !canPlayerCaptureKing) {
                const isPlayerInCheck = isKingInCheck(currentBoard, nextTurn);
                if (isPlayerInCheck) {
                    newStatus = 'checkmate';
                    newWinner = turn.charAt(0).toUpperCase() + turn.slice(1);
                } else {
                    newStatus = 'stalemate';
                }
            }
        }

        let newMoveDeadline = baseState.moveDeadline;
        if (timerSettings && 'daysPerMove' in timerSettings) {
            newMoveDeadline = Date.now() + timerSettings.daysPerMove * 24 * 60 * 60 * 1000;
        }

        // Append Move to History
        let newMoveHistory = [...(moveHistory || [])];
        if (move) {
            let piece = baseState.board[move.from.row][move.from.col];
            
            // Fallback for online ambiguous en passant where piece is already at 'to' visually in currentState (via localAmbiguousEnPassantState)
            // Note: finalizeTurn is called with currentBoard = newBoard from resolveAmbiguousEnPassant.
            // newBoard has the piece at 'to'.
            // But if we look at baseState.board, the piece might still be at 'from'.
            // However, if we are resolving, we want to grab the piece properties.
            if (!piece && localAmbiguousEnPassantState && localAmbiguousEnPassantState.from.row === move.from.row && localAmbiguousEnPassantState.from.col === move.from.col) {
                 // Try to grab it from the board passed in, at the 'to' location, since we just moved it there in resolveAmbiguousEnPassant
                 const pAtTo = currentBoard[move.to.row][move.to.col];
                 if(pAtTo) piece = pAtTo;
            }
            
            // Fallback for local promotion where piece is not at 'from' in baseState if it was already moved during the promotion state transition
            if (!piece && baseState.promotionData && baseState.promotionData.from.row === move.from.row && baseState.promotionData.from.col === move.from.col) {
                piece = baseState.promotionData.promotingPiece;
            }
            
            // Fallback for online promotion
            if (!piece && localPromotionState && localPromotionState.from.row === move.from.row && localPromotionState.from.col === move.from.col) {
                piece = localPromotionState.promotingPiece;
            }
            
             // Fallback for online ambiguous en passant
             // Note: We changed logic so movePiece DOES NOT update board visually for ambiguous EP, so piece SHOULD be at 'from'
             // But keeping fallback just in case of race conditions or specific flows
            if (!piece && localAmbiguousEnPassantState && localAmbiguousEnPassantState.from.row === move.from.row && localAmbiguousEnPassantState.from.col === move.from.col) {
                 // Try to grab from currentBoard if not in baseState, but ideally it's in baseState
                 const pAtFrom = currentBoard[move.to.row][move.to.col]; // It moved to 'to' in currentBoard
                 if(pAtFrom) piece = pAtFrom; // It might have transformed or moved, but properties should be roughly same for history
            }


            if (piece) {
                const targetPiece = baseState.board[move.to.row][move.to.col];
                // Determine if it was a capture for notation purposes (en passant, standard, or power move capture)
                
                let isCapture = false;
                if (localPromotionState || localAmbiguousEnPassantState) {
                     // In online promotion/ambiguous, baseState board already has the piece moved. 
                     // For pawn moves, diagonal implies capture.
                     isCapture = move.from.col !== move.to.col;
                } else {
                     isCapture = !!targetPiece || (piece?.type === PieceType.Pawn && move.to.col !== move.from.col && !targetPiece);
                }
                
                // For online promotion, targetPiece is actually the moved piece itself (since baseState is updated), so we shouldn't use it for capturedPieceType logic directly in a standard way.
                const capturedPieceType = targetPiece ? targetPiece.type : (isCapture ? PieceType.Pawn : undefined);
                
                // For getNotation, we need a Piece object if captured.
                const capturedForNotation = isCapture ? (targetPiece || { type: PieceType.Pawn } as any) : null;

                const notation = getNotation(baseState.board, move.from, move.to, piece, capturedForNotation, promotion || null, moveDetails?.isForcePower);

                // Retrieve the final state of power from the NEW board
                const pieceOnNewBoard = currentBoard[move.to.row][move.to.col];
                const afterPower = pieceOnNewBoard ? pieceOnNewBoard.power : null;

                // Determine if power was consumed.
                // Logic: The piece had a power before, but doesn't have one now (and didn't just swap it or get promoted from pawn-powerless to something else).
                // piece.power comes from the board state BEFORE the move (unless it's a promotion fallback, then it's from the promoting piece)
                const powerConsumed = !!(piece.power && !afterPower);

                // Explicitly construct move object to avoid potential undefined property issues which crash Firebase
                // Use default values for optional fields that might be undefined
                const moveData: Move = {
                    from: move.from,
                    to: move.to,
                    piece: piece.type || PieceType.Pawn, // Sanitization just in case
                    notation: notation,
                    color: turn,
                    afterPower: afterPower || null,
                    isForcePower: !!moveDetails?.isForcePower, // Ensure boolean, never undefined
                    powerConsumed: powerConsumed
                };
                
                if (capturedPieceType) {
                    moveData.captured = capturedPieceType;
                }
                if (promotion) {
                    moveData.promotion = promotion;
                }

                newMoveHistory.push(moveData);
            }
        }

        const turnEndState: GameState = {
            board: currentBoard, turn, status: newStatus, winner: newWinner, promotionData: null,
            capturedPieces: newCaptured, enPassantTarget: nextEnPassantTarget, halfmoveClock: newHalfmoveClock,
            positionHistory: newPositionHistory, ambiguousEnPassantData: null,
            // Logic change: drawOffer is preserved if it equals the current turn (offerer just moved)
            // and cleared if it equals nextTurn (opponent moved)
            drawOffer: (drawOffer && drawOffer === turn) ? drawOffer : null, 
            playerTimes: newPlayerTimes,
            turnStartTime: null,
            moveDeadline: newMoveDeadline,
            timerSettings, ratingCategory, players, playerColors, initialRatings, isRated, rematchOffer: null, nextGameId: null, ratingChange: null, challengedPlayerInfo, 
            premoves: baseState.premoves,
            playersLeft,
            lastMove: move,
            moveHistory: newMoveHistory,
            chat: baseState.chat
        };

        if (newStatus !== 'playing') {
            handleGameOver(turnEndState, newStatus, newWinner);
            return;
        }
    
        const newGameState: GameState = {
           ...turnEndState,
           turn: nextTurn,
           turnStartTime: (timerSettings && 'initialTime' in timerSettings) ? (gameMode === 'local' ? Date.now() : (window.firebase.database.ServerValue.TIMESTAMP as any)) : null,
        };
    
        commitNewGameState(newGameState);
    }, [commitNewGameState, handleGameOver, gameMode, localPromotionState, localAmbiguousEnPassantState]);
    
const [serverOffset, setServerOffset] = useState<number>(0);

useEffect(() => {
    const offsetRef = db.ref('.info/serverTimeOffset');
    const onValue = (snap: any) => {
        setServerOffset(snap.val() || 0);
    };
    offsetRef.on('value', onValue);
    return () => offsetRef.off('value', onValue);
}, []);

    useEffect(() => {
        if (timerRef.current) clearInterval(timerRef.current);
    
        if (status !== 'playing' && status !== 'promotion') {
            setDisplayedTime(playerTimes);
            return;
        }
    
        const isRealtime = timerSettings && 'initialTime' in timerSettings;
        const isDaily = timerSettings && 'daysPerMove' in timerSettings;
    
        if (isRealtime && playerTimes && turnStartTime) {
            const timeAtTurnStart = playerTimes[turn];
            setDisplayedTime(playerTimes);
            if (timerRef.current) clearInterval(timerRef.current);
            timerRef.current = window.setInterval(() => {
                if (statusRef.current !== 'playing') {
                    if (timerRef.current) clearInterval(timerRef.current);
                    return;
                }
                var elapsedSeconds = Math.max(0, (Date.now() - turnStartTime + serverOffset)) / 1000;
                if (gameMode === 'local') {
                    elapsedSeconds = Math.max(0, Date.now() - turnStartTime) / 1000;
                }
                const newTime = timeAtTurnStart - elapsedSeconds;
                
                setDisplayedTime(prev => prev ? { ...prev, [turn]: Math.max(0, newTime) } : null);
    
                if (newTime <= 0) {
                     // Check timeout even if opponent is disconnected
                     if (gameMode !== 'online_playing' || turn === myOnlineColor || statusRef.current === 'playing') {
                        if (timerRef.current) clearInterval(timerRef.current);
                        const winnerColor = turn.toLowerCase() === Color.White.toLowerCase() ? Color.Black : Color.White;
                        if (gameStateRef.current) {
                            const finalPlayerTimes = { ...(gameStateRef.current.playerTimes!), [turn]: 0 };
                            const timeOutState = { ...gameStateRef.current, playerTimes: finalPlayerTimes };
                            handleGameOver(timeOutState, 'timeout', winnerColor.charAt(0).toUpperCase() + winnerColor.slice(1));
                        }
                    }
                }
            }, 250);
        } else if (isDaily && moveDeadline) {
             timerRef.current = window.setInterval(() => {
                if (statusRef.current !== 'playing') {
                     if (timerRef.current) clearInterval(timerRef.current);
                     return;
                }
                setMoveDeadline(d => d); 
                
                if (Date.now() > moveDeadline) {
                    if (gameMode !== 'online_playing' || turn === myOnlineColor || statusRef.current === 'playing') {
                        if (timerRef.current) clearInterval(timerRef.current);
                        const winnerColor = turn.toLowerCase() === Color.White.toLowerCase() ? Color.Black : Color.White;
                        if (gameStateRef.current) {
                            handleGameOver(gameStateRef.current, 'timeout', winnerColor.charAt(0).toUpperCase() + winnerColor.slice(1));
                        }
                    }
                }
            }, 1000);
        } else {
            setDisplayedTime(playerTimes);
        }
    
        return () => {
            if (timerRef.current) clearInterval(timerRef.current);
        };
    }, [status, turn, gameMode, myOnlineColor, handleGameOver, playerTimes, timerSettings, moveDeadline, turnStartTime, localPromotionState]);


    const resetGame = useCallback((
        mode: GameMode,
        settings: TimerSettings = null,
        dontLoad = false,
        isGameRated = true
    ): GameState => {
        const initialBoard = createInitialBoard();
        const initialKey = generateBoardKey(initialBoard, Color.White, null);
        const category = getRatingCategory(settings);

        let initialPlayerTimes = null;
        let initialMoveDeadline = null;
        let initialTurnStartTime = null;

        if (settings && 'initialTime' in settings) {
            initialPlayerTimes = { white: settings.initialTime, black: settings.initialTime };
            if (mode === 'local') {
                initialTurnStartTime = Date.now();
            }
        } else if (settings && 'daysPerMove' in settings) {
            if (mode === 'local') {
                initialMoveDeadline = Date.now() + settings.daysPerMove * 24 * 60 * 60 * 1000;
            }
        }

        const initialGameState: GameState = {
            board: initialBoard, turn: Color.White, status: 'playing', winner: null,
            capturedPieces: { white: [], black: [] }, enPassantTarget: null,
            halfmoveClock: 0, positionHistory: { [initialKey]: 1 }, promotionData: null,
            ambiguousEnPassantData: null, drawOffer: null, timerSettings: settings,
            ratingCategory: category,
            playerTimes: initialPlayerTimes,
            turnStartTime: initialTurnStartTime,
            moveDeadline: initialMoveDeadline,
            completedAt: null,
            players: {},
            playerColors: { white: null, black: null },
            initialRatings: null,
            isRated: mode === 'local' ? false : isGameRated,
            rematchOffer: null,
            nextGameId: null,
            ratingChange: null,
            challengedPlayerInfo: null,
            playersLeft: {},
            premoves: {},
            lastMove: null,
            moveHistory: [],
            chat: []
        };
        
        if (!dontLoad) {
            loadGameState(initialGameState);
            setDisplayedTime(initialPlayerTimes);
            setSelectedPiece(null); setValidMoves([]); setHistory([initialGameState]);
            setGameMode(mode); setShowLocalSetup(false);
            setHighlightedSquares([]);
            setArrows([]);
            setChatMessages([]);
            setMoveHistory([]);
        }
        return initialGameState;
    }, [loadGameState]);
    
    const handleBackToMenu = useCallback(async () => {
        const localStatus = statusRef.current;
        if (currentUser && gameMode === 'online_playing' && localStatus === 'playing' && gameRef) {
            const isExempt = ratingCategory === RatingCategory.Daily || ratingCategory === RatingCategory.Unlimited;
            if (!isExempt) {
                gameRef.child(`players/${currentUser.uid}/disconnectTimestamp`).set(window.firebase.database.ServerValue.TIMESTAMP);
            }
        }
    
        if (currentUser && gameMode === 'online_playing' && localStatus === 'waiting' && gameRef && gameId) {
            const isPersistentGame = !timerSettings || ('daysPerMove' in timerSettings);
            if (!isPersistentGame) {
                const updates: { [path: string]: any } = {};
                updates[`/games/${gameId}`] = null;
                updates[`/userGames/${currentUser.uid}/${gameId}`] = null;
                
                const challengedUid = gameStateRef.current?.challengedPlayerInfo?.uid;
                if (challengedUid) {
                    db.ref(`challenges/${challengedUid}/${gameId}`).remove(() => {});
                }
                
                db.ref().update(updates);
            }
        }
    
        // Navigation Logic: Return to Lobby if logged in and online game, else Main Menu
        if (gameMode === 'online_playing' || gameMode === 'online_spectating') {
             setGameMode('online_lobby');
        } else {
             setGameMode('menu');
             if (gameMode === 'online_lobby') {
                 setLobbyView('games');
             }
        }

        setMyOnlineColor(null);
        setGameId(null);
        if (gameRef) gameRef.off();
        setGameRef(null);
        setShowLocalSetup(false);
        randomizeNextGameColor();
        setChatMessages([]);
    }, [gameId, myOnlineColor, currentUser, randomizeNextGameColor, gameMode, status, gameRef, timerSettings, ratingCategory]);
    
    const handleStartOnline = () => {
        if (currentUser) {
            setGameMode('online_lobby');
        } else {
            setShowAuthModal(true);
        }
    };

    const handleContinueOnlineGame = async () => {
        if (!currentUser) return;
        setMenuMessage(null);
        continueGameClicks = continueGameClicks + 1;
        try {
            const userGamesSnapshot = await db.ref(`userGames/${currentUser.uid}`).once('value');
            const userGamesObj = userGamesSnapshot.val();
            

            if (!userGamesObj) {
                setMenuMessage({ text: "You don't have any moves to make!", type: 'info' });
                setTimeout(() => {if (continueGameClicks === 0) {
                setMenuMessage(null)
                }
                continueGameClicks = continueGameClicks - 1;
                }, 3000);
                return;
            }

            const gameIds = Object.keys(userGamesObj);
            const gamePromises = gameIds.map(id => db.ref(`games/${id}`).once('value'));
            const gameSnapshots = await Promise.all(gamePromises);

            const activeRealTimeGames: { id: string, lastMoveTime: number }[] = [];
            const activeCorrespondenceGames: { id: string, timeLeft: number }[] = [];

            gameSnapshots.forEach(snap => {
                const game = snap.val() as GameState;
                if (game && game.status === 'playing') {
                    const myColor = game.playerColors.white === currentUser.uid ? Color.White : Color.Black;
                    
                    if (game.timerSettings && 'initialTime' in game.timerSettings) {
                        // Priority 1: Any active Real-time game
                        const lastMoveTime = game.turnStartTime || 0;
                        activeRealTimeGames.push({ id: snap.key!, lastMoveTime: lastMoveTime + (game.turn === myColor ? 100000000000 : 0) }); // Hack to boost my turn priority
                    } else {
                        // Priority 2: Correspondence game where it IS my turn
                        if (game.turn === myColor) {
                            let timeLeft = Number.MAX_SAFE_INTEGER;
                            if (game.timerSettings && 'daysPerMove' in game.timerSettings && game.moveDeadline) {
                                timeLeft = Math.max(0, game.moveDeadline - Date.now());
                            }
                            activeCorrespondenceGames.push({ id: snap.key!, timeLeft });
                        }
                    }
                }
            });

            // 1. Check Real-Time games
            if (activeRealTimeGames.length > 0) {
                 activeRealTimeGames.sort((a, b) => b.lastMoveTime - a.lastMoveTime); // Most recent / active first
                 const gameId = activeRealTimeGames[0].id;
                 const gameSnapshot = gameSnapshots.find(s => s.key === gameId)!;
                 const gameData = gameSnapshot.val() as GameState;
                 const myColor = gameData.playerColors.white === currentUser.uid ? Color.White : Color.Black;
                 
                 setLobbyView('current_games');
                 handleOnlineGameStart(gameId, myColor);
                 return;
            }

            // 2. Check Correspondence games (My turn)
            if (activeCorrespondenceGames.length > 0) {
                 activeCorrespondenceGames.sort((a, b) => a.timeLeft - b.timeLeft); // Least time left first
                 const gameId = activeCorrespondenceGames[0].id;
                 const gameSnapshot = gameSnapshots.find(s => s.key === gameId)!;
                 const gameData = gameSnapshot.val() as GameState;
                 const myColor = gameData.playerColors.white === currentUser.uid ? Color.White : Color.Black;

                 setLobbyView('current_games');
                 handleOnlineGameStart(gameId, myColor);
                 return;
            }

            setMenuMessage({ text: "You don't have any moves to make!", type: 'info' });
            setTimeout(() => {if (continueGameClicks === 0) {
                setMenuMessage(null)
                }
                continueGameClicks = continueGameClicks - 1;
                }, 3000);

        } catch (e) {
            console.error("Error continuing game:", e);
            setMenuMessage({ text: "Error finding game.", type: 'error' });
            setTimeout(() => {if (continueGameClicks === 0) {
                setMenuMessage(null)
                }
                continueGameClicks = continueGameClicks - 1;
                }, 3000);
        }
    };
//spectate functie
const handleOnlineSpectate = useCallback((id: string) => {
    setGameId(id);
    const ref = db.ref(`games/${id}`);
    setGameRef(ref);
    
    setGameMode('online_spectating'); // Nieuwe modus!
    setMyOnlineColor('white'); // Belangrijk: je bent geen wit of zwart
    
    // Reset states
    setRematchOffer(null);
    setNextGameId(null);
    setRatingChange(null);
    setIsForcePowerMode(false);
    setDraggedPiece(null);
    setActiveTab('controls');
}, []);

    const handleOnlineGameStart = useCallback((id: string, color: Color) => {
        setMyOnlineColor(color);
        setGameId(id);
        const ref = db.ref(`games/${id}`);
        setGameRef(ref);
        setGameMode('online_playing');
        
        setRematchOffer(null);
        setNextGameId(null);
        setRatingChange(null);
        setIsForcePowerMode(false);
        setDraggedPiece(null);
        setActiveTab('controls');

    }, []);
    
    useEffect(() => {
        if (!gameRef || !currentUser) return;
    
        const playerInGameRef = gameRef.child(`players/${currentUser.uid}`);
        playerInGameRef.update({ disconnectTimestamp: null });
        const onDisconnectRef = playerInGameRef.child('disconnectTimestamp').onDisconnect();
        onDisconnectRef.set(window.firebase.database.ServerValue.TIMESTAMP);

        const onGameUpdate = (snapshot: any) => {
            if (snapshot.exists()) {
                const rawState: GameState = snapshot.val();
                
                if (rawState.nextGameId) {
                    if (gameRef) gameRef.off('value', onGameUpdate);
                    const myNewColor = rawState.playerColors.white === currentUser.uid ? Color.Black : Color.White;
                    handleOnlineGameStart(rawState.nextGameId, myNewColor);
                    return;
                }
    
                commitNewGameState(rawState, true);
    
            } else {
                 if (statusRef.current !== 'opponent_disconnected' && statusRef.current !== 'kingCaptured' && statusRef.current !== 'checkmate' && myOnlineColor) {
                   const winnerName = myOnlineColor.charAt(0).toUpperCase() + myOnlineColor.slice(1);
                   if (gameStateRef.current) {
                   }
                }
            }
        };
    
        gameRef.on('value', onGameUpdate);
    
        return () => {
            if (playerInGameRef) {
                onDisconnectRef.cancel();
            }
            if (gameRef) {
                gameRef.off('value', onGameUpdate);
            }
        };
    }, [gameRef, myOnlineColor, commitNewGameState, handleGameOver, handleOnlineGameStart, currentUser, gameId]);

    // Rejoin Timer Logic
    useEffect(() => {
        if (gameMode !== 'online_playing' || !myOnlineColor || status !== 'playing') {
            return;
        }

        const isExemptFromDisconnect = ratingCategory === RatingCategory.Daily || ratingCategory === RatingCategory.Unlimited;
        if (isExemptFromDisconnect) {
            if (rejoinTimerRef.current) clearTimeout(rejoinTimerRef.current);
            if (countdownIntervalRef.current) clearInterval(countdownIntervalRef.current);
            setRejoinCountdown(null);
            return;
        }

        const opponentColor = myOnlineColor === Color.White ? Color.Black : Color.White;
        const opponentUid = playerColors[opponentColor];
        const opponent = opponentUid ? players[opponentUid] : null;

        if (rejoinTimerRef.current) {
            clearTimeout(rejoinTimerRef.current);
            rejoinTimerRef.current = null;
        }

        if (opponent && opponent.disconnectTimestamp) {
            const timeSinceDisconnect = (Date.now() - opponent.disconnectTimestamp) / 1000;
            const timeLeftToRejoin = 30 - timeSinceDisconnect;

            if (timeLeftToRejoin <= 0) {
                if (gameStateRef.current) {
                }
            } else {
                rejoinTimerRef.current = window.setTimeout(() => {
                     if (gameStateRef.current && statusRef.current === 'playing') {
                    }
                }, timeLeftToRejoin * 1000);
            }
        }

        return () => {
            if (rejoinTimerRef.current) {
                clearTimeout(rejoinTimerRef.current);
            }
        };
    }, [players, playerColors, myOnlineColor, gameMode, status, handleGameOver, ratingCategory]);

    // Rejoin Countdown UI Timer
    useEffect(() => {
        if (countdownIntervalRef.current) {
            clearInterval(countdownIntervalRef.current);
            countdownIntervalRef.current = null;
        }
        setRejoinCountdown(null);

        if (gameMode !== 'online_playing' || !myOnlineColor || status !== 'playing') {
            return;
        }

        const isExemptFromDisconnect = ratingCategory === RatingCategory.Daily || ratingCategory === RatingCategory.Unlimited;
        if (isExemptFromDisconnect) return;
        
        const opponentColor = myOnlineColor === Color.White ? Color.Black : Color.White;
        const opponentUid = playerColors[opponentColor];
        const opponent = opponentUid ? players[opponentUid] : null;

        if (opponent?.disconnectTimestamp) {
            const updateCountdown = () => {
                const timeSinceDisconnect = (Date.now() - opponent.disconnectTimestamp!) / 1000;
                const timeLeft = Math.ceil(30 - timeSinceDisconnect);
                if (timeLeft > 0) {
                    setRejoinCountdown(timeLeft);
                } else {
                    setRejoinCountdown(0);
                    if (countdownIntervalRef.current) clearInterval(countdownIntervalRef.current);
                }
            };
            updateCountdown();
            countdownIntervalRef.current = window.setInterval(updateCountdown, 1000);
        }

        return () => {
            if (countdownIntervalRef.current) {
                clearInterval(countdownIntervalRef.current);
            }
        };
    }, [players, playerColors, gameMode, myOnlineColor, status, ratingCategory]);

    const confirmOfferDraw = () => {
        if (status === 'playing' && !drawOffer) {
            const offeringPlayer = gameMode === 'online_playing' ? myOnlineColor! : turn;
            const newState: GameState = { ...currentGameState, drawOffer: offeringPlayer };
            commitNewGameState(newState, false, true); // skip confirmation for draw offers
        }
        setShowConfirmation(null);
    };

    const handleOfferDraw = () => {
        if (drawConfirmationEnabled) {
            setShowConfirmation('draw');
        } else {
            confirmOfferDraw();
        }
    };

    const handleAcceptDraw = () => {
        const acceptingPlayer = gameMode === 'online_playing' ? myOnlineColor : turn;
        if (drawOffer && drawOffer !== acceptingPlayer) {
            handleGameOver(currentGameState, 'draw_agreement', null);
        }
    };

    const handleDeclineDraw = () => {
        const decliningPlayer = gameMode === 'online_playing' ? myOnlineColor : turn;
        if (drawOffer && drawOffer !== decliningPlayer) {
            const newState: GameState = { ...currentGameState, drawOffer: null };
            commitNewGameState(newState, false, true);
        }
    };
    
    const confirmResign = () => {
        if (status === 'playing') {
            const resigningPlayer = gameMode === 'online_playing' ? myOnlineColor! : turn;
            const winnerColor = resigningPlayer.toLowerCase() === Color.White.toLowerCase() ? Color.Black : Color.White;
            handleGameOver(currentGameState, 'resignation', winnerColor.charAt(0).toUpperCase() + winnerColor.slice(1));
        }
        setShowConfirmation(null);
    };

    const handleResign = () => {
        if (resignConfirmationEnabled) {
             setShowConfirmation('resign');
        } else {
             confirmResign();
        }
    };
    
    const handlePlayAgain = () => {
        if (gameMode === 'online_playing') {
            handleBackToMenu();
        } else {
            //Maak de schone staat
            const newLocalState = resetGame('local', timerSettings); 
        
        //Pas de schone staat toe op alle component states (board, turn, status, etc.)
        loadGameState(newLocalState);
             setShowLocalSetup(true);
        }
    };

    const clearHighlightsAndArrows = () => {
        setHighlightedSquares([]);
        setArrows([]);
    }

    const handleSendChat = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!chatInput.trim() || !gameRef || !currentUser) return;

        const newMessage: ChatMessage = {
            sender: currentUser.displayName || 'Guest',
            text: chatInput.trim(),
            timestamp: Date.now(),
            uid: currentUser.uid
        };
        
        // Optimistic update not strictly needed as listener is fast, but good for UX
        // We rely on listener to update state mostly
        
        try {
            const newChat = [...chatMessages, newMessage];
            await gameRef.update({ chat: newChat });
            setChatInput("");
        } catch (error) {
            console.error("Error sending message:", error);
        }
    };


    const movePiece = useCallback((from: Position, to: Position, premoveOptions: { isPremove: boolean, forcePower: boolean } = { isPremove: false, forcePower: false }) => {
        clearHighlightsAndArrows();
        const currentState = gameStateRef.current;
        if (!currentState) return;
    
        const { board, capturedPieces, enPassantTarget, turn } = currentState;
    
        const newBoard = board.map(row => [...row]);
        const pieceToMove = { ...newBoard[from.row][from.col]! };
        const capturedPieceOnTarget = newBoard[to.row][to.col];
        let resetHalfmoveClock = pieceToMove.type === PieceType.Pawn;
    
        const newCapturedPieces: Record<Color, Piece[]> = {
            white: [...(capturedPieces.white || [])],
            black: [...(capturedPieces.black || [])],
        };
    
        const wasPowerMove = isPowerMove(board, from, to, enPassantTarget);
        const wasAmbiguousMove = isAmbiguousMove(board, from, to, enPassantTarget);
        const isEnPassantCapture = (pieceToMove.type === PieceType.Pawn || pieceToMove.power === PieceType.Pawn) && enPassantTarget && to.row === enPassantTarget.row && to.col === enPassantTarget.col && !capturedPieceOnTarget;
        
        const forcePowerFromPremove = premoveOptions.isPremove && premoveOptions.forcePower;
        const useForcePower = isForcePowerMode || forcePowerFromPremove;
        const isAmbiguousEnPassant = isEnPassantCapture && pieceToMove.power === PieceType.Pawn && [PieceType.Queen, PieceType.Bishop, PieceType.King].includes(pieceToMove.originalType);

        if (premoveOptions.isPremove) {
            // DIRECTLY set the premove without confirmation dialog, per latest request
            if (gameRef && myOnlineColor) {
                const premoveRef = gameRef.child('premoves').child(myOnlineColor);
               premoveRef.transaction(currentPremoveData => {
                if (gameRef.child(turn) === myOnlineColor) return;
                 return { 
    from, 
    to, 
    isForcePower: useForcePower 
  };
});
            }
            return;
        }

        if (isAmbiguousEnPassant && !useForcePower) {
             if (gameMode === 'online_playing') {
                 // Save state before visual interaction
                 preInteractionStateRef.current = currentState;

                 // For online, handle locally first but don't commit visual move
                 setLocalAmbiguousEnPassantState({ from, to });
                 return;
             }

            const newState: GameState = { ...currentState, status: 'ambiguous_en_passant', ambiguousEnPassantData: { from, to }, lastMove: { from, to } };
            commitNewGameState(newState);
            return;
        }

        let actualCapturedPiece: Piece | null = capturedPieceOnTarget;
        if (isEnPassantCapture) {
            actualCapturedPiece = newBoard[from.row][to.col] as Piece;
            newBoard[from.row][to.col] = null;
        }
    
        const wasCapture = !!actualCapturedPiece;
        let acquiredPower: PieceType | null = null;
    
        if (wasCapture && actualCapturedPiece) {
            resetHalfmoveClock = true;
            acquiredPower = actualCapturedPiece.originalType;
            const capturedColor = actualCapturedPiece.color;
            newCapturedPieces[capturedColor].push(actualCapturedPiece);
    
            if (actualCapturedPiece.isKing) {
                pieceToMove.power = acquiredPower;
                pieceToMove.hasMoved = true;
                newBoard[to.row][to.col] = pieceToMove;
                newBoard[from.row][from.col] = null;
                const finalState: GameState = { ...currentState, board: newBoard, capturedPieces: newCapturedPieces, lastMove: { from, to } };
                handleGameOver(finalState, 'kingCaptured', turn.charAt(0).toUpperCase() + turn.slice(1));
                return;
            }
        }
    
        const promotionRank = turn === Color.White ? 0 : 7;
        const isMovingToPromotionRank = to.row === promotionRank;
        const hasPawnAbility = pieceToMove.type === PieceType.Pawn || pieceToMove.power === PieceType.Pawn;
        const isCapturingPawnOnPromotionRank = wasCapture && actualCapturedPiece?.originalType === PieceType.Pawn && isMovingToPromotionRank;
    
        if ((isMovingToPromotionRank && hasPawnAbility) || isCapturingPawnOnPromotionRank) {
            let powerAfterPromotion: PieceType | null = null;
            if (isCapturingPawnOnPromotionRank) {
                powerAfterPromotion = null;
            } else if (wasCapture && actualCapturedPiece) {
                powerAfterPromotion = actualCapturedPiece.originalType === PieceType.Pawn ? null : actualCapturedPiece.originalType;
            } else {
                if (pieceToMove.originalType === PieceType.Pawn && !wasPowerMove) {
                    powerAfterPromotion = pieceToMove.power === PieceType.Pawn ? null : pieceToMove.power;
                } else {
                    powerAfterPromotion = null;
                }
            }
    
            const promotionInfo: PromotionData = {
                from,
                position: to,
                promotingPiece: pieceToMove,
                powerAfterPromotion: powerAfterPromotion
            };

            // For online games, don't commit state yet. Show promotion UI locally first.
            if (gameMode === 'online_playing') {
                // Save state before visual interaction
                preInteractionStateRef.current = currentState;
                setLocalPromotionState(promotionInfo);
                // Don't visually move yet to avoid bugs on cancel
                return; 
            }

            // For local games, proceed as before
            const newState: GameState = {
                ...currentState,
                board: newBoard,
                capturedPieces: newCapturedPieces,
                status: 'promotion',
                promotionData: promotionInfo,
                enPassantTarget: null,
                halfmoveClock: 0,
                lastMove: { from, to }
            };
            commitNewGameState(newState);
            return;
        }
    
        let powerAfterMove = pieceToMove.power;
        if(wasCapture) {
            powerAfterMove = acquiredPower;
        } else if (useForcePower && wasAmbiguousMove) {
            powerAfterMove = null;
        } else if (wasPowerMove) {
            powerAfterMove = null;
        }

        const wasForcedPowerMove = useForcePower && wasAmbiguousMove;

        pieceToMove.power = powerAfterMove;
        pieceToMove.hasMoved = true;
        newBoard[to.row][to.col] = pieceToMove;
        newBoard[from.row][from.col] = null;
    
        // Handle castling: move the rook. This is a special move type and should not
        // be triggered if the move was a power move or a forced power move.
        const isPotentialCastle = pieceToMove.type === PieceType.King &&
                                  Math.abs(to.col - from.col) === 2 &&
                                  from.row === to.row &&
                                  !wasCapture;


        if (isPotentialCastle && !wasPowerMove && !wasForcedPowerMove) {
            const rookCol = to.col === 6 ? 7 : 0;
            const newRookCol = to.col === 6 ? 5 : 3;
            // The rook is still on the board at its original position in the `newBoard` copy
            const rook = newBoard[from.row][rookCol];
            // Check if rook exists and has not moved (double-checking legality from getValidMoves)
            if (rook?.type === PieceType.Rook && !rook.hasMoved) {
                newBoard[from.row][newRookCol] = { ...rook, hasMoved: true };
                newBoard[from.row][rookCol] = null;
            }
        }
    
        let nextEnPassantTarget: Position | null = (pieceToMove.type === PieceType.Pawn && Math.abs(to.row - from.row) === 2) ? { row: from.row + (to.row - from.row) / 2, col: from.col } : null;
        
        let newPlayerTimes = currentState.playerTimes;
        if (currentState.playerTimes && currentState.turnStartTime && currentState.timerSettings && 'initialTime' in currentState.timerSettings) {
            var elapsedMs = premoveOptions.isPremove ? 0 : (Math.max(0, Date.now() - currentState.turnStartTime + serverOffset));
            if (gameMode === 'local') {
               elapsedMs = premoveOptions.isPremove ? 0 : (Math.max(0, Date.now() - currentState.turnStartTime));
            }
            const remainingTime = currentState.playerTimes[currentState.turn] - (elapsedMs / 1000);
            newPlayerTimes = {
                ...currentState.playerTimes,
                [currentState.turn]: remainingTime < 0 ? 0 : remainingTime
            };
        }
        const stateWithCurrentTime = { ...currentState, playerTimes: newPlayerTimes };

        finalizeTurn(stateWithCurrentTime, newBoard, nextEnPassantTarget, resetHalfmoveClock, newCapturedPieces, { from, to }, null, { isForcePower: wasForcedPowerMove });
    }, [commitNewGameState, finalizeTurn, handleGameOver, isForcePowerMode, gameMode, moveConfirmationEnabled]);

    // Premove execution logic
    useEffect(() => {
        const myPremove = myOnlineColor && premoves && premoves[myOnlineColor];

        if (myPremove && turn === myOnlineColor && status === 'playing') {
            if (gameRef && myOnlineColor) {
                gameRef.child('premoves').child(myOnlineColor).remove(() => {});
            }

            const piece = board[myPremove.from.row]?.[myPremove.from.col];
            if (piece && piece.color === myOnlineColor) {
                const moves = getValidMoves(board, myPremove.from, enPassantTarget, true);
                if (moves.some(m => m.row === myPremove.to.row && m.col === myPremove.to.col)) {
                    setTimeout(() => movePiece(myPremove.from, myPremove.to, { isPremove: false, forcePower: myPremove.isForcePower }), 100);
                }
            }
        }
    }, [turn, board, status, myOnlineColor, enPassantTarget, movePiece, premoves, gameRef]);

    useEffect(() => {
        const isMyTurn = gameMode !== 'online_playing' || turn === myOnlineColor;
        if (!selectedPiece || status !== 'playing' || localPromotionState || localAmbiguousEnPassantState) {
            setValidMoves([]);
            return;
        }
        
        const piece = board[selectedPiece.row][selectedPiece.col];
        const color = gameMode === 'online_playing' && myOnlineColor ? myOnlineColor : turn;

        if (!piece || piece.color !== color) {
            setSelectedPiece(null);
            setValidMoves([]);
            return;
        }
        
        const allMoves = getValidMoves(board, selectedPiece, enPassantTarget, true, !isMyTurn);
        setValidMoves(allMoves);
    }, [selectedPiece, board, turn, myOnlineColor, enPassantTarget, status, gameMode, localPromotionState, localAmbiguousEnPassantState]);

    const handleSquareClick = useCallback((row: number, col: number) => {
        const isMyTurn = gameMode !== 'online_playing' || turn === myOnlineColor;

        if (status !== 'playing' || localPromotionState || localAmbiguousEnPassantState) return;

        // Premove Logic
        if (!isMyTurn && premovesEnabled) {
            const targetSquare = { row, col };

            if (selectedPiece) {
                // If the selected piece is clicked again, deselect it and cancel the premove.
                if (selectedPiece.row === row && selectedPiece.col === col) {
                    setSelectedPiece(null);
                    if (gameRef && myOnlineColor && premoves?.[myOnlineColor]) {
                        gameRef.child('premoves').child(myOnlineColor).remove(() => {});
                    }
                    return;
                }
                
                // Check if the target is a valid premove target for the selected piece
                if (validMoves.some(move => move.row === targetSquare.row && move.col === targetSquare.col)) {
                     movePiece(selectedPiece, targetSquare, { isPremove: true, forcePower: isForcePowerMode });
                     setSelectedPiece(null);
                } else {
                    const pieceOnTarget = board[row][col];
                    // If another of my pieces is clicked, change selection.
                    if (pieceOnTarget && pieceOnTarget.color === myOnlineColor) {
                        setSelectedPiece(targetSquare);
                        if (gameRef && myOnlineColor && premoves?.[myOnlineColor]) {
                            gameRef.child('premoves').child(myOnlineColor).remove(() => {});
                        }
                    } else {
                        setSelectedPiece(null); // Deselect if an invalid square is clicked
                    }
                }
            } else {
                // If no piece is selected, select the piece at the target square if it's mine.
                const pieceOnTarget = board[row][col];
                if (pieceOnTarget && pieceOnTarget.color === myOnlineColor) {
                    setSelectedPiece(targetSquare);
                }
            }
            return;
        }
        
        // Normal move Logic
        if (isMyTurn) {
            const targetSquare = { row, col };
            if (selectedPiece) {
                if (selectedPiece.row === row && selectedPiece.col === col) {
                    setSelectedPiece(null);
                    return;
                }
                if (validMoves.some(move => move.row === targetSquare.row && move.col === targetSquare.col)) {
                    movePiece(selectedPiece, targetSquare);
                } else {
                    const pieceOnTarget = board[row][col];
                    if (pieceOnTarget && pieceOnTarget.color === turn) {
                        setSelectedPiece(targetSquare);
                    } else {
                        setSelectedPiece(null);
                    }
                }
            } else {
                const pieceOnTarget = board[row][col];
                if (pieceOnTarget && pieceOnTarget.color === turn) {
                    setSelectedPiece(targetSquare);
                }
            }
        }
    }, [gameMode, myOnlineColor, turn, status, premovesEnabled, selectedPiece, board, validMoves, movePiece, gameRef, isForcePowerMode, premoves, localPromotionState, localAmbiguousEnPassantState, moveConfirmationEnabled, timerSettings]);
    
    const confirmMove = () => {
        if (pendingCommitState) {
             updateGameInDb(pendingCommitState);
             // local history update if needed (though local mode doesn't use confirmation usually)
             setPendingCommitState(null);
             setPreCommitState(null);
        } else if (pendingPremove && gameRef && myOnlineColor) {
             gameRef.child('premoves').child(myOnlineColor).transaction(currentPremoveData => {
                if (gameRef.child(turn) === myOnlineColor) return;
                return pendingPremove;
             });
             setPendingPremove(null);
        }
        setShowConfirmation(null);
    };

    const onCancelRematch = () => {
         if (gameRef) gameRef.update({ rematchOffer: null });
    };

    const resolveAmbiguousEnPassant = useCallback((choice: 'move' | 'capture') => {
        // Use local state if online
        const data = gameMode === 'online_playing' ? localAmbiguousEnPassantState : gameStateRef.current?.ambiguousEnPassantData;
        const currentState = gameStateRef.current;

        if (!currentState || !data) return;

        const { from, to } = data;
        let newBoard = currentState.board.map(row => [...row]);
        
        // Fix for online ambiguous en passant where piece is already visually at 'to'
        const isOnlineAmbiguous = gameMode === 'online_playing' && localAmbiguousEnPassantState;
        const sourcePos = from; // piece is logically at 'from' in baseState
        
        // Piece should exist at sourcePos
        if (!newBoard[sourcePos.row][sourcePos.col]) return;

        const pieceToMove = { ...newBoard[sourcePos.row][sourcePos.col]! };
        let acquiredPower: PieceType | null = null;
        let newCapturedPieces = currentState.capturedPieces;

        if (choice === 'capture') {
            const capturedPiece = newBoard[from.row][to.col] as Piece;
            newBoard[from.row][to.col] = null;
            if (capturedPiece) {
                acquiredPower = capturedPiece.originalType;
                pieceToMove.power = acquiredPower;
                newCapturedPieces = {
                    ...currentState.capturedPieces,
                    [capturedPiece.color]: [...(currentState.capturedPieces[capturedPiece.color] || []), capturedPiece]
                };
            }
        } else {
            pieceToMove.power = PieceType.Pawn;
        }
        
        pieceToMove.hasMoved = true;
        newBoard[to.row][to.col] = pieceToMove;
        
        // Ensure 'from' is cleared
        newBoard[from.row][from.col] = null;
        
        if (gameMode === 'online_playing') {
             setLocalAmbiguousEnPassantState(null);
        }

        const promotionRank = currentState.turn === Color.White ? 0 : 7;
        if (to.row === promotionRank) {
            let powerAfterPromotion: PieceType | null = choice === 'capture' ? PieceType.Pawn : null;
            const newState: GameState = {
                ...currentState,
                board: newBoard,
                status: 'promotion',
                promotionData: { from, position: to, promotingPiece: newBoard[to.row][to.col]!, powerAfterPromotion },
                capturedPieces: newCapturedPieces,
                enPassantTarget: null,
                halfmoveClock: 0,
                ambiguousEnPassantData: null,
                lastMove: { from, to },
            };
            commitNewGameState(newState);
            return;
        }

        finalizeTurn(currentState, newBoard, null, true, newCapturedPieces, { from, to }, null);
    }, [commitNewGameState, finalizeTurn, gameMode, localAmbiguousEnPassantState]);

    const handlePromotion = useCallback((chosenPieceType: PieceType) => {
        // Use localPromotionState for online games
        const promotionInfo = gameMode === 'online_playing' ? localPromotionState : gameStateRef.current?.promotionData;
        const currentState = gameStateRef.current;
    
        if (!currentState || !promotionInfo) return;
    
        const { from, position, promotingPiece, powerAfterPromotion } = promotionInfo;
        const newBoard = currentState.board.map(r => [...r]);
        const newPiece: Piece = {
            type: chosenPieceType,
            originalType: promotingPiece.originalType,
            color: promotingPiece.color,
            isKing: promotingPiece.isKing,
            power: powerAfterPromotion,
            hasMoved: true,
        };
        newBoard[position.row][position.col] = newPiece;

        // Clear starting square (deferred from movePiece)
        newBoard[from.row][from.col] = null;

        if (gameMode === 'online_playing') {
            setLocalPromotionState(null);
        }
    
        finalizeTurn(currentState, newBoard, null, true, currentState.capturedPieces, { from, to: position }, chosenPieceType);
    }, [finalizeTurn, gameMode, localPromotionState]);

    const handleUndo = () => {
        if (gameMode !== 'local' || history.length <= 1) return;
        const newHistory = history.slice(0, -1);
        const lastState = newHistory[newHistory.length - 1];
        loadGameState(lastState);
        setPromotionData(null);
        setAmbiguousEnPassantData(null);
        setSelectedPiece(null);
        setValidMoves([]);
        setHistory(newHistory);
    };

    const handleLogout = async () => {
        if (!isFirebaseConfigured || !auth.currentUser) {
            handleBackToMenu();
            return;
        }
    
        const user = auth.currentUser;
        const uid = user.uid;

        // Check for outgoing challenges for Guests and notify them to cancel first
        if (user.isAnonymous) {
            try {
                const sentChallengesRef = db.ref(`sentChallenges/${uid}`);
                const sentSnapshot = await sentChallengesRef.once('value');
                if (sentSnapshot.exists()) {
                     setShowLogoutWarning(true);
                     return; // Block logout
                }
            } catch (e) {
                console.error("Error checking sent challenges", e);
            }
        }

        // CLEANUP: Cancel outgoing challenges and remove sentChallenges record
        const updates: { [path: string]: any } = {};
        
        try {
            const sentChallengesRef = db.ref(`sentChallenges/${uid}`);
            const sentSnapshot = await sentChallengesRef.once('value');
            const sentData = sentSnapshot.val();

            if (sentData) {
                const challenges: SentChallenge[] = Object.keys(sentData).map(key => ({ id: key, ...sentData[key] }));
                
                for (const c of challenges) {
                    // Cancel Real-time challenges always. Guest cancels all (though blocked above, keeping this for robustness)
                    if (user.isAnonymous || c.isRealtime) {
                        updates[`challenges/${c.targetUid}/${c.id}`] = null;
                        updates[`sentChallenges/${uid}/${c.id}`] = null;
                    }
                }
            }
            // Remove the sentChallenges node entirely if Guest
            if (user.isAnonymous) {
                updates[`sentChallenges/${uid}`] = null;
            }
        } catch (e) {
            console.error("Error cleaning up challenges on logout", e);
        }

        // CLEANUP: Cancel waiting open games (Waiting Lobby Games) if this is the last session
        try {
            if (!user.isAnonymous) {
                const sessionsRef = db.ref(`sessions/${uid}`);
                const sessionsSnap = await sessionsRef.once('value');
                // If numChildren <= 1, this is likely the last session (since current one is included or just about to be removed)
                if (sessionsSnap.numChildren() <= 1) {
                     const userGamesRef = db.ref(`userGames/${uid}`);
                     const userGamesSnap = await userGamesRef.once('value');
                     const gameIdsObject = userGamesSnap.val();
                     
                     if (gameIdsObject) {
                        const gameIds = Object.keys(gameIdsObject);
                        for (const gameId of gameIds) {
                            const gameRef = db.ref(`games/${gameId}`);
                            const gameSnap = await gameRef.once('value');
                            const gameData = gameSnap.val() as GameState;
                            
                            if (gameData && gameData.status === 'waiting') {
                                // Check if user is the creator (assuming creator is one of the players)
                                const isCreator = (gameData.playerColors.white === uid || gameData.playerColors.black === uid);
                                // Check if Real-time (not Daily)
                                const isRealtime = !gameData.timerSettings || ('initialTime' in gameData.timerSettings);
                                
                                if (isCreator && isRealtime) {
                                     updates[`games/${gameId}`] = null;
                                     updates[`userGames/${uid}/${gameId}`] = null;
                                }
                            }
                        }
                     }
                }
            }
        } catch (e) {
            console.error("Error cleaning up waiting games", e);
        }
    
        if (user.isAnonymous) {
            const userGamesRef = db.ref(`userGames/${uid}`);
            const userGamesSnap = await userGamesRef.once('value');
            const gameIdsObject = userGamesSnap.val();
    
            const gamePromises: Promise<void>[] = [];
    
            if (gameIdsObject) {
                for (const gameId of Object.keys(gameIdsObject)) {
                    const gameRef = db.ref(`games/${gameId}`);
                    gamePromises.push(gameRef.once('value').then(gameSnap => {
                        const gameData: GameState | null = gameSnap.val();
                        if (!gameData) return;
    
                        if (gameData.status === 'playing') {
                            const guestColor = gameData.playerColors.white === uid ? Color.White : Color.Black;
                            const opponentColor = guestColor === Color.White ? Color.Black : Color.White;
                            const winnerName = opponentColor.charAt(0).toUpperCase() + opponentColor.slice(1);
                            const opponentUid = gameData.playerColors[opponentColor];
                            
                            updates[`games/${gameId}/status`] = 'resignation';
                            updates[`games/${gameId}/winner`] = winnerName;
    
                            if (opponentUid && gameData.isRated && gameData.initialRatings) {
                                const whiteRating = gameData.initialRatings.white;
                                const blackRating = gameData.initialRatings.black;
                                const whiteScore = guestColor === Color.White ? 0 : 1;
                                
                                const newWhiteRating = calculateElo(whiteRating, blackRating, whiteScore);
                                const newBlackRating = calculateElo(blackRating, whiteRating, 1 - whiteScore);
                                
                                const ratingChange = {
                                    white: newWhiteRating - whiteRating,
                                    black: newBlackRating - blackRating
                                };
                                updates[`games/${gameId}/ratingChange`] = ratingChange;
    
                                const category = gameData.ratingCategory;
                                const opponentNewRating = opponentColor === Color.White ? newWhiteRating : newBlackRating;
                                updates[`userRatings/${opponentUid}/ratings/${category}`] = opponentNewRating;
                            }
                        } else if (gameData.status === 'waiting') {
                            updates[`games/${gameId}`] = null;
                        }
                    }));
                }
            }
    
            await Promise.all(gamePromises);
            
            // NOTE: We no longer delete the user node completely.
            // Instead, we mark them as having been a guest and offline.
            updates[`/users/${uid}/isGuest`] = true;
            updates[`/users/${uid}/guestLoggedOut`] = true; // Added flag as requested
            updates[`/users/${uid}/isOnline`] = false;
            
            // Clean up ratings and userGames index as they are no longer relevant for a logged out guest
            updates[`/userRatings/${uid}`] = null;
            updates[`/userGames/${uid}`] = null;
            updates[`/sessions/${uid}`] = null;
        } else {
             if (sessionRef.current) {
                await sessionRef.current.remove(() => {});
            }
        }
    
        if (Object.keys(updates).length > 0) {
            await db.ref().update(updates);
        }
    
        await auth.signOut();
        handleBackToMenu();
    };
    
    // Rematch handlers
    const handleOfferRematch = () => {
        if (gameMode === 'online_playing' && myOnlineColor && gameRef) {
            gameRef.update({ rematchOffer: myOnlineColor });
        }
    };

    const handleDeclineRematch = () => {
        if (gameRef) gameRef.update({ rematchOffer: null });
    };

    const handleAcceptRematch = async () => {
        const currentState = gameStateRef.current;
        if (!currentState || !gameRef || !currentUser || !myRatings) return;
    
        const oldWhiteUid = currentState.playerColors.white!;
        const oldBlackUid = currentState.playerColors.black!;
        const whitePlayerInfo = currentState.players[oldWhiteUid];
        const blackPlayerInfo = currentState.players[oldBlackUid];
    
        let whiteRatings = { ...whitePlayerInfo.ratings };
        let blackRatings = { ...blackPlayerInfo.ratings };
    
        if (currentState.isRated && currentState.ratingChange) {
            const category = currentState.ratingCategory;
            whiteRatings[category] += currentState.ratingChange.white;
            blackRatings[category] += currentState.ratingChange.black;
        }
    
        const newGameState = resetGame('online_playing', currentState.timerSettings, true, currentState.isRated);
    
        newGameState.playerColors = { white: oldBlackUid, black: oldWhiteUid };
    
        newGameState.players = {
            [oldWhiteUid]: { ...whitePlayerInfo, ratings: whiteRatings },
            [oldBlackUid]: { ...blackPlayerInfo, ratings: blackRatings },
        };
        
        const category = newGameState.ratingCategory;
        newGameState.initialRatings = { white: blackRatings[category], black: whiteRatings[category] };
        newGameState.status = 'playing';

        if (newGameState.timerSettings && 'initialTime' in newGameState.timerSettings) {
            newGameState.turnStartTime = window.firebase.database.ServerValue.TIMESTAMP as any;
        }

        try {
            const newGameRef = db.ref('games').push();
            await newGameRef.set(newGameState);
            db.ref(`userGames/${oldWhiteUid}/${newGameRef.key}`).set(true);
            db.ref(`userGames/${oldBlackUid}/${newGameRef.key}`).set(true);
            
            await gameRef.update({ nextGameId: newGameRef.key });
        } catch (error) {
            console.error("Failed to create rematch game:", error);
        }
    };
    
    useEffect(() => {
        if(status !== 'playing' && selectedPiece) {
             setSelectedPiece(null);
             setValidMoves([]);
             setIsForcePowerMode(false);
        }
    }, [status, selectedPiece]);

    // Right-click and drawing handlers
    const handleBoardMouseDown = (e: React.MouseEvent, row: number, col: number) => {
        if (e.button === 0) { // Left-click
            clearHighlightsAndArrows();
        } else if (e.button === 2) { // Right-click
            e.preventDefault();
            setRightClickStartSquare({ row, col });
        }
    };

    const handleBoardMouseUp = (e: React.MouseEvent, row: number, col: number) => {
        if (e.button === 2 && rightClickStartSquare) {
            e.preventDefault();
            const endSquare = { row, col };
            setRightClickStartSquare(null);

            if (rightClickStartSquare.row === endSquare.row && rightClickStartSquare.col === endSquare.col) {
                setHighlightedSquares(prev => {
                    const existingIndex = prev.findIndex(sq => sq.row === endSquare.row && sq.col === endSquare.col);
                    if (existingIndex > -1) {
                        return prev.filter((_, i) => i !== existingIndex);
                    }
                    return [...prev, endSquare];
                });
            } else {
                setArrows(prev => {
                    const existingIndex = prev.findIndex(ar => ar.from.row === rightClickStartSquare.row && ar.from.col === rightClickStartSquare.col && ar.to.row === endSquare.row && ar.to.col === endSquare.col);
                    if (existingIndex > -1) {
                        return prev.filter((_, i) => i !== existingIndex);
                    }
                    return [...prev, { from: rightClickStartSquare, to: endSquare }];
                });
            }
        }
    };

    const handleBoardContextMenu = (e: React.MouseEvent) => {
        e.preventDefault();
    };

    // Drag and Drop handlers
    const handleDragStart = (e: React.DragEvent, row: number, col: number) => {
        clearHighlightsAndArrows();
        const isMyTurn = gameMode !== 'online_playing' || turn === myOnlineColor;
        const piece = board[row][col];
        const color = gameMode === 'online_playing' && myOnlineColor ? myOnlineColor : turn;
        
        if (!piece || piece.color !== color || status !== 'playing' || localPromotionState || localAmbiguousEnPassantState) {
            e.preventDefault();
            return;
        }

        if (isMyTurn || premovesEnabled) {
            e.dataTransfer.setData('text/plain', JSON.stringify({ row, col }));
            e.dataTransfer.effectAllowed = 'move';
            
            setTimeout(() => {
                setSelectedPiece({ row, col });
                setDraggedPiece({ row, col });
            }, 0);
        } else {
            e.preventDefault();
        }
    };
    
    const handleDrop = (e: React.DragEvent, row: number, col: number) => {
        e.preventDefault();
        const fromDataString = e.dataTransfer.getData('text/plain');
    
        if (fromDataString) {
            try {
                const fromPos: Position = JSON.parse(fromDataString);
                handleSquareClick(row, col);
            } catch (error) {
                console.error("Failed to parse drag-and-drop data:", error);
            }
        }
    };

    const handleDragEnd = (e: React.DragEvent) => {
        e.preventDefault();
        setDraggedPiece(null);
        // Don't clear selected piece immediately to allow premove logic to see it
    };

    const isInteractionDisabled = status !== 'playing' || !!localPromotionState || !!localAmbiguousEnPassantState || (gameMode === 'online_playing' && turn !== myOnlineColor && !premovesEnabled) || gameMode === 'online_spectating';

    const handleReviewGame = (gameToReview: GameState) => {
        setGameMode('menu'); // Exit the active game/lobby view
        setReviewingGame(gameToReview);
    };

    const handleBackFromReview = () => {
        setReviewingGame(null);
        if (currentUser && isFirebaseConfigured) {
             setGameMode('online_lobby');
        } else {
             setGameMode('menu');
        }
    };

    const renderGame = () => {
        if (status === 'waiting' && gameMode === 'online_playing') {
            return (
                <div className="min-h-screen flex flex-col items-center justify-center p-4">
                    <div className="bg-gray-800 p-8 rounded-xl shadow-2xl w-full max-w-md flex flex-col items-center text-center">
                        <h2 className="text-3xl font-bold mb-4">Waiting for Opponent</h2>
                        <div className="flex items-center justify-center gap-2 mb-6">
                            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-white"></div>
                            <p className="text-xl text-yellow-300 font-semibold">Game is Open!</p>
                        </div>
                        <p className="text-gray-300 mb-8">
                            Your game is listed in the lobby. It will start when an opponent joins.
                        </p>
                        <button onClick={handleBackToMenu} className="w-full px-4 py-3 bg-red-600 hover:bg-red-700 rounded-lg text-lg font-semibold transition-colors">
                            Back to Lobby
                        </button>
                    </div>
                </div>
            );
        }

        
        const isFlipped = (gameMode === 'online_playing' ? myOnlineColor === Color.Black : turn === Color.Black) && (gameMode !== 'online_spectating');

        const whitePlayerUid = playerColors?.white;
        const blackPlayerUid = playerColors?.black;
        const whitePlayer = whitePlayerUid ? players[whitePlayerUid] : null;
        const blackPlayer = blackPlayerUid ? players[blackPlayerUid] : null;

        const whitePlayerIsDisconnected = !!whitePlayer?.disconnectTimestamp;
        const blackPlayerIsDisconnected = !!blackPlayer?.disconnectTimestamp;

        const topPlayerName = isFlipped ? (whitePlayer?.displayName || 'White') : (blackPlayer?.displayName || 'Black');
        const bottomPlayerName = isFlipped ? (blackPlayer?.displayName || 'Black') : (whitePlayer?.displayName || 'White');
        const topPlayerRating = isFlipped ? initialRatings?.white : initialRatings?.black;
        const bottomPlayerRating = isFlipped ? initialRatings?.black : initialRatings?.white;
        
        const myColor = gameMode === 'online_playing' ? myOnlineColor : turn;
        const myPlayerHasPowerPiece = board.flat().some(p => p && p.color === myColor && p.power);
        const showForcePowerButton = status === 'playing' && myPlayerHasPowerPiece;

        const isDailyGame = timerSettings && 'daysPerMove' in timerSettings;

        const topPlayerIsDisconnected = isFlipped ? whitePlayerIsDisconnected : blackPlayerIsDisconnected;
        const bottomPlayerIsDisconnected = isFlipped ? blackPlayerIsDisconnected : whitePlayerIsDisconnected;
        const topPlayerIsOpponent = (isFlipped ? Color.White : Color.Black) !== myOnlineColor;
        const bottomPlayerIsOpponent = (isFlipped ? Color.Black : Color.White) !== myOnlineColor;

        const effectiveStatus = localPromotionState ? 'promotion' : localAmbiguousEnPassantState ? 'ambiguous_en_passant' : status;

        const topPlayerCapturedPieces = capturedPieces[isFlipped ? Color.Black : Color.White];
        const bottomPlayerCapturedPieces = capturedPieces[isFlipped ? Color.White : Color.Black];
        const topPlayerTime = isFlipped ? displayedTime?.white : displayedTime?.black;
        const bottomPlayerTime = isFlipped ? displayedTime?.black : displayedTime?.white;
        const isTopPlayerTurn = turn === (isFlipped ? Color.White : Color.Black);
        const isBottomPlayerTurn = turn === (isFlipped ? Color.Black : Color.White);

        const PlayerInfoPanel = ({ name, rating, isDisconnected, isOpponent, countdown, time, isTurn, captured }) => (
            <div className="bg-gray-700 p-2 md:p-3 rounded-lg w-full">
                <h3 className="text-md md:text-lg font-bold truncate" title={name}>
                    {name} {gameMode === 'online_playing' && `(${rating ?? '...'})`}
                    {isDisconnected && (
                        <span className="text-yellow-300 ml-2 text-sm font-normal">
                            (Disconnected {isOpponent && countdown !== null && ` - ${countdown}s`})
                        </span>
                    )}
                </h3>
                <div className={`text-xl font-bold text-center p-1 md:p-2 rounded-md ${isTurn ? 'bg-gray-900 text-white' : 'bg-transparent'}`}>
                    <span className="font-mono tracking-wider">{isDailyGame ? formatDailyTime(moveDeadline) : formatTime(time)}</span>
                </div>
                {/* Captured pieces only shown on desktop */}
                <div className="hidden md:block">
                    <h3 className="text-md md:text-lg font-bold border-b border-t my-1 md:my-2 border-gray-600 py-1">Captured</h3>
                    <div className="flex flex-wrap gap-1 min-h-[32px] md:min-h-[40px]">{captured.map((p, i) => p && <div key={i} className="w-6 h-6 md:w-8 md:h-8"><PieceComponent piece={p}/></div>)}</div>
                </div>
            </div>
        );


        return (
            <div className="min-h-screen flex flex-col md:flex-row items-center justify-center p-2 md:p-4 gap-4 md:gap-8">
                <div className="w-full max-w-lg md:max-w-md lg:max-w-lg xl:max-w-2xl flex flex-col">
                    {/* Top Player Info (Mobile) */}
                    <div className="w-full mb-2 md:hidden">
                        <PlayerInfoPanel 
                            name={topPlayerName} rating={topPlayerRating} isDisconnected={topPlayerIsDisconnected}
                            isOpponent={topPlayerIsOpponent} countdown={rejoinCountdown} time={topPlayerTime}
                            isTurn={isTopPlayerTurn} captured={[]} 
                        />
                    </div>
                    <div className="w-full relative">
                        <GameOverlay 
                            status={effectiveStatus} winner={winner} onRestart={handlePlayAgain}
                            onPromote={handlePromotion} promotionData={localPromotionState || promotionData}
                            onResolveAmbiguousEnPassant={resolveAmbiguousEnPassant}
                            gameMode={gameMode}
                            isMyTurnForAction={gameMode === 'local' || turn === myOnlineColor}
                            ratingChange={ratingChange} initialRatings={initialRatings}
                            players={players} playerColors={playerColors} isRated={isRated}
                            rematchOffer={rematchOffer} myOnlineColor={myOnlineColor}
                            onOfferRematch={handleOfferRematch}
                            onAcceptRematch={handleAcceptRematch}
                            onDeclineRematch={handleDeclineRematch}
                            nextGameId={nextGameId}
                            onCancelRematch={onCancelRematch}
                        />
                        <Board 
                            board={board} selectedPiece={selectedPiece} validMoves={validMoves} 
                            onSquareClick={handleSquareClick} turn={turn} playerColor={myOnlineColor}
                            gameMode={gameMode} isInteractionDisabled={isInteractionDisabled}
                            onPieceDragStart={handleDragStart}
                            onPieceDragEnd={handleDragEnd}
                            onSquareDrop={handleDrop}
                            draggedPiece={draggedPiece}
                            premove={myOnlineColor ? premoves?.[myOnlineColor] : null}
                            lastMove={lastMove}
                            highlightedSquares={highlightedSquares}
                            arrows={arrows}
                            onBoardMouseDown={handleBoardMouseDown}
                            onBoardMouseUp={handleBoardMouseUp}
                            onBoardContextMenu={handleBoardContextMenu}
                        />
                    </div>
                     {/* Bottom Player Info (Mobile) */}
                    <div className="w-full mt-2 md:hidden">
                        <PlayerInfoPanel
                            name={bottomPlayerName} rating={bottomPlayerRating} isDisconnected={bottomPlayerIsDisconnected}
                            isOpponent={bottomPlayerIsOpponent} countdown={rejoinCountdown} time={bottomPlayerTime}
                            isTurn={isBottomPlayerTurn} captured={[]}
                        />
                    </div>

                    {/* Mobile Controls & Chat Tabs */}
                    <div className="w-full mt-4 md:hidden bg-gray-800 rounded-lg p-2">
                        <div className="flex mb-2 border-b border-gray-600">
                             <button onClick={() => setActiveTab('controls')} className={`flex-1 py-2 text-sm font-semibold ${activeTab === 'controls' ? 'text-green-400 border-b-2 border-green-400' : 'text-gray-400'}`}>Actions</button>
                             <button onClick={() => setActiveTab('chat')} className={`flex-1 py-2 text-sm font-semibold relative ${activeTab === 'chat' ? 'text-green-400 border-b-2 border-green-400' : 'text-gray-400'}`}>
                                Chat {unreadChatCount > 0 && <span className="absolute -top-1 -right-2 bg-red-500 text-white rounded-full w-5 h-5 flex items-center justify-center text-xs">{unreadChatCount}</span>}
                             </button>
                             <button onClick={() => setActiveTab('moves')} className={`flex-1 py-2 text-sm font-semibold ${activeTab === 'moves' ? 'text-green-400 border-b-2 border-green-400' : 'text-gray-400'}`}>Moves</button>
                        </div>

                        {activeTab === 'controls' && (
                            <div className="flex flex-col gap-3">
                                {status === 'playing' && (
                                    <div className="w-full space-y-3">
                                        {drawOffer && drawOffer !== myColor && (
                                            <div className="text-center bg-gray-800 p-2 rounded">
                                                <p className="mb-2 text-yellow-400 font-bold">{drawOffer.charAt(0).toUpperCase() + drawOffer.slice(1)} offers a draw</p>
                                                <div className="flex justify-center gap-2">
                                                    <button onClick={handleAcceptDraw} className="px-6 py-2 bg-green-600 hover:bg-green-700 rounded text-sm font-semibold transition-colors">Accept</button>
                                                    <button onClick={handleDeclineDraw} className="px-6 py-2 bg-gray-600 hover:bg-gray-700 rounded text-sm font-semibold transition-colors">Decline</button>
                                                </div>
                                            </div>
                                        )}
                                        {drawOffer && drawOffer === myColor && (
                                            <div className="text-center bg-gray-800 p-2 rounded">
                                                <p className="text-gray-400">Draw offer sent.</p>
                                            </div>
                                        )}
                                        <div className="grid grid-cols-2 gap-4">
                                            {!drawOffer && (
                                                <button onClick={handleOfferDraw} className="w-full px-4 py-3 bg-blue-600 hover:bg-blue-700 rounded-lg font-semibold transition-colors">Offer Draw</button>
                                            )}
                                            {/* Ensure resign button is visible even when draw is offered */}
                                            <button onClick={handleResign} className={`w-full px-4 py-3 bg-orange-600 hover:bg-orange-700 rounded-lg font-semibold transition-colors ${drawOffer ? 'col-span-2' : ''}`}>Resign</button>
                                        </div>
                                    </div>
                                )}
                                <div className="grid grid-cols-2 gap-4">
                                     <button 
                                        onClick={() => setShowPowerLegend(true)}
                                        className="w-full px-4 py-2 bg-gray-600 hover:bg-gray-700 rounded-lg font-semibold transition-colors"
                                    >
                                        Power Legend
                                    </button>
                                    {gameMode === 'local' && (<button onClick={handleUndo} disabled={history.length <= 1} className="w-full mt-4 px-4 py-2 bg-yellow-600 hover:bg-yellow-700 rounded-lg font-semibold transition-colors disabled:bg-gray-500 disabled:cursor-not-allowed">Undo Move</button>)}
                                     {showForcePowerButton && (
                                        <button 
                                            onClick={() => setIsForcePowerMode(!isForcePowerMode)}
                                            className={`w-full px-4 py-2 rounded-lg font-semibold transition-colors text-white ${isForcePowerMode ? 'bg-red-700 hover:bg-red-800' : 'bg-red-500 hover:bg-red-600'}`}
                                        >
                                            {isForcePowerMode ? 'Force Power Off' : 'Force Power On'}
                                        </button>
                                    )}
                                </div>
                                <button onClick={handleBackToMenu} className="w-full px-4 py-3 bg-red-600 hover:bg-red-700 rounded-lg font-semibold transition-colors">
                                    {gameMode === 'online_playing' ? 'Back to Lobby' : 'Back to Menu'}
                                </button>

                                {/* Captured Pieces on Mobile - Placed below Back to Menu */}
                                <div className="flex flex-col gap-2 my-2">
                                   <div className="bg-gray-700 p-2 rounded flex items-center justify-between">
                                       <span className="text-sm text-gray-300 font-bold">Captured by White:</span>
                                       <div className="flex flex-wrap gap-1">
                                           {capturedPieces.black.map((p, i) => <div key={i} className="w-6 h-6"><PieceComponent piece={p}/></div>)}
                                           {capturedPieces.black.length === 0 && <span className="text-gray-500 text-xs italic">None</span>}
                                       </div>
                                   </div>
                                   <div className="bg-gray-700 p-2 rounded flex items-center justify-between">
                                       <span className="text-sm text-gray-300 font-bold">Captured by Black:</span>
                                       <div className="flex flex-wrap gap-1">
                                           {capturedPieces.white.map((p, i) => <div key={i} className="w-6 h-6"><PieceComponent piece={p}/></div>)}
                                            {capturedPieces.white.length === 0 && <span className="text-gray-500 text-xs italic">None</span>}
                                       </div>
                                   </div>
                                </div>
                            </div>
                        )}

                        {activeTab === 'chat' && (
                             <div className="flex flex-col h-64">
                                <div ref={chatContainerRef} className="flex-grow overflow-y-auto mb-2 space-y-2 p-2 bg-gray-900 rounded">
                                    {chatMessages.length === 0 && <p className="text-gray-500 text-center text-sm italic mt-20">No messages yet.</p>}
                                    {chatMessages.map((msg, i) => {
                                        const isMe = currentUser && msg.uid === currentUser.uid;
                                        return (
                                            <div key={i} className={`text-sm ${isMe ? 'text-right' : ''}`}>
                                                <span className={`font-bold ${isMe ? 'text-blue-400' : 'text-green-400'}`}>{isMe ? '(You)' : msg.sender}: </span>
                                                <span className="text-gray-300 break-words">{msg.text}</span>
                                            </div>
                                        );
                                    })}
                                </div>
                                <form onSubmit={handleSendChat} className="flex gap-2 mt-auto">
                                    <input 
                                        type="text" 
                                        value={chatInput} 
                                        onChange={e => setChatInput(e.target.value)} 
                                        maxLength={100}
                                        placeholder="Type a message (max 100 chars)..."
                                        className="flex-grow p-2 bg-gray-700 rounded border border-gray-600 text-white text-sm"
                                    />
                                    <button type="submit" className="px-3 py-2 bg-blue-600 rounded hover:bg-blue-500 font-bold text-sm">Send</button>
                                </form>
                             </div>
                        )}
                        
                         {activeTab === 'moves' && (
                             <div className="h-64 overflow-y-auto p-2 bg-gray-900 rounded text-sm font-mono" ref={movesContainerRef}>
                                <table className="w-full text-left">
                                    <thead>
                                        <tr className="text-gray-500 border-b border-gray-700">
                                            <th className="pb-1">#</th>
                                            <th className="pb-1">White</th>
                                            <th className="pb-1">Black</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {(() => {
                                            const rows = [];
                                            for (let i = 0; i < moveHistory.length; i += 2) {
                                                rows.push(
                                                    <tr key={i} className="border-b border-gray-800 last:border-0">
                                                        <td className="py-1 text-gray-500 w-8">{Math.floor(i / 2) + 1}.</td>
                                                        <td className="py-1 text-gray-300">{moveHistory[i].notation}</td>
                                                        <td className="py-1 text-gray-300">{moveHistory[i + 1]?.notation || ''}</td>
                                                    </tr>
                                                );
                                            }
                                            return rows;
                                        })()}
                                    </tbody>
                                </table>
                             </div>
                        )}
                    </div>
                </div>

                {/* Side Panel (Desktop) */}
                <div className="w-full md:w-80 bg-gray-800 p-4 rounded-lg shadow-xl hidden md:flex flex-col h-[600px]">
                     <div className="flex mb-4 border-b border-gray-600">
                         <button type="button" onClick={() => setActiveTab('controls')} className={`flex-1 py-2 font-semibold ${activeTab === 'controls' ? 'text-green-400 border-b-2 border-green-400' : 'text-gray-400 hover:text-gray-200'}`}>Game</button>
                         <button type="button" onClick={() => setActiveTab('chat')} className={`flex-1 py-2 font-semibold relative ${activeTab === 'chat' ? 'text-green-400 border-b-2 border-green-400' : 'text-gray-400 hover:text-gray-200'}`}>
                            Chat {unreadChatCount > 0 && <span className="absolute top-1 right-2 bg-red-500 text-white rounded-full w-5 h-5 flex items-center justify-center text-xs">{unreadChatCount}</span>}
                         </button>
                         <button type="button" onClick={() => setActiveTab('moves')} className={`flex-1 py-2 font-semibold ${activeTab === 'moves' ? 'text-green-400 border-b-2 border-green-400' : 'text-gray-400 hover:text-gray-200'}`}>Moves</button>
                     </div>

                     {activeTab === 'controls' && (
                        <div className="flex-grow flex flex-col overflow-y-auto">
                             <h1 className="text-2xl font-bold text-center mb-1 text-green-400">Krachtschaak</h1>
                             <p className="text-center text-gray-400 mb-4 capitalize text-sm">
                                {formatTimerSettingText(timerSettings)} • {isRated ? `Rated (${ratingCategory})` : 'Unrated'}
                             </p>
                             <div className="mb-4">
                                <PlayerInfoPanel 
                                    name={topPlayerName} rating={topPlayerRating} isDisconnected={topPlayerIsDisconnected}
                                    isOpponent={topPlayerIsOpponent} countdown={rejoinCountdown} time={topPlayerTime}
                                    isTurn={isTopPlayerTurn} captured={topPlayerCapturedPieces}
                                />
                            </div>
                            <PlayerInfoPanel
                                name={bottomPlayerName} rating={bottomPlayerRating} isDisconnected={bottomPlayerIsDisconnected}
                                isOpponent={bottomPlayerIsOpponent} countdown={rejoinCountdown} time={bottomPlayerTime}
                                isTurn={isBottomPlayerTurn} captured={bottomPlayerCapturedPieces}
                            />
                            <div className="mt-auto pt-4">
                              <button 
                                  onClick={() => setShowPowerLegend(true)}
                                  className="w-full mb-2 px-4 py-2 bg-gray-600 hover:bg-gray-700 rounded-lg font-semibold transition-colors text-sm"
                              >
                                  Power Legend
                              </button>
                              {showForcePowerButton && (
                                <div className="my-2">
                                    <button 
                                        onClick={() => setIsForcePowerMode(!isForcePowerMode)}
                                        className={`w-full px-4 py-2 rounded-lg font-semibold transition-colors text-white text-sm ${isForcePowerMode ? 'bg-red-700 hover:bg-red-800' : 'bg-red-500 hover:bg-red-600'}`}
                                    >
                                        {isForcePowerMode ? 'Forcing Power Loss!' : 'Force Power Use'}
                                    </button>
                                    <p className="text-xs text-gray-400 mt-1 text-center">Ambiguous moves consume power.</p>
                                </div>
                              )}
                              {status === 'playing' && (
                                  <div className="mt-2 text-center">
                                      {drawOffer && drawOffer !== myColor ? (
                                          <div>
                                              <p className="mb-2 text-yellow-400 text-sm">{drawOffer.charAt(0).toUpperCase() + drawOffer.slice(1)} offers draw.</p>
                                              <div className="flex justify-center gap-2">
                                                  <button onClick={handleAcceptDraw} className="px-4 py-1 bg-green-600 hover:bg-green-700 rounded text-sm font-semibold transition-colors">Accept</button>
                                                  <button onClick={handleDeclineDraw} className="px-4 py-1 bg-gray-600 hover:bg-gray-700 rounded text-sm font-semibold transition-colors">Decline</button>
                                              </div>
                                          </div>
                                      ) : drawOffer && drawOffer === myColor ? (
                                          <p className="text-gray-400 text-sm">Draw offer sent.</p>
                                      ) : (
                                          <button onClick={handleOfferDraw} className="w-full px-4 py-2 bg-blue-600 hover:bg-blue-700 rounded-lg font-semibold transition-colors text-sm">Offer Draw</button>
                                      )}
                                  </div>
                              )}
                              {gameMode === 'local' && (<button onClick={handleUndo} disabled={history.length <= 1} className="w-full mt-4 px-4 py-2 bg-yellow-600 hover:bg-yellow-700 rounded-lg font-semibold transition-colors disabled:bg-gray-500 disabled:cursor-not-allowed text-sm">Undo Move</button>)}
                              {status === 'playing' && (<button onClick={handleResign} className="w-full mt-4 px-4 py-2 bg-orange-600 hover:bg-orange-700 rounded-lg font-semibold transition-colors text-sm">Resign</button>)}
                              <button onClick={handleBackToMenu} className="w-full mt-2 px-4 py-2 bg-red-600 hover:bg-red-700 rounded-lg font-semibold transition-colors text-sm">
                                  {gameMode === 'online_playing' ? 'Back to Lobby' : 'Back to Menu'}
                              </button>
                            </div>
                        </div>
                     )}

                     {activeTab === 'chat' && (
                        <div className="flex-grow flex flex-col h-full">
                            <div ref={chatContainerRef} className="flex-grow overflow-y-auto mb-2 space-y-2 p-2 bg-gray-900 rounded border border-gray-700">
                                {chatMessages.length === 0 && <p className="text-gray-500 text-center text-sm italic mt-20">No messages yet.</p>}
                                {chatMessages.map((msg, i) => {
                                    const isMe = currentUser && msg.uid === currentUser.uid;
                                    return (
                                        <div key={i} className={`text-sm ${isMe ? 'text-right' : ''}`}>
                                            <span className={`font-bold ${isMe ? 'text-blue-400' : 'text-green-400'}`}>{isMe ? '(You)' : msg.sender}: </span>
                                            <span className="text-gray-300 break-words">{msg.text}</span>
                                        </div>
                                    );
                                })}
                            </div>
                            <form onSubmit={handleSendChat} className="flex gap-2 mt-auto">
                                <input 
                                    type="text" 
                                    value={chatInput} 
                                    onChange={e => setChatInput(e.target.value)} 
                                    maxLength={100}
                                    placeholder="Type a message (max 100 chars)..."
                                    className="flex-grow p-2 bg-gray-700 rounded border border-gray-600 text-white text-sm focus:outline-none focus:border-green-500"
                                />
                                <button type="submit" className="px-3 py-2 bg-blue-600 rounded hover:bg-blue-500 font-bold text-sm">Send</button>
                            </form>
                        </div>
                     )}

                     {activeTab === 'moves' && (
                        <div className="flex-grow overflow-y-auto p-2 bg-gray-900 rounded text-sm font-mono border border-gray-700" ref={movesContainerRef}>
                            <table className="w-full text-left">
                                <thead>
                                    <tr className="text-gray-500 border-b border-gray-700 sticky top-0 bg-gray-900">
                                        <th className="pb-1 w-10">#</th>
                                        <th className="pb-1">White</th>
                                        <th className="pb-1">Black</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {(() => {
                                        const rows = [];
                                        for (let i = 0; i < moveHistory.length; i += 2) {
                                            rows.push(
                                                <tr key={i} className="border-b border-gray-800 last:border-0 hover:bg-gray-800">
                                                    <td className="py-1 text-gray-500">{Math.floor(i / 2) + 1}.</td>
                                                    <td className="py-1 text-gray-300">{moveHistory[i].notation}</td>
                                                    <td className="py-1 text-gray-300">{moveHistory[i + 1]?.notation || ''}</td>
                                                </tr>
                                            );
                                        }
                                        return rows;
                                    })()}
                                </tbody>
                            </table>
                        </div>
                     )}
                </div>
            </div>
        );
    }

    const renderContent = () => {
        if (reviewingGame) {
             return <GameReview game={reviewingGame} onBack={handleBackFromReview} />;
        }

        if (gameMode === 'menu') {
             return (
                <div className="min-h-screen flex flex-col items-center justify-center bg-gray-900 text-white p-4">
                    <h1 className="text-5xl md:text-7xl font-bold mb-8 text-transparent bg-clip-text bg-gradient-to-r from-green-400 to-blue-500">
                        Krachtschaak
                    </h1>
                     {menuMessage && (
                        <div className={`mb-6 p-4 rounded-lg ${menuMessage.type === 'error' ? 'bg-red-600' : 'bg-blue-600'} text-white font-semibold shadow-lg`}>
                            {menuMessage.text}
                        </div>
                    )}
                    <div className="space-y-4 w-full max-w-md">
                         <button 
                            onClick={() => setShowLocalSetup(true)}
                            className="w-full py-4 bg-gray-700 hover:bg-gray-600 rounded-xl text-xl font-bold transition-all transform hover:scale-105 shadow-lg flex items-center justify-center gap-3"
                        >
                            <span>♟️</span> Local Game
                        </button>
                         <button 
                            onClick={handleStartOnline}
                            className="w-full py-4 bg-gradient-to-r from-blue-600 to-purple-600 hover:from-blue-500 hover:to-purple-500 rounded-xl text-xl font-bold transition-all transform hover:scale-105 shadow-lg flex items-center justify-center gap-3"
                        >
                            <span>🌐</span> Online Play
                        </button>
                        {currentUser && (
                             <button
                                onClick={handleContinueOnlineGame}
                                className="w-full py-4 bg-green-600 hover:bg-green-500 rounded-xl text-xl font-bold transition-all transform hover:scale-105 shadow-lg flex items-center justify-center gap-3"
                            >
                                <span>▶️</span> Continue Game
                            </button>
                        )}
                        <button
                            onClick={() => setShowSettings(true)}
                            className="w-full py-4 bg-gray-800 hover:bg-gray-700 rounded-xl text-xl font-bold transition-all transform hover:scale-105 shadow-lg flex items-center justify-center gap-3"
                        >
                            <span>⚙️</span> Settings
                        </button>
                        {currentUser && (
                            <button 
                                onClick={handleLogout}
                                className="w-full py-3 mt-8 bg-red-900/50 hover:bg-red-800/50 text-red-300 rounded-lg font-semibold transition-colors border border-red-800"
                            >
                                Sign Out ({currentUser.displayName || 'Guest'})
                            </button>
                        )}
                    </div>
                    
                    <div className="mt-6">
                        <a 
                            href="https://gratis-5137332.jouwweb.site/de-officiele-krachtschaak-regels" 
                            target="_blank" 
                            rel="noopener noreferrer" 
                            className="text-blue-400 hover:text-blue-300 underline text-lg font-medium"
                        >
                            How to Play (Official Rules in Dutch)
                        </a>
                    </div>

                    {showLocalSetup && (
                        <div className="fixed inset-0 bg-black bg-opacity-80 flex items-center justify-center z-50 p-4">
                            <div className="bg-gray-800 p-8 rounded-xl shadow-2xl w-full max-w-sm relative">
                                <button 
                                    onClick={() => setShowLocalSetup(false)}
                                    className="absolute top-2 right-3 text-2xl text-gray-400 hover:text-white"
                                >
                                    &times;
                                </button>
                                <h2 className="text-3xl font-bold mb-6 text-center text-white">Local Game Setup</h2>
                                <div className="space-y-3">
                                    <button onClick={() => resetGame('local', null)} className="w-full py-3 bg-green-600 hover:bg-green-700 rounded-lg text-lg font-semibold transition-colors">Unlimited Time</button>
                                    <div className="border-t border-gray-700 my-4"></div>
                                    
                                    <div className="flex gap-2 items-end mb-2">
                                        <div>
                                            <label className="block mb-1 text-xs text-gray-400">Base (min)</label>
                                            <input type="number" value={localCustomBase} onChange={e => setLocalCustomBase(e.target.value)} className="w-full p-2 bg-gray-700 rounded text-center" min="1" />
                                        </div>
                                        <div>
                                            <label className="block mb-1 text-xs text-gray-400">Inc (sec)</label>
                                            <input type="number" value={localCustomInc} onChange={e => setLocalCustomInc(e.target.value)} className="w-full p-2 bg-gray-700 rounded text-center" min="0" />
                                        </div>
                                    </div>
                                    <button 
                                        onClick={() => {
                                            const base = parseFloat(localCustomBase) || 10;
                                            const inc = parseInt(localCustomInc) || 0;
                                            resetGame('local', { initialTime: base * 60, increment: inc });
                                        }} 
                                        className="w-full py-3 bg-blue-600 hover:bg-blue-700 rounded-lg text-lg font-semibold transition-colors"
                                    >
                                        Start Custom
                                    </button>
                                </div>
                            </div>
                        </div>
                    )}
                    
                     {showSettings && (
                        <SettingsModal 
                            onClose={() => setShowSettings(false)}
                            premovesEnabled={premovesEnabled}
                            setPremovesEnabled={setPremovesEnabled}
                            moveConfirmationEnabled={moveConfirmationEnabled}
                            setMoveConfirmationEnabled={setMoveConfirmationEnabled}
                            drawConfirmationEnabled={drawConfirmationEnabled}
                            setDrawConfirmationEnabled={setDrawConfirmationEnabled}
                            resignConfirmationEnabled={resignConfirmationEnabled}
                            setResignConfirmationEnabled={setResignConfirmationEnabled}
                        />
                    )}
                </div>
            );
        }

        if (gameMode === 'online_lobby') {
            return (
                <OnlineLobby 
                    onSpectate={handleOnlineSpectate}
                    userUid={currentUser?.uid} 
                    onGameStart={handleOnlineGameStart} 
                    onBack={() => setGameMode('menu')}
                    getInitialGameState={resetGame}
                    creatorColor={nextGameColor}
                    onGameCreated={randomizeNextGameColor}
                    myRatings={myRatings}
                    onReview={handleReviewGame}
                    premovesEnabled={premovesEnabled}
                    setPremovesEnabled={setPremovesEnabled}
                    moveConfirmationEnabled={moveConfirmationEnabled}
                    setMoveConfirmationEnabled={setMoveConfirmationEnabled}
                    drawConfirmationEnabled={drawConfirmationEnabled}
                    setDrawConfirmationEnabled={setDrawConfirmationEnabled}
                    resignConfirmationEnabled={resignConfirmationEnabled}
                    setResignConfirmationEnabled={setResignConfirmationEnabled}
                    currentLobbyTab={lobbyView}
                    setCurrentLobbyTab={setLobbyView}
                />
            );
        }

        return renderGame();
    };

    const moveNotation = pendingCommitState?.moveHistory?.[pendingCommitState.moveHistory.length - 1]?.notation || (pendingPremove ? getNotation(board, pendingPremove.from, pendingPremove.to, board[pendingPremove.from.row][pendingPremove.from.col]!, null, null, pendingPremove.isForcePower) : '');

    return (
        <>
            {showAuthModal && gameMode === 'menu' && <div className="fixed inset-0 bg-black bg-opacity-50 z-40"></div>}
            {renderContent()}
            {showPowerLegend && <PowerLegend onClose={() => setShowPowerLegend(false)} />}
            {showAuthModal && gameMode === 'menu' && <Auth onClose={() => setShowAuthModal(false)} onAuthSuccess={onAuthSuccessCallback} />}
            {showConfirmation && (
                <ConfirmationModal
                    title={
                        showConfirmation === 'draw' ? 'Offer Draw?' : 
                        showConfirmation === 'move' ? 'Confirm Move' : 
                        showConfirmation === 'premove' ? 'Confirm Premove' :
                        'Resign Game?'
                    }
                    message={
                        showConfirmation === 'draw' ? "Are you sure you want to offer a draw to your opponent?" : 
                        showConfirmation === 'move' ? `Are you sure you want to submit this move${moveNotation ? ': ' + moveNotation : ''}? (Correspondence Game)` :
                        showConfirmation === 'premove' ? `Are you sure you want to premove${moveNotation ? ': ' + moveNotation : ''}?` :
                        "Are you sure you want to resign? This action cannot be undone."
                    }
                    onConfirm={showConfirmation === 'draw' ? confirmOfferDraw : (showConfirmation === 'move' || showConfirmation === 'premove') ? confirmMove : confirmResign}
                    onCancel={() => { 
                         if (showConfirmation === 'move' && preCommitState) {
                             loadGameState(preCommitState);
                             setPendingCommitState(null);
                             setPreCommitState(null);
                         }
                         if (showConfirmation === 'premove') {
                             setPendingPremove(null);
                         }
                         setShowConfirmation(null); 
                         setPendingMove(null); 
                    }}
                    confirmText={showConfirmation === 'draw' ? 'Offer Draw' : (showConfirmation === 'move' || showConfirmation === 'premove') ? 'Submit' : 'Resign'}
                    cancelText="Cancel"
                />
            )}
             {showLogoutWarning && (
                <ConfirmationModal
                    title="Cannot Logout"
                    message="You have active sent challenges. Please cancel them in the 'Challenges' tab before exiting as a Guest."
                    onConfirm={() => setShowLogoutWarning(false)}
                    onCancel={() => setShowLogoutWarning(false)}
                    confirmText="OK"
                    cancelText="Close"
                />
            )}
        </>
    );
};

export default App;
