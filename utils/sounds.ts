import MoveSound from '../sounds/Move.mp3';
import CaptureSound from '../sounds/Capture.mp3';
import GameEndSound from '../sounds/game_end.mp3';
import LowTimeSound from '../sounds/LowTime.mp3';
import { Howl } from 'howler';

export const playMoveSound = () => {
    new Howl({
        src: [MoveSound],
        volume: 0.5,
    }).play();
};

export const playCaptureSound = () => {
    new Howl({
        src: [CaptureSound],
        volume: 0.5,
    }).play();
};

export const playWinSound = () => {
    new Howl({
        src: [GameEndSound],
        volume: 0.5,
    }).play();
};

export const playLossSound = () => {
    new Howl({
        src: [GameEndSound],
        volume: 0.5,
    }).play();
};

export const playDrawSound = () => {
    new Howl({
        src: [GameEndSound],
        volume: 0.5,
    }).play();
};

export const playLowTimeSound = () => {
    new Howl({
        src: [LowTimeSound],
        volume: 0.5,
    }).play();
};