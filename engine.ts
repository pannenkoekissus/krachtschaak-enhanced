import { BoardState, Position, Move, PieceType, Color, Piece } from './types';
import { getValidMoves, applyMoveToBoard, isPowerMove, findKingPosition, getNotation } from './utils/game';

// Waardebepaling van stukken (centipawns)
const PIECE_VALUES = {
    [PieceType.Pawn]: 100,
    [PieceType.Knight]: 290,
    [PieceType.Bishop]: 320,
    [PieceType.Rook]: 500,
    [PieceType.Queen]: 900,
    [PieceType.King]: 200000000
};

// Extra waarde voor een stuk dat een kracht bezit
const POWER_BONUS = 50;

// Transposition table voor caching van vorige analyseresultaten
interface TranspositionEntry {
    bestMove: any;
    depth: number;
    timestamp: number;
}

const TRANSPOSITION_TABLE = new Map<string, TranspositionEntry>();
const MAX_TRANSPOSITION_SIZE = 10000;

const generateBoardHash = (board: BoardState): string => {
    let hash = '';
    for (let r = 0; r < 8; r++) {
        for (let c = 0; c < 8; c++) {
            const piece = board[r][c];
            if (piece) {
                hash += `${r}${c}${piece.type}${piece.color}${piece.power || 'n'}`;
            }
        }
    }
    return hash;
};

const COMBINATION_BONUSES: Record<PieceType, Partial<Record<PieceType, number>>> = {
    [PieceType.Pawn]: {
        [PieceType.Knight]: 60,  // Handig voor korte sprongen
        [PieceType.Bishop]: 70,  // Sterk voor diagonale promotie-dreiging
        [PieceType.Rook]: 100,    // Zeer sterk voor verre promotie
        [PieceType.Queen]: 250,  // Extreem gevaarlijk
    },
    [PieceType.Knight]: {
        [PieceType.Pawn]: 20,
        [PieceType.Bishop]: 130,
        [PieceType.Rook]: 180,
        [PieceType.Queen]: 250,  // "Dame-Paard": de krachtigste combinatie
    },
    [PieceType.Bishop]: {
        [PieceType.Pawn]: 10,
        [PieceType.Knight]: 110,
        [PieceType.Rook]: 200,   // "Toren-Loper": dekt het hele bord
        [PieceType.Queen]: 200,
    },
    [PieceType.Rook]: {
        [PieceType.Pawn]: 20,
        [PieceType.Knight]: 130, // Zeer onvoorspelbaar en sterk
        [PieceType.Bishop]: 160,
        [PieceType.Queen]: 160,
    },
    [PieceType.Queen]: {
        [PieceType.Pawn]: 5,
        [PieceType.Knight]: 120, // "Paard-Dame": de absolute koning van het bord (Artikel 6.1)
    },
    [PieceType.King]: {
        [PieceType.Pawn]: 20,
        [PieceType.Knight]: 70, // Cruciaal om uit schaak te springen (Artikel 4.1)
        [PieceType.Bishop]: 60,
        [PieceType.Rook]: 100,
        [PieceType.Queen]: 150,  // Maakt de koning bijna onvangbaar
    }
};

export default class KrachtschaakAI {
    // Flag for cooperative cancellation when running in a worker
    static shouldStop: boolean = false;

    static resetStopFlag() {
        this.shouldStop = false;
    }

    /**
     * Iteratieve deepening: vindt stap voor stap diepere beste zetten
     * en roept callback aan na elke stap zodat UI kan updaten
     */
    static async getBestMoveIterative(
        board: BoardState,
        turn: Color,
        maxDepth: number = 3,
        onUpdate?: (move: any, depth: number) => void
    ): Promise<any> {
        let bestMove = null;

        for (let depth = 1; depth <= maxDepth; depth++) {
            bestMove = this.getBestMove(board, turn, depth);
            if (bestMove && onUpdate) {
                onUpdate(bestMove, depth);
            }
            // Geef control terug aan UI thread
            await new Promise(resolve => setTimeout(resolve, 0));
        }

        return bestMove;
    }

    /**
     * De hoofdinterface: geeft de beste zet terug voor de huidige speler.
     */
    static getBestMove(board: BoardState, turn: Color, depth: number = 3) {
        const boardHash = generateBoardHash(board);
        const cached = TRANSPOSITION_TABLE.get(boardHash);
        
        const moves = this.getAllLegalMoves(board, turn);
        if (moves.length === 0) return null;

        // Sorteer zetten: cached best move eerst voor beter prunen
        let bestMoveFromCache = null;
        if (cached && cached.depth >= depth) {
            bestMoveFromCache = cached.bestMove;
        }

        let bestMove = null;
        let bestValue = turn === Color.White ? -Infinity : Infinity;

        // Probeer eerst de cached best move
        const sortedMoves = bestMoveFromCache 
            ? [bestMoveFromCache, ...moves.filter(m => m.notation !== bestMoveFromCache.notation)]
            : moves;

        for (const move of sortedMoves) {
            const nextBoard = applyMoveToBoard(board, move);
            const boardValue = this.minimax(nextBoard, depth - 1, -Infinity, Infinity, turn === Color.Black);

            if (turn === Color.White) {
                if (boardValue > bestValue) {
                    bestValue = boardValue;
                    bestMove = move;
                }
            } else {
                if (boardValue < bestValue) {
                    bestValue = boardValue;
                    bestMove = move;
                }
            }
        }

        // Cache het resultaat
        if (bestMove) {
            if (TRANSPOSITION_TABLE.size >= MAX_TRANSPOSITION_SIZE) {
                // Verwijder oudste entry
                let oldestKey: string | null = null;
                let oldestTime = Date.now();
                for (const [key, entry] of TRANSPOSITION_TABLE.entries()) {
                    if (entry.timestamp < oldestTime) {
                        oldestTime = entry.timestamp;
                        oldestKey = key;
                    }
                }
                if (oldestKey) TRANSPOSITION_TABLE.delete(oldestKey);
            }
            TRANSPOSITION_TABLE.set(boardHash, { bestMove, depth, timestamp: Date.now() });
        }

        return bestMove;
    }

    private static minimax(board: BoardState, depth: number, alpha: number, beta: number, isMaximizing: boolean): number {
        if (this.shouldStop) return this.evaluateBoard(board);
        if (depth === 0) return this.evaluateBoard(board);

        const turn = isMaximizing ? Color.White : Color.Black;
        const moves = this.getAllLegalMoves(board, turn);

        if (moves.length === 0) return isMaximizing ? -15000 : 15000;

        moves.sort((a, b) => {
            let scoreA = 0;
            let scoreB = 0;

            // Prioriteit 1: Slaan (Capture) - Artikel 2.1
            if (a.captured) scoreA += (100 + PIECE_VALUES[board[a.to.row][a.to.col].type]);
            if (b.captured) scoreB += (100 + PIECE_VALUES[board[b.to.row][b.to.col].type]);

            return scoreB - scoreA;
        });

        if (isMaximizing) {
            let maxEval = -Infinity;
            for (const move of moves) {
                if (this.shouldStop) break;
                const ev = this.minimax(applyMoveToBoard(board, move), depth - 1, alpha, beta, false);
                maxEval = Math.max(maxEval, ev);
                alpha = Math.max(alpha, ev);
                if (beta <= alpha) break;
            }
            return maxEval;
        } else {
            let minEval = Infinity;
            for (const move of moves) {
                if (this.shouldStop) break;
                const ev = this.minimax(applyMoveToBoard(board, move), depth - 1, alpha, beta, true);
                minEval = Math.min(minEval, ev);
                beta = Math.min(beta, ev);
                if (beta <= alpha) break;
            }
            return minEval;
        }
    }

    /**
     * Evalueert het bord. Krachtschaak-specifiek: stukken met een kracht zijn meer waard.
     */
    private static evaluateBoard(board: BoardState): number {
        let totalScore = 0;
        for (let r = 0; r < 8; r++) {
            for (let c = 0; c < 8; c++) {
                const piece = board[r][c];
                if (piece) {
                    let score = PIECE_VALUES[piece.type];
                    
                    // Bonus voor het bezitten van een kracht (Artikel 2.1)
                    if (piece.power) {
                        score += COMBINATION_BONUSES[piece.type]?.[piece.power] || 0;
                    }

                    totalScore += (piece.color === Color.White ? score : -score);
                }
            }
        }
        return totalScore;
    }

    /**
     * Verzamelt alle legale zetten voor alle stukken van een kleur.
     */
    private static getAllLegalMoves(board: BoardState, color: Color): Move[] {
        const allMoves: Move[] = [];
        for (let r = 0; r < 8; r++) {
            for (let c = 0; c < 8; c++) {
                const piece = board[r][c];
                if (piece && piece.color === color) {
                    const pos = { row: r, col: c };
                    const validTargets = getValidMoves(board, pos, null, false);
                    
                    for (const target of validTargets) {
                        const captured = board[target.row][target.col];
                        allMoves.push({
                            from: pos,
                            to: target,
                            piece: piece.type,
                            color: piece.color,
                            captured: captured ? captured.type : undefined,
                            isForcePower: isPowerMove(board, pos, target, null),
                            notation: getNotation(board, pos, target, piece, captured || null, null, isPowerMove(board, pos, target, null)),
                        });
                    }
                }
            }
        }
        return allMoves;
    }
}