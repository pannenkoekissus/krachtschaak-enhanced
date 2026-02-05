import KrachtschaakAI from './engine';

// Worker listens for start/stop messages and runs iterative deepening.
self.addEventListener('message', async (e: MessageEvent) => {
    const data = e.data || {};
    const type = data.type;

    if (type === 'start') {
        const { board, turn, maxDepth, requestId } = data;
        KrachtschaakAI.resetStopFlag();

        try {
            const best = await (KrachtschaakAI as any).getBestMoveIterative(board, turn, maxDepth, (move: any, depth: number) => {
                // send intermediate updates
                (self as any).postMessage({ type: 'update', move, depth, requestId });
            });

            (self as any).postMessage({ type: 'done', move: best, requestId });
        } catch (err) {
            (self as any).postMessage({ type: 'error', error: String(err), requestId });
        }
    }

    if (type === 'stop') {
        KrachtschaakAI.shouldStop = true;
        (self as any).postMessage({ type: 'stopped', requestId: data.requestId });
    }
});

export {};
