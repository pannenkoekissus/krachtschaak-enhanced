import { useState, useEffect, useCallback } from 'react';

export interface GitHubReleaseAsset {
  name: string;
  browser_download_url: string;
  updated_at: string;
}

export interface GitHubReleaseInfo {
  tag_name: string;
  name: string;
  published_at: string;
  body?: string;
  html_url: string;
  assets: GitHubReleaseAsset[];
}

export type ManualCheckStatus = 'idle' | 'checking' | 'latest' | 'available' | 'error';

export interface AutoUpdateState {
  isChecking: boolean;
  updateAvailable: boolean;
  latestRelease: GitHubReleaseInfo | null;
  downloadUrl: string;
  currentBuildTime: string;
  currentTag: string;
  error: string | null;
  isNative: boolean;
  manualCheckStatus: ManualCheckStatus;
  checkForUpdates: (manual?: boolean) => Promise<boolean>;
  dismissUpdate: () => void;
  triggerDownload: () => void;
  downloadTriggered: boolean;
  isDownloading: boolean;
  downloadProgress: number;
  openUpdateModal: () => void;
}

/**
 * Parses build time from ISO string or tag format (vYYYY.MM.DD-HHMMSS).
 */
export function parseBuildTimestamp(input: string): number {
  if (!input) return 0;
  // Check tag format: v2026.08.14-092800 or 2026.08.14-092800
  const tagMatch = input.match(/^v?(\d{4})\.(\d{2})\.(\d{2})-(\d{2})(\d{2})(\d{2})$/);
  if (tagMatch) {
    const [, year, month, day, hour, minute, second] = tagMatch;
    return Date.UTC(
      parseInt(year, 10),
      parseInt(month, 10) - 1,
      parseInt(day, 10),
      parseInt(hour, 10),
      parseInt(minute, 10),
      parseInt(second, 10)
    );
  }
  const parsed = Date.parse(input);
  return isNaN(parsed) ? 0 : parsed;
}

/**
 * Converts a Blob to a base64 string (without the data URL prefix).
 */
function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => {
      const result = reader.result as string;
      // Strip the "data:...;base64," prefix
      const base64 = result.split(',')[1];
      resolve(base64);
    };
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}

const DEFAULT_APK_DOWNLOAD_URL =
  'https://github.com/pannenkoekissus/krachtschaak-enhanced/releases/latest/download/krachtschaak.apk';

const DISMISSED_UPDATE_KEY = 'krachtschaak_dismissed_update_tag';

export function useAutoUpdate(): AutoUpdateState {
  const [isChecking, setIsChecking] = useState(false);
  const [updateAvailable, setUpdateAvailable] = useState(false);
  const [latestRelease, setLatestRelease] = useState<GitHubReleaseInfo | null>(null);
  const [downloadUrl, setDownloadUrl] = useState(DEFAULT_APK_DOWNLOAD_URL);
  const [error, setError] = useState<string | null>(null);
  const [downloadTriggered, setDownloadTriggered] = useState(false);
  const [isDownloading, setIsDownloading] = useState(false);
  const [downloadProgress, setDownloadProgress] = useState(0);
  const [manualCheckStatus, setManualCheckStatus] = useState<ManualCheckStatus>('idle');

  const isNative = typeof window !== 'undefined' && Boolean((window as any).Capacitor?.isNativePlatform?.());

  const currentBuildTime = typeof __APP_BUILD_TIME__ !== 'undefined' ? __APP_BUILD_TIME__ : '';
  const currentTag = typeof __RELEASE_TAG__ !== 'undefined' ? __RELEASE_TAG__ : '';

  const checkForUpdates = useCallback(
    async (manual: boolean = false): Promise<boolean> => {
      setIsChecking(true);
      setError(null);
      if (manual) {
        setManualCheckStatus('checking');
      }
      try {
        const response = await fetch(
          'https://api.github.com/repos/pannenkoekissus/krachtschaak-enhanced/releases/latest',
          {
            headers: {
              Accept: 'application/vnd.github.v3+json',
            },
          }
        );

        if (!response.ok) {
          throw new Error(`GitHub API HTTP ${response.status}`);
        }

        const releaseData: GitHubReleaseInfo = await response.json();
        setLatestRelease(releaseData);

        // Determine download URL for APK
        const apkAsset = releaseData.assets?.find(
          (a) => a.name.toLowerCase().endsWith('.apk') || a.name.toLowerCase().includes('krachtschaak')
        );
        const resolvedDownloadUrl = apkAsset?.browser_download_url || DEFAULT_APK_DOWNLOAD_URL;
        setDownloadUrl(resolvedDownloadUrl);

        // Compare release time with current app build timestamp
        const releaseTimestamp = new Date(releaseData.published_at).getTime();
        const apkAssetTimestamp = apkAsset?.updated_at ? new Date(apkAsset.updated_at).getTime() : releaseTimestamp;
        const appBuildTimestamp = parseBuildTimestamp(currentBuildTime);

        // If manual check, ignore dismissed storage
        const dismissedTag = sessionStorage.getItem(DISMISSED_UPDATE_KEY);
        const isDismissed = !manual && dismissedTag === releaseData.tag_name;

        let hasNewerVersion = false;

        if (appBuildTimestamp > 0 && (releaseTimestamp > 0 || apkAssetTimestamp > 0)) {
          const checkTime = apkAssetTimestamp > 0 ? apkAssetTimestamp : releaseTimestamp;
          // Release/APK is newer if published at least 3 minutes after app build time
          // OR if release tag is different and build timestamp is older
          const MIN_TIME_DIFF_MS = 3 * 60 * 1000;
          if (checkTime > appBuildTimestamp + MIN_TIME_DIFF_MS) {
            hasNewerVersion = true;
          } else if (currentTag && releaseData.tag_name && currentTag !== releaseData.tag_name) {
            // Tag differs and release is not significantly older than app build time
            if (checkTime >= appBuildTimestamp - (10 * 60 * 1000)) {
              hasNewerVersion = true;
            }
          }
        } else if (releaseData.tag_name && releaseData.tag_name !== currentTag) {
          hasNewerVersion = true;
        }

        const showUpdatePrompt = hasNewerVersion && !isDismissed;
        setUpdateAvailable(showUpdatePrompt);
        if (manual) {
          setManualCheckStatus(hasNewerVersion ? 'available' : 'latest');
        } else if (hasNewerVersion) {
          setManualCheckStatus('available');
        }
        return hasNewerVersion;
      } catch (err: any) {
        console.warn('Auto-update check failed:', err);
        const errorMsg = err.message || 'Failed to check for updates';
        setError(errorMsg);
        if (manual) {
          setManualCheckStatus('error');
        }
        return false;
      } finally {
        setIsChecking(false);
      }
    },
    [currentBuildTime, currentTag]
  );

  const dismissUpdate = useCallback(() => {
    if (latestRelease?.tag_name) {
      sessionStorage.setItem(DISMISSED_UPDATE_KEY, latestRelease.tag_name);
    }
    setUpdateAvailable(false);
  }, [latestRelease]);

  const openUpdateModal = useCallback(() => {
    setUpdateAvailable(true);
  }, []);

  const triggerDownload = useCallback(async () => {
    setDownloadTriggered(true);

    if (isNative) {
      // Native: download APK to cache directory, then open with system installer
      try {
        setIsDownloading(true);
        setDownloadProgress(0);
        setError(null);

        const capFs = await import('@capacitor/filesystem').catch(() => null);
        const capFo = await import('@capacitor-community/file-opener').catch(() => null);

        if (!capFs || !capFo) {
          throw new Error('Native plugins not available');
        }

        const { Filesystem, Directory } = capFs;
        const { FileOpener } = capFo;

        // Download APK with progress tracking via fetch + ReadableStream
        const response = await fetch(downloadUrl);
        if (!response.ok) throw new Error(`Download failed: HTTP ${response.status}`);

        const contentLength = response.headers.get('content-length');
        const total = contentLength ? parseInt(contentLength, 10) : 0;
        const reader = response.body?.getReader();

        if (!reader) throw new Error('Download stream unavailable');

        const chunks: Uint8Array[] = [];
        let received = 0;

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          chunks.push(value);
          received += value.length;
          if (total > 0) {
            setDownloadProgress(Math.round((received / total) * 100));
          }
        }

        // Combine chunks into a single Blob and convert to base64
        const blob = new Blob(chunks, { type: 'application/vnd.android.package-archive' });
        const base64Data = await blobToBase64(blob);

        const fileName = 'krachtschaak-update.apk';

        // Write the APK to the app's cache directory
        await Filesystem.writeFile({
          path: fileName,
          data: base64Data,
          directory: Directory.Cache,
        });

        // Resolve the native file URI for the file opener
        const fileInfo = await Filesystem.getUri({
          path: fileName,
          directory: Directory.Cache,
        });

        setDownloadProgress(100);

        // Launch the system package installer
        await FileOpener.open({
          filePath: fileInfo.uri,
          contentType: 'application/vnd.android.package-archive',
          openWithDefault: true,
        });
      } catch (err: any) {
        console.error('Native APK download/install failed:', err);
        setError(err.message || 'Failed to download update');
        // Fallback: open URL in system browser
        try {
          window.open(downloadUrl, '_system');
        } catch {
          window.location.href = downloadUrl;
        }
      } finally {
        setIsDownloading(false);
      }
    } else {
      // Web fallback: trigger browser download
      if (typeof window !== 'undefined') {
        try {
          const a = document.createElement('a');
          a.href = downloadUrl;
          a.target = '_blank';
          a.rel = 'noopener noreferrer';
          a.download = 'krachtschaak.apk';
          document.body.appendChild(a);
          a.click();
          document.body.removeChild(a);
        } catch {
          window.open(downloadUrl, '_system') || (window.location.href = downloadUrl);
        }
      }
    }
  }, [downloadUrl, isNative]);

  // Initial check on mount (only for native app)
  useEffect(() => {
    if (isNative) {
      checkForUpdates(false);
    }
  }, [checkForUpdates, isNative]);

  return {
    isChecking,
    updateAvailable,
    latestRelease,
    downloadUrl,
    currentBuildTime,
    currentTag,
    error,
    isNative,
    manualCheckStatus,
    checkForUpdates,
    dismissUpdate,
    triggerDownload,
    downloadTriggered,
    isDownloading,
    downloadProgress,
    openUpdateModal,
  };
}
