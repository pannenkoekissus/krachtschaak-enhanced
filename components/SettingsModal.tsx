
import React from 'react';
import { AutoSetting } from '../types';

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
    autoQueen: AutoSetting;
    setAutoQueen: (val: AutoSetting) => void;
    autoEnPassant: AutoSetting;
    setAutoEnPassant: (val: AutoSetting) => void;
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
    setSoundsEnabled,
    autoQueen,
    setAutoQueen,
    autoEnPassant,
    setAutoEnPassant
}) => {
    const renderToggle = (label: string, description: string, value: boolean, onChange: (val: boolean) => void) => (
        <div className="flex items-center justify-between py-3 group hover:bg-gray-700/30 px-4 rounded-xl transition-all">
            <div className="flex flex-col gap-1">
                <p className="font-bold text-gray-100 group-hover:text-green-400 transition-colors uppercase text-sm tracking-wide">{label}</p>
                <p className="text-xs text-gray-400 leading-relaxed max-w-[200px]">{description}</p>
            </div>
            <label className="relative inline-flex items-center cursor-pointer">
                <input
                    type="checkbox"
                    className="sr-only peer"
                    checked={value}
                    onChange={(e) => onChange(e.target.checked)}
                />
                <div className="w-12 h-6 bg-gray-600 peer-focus:outline-none peer-focus:ring-2 peer-focus:ring-green-500/50 rounded-full peer peer-checked:after:translate-x-6 peer-checked:after:border-white after:content-[''] after:absolute after:top-[4px] after:left-[4px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-gradient-to-r peer-checked:from-green-600 peer-checked:to-green-400 shadow-inner"></div>
            </label>
        </div>
    );

    const renderTriStateSetting = (label: string, description: string, value: AutoSetting, onChange: (val: AutoSetting) => void) => (
        <div className="flex flex-col gap-3 py-3 px-4 rounded-xl hover:bg-gray-700/30 transition-all border border-transparent hover:border-gray-600/50">
            <div className="flex flex-col gap-1">
                <p className="font-bold text-gray-100 uppercase text-sm tracking-wide hover:text-green-400 transition-colors">{label}</p>
                <p className="text-xs text-gray-400 leading-relaxed">{description}</p>
            </div>
            <div className="flex p-1 bg-gray-900/50 rounded-lg border border-gray-700">
                {[
                    { val: AutoSetting.Never, label: 'Never' },
                    { val: AutoSetting.Realtime, label: 'Realtime' },
                    { val: AutoSetting.Always, label: 'Always' }
                ].map((option) => (
                    <button
                        key={option.val}
                        onClick={() => onChange(option.val)}
                        className={`flex-1 py-1.5 px-2 rounded-md text-xs font-bold transition-all ${
                            value === option.val
                                ? 'bg-gradient-to-r from-blue-600 to-indigo-600 text-white shadow-lg scale-100'
                                : 'text-gray-500 hover:text-gray-300'
                        }`}
                    >
                        {option.label}
                    </button>
                ))}
            </div>
        </div>
    );

    const SectionHeader = ({ title, icon }: { title: string, icon: string }) => (
        <div className="flex items-center gap-2 mb-4 px-4">
            <span className="text-xl">{icon}</span>
            <h4 className="text-xs font-black uppercase tracking-[0.2em] text-gray-500">{title}</h4>
            <div className="flex-grow h-[1px] bg-gradient-to-r from-gray-700 to-transparent ml-2"></div>
        </div>
    );

    return (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center z-[200] p-4 scale-in-center overflow-hidden" onClick={onClose}>
            <div 
                className="bg-gray-800 border border-gray-700 rounded-3xl shadow-[0_0_50px_rgba(0,0,0,0.5)] w-full max-w-md max-h-[85vh] overflow-y-auto relative custom-scrollbar flex flex-col ring-1 ring-white/10"
                onClick={(e) => e.stopPropagation()}
                style={{
                    scrollbarWidth: 'thin',
                    scrollbarColor: '#4b5563 transparent'
                }}
            >
                <div className="flex flex-col items-center gap-2 sticky top-0 bg-gray-800 z-20 pt-8 pb-4 px-8 border-b border-gray-700/50">
                    <h3 className="text-4xl font-black text-transparent bg-clip-text bg-gradient-to-r from-green-400 via-blue-500 to-purple-600 filter drop-shadow-sm">Settings</h3>
                    <div className="w-12 h-1.5 bg-gradient-to-r from-green-500 to-blue-600 rounded-full"></div>
                </div>

                <div className="flex flex-col gap-6 p-8">
                    <section>
                        <SectionHeader title="Gameplay" icon="♟️" />
                        <div className="bg-gray-900/40 rounded-2xl border border-white/5 py-2">
                            {renderToggle('Enable Sounds', 'Sound effects for moves and events', soundsEnabled, setSoundsEnabled)}
                            {renderToggle('Enable Premoves', 'Make moves during opponent\'s turn', premovesEnabled, setPremovesEnabled)}
                        </div>
                    </section>

                    <section>
                        <SectionHeader title="Automations" icon="🤖" />
                        <div className="bg-gray-900/40 rounded-2xl border border-white/5 py-4 flex flex-col gap-2">
                            {renderTriStateSetting('Auto Queen', 'Promote to Queen automatically', autoQueen, setAutoQueen)}
                            {renderTriStateSetting('Auto En Passant', 'Take En Passant automatically when optional', autoEnPassant, setAutoEnPassant)}
                        </div>
                    </section>

                    <section>
                        <SectionHeader title="Visuals" icon="👁️" />
                        <div className="bg-gray-900/40 rounded-2xl border border-white/5 py-2">
                            {renderToggle('Show Power Icons', 'Display mini icons for powers', showPowerPieces, setShowPowerPieces)}
                            {renderToggle('Show Power Rings', 'Colored rings around pieces', showPowerRings, setShowPowerRings)}
                            {renderToggle('Show Original Status', 'Display icon if piece changed type', showOriginalType, setShowOriginalType)}
                        </div>
                    </section>

                    <section>
                        <SectionHeader title="Confirmations" icon="🛡️" />
                        <div className="bg-gray-900/40 rounded-2xl border border-white/5 py-2">
                            {renderToggle('Daily Confirmation', 'Ask before submitting in Daily games', moveConfirmationEnabled, setMoveConfirmationEnabled)}
                            {renderToggle('Draw Offer', 'Confirm before offering draw', drawConfirmationEnabled, setDrawConfirmationEnabled)}
                            {renderToggle('Resignation', 'Confirm before resigning', resignConfirmationEnabled, setResignConfirmationEnabled)}
                        </div>
                    </section>
                </div>

                <div className="px-8 pb-8">
                    <button
                        onClick={onClose}
                        className="w-full mt-4 py-4 bg-gradient-to-r from-green-600 to-blue-600 hover:from-green-500 hover:to-blue-500 text-white rounded-2xl font-black text-lg transition-all active:scale-95 shadow-xl hover:shadow-green-500/20 group"
                    >
                        <span className="group-hover:tracking-widest transition-all">SAVE & CLOSE</span>
                    </button>
                </div>
            </div>
        </div>
    );
};

export default SettingsModal;
