
// DO NOT MODIFY THIS FILE UNLESS INSTRUCTED TO DO SO
import React from 'react';
import { Piece as PieceProps, PieceType, Color } from '../types';

import whiteKing from '../images/white_king.svg';
import whiteQueen from '../images/white_queen.svg';
import whiteRook from '../images/white_rook.svg';
import whiteBishop from '../images/white_bishop.svg';
import whiteKnight from '../images/white_knight.svg';
import whitePawn from '../images/white_pawn.svg';
import blackKing from '../images/black_king.svg';
import blackQueen from '../images/black_queen.svg';
import blackRook from '../images/black_rook.svg';
import blackBishop from '../images/black_bishop.svg';
import blackKnight from '../images/black_knight.svg';
import blackPawn from '../images/black_pawn.svg';

const svgs: Record<Color, Record<PieceType, string>> = {
    [Color.White]: {
        [PieceType.King]: whiteKing,
        [PieceType.Queen]: whiteQueen,
        [PieceType.Rook]: whiteRook,
        [PieceType.Bishop]: whiteBishop,
        [PieceType.Knight]: whiteKnight,
        [PieceType.Pawn]: whitePawn,
    },
    [Color.Black]: {
        [PieceType.King]: blackKing,
        [PieceType.Queen]: blackQueen,
        [PieceType.Rook]: blackRook,
        [PieceType.Bishop]: blackBishop,
        [PieceType.Knight]: blackKnight,
        [PieceType.Pawn]: blackPawn,
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
    const hasEffectivePower = (piece: PieceProps): boolean => {
        if (!piece.power) return false;

        // A piece with its own power doesn't do anything
        if (piece.type === piece.power) return false;

        // A queen with bishop or rook power also doesn't do anything
        if (piece.type === PieceType.Queen && (piece.power === PieceType.Bishop || piece.power === PieceType.Rook)) {
            return false;
        }

        return true;
    };

    const effectivePower = hasEffectivePower(piece);
    const powerRingClass = effectivePower ? `ring-4 ${powerColors[piece.power!]}` : '';
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
            {effectivePower && piece.power && showPowerPieces && (
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
