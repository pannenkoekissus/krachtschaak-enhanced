import React, { Component, ErrorInfo, ReactNode } from 'react';

interface Props {
    children: ReactNode;
}

interface State {
    hasError: boolean;
    error: Error | null;
    errorInfo: ErrorInfo | null;
}

class ErrorBoundary extends Component<Props, State> {
    constructor(props: Props) {
        super(props);
        this.state = {
            hasError: false,
            error: null,
            errorInfo: null,
        };
    }

    public static getDerivedStateFromError(error: Error): State {
        return { hasError: true, error, errorInfo: null };
    }

    public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
        console.error('Uncaught error:', error, errorInfo);
        this.setState({ error, errorInfo });
    }

    public render() {
        if (this.state.hasError) {
            return (
                <div className="min-h-screen flex flex-col items-center justify-center bg-gray-900 text-white p-4 text-center">
                    <div className="bg-gray-800 p-8 rounded-xl shadow-2xl w-full max-w-2xl border border-red-500">
                        <h1 className="text-4xl font-bold mb-4 text-red-500">Something went wrong</h1>
                        <p className="text-gray-300 mb-6">
                            The application encountered an unexpected error. Don't worry, your game data is likely safe on the server.
                        </p>

                        <div className="bg-black p-4 rounded text-left mb-6 overflow-auto max-h-64 border border-gray-700">
                            <p className="text-red-400 font-mono text-sm font-bold mb-2">
                                {this.state.error && this.state.error.toString()}
                            </p>
                            <pre className="text-gray-500 font-mono text-xs whitespace-pre-wrap">
                                {this.state.errorInfo && this.state.errorInfo.componentStack}
                            </pre>
                        </div>

                        <div className="flex flex-col sm:flex-row gap-4 justify-center">
                            <button
                                onClick={() => window.location.reload()}
                                className="px-6 py-3 bg-blue-600 hover:bg-blue-700 rounded-lg font-bold transition-colors"
                            >
                                Reload Application
                            </button>
                            <button
                                onClick={() => this.setState({ hasError: false, error: null, errorInfo: null })}
                                className="px-6 py-3 bg-gray-700 hover:bg-gray-600 rounded-lg font-bold transition-colors"
                            >
                                Try to Recover
                            </button>
                        </div>

                        <p className="mt-8 text-xs text-gray-500">
                            If this keeps happening, please contact us at <a href="mailto:pannenkoekissus@gmail.com" className="underline">pannenkoekissus@gmail.com</a>
                        </p>
                    </div>
                </div>
            );
        }

        return this.props.children;
    }
}

export default ErrorBoundary;
