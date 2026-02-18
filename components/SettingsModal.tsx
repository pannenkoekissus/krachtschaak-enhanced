
import React from 'react';

interface SettingsModalProps {
    onClose: () => void;
    premovesEnabled: boolean;
    setPremovesEnabled: (enabled: boolean) => void;
    moveConfirmationEnabled: boolean;
    setMoveConfirmationEnabled: (enabled: boolean) => void;
    drawConfirmationEnabled: boolean;
    setDrawConfirmationEnabled: (enabled: boolean) => void;
    resignConfirmationEnabled: boolean;
    setResignConfirmationEnabled: (enabled: boolean) => void;
    showPowerPieces: boolean;
    setShowPowerPieces: (enabled: boolean) => void;
    showPowerRings: boolean;
    setShowPowerRings: (enabled: boolean) => void;
    showOriginalType: boolean;
    setShowOriginalType: (enabled: boolean) => void;
    soundsEnabled: boolean;
    setSoundsEnabled: (enabled: boolean) => void;
}

const SettingsModal: React.FC<SettingsModalProps> = ({
    onClose,
    premovesEnabled,
    setPremovesEnabled,
    moveConfirmationEnabled,
    setMoveConfirmationEnabled,
    drawConfirmationEnabled,
    setDrawConfirmationEnabled,
    resignConfirmationEnabled,
    setResignConfirmationEnabled,
    showPowerPieces,
    setShowPowerPieces,
    showPowerRings,
    setShowPowerRings,
    showOriginalType,
    setShowOriginalType,
    soundsEnabled,
    setSoundsEnabled
}) => {
    return (
        <div className="fixed inset-0 bg-black bg-opacity-75 flex items-center justify-center z-50" onClick={onClose}>
            <div className="bg-gray-800 p-8 rounded-xl shadow-2xl w-full max-w-sm max-h-[90vh] overflow-y-auto relative custom-scrollbar" onClick={(e) => e.stopPropagation()}>
                <button onClick={onClose} className="absolute top-2 right-3 text-2xl text-gray-400 hover:text-white">&times;</button>
                <h3 className="text-2xl font-bold mb-6 text-center text-green-400">Settings</h3>

                <div className="space-y-6">
                    {/* Sound Toggle */}
                    <div className="flex items-center justify-between">
                        <div>
                            <p className="font-semibold text-white">Enable Sounds</p>
                            <p className="text-xs text-gray-400">Play sound effects for moves and events</p>
                        </div>
                        <label className="relative inline-flex items-center cursor-pointer">
                            <input
                                type="checkbox"
                                className="sr-only peer"
                                checked={soundsEnabled}
                                onChange={(e) => setSoundsEnabled(e.target.checked)}
                            />
                            <div className="w-11 h-6 bg-gray-600 peer-focus:outline-none peer-focus:ring-2 peer-focus:ring-blue-300 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-blue-600"></div>
                        </label>
                    </div>

                    {/* Premove Toggle */}
                    <div className="flex items-center justify-between">
                        <div>
                            <p className="font-semibold text-white">Enable Premoves</p>
                            <p className="text-xs text-gray-400">Make moves during opponent's turn</p>
                        </div>
                        <label className="relative inline-flex items-center cursor-pointer">
                            <input
                                type="checkbox"
                                className="sr-only peer"
                                checked={premovesEnabled}
                                onChange={(e) => setPremovesEnabled(e.target.checked)}
                            />
                            <div className="w-11 h-6 bg-gray-600 peer-focus:outline-none peer-focus:ring-2 peer-focus:ring-blue-300 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-blue-600"></div>
                        </label>
                    </div>

                    {/* Move Confirmation Toggle */}
                    <div className="flex items-center justify-between">
                        <div>
                            <p className="font-semibold text-white">Daily Move Confirmation</p>
                            <p className="text-xs text-gray-400">Ask before submitting in Daily games</p>
                        </div>
                        <label className="relative inline-flex items-center cursor-pointer">
                            <input
                                type="checkbox"
                                className="sr-only peer"
                                checked={moveConfirmationEnabled}
                                onChange={(e) => setMoveConfirmationEnabled(e.target.checked)}
                            />
                            <div className="w-11 h-6 bg-gray-600 peer-focus:outline-none peer-focus:ring-2 peer-focus:ring-blue-300 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-blue-600"></div>
                        </label>
                    </div>

                    {/* Draw Confirmation Toggle */}
                    <div className="flex items-center justify-between">
                        <div>
                            <p className="font-semibold text-white">Draw Confirmation</p>
                            <p className="text-xs text-gray-400">Confirm before offering draw</p>
                        </div>
                        <label className="relative inline-flex items-center cursor-pointer">
                            <input
                                type="checkbox"
                                className="sr-only peer"
                                checked={drawConfirmationEnabled}
                                onChange={(e) => setDrawConfirmationEnabled(e.target.checked)}
                            />
                            <div className="w-11 h-6 bg-gray-600 peer-focus:outline-none peer-focus:ring-2 peer-focus:ring-blue-300 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-blue-600"></div>
                        </label>
                    </div>

                    {/* Resign Confirmation Toggle */}
                    <div className="flex items-center justify-between">
                        <div>
                            <p className="font-semibold text-white">Resign Confirmation</p>
                            <p className="text-xs text-gray-400">Confirm before resigning</p>
                        </div>
                        <label className="relative inline-flex inline-flex items-center cursor-pointer">
                            <input
                                type="checkbox"
                                className="sr-only peer"
                                checked={resignConfirmationEnabled}
                                onChange={(e) => setResignConfirmationEnabled(e.target.checked)}
                            />
                            <div className="w-11 h-6 bg-gray-600 peer-focus:outline-none peer-focus:ring-2 peer-focus:ring-blue-300 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-blue-600"></div>
                        </label>
                    </div>

                    {/* Show Power Pieces Toggle */}
                    <div className="flex items-center justify-between">
                        <div>
                            <p className="font-semibold text-white">Show Power Icons</p>
                            <p className="text-xs text-gray-400">Display mini icons for powers</p>
                        </div>
                        <label className="relative inline-flex items-center cursor-pointer">
                            <input
                                type="checkbox"
                                className="sr-only peer"
                                checked={showPowerPieces}
                                onChange={(e) => setShowPowerPieces(e.target.checked)}
                            />
                            <div className="w-11 h-6 bg-gray-600 peer-focus:outline-none peer-focus:ring-2 peer-focus:ring-blue-300 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-blue-600"></div>
                        </label>
                    </div>

                    {/* Show Power Rings Toggle */}
                    <div className="flex items-center justify-between">
                        <div>
                            <p className="font-semibold text-white">Show Power Rings</p>
                            <p className="text-xs text-gray-400">Display colored rings around pieces</p>
                        </div>
                        <label className="relative inline-flex items-center cursor-pointer">
                            <input
                                type="checkbox"
                                className="sr-only peer"
                                checked={showPowerRings}
                                onChange={(e) => setShowPowerRings(e.target.checked)}
                            />
                            <div className="w-11 h-6 bg-gray-600 peer-focus:outline-none peer-focus:ring-2 peer-focus:ring-blue-300 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-blue-600"></div>
                        </label>
                    </div>

                    {/* Show Original Type Toggle */}
                    <div className="flex items-center justify-between">
                        <div>
                            <p className="font-semibold text-white">Show Original Type</p>
                            <p className="text-xs text-gray-400">Display icon if piece changed type</p>
                        </div>
                        <label className="relative inline-flex items-center cursor-pointer">
                            <input
                                type="checkbox"
                                className="sr-only peer"
                                checked={showOriginalType}
                                onChange={(e) => setShowOriginalType(e.target.checked)}
                            />
                            <div className="w-11 h-6 bg-gray-600 peer-focus:outline-none peer-focus:ring-2 peer-focus:ring-blue-300 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-blue-600"></div>
                        </label>
                    </div>
                </div>

                <button
                    onClick={onClose}
                    className="w-full mt-8 px-4 py-2 bg-gray-700 hover:bg-gray-600 rounded-lg font-semibold transition-colors"
                >
                    Close
                </button>
            </div>
        </div>
    );
};

export default SettingsModal;
