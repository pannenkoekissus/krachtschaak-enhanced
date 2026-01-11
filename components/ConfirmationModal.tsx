import React from 'react';

interface ConfirmationModalProps {
    title: string;
    message: string;
    onConfirm: () => void;
    onCancel: () => void;
    confirmText?: string;
    cancelText?: string;
}

const ConfirmationModal: React.FC<ConfirmationModalProps> = ({
    title,
    message,
    onConfirm,
    onCancel,
    confirmText = 'Confirm',
    cancelText = 'Cancel',
}) => {
    return (
        <div 
            className="fixed inset-0 bg-black bg-opacity-75 flex items-center justify-center z-50"
            onClick={onCancel}
            aria-modal="true"
            role="dialog"
        >
            <div 
                className="bg-gray-800 p-8 rounded-xl shadow-2xl w-full max-w-sm relative text-center"
                onClick={(e) => e.stopPropagation()}
            >
                <h3 className="text-2xl font-bold mb-4 text-yellow-300">{title}</h3>
                <p className="text-gray-300 mb-6">{message}</p>
                <div className="flex justify-center gap-4">
                    <button 
                        onClick={onCancel}
                        className="px-6 py-2 bg-gray-600 hover:bg-gray-700 rounded-lg font-semibold transition-colors"
                    >
                        {cancelText}
                    </button>
                    <button 
                        onClick={onConfirm}
                        className="px-6 py-2 bg-red-600 hover:bg-red-700 rounded-lg font-semibold transition-colors"
                    >
                        {confirmText}
                    </button>
                </div>
            </div>
        </div>
    );
};

export default ConfirmationModal;