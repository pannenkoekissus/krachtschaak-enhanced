
// DO NOT MODIFY THIS FILE UNLESS INSTRUCTED TO DO SO
import { BoardState, Piece, PieceType, Color, Position, Square, Move } from '../types';

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
                const potentialAttacks = getMovesForPieceType(board, { row: r, col: c }, piece.type, null, true)
                    .concat(piece.power ? getMovesForPieceType(board, { row: r, col: c }, piece.power, null, true) : []);

                if (potentialAttacks.some(m => m.row === position.row && m.col === position.col)) {
                    return true;
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
    if (!piece.hasMoved) {
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
    if (!piece.hasMoved && !isKingInCheck(board, piece.color)) {
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

export const findKingPosition = (board: BoardState, color: Color): Position | null => {
    for (let r = 0; r < 8; r++) {
        for (let c = 0; c < 8; c++) {
            const piece = board[r][c];
            if (piece && piece.color === color && piece.isKing) {
                return { row: r, col: c };
            }
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
    isForcePower: boolean = false
): string => {
    const cols = 'abcdefgh';
    const rows = '87654321';

    const fromSquare = `${cols[from.col]}${rows[from.row]}`;
    const toSquare = `${cols[to.col]}${rows[to.row]}`;

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
        }
        notation += `=${promChar}`;
    }

    if (isForcePower) {
        notation += '^';
    }

    return notation;
};

// A simple move applicator for the review system that doesn't require full validation
export const applyMoveToBoard = (board: BoardState, move: Move): BoardState => {
    if (!board || !Array.isArray(board)) return createInitialBoard();
    const newBoard = board.map(row => (Array.isArray(row) ? [...row] : Array(8).fill(null)));
    const piece = { ...newBoard[move.from.row][move.from.col]! };

    // Update piece state
    piece.hasMoved = true;
    if (move.promotion) {
        piece.type = move.promotion;
        piece.originalType = move.promotion; // In this game variant, promotion changes identity
    }

    // Handle Capture Logic for Board Update (removing captured piece)
    // Standard capture is overwriting target. 
    // En Passant: target is empty but capture happens.
    if (move.piece === PieceType.Pawn && move.captured && !newBoard[move.to.row][move.to.col]) {
        // En Passant capture
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

    // Castling: Move the rook
    if (move.piece === PieceType.King && Math.abs(move.from.col - move.to.col) === 2) {
        const row = move.from.row;
        const isKingside = move.to.col > move.from.col;
        const rookFromCol = isKingside ? 7 : 0;
        const rookToCol = isKingside ? 5 : 3;
        const rook = newBoard[row][rookFromCol];
        if (rook) {
            newBoard[row][rookToCol] = { ...rook, hasMoved: true };
            newBoard[row][rookFromCol] = null;
        }
    }

    return newBoard;
}