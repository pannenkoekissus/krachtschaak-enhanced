
import React, { useState, useEffect } from 'react';
import { GameState, Color, BoardState, Piece, Move } from '../types';
import Board from './Board';
import PieceComponent from './Piece';
import { createInitialBoard, applyMoveToBoard } from '../utils/game';
import KrachtschaakAI from '../engine';

interface GameReviewProps {
    game: GameState;
    onBack: () => void;
}

const formatTimerSettingText = (settings: GameState['timerSettings']) => {
    if (!settings) return 'Unlimited';
    if ('daysPerMove' in settings) return `${settings.daysPerMove} day${settings.daysPerMove > 1 ? 's' : ''} / move`;
    return `${settings.initialTime / 60} min | ${settings.increment} sec`;
};

const GameReview: React.FC<GameReviewProps> = ({ game, onBack }) => {
    // We reconstruct the board state history locally for review
    const [currentMoveIndex, setCurrentMoveIndex] = useState(-1); // -1 means initial board
    const [boards, setBoards] = useState<BoardState[]>([]);
    const [moves, setMoves] = useState<Move[]>([]);
    const [engineDepth, setEngineDepth] = useState(3);
    // engineDepth removed: engine will search until user interaction
    const [engineSuggestion, setEngineSuggestion] = useState<string | null>(null);
    const [engineThinking, setEngineThinking] = useState(false);
    
    const workerRef = React.useRef<Worker | null>(null);
    const requestIdRef = React.useRef<number | null>(null);

    const terminateWorker = () => {
        if (workerRef.current) {
            try { workerRef.current.terminate(); } catch (e) {}
            workerRef.current = null;
        }
        requestIdRef.current = null;
        setEngineThinking(false);
    };

    // --- START SANITIZATION ---
    // Keep the sanitization for the final state display if needed, 
    // but we primarily rely on replaying moves from initial board now.
    const sanitizePiece = (p: any): Piece | null => {
        if (p && typeof p === 'object' && p.type && p.color) {
            return {
                type: p.type,
                color: p.color,
                power: p.power || null,
                originalType: p.originalType || p.type,
                isKing: !!p.isKing,
                hasMoved: typeof p.hasMoved === 'boolean' ? p.hasMoved : false,
            };
        }
        return null;
    };

    useEffect(() => {
        return () => {
            // terminate worker on unmount to free resources
            if (workerRef.current) {
                try { workerRef.current.terminate(); } catch (e) {}
                workerRef.current = null;
            }
        };
    }, []);
    
    const sanitizePieceArray = (arr: any[] | undefined): Piece[] => {
        if (!Array.isArray(arr)) return [];
        return arr.map(sanitizePiece).filter((p): p is Piece => p !== null);
    };

    const sanitizedCapturedPieces = {
        white: sanitizePieceArray(game.capturedPieces?.white),
        black: sanitizePieceArray(game.capturedPieces?.black),
    };
    
    const sanitizedPlayers = game.players || {};
    // --- END SANITIZATION ---

    useEffect(() => {
        // Reconstruct the game history
        const history: BoardState[] = [];
        let currentBoard = createInitialBoard();
        history.push(currentBoard);

        const gameMoves = game.moveHistory || [];
        setMoves(gameMoves);

        for (const move of gameMoves) {
            currentBoard = applyMoveToBoard(currentBoard, move);
            history.push(currentBoard);
        }
        setBoards(history);
        setCurrentMoveIndex(gameMoves.length - 1); // Start at the end
    }, [game]);

    const { status, winner, playerColors, initialRatings, ratingChange, isRated, ratingCategory, timerSettings } = game;

    const getResultMessage = () => {
        switch(status) {
            case 'kingCaptured': return `${winner} wins by capturing the king!`;
            case 'resignation': return `${winner} wins by resignation.`;
            case 'checkmate': return `${winner} wins by checkmate!`;
            case 'stalemate': return `Stalemate! It's a draw.`;
            case 'draw_threefold': return `Draw by threefold repetition.`;
            case 'draw_fiftyMove': return `Draw by 50-move rule.`;
            case 'draw_agreement': return `Draw by agreement.`;
            case 'timeout': return `${winner} wins on time!`;
            case 'opponent_disconnected': return `${winner} wins, opponent disconnected.`;
            default: return "Game Over";
        }
    };

    const whitePlayer = playerColors.white ? sanitizedPlayers[playerColors.white] : null;
    const blackPlayer = playerColors.black ? sanitizedPlayers[playerColors.black] : null;

    // The board to display is at index + 1 because boards[0] is initial state
    const displayBoard = boards.length > 0 ? boards[currentMoveIndex + 1] : createInitialBoard();
    const lastMove = currentMoveIndex >= 0 ? moves[currentMoveIndex] : null;

    const stopWorker = () => {
        if (workerRef.current) {
            try {
                workerRef.current.postMessage({ type: 'stop', requestId: requestIdRef.current });
            } catch (e) {
                // ignore
            }
            workerRef.current.terminate();
            workerRef.current = null;
        }
        requestIdRef.current = null;
        setEngineThinking(false);
    };

    const changeIndex = (newIndex: number) => {
        stopWorker();
        setCurrentMoveIndex(newIndex);
    };

    const handleStep = (step: number) => {
        let newIndex = currentMoveIndex + step;
        if (newIndex < -1) newIndex = -1;
        if (newIndex >= moves.length) newIndex = moves.length - 1;
        changeIndex(newIndex);
    };

    const handleGetEngineMove = async () => {
        const currentBoard = displayBoard;
        const moveCount = currentMoveIndex + 1;
        const turn = moveCount % 2 === 0 ? Color.White : Color.Black;

        if (engineDepth < 1 || engineDepth > 10 || !Number.isInteger(engineDepth)) return;

        setEngineThinking(true);
        setEngineSuggestion(null);

        const requestId = Date.now();
        requestIdRef.current = requestId;

        // Create a worker if none exists (keep alive between runs so cache stays)
        if (!workerRef.current) {
            const worker = new Worker(new URL('../engine.worker.ts', import.meta.url), { type: 'module' });
            workerRef.current = worker;

            worker.onmessage = (ev: MessageEvent) => {
                const msg = ev.data || {};
                if (msg.requestId !== requestIdRef.current) return; // ignore old jobs

                if (msg.type === 'update') {
                    const move = msg.move;
                    const depth = msg.depth;
                    setEngineSuggestion(`${move.notation} (depth ${depth})`);
                }
                if (msg.type === 'done') {
                    const move = msg.move;
                    if (move) setEngineSuggestion(move.notation);
                    setEngineThinking(false);
                    requestIdRef.current = null;
                }
                if (msg.type === 'stopped') {
                    setEngineThinking(false);
                    workerRef.current = null;
                    requestIdRef.current = null;
                }
                if (msg.type === 'error') {
                    setEngineSuggestion('Error');
                    setEngineThinking(false);
                    try { workerRef.current?.terminate(); } catch (e) {}
                    workerRef.current = null;
                    requestIdRef.current = null;
                }
            };
        }

        // Start analysis
        workerRef.current.postMessage({ type: 'start', board: currentBoard, turn, maxDepth: engineDepth, requestId });
    };

    return (
        <div className="min-h-screen flex flex-col md:flex-row items-center justify-center p-4 gap-8">
            <div className="w-full max-w-lg md:max-w-md lg:max-w-lg xl:max-w-2xl relative flex flex-col gap-4">
                 <div className="bg-gray-800 p-2 rounded flex justify-center gap-4">
                    <button onClick={() => changeIndex(-1)} disabled={currentMoveIndex === -1} className="px-4 py-2 bg-gray-700 hover:bg-gray-600 rounded disabled:opacity-50">&lt;&lt;</button>
                    <button onClick={() => handleStep(-1)} disabled={currentMoveIndex === -1} className="px-4 py-2 bg-gray-700 hover:bg-gray-600 rounded disabled:opacity-50">&lt;</button>
                    <span className="py-2 font-mono w-24 text-center text-lg font-bold">
                        {currentMoveIndex === -1 ? "Start" : `${Math.floor(currentMoveIndex / 2) + 1}. ${moves[currentMoveIndex]?.notation}`}
                    </span>
                    <button onClick={() => handleStep(1)} disabled={currentMoveIndex === moves.length - 1} className="px-4 py-2 bg-gray-700 hover:bg-gray-600 rounded disabled:opacity-50">&gt;</button>
                    <button onClick={() => changeIndex(moves.length - 1)} disabled={currentMoveIndex === moves.length - 1} className="px-4 py-2 bg-gray-700 hover:bg-gray-600 rounded disabled:opacity-50">&gt;&gt;</button>
                </div>

                <Board 
                    board={displayBoard}
                    selectedPiece={null}
                    validMoves={[]}
                    onSquareClick={() => {}}
                    turn={Color.White} // doesn't matter
                    playerColor={Color.White}
                    gameMode="online_playing"
                    isInteractionDisabled={true}
                    onPieceDragStart={() => {}}
                    onPieceDragEnd={() => {}}
                    onSquareDrop={() => {}}
                    draggedPiece={null}
                    premove={null}
                    lastMove={lastMove ? { from: lastMove.from, to: lastMove.to } : null}
                    highlightedSquares={[]}
                    arrows={[]}
                    onBoardMouseDown={() => {}}
                    onBoardMouseUp={() => {}}
                    onBoardContextMenu={(e) => e.preventDefault()}
                />
            </div>
             <div className="w-full md:w-80 bg-gray-800 p-4 rounded-lg shadow-xl flex flex-col max-h-[90vh] overflow-y-auto">
                <h2 className="text-2xl font-bold text-center mb-2 text-green-400">Game Review</h2>
                <p className="text-center text-gray-300 mb-4">{getResultMessage()}</p>

                {/* Engine Analysis Section */}
                <div className="bg-gray-700 p-3 rounded-lg mb-4">
                    <div className="flex flex-col gap-2">
                        <div className="flex items-center justify-between">
                            <label htmlFor="engine-depth-review" className="text-sm text-gray-300 font-semibold">Engine Depth</label>
                            <input
                                id="engine-depth-review"
                                type="number"
                                max={10}
                                value={engineDepth}
                                onChange={e => setEngineDepth(Math.round(Math.min(10, Number(e.target.value))))}
                                className="w-16 px-2 py-1 rounded bg-gray-600 text-white border border-gray-500 focus:outline-none focus:border-green-500 text-sm"
                            />
                        </div>
                        <button
                            onClick={handleGetEngineMove}
                            disabled={engineThinking}
                            className="px-3 py-2 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-600 disabled:cursor-not-allowed rounded font-semibold transition-colors text-sm"
                        >
                            {engineThinking ? 'Analyzing...' : 'Get Best Move'}
                        </button>
                        {engineSuggestion && (
                            <div className="mt-2 p-2 bg-gray-900 rounded border border-green-500">
                                <p className="text-sm text-gray-300">Best move: <span className="text-green-400 font-bold text-lg">{engineSuggestion}</span></p>
                            </div>
                        )}
                    </div>
                </div>

                <div className="bg-gray-700 p-3 rounded-lg mb-4">
                    <h3 className="text-lg font-bold truncate">
                       White: {whitePlayer?.displayName || 'N/A'} {isRated && `(${initialRatings?.white})`}
                    </h3>
                    {isRated && ratingChange && (
                        <p className={ratingChange.white >= 0 ? 'text-green-400' : 'text-red-400'}>
                             Rating change: {ratingChange.white >= 0 ? '+' : ''}{ratingChange.white}
                        </p>
                    )}
                    <h3 className="text-lg font-bold border-b border-t my-2 border-gray-600 py-1">Captured</h3>
                    <div className="flex flex-wrap gap-1 min-h-[40px]">{sanitizedCapturedPieces.black.map((p, i) => p && <div key={i} className="w-8 h-8"><PieceComponent piece={p}/></div>)}</div>
                </div>
                 <div className="bg-gray-700 p-3 rounded-lg mb-4">
                    <h3 className="text-lg font-bold truncate">
                        Black: {blackPlayer?.displayName || 'N/A'} {isRated && `(${initialRatings?.black})`}
                    </h3>
                     {isRated && ratingChange && (
                        <p className={ratingChange.black >= 0 ? 'text-green-400' : 'text-red-400'}>
                            Rating change: {ratingChange.black >= 0 ? '+' : ''}{ratingChange.black}
                        </p>
                    )}
                    <h3 className="text-lg font-bold border-b border-t my-2 border-gray-600 py-1">Captured</h3>
                    <div className="flex flex-wrap gap-1 min-h-[40px]">{sanitizedCapturedPieces.white.map((p, i) => p && <div key={i} className="w-8 h-8"><PieceComponent piece={p}/></div>)}</div>
                </div>

                <div className="flex-grow overflow-y-auto bg-gray-900 p-2 rounded font-mono text-sm mb-4 min-h-[150px]">
                     <table className="w-full text-left">
                        <thead>
                            <tr className="text-gray-500 border-b border-gray-700">
                                <th className="pb-1 w-10">#</th>
                                <th className="pb-1">White</th>
                                <th className="pb-1">Black</th>
                            </tr>
                        </thead>
                        <tbody>
                            {(() => {
                                const rows = [];
                                for (let i = 0; i < moves.length; i += 2) {
                                    const isCurrentRow = currentMoveIndex >= i && currentMoveIndex < i + 2;
                                    rows.push(
                                        <tr key={i} className={`border-b border-gray-800 last:border-0 ${isCurrentRow ? 'bg-gray-700' : ''}`}>
                                            <td className="py-1 text-gray-500">{Math.floor(i / 2) + 1}.</td>
                                            <td 
                                                className={`py-1 cursor-pointer hover:text-white ${currentMoveIndex === i ? 'text-yellow-300 font-bold' : 'text-gray-300'}`}
                                                onClick={() => changeIndex(i)}
                                            >
                                                {moves[i].notation}
                                            </td>
                                            <td 
                                                className={`py-1 cursor-pointer hover:text-white ${currentMoveIndex === i + 1 ? 'text-yellow-300 font-bold' : 'text-gray-300'}`}
                                                onClick={() => { if (moves[i+1]) changeIndex(i + 1); }}
                                            >
                                                {moves[i + 1]?.notation || ''}
                                            </td>
                                        </tr>
                                    );
                                }
                                return rows;
                            })()}
                        </tbody>
                    </table>
                </div>

                <div className="mt-auto pt-4">
                    <p className="text-center text-gray-400 mb-4 capitalize">
                        {formatTimerSettingText(timerSettings)} • {isRated ? `Rated (${ratingCategory})` : 'Unrated'}
                     </p>
                    <button onClick={onBack} className="w-full mt-2 px-4 py-3 bg-blue-600 hover:bg-blue-700 rounded-lg font-semibold transition-colors">
                        Back to Lobby
                    </button>
                </div>
            </div>
        </div>
    );
};

export default GameReview;
