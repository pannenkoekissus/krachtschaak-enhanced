import { useState, useEffect } from 'react';
import { Network } from '@capacitor/network';

/** Returns true when the browser (or Capacitor) believes it has internet connectivity. */
const useOnlineStatus = (): boolean => {
    const [isOnline, setIsOnline] = useState(navigator.onLine);

    useEffect(() => {
        // Initial check using Capacitor Network if available
        const checkInitialStatus = async () => {
            try {
                const status = await Network.getStatus();
                setIsOnline(status.connected);
            } catch (e) {
                // Fallback to navigator.onLine if Capacitor Network fails or is not available
                setIsOnline(navigator.onLine);
            }
        };

        checkInitialStatus();

        // Listener for changes
        const handler = Network.addListener('networkStatusChange', (status) => {
            setIsOnline(status.connected);
        });

        // Fallback standard listeners (just in case)
        const handleOnline = () => setIsOnline(true);
        const handleOffline = () => setIsOnline(false);
        window.addEventListener('online', handleOnline);
        window.addEventListener('offline', handleOffline);

        return () => {
            handler.then(h => h.remove());
            window.removeEventListener('online', handleOnline);
            window.removeEventListener('offline', handleOffline);
        };
    }, []);

    return isOnline;
};

export default useOnlineStatus;
