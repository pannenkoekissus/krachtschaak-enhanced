
// DO NOT MODIFY THIS FILE UNLESS INSTRUCTED TO DO SO
import React, { useState } from 'react';
import { auth, db } from '../firebaseConfig';
import { RatingCategory, RATING_CATEGORIES } from '../utils/ratings';

interface AuthProps {
    onClose: () => void;
    onAuthSuccess: (initialData?: { ratings: Record<RatingCategory, number> } | null) => void;
}

const Auth: React.FC<AuthProps> = ({ onClose, onAuthSuccess }) => {
    const [authView, setAuthView] = useState<'signIn' | 'signUp' | 'forgotPassword'>('signIn');
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [displayName, setDisplayName] = useState('');
    const [error, setError] = useState<string | null>(null);
    const [message, setMessage] = useState<string | null>(null);
    const [isLoading, setIsLoading] = useState(false);
    const [isPasswordVisible, setIsPasswordVisible] = useState(false);

    const clearState = () => {
        setError(null);
        setMessage(null);
    };

    const resetToSignIn = () => {
        clearState();
        setEmail('');
        setPassword('');
        setIsPasswordVisible(false);
        setAuthView('signIn');
    }
    
    const handleAuthAction = async (e: React.FormEvent) => {
        e.preventDefault();
        setIsLoading(true);
        clearState();

        if (!auth) {
            setError("Firebase is not configured. Cannot perform authentication.");
            setIsLoading(false);
            return;
        }

        try {
            if (authView === 'signUp') {
                if (displayName.includes("@")) {
                    throw new Error("Display name must not contain @");
                }
                const trimmedName = displayName.trim();
                if (trimmedName.length < 3) {
                    throw new Error("Display name must be at least 3 characters.");
                }

                // Check if username is taken
                const usernameRef = db.ref(`usernames/${trimmedName.toLowerCase()}`);
                const usernameSnapshot = await usernameRef.once('value');
                if (usernameSnapshot.exists()) {
                    throw new Error("Display name is already taken. Please choose another.");
                }

                const userCredential = await auth.createUserWithEmailAndPassword(email, password);
                await userCredential.user.updateProfile({ displayName: trimmedName });
                
                // Reserve username with UID
                await usernameRef.set(userCredential.user.uid);
                // Store email in users section
                await db.ref(`users/${userCredential.user.uid}/email`).set(email);

                await userCredential.user.sendEmailVerification();
                
                await auth.signOut();
                
                setMessage("Account created! Please check your email for a verification link, then you can sign in.");
                setAuthView('signIn');

            } else { // 'signIn'
                let loginEmail = email;
                if (!email.includes("@")) {
                    const usernameSnapshot = await db.ref(`usernames/${email.toLowerCase().trim()}`).get();
                    if (usernameSnapshot.exists()) {
                        const userUid = usernameSnapshot.val();
                        const userEmailSnapshot = await db.ref(`users/${userUid}/email`).get();
                        if (userEmailSnapshot.exists()) {
                            loginEmail = userEmailSnapshot.val();
                        } else {
                            throw new Error("Username not found.");
                        }
                    } else {
                        throw new Error("Username not found.");
                    }
                }
                const userCredential = await auth.signInWithEmailAndPassword(loginEmail, password);
                if (!userCredential.user.emailVerified) {
                    // Credentials were correct, but email is not verified.
                    await userCredential.user.sendEmailVerification();
                    await auth.signOut(); // Immediately sign them out.
                    setError("Your email is not verified. A new verification link has been sent. Please verify your account and then sign in.");
                } else {
                    // Credentials correct and email is verified. Successful login.
                    const ratingSnapshot = await db.ref(`userRatings/${userCredential.user.uid}`).once('value');
                    onAuthSuccess(ratingSnapshot.val());
                    onClose();
                }
            }
        } catch (err: any) {
            if (authView === 'signIn') {
                switch (err.code) {
                    case 'auth/too-many-requests':
                        setError("Please refresh the page, wait a bit and try again. You likely need to verify your email");
                        break;
                    case 'auth/invalid-credential':
                    case 'auth/user-not-found':
                    case 'auth/wrong-password':
                        setError("Wrong login credentials. Please try again.");
                        break;
                    default:
                        // Also check for the generic message for some environments
                        if (err.message?.includes('INVALID_LOGIN_CREDENTIALS')) {
                             setError("Wrong login credentials. Please try again.");
                        } else {
                            setError(err.message || "An unknown error occurred.");
                        }
                        break;
                }
            } else { // Handle errors for signUp view
                 setError(err.message || "An unknown error occurred.");
            }
        } finally {
            setIsLoading(false);
        }
    };
    
    const handlePasswordReset = async (e: React.FormEvent) => {
        e.preventDefault();
        setIsLoading(true);
        clearState();

        if (!auth) {
            setError("Firebase is not configured.");
            setIsLoading(false);
            return;
        }

        try {
            await auth.sendPasswordResetEmail(email);
            setMessage("Password reset link sent to your email. Please check your inbox (and spam folder).");
        } catch (err: any) {
            setError(err.message);
        } finally {
            setIsLoading(false);
        }
    };

    const handleAnonymousSignIn = async () => {
        setIsLoading(true);
        clearState();
        
        if (!auth) {
            setError("Firebase is not configured. Cannot perform authentication.");
            setIsLoading(false);
            return;
        }

        try {
            const userCredential = await auth.signInAnonymously();
            const userRatingRef = db.ref(`userRatings/${userCredential.user.uid}`);
            const ratingSnapshot = await userRatingRef.once('value');
            let ratingsData = ratingSnapshot.val();

            if (!ratingsData) {
                const initialRatings = RATING_CATEGORIES.reduce((acc, category) => {
                    acc[category] = 1200;
                    return acc;
                }, {} as Record<RatingCategory, number>);
                ratingsData = { ratings: initialRatings };
                await userRatingRef.set(ratingsData);
            }
            
            onAuthSuccess(ratingsData);
            onClose();
        } catch (err: any) {
            setError(err.message);
        } finally {
            setIsLoading(false);
        }
    };

    const renderSignIn = () => (
        <form onSubmit={handleAuthAction}>
            <div className="mb-4">
                <label className="block mb-1 text-md font-medium text-gray-300">Email or Username</label>
                <input type="text" value={email} onChange={(e) => { setEmail(e.target.value); clearState(); }} required className="w-full p-2 bg-gray-700 text-white rounded-lg border-2 border-gray-600 focus:outline-none focus:border-green-500" />
            </div>
            <div className="mb-2">
                <label className="block mb-1 text-md font-medium text-gray-300">Password</label>
                <div className="relative">
                    <input 
                        type={isPasswordVisible ? 'text' : 'password'} 
                        value={password} 
                        onChange={e => { setPassword(e.target.value); clearState(); }} 
                        required 
                        className="w-full p-2 pr-10 bg-gray-700 text-white rounded-lg border-2 border-gray-600 focus:outline-none focus:border-green-500" 
                    />
                    <button 
                        type="button" 
                        onClick={() => setIsPasswordVisible(!isPasswordVisible)}
                        className="absolute inset-y-0 right-0 px-3 flex items-center text-gray-400 hover:text-white"
                        aria-label={isPasswordVisible ? "Hide password" : "Show password"}
                    >
                        {isPasswordVisible ? (
                            <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
                                <path d="M10 12a2 2 0 100-4 2 2 0 000 4z" />
                                <path fillRule="evenodd" d="M.458 10C1.732 5.943 5.522 3 10 3s8.268 2.943 9.542 7c-1.274 4.057-5.02 7-9.542 7S1.732 14.057.458 10zM14 10a4 4 0 11-8 0 4 4 0 018 0z" clipRule="evenodd" />
                            </svg>
                        ) : (
                            <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
                                <path fillRule="evenodd" d="M3.707 2.293a1 1 0 00-1.414 1.414l14 14a1 1 0 001.414-1.414l-1.473-1.473A10.014 10.014 0 0019.542 10C18.268 5.943 14.478 3 10 3a9.958 9.958 0 00-4.512 1.074l-1.78-1.781zm4.261 4.26l1.514 1.515a2.003 2.003 0 012.45 2.45l1.514 1.514a4 4 0 00-5.478-5.478z" clipRule="evenodd" />
                                <path d="M12.454 16.697L9.75 13.992a4 4 0 01-3.742-3.742L2.303 3.546A10.048 10.048 0 00.458 10c1.274 4.057 5.02 7 9.542 7 .847 0 1.669-.105 2.454-.303z" />
                            </svg>
                        )}
                    </button>
                </div>
            </div>
             <div className="text-right mb-4">
                 <a href="#" onClick={(e) => { e.preventDefault(); clearState(); setAuthView('forgotPassword'); }} className="text-sm text-green-400 hover:underline">Forgot Password?</a>
            </div>
            <button type="submit" disabled={isLoading} className="w-full py-3 bg-purple-600 hover:bg-purple-700 rounded-lg text-lg font-semibold transition-colors disabled:bg-gray-500">
                {isLoading ? 'Loading...' : 'Sign In'}
            </button>
        </form>
    );
    
    const renderSignUp = () => (
        <form onSubmit={handleAuthAction}>
             <div className="mb-4">
                <label className="block mb-1 text-md font-medium text-gray-300">Display Name</label>
                <input type="text" value={displayName} onChange={e => setDisplayName(e.target.value)} required minLength={3} maxLength={20} className="w-full p-2 bg-gray-700 text-white rounded-lg border-2 border-gray-600 focus:outline-none focus:border-green-500" />
            </div>
            <div className="mb-4">
                <label className="block mb-1 text-md font-medium text-gray-300">Email</label>
                <input type="email" value={email} onChange={e => setEmail(e.target.value)} required className="w-full p-2 bg-gray-700 text-white rounded-lg border-2 border-gray-600 focus:outline-none focus:border-green-500" />
            </div>
            <div className="mb-6">
                <label className="block mb-1 text-md font-medium text-gray-300">Password</label>
                <input type="password" value={password} onChange={e => setPassword(e.target.value)} required minLength={6} className="w-full p-2 bg-gray-700 text-white rounded-lg border-2 border-gray-600 focus:outline-none focus:border-green-500" />
            </div>
            <button type="submit" disabled={isLoading} className="w-full py-3 bg-purple-600 hover:bg-purple-700 rounded-lg text-lg font-semibold transition-colors disabled:bg-gray-500">
                {isLoading ? 'Creating Account...' : 'Sign Up'}
            </button>
        </form>
    );

    const renderForgotPassword = () => (
        <form onSubmit={handlePasswordReset}>
            <p className="text-center text-gray-300 mb-4">Enter your email and we'll send you a link to reset your password.</p>
            <div className="mb-4">
                <label className="block mb-1 text-md font-medium text-gray-300">Email</label>
                <input type="email" value={email} onChange={e => setEmail(e.target.value)} required className="w-full p-2 bg-gray-700 text-white rounded-lg border-2 border-gray-600 focus:outline-none focus:border-green-500" />
            </div>
            <button type="submit" disabled={isLoading} className="w-full py-3 bg-purple-600 hover:bg-purple-700 rounded-lg text-lg font-semibold transition-colors disabled:bg-gray-500">
                {isLoading ? 'Sending...' : 'Send Reset Link'}
            </button>
        </form>
    );

    return (
        <div className="fixed inset-0 flex items-center justify-center z-50">
            <div className="bg-gray-800 p-8 rounded-xl shadow-2xl w-full max-w-md relative">
                <button onClick={onClose} className="absolute top-2 right-3 text-2xl text-gray-400 hover:text-white">&times;</button>
                <h2 className="text-3xl font-bold mb-6 text-center text-green-400">
                    {authView === 'signIn' ? 'Sign In' : authView === 'signUp' ? 'Create Account' : 'Reset Password'}
                </h2>
                {error && <p className="bg-red-900 border border-red-500 text-red-300 p-3 rounded-lg mb-4 font-semibold text-center">{error}</p>}
                {message && <p className="bg-green-900 border border-green-500 text-green-300 p-3 rounded-lg mb-4 font-semibold text-center">{message}</p>}
                
                {authView === 'signIn' && renderSignIn()}
                {authView === 'signUp' && renderSignUp()}
                {authView === 'forgotPassword' && renderForgotPassword()}

                <div className="mt-6 text-center">
                    {authView === 'signIn' && (
                        <p className="text-gray-300">Don't have an account? <a href="#" onClick={(e) => { e.preventDefault(); clearState(); setAuthView('signUp'); }} className="font-semibold text-green-400 hover:underline">Sign Up</a></p>
                    )}
                    {authView === 'signUp' && (
                        <p className="text-gray-300">Already have an account? <a href="#" onClick={(e) => { e.preventDefault(); resetToSignIn(); }} className="font-semibold text-green-400 hover:underline">Sign In</a></p>
                    )}
                     {authView === 'forgotPassword' && (
                        <p className="text-gray-300">Remember your password? <a href="#" onClick={(e) => { e.preventDefault(); resetToSignIn(); }} className="font-semibold text-green-400 hover:underline">Sign In</a></p>
                    )}
                    <div className="my-4 flex items-center"><div className="flex-grow border-t border-gray-600"></div><span className="flex-shrink mx-4 text-gray-400">OR</span><div className="flex-grow border-t border-gray-600"></div></div>
                    <button onClick={handleAnonymousSignIn} disabled={isLoading} className="w-full py-3 bg-gray-600 hover:bg-gray-700 rounded-lg text-lg font-semibold transition-colors disabled:bg-gray-500">
                         {isLoading ? 'Loading...' : 'Continue as Guest'}
                    </button>
                </div>
            </div>
        </div>
    );
};

export default Auth;
