
import { BoardState, Piece, PieceType, Color, Position, Square, Move, PromotionData } from '../types';

const PIECE_ORDER: PieceType[] = [
    PieceType.Rook, PieceType.Knight, PieceType.Bishop, PieceType.Queen,
    PieceType.King, PieceType.Bishop, PieceType.Knight, PieceType.Rook
];

export const createInitialBoard = (): BoardState => {
    // Initialize a fully dense 8x8 board with nulls. This ensures all squares are explicitly defined.
    const board: BoardState = Array(8).fill(null).map(() => Array(8).fill(null));

    // Place Black pieces
    for (let i = 0; i < 8; i++) {
        board[0][i] = { type: PIECE_ORDER[i], color: Color.Black, power: null, originalType: PIECE_ORDER[i], isKing: PIECE_ORDER[i] === PieceType.King, hasMoved: false };
        board[1][i] = { type: PieceType.Pawn, color: Color.Black, power: null, originalType: PieceType.Pawn, isKing: false, hasMoved: false };
    }

    // Rows 2, 3, 4, 5 remain null as initialized.

    // Place White pieces
    for (let i = 0; i < 8; i++) {
        board[6][i] = { type: PieceType.Pawn, color: Color.White, power: null, originalType: PieceType.Pawn, isKing: false, hasMoved: false };
        board[7][i] = { type: PIECE_ORDER[i], color: Color.White, power: null, originalType: PIECE_ORDER[i], isKing: PIECE_ORDER[i] === PieceType.King, hasMoved: false };
    }

    return board;
};

export const sanitizePiece = (p: any): Piece | null => {
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

export const sanitizeBoard = (rawBoard: any): BoardState => {
    const safeBoard: BoardState = Array(8).fill(null).map(() => Array(8).fill(null));
    if (rawBoard && typeof rawBoard === 'object') {
        for (let r = 0; r < 8; r++) {
            const rawRow = (rawBoard as any)[r];
            if (rawRow && typeof rawRow === 'object') {
                for (let c = 0; c < 8; c++) {
                    safeBoard[r][c] = sanitizePiece((rawRow as any)[c]);
                }
            }
        }
    }
    return safeBoard;
};

const isWithinBoard = (row: number, col: number): boolean => {
    return row >= 0 && row < 8 && col >= 0 && col < 8;
};

const getSlidingMoves = (board: BoardState, pos: Position, directions: number[][], isPremove = false): Position[] => {
    const piece = board[pos.row][pos.col] as Piece;
    const moves: Position[] = [];
    for (const [dr, dc] of directions) {
        let r = pos.row + dr;
        let c = pos.col + dc;
        while (isWithinBoard(r, c)) {
            const targetSquare = board[r][c];
            if (targetSquare && !isPremove) {
                if (targetSquare.color !== piece.color) {
                    moves.push({ row: r, col: c });
                }
                break;
            }
            moves.push({ row: r, col: c });
            if (targetSquare && isPremove && targetSquare.color !== piece.color) {
                // In premove, we can move through pieces but should still be able to capture the first one we hit.
            } else if (targetSquare && isPremove && targetSquare.color === piece.color) {
                break; // Can't premove through or to your own piece
            }
            r += dr;
            c += dc;
        }
    }
    return moves;
};

const getStepMoves = (board: BoardState, pos: Position, directions: number[][], isPremove = false): Position[] => {
    const piece = board[pos.row][pos.col] as Piece;
    const moves: Position[] = [];
    for (const [dr, dc] of directions) {
        const r = pos.row + dr;
        const c = pos.col + dc;
        if (isWithinBoard(r, c)) {
            if (isPremove) {
                // For premoves, a step-mover (knight, king) can target any of its potential squares.
                // The legality (e.g., if the square is now occupied by an opponent's piece
                // or is empty) will be checked when the opponent's move is received.
                // This allows for premoving recaptures on squares currently occupied by your own pieces.
                moves.push({ row: r, col: c });
            } else {
                const targetSquare = board[r][c];
                if (!targetSquare || targetSquare.color !== piece.color) {
                    moves.push({ row: r, col: c });
                }
            }
        }
    }
    return moves;
};

const getPawnMoves = (board: BoardState, pos: Position, enPassantTarget: Position | null, isPremove = false): Position[] => {
    const piece = board[pos.row][pos.col] as Piece;
    const moves: Position[] = [];
    const direction = piece.color === Color.White ? -1 : 1;
    const startRow = piece.color === Color.White ? 6 : 1;

    // Forward moves
    if (isPremove) {
        if (isWithinBoard(pos.row + direction, pos.col)) moves.push({ row: pos.row + direction, col: pos.col });
        if (pos.row === startRow && isWithinBoard(pos.row + 2 * direction, pos.col)) moves.push({ row: pos.row + 2 * direction, col: pos.col });
    } else {
        if (isWithinBoard(pos.row + direction, pos.col) && !board[pos.row + direction][pos.col]) {
            moves.push({ row: pos.row + direction, col: pos.col });
            if (pos.row === startRow && !board[pos.row + 2 * direction][pos.col]) {
                moves.push({ row: pos.row + 2 * direction, col: pos.col });
            }
        }
    }


    // Captures
    const captureCols = [pos.col - 1, pos.col + 1];
    for (const c of captureCols) {
        if (isWithinBoard(pos.row + direction, c)) {
            if (isPremove) {
                moves.push({ row: pos.row + direction, col: c });
            } else {
                const target = board[pos.row + direction][c];
                if (target && target.color !== piece.color) {
                    moves.push({ row: pos.row + direction, col: c });
                }
            }
        }
    }

    // En Passant
    if (enPassantTarget && enPassantTarget.row === pos.row + direction && Math.abs(enPassantTarget.col - pos.col) === 1) {
        if (isWithinBoard(enPassantTarget.row, enPassantTarget.col) && !board[enPassantTarget.row][enPassantTarget.col]) {
            moves.push({ row: enPassantTarget.row, col: enPassantTarget.col });
        }
    }

    return moves;
};


export const isSquareAttacked = (board: BoardState, position: Position, attackerColor: Color): boolean => {
    for (let r = 0; r < 8; r++) {
        for (let c = 0; c < 8; c++) {
            const piece = board[r][c];
            if (piece && piece.color === attackerColor) {
                // Primary type attack
                const moves = getMovesForPieceType(board, { row: r, col: c }, piece.type, null, true);
                for (const move of moves) {
                    if (move.row === position.row && move.col === position.col) return true;
                }
                // Power attack
                if (piece.power) {
                    const powerMoves = getMovesForPieceType(board, { row: r, col: c }, piece.power, null, true);
                    for (const move of powerMoves) {
                        if (move.row === position.row && move.col === position.col) return true;
                    }
                }
            }
        }
    }
    return false;
};

const getKingPremoveMoves = (board: BoardState, pos: Position): Position[] => {
    const piece = board[pos.row][pos.col] as Piece;
    // Standard king moves (1 square in any direction)
    const moves = getStepMoves(board, pos, [[-1, 0], [1, 0], [0, -1], [0, 1], [-1, -1], [-1, 1], [1, -1], [1, 1]], true);

    // Castling premove logic:
    // For premoves, we only check if the pieces involved (king and rook) have not moved
    // and if the squares between them are empty. We do not check for checks or attacks on
    // traversed squares, as the board state will likely change before the move is executed.
    const correctRank = piece.color === Color.White ? 7 : 0;
    if (!piece.hasMoved && pos.row === correctRank && pos.col === 4) {
        const rank = pos.row;

        // Kingside castling premove
        const kingsideRook = board[rank][7];
        if (kingsideRook?.type === PieceType.Rook && !kingsideRook.hasMoved && !board[rank][5] && !board[rank][6]) {
            moves.push({ row: rank, col: 6 });
        }

        // Queenside castling premove
        const queensideRook = board[rank][0];
        if (queensideRook?.type === PieceType.Rook && !queensideRook.hasMoved && !board[rank][1] && !board[rank][2] && !board[rank][3]) {
            moves.push({ row: rank, col: 2 });
        }
    }
    return moves;
};

const getKingMoves = (board: BoardState, pos: Position): Position[] => {
    const piece = board[pos.row][pos.col] as Piece;
    const moves = getStepMoves(board, pos, [[-1, 0], [1, 0], [0, -1], [0, 1], [-1, -1], [-1, 1], [1, -1], [1, 1]]);

    // Castling logic needs to check for checks on traversed squares
    const correctRank = piece.color === Color.White ? 7 : 0;
    if (!piece.hasMoved && pos.row === correctRank && pos.col === 4 && !isKingInCheck(board, piece.color)) {
        const opponentColor = piece.color === Color.White ? Color.Black : Color.White;
        const rank = pos.row;

        // Kingside castling
        const kingsideRook = board[rank][7];
        if (kingsideRook?.type === PieceType.Rook && !kingsideRook.hasMoved && !board[rank][5] && !board[rank][6]) {
            if (!isSquareAttacked(board, { row: rank, col: 5 }, opponentColor) && !isSquareAttacked(board, { row: rank, col: 6 }, opponentColor)) {
                moves.push({ row: rank, col: 6 });
            }
        }

        // Queenside castling
        const queensideRook = board[rank][0];
        if (queensideRook?.type === PieceType.Rook && !queensideRook.hasMoved && !board[rank][1] && !board[rank][2] && !board[rank][3]) {
            if (!isSquareAttacked(board, { row: rank, col: 2 }, opponentColor) && !isSquareAttacked(board, { row: rank, col: 3 }, opponentColor)) {
                moves.push({ row: rank, col: 2 });
            }
        }
    }
    return moves;
};

export const getMovesForPieceType = (board: BoardState, pos: Position, pieceType: PieceType, enPassantTarget: Position | null, isForAttackCheck = false, isPremove = false): Position[] => {
    // For attack checks, pawn forward moves don't count, only captures.
    if (isForAttackCheck && pieceType === PieceType.Pawn) {
        const piece = board[pos.row][pos.col] as Piece;
        const moves: Position[] = [];
        const direction = piece.color === Color.White ? -1 : 1;
        const captureCols = [pos.col - 1, pos.col + 1];
        for (const c of captureCols) {
            if (isWithinBoard(pos.row + direction, c)) {
                moves.push({ row: pos.row + direction, col: c });
            }
        }
        return moves;
    }

    switch (pieceType) {
        case PieceType.Pawn:
            return getPawnMoves(board, pos, enPassantTarget, isPremove);
        case PieceType.Rook:
            return getSlidingMoves(board, pos, [[-1, 0], [1, 0], [0, -1], [0, 1]], isPremove);
        case PieceType.Knight:
            return getStepMoves(board, pos, [[-2, -1], [-2, 1], [-1, -2], [-1, 2], [1, -2], [1, 2], [2, -1], [2, 1]], isPremove);
        case PieceType.Bishop:
            return getSlidingMoves(board, pos, [[-1, -1], [-1, 1], [1, -1], [1, 1]], isPremove);
        case PieceType.Queen:
            return getSlidingMoves(board, pos, [[-1, 0], [1, 0], [0, -1], [0, 1], [-1, -1], [-1, 1], [1, -1], [1, 1]], isPremove);
        case PieceType.King:
            // This avoids infinite recursion between getKingMoves and isKingInCheck
            if (isForAttackCheck) {
                return getStepMoves(board, pos, [[-1, 0], [1, 0], [0, -1], [0, 1], [-1, -1], [-1, 1], [1, -1], [1, 1]]);
            }
            if (isPremove) {
                return getKingPremoveMoves(board, pos);
            }
            return getKingMoves(board, pos);
        default:
            return [];
    }
};

const filterLegalMoves = (board: BoardState, color: Color, moves: Position[], from: Position, enPassantTarget: Position | null): Position[] => {
    return moves.filter(to => {
        const tempBoard = JSON.parse(JSON.stringify(board));
        const piece = { ...tempBoard[from.row][from.col]! };

        if (piece.type === PieceType.Pawn && enPassantTarget && to.row === enPassantTarget.row && to.col === enPassantTarget.col) {
            tempBoard[from.row][to.col] = null;
        }

        tempBoard[to.row][to.col] = piece;
        tempBoard[from.row][from.col] = null;

        return !isKingInCheck(tempBoard, color);
    });
};


export const getValidMoves = (board: BoardState, pos: Position, enPassantTarget: Position | null, allowSelfCheck: boolean, isPremove = false): Position[] => {
    const piece = board[pos.row][pos.col];
    if (!piece) return [];

    let moves = getMovesForPieceType(board, pos, piece.type, enPassantTarget, false, isPremove);

    if (piece.power) {
        // Pass enPassantTarget for pawn power moves
        const powerMoves = getMovesForPieceType(board, pos, piece.power, enPassantTarget, false, isPremove);
        moves.push(...powerMoves);
    }

    const uniqueMoves = Array.from(new Set(moves.map(m => `${m.row},${m.col}`)))
        .map(s => {
            const [row, col] = s.split(',').map(Number);
            return { row, col };
        });

    if (isPremove) {
        return uniqueMoves;
    }

    if (allowSelfCheck) {
        return uniqueMoves;
    }

    return filterLegalMoves(board, piece.color, uniqueMoves, pos, enPassantTarget);
};

export const isPowerMove = (board: BoardState, from: Position, to: Position, enPassantTarget: Position | null): boolean => {
    const piece = board[from.row][from.col];
    if (!piece || !piece.power) return false;

    const standardMoves = getMovesForPieceType(board, from, piece.type, enPassantTarget);
    const isStandard = standardMoves.some(m => m.row === to.row && m.col === to.col);
    if (isStandard) return false;

    const powerMoves = getMovesForPieceType(board, from, piece.power, enPassantTarget);
    return powerMoves.some(m => m.row === to.row && m.col === to.col);
};

export const isAmbiguousMove = (board: BoardState, from: Position, to: Position, enPassantTarget: Position | null): boolean => {
    const piece = board[from.row][from.col];
    if (!piece || !piece.power) return false;

    // A move is not ambiguous if it's a capture, as that has a clear outcome (gaining a new power).
    // The ambiguity only applies to non-capturing moves where the power might be consumed.
    if (board[to.row][to.col]) {
        return false;
    }

    const standardMoves = getMovesForPieceType(board, from, piece.type, enPassantTarget);
    const isStandard = standardMoves.some(m => m.row === to.row && m.col === to.col);

    if (!isStandard) return false; // If it's not a standard move, it can't be ambiguous

    const powerMoves = getMovesForPieceType(board, from, piece.power, enPassantTarget);
    const isPower = powerMoves.some(m => m.row === to.row && m.col === to.col);

    return isPower; // It's ambiguous if it's both a standard move and a power move.
};

export interface ResolveMoveOptions {
    isForcePower?: boolean;
    enPassantChoice?: 'move' | 'capture' | null;
    promotion?: PieceType | null;
}

interface ResolvedMoveBase {
    board: BoardState;
    capturedPieces: Record<Color, Piece[]>;
    resetHalfmoveClock: boolean;
    movingPiece: Piece;
    capturedPiece: Piece | null;
    wasPowerMove: boolean;
    wasForcedPowerMove: boolean;
}

export type ResolveMoveResult =
    | { kind: 'invalid' }
    | { kind: 'ambiguous_en_passant'; from: Position; to: Position }
    | (ResolvedMoveBase & {
        kind: 'promotion';
        promotionData: PromotionData;
    })
    | (ResolvedMoveBase & {
        kind: 'move';
        enPassantTarget: Position | null;
        promotion: PieceType | null;
        kingCaptured: boolean;
    });

// Shared move application used by live play, analysis, PGN import and review.
// Mirrors the rules previously implemented only in App.movePiece: power use,
// forced power, en passant, promotion, king capture and castling.
export const resolveMove = (
    board: BoardState,
    capturedPieces: Record<Color, Piece[]>,
    enPassantTarget: Position | null,
    turn: Color,
    from: Position,
    to: Position,
    options: ResolveMoveOptions = {}
): ResolveMoveResult => {
    const inBounds = (position: Position) =>
        position.row >= 0 && position.row < 8 && position.col >= 0 && position.col < 8;
    if (!inBounds(from) || !inBounds(to)) return { kind: 'invalid' };

    const sourcePiece = board[from.row]?.[from.col];
    if (!sourcePiece || sourcePiece.color !== turn) return { kind: 'invalid' };

    const newBoard = board.map(row => [...row]);
    const pieceToMove = { ...sourcePiece };
    const capturedPieceOnTarget = newBoard[to.row][to.col];
    let resetHalfmoveClock = pieceToMove.type === PieceType.Pawn;

    const newCapturedPieces: Record<Color, Piece[]> = {
        white: [...(capturedPieces?.white || [])],
        black: [...(capturedPieces?.black || [])],
    };

    const wasPowerMove = isPowerMove(board, from, to, enPassantTarget);
    const wasAmbiguousMove = isAmbiguousMove(board, from, to, enPassantTarget);
    const useForcePower = !!options.isForcePower;
    const wasForcedPowerMove = useForcePower && wasAmbiguousMove;
    const isEnPassantCapture = (pieceToMove.type === PieceType.Pawn || pieceToMove.power === PieceType.Pawn) &&
        enPassantTarget && to.row === enPassantTarget.row && to.col === enPassantTarget.col && !capturedPieceOnTarget;
    const isAmbiguousEnPassant = isEnPassantCapture && pieceToMove.power === PieceType.Pawn &&
        [PieceType.Queen, PieceType.Bishop, PieceType.King].includes(pieceToMove.originalType);

    if (isAmbiguousEnPassant && !useForcePower && !options.enPassantChoice) {
        return { kind: 'ambiguous_en_passant', from, to };
    }

    // Resolve the ambiguous en passant as "move without capturing": keep pawn power.
    if (isAmbiguousEnPassant && options.enPassantChoice === 'move') {
        pieceToMove.power = PieceType.Pawn;
        pieceToMove.hasMoved = true;
        newBoard[to.row][to.col] = pieceToMove;
        newBoard[from.row][from.col] = null;
        return {
            kind: 'move',
            board: newBoard,
            capturedPieces: newCapturedPieces,
            enPassantTarget: null,
            resetHalfmoveClock: true,
            movingPiece: pieceToMove,
            capturedPiece: null,
            promotion: null,
            wasPowerMove,
            wasForcedPowerMove: false,
            kingCaptured: false,
        };
    }

    let actualCapturedPiece: Piece | null = capturedPieceOnTarget;
    if (isEnPassantCapture) {
        actualCapturedPiece = newBoard[from.row][to.col];
        newBoard[from.row][to.col] = null;
    }

    const wasCapture = !!actualCapturedPiece;
    let acquiredPower: PieceType | null = null;
    let kingCaptured = false;

    if (wasCapture && actualCapturedPiece) {
        resetHalfmoveClock = true;
        acquiredPower = actualCapturedPiece.originalType;
        newCapturedPieces[actualCapturedPiece.color].push(actualCapturedPiece);

        if (actualCapturedPiece.isKing || actualCapturedPiece.originalType === PieceType.King) {
            kingCaptured = true;
        }
    }

    const isPotentialCastle = pieceToMove.type === PieceType.King &&
        from.row === to.row &&
        Math.abs(to.col - from.col) === 2;

    if (kingCaptured) {
        pieceToMove.power = acquiredPower;
        pieceToMove.hasMoved = true;
        newBoard[to.row][to.col] = pieceToMove;
        newBoard[from.row][from.col] = null;

        return {
            kind: 'move',
            board: newBoard,
            capturedPieces: newCapturedPieces,
            enPassantTarget: null,
            resetHalfmoveClock,
            movingPiece: pieceToMove,
            capturedPiece: actualCapturedPiece,
            promotion: null,
            wasPowerMove,
            wasForcedPowerMove,
            kingCaptured: true,
        };
    }

    const promotionRank = turn === Color.White ? 0 : 7;
    const isMovingToPromotionRank = to.row === promotionRank;
    const hasPawnAbility = pieceToMove.type === PieceType.Pawn || pieceToMove.power === PieceType.Pawn;
    const isCapturingPawnOnPromotionRank = wasCapture &&
        actualCapturedPiece?.originalType === PieceType.Pawn &&
        isMovingToPromotionRank;

    if ((isMovingToPromotionRank && hasPawnAbility) || isCapturingPawnOnPromotionRank) {
        let powerAfterPromotion: PieceType | null = null;
        if (wasForcedPowerMove) {
            powerAfterPromotion = null;
        } else if (isCapturingPawnOnPromotionRank) {
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

        if (options.promotion) {
            const promotedPiece: Piece = {
                ...pieceToMove,
                type: options.promotion,
                originalType: pieceToMove.originalType,
                isKing: pieceToMove.isKing || pieceToMove.originalType === PieceType.King,
                hasMoved: true,
                power: powerAfterPromotion,
            };
            newBoard[to.row][to.col] = promotedPiece;
            newBoard[from.row][from.col] = null;

            return {
                kind: 'move',
                board: newBoard,
                capturedPieces: newCapturedPieces,
                enPassantTarget: null,
                resetHalfmoveClock: true,
                movingPiece: pieceToMove,
                capturedPiece: actualCapturedPiece,
                promotion: options.promotion,
                wasPowerMove,
                wasForcedPowerMove,
                kingCaptured: false,
            };
        }

        pieceToMove.hasMoved = true;
        newBoard[to.row][to.col] = pieceToMove;
        newBoard[from.row][from.col] = null;

        return {
            kind: 'promotion',
            board: newBoard,
            capturedPieces: newCapturedPieces,
            resetHalfmoveClock: true,
            movingPiece: pieceToMove,
            capturedPiece: actualCapturedPiece,
            wasPowerMove,
            wasForcedPowerMove,
            promotionData: {
                from,
                position: to,
                promotingPiece: pieceToMove,
                powerAfterPromotion,
                capturedPiece: actualCapturedPiece,
            },
        };
    }

    let powerAfterMove = pieceToMove.power;
    if (wasCapture) {
        powerAfterMove = acquiredPower;
    } else if (useForcePower && wasAmbiguousMove) {
        powerAfterMove = null;
    } else if (wasPowerMove) {
        powerAfterMove = null;
    }

    pieceToMove.power = powerAfterMove;
    pieceToMove.hasMoved = true;
    newBoard[to.row][to.col] = pieceToMove;
    newBoard[from.row][from.col] = null;

    if (isPotentialCastle && !wasCapture && !wasPowerMove && !wasForcedPowerMove) {
        const rookCol = to.col === 6 ? 7 : 0;
        const newRookCol = to.col === 6 ? 5 : 3;
        const rook = newBoard[from.row][rookCol];
        if (rook?.type === PieceType.Rook && rook.color === pieceToMove.color && !rook.hasMoved) {
            newBoard[from.row][newRookCol] = { ...rook, hasMoved: true };
            newBoard[from.row][rookCol] = null;
        }
    }

    const nextEnPassantTarget: Position | null = (pieceToMove.type === PieceType.Pawn && Math.abs(to.row - from.row) === 2)
        ? { row: from.row + (to.row - from.row) / 2, col: from.col }
        : null;

    return {
        kind: 'move',
        board: newBoard,
        capturedPieces: newCapturedPieces,
        enPassantTarget: nextEnPassantTarget,
        resetHalfmoveClock,
        movingPiece: pieceToMove,
        capturedPiece: actualCapturedPiece,
        promotion: null,
        wasPowerMove,
        wasForcedPowerMove,
        kingCaptured: false,
    };
};

export const findKingPosition = (board: BoardState, color: Color): Position | null => {
    // Priority 1: Piece with isKing = true
    for (let r = 0; r < 8; r++) {
        for (let c = 0; c < 8; c++) {
            const p = board[r][c];
            if (p && p.color === color && p.isKing) return { row: r, col: c };
        }
    }
    // Priority 2: Piece with originalType = King (fallback)
    for (let r = 0; r < 8; r++) {
        for (let c = 0; c < 8; c++) {
            const p = board[r][c];
            if (p && p.color === color && p.originalType === PieceType.King) return { row: r, col: c };
        }
    }
    return null;
};

export const isKingInCheck = (board: BoardState, kingColor: Color): boolean => {
    const kingPos = findKingPosition(board, kingColor);
    if (!kingPos) return false; // A missing king is not a check, it's a capture win.

    const opponentColor = kingColor === Color.White ? Color.Black : Color.White;
    return isSquareAttacked(board, kingPos, opponentColor);
};

export const hasLegalMoves = (board: BoardState, color: Color, enPassantTarget: Position | null): boolean => {
    for (let r = 0; r < 8; r++) {
        for (let c = 0; c < 8; c++) {
            const piece = board[r][c];
            if (piece && piece.color === color) {
                if (getValidMoves(board, { row: r, col: c }, enPassantTarget, false).length > 0) {
                    return true;
                }
            }
        }
    }
    return false;
}

export const canCaptureKing = (board: BoardState, attackerColor: Color): boolean => {
    const opponentColor = attackerColor === Color.White ? Color.Black : Color.White;
    const opponentKingPos = findKingPosition(board, opponentColor);

    if (!opponentKingPos) {
        return true;
    }

    for (let r = 0; r < 8; r++) {
        for (let c = 0; c < 8; c++) {
            const piece = board[r][c];
            if (piece && piece.color === attackerColor) {
                const moves = getValidMoves(board, { row: r, col: c }, null, true);
                if (moves.some(move => move.row === opponentKingPos.row && move.col === opponentKingPos.col)) {
                    return true;
                }
            }
        }
    }
    return false;
};

export const isInsufficientMaterial = (board: BoardState, color?): boolean => {
    return false; //you can always capture the king
    var whitepieces = new Array<Piece>();
    var blackpieces = new Array<Piece>();
    for (let r = 0; r < 8; r++) {
        for (let c = 0; c < 8; c++) {
            const piece = board[r][c];
            if (!piece) continue;
            if (piece.color === Color.White) whitepieces.push(piece);
            else blackpieces.push(piece);
        }
    }
    //white check
    if (color === Color.White) {
        if (whitepieces.length >= 3) return false;
        //king vs king
        if (whitepieces.length === 1) {
            if (whitepieces[0].originalType === PieceType.King) {
                if (whitepieces[0].type === PieceType.Queen) {
                    if (whitepieces[0].power === PieceType.Knight) return false;
                    else return true;
                }
                if (whitepieces[0].type === PieceType.Knight && whitepieces[0].power === PieceType.Queen) return false;
                else return true;
            }
            else return true;
        }
        if (whitepieces.length === 2) {
            const first = whitepieces[0]
            const second = whitepieces[1]
            //no powers case
            if (first.power === null && second.power === null) {
                if (first.type === PieceType.King || second.type === PieceType.King) {
                    if (first.type === PieceType.Knight || first.type === PieceType.Bishop || second.type === PieceType.Knight || second.type === PieceType.Bishop) return true;
                    else return false;
                }
            }
        }
    }
    //black check
    if (color === Color.Black) {
        if (blackpieces.length >= 3) return false;
    }
    //no color check
    if (color === null) {
        if (whitepieces.length >= 3 || blackpieces.length >= 3) return false;
    }
    return true;
};

export const generateBoardKey = (board: BoardState, turn: Color, enPassantTarget: Position | null): string => {
    let key = '';
    const pieceToChar = (p: Piece) => {
        let char = '';
        switch (p.type) {
            case PieceType.Pawn: char = 'p'; break;
            case PieceType.Knight: char = 'n'; break;
            case PieceType.Bishop: char = 'b'; break;
            case PieceType.Rook: char = 'r'; break;
            case PieceType.Queen: char = 'q'; break;
            case PieceType.King: char = 'k'; break;
        }
        return p.color === Color.White ? char.toUpperCase() : char;
    };

    for (let r = 0; r < 8; r++) {
        let emptyCount = 0;
        for (let c = 0; c < 8; c++) {
            const piece = board[r][c];
            if (piece) {
                if (emptyCount > 0) {
                    key += emptyCount;
                    emptyCount = 0;
                }
                key += pieceToChar(piece);
                if (piece.power) {
                    key += `(${piece.power[0]})`;
                }
            } else {
                emptyCount++;
            }
        }
        if (emptyCount > 0) {
            key += emptyCount;
        }
        if (r < 7) {
            key += '-';
        }
    }

    key += `|${turn[0]}`;

    if (enPassantTarget) {
        const file = 'abcdefgh'[enPassantTarget.col];
        const rank = 8 - enPassantTarget.row;
        key += `|${file}${rank}`;
    } else {
        key += '|-';
    }

    return key;
};

export const getNotation = (
    board: BoardState,
    from: Position,
    to: Position,
    piece: Piece,
    captured: Piece | null,
    promotion: PieceType | null,
    isForcePower: boolean = false,
    isCastle?: boolean
): string => {
    const cols = 'abcdefgh';
    const rows = '87654321';

    const fromSquare = `${cols[from.col]}${rows[from.row]}`;
    const toSquare = `${cols[to.col]}${rows[to.row]}`;

    if (
        piece.originalType === PieceType.King &&
        from.row === to.row &&
        Math.abs(to.col - from.col) === 2 &&
        !captured
    ) {
        const kingFromBoard = board[from.row][from.col];
        const castleMove = isCastle ?? (!piece.power && !(kingFromBoard && kingFromBoard.power));
        if (castleMove) {
            let notation = to.col > from.col ? 'O-O' : 'O-O-O';
            if (isForcePower) {
                notation += '^';
            }
            return notation;
        }
    }

    let pieceChar = '';
    switch (piece.originalType) { // Use original type for notation
        case PieceType.King: pieceChar = 'K'; break;
        case PieceType.Queen: pieceChar = 'Q'; break;
        case PieceType.Rook: pieceChar = 'R'; break;
        case PieceType.Bishop: pieceChar = 'B'; break;
        case PieceType.Knight: pieceChar = 'N'; break;
        case PieceType.Pawn: pieceChar = ''; break;
    }

    const captureChar = captured ? 'x' : '-';

    let notation = `${pieceChar}${fromSquare}${captureChar}${toSquare}`;

    if (promotion) {
        let promChar = '';
        switch (promotion) {
            case PieceType.Queen: promChar = 'Q'; break;
            case PieceType.Rook: promChar = 'R'; break;
            case PieceType.Bishop: promChar = 'B'; break;
            case PieceType.Knight: promChar = 'N'; break;
            case PieceType.King: promChar = 'K'; break;
        }
        notation += `=${promChar}`;
    }

    if (isForcePower) {
        notation += '^';
    }

    return notation;
};

// Builds a move-history record from the pre-move and post-move boards.
// Shared so live play and analysis produce identical notation and metadata.
export const createMoveRecord = (
    boardBefore: BoardState,
    boardAfter: BoardState,
    from: Position,
    to: Position,
    movingPiece: Piece,
    capturedPiece: Piece | null,
    promotion: PieceType | null,
    isForcePower: boolean = false
): Move => {
    const twoFiles = from.row === to.row && Math.abs(to.col - from.col) === 2;

    let isCastle = false;
    if (movingPiece.originalType === PieceType.King && twoFiles && !capturedPiece) {
        const rookFromCol = to.col > from.col ? 7 : 0;
        const rookToCol = to.col > from.col ? 5 : 3;
        const beforeRook = boardBefore[from.row]?.[rookFromCol];
        const afterRook = boardAfter[from.row]?.[rookToCol];
        isCastle = !!beforeRook &&
            beforeRook.type === PieceType.Rook &&
            beforeRook.color === movingPiece.color &&
            !boardBefore[from.row]?.[rookToCol] &&
            !!afterRook &&
            afterRook.type === PieceType.Rook &&
            afterRook.color === movingPiece.color &&
            !boardAfter[from.row]?.[rookFromCol];
    }

    const notation = getNotation(boardBefore, from, to, movingPiece, capturedPiece, promotion, isForcePower, isCastle);
    const pieceOnNewBoard = boardAfter[to.row]?.[to.col];
    const afterPower = pieceOnNewBoard ? pieceOnNewBoard.power : null;
    const pieceBefore = boardBefore[from.row]?.[from.col];
    const powerBefore = pieceBefore ? pieceBefore.power : movingPiece.power;
    const powerConsumed = !!(powerBefore && !afterPower);

    const isEnPassant = !!capturedPiece &&
        !boardBefore[to.row]?.[to.col] &&
        (movingPiece.type === PieceType.Pawn || movingPiece.power === PieceType.Pawn);

    const move: Move = {
        from,
        to,
        piece: movingPiece.type || PieceType.Pawn,
        notation,
        color: movingPiece.color,
        afterPower: afterPower || null,
        isForcePower: !!isForcePower,
        powerConsumed,
        isCastle,
        isEnPassant,
    };

    if (capturedPiece) {
        move.captured = capturedPiece.type;
    }
    if (promotion) {
        move.promotion = promotion;
    }

    return move;
};

export const getBoardBeforePromotion = (boardAfter: BoardState, promotionData: PromotionData): BoardState => {
    const boardBefore = boardAfter.map(row => [...row]);
    boardBefore[promotionData.position.row][promotionData.position.col] = promotionData.capturedPiece || null;
    boardBefore[promotionData.from.row][promotionData.from.col] = promotionData.promotingPiece;
    return boardBefore;
};

// A simple move applicator for the review system that doesn't require full validation
export const applyMoveToBoard = (board: BoardState, move: Move): BoardState => {
    const newBoard = sanitizeBoard(board);
    if (!newBoard[move.from.row] || !newBoard[move.from.row][move.from.col]) return newBoard;
    const piece = { ...newBoard[move.from.row][move.from.col]! };
    const powerBefore = piece.power;

    // Update piece state
    piece.hasMoved = true;
    if (move.promotion) {
        piece.type = move.promotion;
    }

    // En passant: a recorded capture on an empty target square can only be en passant.
    const isEnPassant = move.isEnPassant ?? (!!move.captured && !newBoard[move.to.row]?.[move.to.col]);
    if (isEnPassant) {
        newBoard[move.from.row][move.to.col] = null;
    }

    // Move the piece
    newBoard[move.to.row][move.to.col] = piece;
    newBoard[move.from.row][move.from.col] = null;

    // Update Power from move history if available (for correct replay)
    // Priority 1: Explicit consumption flag
    if (move.powerConsumed) {
        piece.power = null;
    }
    // Priority 2: Explicitly provided afterPower (if not undefined)
    else if (move.afterPower !== undefined) {
        piece.power = move.afterPower;
    }
    // Priority 3: Force Power implies consumption if not already handled
    else if (move.isForcePower) {
        piece.power = null;
    }

    // Castling: only when this was actually a castle, never for a King power move.
    // Legacy records have no isCastle flag and used notation like "Ke1-g1", so fall
    // back to the old behaviour unless the record shows a King power move was used.
    const notationIsCastle = /^O-O(?:-O)?\^?$/.test(move.notation || '');
    const legacyKingPowerMove = move.afterPower === null && !!powerBefore;
    const seenAsCastle = move.isCastle ?? (
        notationIsCastle || (
            move.piece === PieceType.King &&
            move.from.row === move.to.row &&
            Math.abs(move.from.col - move.to.col) === 2 &&
            !move.captured &&
            !move.powerConsumed &&
            !move.isForcePower &&
            !legacyKingPowerMove
        )
    );

    if (seenAsCastle) {
        const isKingside = move.to.col > move.from.col;
        const rookFromCol = isKingside ? 7 : 0;
        const rookToCol = isKingside ? 5 : 3;
        const rook = newBoard[move.from.row][rookFromCol];
        if (rook && rook.type === PieceType.Rook && rook.color === piece.color) {
            newBoard[move.from.row][rookToCol] = { ...rook, hasMoved: true };
            newBoard[move.from.row][rookFromCol] = null;
        }
    }

    return newBoard;
};

export const posToNotation = (row: number, col: number): string => {
    return String.fromCharCode(97 + col) + (8 - row);
};

export const notationToPos = (notation: string): Position | null => {
    if (notation.length !== 2) return null;
    const col = notation.charCodeAt(0) - 97;
    const row = 8 - parseInt(notation[1]);
    if (isNaN(row) || col < 0 || col > 7 || row < 0 || row > 7) return null;
    return { row, col };
};

export const boardToFen = (gameState: any): string => {
    const { board, turn, enPassantTarget, halfmoveClock, moveHistory = [] } = gameState;
    let fen = '';

    // 1. Piece placement
    for (let r = 0; r < 8; r++) {
        let emptyCount = 0;
        for (let c = 0; c < 8; c++) {
            const piece = board[r][c];
            if (!piece) {
                emptyCount++;
            } else {
                if (emptyCount > 0) {
                    fen += emptyCount;
                    emptyCount = 0;
                }
                const char = piece.type === PieceType.Knight ? 'N' : piece.type.charAt(0).toUpperCase();
                fen += piece.color === Color.White ? char : char.toLowerCase();
            }
        }
        if (emptyCount > 0) fen += emptyCount;
        if (r < 7) fen += '/';
    }

    // 2. Side to move
    fen += ` ${turn === Color.White ? 'w' : 'b'}`;

    // 3. Castling rights
    let castling = '';
    const whiteKing = board[7][4];
    if (whiteKing && whiteKing.type === PieceType.King && whiteKing.color === Color.White && !whiteKing.hasMoved) {
        const whiteKSRook = board[7][7];
        if (whiteKSRook && whiteKSRook.type === PieceType.Rook && whiteKSRook.color === Color.White && !whiteKSRook.hasMoved) castling += 'K';
        const whiteQSRook = board[7][0];
        if (whiteQSRook && whiteQSRook.type === PieceType.Rook && whiteQSRook.color === Color.White && !whiteQSRook.hasMoved) castling += 'Q';
    }
    const blackKing = board[0][4];
    if (blackKing && blackKing.type === PieceType.King && blackKing.color === Color.Black && !blackKing.hasMoved) {
        const blackKSRook = board[0][7];
        if (blackKSRook && blackKSRook.type === PieceType.Rook && blackKSRook.color === Color.Black && !blackKSRook.hasMoved) castling += 'k';
        const blackQSRook = board[0][0];
        if (blackQSRook && blackQSRook.type === PieceType.Rook && blackQSRook.color === Color.Black && !blackQSRook.hasMoved) castling += 'q';
    }
    fen += ` ${castling || '-'}`;

    // 4. En passant target
    fen += ` ${enPassantTarget ? posToNotation(enPassantTarget.row, enPassantTarget.col) : '-'}`;

    // 5. Halfmove clock
    fen += ` ${halfmoveClock || 0}`;

    // 6. Fullmove counter
    const fullmove = Math.floor(moveHistory.length / 2) + 1;
    fen += ` ${fullmove}`;

    return fen;
};

export const boardToKrachtschaakFen = (gameState: any): string => {
    const { board, turn, enPassantTarget, halfmoveClock, moveHistory = [] } = gameState;
    let fen = '';

    const pieceToChar = (p: PieceType) => p === PieceType.Knight ? 'n' : p.charAt(0).toLowerCase();

    for (let r = 0; r < 8; r++) {
        let emptyCount = 0;
        for (let c = 0; c < 8; c++) {
            const piece = board[r][c];
            if (!piece) {
                emptyCount++;
            } else {
                if (emptyCount > 0) {
                    fen += emptyCount;
                    emptyCount = 0;
                }
                const isWhite = piece.color === Color.White;
                let char = pieceToChar(piece.type);
                if (isWhite) char = char.toUpperCase();
                
                let pieceStr = char;
                if (piece.originalType !== piece.type || piece.power || piece.isKing !== (piece.type === PieceType.King)) {
                    let origChar = pieceToChar(piece.originalType);
                    let powerChar = piece.power ? pieceToChar(piece.power) : '';
                    let kingFlag = piece.isKing ? '1' : '0';
                    pieceStr += `[${origChar},${powerChar},${kingFlag}]`;
                }
                fen += pieceStr;
            }
        }
        if (emptyCount > 0) fen += emptyCount;
        if (r < 7) fen += '/';
    }

    fen += ` ${turn === Color.White ? 'w' : 'b'}`;

    let castling = '';
    const whiteKing = board[7][4];
    if (whiteKing && whiteKing.isKing && whiteKing.color === Color.White && !whiteKing.hasMoved) {
        const whiteKSRook = board[7][7];
        if (whiteKSRook && whiteKSRook.type === PieceType.Rook && whiteKSRook.color === Color.White && !whiteKSRook.hasMoved) castling += 'K';
        const whiteQSRook = board[7][0];
        if (whiteQSRook && whiteQSRook.type === PieceType.Rook && whiteQSRook.color === Color.White && !whiteQSRook.hasMoved) castling += 'Q';
    }
    const blackKing = board[0][4];
    if (blackKing && blackKing.isKing && blackKing.color === Color.Black && !blackKing.hasMoved) {
        const blackKSRook = board[0][7];
        if (blackKSRook && blackKSRook.type === PieceType.Rook && blackKSRook.color === Color.Black && !blackKSRook.hasMoved) castling += 'k';
        const blackQSRook = board[0][0];
        if (blackQSRook && blackQSRook.type === PieceType.Rook && blackQSRook.color === Color.Black && !blackQSRook.hasMoved) castling += 'q';
    }
    fen += ` ${castling || '-'}`;

    fen += ` ${enPassantTarget ? posToNotation(enPassantTarget.row, enPassantTarget.col) : '-'}`;
    fen += ` ${halfmoveClock || 0}`;
    const fullmove = moveHistory ? Math.floor(moveHistory.length / 2) + 1 : 1;
    fen += ` ${fullmove}`;

    return fen;
};

export const fenToBoard = (fen: string): Partial<any> | null => {
    const parts = fen.trim().split(/\s+/);
    if (parts.length < 1) return null;

    const board: BoardState = Array(8).fill(null).map(() => Array(8).fill(null));
    const rows = parts[0].split('/');
    if (rows.length !== 8) return null;

    for (let r = 0; r < 8; r++) {
        let c = 0;
        let i = 0;
        const rowStr = rows[r];
        while (i < rowStr.length) {
            const char = rowStr[i];
            if (/\d/.test(char)) {
                c += parseInt(char);
                i++;
            } else {
                const color = char === char.toUpperCase() ? Color.White : Color.Black;
                const typeChar = char.toLowerCase();
                let type: PieceType = PieceType.Pawn;
                if (typeChar === 'n') type = PieceType.Knight;
                else if (typeChar === 'b') type = PieceType.Bishop;
                else if (typeChar === 'r') type = PieceType.Rook;
                else if (typeChar === 'q') type = PieceType.Queen;
                else if (typeChar === 'k') type = PieceType.King;

                let originalType = type;
                let power: PieceType | null = null;
                let isKing = type === PieceType.King;

                i++;
                if (i < rowStr.length && rowStr[i] === '[') {
                    const endIdx = rowStr.indexOf(']', i);
                    if (endIdx !== -1) {
                        const extraStr = rowStr.substring(i + 1, endIdx);
                        const [oChar, pChar, kChar] = extraStr.split(',');
                        
                        const charToType = (ch: string) => {
                            if (!ch) return null;
                            if (ch === 'n') return PieceType.Knight;
                            if (ch === 'b') return PieceType.Bishop;
                            if (ch === 'r') return PieceType.Rook;
                            if (ch === 'q') return PieceType.Queen;
                            if (ch === 'k') return PieceType.King;
                            return PieceType.Pawn;
                        };
                        
                        if (oChar) originalType = charToType(oChar) || type;
                        if (pChar) power = charToType(pChar);
                        if (kChar) isKing = kChar === '1';

                        i = endIdx + 1;
                    }
                }

                board[r][c] = {
                    type,
                    color,
                    power,
                    originalType,
                    isKing,
                    hasMoved: true // Default to true, will fix with castling rights
                };
                c++;
            }
        }
    }

    const turn = parts[1] === 'b' ? Color.Black : Color.White;
    const castling = parts[2] || '-';
    // Reset hasMoved for Kings/Rooks based on castling rights
    if (castling.includes('K')) { if (board[7][4]) board[7][4]!.hasMoved = false; if (board[7][7]) board[7][7]!.hasMoved = false; }
    if (castling.includes('Q')) { if (board[7][4]) board[7][4]!.hasMoved = false; if (board[7][0]) board[7][0]!.hasMoved = false; }
    if (castling.includes('k')) { if (board[0][4]) board[0][4]!.hasMoved = false; if (board[0][7]) board[0][7]!.hasMoved = false; }
    if (castling.includes('q')) { if (board[0][4]) board[0][4]!.hasMoved = false; if (board[0][0]) board[0][0]!.hasMoved = false; }

    const ep = parts[3] && parts[3] !== '-' ? notationToPos(parts[3]) : null;
    const halfmove = parseInt(parts[4]) || 0;

    return { board, turn, enPassantTarget: ep, halfmoveClock: halfmove, status: 'playing' as any };
};

export const generatePGN = (moveHistory: Move[], result: string = "*", initialFen?: string): string => {
    let pgn = "";
    const defaultFen = "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1";
    if (initialFen && initialFen !== defaultFen) {
        pgn += `[FEN "${initialFen}"]\n`;
        pgn += `[SetUp "1"]\n\n`;
    }
    for (let i = 0; i < moveHistory.length; i++) {
        const moveNum = Math.floor(i / 2) + 1;
        if (i % 2 === 0) {
            pgn += moveNum + ". ";
        }
        pgn += moveHistory[i].notation + " ";
    }
    return pgn.trim() + " " + result;
};