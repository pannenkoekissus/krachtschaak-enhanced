
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
    const [selectedPalettePiece, setSelectedPalettePiece] = useState<{ type: PieceType, color: Color } | null>(null);
    const [selectedPower, setSelectedPower] = useState<PieceType | null>(null);

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
        const newBoard = board.map(r => [...r]);
        if (selectedPalettePiece) {
            newBoard[row][col] = {
                type: selectedPalettePiece.type,
                color: selectedPalettePiece.color,
                power: selectedPower,
                originalType: selectedPalettePiece.type,
                isKing: selectedPalettePiece.type === PieceType.King,
                hasMoved: false
            };
        } else {
            newBoard[row][col] = null;
        }
        setBoard(newBoard);
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

    return (
        <div className="min-h-screen flex flex-col md:flex-row items-center justify-center p-4 gap-8 bg-gray-900 text-white">
            <div className="w-full max-w-lg">
                <Board
                    board={board}
                    selectedPiece={null}
                    validMoves={[]}
                    onSquareClick={handleSquareClick}
                    turn={turn}
                    playerColor={Color.White}
                    gameMode="board_editor"
                    isInteractionDisabled={false}
                    onPieceDragStart={() => { }}
                    onPieceDragEnd={() => { }}
                    onSquareDrop={() => { }}
                    draggedPiece={null}
                    premove={null}
                    lastMove={null}
                    highlightedSquares={[]}
                    arrows={[]}
                    onBoardMouseDown={() => { }}
                    onBoardMouseUp={() => { }}
                    onBoardContextMenu={(e) => e.preventDefault()}
                />
            </div>

            <div className="w-full md:w-80 bg-gray-800 p-6 rounded-xl shadow-2xl flex flex-col gap-6">
                <h2 className="text-3xl font-bold text-center text-green-400">Board Editor</h2>

                <div className="grid grid-cols-6 gap-2 bg-gray-700 p-4 rounded-lg">
                    {palettePieces.map((p, i) => (
                        <div
                            key={i}
                            className={`aspect-square cursor-pointer rounded-md flex items-center justify-center transition-all ${selectedPalettePiece?.type === p.type && selectedPalettePiece?.color === p.color
                                ? 'bg-blue-600 ring-2 ring-blue-400 scale-110 shadow-lg'
                                : 'bg-gray-600 hover:bg-gray-500'
                                }`}
                            onClick={() => setSelectedPalettePiece(p)}
                        >
                            <div className="w-10 h-10">
                                <PieceComponent piece={{ ...p, power: null, originalType: p.type, isKing: p.type === PieceType.King }} />
                            </div>
                        </div>
                    ))}
                    <div
                        className={`aspect-square cursor-pointer rounded-md flex items-center justify-center transition-all ${selectedPalettePiece === null ? 'bg-red-600 ring-2 ring-red-400 scale-110 shadow-lg' : 'bg-gray-600 hover:bg-gray-500'
                            }`}
                        onClick={() => setSelectedPalettePiece(null)}
                        title="Eraser"
                    >
                        <span className="text-2xl">🗑️</span>
                    </div>
                </div>

                <div className="flex flex-col gap-3">
                    <label className="text-sm font-semibold text-gray-400 uppercase tracking-wider">Power to Grant</label>
                    <div className="grid grid-cols-6 gap-2 bg-gray-700 p-2 rounded-lg">
                        {[PieceType.Pawn, PieceType.Knight, PieceType.Bishop, PieceType.Rook, PieceType.Queen].map((type) => (
                            <div
                                key={type}
                                className={`aspect-square cursor-pointer rounded-md flex items-center justify-center transition-all ${selectedPower === type ? 'bg-purple-600 ring-2 ring-purple-400 scale-110 shadow-lg' : 'bg-gray-600 hover:bg-gray-500'
                                    }`}
                                onClick={() => setSelectedPower(type === selectedPower ? null : type)}
                                title={type}
                            >
                                <div className="w-8 h-8 opacity-80">
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
