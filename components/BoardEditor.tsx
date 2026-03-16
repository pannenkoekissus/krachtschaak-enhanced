
import React, { useState } from 'react';
import { BoardState, Color, PieceType, Piece, Position, Square } from '../types';
import Board from './Board';
import PieceComponent from './Piece';

interface BoardEditorProps {
    initialBoard?: BoardState;
    initialTurn?: Color;
    onStartAnalysis: (board: BoardState, turn: Color) => void;
    onCancel: () => void;
}

const BoardEditor: React.FC<BoardEditorProps> = ({ initialBoard, initialTurn, onStartAnalysis, onCancel }) => {
    const [board, setBoard] = useState<BoardState>(() => initialBoard || Array(8).fill(null).map(() => Array(8).fill(null)));
    const [turn, setTurn] = useState<Color>(initialTurn || Color.White);
    const [selectedPalettePiece, setSelectedPalettePiece] = useState<{ type: PieceType, color: Color } | 'eraser' | 'cursor'>('cursor');
    const [draggedPos, setDraggedPos] = useState<Position | null>(null);
    const [selectedPower, setSelectedPower] = useState<PieceType | null>(null);
    const [selectedOriginalType, setSelectedOriginalType] = useState<PieceType | null>(null);
    const [touchPaletteDragging, setTouchPaletteDragging] = useState<{ source: 'palette' | 'power' | 'originalType', data: any, x: number, y: number } | null>(null);

    const clearBoard = () => {
        setBoard(Array(8).fill(null).map(() => Array(8).fill(null)));
    };

    const resetBoard = () => {
        const b: BoardState = Array(8).fill(null).map(() => Array(8).fill(null));
        const PIECE_ORDER: PieceType[] = [
            PieceType.Rook, PieceType.Knight, PieceType.Bishop, PieceType.Queen,
            PieceType.King, PieceType.Bishop, PieceType.Knight, PieceType.Rook
        ];
        // Black pieces
        for (let i = 0; i < 8; i++) {
            b[0][i] = { type: PIECE_ORDER[i], color: Color.Black, power: null, originalType: PIECE_ORDER[i], isKing: PIECE_ORDER[i] === PieceType.King, hasMoved: false };
            b[1][i] = { type: PieceType.Pawn, color: Color.Black, power: null, originalType: PieceType.Pawn, isKing: false, hasMoved: false };
        }
        // White pieces
        for (let i = 0; i < 8; i++) {
            b[6][i] = { type: PieceType.Pawn, color: Color.White, power: null, originalType: PieceType.Pawn, isKing: false, hasMoved: false };
            b[7][i] = { type: PIECE_ORDER[i], color: Color.White, power: null, originalType: PIECE_ORDER[i], isKing: PIECE_ORDER[i] === PieceType.King, hasMoved: false };
        }
        setBoard(b);
    };

    const handleSquareClick = (row: number, col: number) => {
        if (selectedPalettePiece === 'cursor') {
            // Support tap-tap moving pieces in the editor
            if (!draggedPos) {
                if (board[row][col]) {
                    setDraggedPos({ row, col });
                }
            } else {
                if (draggedPos.row === row && draggedPos.col === col) {
                    setDraggedPos(null);
                } else {
                    const newBoard = board.map(r => [...r]);
                    newBoard[row][col] = newBoard[draggedPos.row][draggedPos.col];
                    newBoard[draggedPos.row][draggedPos.col] = null;
                    setBoard(newBoard);
                    setDraggedPos(null);
                }
            }
            return;
        }
        const newBoard = board.map(r => [...r]);
        if (selectedPalettePiece === 'eraser') {
            newBoard[row][col] = null;
        } else if (selectedPalettePiece && typeof selectedPalettePiece !== 'string') {
            newBoard[row][col] = {
                type: selectedPalettePiece.type,
                color: selectedPalettePiece.color,
                power: selectedPower,
                originalType: selectedOriginalType || selectedPalettePiece.type,
                isKing: selectedPalettePiece.type === PieceType.King || (selectedOriginalType === PieceType.King),
                hasMoved: false
            };
        }
        setBoard(newBoard);
    };

    const handlePieceDragStart = (e: React.DragEvent, row: number, col: number) => {
        if (selectedPalettePiece !== 'cursor') {
            e.preventDefault();
            return;
        }
        setDraggedPos({ row, col });
    };

    const handleSquareDrop = (e: React.DragEvent, toRow: number, toCol: number) => {
        e.preventDefault();

        try {
            const dragDataStr = e.dataTransfer.getData('text/plain');
            if (dragDataStr) {
                const dragData = JSON.parse(dragDataStr);
                const newBoard = board.map(r => [...r]);

                if (dragData.source === 'palette') {
                    const p = dragData.data;
                    newBoard[toRow][toCol] = {
                        type: p.type,
                        color: p.color,
                        power: selectedPower,
                        originalType: selectedOriginalType || p.type,
                        isKing: p.type === PieceType.King || selectedOriginalType === PieceType.King,
                        hasMoved: false
                    };
                    setBoard(newBoard);
                    return;
                } else if (dragData.source === 'power') {
                    const type = dragData.data;
                    if (newBoard[toRow][toCol]) {
                        newBoard[toRow][toCol]!.power = type;
                        setBoard(newBoard);
                    }
                    return;
                } else if (dragData.source === 'originalType') {
                    const type = dragData.data;
                    if (newBoard[toRow][toCol]) {
                        newBoard[toRow][toCol]!.originalType = type;
                        newBoard[toRow][toCol]!.isKing = type === PieceType.King || newBoard[toRow][toCol]!.type === PieceType.King;
                        setBoard(newBoard);
                    }
                    return;
                }
            }
        } catch (err) {
            // Regular piece drag drops
        }

        if (selectedPalettePiece === 'cursor' && draggedPos) {
            const newBoard = board.map(r => [...r]);
            newBoard[toRow][toCol] = newBoard[draggedPos.row][draggedPos.col];
            newBoard[draggedPos.row][draggedPos.col] = null;
            setBoard(newBoard);
            setDraggedPos(null);
        }
    };

    const palettePieces: { type: PieceType, color: Color }[] = [
        { type: PieceType.Pawn, color: Color.White },
        { type: PieceType.Knight, color: Color.White },
        { type: PieceType.Bishop, color: Color.White },
        { type: PieceType.Rook, color: Color.White },
        { type: PieceType.Queen, color: Color.White },
        { type: PieceType.King, color: Color.White },
        { type: PieceType.Pawn, color: Color.Black },
        { type: PieceType.Knight, color: Color.Black },
        { type: PieceType.Bishop, color: Color.Black },
        { type: PieceType.Rook, color: Color.Black },
        { type: PieceType.Queen, color: Color.Black },
        { type: PieceType.King, color: Color.Black },
    ];

    const handleTouchMove = (e: React.TouchEvent) => {
        if (!touchPaletteDragging) return;
        if (e.cancelable) e.preventDefault(); // Crucial for non-passive listeners
        const touch = e.touches[0];
        setTouchPaletteDragging(prev => prev ? { ...prev, x: touch.clientX, y: touch.clientY } : null);
    };

    const handleTouchEnd = (e: React.TouchEvent) => {
        if (!touchPaletteDragging) return;

        const touch = e.changedTouches[0];
        const element = document.elementFromPoint(touch.clientX, touch.clientY);
        const square = element?.closest('.chess-square');

        if (square) {
            const rowStr = square.getAttribute('data-row');
            const colStr = square.getAttribute('data-col');
            if (rowStr !== null && colStr !== null) {
                const row = parseInt(rowStr);
                const col = parseInt(colStr);
                const newBoard = board.map(r => [...r]);

                if (touchPaletteDragging.source === 'palette') {
                    const p = touchPaletteDragging.data;
                    newBoard[row][col] = {
                        type: p.type,
                        color: p.color,
                        power: selectedPower,
                        originalType: selectedOriginalType || p.type,
                        isKing: p.type === PieceType.King || selectedOriginalType === PieceType.King,
                        hasMoved: false
                    };
                } else if (touchPaletteDragging.source === 'power') {
                    if (newBoard[row][col]) {
                        newBoard[row][col]!.power = touchPaletteDragging.data;
                    }
                } else if (touchPaletteDragging.source === 'originalType') {
                    if (newBoard[row][col]) {
                        newBoard[row][col]!.originalType = touchPaletteDragging.data;
                        newBoard[row][col]!.isKing = touchPaletteDragging.data === PieceType.King || newBoard[row][col]!.type === PieceType.King;
                    }
                }
                setBoard(newBoard);
            }
        }

        setTouchPaletteDragging(null);
    };

    return (
        <div 
            className="min-h-screen flex flex-col md:flex-row items-center justify-center p-4 gap-8 bg-gray-900 text-white overflow-x-hidden touch-none"
            onTouchMove={handleTouchMove}
            onTouchEnd={handleTouchEnd}
        >
            {touchPaletteDragging && (
                <div 
                    className="fixed pointer-events-none z-[200] opacity-80"
                    style={{ 
                        left: touchPaletteDragging.x, 
                        top: touchPaletteDragging.y, 
                        width: '48px', 
                        height: '48px', 
                        transform: 'translate(-50%, -50%)' 
                    }}
                >
                    {touchPaletteDragging.source === 'palette' && (
                        <PieceComponent piece={{ ...touchPaletteDragging.data, power: null, originalType: touchPaletteDragging.data.type, isKing: touchPaletteDragging.data.type === PieceType.King }} />
                    )}
                    {(touchPaletteDragging.source === 'power' || touchPaletteDragging.source === 'originalType') && (
                        <div className="w-full h-full bg-gray-800 rounded-full border border-white flex items-center justify-center overflow-hidden">
                             <PieceComponent piece={{ type: touchPaletteDragging.data, color: Color.White, power: null, originalType: touchPaletteDragging.data, isKing: false }} />
                        </div>
                    )}
                </div>
            )}
            <div className="w-full max-w-lg flex-shrink-0">
                <Board
                    board={board}
                    selectedPiece={draggedPos}
                    validMoves={[]}
                    onSquareClick={handleSquareClick}
                    turn={turn}
                    playerColor={Color.White}
                    gameMode="board_editor"
                    isInteractionDisabled={false}
                    onPieceDragStart={handlePieceDragStart}
                    onPieceDragEnd={() => setDraggedPos(null)}
                    onSquareDrop={handleSquareDrop}
                    draggedPiece={draggedPos}
                    premove={null}
                    lastMove={null}
                    highlightedSquares={[]}
                    arrows={[]}
                    onBoardMouseDown={() => { }}
                    onBoardMouseUp={() => { }}
                    onBoardContextMenu={(e) => e.preventDefault()}
                />
            </div>

            <div className={`w-full md:w-80 bg-gray-800 p-6 rounded-xl shadow-2xl flex flex-col gap-6 max-h-[90vh] overflow-y-auto custom-scrollbar flex-shrink-0 ${touchPaletteDragging ? 'touch-none' : ''}`}>
                <h2 className="text-3xl font-bold text-center text-green-400">Board Editor</h2>

                <div className="grid grid-cols-6 gap-2 bg-gray-700 p-4 rounded-lg">
                    {palettePieces.map((p, i) => (
                        <div
                            key={i}
                            draggable
                            onDragStart={(e) => e.dataTransfer.setData('text/plain', JSON.stringify({ source: 'palette', data: p }))}
                            className={`aspect-square cursor-pointer rounded-md flex items-center justify-center transition-all touch-none ${typeof selectedPalettePiece !== 'string' && selectedPalettePiece?.type === p.type && selectedPalettePiece?.color === p.color
                                ? 'bg-blue-600 ring-2 ring-blue-400 scale-110 shadow-lg'
                                : 'bg-gray-600 hover:bg-gray-500'
                                }`}
                            onClick={() => setSelectedPalettePiece(p)}
                            onTouchStart={(e) => {
                                const touch = e.touches[0];
                                setTouchPaletteDragging({ source: 'palette', data: p, x: touch.clientX, y: touch.clientY });
                            }}
                        >
                            <div className="w-10 h-10 pointer-events-none">
                                <PieceComponent piece={{ ...p, power: null, originalType: p.type, isKing: p.type === PieceType.King }} />
                            </div>
                        </div>
                    ))}
                    <div
                        className={`col-span-3 aspect-square max-h-[64px] mx-auto w-full cursor-pointer rounded-md flex items-center justify-center transition-all touch-none ${selectedPalettePiece === 'cursor' ? 'bg-indigo-600 ring-2 ring-indigo-400 scale-105 shadow-lg' : 'bg-gray-600 hover:bg-gray-500'
                            }`}
                        onClick={() => setSelectedPalettePiece('cursor')}
                        onTouchStart={(e) => {
                            setSelectedPalettePiece('cursor');
                            if (e.cancelable) e.preventDefault();
                        }}
                        title="Cursor (Drag/Drop Mode)"
                    >
                        <span className="text-2xl">👆</span>
                    </div>
                    <div
                        className={`col-span-3 aspect-square max-h-[64px] mx-auto w-full cursor-pointer rounded-md flex items-center justify-center transition-all touch-none ${selectedPalettePiece === 'eraser' ? 'bg-red-600 ring-2 ring-red-400 scale-105 shadow-lg' : 'bg-gray-600 hover:bg-gray-500'
                            }`}
                        onClick={() => setSelectedPalettePiece('eraser')}
                        onTouchStart={(e) => {
                            setSelectedPalettePiece('eraser');
                            if (e.cancelable) e.preventDefault();
                        }}
                        title="Eraser"
                    >
                        <span className="text-xl">🗑️</span>
                    </div>
                </div>

                <div className="flex flex-col gap-3">
                    <label className="text-sm font-semibold text-gray-400 uppercase tracking-wider">Power to Grant</label>
                    <div className="grid grid-cols-6 gap-2 bg-gray-700 p-2 rounded-lg">
                        {[PieceType.Pawn, PieceType.Knight, PieceType.Bishop, PieceType.Rook, PieceType.Queen].map((type) => (
                            <div
                                key={type}
                                draggable
                                onDragStart={(e) => e.dataTransfer.setData('text/plain', JSON.stringify({ source: 'power', data: type }))}
                                className={`aspect-square cursor-pointer rounded-md flex items-center justify-center transition-all touch-none ${selectedPower === type ? 'bg-purple-600 ring-2 ring-purple-400 scale-110 shadow-lg' : 'bg-gray-600 hover:bg-gray-500'
                                    }`}
                                onClick={() => setSelectedPower(type === selectedPower ? null : type)}
                                onTouchStart={(e) => {
                                    const touch = e.touches[0];
                                    setTouchPaletteDragging({ source: 'power', data: type, x: touch.clientX, y: touch.clientY });
                                }}
                                title={type}
                            >
                                <div className="w-8 h-8 opacity-80 pointer-events-none">
                                    <PieceComponent piece={{ type, color: Color.White, power: null, originalType: type, isKing: false }} />
                                </div>
                            </div>
                        ))}
                        <div
                            className={`aspect-square cursor-pointer rounded-md flex items-center justify-center transition-all ${selectedPower === null ? 'bg-gray-500 ring-2 ring-gray-300 scale-110 shadow-lg' : 'bg-gray-600 hover:bg-gray-500'
                                }`}
                            onClick={() => setSelectedPower(null)}
                            title="No Power"
                        >
                            <span className="text-xs font-bold">NONE</span>
                        </div>
                    </div>
                </div>

                <div className="flex flex-col gap-3">
                    <label className="text-sm font-semibold text-gray-400 uppercase tracking-wider">Original Piece Type</label>
                    <div className="grid grid-cols-6 gap-2 bg-gray-700 p-2 rounded-lg">
                        {[PieceType.Pawn, PieceType.Knight, PieceType.Bishop, PieceType.Rook, PieceType.Queen, PieceType.King].map((type) => (
                            <div
                                key={type}
                                draggable
                                onDragStart={(e) => e.dataTransfer.setData('text/plain', JSON.stringify({ source: 'originalType', data: type }))}
                                className={`aspect-square cursor-pointer rounded-md flex items-center justify-center transition-all touch-none ${selectedOriginalType === type ? 'bg-blue-900 ring-2 ring-blue-400 scale-110 shadow-lg' : 'bg-gray-600 hover:bg-gray-500'
                                    }`}
                                onClick={() => setSelectedOriginalType(type === selectedOriginalType ? null : type)}
                                onTouchStart={(e) => {
                                    const touch = e.touches[0];
                                    setTouchPaletteDragging({ source: 'originalType', data: type, x: touch.clientX, y: touch.clientY });
                                }}
                                title={`Original: ${type}`}
                            >
                                <div className="w-8 h-8 opacity-60 pointer-events-none">
                                    <PieceComponent piece={{ type, color: Color.White, power: null, originalType: type, isKing: false }} />
                                </div>
                            </div>
                        ))}
                        <div
                            className={`aspect-square cursor-pointer rounded-md flex items-center justify-center transition-all ${selectedOriginalType === null ? 'bg-gray-500 ring-2 ring-gray-300 scale-110 shadow-lg' : 'bg-gray-600 hover:bg-gray-500'
                                }`}
                            onClick={() => setSelectedOriginalType(null)}
                            title="Default (Same as Visual)"
                        >
                            <span className="text-[10px] font-bold">DEF</span>
                        </div>
                    </div>
                </div>

                <div className="flex flex-col gap-3">
                    <label className="text-sm font-semibold text-gray-400 uppercase tracking-wider">Side to Move</label>
                    <div className="flex gap-2">
                        <button
                            onClick={() => setTurn(Color.White)}
                            className={`flex-1 py-2 px-4 rounded-lg font-bold transition-all ${turn === Color.White ? 'bg-white text-gray-900 shadow-lg scale-105' : 'bg-gray-700 text-gray-400 hover:bg-gray-600'
                                }`}
                        >
                            White
                        </button>
                        <button
                            onClick={() => setTurn(Color.Black)}
                            className={`flex-1 py-2 px-4 rounded-lg font-bold transition-all ${turn === Color.Black ? 'bg-gray-200 text-gray-900 shadow-lg scale-105' : 'bg-gray-700 text-gray-400 hover:bg-gray-600'
                                }`}
                        >
                            Black
                        </button>
                    </div>
                </div>

                <div className="flex flex-col gap-3">
                    <label className="text-sm font-semibold text-gray-400 uppercase tracking-wider">Castling Rights</label>
                    <div className="grid grid-cols-2 gap-2">
                        {[
                            { color: Color.White, side: 'K', label: 'White O-O' },
                            { color: Color.White, side: 'Q', label: 'White O-O-O' },
                            { color: Color.Black, side: 'K', label: 'Black O-O' },
                            { color: Color.Black, side: 'Q', label: 'Black O-O-O' }
                        ].map((c, i) => {
                            const row = c.color === Color.White ? 7 : 0;
                            const col = c.side === 'K' ? 7 : 0;
                            const rook = board[row][col];
                            const king = board[row][4];

                            const isPossible = king && king.type === PieceType.King && king.color === c.color &&
                                rook && rook.type === PieceType.Rook && rook.color === c.color;

                            // Castling logic expects !hasMoved.
                            const isAllowed = isPossible && !king.hasMoved && !rook.hasMoved;

                            return (
                                <button
                                    key={i}
                                    disabled={!isPossible}
                                    onClick={() => {
                                        if (isPossible) {
                                            const newBoard = board.map(r => [...r]);
                                            if (isAllowed) {
                                                newBoard[row][col]!.hasMoved = true;
                                            } else {
                                                newBoard[row][4]!.hasMoved = false;
                                                newBoard[row][col]!.hasMoved = false;
                                            }
                                            setBoard(newBoard);
                                        }
                                    }}
                                    className={`py-2 px-2 rounded-lg font-bold text-xs transition-colors shadow-md ${!isPossible ? 'bg-gray-800 text-gray-600 cursor-not-allowed opacity-50' :
                                        isAllowed ? 'bg-green-600 text-white hover:bg-green-500' : 'bg-gray-700 text-gray-400 hover:bg-gray-600'
                                        }`}
                                >
                                    {c.label} {isPossible && (isAllowed ? '✔️' : '❌')}
                                </button>
                            );
                        })}
                    </div>
                </div>

                <div className="grid grid-cols-2 gap-3">
                    <button
                        onClick={resetBoard}
                        className="py-2 px-4 bg-gray-700 hover:bg-gray-600 text-white rounded-lg font-semibold transition-colors"
                    >
                        Reset Position
                    </button>
                    <button
                        onClick={clearBoard}
                        className="py-2 px-4 bg-gray-700 hover:bg-gray-600 text-white rounded-lg font-semibold transition-colors"
                    >
                        Clear Board
                    </button>
                </div>

                <div className="flex flex-col gap-3 mt-4">
                    <button
                        onClick={() => onStartAnalysis(board, turn)}
                        className="w-full py-4 bg-green-600 hover:bg-green-500 text-white rounded-xl font-bold text-lg shadow-lg transition-all active:scale-95"
                    >
                        Start Analysis
                    </button>
                    <button
                        onClick={onCancel}
                        className="w-full py-2 bg-transparent hover:bg-gray-700 text-gray-400 rounded-lg font-semibold transition-colors"
                    >
                        Cancel
                    </button>
                </div>
            </div>
        </div>
    );
};

export default BoardEditor;
