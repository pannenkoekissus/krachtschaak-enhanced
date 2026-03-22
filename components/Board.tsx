import React, { useCallback, useState, useRef } from 'react';
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
    arrows: { from: Position, to: Position, color?: string }[];
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
    const [touchDragging, setTouchDragging] = useState<{ from: Position; x: number; y: number; piece: any; selectedAtStart: boolean; isVisualDrag: boolean } | null>(null);
    const touchTimerRef = useRef<NodeJS.Timeout | null>(null);
    const lastTouchActionRef = useRef<number>(0);
    // Use a ref for immediate access to interaction data to avoid closure/state race conditions on fast taps
    const interactionRef = useRef<{ row: number; col: number; selectedAtStart: boolean } | null>(null);
    const isDraggingRef = useRef<boolean>(false);
    const boardRef = useRef<HTMLDivElement>(null);

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
        const isTouchBeingDragged = touchDragging && touchDragging.isVisualDrag && touchDragging.from.row === row && touchDragging.from.col === col;
        const isBeingDragged = (draggedPiece && draggedPiece.row === row && draggedPiece.col === col) || isTouchBeingDragged;

        const handleTouchStart = (e: React.TouchEvent) => {
            if (isInteractionDisabled) return;

            // Mark the touch time to block the ghost click
            lastTouchActionRef.current = Date.now();
            
            // Prevent the browser from firing a redundant 'click' event later.
            if (e.cancelable) e.preventDefault();

            const touch = e.touches[0];
            const piece = board[row][col];
            const isAlreadySelected = selectedPiece && selectedPiece.row === row && selectedPiece.col === col;

            // Store interaction info immediately in the Ref for robust logic handling
            interactionRef.current = { row, col, selectedAtStart: !!isAlreadySelected };

            // Also update state for the visual drag-ghost (which will appear after a delay)
            setTouchDragging({
                from: { row, col },
                x: touch.clientX,
                y: touch.clientY,
                piece: piece,
                selectedAtStart: !!isAlreadySelected,
                isVisualDrag: false
            });

            // Immediate selection for NEW pieces (tap-tap logic).
            // For already selected pieces, we wait for touchEnd to perform the toggle/deselect.
            if (!isAlreadySelected) {
                onSquareClick(row, col);
            }

            // Start a timer to enable the "visual drag" ghost for long presses
            if (piece) {
                if (touchTimerRef.current) clearTimeout(touchTimerRef.current);
                touchTimerRef.current = setTimeout(() => {
                    setTouchDragging(prev => prev ? { ...prev, isVisualDrag: true } : null);
                }, 150); // 150ms hold to start dragging
            }
        };

        const handleControlledClick = () => {
            // Ghost click protection: ignore mouse clicks that follow touch events
            if (Date.now() - lastTouchActionRef.current < 400) {
                interactionRef.current = null;
                return;
            }
            onSquareClick(row, col);
        };

        const handleLocalMouseDown = (e: React.MouseEvent) => {
            if (isInteractionDisabled) return;

            if (e.button !== 0) {
                onBoardMouseDown(e, row, col);
                return;
            }

            onBoardMouseDown(e, row, col);
        };

        return (
            <div
                key={`${row}-${col}`}
                data-row={row}
                data-col={col}
                className={`${bgColor} ${isInteractionDisabled ? 'cursor-not-allowed' : 'cursor-pointer'} w-full h-full flex items-center justify-center relative chess-square`}
                onClick={handleControlledClick}
                onDrop={(e) => {
                    interactionRef.current = null;
                    onSquareDrop(e, row, col);
                }}
                onDragOver={handleDragOver}
                onMouseDown={handleLocalMouseDown}
                onMouseUp={(e) => onBoardMouseUp(e, row, col)}
                onTouchStart={handleTouchStart}
        >
            {overlays}
                {piece &&
                    <Piece
                        piece={piece}
                        onDragStart={(e) => {
                            if (isInteractionDisabled) return;
                            interactionRef.current = null; // Drag started, prevent subsequent 'click' from toggling selection
                            onPieceDragStart(e, row, col);
                        }}
                        onDragEnd={onPieceDragEnd}
                        isBeingDragged={isBeingDragged}
                        showPowerPieces={showPowerPieces}
                        showPowerRings={showPowerRings}
                        showOriginalType={showOriginalType}
                    />}
        </div>
        );
    };

    const handleTouchMove = (e: React.TouchEvent) => {
        if (!touchDragging) return;
        const touch = e.touches[0];
        setTouchDragging(prev => prev ? { ...prev, x: touch.clientX, y: touch.clientY } : null);
        if (e.cancelable) e.preventDefault();
    };

    const handleTouchEnd = (e: React.TouchEvent) => {
        lastTouchActionRef.current = Date.now();
        
        if (touchTimerRef.current) {
            clearTimeout(touchTimerRef.current);
            touchTimerRef.current = null;
        }

        if (!touchDragging) return;

        const touch = e.changedTouches[0];
        const element = document.elementFromPoint(touch.clientX, touch.clientY);
        const square = element?.closest('.chess-square');

        if (square) {
            const rowStr = square.getAttribute('data-row');
            const colStr = square.getAttribute('data-col');
            if (rowStr !== null && colStr !== null) {
                const tr = parseInt(rowStr);
                const tc = parseInt(colStr);
                
                // If it was a drag to a different square, trigger the move/selection
                if (tr !== interactionRef.current?.row || tc !== interactionRef.current?.col) {
                    onSquareClick(tr, tc);
                    interactionRef.current = null;
                } else {
                    // Released on the same square.
                    // If it was already selected at start, we need to call onSquareClick now
                    // to perform the deselect (which we skipped in touchStart).
                    if (interactionRef.current?.selectedAtStart) {
                        onSquareClick(tr, tc);
                    }
                    interactionRef.current = null;
                }
            }
        }

        // Prevent the browser from firing a 'click' event after a completed drag/long-press
        if (e.cancelable) e.preventDefault();
        setTouchDragging(null);
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
        <>
            {touchDragging && touchDragging.isVisualDrag && touchDragging.piece && (
                <div
                    className="fixed pointer-events-none z-[100]"
                    style={{
                        left: touchDragging.x,
                        top: touchDragging.y,
                        width: boardRef.current ? boardRef.current.clientWidth / 8 : '64px',
                        height: boardRef.current ? boardRef.current.clientWidth / 8 : '64px',
                        transform: 'translate(-50%, -50%)',
                        opacity: 0.8
                    }}
                >
                    <Piece
                        piece={touchDragging.piece}
                        showPowerPieces={showPowerPieces}
                        showPowerRings={showPowerRings}
                        showOriginalType={showOriginalType}
                    />
                </div>
            )}
            <div
                ref={boardRef}
                className={`grid grid-cols-8 grid-rows-8 aspect-square border-4 border-gray-600 shadow-2xl relative ${isFlipped ? 'rotate-180' : ''} touch-none`}
                onContextMenu={onBoardContextMenu}
                onTouchMove={handleTouchMove}
                onTouchEnd={handleTouchEnd}
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
                    <marker
                        id="arrowhead-long-orange"
                        markerWidth="4"
                        markerHeight="4"
                        refX="3"
                        refY="2"
                        orient="auto"
                        markerUnits="strokeWidth"
                    >
                        <polygon points="0 0, 4 2, 0 4" fill="rgba(249, 115, 22, 0.8)" />
                    </marker>
                    <marker
                        id="arrowhead-short-orange"
                        markerWidth="3"
                        markerHeight="3"
                        refX="2.5"
                        refY="1.5"
                        orient="auto"
                        markerUnits="strokeWidth"
                    >
                        <polygon points="0 0, 3 1.5, 0 3" fill="rgba(249, 115, 22, 0.8)" />
                    </marker>
                </defs>
                {arrows.map((arrow, i) => {
                    const from = getSquareCenter(arrow.from.row, arrow.from.col);
                    const to = getSquareCenter(arrow.to.row, arrow.to.col);

                    // Calculate Euclidean distance in "squares"
                    const dist = Math.sqrt(Math.pow(arrow.to.row - arrow.from.row, 2) + Math.pow(arrow.to.col - arrow.from.col, 2));
                    // Threshold for "1 square" logic: adjacent (1) or diagonal (~1.41) are both < 1.5
                    const isShort = dist < 1.5;

                    const colorStr = arrow.color === 'orange' ? 'rgba(249, 115, 22, 0.8)' : 'rgba(34, 197, 94, 0.8)';
                    const markerSuffix = arrow.color === 'orange' ? '-orange' : '';

                    return (
                        <line
                            key={i}
                            x1={`${from.x}%`}
                            y1={`${from.y}%`}
                            x2={`${to.x}%`}
                            y2={`${to.y}%`}
                            stroke={colorStr}
                            strokeWidth={isShort ? "3.5" : "1.8"} // Thick for 1-square, Thin for others
                            markerEnd={isShort ? `url(#arrowhead-short${markerSuffix})` : `url(#arrowhead-long${markerSuffix})`}
                        />
                    );
                })}
            </svg>
        </div>
        </>
    );
};

export default Board;