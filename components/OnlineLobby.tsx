
import React, { useState, useEffect, useMemo, useRef } from 'react';
import { auth, db } from '../firebaseConfig';
import { Color, GameState, LobbyGame, TimerSettings, PlayerInfo, UserInfo, ActiveGameSummary, GameStatus, IncomingChallenge, SentChallenge } from '../types';
import { getRatingCategory, RatingCategory, RATING_CATEGORIES } from '../utils/ratings';
import SettingsModal from './SettingsModal';

type LobbyTab = 'games' | 'players' | 'current_games' | 'finished_games' | 'challenges' | 'live';

interface OnlineLobbyProps {

    userUid: string;
    onGameStart: (gameId: string, playerColor: Color) => void;
    onBack: () => void;
    getInitialGameState: (mode: 'online_playing', settings: TimerSettings, dontLoad: boolean, isRated: boolean) => GameState;
    creatorColor: Color;
    onGameCreated: () => void;
    myRatings: Record<RatingCategory, number> | null;
    onReview: (game: GameState) => void;
    // Settings Props
    premovesEnabled: boolean;
    setPremovesEnabled: (enabled: boolean) => void;
    moveConfirmationEnabled: boolean;
    setMoveConfirmationEnabled: (enabled: boolean) => void;
    showPowerPieces: boolean;
    setShowPowerPieces: (enabled: boolean) => void;
    showPowerRings: boolean;
    setShowPowerRings: (enabled: boolean) => void;
    showOriginalType: boolean;
    setShowOriginalType: (enabled: boolean) => void;
    soundsEnabled: boolean;
    setSoundsEnabled: (enabled: boolean) => void;
    // State props
    currentLobbyTab: LobbyTab;
    setCurrentLobbyTab: (tab: LobbyTab) => void;
    onSpectate: (gameId: string) => void;
    onAnalyse: (game: GameState) => void;
    allMyGames: Record<string, GameState>;
    incomingChallenges: IncomingChallenge[];
    sentChallenges: SentChallenge[];
}

const formatTime = (totalSeconds: number | null): string => {
    if (totalSeconds === null) return '∞';
    if (totalSeconds < 0) totalSeconds = 0;
    const minutes = Math.floor(totalSeconds / 60);
    const seconds = Math.floor(totalSeconds % 60);
    return `${minutes}:${seconds < 10 ? '0' : ''}${seconds}`;
};


const formatDailyTime = (deadline: number | null): string => {
    if (deadline === null) return '∞';
    const remaining = deadline - Date.now();
    if (remaining <= 0) return '0s';

    const minutes = Math.floor((remaining / (1000 * 60)) % 60);
    const hours = Math.floor((remaining / (1000 * 60 * 60)) % 24);
    const days = Math.floor(remaining / (1000 * 60 * 60 * 24));

    if (days > 0) return `${days}d ${hours}h`;
    if (hours > 0) return `${hours}h ${minutes}m`;
    return `${minutes}m`;
};

const renderTimerSetting = (settings: TimerSettings) => {
    if (!settings) return 'Unlimited';
    if ('daysPerMove' in settings) return `${settings.daysPerMove}d / move`;
    return `${settings.initialTime / 60}m | ${settings.increment}s`;
};

const PlayerRatingsModal: React.FC<{
    user: UserInfo,
    onClose: () => void
}> = ({ user, onClose }) => {
    return (
        <div className="fixed inset-0 bg-black bg-opacity-75 flex items-center justify-center z-50">
            <div className="bg-gray-800 p-8 rounded-xl shadow-2xl w-full max-w-md relative">
                <button onClick={onClose} className="absolute top-2 right-3 text-2xl text-gray-400 hover:text-white">&times;</button>
                <h3 className="text-2xl font-bold mb-6 text-center text-green-400">{user.displayName}'s Ratings</h3>
                <div className="grid grid-cols-2 gap-x-8 gap-y-3 text-lg">
                    {RATING_CATEGORIES.map(category => (
                        <div key={category} className="flex justify-between border-b border-gray-700 pb-1">
                            <span className="capitalize text-gray-300">{category}</span>
                            <span className="font-bold text-white">{user.ratings[category] ?? 1200}</span>
                        </div>
                    ))}
                </div>
            </div>
        </div>
    );
};

// Config Modal for Challenges
const ChallengeConfigModal: React.FC<{
    opponent: UserInfo;
    onCancel: () => void;
    onSend: (settings: TimerSettings, isRated: boolean, challengeColor: string) => void;
}> = ({ opponent, onCancel, onSend }) => {
    const [isRated, setIsRated] = useState(true);
    const [type, setType] = useState<'realtime' | 'correspondence'>('realtime');
    const [corrType, setCorrType] = useState<'daily' | 'unlimited'>('daily');
    const [baseMin, setBaseMin] = useState('10');
    const [inc, setInc] = useState('5');
    const [days, setDays] = useState('2');
    const [challengeColor, setchallengeColor] = useState('random');

    const handleSubmit = () => {
        let settings: TimerSettings = null;
        if (type === 'realtime') {
            settings = { initialTime: parseFloat(baseMin) * 60, increment: parseInt(inc) };
        } else if (corrType === 'daily') {
            settings = { daysPerMove: parseInt(days) };
        }
        onSend(settings, isRated, challengeColor);
    };

    return (
        <div className="fixed inset-0 bg-black bg-opacity-80 flex items-center justify-center z-50">
            <div className="bg-gray-800 p-6 rounded-xl shadow-2xl w-full max-w-sm border border-gray-700">
                <h3 className="text-xl font-bold mb-4 text-center">Challenge {opponent.displayName}</h3>

                <div className="mb-4 flex items-center justify-center">
                    <input type="checkbox" id="modal-rated" checked={isRated} onChange={e => setIsRated(e.target.checked)} className="w-4 h-4 text-purple-600 bg-gray-700 rounded focus:ring-purple-600" />
                    <label htmlFor="modal-rated" className="ml-2 text-gray-300 font-medium">Rated Game</label>
                </div>

                <div className="flex bg-gray-700 rounded-lg p-1 mb-4">
                    <button onClick={() => setType('realtime')} className={`flex-1 py-1 text-sm rounded ${type === 'realtime' ? 'bg-blue-600 text-white' : 'text-gray-400'}`}>Real-Time</button>
                    <button onClick={() => setType('correspondence')} className={`flex-1 py-1 text-sm rounded ${type === 'correspondence' ? 'bg-blue-600 text-white' : 'text-gray-400'}`}>Correspondence</button>
                </div>
                <div className="flex bg-gray-700 rounded-lg p-1 mb-4">
                    <button onClick={() => setchallengeColor('white')} className={`flex-1 py-1 text-sm rounded ${challengeColor === 'white' ? 'bg-blue-600 text-white' : 'text-gray-400'}`}>Play as white</button>
                    <button onClick={() => setchallengeColor('random')} className={`flex-1 py-1 text-sm rounded ${challengeColor === 'random' ? 'bg-blue-600 text-white' : 'text-gray-400'}`}>Play as random color</button>
                    <button onClick={() => setchallengeColor('black')} className={`flex-1 py-1 text-sm rounded ${challengeColor === 'black' ? 'bg-blue-600 text-white' : 'text-gray-400'}`}>Play as black</button>
                </div>

                {type === 'realtime' ? (
                    <div className="flex gap-2 mb-6">
                        <div className="flex-1">
                            <label className="text-xs text-gray-400 block mb-1">Minutes</label>
                            <input type="number" value={baseMin} onChange={e => setBaseMin(e.target.value)} className="w-full p-2 bg-gray-900 border border-gray-600 rounded text-center" />
                        </div>
                        <div className="flex-1">
                            <label className="text-xs text-gray-400 block mb-1">Increment (s)</label>
                            <input type="number" value={inc} onChange={e => setInc(e.target.value)} className="w-full p-2 bg-gray-900 border border-gray-600 rounded text-center" />
                        </div>
                    </div>
                ) : (
                    <div className="mb-6 space-y-3">
                        <div className="flex gap-4 justify-center text-sm">
                            <label className="flex items-center"><input type="radio" checked={corrType === 'daily'} onChange={() => setCorrType('daily')} className="mr-1" /> Daily</label>
                            <label className="flex items-center"><input type="radio" checked={corrType === 'unlimited'} onChange={() => setCorrType('unlimited')} className="mr-1" /> Unlimited</label>
                        </div>
                        {corrType === 'daily' && (
                            <div>
                                <label className="text-xs text-gray-400 block mb-1 text-center">Days per move</label>
                                <input type="number" value={days} onChange={e => setDays(e.target.value)} className="w-full p-2 bg-gray-900 border border-gray-600 rounded text-center" />
                            </div>
                        )}
                    </div>
                )}

                <div className="flex gap-3">
                    <button onClick={onCancel} className="flex-1 py-2 bg-gray-600 hover:bg-gray-500 rounded text-white font-semibold">Cancel</button>
                    <button onClick={handleSubmit} className="flex-1 py-2 bg-green-600 hover:bg-green-500 rounded text-white font-semibold">Send</button>
                </div>
            </div>
        </div>
    );
}

const OnlineLobby: React.FC<OnlineLobbyProps> = ({
    userUid, onGameStart, onBack, getInitialGameState, creatorColor, onGameCreated, myRatings, onReview,
    premovesEnabled, setPremovesEnabled, moveConfirmationEnabled, setMoveConfirmationEnabled,
    drawConfirmationEnabled, setDrawConfirmationEnabled, resignConfirmationEnabled, setResignConfirmationEnabled,
    showPowerPieces, setShowPowerPieces, showPowerRings, setShowPowerRings, showOriginalType, setShowOriginalType, soundsEnabled, setSoundsEnabled,
    currentLobbyTab, setCurrentLobbyTab, onSpectate, onAnalyse,
    allMyGames, incomingChallenges, sentChallenges
}) => {
    const [openGames, setOpenGames] = useState<LobbyGame[]>([]);
    const [myCurrentGames, setMyCurrentGames] = useState<ActiveGameSummary[]>([]);
    const [myFinishedGames, setMyFinishedGames] = useState<{ id: string, data: GameState }[]>([]);
    const [error, setError] = useState<string | null>(null);
    const [tick, setTick] = useState(0); // Force update for timers
    const [showSettings, setShowSettings] = useState(false);
    const [liveGames, setLiveGames] = useState<LobbyGame[]>([]);

    // Challenge Logic
    const [challengeTarget, setChallengeTarget] = useState<UserInfo | null>(null); // Who we are trying to challenge

    const [isLobbyLoading, setIsLobbyLoading] = useState(true);
    const [isCreatingGame, setIsCreatingGame] = useState(false);
    const [isJoiningGame, setIsJoiningGame] = useState<string | null>(null);

    // Quick Create Config
    const [isRated, setIsRated] = useState(true);
    const [timeControlType, setTimeControlType] = useState<'realtime' | 'correspondence'>('realtime');
    const [correspondenceType, setCorrespondenceType] = useState<'daily' | 'unlimited'>('daily');
    const [baseMinutes, setBaseMinutes] = useState('10');
    const [increment, setIncrement] = useState('5');
    const [daysPerMove, setDaysPerMove] = useState('2');

    // Player list state
    const [allUsers, setAllUsers] = useState<UserInfo[]>([]);
    const [searchText, setSearchText] = useState("");
    const [viewingPlayerRatings, setViewingPlayerRatings] = useState<UserInfo | null>(null);

    const createdGameListenerRef = useRef<{ gameId: string; ref: any; } | null>(null);
    const gameListenersRef = useRef<Record<string, any>>({});

    const previousGameStatuses = useRef<Record<string, GameStatus>>({});
    const mountTime = useRef(Date.now());
    const [filters, setFilters] = useState<Record<string, boolean>>({
        hyperbullet: true,
        bullet: true,
        blitz: true,
        rapid: true,
        classical: true,
        daily: true,
        unlimited: true
    });
    const toggleFilter = (category: string) => {
        setFilters(prev => ({ ...prev, [category]: !prev[category] }));
    };

    //spectate effect

    useEffect(() => {
        if (currentLobbyTab !== 'games' && currentLobbyTab !== 'live') return;

        const gamesRef = db.ref('games');
        setIsLobbyLoading(true);

        const onLobbyUpdate = (snapshot: any) => {
            const gamesData = snapshot.val();

            if (currentLobbyTab === 'games') {
                const gamesList: LobbyGame[] = [];
                if (gamesData) {
                    Object.keys(gamesData).forEach(gameId => {
                        const game = gamesData[gameId];
                        if (game && game.status === 'waiting' &&
                            typeof game.players === 'object' && game.players !== null &&
                            typeof game.playerColors === 'object' && game.playerColors !== null &&
                            !game.challengedPlayerInfo) {

                            const isWhiteTaken = !!game.playerColors.white;
                            const isBlackTaken = !!game.playerColors.black;

                            if ((isWhiteTaken && !isBlackTaken) || (!isWhiteTaken && isBlackTaken)) {
                                const creatorUid = game.playerColors.white || game.playerColors.black;
                                if (creatorUid) {
                                    const creator = game.players[creatorUid];
                                    if (creator) {
                                        gamesList.push({
                                            gameId,
                                            creatorName: creator.displayName || 'Unknown',
                                            creatorUid: creator.uid || '',
                                            creatorRatings: creator.ratings || {},
                                            timerSettings: game.timerSettings,
                                            ratingCategory: game.ratingCategory,
                                            isRated: typeof game.isRated === 'boolean' ? game.isRated : true,
                                        });
                                    }
                                }
                            }
                        }
                    });
                }
                setOpenGames(gamesList.sort((a, b) => (b.creatorRatings[b.ratingCategory] ?? 1200) - (a.creatorRatings[a.ratingCategory] ?? 1200)));
            }

            if (currentLobbyTab === 'live') {
                const liveList: LobbyGame[] = [];
                if (gamesData) {
                    Object.keys(gamesData).forEach(gameId => {
                        const game = gamesData[gameId];
                        if (!game || !game.players) return;

                        if (game.status === 'playing') {
                            const whiteUid = game.playerColors?.white;
                            const blackUid = game.playerColors?.black;
                            const whiteName = whiteUid ? game.players[whiteUid]?.displayName : 'Unknown';
                            const blackName = blackUid ? game.players[blackUid]?.displayName : 'Unknown';
                            const whiteRating = whiteUid ? game.players[whiteUid]?.ratings?.[game.ratingCategory] : '?';
                            const blackRating = blackUid ? game.players[blackUid]?.ratings?.[game.ratingCategory] : '?';

                            liveList.push({
                                gameId,
                                creatorName: `${whiteName} (${whiteRating}) vs ${blackName} (${blackRating})`,
                                creatorUid: whiteUid || '',
                                creatorRatings: {} as any,
                                timerSettings: game.timerSettings,
                                ratingCategory: game.ratingCategory,
                                isRated: game.isRated
                            });
                        }
                    });
                }
                setLiveGames(liveList);
            }
            setIsLobbyLoading(false);
        };

        gamesRef.on('value', onLobbyUpdate);
        return () => { gamesRef.off('value', onLobbyUpdate); };
    }, [currentLobbyTab]);

    // Timer tick to update live timers in lobby list
    useEffect(() => {
        const interval = setInterval(() => setTick(t => t + 1), 1000);
        return () => clearInterval(interval);
    }, []);

    const getDisplayTime = (game: ActiveGameSummary) => {
        if (!game.timerSettings) return '∞';
        if ('daysPerMove' in game.timerSettings) {
            return formatDailyTime(game.moveDeadline);
        } else {
            const baseTime = game.playerTimes ? game.playerTimes[game.myColor] : 0;
            if (game.status === 'playing' && game.isMyTurn && game.turnStartTime) {
                // Calculate live elapsed time
                const elapsed = (Date.now() - game.turnStartTime) / 1000;
                const remaining = Math.max(0, baseTime - elapsed);
                return formatTime(remaining);
            }
            return formatTime(baseTime);
        }
    }

    // Check for game start - Enhanced "Warp" Logic
    useEffect(() => {
        myCurrentGames.forEach(game => {
            const prevStatus = previousGameStatuses.current[game.gameId];

            // WARP CASE 1: Game transition from 'waiting' to 'playing' (Someone joined my open game)
            if (game.status === 'playing' && prevStatus === 'waiting') {
                if (game.opponent) {
                    onGameStart(game.gameId, game.myColor);
                }
            }
            // WARP CASE 2: New game appearing directly in 'playing' state (Challenge accepted)
            // Only warp if the game started AFTER this lobby component mounted to avoid warping on page refresh/reload
            else if (!prevStatus && game.status === 'playing') {
                const gameStartTime = game.turnStartTime || 0;
                // If the game started after we entered the lobby, it's a new event (like a challenge accept)
                if (gameStartTime > mountTime.current) {
                    onGameStart(game.gameId, game.myColor);
                }
            }

            previousGameStatuses.current[game.gameId] = game.status;
        });
    }, [myCurrentGames, onGameStart]);


    // Process Games List for UI
    useEffect(() => {
        if (!userUid) return;

        const currentGames: ActiveGameSummary[] = [];
        const finishedGames: { id: string; data: GameState }[] = [];
        const finishedStatuses: GameStatus[] = ['checkmate', 'kingCaptured', 'stalemate', 'draw_threefold', 'draw_fiftyMove', 'draw_agreement', 'timeout', 'opponent_disconnected', 'resignation'];

        Object.entries(allMyGames).forEach(([gameId, gameData]) => {
            const data = gameData as GameState;
            const myColor = data.playerColors.white === userUid ? Color.White : Color.Black;

            if (finishedStatuses.includes(data.status)) {
                finishedGames.push({ id: gameId, data: data });
            } else if (data.status === 'waiting') {
                const opponent = data.challengedPlayerInfo ? { ...data.challengedPlayerInfo, ratings: {} as any } : null;
                currentGames.push({
                    gameId, myColor, opponent, isMyTurn: false, status: data.status, timerSettings: data.timerSettings,
                    ratingCategory: data.ratingCategory, isRated: typeof data.isRated === 'boolean' ? data.isRated : true,
                    moveDeadline: null, playerTimes: null, challengedPlayerInfo: data.challengedPlayerInfo || null, turnStartTime: null
                });
            } else if (data.status === 'playing') {
                const opponentColor = myColor === Color.White ? Color.Black : Color.White;
                const opponentUid = data.playerColors[opponentColor];
                if (opponentUid && data.players[opponentUid]) {
                    currentGames.push({
                        gameId, myColor, opponent: data.players[opponentUid], isMyTurn: data.turn === myColor,
                        status: data.status, timerSettings: data.timerSettings, ratingCategory: data.ratingCategory,
                        isRated: typeof data.isRated === 'boolean' ? data.isRated : true,
                        moveDeadline: data.moveDeadline, playerTimes: data.playerTimes, turnStartTime: data.turnStartTime
                    });
                }
            }
        });

        finishedGames.sort((a, b) => (b.data.completedAt || 0) - (a.data.completedAt || 0));

        setMyCurrentGames(currentGames);
        setMyFinishedGames(finishedGames);
    }, [allMyGames, userUid]);

    // Fetch Users and Open Games
    useEffect(() => {
        if (currentLobbyTab !== 'players') return;
        const usersRef = db.ref('users');
        const ratingsRef = db.ref('userRatings');

        const handleUserData = (userSnap: any, ratingSnap: any) => {
            const usersData = userSnap.val() || {};
            const ratingsData = ratingSnap.val() || {};
            const userList: UserInfo[] = Object.keys(usersData)
                .filter(uid => usersData[uid].displayName)
                .map(uid => ({
                    uid,
                    displayName: usersData[uid].displayName,
                    isOnline: usersData[uid].isOnline || false,
                    ratings: ratingsData[uid]?.ratings || {},
                }));
            setAllUsers(userList.sort((a, b) => (b.ratings?.blitz ?? 1200) - (a.ratings?.blitz ?? 1200)));
        };

        let users: any, ratings: any;
        const onUsers = (snap: any) => { users = snap; if (ratings) handleUserData(users, ratings) };
        const onRatings = (snap: any) => { ratings = snap; if (users) handleUserData(users, ratings) };

        usersRef.on('value', onUsers);
        ratingsRef.on('value', onRatings);

        return () => {
            usersRef.off('value', onUsers);
            ratingsRef.off('value', onRatings);
        };
    }, [currentLobbyTab]);

    // Consolidate with the games listener above
    useEffect(() => {
        if (createdGameListenerRef.current) {
            // Keep this cleanup safe if it exists
            return () => {
                if (createdGameListenerRef.current) {
                    createdGameListenerRef.current.ref.off();
                }
            }
        }
    }, []);

    // --- CHALLENGE ACTIONS ---

    const handleSendChallenge = async (settings: TimerSettings, isRated: boolean, challengeColor: string) => {
        if (!challengeTarget || !myRatings) return;

        const category = getRatingCategory(settings);
        const myRating = myRatings[category] ?? 1200;
        const targetUid = challengeTarget.uid;

        const challengeData = {
            fromUid: userUid,
            fromName: auth.currentUser?.displayName || 'Guest',
            fromRating: myRating,
            timerSettings: settings,
            ratingCategory: category,
            isRated: isRated,
            timestamp: window.firebase.database.ServerValue.TIMESTAMP,
            challengeColor: challengeColor
        };

        const newChallengeRef = db.ref(`challenges/${targetUid}`).push();
        await newChallengeRef.set(challengeData);

        // Track sent challenge locally for cancellation and cleanup
        const isRealtime = !settings || ('initialTime' in settings);
        await db.ref(`sentChallenges/${userUid}/${newChallengeRef.key}`).set({
            targetUid: targetUid,
            targetName: challengeTarget.displayName,
            timestamp: window.firebase.database.ServerValue.TIMESTAMP,
            isRealtime: isRealtime,
            timerSettings: settings,
            ratingCategory: category,
            isRated: isRated,
            challengeColor: challengeColor
        });

        setChallengeTarget(null); // Close Modal
        setCurrentLobbyTab('challenges'); // Switch to challenges tab
    };

    const handleCancelSentChallenge = async (challenge: SentChallenge) => {
        const updates: any = {};
        updates[`challenges/${challenge.targetUid}/${challenge.id}`] = null;
        updates[`sentChallenges/${userUid}/${challenge.id}`] = null;
        await db.ref().update(updates);
    };

    const handleAcceptChallenge = async (challenge: IncomingChallenge) => {
        if (!myRatings) return;

        // 1. Create the game
        const newGameRef = db.ref('games').push();
        const gameId = newGameRef.key;
        if (!gameId) return;

        var isCreatorWhite = Math.random() < 0.5;
        if (challenge.challengeColor === 'white') isCreatorWhite = true;
        if (challenge.challengeColor === 'black') isCreatorWhite = false;
        const myColor = isCreatorWhite ? Color.Black : Color.White;
        const opponentColor = isCreatorWhite ? Color.White : Color.Black;

        const initialState = getInitialGameState('online_playing', challenge.timerSettings, true, challenge.isRated);

        const myPlayerInfo: PlayerInfo = {
            uid: userUid,
            displayName: auth.currentUser?.displayName || 'Guest',
            disconnectTimestamp: null,
            ratings: myRatings
        };

        // Note: We don't have opponent's full ratings here, just the one sent in challenge.
        const opponentRatings = { ...myRatings };
        opponentRatings[challenge.ratingCategory] = challenge.fromRating;

        const opponentPlayerInfo: PlayerInfo = {
            uid: challenge.fromUid,
            displayName: challenge.fromName,
            disconnectTimestamp: null,
            ratings: opponentRatings
        };

        initialState.players = {
            [userUid]: myPlayerInfo,
            [challenge.fromUid]: opponentPlayerInfo
        };

        initialState.playerColors = {
            white: isCreatorWhite ? challenge.fromUid : userUid,
            black: isCreatorWhite ? userUid : challenge.fromUid
        };

        initialState.status = 'playing';
        if (challenge.timerSettings && 'initialTime' in challenge.timerSettings) {
            initialState.turnStartTime = window.firebase.database.ServerValue.TIMESTAMP as any;
        } else if (challenge.timerSettings && 'daysPerMove' in challenge.timerSettings) {
            initialState.moveDeadline = Date.now() + challenge.timerSettings.daysPerMove * 24 * 60 * 60 * 1000;
        }

        initialState.initialRatings = {
            white: initialState.playerColors.white === userUid ? myRatings[challenge.ratingCategory] : challenge.fromRating,
            black: initialState.playerColors.black === userUid ? myRatings[challenge.ratingCategory] : challenge.fromRating,
        };

        await newGameRef.set(initialState);

        // 2. Link users to game
        const updates: any = {};
        updates[`userGames/${userUid}/${gameId}`] = true;
        updates[`userGames/${challenge.fromUid}/${gameId}`] = true;
        // 3. Delete challenge
        updates[`challenges/${userUid}/${challenge.id}`] = null;
        // 4. Delete from sender's sentChallenges
        updates[`sentChallenges/${challenge.fromUid}/${challenge.id}`] = null;

        await db.ref().update(updates);

        // Manual warp because the game starts in 'playing' state, skipping 'waiting'
        // so the automatic transition logic in useEffect won't catch it.
        onGameStart(gameId, myColor);
    };

    const handleDeclineChallenge = async (challengeId: string) => {
        // Need to find who sent it to clean up their sentChallenges
        const challenge = incomingChallenges.find(c => c.id === challengeId);
        const updates: any = {};
        updates[`challenges/${userUid}/${challengeId}`] = null;
        if (challenge) {
            updates[`sentChallenges/${challenge.fromUid}/${challengeId}`] = null;
        }
        await db.ref().update(updates);
    };

    // --- STANDARD GAME CREATION ---

    const handleCreateGame = async () => {
        setIsCreatingGame(true);
        setError(null);
        if (!userUid || myRatings === null) {
            setError("You must be logged in to create a game.");
            setIsCreatingGame(false);
            return;
        }

        try {
            let settings: TimerSettings = null;
            if (timeControlType === 'realtime') {
                const initialTime = (parseFloat(baseMinutes) || 0) * 60;
                const inc = parseInt(increment, 10) || 0;
                if (initialTime > 0) {
                    settings = { initialTime, increment: inc };
                }
            } else if (timeControlType === 'correspondence') {
                if (correspondenceType === 'daily') {
                    const days = parseInt(daysPerMove, 10);
                    if (days > 0) {
                        settings = { daysPerMove: days };
                    }
                } else {
                    settings = null; // Unlimited
                }
            }

            const newGameRef = db.ref('games').push();
            const gameId = newGameRef.key;
            if (!gameId) { setError("Could not create a game ID."); setIsCreatingGame(false); return; }

            const initialState = getInitialGameState('online_playing', settings, true, isRated);
            const user = auth.currentUser;
            const displayName = user?.displayName || 'Guest';

            const playerInfo: PlayerInfo = { uid: userUid, displayName: displayName, disconnectTimestamp: null, ratings: myRatings };

            initialState.players[userUid] = playerInfo;
            initialState.playerColors[creatorColor] = userUid;
            initialState.status = 'waiting';

            await newGameRef.set(initialState);
            await db.ref(`userGames/${userUid}/${gameId}`).set(true);

            const gameWarpListener = newGameRef.on('value', (snapshot) => {
                const gameData = snapshot.val();
                if (gameData && gameData.status === 'playing') {
                    onGameStart(gameId, creatorColor);
                    newGameRef.off('value', gameWarpListener);
                    createdGameListenerRef.current = null;
                }
            });
            createdGameListenerRef.current = { gameId, ref: newGameRef };

            const category = getRatingCategory(settings);
            const isRealTimeChallenge = category !== RatingCategory.Daily && category !== RatingCategory.Unlimited;
            onGameCreated();
            setCurrentLobbyTab('current_games');

        } catch (err: any) {
            setError(`Failed to create game. Error: ${err.message}`);
            setIsCreatingGame(false);
        } finally {
            setIsCreatingGame(false);
        }
    };

    const handleJoinGame = async (gameToJoin: LobbyGame) => {
        setIsJoiningGame(gameToJoin.gameId);
        setError(null);
        if (!userUid || myRatings === null) { setError("You must be logged in to join."); setIsJoiningGame(null); return; }
        if (userUid === gameToJoin.creatorUid) { setError("You cannot join your own game."); setIsJoiningGame(null); return; }

        const user = auth.currentUser;
        const displayName = user?.displayName || 'Guest';

        db.ref(`games/${gameToJoin.gameId}`).transaction(gameData => {
            if (gameData?.status === 'waiting') {
                let joinedColor: Color | null = !gameData.playerColors.white ? Color.White : !gameData.playerColors.black ? Color.Black : null;
                if (joinedColor) {
                    const playerInfo: PlayerInfo = { uid: userUid, displayName: displayName, disconnectTimestamp: null, ratings: myRatings };
                    gameData.players[userUid] = playerInfo;
                    gameData.playerColors[joinedColor] = userUid;
                    gameData.status = 'playing';

                    if (gameData.timerSettings && 'initialTime' in gameData.timerSettings) {
                        gameData.turnStartTime = window.firebase.database.ServerValue.TIMESTAMP;
                    } else if (gameData.timerSettings && 'daysPerMove' in gameData.timerSettings) {
                        gameData.moveDeadline = Date.now() + gameData.timerSettings.daysPerMove * 24 * 60 * 60 * 1000;
                    }

                    const category = gameData.ratingCategory;
                    const creatorUid = gameToJoin.creatorUid;
                    const creatorRating = gameData.players[creatorUid].ratings[category] ?? 1200;
                    const myRatingForCategory = myRatings[category] ?? 1200;
                    const ratings = { [joinedColor]: myRatingForCategory, [joinedColor === Color.White ? Color.Black : Color.White]: creatorRating };
                    gameData.initialRatings = { white: ratings.white, black: ratings.black };
                    return gameData;
                }
            }
            return;
        }, (error, committed, snapshot) => {
            if (error || !committed) {
                setError(error ? 'Error joining game.' : 'Game no longer available.');
            } else {
                const finalGameState = snapshot.val();
                const myColor = finalGameState.playerColors.white === userUid ? Color.White : Color.Black;
                db.ref(`userGames/${userUid}/${gameToJoin.gameId}`).set(true);
                db.ref(`userGames/${gameToJoin.creatorUid}/${gameToJoin.gameId}`).set(true);

                onGameStart(gameToJoin.gameId, myColor);
            }
            setIsJoiningGame(null);
        });
    };

    // --- GAME CANCELLATION ---
    const handleCancelGame = async (game: ActiveGameSummary) => {
        if (!userUid) {
            setError("You must be logged in to cancel a game.");
            return;
        };

        try {
            if (createdGameListenerRef.current && createdGameListenerRef.current.gameId === game.gameId) {
                createdGameListenerRef.current.ref.off();
                createdGameListenerRef.current = null;
            }

            const updates: any = {};
            updates[`/games/${game.gameId}`] = null;
            updates[`/userGames/${userUid}/${game.gameId}`] = null;

            await db.ref().update(updates);

        } catch (e: any) {
            console.error("Error cancelling:", e);
            setError(`Failed to cancel: ${e.message}`);
        }
    };

    const handleViewMyRatings = () => {
        const user = auth.currentUser;
        if (user && myRatings) {
            const myUserInfo: UserInfo = {
                uid: userUid,
                displayName: user.displayName || 'Guest',
                isOnline: true,
                ratings: myRatings
            };
            setViewingPlayerRatings(myUserInfo);
        }
    };

    const isActionInProgress = isCreatingGame || isJoiningGame !== null;

    const filteredLiveGames = useMemo(() => {
        return liveGames.filter(game => {
            const cat = game.ratingCategory.toLowerCase();
            // Als de categorie in onze filters staat, check of hij op 'true' staat
            return filters[cat] !== false;
        });
    }, [liveGames, filters]);

    const filteredUsers = useMemo(() => {
        if (!searchText) return allUsers.filter(u => u.uid !== userUid);
        return allUsers.filter(u => u.uid !== userUid && u.displayName.toLowerCase().includes(searchText.toLowerCase()));
    }, [allUsers, searchText, userUid]);

    const getGameResult = (game: GameState): { text: string, color: string } => {
        const myColorName = game.playerColors.white === userUid ? "White" : "Black";

        if (game.winner) {
            if (game.winner === myColorName) return { text: "Win", color: "text-green-400" };
            return { text: "Loss", color: "text-red-400" };
        }

        if (game.status.startsWith('draw_') || game.status === 'stalemate') {
            return { text: "Draw", color: "text-gray-400" };
        }

        return { text: "Finished", color: "text-gray-400" };
    };

    const MenuButton = ({ view, label, count }: { view: typeof currentLobbyTab, label: string, count?: number }) => (
        <button
            onClick={() => setCurrentLobbyTab(view)}
            className={`
                px-4 py-2 rounded-full text-sm font-semibold transition-all shadow-sm
                ${currentLobbyTab === view
                    ? 'bg-green-600 text-white shadow-green-500/50'
                    : 'bg-gray-700 text-gray-300 hover:bg-gray-600 hover:text-white'}
                relative
            `}
        >
            {label}
            {count !== undefined && count > 0 && (
                <span className="absolute -top-1 -right-1 bg-red-500 text-white text-[10px] font-bold px-1.5 py-0.5 rounded-full shadow-sm animate-pulse">
                    {count}
                </span>
            )}
        </button>
    );

    return (
        <div className="min-h-screen flex items-center justify-center p-4">
            <div className="bg-gray-800 p-8 rounded-xl shadow-2xl w-full max-w-4xl flex flex-col items-center relative">
                <div className="absolute top-4 right-4">
                    <button
                        onClick={() => setShowSettings(true)}
                        className="text-gray-400 hover:text-white transition-colors"
                        title="Settings"
                    >
                        <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                        </svg>
                    </button>
                </div>

                <h2 className="text-3xl font-bold mb-2">Online Lobby</h2>
                <button onClick={handleViewMyRatings} className="text-lg mb-4 text-gray-300 hover:text-white transition-colors">
                    Your Blitz Rating: <span className="font-bold text-green-400">{myRatings?.blitz ?? '...'}</span> <span className="text-sm">(view all)</span>
                </button>

                {error && <p className="text-red-400 mb-4 font-semibold text-center">{error}</p>}

                <div className="flex flex-wrap gap-2 justify-center mb-6 w-full">
                    <MenuButton view="games" label="Open Games" />
                    <MenuButton view="players" label="Players" />
                    <MenuButton view="current_games" label="My Games" count={myCurrentGames.length} />
                    <MenuButton view="finished_games" label="History" />
                    <MenuButton view="challenges" label="Challenges" count={incomingChallenges.length} />
                    <MenuButton view="live" label="Live Games" count={liveGames.length} />
                </div>

                {currentLobbyTab === 'live' && (
                    <div className="w-full max-w-3xl p-4 border border-gray-600 rounded-lg flex flex-col">
                        <h3 className="text-xl font-semibold text-center mb-4">Live Spectator Arena</h3>
                        {liveGames.length === 0 ? <p className="text-gray-400 text-center">No games currently in progress.</p> : null}
                        <div className="flex-grow overflow-y-auto max-h-96 space-y-2 pr-2">
                            {liveGames.map(game => (
                                <div key={game.gameId} className="bg-gray-700 p-3 rounded-lg flex justify-between items-center">
                                    <div>
                                        {/* We hebben de spelersnamen in creatorName gestopt in de stap hierboven */}
                                        <p className="font-semibold truncate text-yellow-100">{game.creatorName}</p>
                                        <p className="text-sm text-gray-400">{renderTimerSetting(game.timerSettings)}, {game.isRated ? 'Rated' : 'Unrated'}</p>
                                    </div>
                                    <button
                                        onClick={() => onSpectate(game.gameId)}
                                        className="px-4 py-1 bg-teal-600 hover:bg-teal-700 rounded font-semibold transition-colors flex items-center gap-2"
                                    >
                                        <span>👁️</span> Watch
                                    </button>
                                </div>
                            ))}
                        </div>
                    </div>
                )}

                {currentLobbyTab === 'challenges' && (
                    <div className="w-full max-w-3xl flex flex-col gap-6">
                        <div className="p-4 border border-gray-600 rounded-lg flex flex-col">
                            <h3 className="text-xl font-semibold text-center mb-4 text-green-400">Incoming Challenges</h3>
                            {incomingChallenges.length === 0 ? (
                                <p className="text-gray-400 text-center">No incoming challenges.</p>
                            ) : (
                                <div className="space-y-3">
                                    {incomingChallenges.map(c => (
                                        <div key={c.id} className="bg-indigo-900 border border-indigo-500 p-4 rounded-lg shadow-lg flex flex-col sm:flex-row items-center justify-between gap-4">
                                            <div>
                                                <p className="font-bold text-white text-lg">{c.fromName} ({c.fromRating})</p>
                                                <p className="text-indigo-200 text-sm">{renderTimerSetting(c.timerSettings)} • {c.isRated ? 'Rated' : 'Unrated'} {c.ratingCategory}</p>
                                                <p className="font-bold text-white text-lg">{"Opponent plays as: " + c.challengeColor}</p>
                                            </div>
                                            <div className="flex gap-3">
                                                <button onClick={() => handleAcceptChallenge(c)} className="bg-green-600 hover:bg-green-500 text-white px-4 py-2 rounded font-bold transition-colors">Accept</button>
                                                <button onClick={() => handleDeclineChallenge(c.id)} className="bg-gray-600 hover:bg-gray-500 text-white px-4 py-2 rounded font-bold transition-colors">Decline</button>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>

                        <div className="p-4 border border-gray-600 rounded-lg flex flex-col">
                            <h3 className="text-xl font-semibold text-center mb-4 text-blue-400">Sent Challenges</h3>
                            {sentChallenges.length === 0 ? (
                                <p className="text-gray-400 text-center">No active sent challenges.</p>
                            ) : (
                                <div className="space-y-3">
                                    {sentChallenges.map(c => (
                                        <div key={c.id} className="bg-gray-700 p-3 rounded-lg flex justify-between items-center">
                                            <div>
                                                <p className="font-semibold text-gray-300">To: <span className="text-white">{c.targetName}</span></p>
                                                <p className="text-xs text-gray-400">Sent: {new Date(c.timestamp).toLocaleString()}</p>
                                                <p className="text-xs text-blue-300 mt-1">{renderTimerSetting(c.timerSettings)} • {c.isRated ? 'Rated' : 'Unrated'} ({c.ratingCategory})</p>
                                                <p className="text-xs text-blue-300 mt-1">{"you play as: " + c.challengeColor}</p>
                                            </div>
                                            <button onClick={() => handleCancelSentChallenge(c)} className="px-3 py-1 bg-red-600 hover:bg-red-500 rounded text-sm font-semibold text-white transition-colors">Cancel</button>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>
                    </div>
                )}

                {currentLobbyTab === 'live' && (
                    <div className="flex flex-col w-full max-w-3xl space-y-4 animate-fadeIn">

                        {/* 1. Filter Knoppen */}
                        <div className="flex flex-wrap gap-2 justify-center bg-gray-800/50 p-3 rounded-lg border border-gray-700">
                            <span className="text-sm text-gray-400 w-full text-center mb-1 font-medium">Filter by time control:</span>
                            {['hyperbullet', 'bullet', 'blitz', 'rapid', 'daily', 'unlimited'].map((cat) => (
                                <button
                                    key={cat}
                                    onClick={() => toggleFilter(cat)}
                                    className={`px-4 py-1.5 rounded-full text-xs font-bold transition-all duration-200 ${filters[cat]
                                        ? 'bg-teal-600 text-white shadow-[0_0_10px_rgba(20,184,166,0.4)] border border-teal-400'
                                        : 'bg-gray-800 text-gray-500 border border-gray-700 hover:border-gray-500'
                                        }`}
                                >
                                    {cat.toUpperCase()}
                                </button>
                            ))}
                        </div>

                        {/* 2. De Lijst met Partijen */}
                        <div className="bg-gray-900/80 border border-gray-700 rounded-xl p-4 min-h-[400px] max-h-[600px] overflow-y-auto custom-scrollbar">
                            {filteredLiveGames.length === 0 ? (
                                <div className="flex flex-col items-center justify-center h-full py-20 text-gray-500">
                                    <span className="text-4xl mb-2">👁️‍🗨️</span>
                                    <p>No live games found with these filters.</p>
                                </div>
                            ) : (
                                <div className="grid gap-3">
                                    {filteredLiveGames.map(game => (
                                        <div key={game.gameId} className="bg-gray-800 hover:bg-gray-750 p-4 rounded-lg flex justify-between items-center border border-gray-700 transition-colors shadow-sm">
                                            <div className="flex flex-col">
                                                <div className="flex items-center gap-2">
                                                    <span className="w-2 h-2 rounded-full bg-green-500 animate-pulse"></span>
                                                    <p className="font-semibold text-gray-100">{game.creatorName}</p>
                                                </div>
                                                <div className="flex gap-3 mt-1 text-xs text-gray-400">
                                                    <span className="flex items-center gap-1">⏱️ {(() => {
                                                        const settings = game.timerSettings;
                                                        if (!settings) return '⏱️ ?';

                                                        // 1. Check op Unlimited
                                                        if (game.ratingCategory?.toLowerCase() === 'unlimited' || settings.isUnlimited) {
                                                            return '⏱️ Unlimited';
                                                        }

                                                        // 2. Check op Daily (Dagen)
                                                        // We kijken of 'daysPerMove' bestaat (of hoe dat veld in jouw types heet)
                                                        if (game.ratingCategory?.toLowerCase() === 'daily') {
                                                            const days = settings.daysPerMove || settings.initialTime; // Pas aan naar jouw veldnaam
                                                            return `⏱️ ${days} days`;
                                                        }

                                                        // 3. Standaard minuten (Bullet/Blitz/Rapid)
                                                        const mins = settings.initialTime / 60 || settings.minutes;
                                                        const inc = settings.increment ?? 0;
                                                        return `⏱️ ${mins}m + ${inc}s`;
                                                    })()}</span>
                                                    <span className="flex items-center gap-1">🏆 {game.ratingCategory}</span>
                                                    {game.isRated && <span className="text-teal-400 font-bold">RATED</span>}
                                                </div>
                                            </div>
                                            <button
                                                onClick={() => onSpectate(game.gameId)}
                                                className="bg-teal-600 hover:bg-teal-500 text-white px-6 py-2 rounded-lg font-bold transition-transform active:scale-95 flex items-center gap-2 shadow-lg"
                                            >
                                                <span>👁️</span> Watch
                                            </button>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>
                    </div>
                )}

                {currentLobbyTab === 'current_games' && (
                    <div className="w-full max-w-3xl p-4 border border-gray-600 rounded-lg flex flex-col">
                        <h3 className="text-xl font-semibold text-center mb-4">My Active Games</h3>
                        {myCurrentGames.length === 0 ? <p className="text-gray-400 text-center">No active games.</p> : null}
                        <div className="flex-grow overflow-y-auto max-h-96 space-y-2 pr-2">{myCurrentGames.map(game => (
                            <div key={game.gameId} className={`p-3 rounded-lg flex justify-between items-center ${game.status === 'playing' && game.isMyTurn ? 'bg-green-800' : 'bg-gray-700'}`}>
                                {game.status === 'waiting' ? (
                                    <>
                                        <div>
                                            <p className="font-semibold truncate">
                                                Open Game (Waiting for Opponent)
                                            </p>
                                            <p className="text-sm text-gray-300">{renderTimerSetting(game.timerSettings)} ({game.ratingCategory}, {game.isRated ? 'Rated' : 'Unrated'})</p>
                                        </div>
                                        <p className="font-bold text-gray-400 flex items-center gap-2"><div className="w-2 h-2 bg-yellow-500 rounded-full animate-ping"></div> Waiting...</p>
                                        <button onClick={() => handleCancelGame(game)} className="px-4 py-2 bg-red-600 hover:bg-red-700 rounded font-semibold transition-colors shadow-sm">Cancel</button>
                                    </>
                                ) : (
                                    <>
                                        <div>
                                            <p className="font-semibold truncate">vs {game.opponent?.displayName} ({game.opponent?.ratings?.[game.ratingCategory] ?? '...'})</p>
                                            <p className="text-sm text-gray-300">{renderTimerSetting(game.timerSettings)} ({game.ratingCategory}, {game.isRated ? 'Rated' : 'Unrated'})</p>
                                        </div>
                                        <div className="text-right">
                                            <p className={`font-bold ${game.isMyTurn ? 'text-yellow-300 animate-pulse' : 'text-gray-400'}`}>{game.isMyTurn ? "Your Turn" : "Opponent's Turn"}</p>
                                            <p className="font-mono text-sm">{getDisplayTime(game)}</p>
                                        </div>
                                        <button onClick={() => onGameStart(game.gameId, game.myColor)} className="px-4 py-2 ml-4 bg-blue-600 hover:bg-blue-700 rounded font-semibold transition-colors shadow-sm">Play</button>
                                    </>
                                )}
                            </div>))}
                        </div>
                    </div>
                )}
                {currentLobbyTab === 'finished_games' && (
                    <div className="w-full max-w-3xl p-4 border border-gray-600 rounded-lg flex flex-col">
                        <h3 className="text-xl font-semibold text-center mb-4">Game History</h3>
                        {myFinishedGames.length === 0 ? <p className="text-gray-400 text-center">No completed games.</p> : null}
                        <div className="flex-grow overflow-y-auto max-h-96 space-y-2 pr-2">{myFinishedGames.map(({ id, data }) => {
                            const myColor = data.playerColors.white === userUid ? Color.White : Color.Black;
                            const opponentColor = myColor === Color.White ? Color.Black : Color.White;
                            const opponentUid = data.playerColors[opponentColor];
                            const opponent = opponentUid ? data.players[opponentUid] : null;
                            const result = getGameResult(data);

                            return (
                                <div key={id} className={`p-3 rounded-lg flex justify-between items-center bg-gray-700`}>
                                    <div>
                                        <p className="font-semibold truncate">vs {opponent?.displayName || 'Unknown'}</p>
                                        <p className="text-sm text-gray-300">{renderTimerSetting(data.timerSettings)} ({data.ratingCategory}, {data.isRated ? 'Rated' : 'Unrated'})</p>
                                    </div>
                                    <p className={`font-bold text-lg ${result.color}`}>{result.text}</p>
                                    <div className="flex gap-2 ml-4">
                                        <button onClick={() => onReview(data)} className="px-3 py-1.5 bg-blue-600 hover:bg-blue-700 rounded font-semibold transition-colors text-xs">Review</button>
                                        <button onClick={() => onAnalyse(data)} className="px-3 py-1.5 bg-purple-600 hover:bg-purple-700 rounded font-semibold transition-colors text-xs">Analyse</button>
                                    </div>
                                </div>
                            );
                        })}
                        </div>
                    </div>
                )}
                {currentLobbyTab === 'games' && (
                    <div className="w-full grid grid-cols-1 md:grid-cols-2 gap-8">
                        <div className="p-4 border border-gray-600 rounded-lg flex flex-col gap-4">
                            <h3 className="text-xl font-semibold text-center">Create New Game</h3>
                            <div className="flex items-center justify-center"><input id="rated-check" type="checkbox" checked={isRated} onChange={(e) => setIsRated(e.target.checked)} className="w-4 h-4 text-purple-600 bg-gray-700 border-gray-600 rounded focus:ring-purple-600 ring-offset-gray-800 focus:ring-2" /><label htmlFor="rated-check" className="ms-2 text-lg font-medium text-gray-300">Rated Game</label></div>

                            <div className="flex justify-center bg-gray-700 rounded-lg p-1">
                                <button onClick={() => setTimeControlType('realtime')} className={`flex-1 p-2 rounded ${timeControlType === 'realtime' ? 'bg-blue-600' : ''}`}>Real-Time</button>
                                <button onClick={() => setTimeControlType('correspondence')} className={`flex-1 p-2 rounded ${timeControlType === 'correspondence' ? 'bg-blue-600' : ''}`}>Correspondence</button>
                            </div>

                            {timeControlType === 'realtime' && (
                                <div className='flex gap-2 items-end'>
                                    <div><label className="block mb-1 text-md font-medium text-gray-300">Base Time (min)</label><input type="number" value={baseMinutes} onChange={e => setBaseMinutes(e.target.value)} className="w-full p-2 bg-gray-700 text-white rounded-lg border-2 border-gray-600" step="0.1" min="0.1" /></div>
                                    <div><label className="block mb-1 text-md font-medium text-gray-300">Increment (sec)</label><input type="number" value={increment} onChange={e => { const val = e.target.value; if (val === '' || parseInt(val, 10) >= 0) setIncrement(val); }} className="w-full p-2 bg-gray-700 text-white rounded-lg border-2 border-gray-600" min="0" /></div>
                                </div>
                            )}
                            {timeControlType === 'correspondence' && (
                                <div className="space-y-3">
                                    <div className="flex items-center justify-center gap-4 text-lg">
                                        <label className="flex items-center"><input type="radio" name="corr-type" value="daily" checked={correspondenceType === 'daily'} onChange={() => setCorrespondenceType('daily')} className="w-4 h-4 text-blue-600 bg-gray-900 border-gray-700 focus:ring-blue-600 ring-offset-gray-800 focus:ring-2" /> <span className="ml-2">Daily</span></label>
                                        <label className="flex items-center"><input type="radio" name="corr-type" value="unlimited" checked={correspondenceType === 'unlimited'} onChange={() => setCorrespondenceType('unlimited')} className="w-4 h-4 text-blue-600 bg-gray-900 border-gray-700 focus:ring-blue-600 ring-offset-gray-800 focus:ring-2" /> <span className="ml-2">Unlimited</span></label>
                                    </div>
                                    <div className={`transition-opacity duration-300 ${correspondenceType === 'unlimited' ? 'opacity-50' : 'opacity-100'}`}>
                                        <label className="block mb-1 text-md font-medium text-gray-300 text-center">Days per Move</label>
                                        <input type="number" value={daysPerMove} onChange={e => setDaysPerMove(e.target.value)} disabled={correspondenceType === 'unlimited'} className="w-full p-2 bg-gray-700 text-white rounded-lg border-2 border-gray-600 disabled:cursor-not-allowed" min="1" step="1" />
                                    </div>
                                </div>
                            )}

                            <button onClick={handleCreateGame} disabled={isActionInProgress} className="w-full mt-2 px-6 py-3 bg-green-600 hover:bg-green-700 rounded-lg text-xl font-semibold transition-colors disabled:bg-gray-500 disabled:cursor-not-allowed">{isCreatingGame ? 'Creating...' : 'Create Game'}</button>
                        </div>
                        <div className="p-4 border border-gray-600 rounded-lg flex flex-col"><h3 className="text-xl font-semibold text-center mb-4">Join a Game</h3>
                            {isLobbyLoading ? <p className="text-gray-400 text-center">Loading games...</p> : !openGames.length ? <p className="text-gray-400 text-center">No open games available.</p> : null}
                            <div className="flex-grow overflow-y-auto max-h-64 space-y-2 pr-2">{openGames.map(game => (
                                <div key={game.gameId} className="bg-gray-700 p-3 rounded-lg flex justify-between items-center">
                                    <div><p className="font-semibold truncate">{game.creatorName} ({game.creatorRatings?.[game.ratingCategory] ?? '...'})</p><p className="text-sm text-gray-400">{renderTimerSetting(game.timerSettings)}, {game.isRated ? 'Rated' : 'Unrated'}</p></div>
                                    <button onClick={() => handleJoinGame(game)} disabled={isActionInProgress} className="px-4 py-1 bg-blue-600 hover:bg-blue-700 rounded font-semibold transition-colors disabled:bg-gray-500 disabled:cursor-not-allowed">{isJoiningGame === game.gameId ? 'Joining...' : 'Join'}</button>
                                </div>))}
                            </div>
                        </div>
                    </div>
                )}
                {currentLobbyTab === 'players' && (
                    <div className="w-full max-w-3xl p-4 border border-gray-600 rounded-lg flex flex-col"><h3 className="text-xl font-semibold text-center mb-4">Active Players</h3>
                        <input type="text" placeholder="Search for a player..." value={searchText} onChange={e => setSearchText(e.target.value)} className="w-full p-2 mb-4 bg-gray-700 text-white rounded-lg border-2 border-gray-600" />
                        <div className="flex-grow overflow-y-auto max-h-80 space-y-2 pr-2">{filteredUsers.map(user => (
                            <div key={user.uid} className="bg-gray-700 p-3 rounded-lg flex justify-between items-center">
                                <button onClick={() => setViewingPlayerRatings(user)} className="flex items-center gap-2 text-left hover:bg-gray-600 rounded p-1 flex-grow">
                                    <span className={`w-3 h-3 rounded-full flex-shrink-0 ${user.isOnline ? 'bg-green-500' : 'bg-gray-500'}`}></span>
                                    <p className="font-semibold truncate">{user.displayName} (Blitz: {user.ratings?.blitz ?? 1200})</p>
                                </button>
                                <button
                                    onClick={() => setChallengeTarget(user)}
                                    className="ml-2 px-3 py-1 bg-purple-600 hover:bg-purple-500 rounded text-sm font-semibold transition-colors whitespace-nowrap"
                                >
                                    Challenge
                                </button>
                            </div>))}
                        </div>
                    </div>
                )}

                <button onClick={onBack} className="mt-8 px-6 py-2 bg-red-600 hover:bg-red-700 rounded-lg font-semibold transition-colors">Back to Menu</button>
            </div>
            {viewingPlayerRatings && <PlayerRatingsModal user={viewingPlayerRatings} onClose={() => setViewingPlayerRatings(null)} />}
            {challengeTarget && (
                <ChallengeConfigModal
                    opponent={challengeTarget}
                    onCancel={() => setChallengeTarget(null)}
                    onSend={handleSendChallenge}
                />
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
                    showPowerPieces={showPowerPieces}
                    setShowPowerPieces={setShowPowerPieces}
                    showPowerRings={showPowerRings}
                    setShowPowerRings={setShowPowerRings}
                    showOriginalType={showOriginalType}
                    setShowOriginalType={setShowOriginalType}
                    soundsEnabled={soundsEnabled}
                    setSoundsEnabled={setSoundsEnabled}
                />
            )}
        </div>
    );
};

export default OnlineLobby;
