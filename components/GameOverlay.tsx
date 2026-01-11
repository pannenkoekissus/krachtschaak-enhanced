
// DO NOT MODIFY THIS FILE UNLESS INSTRUCTED TO DO SO
import React from 'react';
import { GameStatus, PieceType, PromotionData, Position, Color, GameMode, PlayerInfo, GameState } from '../types';
import Piece from './Piece';

interface GameOverlayProps {
    status: GameStatus;
    winner: string | null;
    onRestart: () => void;
    onPromote: (pieceType: PieceType) => void;
    promotionData: PromotionData | null;
    onResolveAmbiguousEnPassant: (choice: 'move' | 'capture') => void;
    gameMode: GameMode;
    isMyTurnForAction: boolean;
    // Rating props
    ratingChange: { white: number, black: number } | null;
    initialRatings: { white: number, black: number } | null;
    players: { [uid: string]: PlayerInfo };
    playerColors: { white: string | null; black: string | null; };
    isRated: boolean;
    // Rematch props
    rematchOffer: Color | null;
    myOnlineColor: Color | null;
    onOfferRematch: () => void;
    onAcceptRematch: () => void;
    onDeclineRematch: () => void;
    nextGameId: string | null;
    onCancelRematch?: () => void;
}

const promotionPieces = [PieceType.Queen, PieceType.Rook, PieceType.Bishop, PieceType.Knight];

const GameOverlay: React.FC<GameOverlayProps> = ({ 
    status, winner, onRestart, onPromote, promotionData, onResolveAmbiguousEnPassant, 
    gameMode, isMyTurnForAction, ratingChange, initialRatings, players, playerColors, isRated,
    rematchOffer, myOnlineColor, onOfferRematch, onAcceptRematch, onDeclineRematch, nextGameId, onCancelRematch
}) => {
    if (status === 'playing' || status === 'waiting') {
        return null;
    }

    if (nextGameId) {
        return (
             <div className="absolute inset-0 bg-black bg-opacity-80 flex items-center justify-center text-center z-10">
                <div>
                    <h2 className="text-3xl font-bold mb-4">Starting Rematch...</h2>
                    <div className="flex items-center justify-center gap-2">
                        <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-white"></div>
                        <p className="text-xl text-yellow-300 font-semibold">Loading new game...</p>
                    </div>
                </div>
            </div>
        )
    }

    const renderGameOver = () => {
        let message = '';
        switch(status) {
            case 'kingCaptured':
                message = `${winner} wins by capturing the king!`;
                break;
            case 'resignation':
                message = `${winner} wins by resignation.`;
                break;
            case 'checkmate':
                message = `${winner} wins by checkmate!`;
                break;
            case 'stalemate':
                message = `Stalemate! It's a draw.`;
                break;
            case 'draw_threefold':
                message = `Draw by threefold repetition.`;
                break;
            case 'draw_fiftyMove':
                 message = `Draw by 50-move rule.`;
                 break;
            case 'draw_agreement':
                message = `Draw by agreement.`;
                break;
            case 'timeout':
                message = `${winner} wins on time!`;
                break;
            case 'opponent_disconnected':
                message = `${winner} wins, opponent disconnected.`;
                break;
        }

        const buttonText = gameMode === 'local' ? 'Play Again' : 'Back to Menu';
        const whiteUid = playerColors?.white;
        const blackUid = playerColors?.black;
        const whitePlayer = whiteUid ? players[whiteUid] : null;
        const blackPlayer = blackUid ? players[blackUid] : null;
        const opponentColor = myOnlineColor === Color.White ? Color.Black : Color.White;

        return (
            <div>
                <h2 className="text-4xl font-bold mb-2">Game Over</h2>
                <p className="text-2xl mb-6">{message}</p>

                {gameMode === 'online_playing' && isRated && ratingChange && initialRatings && (
                    <div className="mb-6 text-lg bg-gray-700 p-4 rounded-lg">
                        <p className="font-semibold text-xl mb-2">Rating Changes</p>
                        <div className="flex justify-center gap-6">
                            <p>
                                <span className="font-bold">{whitePlayer?.displayName || 'White'}: </span> 
                                {initialRatings.white} → {initialRatings.white + ratingChange.white} 
                                <span className={ratingChange.white >= 0 ? 'text-green-400' : 'text-red-400'}> ({ratingChange.white >= 0 ? '+' : ''}{ratingChange.white})</span>
                            </p>
                            <p>
                                <span className="font-bold">{blackPlayer?.displayName || 'Black'}: </span>
                                {initialRatings.black} → {initialRatings.black + ratingChange.black} 
                                <span className={ratingChange.black >= 0 ? 'text-green-400' : 'text-red-400'}> ({ratingChange.black >= 0 ? '+' : ''}{ratingChange.black})</span>
                            </p>
                        </div>
                    </div>
                )}
                
                {gameMode === 'online_playing' && (
                    <div className="my-4 space-y-2">
                        {rematchOffer === opponentColor && (
                             <div>
                                <p className="mb-2 text-yellow-400">Opponent offers a rematch!</p>
                                <div className="flex justify-center gap-2">
                                    <button onClick={onAcceptRematch} className="px-4 py-2 bg-green-600 hover:bg-green-700 rounded-lg font-semibold transition-colors">Accept</button>
                                    <button onClick={onDeclineRematch} className="px-4 py-2 bg-gray-600 hover:bg-gray-700 rounded-lg font-semibold transition-colors">Decline</button>
                                </div>
                            </div>
                        )}
                         {rematchOffer === myOnlineColor && (
                            <div className="flex flex-col items-center gap-2">
                                <p className="text-gray-400">Rematch offer sent.</p>
                                {onCancelRematch && (
                                    <button onClick={onCancelRematch} className="px-4 py-1 bg-gray-600 hover:bg-gray-500 rounded text-sm font-semibold transition-colors">Cancel</button>
                                )}
                            </div>
                        )}
                        {!rematchOffer && (
                             <button onClick={onOfferRematch} className="px-6 py-3 bg-blue-600 hover:bg-blue-700 rounded-lg text-lg font-semibold transition-colors">Offer Rematch</button>
                        )}
                    </div>
                )}

                <button
                    onClick={onRestart}
                    className="px-6 py-3 bg-red-600 hover:bg-red-700 rounded-lg text-xl font-semibold transition-colors disabled:bg-gray-500 disabled:cursor-not-allowed"
                >
                    {buttonText}
                </button>
            </div>
        );
    }

    const renderPromotion = () => {
        if (!promotionData) return null;
        const color = promotionData.promotingPiece.color;
        const isKingPromoting = promotionData.promotingPiece.isKing;

        return (
            <div>
                <h2 className="text-3xl font-bold mb-4">Promote Your Piece</h2>
                <div className="flex justify-center gap-4">
                    {promotionPieces.map(pieceType => {
                         if (isKingPromoting && pieceType === promotionData.promotingPiece.originalType) {
                            return null;
                         }
                         return (
                            <div key={pieceType} onClick={() => onPromote(pieceType)} className="w-24 h-24 p-2 bg-gray-500 rounded-lg cursor-pointer hover:bg-gray-400 transition-colors">
                                <Piece piece={{ type: pieceType, color: color, isKing: false, originalType: pieceType, power: null }} />
                            </div>
                        )
                    })}
                </div>
            </div>
        );
    }

    const renderAmbiguousEnPassant = () => {
        return (
             <div>
                <h2 className="text-3xl font-bold mb-4">Choose Your Move</h2>
                <p className="text-xl mb-6">This piece can move to the square or capture en passant.</p>
                <div className="flex justify-center gap-4">
                    <button
                        onClick={() => onResolveAmbiguousEnPassant('move')}
                        className="px-6 py-3 bg-blue-600 hover:bg-blue-700 rounded-lg text-xl font-semibold transition-colors"
                    >
                        Move to Square
                    </button>
                    <button
                        onClick={() => onResolveAmbiguousEnPassant('capture')}
                        className="px-6 py-3 bg-red-600 hover:bg-red-700 rounded-lg text-xl font-semibold transition-colors"
                    >
                        Capture En Passant
                    </button>
                </div>
            </div>
        );
    }
    
    const renderWaiting = (message: string) => (
        <div>
            <h2 className="text-3xl font-bold mb-4">{message}</h2>
            <div className="flex items-center justify-center gap-2">
                <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-white"></div>
                <p className="text-xl text-yellow-300 font-semibold">Waiting for opponent...</p>
            </div>
        </div>
    );

    return (
        <div className="absolute inset-0 bg-black bg-opacity-80 flex items-center justify-center text-center z-10">
            {status === 'promotion' ? (isMyTurnForAction ? renderPromotion() : null) :
             status === 'ambiguous_en_passant' ? (isMyTurnForAction ? renderAmbiguousEnPassant() : renderWaiting("Opponent is Choosing")) : 
             renderGameOver()}
        </div>
    );
};

export default GameOverlay;
