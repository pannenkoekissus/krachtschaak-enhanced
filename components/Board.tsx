// DO NOT MODIFY THIS FILE UNLESS INSTRUCTED TO DO SO
import React, { useCallback } from 'react';
import { BoardState, Position, Color, GameMode } from '../types';
import Piece from './Piece';

interface BoardProps {
    board: BoardState;
    selectedPiece: Position | null;
    validMoves: Position[];
    onSquareClick: (row: number, col: number) => void;
    turn: Color;
    playerColor: Color | null; // For online mode orientation
    gameMode: GameMode;
    isInteractionDisabled: boolean;
    // Drag and Drop props
    onPieceDragStart: (e: React.DragEvent, row: number, col: number) => void;
    onPieceDragEnd: (e: React.DragEvent) => void;
    onSquareDrop: (e: React.DragEvent, row: number, col: number) => void;
    draggedPiece: Position | null;
    premove: { from: Position, to: Position } | null;
    // Highlighting and arrows
    lastMove: { from: Position, to: Position } | null;
    highlightedSquares: Position[];
    arrows: { from: Position, to: Position }[];
    onBoardMouseDown: (e: React.MouseEvent, row: number, col: number) => void;
    onBoardMouseUp: (e: React.MouseEvent, row: number, col: number) => void;
    onBoardContextMenu: (e: React.MouseEvent) => void;
    showPowerPieces?: boolean;
    showPowerRings?: boolean;
    showOriginalType?: boolean;
}

const Board: React.FC<BoardProps> = ({
    board, selectedPiece, validMoves, onSquareClick, turn, playerColor, gameMode, isInteractionDisabled,
    onPieceDragStart, onPieceDragEnd, onSquareDrop, draggedPiece, premove,
    lastMove, highlightedSquares, arrows, onBoardMouseDown, onBoardMouseUp, onBoardContextMenu,
    showPowerPieces = true, showPowerRings = true, showOriginalType = true
}) => {
    const handleDragOver = (e: React.DragEvent) => {
        e.preventDefault(); // This is necessary to allow dropping
    };

    // In local mode, flip for black's turn. In online mode, flip if player is black.
    const isFlipped = (gameMode === 'online_playing' ? playerColor === Color.Black : turn === Color.Black) && (gameMode !== 'online_spectating');

    const renderSquare = (row: number, col: number) => {
        const piece = board[row][col];
        const isLight = (row + col) % 2 === 0;
        const bgColor = isLight ? 'bg-gray-400' : 'bg-green-800';

        const isSelected = selectedPiece && selectedPiece.row === row && selectedPiece.col === col;
        const isMoveTarget = validMoves.some(move => move.row === row && move.col === col);
        const isPremoveSource = premove && premove.from.row === row && premove.from.col === col;
        const isPremoveTarget = premove && premove.to.row === row && premove.to.col === col;
        const isLastMove = lastMove && ((lastMove.from.row === row && lastMove.from.col === col) || (lastMove.to.row === row && lastMove.to.col === col));
        const isHighlighted = highlightedSquares.some(p => p.row === row && p.col === col);

        const overlays: React.ReactNode[] = [];

        if (isLastMove) {
            overlays.push(<div key="last-move" className="absolute inset-0 bg-yellow-500 opacity-40"></div>);
        }
        if (isHighlighted) {
            overlays.push(<div key="highlight" className="absolute inset-0 bg-green-600 opacity-50"></div>);
        }
        if (isPremoveSource || isPremoveTarget) {
            overlays.push(<div key="premove" className="absolute inset-0 bg-purple-500 opacity-50"></div>);
        } else if (isSelected) {
            overlays.push(<div key="selected" className="absolute inset-0 bg-yellow-400 opacity-60"></div>);
        }

        if (isMoveTarget) {
            if (piece) { // capture move
                overlays.push(<div key="capture" className="absolute inset-0 border-8 border-red-500 rounded-full"></div>);
            } else { // normal move
                overlays.push(<div key="move" className="absolute w-1/3 h-1/3 bg-yellow-500 opacity-70 rounded-full"></div>);
            }
        }

        const cursorClass = isInteractionDisabled ? 'cursor-not-allowed' : 'cursor-pointer';
        const isBeingDragged = draggedPiece && draggedPiece.row === row && draggedPiece.col === col;

        return (
            <div
                key={`${row}-${col}`}
                className={`${bgColor} ${cursorClass} w-full h-full flex items-center justify-center relative`}
                onClick={() => onSquareClick(row, col)}
                onDrop={(e) => onSquareDrop(e, row, col)}
                onDragOver={handleDragOver}
                onMouseDown={(e) => onBoardMouseDown(e, row, col)}
                onMouseUp={(e) => onBoardMouseUp(e, row, col)}
            >
                {overlays}
                {piece &&
                    <Piece
                        piece={piece}
                        onDragStart={(e) => !isInteractionDisabled && onPieceDragStart(e, row, col)}
                        onDragEnd={onPieceDragEnd}
                        isBeingDragged={isBeingDragged}
                        showPowerPieces={showPowerPieces}
                        showPowerRings={showPowerRings}
                        showOriginalType={showOriginalType}
                    />}
            </div>
        );
    };

    const getSquareCenter = useCallback((row: number, col: number) => {
        if (isFlipped) {
            row = 7 - row;
            col = 7 - col;
        }
        const x = col * 12.5 + 6.25;
        const y = row * 12.5 + 6.25;
        return { x, y };
    }, [isFlipped]);

    return (
        <div
            className={`grid grid-cols-8 grid-rows-8 aspect-square border-4 border-gray-600 shadow-2xl relative ${isFlipped ? 'rotate-180' : ''}`}
            onContextMenu={onBoardContextMenu}
        >
            {board && Array.isArray(board) && board.map((row, rowIndex) =>
                Array.isArray(row) && row.map((_, colIndex) => (
                    <div key={`${rowIndex}-${colIndex}`} className={`${isFlipped ? 'rotate-180' : ''}`}>
                        {renderSquare(rowIndex, colIndex)}
                    </div>
                ))
            )}
            <svg
                className={`absolute top-0 left-0 w-full h-full pointer-events-none ${isFlipped ? 'rotate-180' : ''}`}
                viewBox="0 0 100 100"
                preserveAspectRatio="none"
            >
                <defs>
                    <marker
                        id="arrowhead-long"
                        markerWidth="4"
                        markerHeight="4"
                        refX="3"
                        refY="2"
                        orient="auto"
                        markerUnits="strokeWidth"
                    >
                        <polygon points="0 0, 4 2, 0 4" fill="rgba(34, 197, 94, 0.8)" />
                    </marker>
                    <marker
                        id="arrowhead-short"
                        markerWidth="3"
                        markerHeight="3"
                        refX="2.5"
                        refY="1.5"
                        orient="auto"
                        markerUnits="strokeWidth"
                    >
                        <polygon points="0 0, 3 1.5, 0 3" fill="rgba(34, 197, 94, 0.8)" />
                    </marker>
                </defs>
                {arrows.map((arrow, i) => {
                    const from = getSquareCenter(arrow.from.row, arrow.from.col);
                    const to = getSquareCenter(arrow.to.row, arrow.to.col);

                    // Calculate Euclidean distance in "squares"
                    const dist = Math.sqrt(Math.pow(arrow.to.row - arrow.from.row, 2) + Math.pow(arrow.to.col - arrow.from.col, 2));
                    // Threshold for "1 square" logic: adjacent (1) or diagonal (~1.41) are both < 1.5
                    const isShort = dist < 1.5;

                    return (
                        <line
                            key={i}
                            x1={`${from.x}%`}
                            y1={`${from.y}%`}
                            x2={`${to.x}%`}
                            y2={`${to.y}%`}
                            stroke="rgba(34, 197, 94, 0.8)"
                            strokeWidth={isShort ? "3.5" : "1.8"} // Thick for 1-square, Thin for others
                            markerEnd={isShort ? "url(#arrowhead-short)" : "url(#arrowhead-long)"}
                        />
                    );
                })}
            </svg>
        </div>
    );
};

export default Board;