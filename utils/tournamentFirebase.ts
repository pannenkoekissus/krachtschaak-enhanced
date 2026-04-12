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
    isPrivate: boolean = false,
    isRated: boolean = true
): Promise<string> => {
    const id = generateTournamentId();
    const players: Record<string, TournamentPlayer> = {};

    if (hostParticipates) {
        const hostPlayerId = generatePlayerId();
        players[hostPlayerId] = {
            playerId: hostPlayerId,
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
        isRated,
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
        playerId,
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

// Delete a tournament
export const deleteTournament = async (tournamentId: string): Promise<void> => {
    await db.ref(`tournaments/${tournamentId}`).remove();
};

// Set pairings for a round
export const setPairings = async (
    tournamentId: string,
    round: number,
    pairings: TournamentPairing[]
): Promise<void> => {
    const pairingsMap: Record<string, TournamentPairing> = {};
    const scoreUpdates: Record<string, number> = {};

    pairings.forEach(p => {
        pairingsMap[p.id] = p;
        if (p.status === 'finished' && p.result) {
            if (p.result === '1-0') {
                scoreUpdates[p.white] = (scoreUpdates[p.white] || 0) + 1;
            } else if (p.result === '0-1') {
                scoreUpdates[p.black] = (scoreUpdates[p.black] || 0) + 1;
            } else if (p.result === '0.5-0.5') {
                scoreUpdates[p.white] = (scoreUpdates[p.white] || 0) + 0.5;
                if (p.black !== 'BYE') {
                    scoreUpdates[p.black] = (scoreUpdates[p.black] || 0) + 0.5;
                }
            }
        }
    });

    await db.ref(`tournaments/${tournamentId}/rounds/${round}/pairings`).set(pairingsMap);

    // Apply score updates for BYEs or finished games
    if (Object.keys(scoreUpdates).length > 0) {
        const tSnap = await db.ref(`tournaments/${tournamentId}/players`).once('value');
        const players = tSnap.val() || {};
        const updates: Record<string, any> = {};

        Object.entries(scoreUpdates).forEach(([pid, scoreChange]) => {
            if (players[pid]) {
                updates[`tournaments/${tournamentId}/players/${pid}/score`] = (players[pid].score || 0) + scoreChange;
            }
        });

        if (Object.keys(updates).length > 0) {
            await db.ref().update(updates);
            await recalculateTiebreaks(tournamentId);
        }
    }
};

// Update pairing (e.g., set gameId when game starts or set result)
export const updatePairing = async (
    tournamentId: string,
    round: number,
    pairingId: string,
    updates: Partial<TournamentPairing>
): Promise<void> => {
    // If we're setting a result, we should ideally update scores too to be robust, 
    // but we must avoid double-counting if the caller also does it.
    // For now, let's keep it simple as the Swiss BYE issue was specifically in setPairings.
    await db.ref(`tournaments/${tournamentId}/rounds/${round}/pairings/${pairingId}`).update(updates);
};

// Delete a pairing and reverse score changes if finished
export const deletePairing = async (
    tournamentId: string,
    round: number,
    pairingId: string
): Promise<void> => {
    const snap = await db.ref(`tournaments/${tournamentId}/rounds/${round}/pairings/${pairingId}`).once('value');
    const pairing: TournamentPairing = snap.val();
    if (!pairing) return;

    const updates: Record<string, any> = {};
    updates[`tournaments/${tournamentId}/rounds/${round}/pairings/${pairingId}`] = null;

    if (pairing.status === 'finished' && pairing.result) {
        const tSnap = await db.ref(`tournaments/${tournamentId}/players`).once('value');
        const players = tSnap.val() || {};

        if (pairing.result === '1-0') {
            if (players[pairing.white]) {
                updates[`tournaments/${tournamentId}/players/${pairing.white}/score`] = Math.max(0, (players[pairing.white].score || 0) - 1);
            }
        } else if (pairing.result === '0-1') {
            if (pairing.black !== 'BYE' && players[pairing.black]) {
                updates[`tournaments/${tournamentId}/players/${pairing.black}/score`] = Math.max(0, (players[pairing.black].score || 0) - 1);
            }
        } else if (pairing.result === '0.5-0.5') {
            if (players[pairing.white]) {
                updates[`tournaments/${tournamentId}/players/${pairing.white}/score`] = Math.max(0, (players[pairing.white].score || 0) - 0.5);
            }
            if (pairing.black !== 'BYE' && players[pairing.black]) {
                updates[`tournaments/${tournamentId}/players/${pairing.black}/score`] = Math.max(0, (players[pairing.black].score || 0) - 0.5);
            }
        }
    }

    await db.ref().update(updates);
    await recalculateTiebreaks(tournamentId);
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

export const listActiveTournaments = async (userId?: string): Promise<TournamentData[]> => {
    const snap = await db.ref('tournaments').once('value');
    const data = snap.val() || {};
    return Object.values(data).filter((t: any) => {
        if (t.status === 'finished') return false;
        if (!t.isPrivate) return true;
        if (userId && t.hostUid === userId) return true;
        // Also include if I am a player in it
        return userId && t.players && Object.values(t.players).some((p: any) => p.uid === userId);
    }) as TournamentData[];
};

// List tournament history for a user (finished tournaments they participated in or hosted)
export const listTournamentHistory = async (userId: string): Promise<TournamentData[]> => {
    const snap = await db.ref('tournaments').once('value');
    const data = snap.val() || {};
    return Object.values(data).filter((t: any) => {
        if (t.status !== 'finished') return false;
        const isHost = t.hostUid === userId;
        const isPlayer = t.players && Object.values(t.players).some((p: any) => p.uid === userId);
        return isHost || isPlayer;
    }) as TournamentData[];
};

// List all public finished tournaments
export const listPublicTournamentHistory = async (): Promise<TournamentData[]> => {
    const snap = await db.ref('tournaments').orderByChild('status').equalTo('finished').once('value');
    const data = snap.val() || {};
    return Object.values(data).filter((t: any) => !t.isPrivate) as TournamentData[];
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
            playerId: newPlayerId,
            uid: hostUid,
            nickname: hostName,
            score: 0,
            buchholz: 0,
            sonnebornBerger: 0,
            joinedAt: Date.now()
        });
    } else if (!shouldParticipate && existingPlayer) {
        // Remove host from players
        await db.ref(`tournaments/${tournamentId}/players/${existingPlayer.playerId}`).remove();
    }
};

// Swiss pairing algorithm
export const generateSwissPairings = (
    players: TournamentPlayer[],
    previousRounds: Record<number, TournamentRound>
): TournamentPairing[] => {
    // Collect stats: who has played whom, color balance, byes
    const playedAgainst: Record<string, Set<string>> = {};
    const colorBalance: Record<string, number> = {}; // +1 for White, -1 for Black
    const byesReceived: Record<string, number> = {};

    players.forEach(p => {
        playedAgainst[p.playerId] = new Set();
        colorBalance[p.playerId] = 0;
        byesReceived[p.playerId] = 0;
    });

    Object.values(previousRounds || {}).forEach(round => {
        Object.values(round.pairings || {}).forEach(pairing => {
            if (pairing.black === 'BYE') {
                if (byesReceived[pairing.white] !== undefined) byesReceived[pairing.white]++;
            } else {
                if (playedAgainst[pairing.white]) playedAgainst[pairing.white].add(pairing.black);
                if (playedAgainst[pairing.black]) playedAgainst[pairing.black].add(pairing.white);
                if (colorBalance[pairing.white] !== undefined) colorBalance[pairing.white]++;
                if (colorBalance[pairing.black] !== undefined) colorBalance[pairing.black]--;
            }
        });
    });

    // Sort by score descending, then by join order
    let available = [...players].sort((a, b) => {
        if (b.score !== a.score) return b.score - a.score;
        return a.joinedAt - b.joinedAt;
    });

    const pairings: TournamentPairing[] = [];

    // Handle BYE if odd number of players
    if (available.length % 2 !== 0) {
        // Find candidate for BYE: lowest score, and hasn't had a bye (or fewer byes)
        // Rule: 1 bye per player unless everyone has had one
        const minByes = Math.min(...available.map(p => byesReceived[p.playerId]));

        // Candidates are those with minByes
        const byeCandidates = available.filter(p => byesReceived[p.playerId] === minByes);
        // Take the one with lowest score (end of sorted list) among candidates
        const byePlayer = byeCandidates[byeCandidates.length - 1];

        const pairingId = generatePlayerId();
        pairings.push({
            id: pairingId,
            white: byePlayer.playerId,
            black: 'BYE',
            gameId: null,
            result: '1-0',
            status: 'finished'
        });

        // Remove from available
        available = available.filter(p => p.playerId !== byePlayer.playerId);
    }

    const paired = new Set<string>();

    // Explicitly track match counts to find who was played LEAST against
    const matchCounts: Record<string, Record<string, number>> = {};
    players.forEach(p => matchCounts[p.playerId] = {});

    Object.values(previousRounds || {}).forEach(round => {
        Object.values(round.pairings || {}).forEach(pairing => {
            if (pairing.black !== 'BYE') {
                matchCounts[pairing.white][pairing.black] = (matchCounts[pairing.white][pairing.black] || 0) + 1;
                matchCounts[pairing.black][pairing.white] = (matchCounts[pairing.black][pairing.white] || 0) + 1;
            }
        });
    });

    for (let i = 0; i < available.length; i++) {
        const p1 = available[i];
        if (paired.has(p1.playerId)) continue;

        let bestMatch: TournamentPlayer | null = null;
        let minPlayCount = Infinity;

        // Greedy search for an opponent among the remaining players
        for (let j = i + 1; j < available.length; j++) {
            const p2 = available[j];
            if (paired.has(p2.playerId)) continue;

            const count = matchCounts[p1.playerId][p2.playerId] || 0;

            // Priority 1: High priority if they have NEVER played (count === 0)
            if (count === 0) {
                bestMatch = p2;
                break; // Swiss rule: take closest rank among fresh opponents
            }

            // Priority 2: If we must rematch, find the one with the lowest count
            if (count < minPlayCount) {
                minPlayCount = count;
                bestMatch = p2;
            }
        }

        if (bestMatch) {
            const pairingId = generatePlayerId();

            let p1White = Math.random() < 0.5;
            const bal1 = colorBalance[p1.playerId] || 0;
            const bal2 = colorBalance[bestMatch.playerId] || 0;

            if (bal1 > bal2) {
                p1White = false;
            } else if (bal2 > bal1) {
                p1White = true;
            }

            pairings.push({
                id: pairingId,
                white: p1White ? p1.playerId : bestMatch.playerId,
                black: p1White ? bestMatch.playerId : p1.playerId,
                gameId: null,
                result: null,
                status: 'pending'
            });
            paired.add(p1.playerId);
            paired.add(bestMatch.playerId);
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
