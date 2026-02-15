
// DO NOT MODIFY THIS FILE UNLESS INSTRUCTED TO DO SO
import { RatingCategory } from './utils/ratings';

export enum PieceType {
  Pawn = 'pawn',
  Rook = 'rook',
  Knight = 'knight',
  Bishop = 'bishop',
  Queen = 'queen',
  King = 'king',
}

export enum Color {
  White = 'white',
  Black = 'black',
}

export interface Piece {
  type: PieceType;
  color: Color;
  power: PieceType | null;
  originalType: PieceType;
  isKing: boolean;
  hasMoved?: boolean;
}

export type Square = Piece | null;
export type BoardState = Square[][];

export interface Position {
  row: number;
  col: number;
}

export interface Move {
  from: Position;
  to: Position;
  piece: PieceType;
  captured?: PieceType;
  promotion?: PieceType;
  notation: string;
  color: Color;
  afterPower?: PieceType | null;
  isForcePower?: boolean;
  powerConsumed?: boolean;
}

export interface ChatMessage {
  sender: string;
  text: string;
  timestamp: number;
  uid: string;
}

export type GameStatus =
  | 'waiting'
  | 'playing'
  | 'checkmate'
  | 'kingCaptured'
  | 'stalemate'
  | 'promotion'
  | 'draw_threefold'
  | 'draw_fiftyMove'
  | 'draw_agreement'
  | 'timeout'
  | 'ambiguous_en_passant'
  | 'opponent_disconnected'
  | 'resignation';

export interface PromotionData {
  from: Position;
  position: Position;
  promotingPiece: Piece;
  powerAfterPromotion: PieceType | null;
}

export type GameMode = 'menu' | 'local' | 'online_lobby' | 'online_playing' | 'online_spectating';

export type TimerSettings = { initialTime: number; increment: number; } | { daysPerMove: number; } | null;

export interface PlayerInfo {
  uid: string;
  displayName: string;
  disconnectTimestamp: number | null;
  ratings: Record<RatingCategory, number>;
  lastReadChatTimestamp?: number;
}

export interface UserInfo {
  uid: string;
  displayName: string;
  isOnline: boolean;
  ratings: Record<RatingCategory, number>;
}

// NEW: Direct Inbox Style Challenge
export interface IncomingChallenge {
  id: string;
  fromUid: string;
  fromName: string;
  fromRating: number;
  timerSettings: TimerSettings;
  ratingCategory: RatingCategory;
  isRated: boolean;
  timestamp: number;
  challengeColor?: string;
}

export interface SentChallenge {
  id: string;
  targetUid: string;
  targetName: string;
  timestamp: number;
  isRealtime: boolean;
  timerSettings: TimerSettings;
  ratingCategory: RatingCategory;
  isRated: boolean;
  challengeColor?: string;
}

export interface ActiveGameSummary {
  gameId: string;
  opponent: { uid: string, displayName: string, ratings: Record<RatingCategory, number> } | null;
  isMyTurn: boolean;
  status: GameStatus;
  timerSettings: TimerSettings;
  ratingCategory: RatingCategory;
  myColor: Color;
  moveDeadline: number | null;
  playerTimes: { white: number; black: number; } | null;
  turnStartTime: number | null;
  challengedPlayerInfo?: { uid: string, displayName: string } | null;
  isRated: boolean;
}


// Represents a snapshot of the game state for the history and online sync
export interface GameState {
  board: BoardState;
  turn: Color;
  status: GameStatus;
  winner: string | null;
  promotionData: PromotionData | null;
  capturedPieces: Record<Color, Piece[]>;
  enPassantTarget: Position | null;
  halfmoveClock: number;
  positionHistory: Record<string, number>;
  ambiguousEnPassantData: { from: Position, to: Position } | null;
  drawOffer: Color | null;
  playerTimes: { white: number; black: number; } | null;
  turnStartTime: number | null;
  moveDeadline: number | null; // For daily games
  completedAt?: number | null;
  timerSettings: TimerSettings;
  ratingCategory: RatingCategory;
  players: { [uid: string]: PlayerInfo };
  playerColors: { white: string | null; black: string | null; };
  initialRatings: { white: number; black: number; } | null;
  isRated: boolean;
  rematchOffer: Color | null;
  nextGameId: string | null;
  ratingChange: { white: number, black: number } | null;
  challengedPlayerInfo?: { uid: string, displayName: string } | null;
  playersLeft?: { [uid: string]: boolean };
  lastMove?: { from: Position, to: Position } | null;
  premoves?: { [color in Color]?: { from: Position, to: Position, isForcePower: boolean } | null };
  moveHistory?: Move[];
  chat?: ChatMessage[];
}

export interface LobbyGame {
  gameId: string;
  creatorName: string;
  creatorUid: string;
  creatorRatings: Record<RatingCategory, number>;
  timerSettings: TimerSettings;
  ratingCategory: RatingCategory;
  isRated: boolean;
}
