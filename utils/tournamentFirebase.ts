import { db, auth } from '../firebaseConfig';
import {
    TournamentData, TournamentPlayer, TournamentPairing, TournamentRound,
    TimerSettings, PairingMode, PairingResult
} from '../types';

// Generate a short readable ID
export const generateTournamentId = (): string => {
    return Math.random().toString(36).substring(2, 8).toUpperCase();
};

const generatePlayerId = (): string => {
    return Date.now().toString(36) + Math.random().toString(36).substring(2, 6);
};

export const createTournament = async (
    name: string,
    hostUid: string,
    hostName: string,
    timerSettings: TimerSettings,
    pairingMode: PairingMode,
    totalRounds: number,
    hostParticipates: boolean = true,
    visualSettings?: { showPowerPieces: boolean, showPowerRings: boolean, showOriginalType: boolean },
    isPrivate: boolean = false
): Promise<string> => {
    const id = generateTournamentId();
    const players: Record<string, TournamentPlayer> = {};

    if (hostParticipates) {
        const hostPlayerId = generatePlayerId();
        players[hostPlayerId] = {
            oderId: hostPlayerId,
            uid: hostUid,
            nickname: hostName,
            score: 0,
            buchholz: 0,
            sonnebornBerger: 0,
            joinedAt: Date.now()
        };
    }

    const tournament: TournamentData = {
        id,
        name,
        hostUid,
        hostName,
        status: 'lobby',
        timerSettings,
        currentRound: 0,
        totalRounds,
        pairingMode,
        isPrivate,
        createdAt: Date.now(),
        players,
        rounds: {},
        showPowerPieces: visualSettings?.showPowerPieces ?? true,
        showPowerRings: visualSettings?.showPowerRings ?? true,
        showOriginalType: visualSettings?.showOriginalType ?? true
    };

    await db.ref(`tournaments/${id}`).set(tournament);
    return id;
};

// Join a tournament
export const joinTournament = async (
    tournamentId: string,
    nickname: string,
    uid: string
): Promise<string> => {
    const playerId = generatePlayerId();
    const player: TournamentPlayer = {
        oderId: playerId,
        uid,
        nickname,
        score: 0,
        buchholz: 0,
        sonnebornBerger: 0,
        joinedAt: Date.now()
    };

    await db.ref(`tournaments/${tournamentId}/players/${playerId}`).set(player);
    return playerId;
};

// Remove a player from a tournament (host only)
export const removePlayer = async (
    tournamentId: string,
    playerId: string
): Promise<void> => {
    await db.ref(`tournaments/${tournamentId}/players/${playerId}`).remove();
};

// Start the tournament (set status to in_progress, create round 1)
export const startTournament = async (tournamentId: string): Promise<void> => {
    await db.ref(`tournaments/${tournamentId}`).update({
        status: 'in_progress',
        currentRound: 1
    });
};

// End a tournament
export const endTournament = async (tournamentId: string): Promise<void> => {
    await db.ref(`tournaments/${tournamentId}/status`).set('finished');
};

// Set pairings for a round
export const setPairings = async (
    tournamentId: string,
    round: number,
    pairings: TournamentPairing[]
): Promise<void> => {
    const pairingsMap: Record<string, TournamentPairing> = {};
    pairings.forEach(p => { pairingsMap[p.id] = p; });
    await db.ref(`tournaments/${tournamentId}/rounds/${round}/pairings`).set(pairingsMap);
};

// Update pairing (e.g., set gameId when game starts or set result)
export const updatePairing = async (
    tournamentId: string,
    round: number,
    pairingId: string,
    updates: Partial<TournamentPairing>
): Promise<void> => {
    await db.ref(`tournaments/${tournamentId}/rounds/${round}/pairings/${pairingId}`).update(updates);
};

// Update player score
export const updatePlayerScore = async (
    tournamentId: string,
    playerId: string,
    scoreChange: number
): Promise<void> => {
    const ref = db.ref(`tournaments/${tournamentId}/players/${playerId}/score`);
    const snap = await ref.once('value');
    const current = snap.val() || 0;
    await ref.set(current + scoreChange);
};

// Advance to next round
export const advanceRound = async (tournamentId: string): Promise<void> => {
    const snap = await db.ref(`tournaments/${tournamentId}/currentRound`).once('value');
    const current = snap.val() || 1;
    await db.ref(`tournaments/${tournamentId}/currentRound`).set(current + 1);
};

// Get tournament data once
export const getTournament = async (tournamentId: string): Promise<TournamentData | null> => {
    const snap = await db.ref(`tournaments/${tournamentId}`).once('value');
    return snap.val();
};

// List active tournaments - public ones ONLY
export const listActiveTournaments = async (): Promise<TournamentData[]> => {
    const snap = await db.ref('tournaments').orderByChild('status').once('value');
    const data = snap.val() || {};
    return Object.values(data).filter((t: any) => t.status !== 'finished' && !t.isPrivate) as TournamentData[];
};

// Toggle host participation during lobby
export const toggleHostParticipation = async (tournamentId: string, hostUid: string, hostName: string, shouldParticipate: boolean): Promise<void> => {
    const tSnap = await db.ref(`tournaments/${tournamentId}`).once('value');
    const tData: TournamentData = tSnap.val();
    if (!tData || tData.status !== 'lobby') return;

    const existingPlayer = Object.values(tData.players || {}).find(p => p.uid === hostUid);

    if (shouldParticipate && !existingPlayer) {
        // Add host as player
        const newPlayerId = Date.now().toString(36) + Math.random().toString(36).substring(2, 6);
        await db.ref(`tournaments/${tournamentId}/players/${newPlayerId}`).set({
            oderId: newPlayerId,
            uid: hostUid,
            nickname: hostName,
            score: 0,
            buchholz: 0,
            sonnebornBerger: 0,
            joinedAt: Date.now()
        });
    } else if (!shouldParticipate && existingPlayer) {
        // Remove host from players
        await db.ref(`tournaments/${tournamentId}/players/${existingPlayer.oderId}`).remove();
    }
};

// Swiss pairing algorithm
export const generateSwissPairings = (
    players: TournamentPlayer[],
    previousRounds: Record<number, TournamentRound>
): TournamentPairing[] => {
    // Collect who has played whom
    const playedAgainst: Record<string, Set<string>> = {};
    players.forEach(p => { playedAgainst[p.oderId] = new Set(); });

    Object.values(previousRounds || {}).forEach(round => {
        Object.values(round.pairings || {}).forEach(pairing => {
            if (playedAgainst[pairing.white]) playedAgainst[pairing.white].add(pairing.black);
            if (playedAgainst[pairing.black]) playedAgainst[pairing.black].add(pairing.white);
        });
    });

    // Sort by score descending, then by join order
    const sorted = [...players].sort((a, b) => {
        if (b.score !== a.score) return b.score - a.score;
        return a.joinedAt - b.joinedAt;
    });

    const paired = new Set<string>();
    const pairings: TournamentPairing[] = [];

    for (let i = 0; i < sorted.length; i++) {
        const p1 = sorted[i];
        if (paired.has(p1.oderId)) continue;

        let bestMatch: TournamentPlayer | null = null;
        for (let j = i + 1; j < sorted.length; j++) {
            const p2 = sorted[j];
            if (paired.has(p2.oderId)) continue;
            // Avoid rematches if possible
            if (!playedAgainst[p1.oderId]?.has(p2.oderId)) {
                bestMatch = p2;
                break;
            }
        }

        // If no fresh opponent, pair with closest available
        if (!bestMatch) {
            for (let j = i + 1; j < sorted.length; j++) {
                if (!paired.has(sorted[j].oderId)) {
                    bestMatch = sorted[j];
                    break;
                }
            }
        }

        if (bestMatch) {
            // Alternate colors - simple approach: random for first round, then try to balance
            const pairingId = generatePlayerId();
            const whiteFirst = Math.random() < 0.5;
            pairings.push({
                id: pairingId,
                white: whiteFirst ? p1.oderId : bestMatch.oderId,
                black: whiteFirst ? bestMatch.oderId : p1.oderId,
                gameId: null,
                result: null,
                status: 'pending'
            });
            paired.add(p1.oderId);
            paired.add(bestMatch.oderId);
        }
        // If odd number and no match, this player gets a bye (auto 1-0)
        else if (!paired.has(p1.oderId)) {
            const pairingId = generatePlayerId();
            pairings.push({
                id: pairingId,
                white: p1.oderId,
                black: 'BYE',
                gameId: null,
                result: '1-0',
                status: 'finished'
            });
            paired.add(p1.oderId);
        }
    }

    return pairings;
};

// Recalculate tiebreak scores for all players
export const recalculateTiebreaks = async (tournamentId: string): Promise<void> => {
    const snap = await db.ref(`tournaments/${tournamentId}`).once('value');
    const tournament: TournamentData = snap.val();
    if (!tournament) return;

    const players = tournament.players || {};
    const rounds = tournament.rounds || {};

    // Build opponent + result maps
    const opponents: Record<string, { opponentId: string, result: PairingResult }[]> = {};
    Object.keys(players).forEach(pid => { opponents[pid] = []; });

    Object.values(rounds).forEach(round => {
        Object.values(round.pairings || {}).forEach(pairing => {
            if (pairing.black === 'BYE' || !pairing.result) return;
            opponents[pairing.white]?.push({ opponentId: pairing.black, result: pairing.result });
            // Invert result for black
            const invertedResult: PairingResult = pairing.result === '1-0' ? '0-1' : pairing.result === '0-1' ? '1-0' : pairing.result;
            opponents[pairing.black]?.push({ opponentId: pairing.white, result: invertedResult });
        });
    });

    const updates: Record<string, any> = {};

    Object.keys(players).forEach(pid => {
        let buchholz = 0;
        let sb = 0;

        (opponents[pid] || []).forEach(({ opponentId, result }) => {
            const oppScore = players[opponentId]?.score || 0;
            buchholz += oppScore;

            if (result === '1-0') sb += oppScore;         // won: add full opponent score
            else if (result === '0.5-0.5') sb += oppScore * 0.5; // draw: add half
            // loss: add 0
        });

        updates[`tournaments/${tournamentId}/players/${pid}/buchholz`] = buchholz;
        updates[`tournaments/${tournamentId}/players/${pid}/sonnebornBerger`] = sb;
    });

    await db.ref().update(updates);
};
