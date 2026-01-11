import React from 'react';
import { PieceType } from '../types';

const powerInfo: Record<string, { name: string; colorClass: string; }> = {
    [PieceType.Queen]: { name: 'Queen', colorClass: 'bg-yellow-500' },
    [PieceType.Rook]: { name: 'Rook', colorClass: 'bg-red-500' },
    [PieceType.Bishop]: { name: 'Bishop', colorClass: 'bg-blue-500' },
    [PieceType.Knight]: { name: 'Knight', colorClass: 'bg-green-500' },
    [PieceType.Pawn]: { name: 'Pawn', colorClass: 'bg-gray-400' },
    [PieceType.King]: { name: 'King', colorClass: 'bg-purple-500' },
};

const orderedPieceTypes: PieceType[] = [
    PieceType.Queen,
    PieceType.Rook,
    PieceType.Bishop,
    PieceType.Knight,
    PieceType.Pawn,
    PieceType.King,
];

interface PowerLegendProps {
    onClose: () => void;
}

const PowerLegend: React.FC<PowerLegendProps> = ({ onClose }) => {
    return (
        <div className="fixed inset-0 bg-black bg-opacity-75 flex items-center justify-center z-50" onClick={onClose}>
            <div className="bg-gray-800 p-8 rounded-xl shadow-2xl w-full max-w-xs relative" onClick={(e) => e.stopPropagation()}>
                <button onClick={onClose} className="absolute top-2 right-3 text-2xl text-gray-400 hover:text-white" aria-label="Close legend">&times;</button>
                <h3 className="text-2xl font-bold mb-6 text-center text-green-400">Power Legend</h3>
                <ul className="space-y-3">
                    {orderedPieceTypes.map(pieceType => (
                        <li key={pieceType} className="flex items-center gap-4">
                            <div className={`w-6 h-6 rounded-full ${powerInfo[pieceType].colorClass} ring-2 ring-offset-2 ring-offset-gray-800 ring-white`}></div>
                            <span className="text-lg capitalize">{powerInfo[pieceType].name}</span>
                        </li>
                    ))}
                </ul>
            </div>
        </div>
    );
};

export default PowerLegend;
