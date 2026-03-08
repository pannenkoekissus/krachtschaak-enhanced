import React, { useState, useEffect, useRef } from 'react';
import { db, auth } from '../firebaseConfig';
import {
    TournamentData, TournamentPlayer, TournamentPairing, TournamentRound,
    TimerSettings, PairingMode, Color, GameState, PlayerInfo, PairingResult
} from '../types';
import {
    createTournament, joinTournament, removePlayer,
    startTournament, endTournament, deleteTournament, setPairings, updatePairing,
    updatePlayerScore, advanceRound, getTournament,
    listActiveTournaments, listTournamentHistory, generateSwissPairings, recalculateTiebreaks,
    toggleHostParticipation, listPublicTournamentHistory
} from '../utils/tournamentFirebase';
import { createInitialBoard } from '../utils/game';
import { getRatingCategory } from '../utils/ratings';

interface TournamentProps {
    userId: string;
    displayName: string;
    onBack: () => void;
    onGameStart: (gameId: string, playerColor: Color) => void;
    onSpectate: (gameId: string) => void;
    getInitialGameState: (mode: 'online_playing', settings: TimerSettings, dontLoad: boolean, isRated: boolean) => GameState;
    myRatings: any;
    activeTournamentId?: string | null;
    onTournamentJoined: (id: string | null) => void;
}

type TournamentView = 'list' | 'create' | 'lobby' | 'in_progress' | 'finished';
type ListTab = 'active' | 'history' | 'public_history';

const Tournament: React.FC<TournamentProps> = ({
    userId, displayName, onBack, onGameStart, getInitialGameState, myRatings,
    activeTournamentId, onTournamentJoined, onSpectate
}) => {
    const [view, setView] = useState<TournamentView>('list');
    const [tournaments, setTournaments] = useState<TournamentData[]>([]);
    const [history, setHistory] = useState<TournamentData[]>([]);
    const [publicHistory, setPublicHistory] = useState<TournamentData[]>([]);
    const [listTab, setListTab] = useState<ListTab>('active');
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    // Create form
    const [createName, setCreateName] = useState('');
    const [createPairingMode, setCreatePairingMode] = useState<PairingMode>('swiss');
    const [createRounds, setCreateRounds] = useState('3');
    const [createBaseMinutes, setCreateBaseMinutes] = useState('10');
    const [createIncrement, setCreateIncrement] = useState('0');
    const [createDaysPerMove, setCreateDaysPerMove] = useState('1');
    const [createTimeControlType, setCreateTimeControlType] = useState<'realtime' | 'daily'>('realtime');
    const [hostParticipates, setHostParticipates] = useState(true);
    const [createIsPrivate, setCreateIsPrivate] = useState(false);
    const [createIsRated, setCreateIsRated] = useState(true);
    const [createShowPowerPieces, setCreateShowPowerPieces] = useState(true);
    const [createShowPowerRings, setCreateShowPowerRings] = useState(true);
    const [createShowOriginalType, setCreateShowOriginalType] = useState(true);

    // Join
    const [joinCode, setJoinCode] = useState('');

    // Active tournament
    const [activeTournament, setActiveTournament] = useState<TournamentData | null>(null);
    const [myPlayerId, setMyPlayerId] = useState<string | null>(null);
    const listenerRef = useRef<any>(null);

    // Manual pairing state
    const [manualWhite, setManualWhite] = useState<string>('');
    const [manualBlack, setManualBlack] = useState<string>('');

    // Load tournaments list
    useEffect(() => {
        if (activeTournamentId) {
            subscribeToTournament(activeTournamentId);
            setView('lobby');
        }
        loadTournaments();
    }, [activeTournamentId, userId]);

    const loadTournaments = async () => {
        try {
            setLoading(true);
            const activeList = await listActiveTournaments(userId);
            setTournaments(activeList);

            if (userId) {
                const hist = await listTournamentHistory(userId);
                setHistory(hist);
            }
            const pubHist = await listPublicTournamentHistory();
            setPublicHistory(pubHist);
        } catch (err: any) {
            setError('Failed to load tournaments');
        } finally {
            setLoading(false);
        }
    };

    // Subscribe to tournament updates
    const subscribeToTournament = (tournamentId: string) => {
        if (listenerRef.current) {
            listenerRef.current.off();
        }
        const ref = db.ref(`tournaments/${tournamentId}`);
        ref.on('value', (snap: any) => {
            const data = snap.val();
            if (data) {
                setActiveTournament(data);
                const players = data.players || {};
                const myEntry = Object.values(players).find((p: any) => p.uid === userId);
                setMyPlayerId(myEntry ? (myEntry as TournamentPlayer).oderId : null);
            } else {
                // Tournament deleted or not found
                setActiveTournament(null);
                onTournamentJoined(null);
                setView('list');
                loadTournaments();
            }
        });
        listenerRef.current = ref;
    };

    useEffect(() => {
        return () => {
            if (listenerRef.current) listenerRef.current.off();
        };
    }, []);

    // AUTO-WARP LOGIC: Listen for new pairings involving me
    useEffect(() => {
        if (!activeTournament || !myPlayerId) return;

        const currentRound = activeTournament.currentRound;
        const pairings = activeTournament.rounds?.[currentRound]?.pairings || {};

        Object.values(pairings).forEach((pairing: TournamentPairing) => {
            if (pairing.status === 'playing' && pairing.gameId) {
                if (pairing.white === myPlayerId) {
                    onGameStart(pairing.gameId, Color.White);
                } else if (pairing.black === myPlayerId) {
                    onGameStart(pairing.gameId, Color.Black);
                }
            }
        });
    }, [activeTournament, myPlayerId, onGameStart]);

    const isHost = activeTournament?.hostUid === userId;
    const players = Object.values(activeTournament?.players || {}) as TournamentPlayer[];
    const currentRound = activeTournament?.currentRound || 0;
    const currentRoundData = activeTournament?.rounds?.[currentRound] || null;
    const currentPairings = Object.values(currentRoundData?.pairings || {}) as TournamentPairing[];

    const getPlayerName = (oderId: string) => {
        if (oderId === 'BYE') return 'BYE';
        const p = activeTournament?.players?.[oderId];
        return p?.nickname || 'Unknown';
    };

    // Handle create
    const handleCreate = async () => {
        if (!createName.trim()) { setError('Enter a tournament name'); return; }
        try {
            setError(null);
            const baseTime = createTimeControlType === 'realtime' ? (parseFloat(createBaseMinutes) || 0) * 60 : 0;
            const inc = createTimeControlType === 'realtime' ? (parseInt(createIncrement) || 0) : 0;
            const days = createTimeControlType === 'daily' ? (parseInt(createDaysPerMove) || 1) : 0;

            const settings: TimerSettings = createTimeControlType === 'realtime'
                ? (baseTime > 0 ? { initialTime: baseTime, increment: inc } : null)
                : { daysPerMove: days };
            const rounds = parseInt(createRounds) || 3;

            const id = await createTournament(createName.trim(), userId, displayName, settings, createPairingMode, rounds, hostParticipates, {
                showPowerPieces: createShowPowerPieces,
                showPowerRings: createShowPowerRings,
                showOriginalType: createShowOriginalType
            }, createIsPrivate, createIsRated);
            onTournamentJoined(id);
            subscribeToTournament(id);
            setView('lobby');
        } catch (err: any) {
            setError(err.message);
        }
    };

    const handleJoin = async (tournamentId?: any) => {
        const id = (typeof tournamentId === 'string' ? tournamentId : joinCode).trim().toUpperCase();
        if (!id) { setError('Enter a tournament code'); return; }

        try {
            setError(null);
            const t = await getTournament(id);
            if (!t) { setError('Tournament not found'); return; }

            const isHostOfThis = t.hostUid === userId;
            const existing = Object.values(t.players || {}).find((p: any) => p.uid === userId);

            // Non-host, non-player can enter a started or finished tournament as a spectator
            // We only show an error if it's private and they don't have access (already handled by lists usually)
            // But for joining by code, we might want to check privacy.
            if (t.isPrivate && !existing && !isHostOfThis && joinCode === id) {
                // If they have the code, maybe they CAN spectate? 
                // Usually "private" implies invitation only.
            }

            // Allow anyone to enter as long as it exists (spectator mode)
            // If lobby, they should probably join as player if they aren't host.
            if (t.status === 'lobby' && !existing && !isHostOfThis) {
                await joinTournament(id, displayName, userId);
            }

            onTournamentJoined(id);
            subscribeToTournament(id);
            setView('lobby'); // The component will render the correct sub-view based on t.status
        } catch (err: any) {
            setError(err.message);
        }
    };

    // Host: start the tournament
    const handleStartTournament = async () => {
        if (!activeTournament) return;
        if (players.length < 2) { setError('Need at least 2 players'); return; }
        await startTournament(activeTournament.id);
        // If swiss, auto-generate round 1 pairings
        if (activeTournament.pairingMode === 'swiss') {
            const pairings = generateSwissPairings(players, {});
            await setPairings(activeTournament.id, 1, pairings);
        }
    };

    // Host: generate Swiss pairings for current round
    const handleGenerateSwiss = async () => {
        if (!activeTournament) return;
        const pairings = generateSwissPairings(players, activeTournament.rounds || {});
        await setPairings(activeTournament.id, currentRound, pairings);
    };

    const handleDeleteTournament = async () => {
        if (!activeTournament || !isHost) return;

        // Literal interpretation: "no players in it"
        // But practically, many hosts participate. We'll allow deletion if no OTHER players are present.
        const otherPlayers = players.filter(p => p.uid !== userId);
        if (otherPlayers.length > 0) {
            setError('Cannot delete tournament while other players are joined');
            return;
        }

        if (window.confirm('Are you sure you want to delete this tournament?')) {
            try {
                await deleteTournament(activeTournament.id);
                if (listenerRef.current) listenerRef.current.off();
                setActiveTournament(null);
                onTournamentJoined(null);
                setView('list');
                loadTournaments();
            } catch (err: any) {
                setError(err.message);
            }
        }
    };

    const handleAddManualPairing = async () => {
        if (!activeTournament || !manualWhite || !manualBlack) return;
        const isBye = manualBlack === 'BYE' || manualBlack === 'HALF_BYE' || manualBlack === 'ZERO_BYE';
        if (!isBye && manualWhite === manualBlack) return;

        // Prevent duplicate pairing in the same round
        const alreadyPaired = currentPairings.some(p =>
            p.white === manualWhite || (!isBye && p.white === manualBlack) ||
            p.black === manualWhite || (!isBye && p.black === manualBlack)
        );
        if (alreadyPaired) { setError('One or both players are already paired in this round'); return; }

        const pairingId = Date.now().toString(36) + Math.random().toString(36).substring(2, 6);
        const result: PairingResult = manualBlack === 'BYE' ? '1-0' : (manualBlack === 'HALF_BYE' ? '0.5-0.5' : (manualBlack === 'ZERO_BYE' ? '0-1' : null));
        const newPairing: TournamentPairing = {
            id: pairingId,
            white: manualWhite,
            black: isBye ? 'BYE' : manualBlack,
            gameId: null,
            result: result,
            status: isBye ? 'finished' : 'pending'
        };

        await updatePairing(activeTournament.id, currentRound, pairingId, newPairing);

        if (isBye) {
            const scoreToAdd = manualBlack === 'BYE' ? 1 : (manualBlack === 'HALF_BYE' ? 0.5 : 0);
            if (scoreToAdd > 0) {
                await updatePlayerScore(activeTournament.id, manualWhite, scoreToAdd);
            }
            await recalculateTiebreaks(activeTournament.id);
        }

        setManualWhite('');
        setManualBlack('');
    };

    // Host: start a specific game
    const handleStartGame = async (pairing: TournamentPairing) => {
        if (!activeTournament || pairing.status !== 'pending') return;

        const whitePlayer = activeTournament.players[pairing.white];
        const blackPlayer = activeTournament.players[pairing.black];
        if (!whitePlayer || !blackPlayer) return;

        // Use a transaction on the pairing to ensure only one client actually starts the game
        await db.ref(`tournaments/${activeTournament.id}/rounds/${currentRound}/pairings/${pairing.id}`).transaction((currentPairing: TournamentPairing | null) => {
            if (!currentPairing || currentPairing.status !== 'pending') return; // Already started or invalid
            return { ...currentPairing, status: 'starting' }; // Intermediate state
        }, async (error, committed, snapshot) => {
            if (error || !committed) return;

            // Now we are the one responsible for starting the game
            const newGameRef = db.ref('games').push();
            const gameId = newGameRef.key;
            if (!gameId) return;

            // Fetch actual ratings for both players
            let whiteRatings = {};
            let blackRatings = {};
            try {
                const whiteSnap = await db.ref(`userRatings/${whitePlayer.uid}/ratings`).once('value');
                const blackSnap = await db.ref(`userRatings/${blackPlayer.uid}/ratings`).once('value');
                if (whiteSnap.exists()) whiteRatings = whiteSnap.val();
                if (blackSnap.exists()) blackRatings = blackSnap.val();
            } catch (e) {
                console.error("Error fetching ratings for tournament game:", e);
            }

            const category = getRatingCategory(activeTournament.timerSettings);
            const initialState = getInitialGameState('online_playing', activeTournament.timerSettings, true, false);

            const whiteInfo: PlayerInfo = {
                uid: whitePlayer.uid, displayName: whitePlayer.nickname,
                disconnectTimestamp: null, ratings: whiteRatings as any
            };
            const blackInfo: PlayerInfo = {
                uid: blackPlayer.uid, displayName: blackPlayer.nickname,
                disconnectTimestamp: null, ratings: blackRatings as any
            };

            initialState.players[whitePlayer.uid] = whiteInfo;
            initialState.players[blackPlayer.uid] = blackInfo;
            initialState.playerColors = { white: whitePlayer.uid, black: blackPlayer.uid };
            initialState.status = 'playing';
            initialState.isRated = activeTournament.isRated ?? false;

            initialState.showPowerPieces = activeTournament.showPowerPieces ?? true;
            initialState.showPowerRings = activeTournament.showPowerRings ?? true;
            initialState.showOriginalType = activeTournament.showOriginalType ?? true;

            initialState.ratingCategory = category;
            initialState.initialRatings = {
                white: (whiteRatings as any)[category] ?? 1200,
                black: (blackRatings as any)[category] ?? 1200
            };

            if (activeTournament.timerSettings && 'initialTime' in activeTournament.timerSettings) {
                initialState.turnStartTime = window.firebase.database.ServerValue.TIMESTAMP as any;
            } else if (activeTournament.timerSettings && 'daysPerMove' in activeTournament.timerSettings) {
                initialState.moveDeadline = Date.now() + activeTournament.timerSettings.daysPerMove * 24 * 60 * 60 * 1000;
            }

            initialState.tournamentId = activeTournament.id;
            initialState.tournamentRound = currentRound;
            initialState.tournamentPairingId = pairing.id;

            await newGameRef.set(initialState);
            await db.ref(`userGames/${whitePlayer.uid}/${gameId}`).set(true);
            await db.ref(`userGames/${blackPlayer.uid}/${gameId}`).set(true);

            // Update pairing status to playing
            await updatePairing(activeTournament.id, currentRound, pairing.id, {
                gameId,
                status: 'playing'
            });

            if (whitePlayer.uid === userId) {
                onGameStart(gameId, Color.White);
            } else if (blackPlayer.uid === userId) {
                onGameStart(gameId, Color.Black);
            }
        });
    };

    // Host: start all pending games
    const handleStartAllGames = async () => {
        for (const pairing of currentPairings) {
            if (pairing.status === 'pending' && pairing.black !== 'BYE') {
                await handleStartGame(pairing);
            }
        }
    };

    // Host: set result manually
    const handleSetResult = async (pairing: TournamentPairing, result: '1-0' | '0-1' | '0.5-0.5') => {
        if (!activeTournament) return;

        await updatePairing(activeTournament.id, currentRound, pairing.id, {
            result,
            status: 'finished'
        });

        // Update scores via a single transaction/update to ensure consistency
        const tSnap = await db.ref(`tournaments/${activeTournament.id}`).once('value');
        const tData = tSnap.val();
        if (!tData) return;

        const updates: any = {};
        if (result === '1-0') {
            updates[`tournaments/${activeTournament.id}/players/${pairing.white}/score`] = (tData.players[pairing.white]?.score || 0) + 1;
            if (pairing.black !== 'BYE') {
                updates[`tournaments/${activeTournament.id}/players/${pairing.black}/score`] = (tData.players[pairing.black]?.score || 0);
            }
        } else if (result === '0-1') {
            updates[`tournaments/${activeTournament.id}/players/${pairing.white}/score`] = (tData.players[pairing.white]?.score || 0);
            if (pairing.black !== 'BYE') {
                updates[`tournaments/${activeTournament.id}/players/${pairing.black}/score`] = (tData.players[pairing.black]?.score || 0) + 1;
            }
        } else {
            updates[`tournaments/${activeTournament.id}/players/${pairing.white}/score`] = (tData.players[pairing.white]?.score || 0) + 0.5;
            if (pairing.black !== 'BYE') {
                updates[`tournaments/${activeTournament.id}/players/${pairing.black}/score`] = (tData.players[pairing.black]?.score || 0) + 0.5;
            }
        }
        await db.ref().update(updates);

        // Recalculate tiebreaks
        await recalculateTiebreaks(activeTournament.id);
    };

    // Host: advance to next round
    const handleNextRound = async () => {
        if (!activeTournament) return;
        const nextRound = currentRound + 1;
        if (nextRound > activeTournament.totalRounds) {
            await endTournament(activeTournament.id);
            return;
        }
        await advanceRound(activeTournament.id);
        if (activeTournament.pairingMode === 'swiss') {
            // Re-fetch latest data for Swiss pairings
            const fresh = await getTournament(activeTournament.id);
            if (fresh) {
                const freshPlayers = Object.values(fresh.players || {}) as TournamentPlayer[];
                const pairings = generateSwissPairings(freshPlayers, fresh.rounds || {});
                await setPairings(activeTournament.id, nextRound, pairings);
            }
        }
    };

    // Award wins to opponents for any pending pairings involving a withdrawing/removed player
    const awardForfeitWins = async (playerId: string) => {
        if (!activeTournament) return;
        const rounds = activeTournament.rounds || {};
        for (const [roundNum, round] of Object.entries(rounds)) {
            const roundData = round as TournamentRound;
            const pairings = roundData.pairings || {};
            for (const [pairingId, pairing] of Object.entries(pairings)) {
                const p = pairing as TournamentPairing;
                if (p.status !== 'pending') continue;
                if (p.white === playerId || p.black === playerId) {
                    const result: '1-0' | '0-1' = p.white === playerId ? '0-1' : '1-0';
                    const winnerId = p.white === playerId ? p.black : p.white;
                    if (winnerId !== 'BYE') {
                        await updatePairing(activeTournament.id, parseInt(roundNum), pairingId, {
                            result,
                            status: 'finished'
                        });
                        await updatePlayerScore(activeTournament.id, winnerId, 1);
                        await recalculateTiebreaks(activeTournament.id);
                    }
                }
            }
        }
    };

    // Host: remove a player
    const handleRemovePlayer = async (playerId: string) => {
        if (!activeTournament) return;
        await awardForfeitWins(playerId);
        await removePlayer(activeTournament.id, playerId);
    };

    // Self: withdraw from tournament
    const handleWithdraw = async () => {
        if (!activeTournament || !myPlayerId) return;
        if (window.confirm('Are you sure you want to withdraw from this tournament?')) {
            try {
                await awardForfeitWins(myPlayerId);
                await removePlayer(activeTournament.id, myPlayerId);
                if (listenerRef.current) listenerRef.current.off();
                setActiveTournament(null);
                onTournamentJoined(null);
                setView('list');
                loadTournaments();
            } catch (err: any) {
                setError(err.message);
            }
        }
    };

    // Check if all pairings in current round are finished
    const allPairingsFinished = currentPairings.length > 0 && currentPairings.every(p => p.status === 'finished');
    const isLastRound = currentRound >= (activeTournament?.totalRounds || 0);

    // Sort players for standings
    const sortedPlayers = [...players].sort((a, b) => {
        if (b.score !== a.score) return b.score - a.score;
        if (b.buchholz !== a.buchholz) return b.buchholz - a.buchholz;
        if (b.sonnebornBerger !== a.sonnebornBerger) return b.sonnebornBerger - a.sonnebornBerger;
        return a.joinedAt - b.joinedAt;
    });

    // ---- RENDER ----

    // Tournament list view
    if (view === 'list') {
        return (
            <div className="min-h-screen bg-gray-900 text-white p-4">
                <div className="max-w-2xl mx-auto">
                    <div className="flex items-center justify-between mb-6">
                        <h1 className="text-3xl font-bold text-transparent bg-clip-text bg-gradient-to-r from-yellow-400 to-orange-500">
                            🏆 Tournaments
                        </h1>
                        <button onClick={onBack} className="px-4 py-2 bg-gray-700 hover:bg-gray-600 rounded-lg font-semibold transition-colors">
                            ← Back
                        </button>
                    </div>

                    {error && (
                        <div className="mb-4 p-3 bg-red-900/50 border border-red-600 rounded-lg text-red-200 text-sm">{error}</div>
                    )}

                    {/* Join by code */}
                    <div className="mb-6 p-4 bg-gray-800 rounded-xl border border-gray-700">
                        <div className="flex gap-2 mb-6 border-b border-gray-700 pb-2">
                            <button
                                onClick={() => setListTab('active')}
                                className={`px-4 py-2 font-bold transition-colors ${listTab === 'active' ? 'text-yellow-500 border-b-2 border-yellow-500' : 'text-gray-400 hover:text-white'}`}
                            >
                                Active
                            </button>
                            <button
                                onClick={() => setListTab('history')}
                                className={`px-4 py-2 font-bold transition-colors ${listTab === 'history' ? 'text-yellow-500 border-b-2 border-yellow-500' : 'text-gray-400 hover:text-white'}`}
                            >
                                My History
                            </button>
                            <button
                                onClick={() => setListTab('public_history')}
                                className={`px-4 py-2 font-bold transition-colors ${listTab === 'public_history' ? 'text-yellow-500 border-b-2 border-yellow-500' : 'text-gray-400 hover:text-white'}`}
                            >
                                Public History
                            </button>
                        </div>

                        {listTab === 'active' && (
                            <>
                                <h2 className="text-lg font-bold mb-3">Join Tournament</h2>
                                <div className="flex gap-2 mb-6">
                                    <input
                                        type="text"
                                        value={joinCode}
                                        onChange={e => setJoinCode(e.target.value.toUpperCase())}
                                        placeholder="Enter code (e.g. AB12CD)"
                                        className="flex-1 px-3 py-2 bg-gray-700 border border-gray-600 rounded-lg text-white placeholder-gray-400 uppercase tracking-widest text-center font-mono text-lg"
                                        maxLength={6}
                                    />
                                    <button
                                        onClick={handleJoin}
                                        className="px-6 py-2 bg-green-600 hover:bg-green-500 rounded-lg font-bold transition-colors"
                                    >
                                        Find & Join
                                    </button>
                                </div>
                            </>
                        )}

                        <div className="space-y-3">
                            {loading ? (
                                <div className="text-center py-8 text-gray-500">Loading...</div>
                            ) : (listTab === 'active' ? tournaments : listTab === 'history' ? history : publicHistory).length === 0 ? (
                                <div className="text-center py-8 text-gray-500 italic">
                                    No {listTab.replace('_', ' ')} tournaments found.
                                </div>
                            ) : (
                                (listTab === 'active' ? tournaments : listTab === 'history' ? history : publicHistory).map(t => {
                                    const timeLabel = !t.timerSettings ? 'Unlimited' :
                                        'daysPerMove' in t.timerSettings ? `${t.timerSettings.daysPerMove}d / move` :
                                            `${t.timerSettings.initialTime / 60}m + ${t.timerSettings.increment}s`;

                                    const visualTags: string[] = [];
                                    if (t.showPowerPieces !== undefined) visualTags.push(t.showPowerPieces ? '🔮 Icons' : '🚫 No Icons');
                                    if (t.showPowerRings !== undefined) visualTags.push(t.showPowerRings ? '💍 Rings' : '🚫 No Rings');
                                    if (t.showOriginalType !== undefined) visualTags.push(t.showOriginalType ? '♟ Original' : '🚫 No Original');

                                    return (
                                        <div
                                            key={t.id}
                                            onClick={() => handleJoin(t.id)}
                                            className="p-4 bg-gray-700 hover:bg-gray-600 rounded-xl border border-gray-600 transition-all cursor-pointer group"
                                        >
                                            <div className="flex justify-between items-start">
                                                <div>
                                                    <h3 className="font-bold text-lg group-hover:text-yellow-400 transition-colors">{t.name}</h3>
                                                    <div className="text-sm text-gray-400">
                                                        Host: {t.hostName} • {Object.keys(t.players || {}).length} players
                                                    </div>
                                                    <div className="text-sm text-gray-400 mt-0.5">
                                                        ⏱ {timeLabel} • {t.totalRounds} round{t.totalRounds !== 1 ? 's' : ''}
                                                    </div>
                                                    <div className="mt-1 flex gap-2 flex-wrap">
                                                        <span className={`text-[10px] uppercase font-bold px-1.5 py-0.5 rounded ${t.pairingMode === 'swiss' ? 'bg-blue-900/50 text-blue-400' : 'bg-purple-900/50 text-purple-400'}`}>
                                                            {t.pairingMode}
                                                        </span>
                                                        {t.isPrivate && <span className="text-[10px] uppercase font-bold px-1.5 py-0.5 rounded bg-amber-900/50 text-amber-500">Private</span>}
                                                        {t.isRated && <span className="text-[10px] uppercase font-bold px-1.5 py-0.5 rounded bg-green-900/50 text-green-500">Rated</span>}
                                                    </div>
                                                    {visualTags.length > 0 && (
                                                        <div className="text-xs text-gray-500 mt-1.5">
                                                            {visualTags.join(' • ')}
                                                        </div>
                                                    )}
                                                </div>
                                                <div className="flex flex-col items-end gap-2">
                                                    <span className={`px-2 py-1 rounded text-xs font-bold ${t.status === 'lobby' ? 'bg-green-900 text-green-400' : t.status === 'in_progress' ? 'bg-blue-900 text-blue-400' : 'bg-gray-600 text-gray-300'
                                                        }`}>
                                                        {t.status.replace('_', ' ')}
                                                    </span>
                                                    <div className="text-[10px] font-mono text-gray-500">{t.id}</div>
                                                </div>
                                            </div>
                                        </div>
                                    );
                                })
                            )}
                        </div>
                    </div>

                    <p className="text-xs text-gray-400 mt-2 mb-6 text-center">
                        Private tournaments only appear for the host or if you have the join code.
                    </p>

                    {/* Create button */}
                    <button
                        onClick={() => setView('create')}
                        className="w-full py-3 bg-gradient-to-r from-yellow-600 to-orange-600 hover:from-yellow-500 hover:to-orange-500 rounded-xl text-lg font-bold transition-all transform hover:scale-[1.02] shadow-lg"
                    >
                        + Create Tournament
                    </button>
                </div>
            </div>
        );
    }

    // Create tournament view
    if (view === 'create') {
        return (
            <div className="min-h-screen bg-gray-900 text-white p-4">
                <div className="max-w-md mx-auto">
                    <h1 className="text-3xl font-bold mb-6 text-transparent bg-clip-text bg-gradient-to-r from-yellow-400 to-orange-500">
                        Create Tournament
                    </h1>

                    {error && (
                        <div className="mb-4 p-3 bg-red-900/50 border border-red-600 rounded-lg text-red-200 text-sm">{error}</div>
                    )}

                    <div className="space-y-4">
                        <div>
                            <label className="block text-sm font-semibold text-gray-300 mb-1">Tournament Name</label>
                            <input
                                type="text"
                                value={createName}
                                onChange={e => setCreateName(e.target.value)}
                                placeholder="e.g. Friday Night Krachtschaak"
                                className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded-lg text-white placeholder-gray-400"
                            />
                        </div>

                        <div>
                            <label className="block text-sm font-semibold text-gray-300 mb-1">Pairing Mode</label>
                            <div className="flex gap-2">
                                <button
                                    onClick={() => setCreatePairingMode('swiss')}
                                    className={`flex-1 py-2 rounded-lg font-bold text-sm transition-all ${createPairingMode === 'swiss' ? 'bg-yellow-600 text-white' : 'bg-gray-700 text-gray-400 hover:bg-gray-600'}`}
                                >
                                    Swiss System
                                </button>
                                <button
                                    onClick={() => setCreatePairingMode('manual')}
                                    className={`flex-1 py-2 rounded-lg font-bold text-sm transition-all ${createPairingMode === 'manual' ? 'bg-yellow-600 text-white' : 'bg-gray-700 text-gray-400 hover:bg-gray-600'}`}
                                >
                                    Manual
                                </button>
                            </div>
                        </div>

                        <div>
                            <label className="block text-sm font-semibold text-gray-300 mb-1">Number of Rounds</label>
                            <input
                                type="number"
                                value={createRounds}
                                onChange={e => setCreateRounds(e.target.value)}
                                min="1"
                                max="20"
                                className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded-lg text-white text-center"
                            />
                        </div>

                        <div>
                            <label className="block text-sm font-semibold text-gray-300 mb-1">Time Control</label>
                            <div className="flex gap-2 mb-2">
                                <button
                                    onClick={() => setCreateTimeControlType('realtime')}
                                    className={`flex-1 py-1 rounded-md font-bold text-xs transition-all ${createTimeControlType === 'realtime' ? 'bg-blue-600 text-white' : 'bg-gray-700 text-gray-400 hover:bg-gray-600'}`}
                                >
                                    Real-time
                                </button>
                                <button
                                    onClick={() => setCreateTimeControlType('daily')}
                                    className={`flex-1 py-1 rounded-md font-bold text-xs transition-all ${createTimeControlType === 'daily' ? 'bg-blue-600 text-white' : 'bg-gray-700 text-gray-400 hover:bg-gray-600'}`}
                                >
                                    Daily
                                </button>
                            </div>

                            {createTimeControlType === 'realtime' ? (
                                <div className="flex gap-2">
                                    <div className="flex-1">
                                        <label className="block text-xs text-gray-400 mb-1">Base (min)</label>
                                        <input
                                            type="number"
                                            value={createBaseMinutes}
                                            onChange={e => setCreateBaseMinutes(e.target.value)}
                                            className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded-lg text-white text-center"
                                            min="0"
                                        />
                                    </div>
                                    <div className="flex-1">
                                        <label className="block text-xs text-gray-400 mb-1">Increment (sec)</label>
                                        <input
                                            type="number"
                                            value={createIncrement}
                                            onChange={e => setCreateIncrement(e.target.value)}
                                            className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded-lg text-white text-center"
                                            min="0"
                                        />
                                    </div>
                                </div>
                            ) : (
                                <div>
                                    <label className="block text-xs text-gray-400 mb-1 text-center">Days per move</label>
                                    <input
                                        type="number"
                                        value={createDaysPerMove}
                                        onChange={e => setCreateDaysPerMove(e.target.value)}
                                        className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded-lg text-white text-center"
                                        min="1"
                                    />
                                </div>
                            )}
                            <p className="text-xs text-gray-500 mt-1">
                                {createTimeControlType === 'realtime' ? 'Set base to 0 for unlimited time' : 'A player loses if they do not move within this time.'}
                            </p>
                        </div>

                        <div className="flex items-center gap-2 p-2 bg-gray-800 rounded-lg">
                            <input
                                type="checkbox"
                                id="hostParticipates"
                                checked={hostParticipates}
                                onChange={e => setHostParticipates(e.target.checked)}
                                className="w-4 h-4 text-yellow-600 bg-gray-700 border-gray-600 rounded focus:ring-yellow-500"
                            />
                            <label htmlFor="hostParticipates" className="text-sm font-semibold text-gray-300">
                                Participate as player
                            </label>
                        </div>

                        <div className="flex items-center gap-2 p-2 bg-gray-800 rounded-lg">
                            <input
                                type="checkbox"
                                id="isPrivateTournament"
                                checked={createIsPrivate}
                                onChange={e => setCreateIsPrivate(e.target.checked)}
                                className="w-4 h-4 text-blue-600 bg-gray-700 border-gray-600 rounded focus:ring-blue-500"
                            />
                            <label htmlFor="isPrivateTournament" className="text-sm font-semibold text-gray-300">
                                Private Tournament (only via code)
                            </label>
                        </div>

                        <div className="flex items-center gap-2 p-2 bg-gray-800 rounded-lg">
                            <input
                                type="checkbox"
                                id="isRatedTournament"
                                checked={createIsRated}
                                onChange={e => setCreateIsRated(e.target.checked)}
                                className="w-4 h-4 text-green-600 bg-gray-700 border-gray-600 rounded focus:ring-green-500"
                            />
                            <label htmlFor="isRatedTournament" className="text-sm font-semibold text-gray-300">
                                Rated Tournament (updates player ELO/Glicko)
                            </label>
                        </div>

                        <div className="bg-gray-800 p-3 rounded-lg space-y-2 border border-yellow-900/30">
                            <p className="text-xs font-bold text-yellow-500 uppercase mb-2">Visual Settings (Enforced for all games)</p>
                            <div className="flex items-center justify-between">
                                <label className="text-sm text-gray-300">Show Power Icons</label>
                                <input type="checkbox" checked={createShowPowerPieces} onChange={e => setCreateShowPowerPieces(e.target.checked)} className="w-4 h-4 text-yellow-600 rounded" />
                            </div>
                            <div className="flex items-center justify-between">
                                <label className="text-sm text-gray-300">Show Power Rings</label>
                                <input type="checkbox" checked={createShowPowerRings} onChange={e => setCreateShowPowerRings(e.target.checked)} className="w-4 h-4 text-yellow-600 rounded" />
                            </div>
                            <div className="flex items-center justify-between">
                                <label className="text-sm text-gray-300">Show Original Piece</label>
                                <input type="checkbox" checked={createShowOriginalType} onChange={e => setCreateShowOriginalType(e.target.checked)} className="w-4 h-4 text-yellow-600 rounded" />
                            </div>
                        </div>

                        <div className="flex gap-3 pt-2">
                            <button
                                onClick={() => { setView('list'); setError(null); }}
                                className="flex-1 py-3 bg-gray-700 hover:bg-gray-600 rounded-xl font-bold transition-colors"
                            >
                                Cancel
                            </button>
                            <button
                                onClick={handleCreate}
                                className="flex-1 py-3 bg-gradient-to-r from-yellow-600 to-orange-600 hover:from-yellow-500 hover:to-orange-500 rounded-xl font-bold transition-all"
                            >
                                Create
                            </button>
                        </div>
                    </div>
                </div>
            </div>
        );
    }

    // Tournament lobby / in-progress view
    if (view === 'lobby' && activeTournament) {
        return (
            <div className="min-h-screen bg-gray-900 text-white p-4">
                <div className="max-w-3xl mx-auto">
                    {/* Header */}
                    <div className="flex items-center justify-between mb-4">
                        <div>
                            <h1 className="text-2xl font-bold">{activeTournament.name}</h1>
                            <div className="text-sm text-gray-400">
                                Code: <span className="font-mono text-yellow-400 text-lg">{activeTournament.id}</span>
                                {activeTournament.isPrivate && (
                                    <span className="ml-2 px-2 py-0.5 bg-purple-900/50 text-purple-300 border border-purple-500/50 rounded-full text-[10px] uppercase font-bold">
                                        🔒 Private
                                    </span>
                                )}
                                {' • '}{activeTournament.pairingMode === 'swiss' ? 'Swiss' : 'Manual'}
                                {' • '}{activeTournament.timerSettings ? `${(activeTournament.timerSettings as any).initialTime / 60}+${(activeTournament.timerSettings as any).increment}` : 'Unlimited'}
                            </div>
                        </div>
                        <div className="flex gap-2">
                            {isHost && activeTournament.status === 'lobby' && players.filter(p => p.uid !== userId).length === 0 && (
                                <button
                                    onClick={handleDeleteTournament}
                                    className="px-4 py-2 bg-red-600 hover:bg-red-500 text-white rounded-lg font-semibold transition-colors text-sm"
                                >
                                    Delete
                                </button>
                            )}
                            {myPlayerId && activeTournament.status !== 'finished' && (
                                <button
                                    onClick={handleWithdraw}
                                    className="px-4 py-2 bg-red-900/50 hover:bg-red-800/50 text-red-200 border border-red-700/50 rounded-lg font-semibold transition-colors text-sm"
                                >
                                    Withdraw
                                </button>
                            )}
                            <button
                                onClick={() => {
                                    if (listenerRef.current) listenerRef.current.off();
                                    setActiveTournament(null);
                                    onTournamentJoined(null);
                                    setView('list');
                                    loadTournaments();
                                }}
                                className="px-4 py-2 bg-gray-700 hover:bg-gray-600 rounded-lg font-semibold transition-colors"
                            >
                                ← Back
                            </button>
                        </div>
                    </div>

                    {error && (
                        <div className="mb-4 p-3 bg-red-900/50 border border-red-600 rounded-lg text-red-200 text-sm">{error}</div>
                    )}

                    {/* Status bar */}
                    <div className="mb-4 p-3 rounded-lg bg-gradient-to-r from-gray-800 to-gray-750 border border-gray-700 flex items-center justify-between">
                        <div className="flex items-center gap-3">
                            <span className={`w-3 h-3 rounded-full ${activeTournament.status === 'lobby' ? 'bg-green-500 animate-pulse' : activeTournament.status === 'in_progress' ? 'bg-yellow-500' : 'bg-gray-500'}`} />
                            <span className="font-bold capitalize">{activeTournament.status.replace('_', ' ')}</span>
                        </div>
                        {activeTournament.status === 'in_progress' && (
                            <span className="text-sm text-gray-400">Round {currentRound} / {activeTournament.totalRounds}</span>
                        )}
                    </div>

                    {/* LOBBY: Players list + host controls */}
                    {activeTournament.status === 'lobby' && (
                        <div className="space-y-4">
                            <div className="p-4 bg-gray-800 rounded-xl border border-gray-700">
                                <div className="flex items-center justify-between mb-3">
                                    <h2 className="text-lg font-bold">Players ({players.length})</h2>
                                    {isHost && (
                                        <button
                                            onClick={() => {
                                                const participating = players.some(p => p.uid === userId);
                                                toggleHostParticipation(activeTournament.id, userId, displayName, !participating);
                                            }}
                                            className="text-xs px-2 py-1 bg-gray-700 hover:bg-gray-600 rounded border border-gray-600 font-bold transition-colors"
                                        >
                                            {players.some(p => p.uid === userId) ? '🚶 Leave' : '🎮 Join'}
                                        </button>
                                    )}
                                </div>
                                <div className="space-y-2">
                                    {players.map(p => (
                                        <div key={p.oderId} className="flex items-center justify-between p-2 bg-gray-700 rounded-lg">
                                            <div className="flex items-center gap-2">
                                                <span className="font-semibold">{p.nickname}</span>
                                                {p.uid === activeTournament.hostUid && (
                                                    <span className="text-xs bg-yellow-600 px-2 py-0.5 rounded-full font-bold">HOST</span>
                                                )}
                                                {p.uid === userId && (
                                                    <span className="text-xs bg-blue-600 px-2 py-0.5 rounded-full font-bold">YOU</span>
                                                )}
                                            </div>
                                            {isHost && p.uid !== userId && (
                                                <button
                                                    onClick={() => handleRemovePlayer(p.oderId)}
                                                    className="text-xs px-2 py-1 bg-red-700 hover:bg-red-600 rounded font-bold transition-colors"
                                                >
                                                    Remove
                                                </button>
                                            )}
                                        </div>
                                    ))}
                                </div>
                            </div>

                            {isHost && (
                                <button
                                    onClick={handleStartTournament}
                                    disabled={players.length < 2}
                                    className="w-full py-3 bg-gradient-to-r from-green-600 to-emerald-600 hover:from-green-500 hover:to-emerald-500 rounded-xl text-lg font-bold transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                                >
                                    🚀 Start Tournament ({players.length} players)
                                </button>
                            )}

                            {!isHost && (
                                <div className="text-center text-gray-400 py-4">
                                    Waiting for the host to start the tournament...
                                </div>
                            )}
                        </div>
                    )}

                    {/* IN PROGRESS */}
                    {(activeTournament.status === 'in_progress' || activeTournament.status === 'finished') && (
                        <div className="space-y-4">
                            {/* Standings */}
                            <div className="p-4 bg-gray-800 rounded-xl border border-gray-700">
                                <h2 className="text-lg font-bold mb-3">📊 Standings</h2>
                                <div className="overflow-x-auto">
                                    <table className="w-full text-sm">
                                        <thead>
                                            <tr className="text-gray-400 border-b border-gray-700">
                                                <th className="text-left py-2 px-2">#</th>
                                                <th className="text-left py-2 px-2">Player</th>
                                                <th className="text-center py-2 px-2">Score</th>
                                                <th className="text-center py-2 px-2">Buch.</th>
                                                <th className="text-center py-2 px-2">SB</th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {sortedPlayers.map((p, i) => (
                                                <tr key={p.oderId} className={`border-b border-gray-700/50 ${p.uid === userId ? 'bg-blue-900/30' : ''}`}>
                                                    <td className="py-2 px-2 font-bold text-gray-400">{i + 1}</td>
                                                    <td className="py-2 px-2 font-semibold">
                                                        {p.nickname}
                                                        {p.uid === activeTournament.hostUid && <span className="ml-1 text-yellow-400 text-xs">👑</span>}
                                                    </td>
                                                    <td className="py-2 px-2 text-center font-bold text-yellow-400">{p.score}</td>
                                                    <td className="py-2 px-2 text-center text-gray-400">{p.buchholz?.toFixed(1) || '0.0'}</td>
                                                    <td className="py-2 px-2 text-center text-gray-400">{p.sonnebornBerger?.toFixed(1) || '0.0'}</td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                </div>
                            </div>

                            {/* Pairings for current round or all rounds if finished */}
                            {(activeTournament.status === 'in_progress' || activeTournament.status === 'finished') && (
                                <div className="p-4 bg-gray-800 rounded-xl border border-gray-700">
                                    <h2 className="text-lg font-bold mb-3">
                                        {activeTournament.status === 'finished' ? 'All Pairings' : `Round ${currentRound} Pairings`}
                                    </h2>

                                    {currentPairings.length === 0 ? (
                                        <div className="text-center text-gray-500 py-4">
                                            {isHost ? 'No pairings yet. Generate or add pairings below.' : 'Waiting for pairings...'}
                                        </div>
                                    ) : (
                                        <div className="space-y-2">
                                            {/* If finished, we might want to show all pairings from all rounds. 
                                                But for now, keeping currentRound pairings is fine if we show them in standings too. 
                                                Actually, let's show ALL pairings if finished. */}
                                            {(activeTournament.status === 'finished' ?
                                                Object.values(activeTournament.rounds || {}).flatMap(r => Object.values((r as any).pairings || {})) :
                                                currentPairings
                                            ).map((pairing: any) => (
                                                <div key={pairing.id} className="p-3 bg-gray-700 rounded-lg">
                                                    <div className="flex items-center justify-between">
                                                        <div className="flex items-center gap-2 flex-1 min-w-0">
                                                            <span className="text-white">⬜</span>
                                                            <span className={`font-semibold truncate ${pairing.white === myPlayerId ? 'text-blue-400' : ''}`}>
                                                                {getPlayerName(pairing.white)}
                                                            </span>
                                                            <span className="text-gray-500 mx-1">vs</span>
                                                            <span className={`font-semibold truncate ${pairing.black === myPlayerId ? 'text-blue-400' : ''}`}>
                                                                {getPlayerName(pairing.black)}
                                                            </span>
                                                            <span className="text-gray-800">⬛</span>
                                                        </div>
                                                        <div className="flex items-center gap-2 shrink-0">
                                                            {pairing.status === 'finished' && (
                                                                <div className="flex items-center gap-2">
                                                                    <span className="text-xs font-bold px-2 py-1 bg-gray-600 rounded">
                                                                        {pairing.result}
                                                                    </span>
                                                                    {pairing.gameId && (
                                                                        <button
                                                                            onClick={() => onSpectate(pairing.gameId!)}
                                                                            className="text-xs px-2 py-1 bg-blue-900/50 hover:bg-blue-800/50 text-blue-300 border border-blue-700/50 rounded font-bold transition-colors"
                                                                        >
                                                                            View
                                                                        </button>
                                                                    )}
                                                                </div>
                                                            )}
                                                            {pairing.status === 'playing' && pairing.gameId && (
                                                                <button
                                                                    onClick={() => onSpectate(pairing.gameId!)}
                                                                    className="text-xs px-3 py-1 bg-blue-600 hover:bg-blue-500 rounded font-bold transition-colors"
                                                                >
                                                                    Spectate
                                                                </button>
                                                            )}
                                                            {pairing.status === 'pending' && pairing.black !== 'BYE' && isHost && (
                                                                <button
                                                                    onClick={() => handleStartGame(pairing)}
                                                                    className="text-xs px-3 py-1 bg-green-600 hover:bg-green-500 rounded font-bold transition-colors"
                                                                >
                                                                    Start
                                                                </button>
                                                            )}
                                                            {pairing.status === 'playing' && isHost && (
                                                                <div className="flex gap-1">
                                                                    <button onClick={() => handleSetResult(pairing, '1-0')} className="text-[10px] px-2 py-1 bg-gray-600 hover:bg-gray-500 rounded font-bold">1-0</button>
                                                                    <button onClick={() => handleSetResult(pairing, '0.5-0.5')} className="text-[10px] px-2 py-1 bg-gray-600 hover:bg-gray-500 rounded font-bold">½-½</button>
                                                                    <button onClick={() => handleSetResult(pairing, '0-1')} className="text-[10px] px-2 py-1 bg-gray-600 hover:bg-gray-500 rounded font-bold">0-1</button>
                                                                </div>
                                                            )}
                                                            {/* Players can enter their own game */}
                                                            {pairing.status === 'playing' && pairing.gameId && (pairing.white === myPlayerId || pairing.black === myPlayerId) && (
                                                                <button
                                                                    onClick={() => {
                                                                        const myColor = pairing.white === myPlayerId ? Color.White : Color.Black;
                                                                        onGameStart(pairing.gameId!, myColor);
                                                                    }}
                                                                    className="text-xs px-3 py-1 bg-blue-600 hover:bg-blue-500 rounded font-bold transition-colors"
                                                                >
                                                                    Play
                                                                </button>
                                                            )}
                                                        </div>
                                                    </div>
                                                </div>
                                            ))}
                                        </div>
                                    )}

                                    {/* Host controls */}
                                    {isHost && (
                                        <div className="mt-4 space-y-3 border-t border-gray-600 pt-4">
                                            {activeTournament.pairingMode === 'swiss' && currentPairings.length === 0 && (
                                                <button
                                                    onClick={handleGenerateSwiss}
                                                    className="w-full py-2 bg-yellow-600 hover:bg-yellow-500 rounded-lg font-bold transition-colors"
                                                >
                                                    🔀 Generate Swiss Pairings
                                                </button>
                                            )}

                                            {currentPairings.length > 0 && currentPairings.some(p => p.status === 'pending' && p.black !== 'BYE') && (
                                                <button
                                                    onClick={handleStartAllGames}
                                                    className="w-full py-2 bg-green-600 hover:bg-green-500 rounded-lg font-bold transition-colors"
                                                >
                                                    ▶ Start All Games
                                                </button>
                                            )}

                                            {/* Manual pairing */}
                                            {activeTournament.pairingMode === 'manual' && (
                                                <div className="p-3 bg-gray-700 rounded-lg">
                                                    <div className="text-xs font-bold text-gray-400 mb-2">ADD PAIRING</div>
                                                    <div className="flex gap-2 items-end">
                                                        <div className="flex-1">
                                                            <label className="text-[10px] text-gray-400">White</label>
                                                            <select value={manualWhite} onChange={e => setManualWhite(e.target.value)} className="w-full px-2 py-1 bg-gray-600 rounded text-sm">
                                                                <option value="">Select...</option>
                                                                {players.map(p => <option key={p.oderId} value={p.oderId}>{p.nickname}</option>)}
                                                            </select>
                                                        </div>
                                                        <div className="text-gray-500 text-xs pb-1">vs</div>
                                                        <div className="flex-1">
                                                            <label className="text-[10px] text-gray-400">Black</label>
                                                            <select value={manualBlack} onChange={e => setManualBlack(e.target.value)} className="w-full px-2 py-1 bg-gray-600 rounded text-sm">
                                                                <option value="">Select...</option>
                                                                <option value="BYE">Full BYE (1.0 pt)</option>
                                                                <option value="HALF_BYE">Half BYE (0.5 pt)</option>
                                                                <option value="ZERO_BYE">0 point BYE (0.0 pt)</option>
                                                                {players.filter(p => p.oderId !== manualWhite).map(p => <option key={p.oderId} value={p.oderId}>{p.nickname}</option>)}
                                                            </select>
                                                        </div>
                                                        <button
                                                            onClick={handleAddManualPairing}
                                                            disabled={!manualWhite || !manualBlack || (manualWhite === manualBlack && manualBlack !== 'BYE' && manualBlack !== 'HALF_BYE' && manualBlack !== 'ZERO_BYE')}
                                                            className="px-3 py-1 bg-blue-600 hover:bg-blue-500 rounded font-bold text-sm transition-colors disabled:opacity-50"
                                                        >
                                                            Add
                                                        </button>
                                                    </div>
                                                </div>
                                            )}

                                            {allPairingsFinished && (
                                                <button
                                                    onClick={handleNextRound}
                                                    className={`w-full py-3 rounded-xl text-lg font-bold transition-all ${isLastRound
                                                        ? 'bg-gradient-to-r from-red-600 to-pink-600 hover:from-red-500 hover:to-pink-500'
                                                        : 'bg-gradient-to-r from-blue-600 to-purple-600 hover:from-blue-500 hover:to-purple-500'
                                                        }`}
                                                >
                                                    {isLastRound ? '🏁 Finish Tournament' : `➡ Next Round (${currentRound + 1}/${activeTournament.totalRounds})`}
                                                </button>
                                            )}
                                        </div>
                                    )}
                                </div>
                            )}

                            {/* Tournament finished */}
                            {activeTournament.status === 'finished' && (
                                <div className="p-6 bg-gradient-to-br from-yellow-900/30 to-orange-900/30 rounded-xl border border-yellow-600/50 text-center">
                                    <div className="text-4xl mb-2">🏆</div>
                                    <div className="text-2xl font-bold text-yellow-400 mb-1">Tournament Complete!</div>
                                    {sortedPlayers[0] && (
                                        <div className="text-lg text-gray-300">
                                            Winner: <span className="font-bold text-white">{sortedPlayers[0].nickname}</span> ({sortedPlayers[0].score} pts)
                                        </div>
                                    )}
                                </div>
                            )}

                            {/* Previous rounds - collapsible */}
                            {Object.keys(activeTournament.rounds || {}).length > 0 && (
                                <details className="bg-gray-800 rounded-xl border border-gray-700">
                                    <summary className="p-4 cursor-pointer font-bold text-gray-300 hover:text-white transition-colors">
                                        📜 All Rounds ({Object.keys(activeTournament.rounds).length})
                                    </summary>
                                    <div className="px-4 pb-4 space-y-3">
                                        {Object.entries(activeTournament.rounds || {}).map(([roundNum, round]: [string, any]) => (
                                            <div key={roundNum} className="p-3 bg-gray-700 rounded-lg">
                                                <div className="text-sm font-bold text-gray-300 mb-2">Round {roundNum}</div>
                                                {Object.values((round as TournamentRound).pairings || {}).map((p: TournamentPairing) => (
                                                    <div key={p.id} className="text-sm py-1 flex items-center gap-2">
                                                        <span className={`${p.white === myPlayerId ? 'text-blue-400 font-bold' : ''}`}>{getPlayerName(p.white)}</span>
                                                        <span className="text-gray-500">vs</span>
                                                        <span className={`${p.black === myPlayerId ? 'text-blue-400 font-bold' : ''}`}>{getPlayerName(p.black)}</span>
                                                        <span className="text-xs text-gray-400 ml-auto">{p.result || '...'}</span>
                                                    </div>
                                                ))}
                                            </div>
                                        ))}
                                    </div>
                                </details>
                            )}
                        </div>
                    )}
                </div>
            </div>
        );
    }

    return null;
};

export default Tournament;
