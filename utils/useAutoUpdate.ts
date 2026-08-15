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

  const triggerDownload = useCallback(() => {
    setDownloadTriggered(true);
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
  }, [downloadUrl]);

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
    openUpdateModal,
  };
}

