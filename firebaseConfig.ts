// This file is populated with the public configuration for your Firebase project.

// IMPORTANT: For this to work, you must enable the Realtime Database
// in your Firebase console.
// 1. Go to Build > Realtime Database
// 2. Click "Create Database"
// 3. Select a location and "Start in test mode".

// Note: The Firebase SDK scripts must be included in index.html for this to work.
// We are using the global `firebase` object provided by those scripts.

// Extend the global Window interface to declare the firebase object
declare global {
    interface Window {
        firebase: any;
    }
}

// Your web app's Firebase configuration
const firebaseConfig = {
    apiKey: "AIzaSyDuQk34hZnfNSkD0tEFQvXnaHmffFsGcOQ",
    authDomain: "gen-lang-client-0495001492.firebaseapp.com",
    databaseURL: "https://gen-lang-client-0495001492-default-rtdb.europe-west1.firebasedatabase.app",
    projectId: "gen-lang-client-0495001492",
    storageBucket: "gen-lang-client-0495001492.firebasestorage.app",
    messagingSenderId: "431186330751",
    appId: "1:431186330751:web:8f61c2843ed8c249946b4a",
    measurementId: "G-YDXLJF6J63"
};


export let isFirebaseConfigured = true;
let authInstance: any = null;
let dbInstance: any = null;

// Check if the config is still a placeholder. If so, disable online features.
// NOTE: This check is against a known placeholder key, which you have now replaced.
// This logic is kept to allow easy de-configuration for testing if needed.
if (firebaseConfig.apiKey === "AIzaSy_YOUR_UNIQUE_API_KEY") {
    console.warn(
        "%cFirebase not configured!",
        "color: orange; font-weight: bold; font-size: 14px;",
        "\nOnline features are disabled. To enable them, please update 'firebaseConfig.ts' with your own Firebase project's configuration.\nSee the comments in the file for instructions."
    );
    isFirebaseConfigured = false;
}

if (isFirebaseConfigured) {
    // Defensively check if the Firebase SDK has loaded to prevent a race condition.
    if (window.firebase) {
        // Initialize Firebase
        // This check prevents Firebase from being initialized multiple times.
        if (!window.firebase.apps.length) {
            window.firebase.initializeApp(firebaseConfig);
            // It's good practice to check if analytics is available before calling it
            if (window.firebase.analytics) {
                window.firebase.analytics(); // Initialize Analytics
            }
        }

        // Export the auth instance for use in other parts of the app
        authInstance = window.firebase.auth();
        dbInstance = window.firebase.database();
    } else {
        console.warn(
            "%cFirebase SDK not loaded!",
            "color: orange; font-weight: bold; font-size: 14px;",
            "\nOnline features will be disabled. This might be due to a network error or an ad blocker."
        );
        isFirebaseConfigured = false;
    }
}

export const auth = authInstance;
export const db = dbInstance;