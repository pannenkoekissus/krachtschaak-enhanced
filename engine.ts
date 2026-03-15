import { BoardState, Position, Move, PieceType, Color, Piece, Square } from './types';
import { getValidMoves, isPowerMove, findKingPosition, getNotation, isKingInCheck, getMovesForPieceType } from './utils/game';

// --- Zobrist Hashing Setup ---
const PIECE_INDICES: Record<PieceType, number> = {
    [PieceType.Pawn]: 0,
    [PieceType.Knight]: 1,
    [PieceType.Bishop]: 2,
    [PieceType.Rook]: 3,
    [PieceType.Queen]: 4,
    [PieceType.King]: 5
};

const POWER_INDICES: Record<string, number> = {
    'none': 0,
    [PieceType.Pawn]: 1,
    [PieceType.Knight]: 2,
    [PieceType.Bishop]: 3,
    [PieceType.Rook]: 4,
    [PieceType.Queen]: 5,
    [PieceType.King]: 6
};

const NUM_ZOBRIST_KEYS = 2 * 6 * 7 * 6 * 64; // color * type * power * originalType * squares
const ZOBRIST_KEYS = new BigInt64Array(NUM_ZOBRIST_KEYS);
const ZOBRIST_CASTLING = new BigInt64Array(16);
const ZOBRIST_EP = new BigInt64Array(8);
const ZOBRIST_SIDE = generateRandomBigInt();

function generateRandomBigInt() {
    const r1 = BigInt(Math.floor(Math.random() * 0xFFFFFFFF));
    const r2 = BigInt(Math.floor(Math.random() * 0xFFFFFFFF));
    return (r1 << 32n) | r2;
}

for (let i = 0; i < NUM_ZOBRIST_KEYS; i++) ZOBRIST_KEYS[i] = generateRandomBigInt();
for (let i = 0; i < 16; i++) ZOBRIST_CASTLING[i] = generateRandomBigInt();
for (let i = 0; i < 8; i++) ZOBRIST_EP[i] = generateRandomBigInt();

function getZobristKey(color: Color, type: PieceType, power: PieceType | null, originalType: PieceType, squareIndex: number): bigint {
    const c = color === Color.White ? 0 : 1;
    const t = PIECE_INDICES[type];
    const p = power ? POWER_INDICES[power] : 0;
    const o = PIECE_INDICES[originalType];
    // Index: (((c * 6 + t) * 7) + p) * 6 + o) * 64 + squareIndex
    const index = (((((c * 6 + t) * 7) + p) * 6) + o) * 64 + squareIndex;
    return ZOBRIST_KEYS[index];
}

// --- Constants ---
const PIECE_VALUES = {
    [PieceType.Pawn]: 100,
    [PieceType.Knight]: 320,
    [PieceType.Bishop]: 330,
    [PieceType.Rook]: 500,
    [PieceType.Queen]: 900,
    [PieceType.King]: 20000
};

const COMBINATION_BONUSES: Record<PieceType, Partial<Record<PieceType, number>>> = {
    [PieceType.Pawn]: {
        [PieceType.Knight]: 60, [PieceType.Bishop]: 70, [PieceType.Rook]: 100, [PieceType.Queen]: 250,
    },
    [PieceType.Knight]: {
        [PieceType.Pawn]: 20, [PieceType.Bishop]: 130, [PieceType.Rook]: 180, [PieceType.Queen]: 250,
    },
    [PieceType.Bishop]: {
        [PieceType.Pawn]: 10, [PieceType.Knight]: 110, [PieceType.Rook]: 200, [PieceType.Queen]: 200,
    },
    [PieceType.Rook]: {
        [PieceType.Pawn]: 20, [PieceType.Knight]: 130, [PieceType.Bishop]: 160, [PieceType.Queen]: 160,
    },
    [PieceType.Queen]: {
        [PieceType.Pawn]: 5, [PieceType.Knight]: 120,
    },
    [PieceType.King]: {
        [PieceType.Pawn]: 20, [PieceType.Knight]: 70, [PieceType.Bishop]: 60, [PieceType.Rook]: 100, [PieceType.Queen]: 150,
    }
};

function getPieceValue(piece: Piece): number {
    const isKing = piece.isKing || piece.originalType === PieceType.King;
    const baseType = isKing ? PieceType.King : piece.type;
    let score = PIECE_VALUES[baseType];
    if (piece.originalType === PieceType.King && piece.type !== PieceType.King) {
        score += PIECE_VALUES[piece.type];
    }
    if (piece.power) {
        score += COMBINATION_BONUSES[baseType]?.[piece.power] || 0;
    }
    return score;
}

// --- Transposition Table ---
interface TTEntry {
    depth: number;
    score: number;
    flag: 0 | 1 | 2;
    bestMove: Move | null;
    pv?: string[];
}
const TT = new Map<bigint, TTEntry>();
const MAX_TT_SIZE = 1000000;

// --- Move Ordering Heuristics ---
const KILLER_MOVES = new Map<number, Move[]>();

// --- Mutable Board Class ---
export class MutableBoard {
    board: BoardState;
    hash: bigint;
    turn: Color;
    enPassantTarget: Position | null;
    currentScore: number; // White perspective score

    constructor(initialBoard: BoardState, turn: Color, enPassantTarget: Position | null = null) {
        this.board = initialBoard.map(row => row.map(p => p ? { ...p } : null));
        this.turn = turn;
        this.enPassantTarget = enPassantTarget;
        this.hash = this.computeHash();
        this.currentScore = this.computeScore();
    }

    getCastlingBits(): number {
        let castlingBits = 0;
        const wk = this.board[7][4];
        const wrk = this.board[7][7];
        const wrq = this.board[7][0];
        const bk = this.board[0][4];
        const brk = this.board[0][7];
        const brq = this.board[0][0];

        if (wk?.type === PieceType.King && wk.color === Color.White && !wk.hasMoved) {
            if (wrk?.type === PieceType.Rook && wrk.color === Color.White && !wrk.hasMoved) castlingBits |= 1;
            if (wrq?.type === PieceType.Rook && wrq.color === Color.White && !wrq.hasMoved) castlingBits |= 2;
        }
        if (bk?.type === PieceType.King && bk.color === Color.Black && !bk.hasMoved) {
            if (brk?.type === PieceType.Rook && brk.color === Color.Black && !brk.hasMoved) castlingBits |= 4;
            if (brq?.type === PieceType.Rook && brq.color === Color.Black && !brq.hasMoved) castlingBits |= 8;
        }
        return castlingBits;
    }

    computeHash(): bigint {
        let h = 0n;
        for (let r = 0; r < 8; r++) {
            for (let c = 0; c < 8; c++) {
                const p = this.board[r][c];
                if (p) {
                    h ^= getZobristKey(p.color, p.type, p.power, p.originalType, r * 8 + c);
                }
            }
        }
        if (this.turn === Color.Black) h ^= ZOBRIST_SIDE;

        h ^= ZOBRIST_CASTLING[this.getCastlingBits()];

        if (this.enPassantTarget) {
            h ^= ZOBRIST_EP[this.enPassantTarget.col];
        }

        return h;
    }

    computeScore(): number {
        let totalScore = 0;
        for (let r = 0; r < 8; r++) {
            for (let c = 0; c < 8; c++) {
                const piece = this.board[r][c];
                if (piece) {
                    const val = getPieceValue(piece);
                    totalScore += (piece.color === Color.White ? val : -val);
                }
            }
        }
        return totalScore;
    }

    makeNullMove(): any {
        const oldHash = this.hash;
        const oldEnPassant = this.enPassantTarget;

        // Null move: just switch turn and clear EP
        this.turn = this.turn === Color.White ? Color.Black : Color.White;
        this.hash ^= ZOBRIST_SIDE;
        this.enPassantTarget = null; // EP rights lost

        return { oldHash, oldEnPassant };
    }

    unmakeNullMove(undoInfo: any) {
        this.hash = undoInfo.oldHash;
        this.enPassantTarget = undoInfo.oldEnPassant;
        this.turn = this.turn === Color.White ? Color.Black : Color.White;
    }

    makeMove(move: Move): any {
        const fromRow = move.from.row;
        const fromCol = move.from.col;
        const toRow = move.to.row;
        const toCol = move.to.col;

        const piece = this.board[fromRow][fromCol];
        if (!piece) return null;

        const oldHash = this.hash;
        const oldEnPassant = this.enPassantTarget;
        const oldScore = this.currentScore;
        const targetSquare = this.board[toRow][toCol];

        const oldCastlingBits = this.getCastlingBits();

        // 1. Remove piece from source
        this.hash ^= getZobristKey(piece.color, piece.type, piece.power, piece.originalType, fromRow * 8 + fromCol);
        this.board[fromRow][fromCol] = null;

        // 2. Handle Capture
        let actualCaptured = targetSquare;
        let epCapturedPos: Position | null = null;

        if (targetSquare) {
            // Capture: Remove target from hash and score
            this.hash ^= getZobristKey(targetSquare.color, targetSquare.type, targetSquare.power, targetSquare.originalType, toRow * 8 + toCol);
            const val = getPieceValue(targetSquare);
            this.currentScore -= (targetSquare.color === Color.White ? val : -val);
        } else if (move.piece === PieceType.Pawn && move.to.col !== move.from.col && !targetSquare) {
            // En Passant
            const epR = fromRow;
            const epC = toCol;
            actualCaptured = this.board[epR][epC];
            if (actualCaptured) {
                this.hash ^= getZobristKey(actualCaptured.color, actualCaptured.type, actualCaptured.power, actualCaptured.originalType, epR * 8 + epC);
                this.board[epR][epC] = null;
                epCapturedPos = { row: epR, col: epC };

                const val = getPieceValue(actualCaptured);
                this.currentScore -= (actualCaptured.color === Color.White ? val : -val);
            }
        }

        // 3. Update Piece State (Promotion/Power)
        const oldType = piece.type;
        const oldPower = piece.power;
        const oldOriginalType = piece.originalType;
        const oldHasMoved = piece.hasMoved;

        // Remove old piece value from score
        const oldPieceVal = getPieceValue(piece);
        this.currentScore -= (piece.color === Color.White ? oldPieceVal : -oldPieceVal);

        // CREATE NEW PIECE OBJECT INSTEAD OF MODIFYING
        const newPiece: Piece = { ...piece, hasMoved: true };

        if (move.promotion) {
            newPiece.type = move.promotion;
        }

        if (move.afterPower !== undefined) {
            newPiece.power = move.afterPower;
        } else if (move.powerConsumed || move.isForcePower) {
            newPiece.power = null;
        }

        // Add new piece value to score
        const newPieceVal = getPieceValue(newPiece);
        this.currentScore += (piece.color === Color.White ? newPieceVal : -newPieceVal);

        // 4. Place at dest
        this.board[toRow][toCol] = newPiece;
        this.hash ^= getZobristKey(newPiece.color, newPiece.type, newPiece.power, newPiece.originalType, toRow * 8 + toCol);

        // 5. Castling (Move Rook)
        let rookMove = null;
        const isBackRank = fromRow === 0 || fromRow === 7;
        if (move.piece === PieceType.King && Math.abs(fromCol - toCol) === 2 && isBackRank) {
            const isKingside = toCol > fromCol;
            const rFromCol = isKingside ? 7 : 0;
            const rToCol = isKingside ? 5 : 3;
            const rook = this.board[fromRow][rFromCol];
            if (rook && rook.type === PieceType.Rook && rook.color === piece.color) {
                const oldRookHasMoved = rook.hasMoved;
                this.hash ^= getZobristKey(rook.color, rook.type, rook.power, rook.originalType, fromRow * 8 + rFromCol);
                this.board[fromRow][rFromCol] = null;

                const newRook: Piece = { ...rook, hasMoved: true };

                this.board[fromRow][rToCol] = newRook;
                this.hash ^= getZobristKey(newRook.color, newRook.type, newRook.power, newRook.originalType, fromRow * 8 + rToCol);

                rookMove = { from: { r: fromRow, c: rFromCol }, to: { r: fromRow, c: rToCol }, piece: newRook, oldHasMoved: oldRookHasMoved };
            }
        }

        // 6. Update En Passant Target & Castling Bits in Hash
        if (oldEnPassant) this.hash ^= ZOBRIST_EP[oldEnPassant.col];

        if (move.piece === PieceType.Pawn && Math.abs(fromRow - toRow) === 2) {
            this.enPassantTarget = { row: (fromRow + toRow) / 2, col: fromCol };
            this.hash ^= ZOBRIST_EP[this.enPassantTarget.col];
        } else {
            this.enPassantTarget = null;
        }

        const newCastlingBits = this.getCastlingBits();
        this.hash ^= ZOBRIST_CASTLING[oldCastlingBits];
        this.hash ^= ZOBRIST_CASTLING[newCastlingBits];

        // 7. Switch turn
        this.turn = this.turn === Color.White ? Color.Black : Color.White;
        this.hash ^= ZOBRIST_SIDE;

        return {
            move,
            oldHash,
            oldEnPassant,
            oldScore,
            captured: actualCaptured,
            epCapturedPos,
            oldPieceState: { type: oldType, power: oldPower, originalType: oldOriginalType, isKing: piece.isKing, hasMoved: oldHasMoved },
            rookMove
        };
    }

    unmakeMove(undoInfo: any) {
        if (!undoInfo) return;
        const { move, oldHash, oldEnPassant, oldScore, captured, epCapturedPos, oldPieceState, rookMove } = undoInfo;

        this.hash = oldHash;
        this.enPassantTarget = oldEnPassant;
        this.currentScore = oldScore;
        this.turn = this.turn === Color.White ? Color.Black : Color.White;

        const pieceAtTo = this.board[move.to.row][move.to.col];
        if (!pieceAtTo) {
            console.error(`CRITICAL: unmakeMove found null at ${move.to.row},${move.to.col} for move ${move.notation}`);
            return;
        }

        const originalPiece: Piece = {
            color: pieceAtTo.color, // Color never changes
            type: oldPieceState.type,
            power: oldPieceState.power,
            originalType: oldPieceState.originalType,
            isKing: oldPieceState.isKing,
            hasMoved: oldPieceState.hasMoved
        };

        this.board[move.from.row][move.from.col] = originalPiece;
        this.board[move.to.row][move.to.col] = null;

        if (captured) {
            if (epCapturedPos) {
                this.board[epCapturedPos.row][epCapturedPos.col] = captured;
            } else {
                this.board[move.to.row][move.to.col] = captured;
            }
        }

        if (rookMove) {
            const rook = this.board[rookMove.to.r][rookMove.to.c];
            if (rook) {
                this.board[rookMove.from.r][rookMove.from.c] = rook;
                this.board[rookMove.to.r][rookMove.to.c] = null;
                rook.hasMoved = rookMove.oldHasMoved;
            }
        }
    }

    clone(): MutableBoard {
        const nb = new MutableBoard(this.board, this.turn, this.enPassantTarget);
        nb.hash = this.hash;
        nb.currentScore = this.currentScore;
        return nb;
    }
}

export default class KrachtschaakAI {
    static shouldStop = false;
    static nodesVisited = 0;

    static resetStopFlag() {
        this.shouldStop = false;
        this.nodesVisited = 0;
    }

    static async getBestMoveIterative(
        board: BoardState,
        turn: Color,
        maxDepth: number = 99,
        onUpdate?: (results: any[], depth: number) => void,
        multiPv: number = 1
    ): Promise<any[]> {
        let bestResults: any[] = [];

        TT.clear(); // Always clear TT at the start of a new analysis
        KILLER_MOVES.clear();
        this.nodesVisited = 0;
        const startTime = Date.now();

        for (let depth = 1; depth <= maxDepth; depth++) {
            if (this.shouldStop) break;

            const results = KrachtschaakAI.searchRoot(board, turn, depth, multiPv);
            if (results.length > 0) bestResults = results;

            if (bestResults.length > 0 && onUpdate) {
                onUpdate(bestResults, depth);
            }
            await new Promise(resolve => setTimeout(resolve, 0));
        }

        const duration = Date.now() - startTime;
        console.log(`Search completed: Depth ${maxDepth}, Nodes: ${this.nodesVisited}, Time: ${duration}ms, NPS: ${Math.round(this.nodesVisited / (duration / 1000 + 0.001))}`);

        return bestResults;
    }

    static extractPV(mutableBoard: MutableBoard, maxMoves: number = 20): string[] {
        const pv: string[] = [];
        const hashes = new Set<bigint>();
        let movesCount = 0;
        let boardCopy = new MutableBoard(mutableBoard.board, mutableBoard.turn, mutableBoard.enPassantTarget);

        while (movesCount < maxMoves) {
            if (hashes.has(boardCopy.hash)) break;
            hashes.add(boardCopy.hash);

            const entry = TT.get(boardCopy.hash);
            if (!entry || !entry.bestMove) break;

            pv.push(entry.bestMove.notation);
            boardCopy.makeMove(entry.bestMove);
            movesCount++;
        }
        return pv;
    }

    static searchRoot(board: BoardState, turn: Color, depth: number, multiPv: number = 1): { move: Move | null, score: number, pv: string[] }[] {
        const mutableBoard = new MutableBoard(board, turn, null);
        const moves = KrachtschaakAI.getOrderedMoves(mutableBoard, depth, null);
        const results: { move: Move | null, score: number, pv: string[] }[] = [];

        if (moves.length === 0) return [];

        for (const move of moves) {
            if (this.shouldStop) break;

            const nextPv: string[] = [];
            const nextBoard = mutableBoard.clone();
            nextBoard.makeMove(move);
            // We use full window for root moves in multi-pv to ensure accurate ranking
            const score = -KrachtschaakAI.alphaBeta(nextBoard, depth - 1, -Infinity, Infinity, true, nextPv, 1);

            results.push({ move, score, pv: [move.notation, ...nextPv] });
        }

        return results.sort((a, b) => b.score - a.score).slice(0, multiPv);
    }

    static alphaBeta(mutableBoard: MutableBoard, depth: number, alpha: number, beta: number, allowNull: boolean, pv: string[], ply: number): number {
        this.nodesVisited++;
        const originalAlpha = alpha;

        const inCheck = isKingInCheck(mutableBoard.board, mutableBoard.turn);

        // In-check extension: if king is in check, don't drop to quiescence search yet
        let effectiveDepth = depth;
        if (inCheck && effectiveDepth <= 0) {
            effectiveDepth = 1;
        }

        if (effectiveDepth <= 0) {
            const score = KrachtschaakAI.quiescenceSearch(mutableBoard, alpha, beta);
            // Cap Quiescence Search result to avoid returning false mate scores
            if (score > 15000) return 15000;
            if (score < -15000) return -15000;
            return score;
        }

        const ttEntry = TT.get(mutableBoard.hash);
        if (ttEntry && ttEntry.depth >= effectiveDepth) {
            let score = ttEntry.score;
            if (score > 15000) score -= ply;
            else if (score < -15000) score += ply;

            if (ttEntry.flag === 0) {
                if (ttEntry.pv && ttEntry.pv.length > 0) {
                    pv.length = 0;
                    pv.push(...ttEntry.pv);
                }
                return score;
            }
            if (ttEntry.flag === 1 && score > alpha) alpha = score;
            if (ttEntry.flag === 2 && score < beta) beta = score;
            if (alpha >= beta) return score;
        }

        const kingPos = findKingPosition(mutableBoard.board, mutableBoard.turn);
        if (!kingPos) {
            // Missing king is a terminal loss
            return -20000 + ply;
        }

        // Null Move Pruning
        if (allowNull && !inCheck && effectiveDepth >= 3 && Math.abs(beta) < 15000) {
            const staticEval = KrachtschaakAI.evaluate(mutableBoard);
            if (staticEval >= beta) {
                const nextBoard = mutableBoard.clone();
                nextBoard.makeNullMove();
                const dummyPv: string[] = [];
                const score = -KrachtschaakAI.alphaBeta(nextBoard, effectiveDepth - 1 - 2, -beta, -beta + 1, false, dummyPv, ply + 1);

                if (score >= beta) {
                    return beta;
                }
            }
        }

        const moves = KrachtschaakAI.getOrderedMoves(mutableBoard, effectiveDepth, ttEntry?.bestMove || null);

        if (moves.length === 0) {
            if (inCheck) {
                return -20000 + ply;
            }
            // For Krachtschaak, stalemate with King on board usually means draw.
            // But if the king is missing, it's already handled above.
            return 0;
        }

        let bestScore = -Infinity;
        let bestMove: Move | null = null;

        for (const move of moves) {
            const nextPv: string[] = [];
            const nextBoard = mutableBoard.clone();
            nextBoard.makeMove(move);
            const score = -KrachtschaakAI.alphaBeta(nextBoard, effectiveDepth - 1, -beta, -alpha, true, nextPv, ply + 1);

            if (score > bestScore) {
                bestScore = score;
                bestMove = move;

                pv.length = 0;
                pv.push(move.notation, ...nextPv);
            }

            if (score > alpha) alpha = score;

            if (alpha >= beta) {
                if (!move.captured) {
                    if (!KILLER_MOVES.has(depth)) KILLER_MOVES.set(depth, []);
                    const killers = KILLER_MOVES.get(depth)!;
                    if (!killers.some(k => k.notation === move.notation)) {
                        killers.push(move);
                        if (killers.length > 2) killers.shift();
                    }
                }
                break;
            }
        }

        let flag: 0 | 1 | 2 = 0;
        if (bestScore <= originalAlpha) flag = 2;
        else if (bestScore >= beta) flag = 1;

        let ttScore = bestScore;
        if (ttScore > 15000) ttScore += ply;
        else if (ttScore < -15000) ttScore -= ply;

        TT.set(mutableBoard.hash, {
            depth: effectiveDepth,
            score: ttScore,
            flag,
            bestMove,
            pv: flag === 0 ? [...pv] : undefined
        });

        return bestScore;
    }

    static quiescenceSearch(mutableBoard: MutableBoard, alpha: number, beta: number): number {
        this.nodesVisited++;

        const myKing = findKingPosition(mutableBoard.board, mutableBoard.turn);
        if (!myKing) return -19500; // Very bad but not a "forced mate" score from search perspective

        const standPat = KrachtschaakAI.evaluate(mutableBoard);
        if (standPat >= beta) return beta;
        if (alpha < standPat) alpha = standPat;

        const allMoves = KrachtschaakAI.generateLegalMoves(mutableBoard);
        const captures = allMoves.filter(m => m.captured);

        captures.sort((a, b) => {
            const scoreA = PIECE_VALUES[a.captured!] || 0;
            const scoreB = PIECE_VALUES[b.captured!] || 0;
            return scoreB - scoreA;
        });

        for (const move of captures) {
            const nextBoard = mutableBoard.clone();
            nextBoard.makeMove(move);
            const score = -KrachtschaakAI.quiescenceSearch(nextBoard, -beta, -alpha);

            if (score >= beta) return beta;
            if (score > alpha) alpha = score;
        }

        return alpha;
    }

    static getOrderedMoves(mutableBoard: MutableBoard, depth: number, ttBestMove: Move | null): Move[] {
        const allMoves = KrachtschaakAI.generateLegalMoves(mutableBoard);

        return allMoves.map(move => {
            let score = 0;
            if (ttBestMove && move.notation === ttBestMove.notation) score += 10000;
            if (move.captured) {
                const victimValue = PIECE_VALUES[move.captured] || 100;
                const aggressorValue = PIECE_VALUES[move.piece] || 100;
                score += 1000 + victimValue - (aggressorValue / 100);
            }
            const killers = KILLER_MOVES.get(depth);
            if (killers && killers.some(k => k.notation === move.notation)) {
                score += 900;
            }
            if (move.isForcePower) score += 500;
            return { move, score };
        }).sort((a, b) => b.score - a.score).map(x => x.move);
    }

    static generateLegalMoves(mutableBoard: MutableBoard): Move[] {
        const board = mutableBoard.board;
        const color = mutableBoard.turn;
        const legalMoves: Move[] = [];
        const ep = mutableBoard.enPassantTarget;

        for (let r = 0; r < 8; r++) {
            for (let c = 0; c < 8; c++) {
                const p = board[r][c];
                if (!p || p.color !== color) continue;

                const pos = { row: r, col: c };
                // getValidMoves with allowSelfCheck = true (pseudo-legal)
                const targets = getValidMoves(board, pos, ep, true);

                for (const target of targets) {
                    const targetPiece = board[target.row][target.col];
                    if (targetPiece && targetPiece.color === color) continue;

                    const isPower = isPowerMove(board, pos, target, ep);
                    const captured = targetPiece ? (targetPiece.isKing || targetPiece.originalType === PieceType.King ? PieceType.King : targetPiece.type) : undefined;

                    // Power acquisition: gains originalType of captured piece (except King)
                    let capForPower = targetPiece;
                    if (!targetPiece && (p.type === PieceType.Pawn || p.power === PieceType.Pawn) && ep && target.row === ep.row && target.col === ep.col) {
                        capForPower = board[pos.row][target.col];
                    }

                    const acqPower = (capForPower && capForPower.originalType !== PieceType.King) ? capForPower.originalType : null;
                    const finalAfterPower = acqPower !== null ? acqPower : (isPower ? null : p.power);

                    const promRank = color === Color.White ? 0 : 7;
                    const isProm = (p.type === PieceType.Pawn || p.power === PieceType.Pawn) && target.row === promRank;

                    if (isProm) {
                        for (const promType of [PieceType.Queen, PieceType.Rook, PieceType.Bishop, PieceType.Knight]) {
                            const m: Move = {
                                from: pos, to: target, piece: p.type, color: p.color,
                                captured, isForcePower: isPower, promotion: promType, afterPower: finalAfterPower,
                                notation: getNotation(board, pos, target, p, targetPiece, promType, isPower)
                            };
                            const undo = mutableBoard.makeMove(m);
                            if (!isKingInCheck(mutableBoard.board, color)) legalMoves.push(m);
                            mutableBoard.unmakeMove(undo);
                        }
                    } else {
                        const m: Move = {
                            from: pos, to: target, piece: p.type, color: p.color,
                            captured, isForcePower: isPower, afterPower: finalAfterPower,
                            notation: getNotation(board, pos, target, p, targetPiece, null, isPower)
                        };
                        const undo = mutableBoard.makeMove(m);
                        if (!isKingInCheck(mutableBoard.board, color)) legalMoves.push(m);
                        mutableBoard.unmakeMove(undo);
                    }
                }
            }
        }
        return legalMoves;
    }

    static evaluate(mutableBoard: MutableBoard): number {
        return mutableBoard.currentScore * (mutableBoard.turn === Color.White ? 1 : -1);
    }
}