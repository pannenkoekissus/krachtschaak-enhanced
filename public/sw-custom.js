// Custom Service Worker script imported by Workbox sw.js

function getDB() {
    return new Promise((resolve, reject) => {
        const request = indexedDB.open('krachtschaak-sw-db', 1);
        request.onupgradeneeded = (e) => {
            const db = e.target.result;
            if (!db.objectStoreNames.contains('settings')) {
                db.createObjectStore('settings');
            }
        };
        request.onsuccess = (e) => resolve(e.target.result);
        request.onerror = (e) => reject(e.target.error);
    });
}

function getVal(key) {
    return getDB().then(db => {
        return new Promise((resolve) => {
            const transaction = db.transaction('settings', 'readonly');
            const store = transaction.objectStore('settings');
            const req = store.get(key);
            req.onsuccess = () => resolve(req.result);
            req.onerror = () => resolve(null);
        });
    });
}

function setVal(key, val) {
    return getDB().then(db => {
        return new Promise((resolve, reject) => {
            const transaction = db.transaction('settings', 'readwrite');
            const store = transaction.objectStore('settings');
            const req = store.put(val, key);
            req.onsuccess = () => resolve();
            req.onerror = () => reject(req.error);
        });
    });
}

self.addEventListener('message', (event) => {
    if (event.data && event.data.type === 'UPDATE_USER_INFO') {
        const { uid, notifyTurnCorrespondence, notificationsEnabled, notificationFlags } = event.data;
        setVal('user_info', { uid, notifyTurnCorrespondence, notificationsEnabled, notificationFlags });
    }
});

self.addEventListener('periodicsync', (event) => {
    if (event.tag === 'check-notifications') {
        event.waitUntil(checkNotifications());
    }
});

async function checkNotifications() {
    const userInfo = await getVal('user_info');
    if (!userInfo || !userInfo.uid) return;

    const dbUrl = "https://gen-lang-client-0495001492-default-rtdb.europe-west1.firebasedatabase.app";

    // 1. Check Tournaments
    if (userInfo.notificationsEnabled) {
        try {
            const res = await fetch(`${dbUrl}/tournaments.json`);
            if (res.status === 200) {
                const tournaments = await res.json();
                if (tournaments) {
                    const now = Date.now();
                    const oneHour = 60 * 60 * 1000;
                    const userFlags = (userInfo.notificationFlags || '').split(',').map(s => s.trim().toLowerCase()).filter(s => s);

                    let notified = await getVal('notified_tournaments') || {};
                    let changed = false;

                    for (const [id, t] of Object.entries(tournaments)) {
                        if (t.status === 'lobby' && t.expectedStartDate && !notified[id]) {
                            let startTime = 0;
                            if (typeof t.expectedStartDate === 'number') {
                                startTime = t.expectedStartDate;
                            } else {
                                startTime = new Date(t.expectedStartDate).getTime();
                            }

                            const timeUntilStart = startTime - now;

                            if (timeUntilStart > 0 && timeUntilStart <= oneHour) {
                                let shouldNotify = true;
                                if (userFlags.length > 0) {
                                    const tFlags = (t.flags || []).map(f => f.toLowerCase());
                                    shouldNotify = userFlags.some(f => tFlags.includes(f));
                                }

                                if (shouldNotify) {
                                    notified[id] = true;
                                    changed = true;

                                    self.registration.showNotification('Tournament Starting Soon!', {
                                        body: `${t.name} is starting in less than 1 hour.`,
                                        icon: '/icons/icon-192.png',
                                        badge: '/icons/icon-192.png'
                                    });
                                }
                            }
                        }
                    }

                    if (changed) {
                        await setVal('notified_tournaments', notified);
                    }
                }
            }
        } catch (e) {
            console.error('SW: Error checking tournaments', e);
        }
    }

    // 2. Check Correspondence games
    if (userInfo.notifyTurnCorrespondence) {
        try {
            const userGamesRes = await fetch(`${dbUrl}/userGames/${userInfo.uid}.json`);
            if (userGamesRes.status === 200) {
                const gameIds = await userGamesRes.json();
                if (gameIds) {
                    let storedStates = await getVal('correspondence_turn_states') || {};
                    const isFirstLoad = Object.keys(storedStates).length === 0;
                    const newStates = {};
                    let hasChanges = false;

                    for (const gameId of Object.keys(gameIds)) {
                        const gameRes = await fetch(`${dbUrl}/games/${gameId}.json`);
                        if (gameRes.status === 200) {
                            const gameData = await gameRes.json();
                            if (gameData && gameData.status === 'playing') {
                                const myColor = gameData.playerColors.white === userInfo.uid ? 'white' : 'black';
                                const isMyTurn = gameData.turn === myColor;
                                newStates[gameId] = isMyTurn;

                                const isCorrespondence = gameData.timerSettings && 'daysPerMove' in gameData.timerSettings;

                                if (isCorrespondence) {
                                    const wasMyTurn = storedStates[gameId];
                                    if (wasMyTurn !== isMyTurn) {
                                        hasChanges = true;
                                        if (!isFirstLoad && wasMyTurn === false && isMyTurn === true) {
                                            const opponentColor = myColor === 'white' ? 'black' : 'white';
                                            const opponentUid = gameData.playerColors[opponentColor];
                                            const opponentName = opponentUid && gameData.players?.[opponentUid]?.displayName || 'Opponent';
                                            const ratingCat = gameData.ratingCategory || 'Correspondence';

                                            self.registration.showNotification('Your turn!', {
                                                body: `It is your turn against ${opponentName} in a ${ratingCat} game.`,
                                                icon: '/icons/icon-192.png',
                                                badge: '/icons/icon-192.png'
                                            });
                                        }
                                    }
                                }
                            }
                        }
                    }

                    if (isFirstLoad || hasChanges || Object.keys(storedStates).length !== Object.keys(newStates).length) {
                        await setVal('correspondence_turn_states', newStates);
                    }
                }
            }
        } catch (e) {
            console.error('SW: Error checking correspondence turns', e);
        }
    }
}
