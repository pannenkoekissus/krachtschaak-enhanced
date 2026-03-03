import React, { useState, useEffect, useRef } from 'react';
import { db, auth } from '../firebaseConfig';
import {
    TournamentData, TournamentPlayer, TournamentPairing, TournamentRound,
    TimerSettings, PairingMode, Color, GameState, PlayerInfo
} from '../types';
import {
    createTournament, joinTournament, removePlayer,
    startTournament, endTournament, setPairings, updatePairing,
    updatePlayerScore, advanceRound, getTournament,
    listActiveTournaments, generateSwissPairings, recalculateTiebreaks
} from '../utils/tournamentFirebase';
import { createInitialBoard } from '../utils/game';
import { getRatingCategory } from '../utils/ratings';

interface TournamentProps {
    userId: string;
    displayName: string;
    onBack: () => void;
    onGameStart: (gameId: string, playerColor: Color) => void;
    getInitialGameState: (mode: 'online_playing', settings: TimerSettings, dontLoad: boolean, isRated: boolean) => GameState;
    myRatings: any;
    activeTournamentId?: string | null;
    onTournamentJoined: (id: string | null) => void;
}

type View = 'list' | 'create' | 'lobby';

const Tournament: React.FC<TournamentProps> = ({
    userId, displayName, onBack, onGameStart, getInitialGameState, myRatings,
    activeTournamentId, onTournamentJoined
}) => {
    const [view, setView] = useState<View>('list');
    const [tournaments, setTournaments] = useState<TournamentData[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    // Create form
    const [createName, setCreateName] = useState('');
    const [createPairingMode, setCreatePairingMode] = useState<PairingMode>('swiss');
    const [createRounds, setCreateRounds] = useState('3');
    const [createBaseMinutes, setCreateBaseMinutes] = useState('10');
    const [createIncrement, setCreateIncrement] = useState('0');

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
    }, [activeTournamentId]);

    const loadTournaments = async () => {
        try {
            setLoading(true);
            const list = await listActiveTournaments();
            setTournaments(list);
        } catch (err) {
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
                // Find my player ID
                const players = data.players || {};
                const myEntry = Object.values(players).find((p: any) => p.uid === userId);
                if (myEntry) setMyPlayerId((myEntry as TournamentPlayer).oderId);
            }
        });
        listenerRef.current = ref;
    };

    useEffect(() => {
        return () => {
            if (listenerRef.current) listenerRef.current.off();
        };
    }, []);

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
            const baseTime = (parseFloat(createBaseMinutes) || 0) * 60;
            const inc = parseInt(createIncrement) || 0;
            const settings: TimerSettings = baseTime > 0 ? { initialTime: baseTime, increment: inc } : null;
            const rounds = parseInt(createRounds) || 3;

            const id = await createTournament(createName.trim(), userId, displayName, settings, createPairingMode, rounds);
            onTournamentJoined(id);
            subscribeToTournament(id);
            setView('lobby');
        } catch (err: any) {
            setError(err.message);
        }
    };

    // Handle join
    const handleJoin = async (tournamentId?: string) => {
        const id = (tournamentId || joinCode).trim().toUpperCase();
        if (!id) { setError('Enter a tournament code'); return; }
        try {
            setError(null);
            // Check if tournament exists
            const t = await getTournament(id);
            if (!t) { setError('Tournament not found'); return; }
            if (t.status !== 'lobby') { setError('Tournament already started'); return; }

            // Check if already joined
            const existing = Object.values(t.players || {}).find((p: any) => p.uid === userId);
            if (existing) {
                // Already in, just subscribe
                onTournamentJoined(id);
                subscribeToTournament(id);
                setView('lobby');
                return;
            }

            await joinTournament(id, displayName, userId);
            onTournamentJoined(id);
            subscribeToTournament(id);
            setView('lobby');
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

    // Host: add manual pairing
    const handleAddManualPairing = async () => {
        if (!activeTournament || !manualWhite || !manualBlack || manualWhite === manualBlack) return;
        const pairingId = Date.now().toString(36) + Math.random().toString(36).substring(2, 6);
        const newPairing: TournamentPairing = {
            id: pairingId,
            white: manualWhite,
            black: manualBlack,
            gameId: null,
            result: null,
            status: 'pending'
        };
        const existingPairings = [...currentPairings, newPairing];
        await setPairings(activeTournament.id, currentRound, existingPairings);
        setManualWhite('');
        setManualBlack('');
    };

    // Host: start a specific game
    const handleStartGame = async (pairing: TournamentPairing) => {
        if (!activeTournament || pairing.status !== 'pending') return;

        const whitePlayer = activeTournament.players[pairing.white];
        const blackPlayer = activeTournament.players[pairing.black];
        if (!whitePlayer || !blackPlayer) return;

        // Create a game in Firebase
        const newGameRef = db.ref('games').push();
        const gameId = newGameRef.key;
        if (!gameId) return;

        const initialState = getInitialGameState('online_playing', activeTournament.timerSettings, true, false);

        const whiteInfo: PlayerInfo = {
            uid: whitePlayer.uid, displayName: whitePlayer.nickname,
            disconnectTimestamp: null, ratings: myRatings || {}
        };
        const blackInfo: PlayerInfo = {
            uid: blackPlayer.uid, displayName: blackPlayer.nickname,
            disconnectTimestamp: null, ratings: myRatings || {}
        };

        initialState.players[whitePlayer.uid] = whiteInfo;
        initialState.players[blackPlayer.uid] = blackInfo;
        initialState.playerColors = { white: whitePlayer.uid, black: blackPlayer.uid };
        initialState.status = 'playing';
        initialState.isRated = false;
        // Tag it as a tournament game
        (initialState as any).tournamentId = activeTournament.id;
        (initialState as any).tournamentRound = currentRound;
        (initialState as any).tournamentPairingId = pairing.id;

        await newGameRef.set(initialState);
        await db.ref(`userGames/${whitePlayer.uid}/${gameId}`).set(true);
        await db.ref(`userGames/${blackPlayer.uid}/${gameId}`).set(true);

        // Update pairing
        await updatePairing(activeTournament.id, currentRound, pairing.id, {
            gameId,
            status: 'playing'
        });

        // If I'm one of the players, enter the game
        if (whitePlayer.uid === userId) {
            onGameStart(gameId, Color.White);
        } else if (blackPlayer.uid === userId) {
            onGameStart(gameId, Color.Black);
        }
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

        // Update scores
        if (result === '1-0') {
            await updatePlayerScore(activeTournament.id, pairing.white, 1);
            if (pairing.black !== 'BYE') await updatePlayerScore(activeTournament.id, pairing.black, 0);
        } else if (result === '0-1') {
            await updatePlayerScore(activeTournament.id, pairing.white, 0);
            await updatePlayerScore(activeTournament.id, pairing.black, 1);
        } else {
            await updatePlayerScore(activeTournament.id, pairing.white, 0.5);
            await updatePlayerScore(activeTournament.id, pairing.black, 0.5);
        }

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

    // Host: remove a player
    const handleRemovePlayer = async (playerId: string) => {
        if (!activeTournament) return;
        await removePlayer(activeTournament.id, playerId);
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
                        <h2 className="text-lg font-bold mb-3">Join Tournament</h2>
                        <div className="flex gap-2">
                            <input
                                type="text"
                                value={joinCode}
                                onChange={e => setJoinCode(e.target.value.toUpperCase())}
                                placeholder="Enter code (e.g. AB12CD)"
                                className="flex-1 px-3 py-2 bg-gray-700 border border-gray-600 rounded-lg text-white placeholder-gray-400 uppercase tracking-widest text-center font-mono text-lg"
                                maxLength={6}
                            />
                            <button
                                onClick={() => handleJoin()}
                                className="px-6 py-2 bg-green-600 hover:bg-green-500 rounded-lg font-bold transition-colors"
                            >
                                Join
                            </button>
                        </div>
                    </div>

                    {/* Create button */}
                    <button
                        onClick={() => setView('create')}
                        className="w-full mb-6 py-3 bg-gradient-to-r from-yellow-600 to-orange-600 hover:from-yellow-500 hover:to-orange-500 rounded-xl text-lg font-bold transition-all transform hover:scale-[1.02] shadow-lg"
                    >
                        + Create Tournament
                    </button>

                    {/* Active tournaments */}
                    <h2 className="text-lg font-bold mb-3 text-gray-300">Active Tournaments</h2>
                    {loading ? (
                        <div className="text-center text-gray-500 py-8">Loading...</div>
                    ) : tournaments.length === 0 ? (
                        <div className="text-center text-gray-500 py-8">No active tournaments</div>
                    ) : (
                        <div className="space-y-3">
                            {tournaments.map(t => (
                                <div key={t.id} className="p-4 bg-gray-800 rounded-xl border border-gray-700 hover:border-gray-600 transition-colors">
                                    <div className="flex items-center justify-between">
                                        <div>
                                            <div className="font-bold text-lg">{t.name}</div>
                                            <div className="text-sm text-gray-400">
                                                Host: {t.hostName} • {Object.keys(t.players || {}).length} players • {t.pairingMode === 'swiss' ? 'Swiss' : 'Manual'} • {t.status === 'lobby' ? '🟢 Open' : '🟡 In Progress'}
                                            </div>
                                            <div className="text-xs text-gray-500 mt-1 font-mono">Code: {t.id}</div>
                                        </div>
                                        <button
                                            onClick={() => handleJoin(t.id)}
                                            className="px-4 py-2 bg-blue-600 hover:bg-blue-500 rounded-lg font-semibold transition-colors"
                                        >
                                            {t.status === 'lobby' ? 'Join' : 'View'}
                                        </button>
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}
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
                            <p className="text-xs text-gray-500 mt-1">Set base to 0 for unlimited time</p>
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
                                {' • '}{activeTournament.pairingMode === 'swiss' ? 'Swiss' : 'Manual'}
                                {' • '}{activeTournament.timerSettings ? `${(activeTournament.timerSettings as any).initialTime / 60}+${(activeTournament.timerSettings as any).increment}` : 'Unlimited'}
                            </div>
                        </div>
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
                            ← Leave
                        </button>
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
                                <h2 className="text-lg font-bold mb-3">Players ({players.length})</h2>
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

                            {/* Current round pairings */}
                            {activeTournament.status === 'in_progress' && (
                                <div className="p-4 bg-gray-800 rounded-xl border border-gray-700">
                                    <h2 className="text-lg font-bold mb-3">Round {currentRound} Pairings</h2>

                                    {currentPairings.length === 0 ? (
                                        <div className="text-center text-gray-500 py-4">
                                            {isHost ? 'No pairings yet. Generate or add pairings below.' : 'Waiting for pairings...'}
                                        </div>
                                    ) : (
                                        <div className="space-y-2">
                                            {currentPairings.map(pairing => (
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
                                                                <span className="text-xs font-bold px-2 py-1 bg-gray-600 rounded">
                                                                    {pairing.result}
                                                                </span>
                                                            )}
                                                            {pairing.status === 'playing' && (
                                                                <span className="text-xs font-bold px-2 py-1 bg-yellow-600 rounded animate-pulse">
                                                                    Playing
                                                                </span>
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
                                                                {players.map(p => <option key={p.oderId} value={p.oderId}>{p.nickname}</option>)}
                                                            </select>
                                                        </div>
                                                        <button
                                                            onClick={handleAddManualPairing}
                                                            disabled={!manualWhite || !manualBlack || manualWhite === manualBlack}
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
