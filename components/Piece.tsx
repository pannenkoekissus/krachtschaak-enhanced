
// DO NOT MODIFY THIS FILE UNLESS INSTRUCTED TO DO SO
import React from 'react';
import { Piece as PieceProps, PieceType, Color } from '../types';

const svgs: Record<Color, Record<PieceType, string>> = {
  [Color.White]: {
    [PieceType.King]: "https://upload.wikimedia.org/wikipedia/commons/4/42/Chess_klt45.svg",
    [PieceType.Queen]: "https://upload.wikimedia.org/wikipedia/commons/1/15/Chess_qlt45.svg",
    [PieceType.Rook]: "https://upload.wikimedia.org/wikipedia/commons/7/72/Chess_rlt45.svg",
    [PieceType.Bishop]: "https://upload.wikimedia.org/wikipedia/commons/b/b1/Chess_blt45.svg",
    [PieceType.Knight]: "https://upload.wikimedia.org/wikipedia/commons/7/70/Chess_nlt45.svg",
    [PieceType.Pawn]: "https://upload.wikimedia.org/wikipedia/commons/4/45/Chess_plt45.svg",
  },
  [Color.Black]: {
    [PieceType.King]: "https://upload.wikimedia.org/wikipedia/commons/f/f0/Chess_kdt45.svg",
    [PieceType.Queen]: "https://upload.wikimedia.org/wikipedia/commons/4/47/Chess_qdt45.svg",
    [PieceType.Rook]: "https://upload.wikimedia.org/wikipedia/commons/f/ff/Chess_rdt45.svg",
    [PieceType.Bishop]: "https://upload.wikimedia.org/wikipedia/commons/9/98/Chess_bdt45.svg",
    [PieceType.Knight]: "https://upload.wikimedia.org/wikipedia/commons/e/ef/Chess_ndt45.svg",
    [PieceType.Pawn]: "https://upload.wikimedia.org/wikipedia/commons/c/c7/Chess_pdt45.svg",
  },
};

const powerColors: Record<PieceType, string> = {
    [PieceType.Pawn]: 'ring-gray-400',
    [PieceType.Knight]: 'ring-green-500',
    [PieceType.Bishop]: 'ring-blue-500',
    [PieceType.Rook]: 'ring-red-500',
    [PieceType.Queen]: 'ring-yellow-500',
    [PieceType.King]: 'ring-purple-500',
};

interface PieceComponentProps {
    piece: PieceProps;
    onDragStart?: (e: React.DragEvent) => void;
    onDragEnd?: (e: React.DragEvent) => void;
    isBeingDragged?: boolean;
    showPowerPieces?: boolean;
}


const Piece: React.FC<PieceComponentProps> = ({ piece, onDragStart, onDragEnd, isBeingDragged, showPowerPieces = true }) => {
    const powerRingClass = piece.power ? `ring-4 ${powerColors[piece.power]}` : '';
    const dragClass = isBeingDragged ? 'opacity-50' : 'opacity-100';

    return (
        <div 
            className={`relative w-full h-full flex items-center justify-center cursor-pointer transition-opacity duration-100 ${dragClass}`}
            draggable="true"
            onDragStart={onDragStart}
            onDragEnd={onDragEnd}
        >
            <img 
                src={svgs[piece.color][piece.type]} 
                alt={`${piece.color} ${piece.type}`}
                className={`w-full h-full object-contain drop-shadow-lg ${powerRingClass} rounded-full`}
            />
            {piece.power && showPowerPieces && (
                <div className="absolute bottom-0 right-0 w-6 h-6 md:w-8 md:h-8 rounded-full border border-white shadow-lg bg-opacity-90" style={{ background: 'rgba(0, 0, 0, 0.8)' }}>
                    <img 
                        src={svgs[Color.White][piece.power]}
                        alt={`${piece.power} power`}
                        className="w-full h-full object-contain opacity-80"
                    />
                </div>
            )}
        </div>
    );
};

export default Piece;
