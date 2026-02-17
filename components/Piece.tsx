
// DO NOT MODIFY THIS FILE UNLESS INSTRUCTED TO DO SO
import React from 'react';
import { Piece as PieceProps, PieceType, Color } from '../types';

const svgs: Record<Color, Record<PieceType, string>> = {
    [Color.White]: {
        [PieceType.King]: "../images/white_king.svg",
        [PieceType.Queen]: "../images/white_queen.svg",
        [PieceType.Rook]: "../images/white_rook.svg",
        [PieceType.Bishop]: "../images/white_bishop.svg",
        [PieceType.Knight]: "../images/white_knight.svg",
        [PieceType.Pawn]: "../images/white_pawn.svg",
    },
    [Color.Black]: {
        [PieceType.King]: "../images/black_king.svg",
        [PieceType.Queen]: "../images/black_queen.svg",
        [PieceType.Rook]: "../images/black_rook.svg",
        [PieceType.Bishop]: "../images/black_bishop.svg",
        [PieceType.Knight]: "../images/black_knight.svg",
        [PieceType.Pawn]: "../images/black_pawn.svg",
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
