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

const NUM_ZOBRIST_KEYS = 2 * 6 * 7 * 64;
const ZOBRIST_KEYS = new BigInt64Array(NUM_ZOBRIST_KEYS);
const ZOBRIST_SIDE = 9876543210987654321n;

for (let i = 0; i < NUM_ZOBRIST_KEYS; i++) {
    const r1 = BigInt(Math.floor(Math.random() * 0xFFFFFFFF));
    const r2 = BigInt(Math.floor(Math.random() * 0xFFFFFFFF));
    ZOBRIST_KEYS[i] = (r1 << 32n) | r2;
}

function getZobristKey(color: Color, type: PieceType, power: PieceType | null, squareIndex: number): bigint {
    const c = color === Color.White ? 0 : 1;
    const t = PIECE_INDICES[type];
    const p = power ? POWER_INDICES[power] : 0;
    const index = (((c * 6 + t) * 7) + p) * 64 + squareIndex;
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

// --- Transposition Table ---
interface TTEntry {
    depth: number;
    score: number;
    flag: 0 | 1 | 2;
    bestMove: Move | null;
}
const TT = new Map<bigint, TTEntry>();
const MAX_TT_SIZE = 500000;

// --- Move Ordering Heuristics ---
const KILLER_MOVES = new Map<number, Move[]>();

// --- Mutable Board Class ---
export class MutableBoard {
    board: BoardState;
    hash: bigint;
    turn: Color;
    enPassantTarget: Position | null;

    constructor(initialBoard: BoardState, turn: Color, enPassantTarget: Position | null = null) {
        this.board = initialBoard.map(row => row.map(p => p ? { ...p } : null));
        this.turn = turn;
        this.enPassantTarget = enPassantTarget;
        this.hash = this.computeHash();
    }

    computeHash(): bigint {
        let h = 0n;
        for (let r = 0; r < 8; r++) {
            for (let c = 0; c < 8; c++) {
                const p = this.board[r][c];
                if (p) {
                    h ^= getZobristKey(p.color, p.type, p.power, r * 8 + c);
                }
            }
        }
        if (this.turn === Color.Black) h ^= ZOBRIST_SIDE;
        return h;
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
        const targetSquare = this.board[toRow][toCol];

        // 1. Remove piece from source
        this.hash ^= getZobristKey(piece.color, piece.type, piece.power, fromRow * 8 + fromCol);
        this.board[fromRow][fromCol] = null;

        // 2. Handle Capture
        let actualCaptured = targetSquare;
        let epCapturedPos: Position | null = null;

        if (targetSquare) {
            this.hash ^= getZobristKey(targetSquare.color, targetSquare.type, targetSquare.power, toRow * 8 + toCol);
        } else if (move.piece === PieceType.Pawn && move.to.col !== move.from.col && !targetSquare) {
            // En Passant
            const epR = fromRow;
            const epC = toCol;
            actualCaptured = this.board[epR][epC];
            if (actualCaptured) {
                this.hash ^= getZobristKey(actualCaptured.color, actualCaptured.type, actualCaptured.power, epR * 8 + epC);
                this.board[epR][epC] = null;
                epCapturedPos = { row: epR, col: epC };
            }
        }

        // 3. Update Piece State
        const oldType = piece.type;
        const oldPower = piece.power;
        const oldOriginalType = piece.originalType;
        const oldHasMoved = piece.hasMoved;

        if (move.promotion) {
            piece.type = move.promotion;
            piece.originalType = move.promotion;
        }

        if (move.powerConsumed || move.isForcePower) {
            piece.power = null;
        } else if (move.afterPower !== undefined) {
            piece.power = move.afterPower;
        }

        piece.hasMoved = true;

        // 4. Place at dest
        this.board[toRow][toCol] = piece;
        this.hash ^= getZobristKey(piece.color, piece.type, piece.power, toRow * 8 + toCol);

        // 5. Castling (Move Rook)
        let rookMove = null;
        if (move.piece === PieceType.King && Math.abs(fromCol - toCol) === 2) {
            const isKingside = toCol > fromCol;
            const rFromCol = isKingside ? 7 : 0;
            const rToCol = isKingside ? 5 : 3;
            const rook = this.board[fromRow][rFromCol];
            if (rook) {
                this.hash ^= getZobristKey(rook.color, rook.type, rook.power, fromRow * 8 + rFromCol);
                this.board[fromRow][rFromCol] = null;

                rook.hasMoved = true;

                this.board[fromRow][rToCol] = rook;
                this.hash ^= getZobristKey(rook.color, rook.type, rook.power, fromRow * 8 + rToCol);

                rookMove = { from: { r: fromRow, c: rFromCol }, to: { r: fromRow, c: rToCol }, piece: rook };
            }
        }

        // 6. Update En Passant Target
        if (move.piece === PieceType.Pawn && Math.abs(fromRow - toRow) === 2) {
            this.enPassantTarget = { row: (fromRow + toRow) / 2, col: fromCol };
        } else {
            this.enPassantTarget = null;
        }

        // 7. Switch turn
        this.turn = this.turn === Color.White ? Color.Black : Color.White;
        this.hash ^= ZOBRIST_SIDE;

        return {
            move,
            oldHash,
            oldEnPassant,
            captured: actualCaptured,
            epCapturedPos,
            oldPieceState: { type: oldType, power: oldPower, originalType: oldOriginalType, hasMoved: oldHasMoved },
            rookMove
        };
    }

    unmakeMove(undoInfo: any) {
        if (!undoInfo) return;
        const { move, oldHash, oldEnPassant, captured, epCapturedPos, oldPieceState, rookMove } = undoInfo;

        this.hash = oldHash;
        this.enPassantTarget = oldEnPassant;
        this.turn = this.turn === Color.White ? Color.Black : Color.White;

        const piece = this.board[move.to.row][move.to.col];
        if (!piece) return;

        piece.type = oldPieceState.type;
        piece.power = oldPieceState.power;
        piece.originalType = oldPieceState.originalType;
        piece.hasMoved = oldPieceState.hasMoved;

        this.board[move.from.row][move.from.col] = piece;
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
                rook.hasMoved = false;
            }
        }
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
        maxDepth: number = 3,
        onUpdate?: (move: any, depth: number) => void
    ): Promise<any> {
        let bestMove = null;

        if (TT.size > MAX_TT_SIZE) TT.clear();
        this.nodesVisited = 0;
        const startTime = Date.now();

        for (let depth = 1; depth <= maxDepth; depth++) {
            if (this.shouldStop) break;

            const result = this.searchRoot(board, turn, depth);
            if (result.move) bestMove = result.move;

            if (bestMove && onUpdate) {
                onUpdate(bestMove, depth);
            }
            await new Promise(resolve => setTimeout(resolve, 0));
        }

        const duration = Date.now() - startTime;
        // console.log(\`Search completed: Depth \${maxDepth}, Nodes: \${this.nodesVisited}, Time: \${duration}ms, NPS: \${Math.round(this.nodesVisited / (duration / 1000 + 0.001))}\`);

        return bestMove;
    }

    static searchRoot(board: BoardState, turn: Color, depth: number): { move: Move | null, score: number } {
        const mutableBoard = new MutableBoard(board, turn, null);
        const moves = this.getOrderedMoves(mutableBoard, depth, null);

        let bestMove: Move | null = null;
        let bestScore = -Infinity;
        let alpha = -Infinity;
        let beta = Infinity;

        for (const move of moves) {
            if (this.shouldStop) break;

            const undoInfo = mutableBoard.makeMove(move);
            const score = -this.alphaBeta(mutableBoard, depth - 1, -beta, -alpha);
            mutableBoard.unmakeMove(undoInfo);

            if (score > bestScore) {
                bestScore = score;
                bestMove = move;
            }
            if (score > alpha) {
                alpha = score;
            }
        }

        return { move: bestMove, score: bestScore };
    }

    static alphaBeta(mutableBoard: MutableBoard, depth: number, alpha: number, beta: number): number {
        this.nodesVisited++;
        if (depth === 0) return this.quiescenceSearch(mutableBoard, alpha, beta);

        const ttEntry = TT.get(mutableBoard.hash);
        if (ttEntry && ttEntry.depth >= depth) {
            if (ttEntry.flag === 0) return ttEntry.score;
            if (ttEntry.flag === 1 && ttEntry.score > alpha) alpha = ttEntry.score;
            if (ttEntry.flag === 2 && ttEntry.score < beta) beta = ttEntry.score;
            if (alpha >= beta) return ttEntry.score;
        }

        const moves = this.getOrderedMoves(mutableBoard, depth, ttEntry?.bestMove || null);

        if (moves.length === 0) {
            if (isKingInCheck(mutableBoard.board, mutableBoard.turn)) {
                return -20000 + (100 - depth);
            }
            return 0;
        }

        let bestScore = -Infinity;
        let bestMove: Move | null = null;

        for (const move of moves) {
            const undoInfo = mutableBoard.makeMove(move);
            const score = -this.alphaBeta(mutableBoard, depth - 1, -beta, -alpha);
            mutableBoard.unmakeMove(undoInfo);

            if (score > bestScore) {
                bestScore = score;
                bestMove = move;
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
        if (bestScore <= alpha) flag = 2;
        else if (bestScore >= beta) flag = 1;

        TT.set(mutableBoard.hash, {
            depth,
            score: bestScore,
            flag,
            bestMove
        });

        return bestScore;
    }

    static quiescenceSearch(mutableBoard: MutableBoard, alpha: number, beta: number): number {
        this.nodesVisited++;
        const standPat = this.evaluate(mutableBoard);
        if (standPat >= beta) return beta;
        if (alpha < standPat) alpha = standPat;

        const allMoves = this.generateLegalMoves(mutableBoard);
        const captures = allMoves.filter(m => m.captured);

        captures.sort((a, b) => {
            const scoreA = PIECE_VALUES[a.captured!] || 0;
            const scoreB = PIECE_VALUES[b.captured!] || 0;
            return scoreB - scoreA;
        });

        for (const move of captures) {
            const undoInfo = mutableBoard.makeMove(move);
            const score = -this.quiescenceSearch(mutableBoard, -beta, -alpha);
            mutableBoard.unmakeMove(undoInfo);

            if (score >= beta) return beta;
            if (score > alpha) alpha = score;
        }

        return alpha;
    }

    static getOrderedMoves(mutableBoard: MutableBoard, depth: number, ttBestMove: Move | null): Move[] {
        const allMoves = this.generateLegalMoves(mutableBoard);

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
        const enPassant = mutableBoard.enPassantTarget;

        for (let r = 0; r < 8; r++) {
            for (let c = 0; c < 8; c++) {
                const piece = board[r][c];
                if (piece && piece.color === color) {
                    const pos = { row: r, col: c };

                    const targets = getMovesForPieceType(board, pos, piece.type, enPassant, false);

                    if (piece.power) {
                        const powerTargets = getMovesForPieceType(board, pos, piece.power, enPassant, false);
                        targets.push(...powerTargets);
                    }

                    const uniqueTargets = new Set();
                    const distinctTargets = [];
                    for (const t of targets) {
                        const k = `${t.row},${t.col}`;
                        if (!uniqueTargets.has(k)) {
                            uniqueTargets.add(k);
                            distinctTargets.push(t);
                        }
                    }

                    for (const target of distinctTargets) {
                        const targetPiece = board[target.row][target.col];
                        if (targetPiece && targetPiece.color === color) continue;

                        const captured = targetPiece ? targetPiece.type : undefined;
                        const isPower = isPowerMove(board, pos, target, enPassant);

                        const move: Move = {
                            from: pos,
                            to: target,
                            piece: piece.type,
                            color: piece.color,
                            captured,
                            isForcePower: isPower,
                            notation: getNotation(board, pos, target, piece, targetPiece || null, null, isPower)
                        };

                        const undo = mutableBoard.makeMove(move);
                        if (!isKingInCheck(mutableBoard.board, color)) {
                            legalMoves.push(move);
                        }
                        mutableBoard.unmakeMove(undo);
                    }
                }
            }
        }
        return legalMoves;
    }

    static evaluate(mutableBoard: MutableBoard): number {
        let totalScore = 0;
        const board = mutableBoard.board;
        for (let r = 0; r < 8; r++) {
            for (let c = 0; c < 8; c++) {
                const piece = board[r][c];
                if (piece) {
                    let score = PIECE_VALUES[piece.type];
                    if (piece.power) {
                        score += COMBINATION_BONUSES[piece.type]?.[piece.power] || 0;
                    }
                    totalScore += (piece.color === Color.White ? score : -score);
                }
            }
        }
        return totalScore * (mutableBoard.turn === Color.White ? 1 : -1);
    }
}