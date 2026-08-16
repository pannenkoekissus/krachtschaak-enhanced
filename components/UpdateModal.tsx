import React from 'react';
import { GitHubReleaseInfo } from '../utils/useAutoUpdate';

interface UpdateModalProps {
  release: GitHubReleaseInfo | null;
  downloadUrl: string;
  currentTag?: string;
  onDownload: () => void;
  onDismiss: () => void;
  downloadTriggered: boolean;
  isDownloading?: boolean;
  downloadProgress?: number;
}

const UpdateModal: React.FC<UpdateModalProps> = ({
  release,
  currentTag,
  onDownload,
  onDismiss,
  downloadTriggered,
  isDownloading = false,
  downloadProgress = 0,
}) => {
  const publishedDateStr = release?.published_at
    ? new Date(release.published_at).toLocaleString('en-US', {
        dateStyle: 'medium',
        timeStyle: 'short',
      })
    : '';

  return (
    <div
      className="fixed inset-0 bg-black/80 backdrop-blur-md flex items-center justify-center z-[250] p-4 scale-in-center overflow-hidden animate-fadeIn"
      onClick={onDismiss}
    >
      <div
        className="bg-gradient-to-b from-gray-800 via-gray-900 to-gray-950 border border-green-500/40 rounded-3xl shadow-[0_0_50px_rgba(34,197,94,0.2)] w-full max-w-md p-6 relative flex flex-col gap-5 ring-1 ring-white/10"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Close Button */}
        <button
          onClick={onDismiss}
          className="absolute top-4 right-4 text-gray-400 hover:text-white bg-gray-800/80 hover:bg-gray-700 p-2 rounded-full transition-all"
          title="Close"
        >
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>

        {/* Header Icon & Title */}
        <div className="flex flex-col items-center text-center gap-2 pt-2">
          <div className="w-16 h-16 rounded-2xl bg-gradient-to-tr from-green-600 to-emerald-400 flex items-center justify-center shadow-lg shadow-green-500/30 text-3xl animate-bounce">
            🚀
          </div>
          <h3 className="text-2xl font-black text-transparent bg-clip-text bg-gradient-to-r from-green-400 via-emerald-300 to-teal-200">
            New Version Available!
          </h3>
          <p className="text-xs text-gray-400 font-medium">
            A new version of Krachtschaak is ready for update.
          </p>
        </div>

        {/* Release Details */}
        <div className="bg-gray-800/60 rounded-2xl border border-white/5 p-4 flex flex-col gap-2.5">
          {currentTag && (
            <div className="flex items-center justify-between text-xs">
              <span className="font-bold uppercase tracking-wider text-gray-400">Current Version</span>
              <span className="font-mono text-gray-400 bg-gray-900/80 px-2 py-0.5 rounded border border-gray-700">
                {currentTag}
              </span>
            </div>
          )}

          <div className="flex items-center justify-between text-xs">
            <span className="font-bold uppercase tracking-wider text-gray-400">New Release Tag</span>
            <span className="font-mono font-bold bg-green-950/80 border border-green-800/60 text-green-300 px-2.5 py-1 rounded-full">
              {release?.tag_name || 'Latest Release'}
            </span>
          </div>

          {publishedDateStr && (
            <div className="flex items-center justify-between text-xs text-gray-400">
              <span>Released on</span>
              <span className="font-semibold text-gray-300">{publishedDateStr}</span>
            </div>
          )}

          {release?.body && (
            <div className="mt-1 pt-2 border-t border-gray-700/50">
              <p className="text-xs font-bold text-gray-300 mb-1">Release notes:</p>
              <div className="text-xs text-gray-400 max-h-24 overflow-y-auto whitespace-pre-wrap leading-relaxed pr-1 custom-scrollbar">
                {release.body}
              </div>
            </div>
          )}
        </div>

        {/* Guidance Notice / Download Progress */}
        {isDownloading ? (
          <div className="bg-emerald-950/60 border border-emerald-500/40 rounded-2xl p-4 flex flex-col gap-3 animate-fadeIn">
            <div className="flex items-center gap-3">
              <svg className="animate-spin h-5 w-5 text-emerald-400 shrink-0" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
              </svg>
              <div className="flex flex-col gap-0.5 flex-1">
                <p className="font-bold text-emerald-300 text-xs">Downloading update...</p>
                <p className="text-emerald-200/70 text-[10px]">{downloadProgress}% complete</p>
              </div>
            </div>
            <div className="w-full bg-gray-800 rounded-full h-2.5 overflow-hidden">
              <div
                className="bg-gradient-to-r from-green-500 to-emerald-400 h-full rounded-full transition-all duration-300 ease-out"
                style={{ width: `${downloadProgress}%` }}
              />
            </div>
          </div>
        ) : downloadTriggered ? (
          <div className="bg-emerald-950/60 border border-emerald-500/40 rounded-2xl p-4 flex gap-3 items-start animate-fadeIn">
            <span className="text-xl">📥</span>
            <div className="flex flex-col gap-1 text-xs">
              <p className="font-bold text-emerald-300">Download started!</p>
              <p className="text-emerald-200/90 leading-relaxed">
                Open the downloaded <code className="bg-black/40 px-1 py-0.5 rounded text-emerald-300 font-mono">krachtschaak.apk</code> file from your downloads or notification area to install the update.
              </p>
            </div>
          </div>
        ) : (
          <p className="text-xs text-gray-400 text-center leading-relaxed px-2">
            Tap <strong className="text-gray-200">Download & Update</strong> to fetch the latest APK and install it directly.
          </p>
        )}

        {/* Action Buttons */}
        <div className="flex flex-col gap-2.5 pt-1">
          <button
            onClick={onDownload}
            disabled={isDownloading}
            className="w-full py-3.5 px-4 bg-gradient-to-r from-green-600 via-emerald-600 to-teal-600 hover:from-green-500 hover:via-emerald-500 hover:to-teal-500 text-white rounded-2xl font-black text-base transition-all active:scale-98 shadow-lg shadow-green-600/30 flex items-center justify-center gap-2 group disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <span>🚀</span>
            <span className="tracking-wide">DOWNLOAD & UPDATE</span>
          </button>

          {release?.html_url && (
            <a
              href={release.html_url}
              target="_blank"
              rel="noopener noreferrer"
              className="text-center text-xs text-blue-400 hover:text-blue-300 underline font-medium"
            >
              View full release details on GitHub
            </a>
          )}

          <button
            onClick={onDismiss}
            className="w-full py-2.5 px-4 bg-gray-800/80 hover:bg-gray-700 text-gray-400 hover:text-gray-200 rounded-xl font-bold text-xs transition-colors text-center"
          >
            {downloadTriggered ? 'Close' : 'Remind me later'}
          </button>
        </div>
      </div>
    </div>
  );
};

export default UpdateModal;

