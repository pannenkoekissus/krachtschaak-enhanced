
// Simple sound synthesizer using Web Audio API

let audioCtx: AudioContext | null = null;

const initAudio = () => {
    if (!audioCtx) {
        audioCtx = new (window.AudioContext || (window as any).webkitAudioContext)();
    }
    if (audioCtx.state === 'suspended') {
        audioCtx.resume();
    }
};

const playTone = (freq: number, type: OscillatorType, duration: number, startTime: number = 0, vol: number = 0.1) => {
    if (!audioCtx) return;
    const osc = audioCtx.createOscillator();
    const gainNode = audioCtx.createGain();

    osc.type = type;
    osc.frequency.setValueAtTime(freq, audioCtx.currentTime + startTime);

    gainNode.gain.setValueAtTime(vol, audioCtx.currentTime + startTime);
    gainNode.gain.exponentialRampToValueAtTime(0.01, audioCtx.currentTime + startTime + duration);

    osc.connect(gainNode);
    gainNode.connect(audioCtx.destination);

    osc.start(audioCtx.currentTime + startTime);
    osc.stop(audioCtx.currentTime + startTime + duration);
};

const playNoise = (duration: number, vol: number = 0.1) => {
    if (!audioCtx) return;
    const bufferSize = audioCtx.sampleRate * duration;
    const buffer = audioCtx.createBuffer(1, bufferSize, audioCtx.sampleRate);
    const data = buffer.getChannelData(0);

    for (let i = 0; i < bufferSize; i++) {
        data[i] = Math.random() * 2 - 1;
    }

    const noise = audioCtx.createBufferSource();
    noise.buffer = buffer;
    const gainNode = audioCtx.createGain();

    // Lowpass filter to make it sound more like a thud
    const filter = audioCtx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = 1000;

    gainNode.gain.setValueAtTime(vol, audioCtx.currentTime);
    gainNode.gain.exponentialRampToValueAtTime(0.01, audioCtx.currentTime + duration);

    noise.connect(filter);
    filter.connect(gainNode);
    gainNode.connect(audioCtx.destination);

    noise.start();
};

export const playMoveSound = () => {
    initAudio();
    // A nice wooden "thock" sound
    playNoise(0.05, 0.4);
    playTone(150, 'sine', 0.1, 0, 0.2);
};

export const playCaptureSound = () => {
    initAudio();
    // Sharper, higher pitched "thwack"
    playNoise(0.05, 0.5);
    playTone(600, 'triangle', 0.05, 0, 0.2);
    playTone(300, 'sawtooth', 0.1, 0.02, 0.2);
};

export const playCheckSound = () => {
    initAudio();
    // Urgent beep
    playTone(800, 'sine', 0.1, 0, 0.1);
    playTone(800, 'sine', 0.1, 0.15, 0.1);
};

export const playWinSound = () => {
    initAudio();
    // Major Arpeggio
    playTone(523.25, 'triangle', 0.2, 0, 0.2); // C5
    playTone(659.25, 'triangle', 0.2, 0.1, 0.2); // E5
    playTone(783.99, 'triangle', 0.4, 0.2, 0.2); // G5
    playTone(1046.50, 'triangle', 0.6, 0.3, 0.2); // C6
};

export const playLossSound = () => {
    initAudio();
    // Minor descending
    playTone(783.99, 'sawtooth', 0.3, 0, 0.1); // G5
    playTone(622.25, 'sawtooth', 0.3, 0.2, 0.1); // Eb5
    playTone(523.25, 'sawtooth', 0.6, 0.4, 0.1); // C5
};

export const playDrawSound = () => {
    initAudio();
    // Neutral chords
    playTone(440, 'sine', 0.4, 0, 0.1);
    playTone(440, 'sine', 0.4, 0.2, 0.1);
};
