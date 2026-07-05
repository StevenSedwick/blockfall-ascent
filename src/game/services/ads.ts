// AdMob wrapper. All ad calls go through here so the rest of the game
// doesn't need to know about the plugin, native-vs-web, or ID juggling.
//
// On web / desktop dev this module is a full no-op: init() resolves but
// showInterstitial/showRewarded resolve to false without doing anything.
// That keeps `npm run dev` working without touching mobile plumbing.
//
// The current ad-unit IDs are Google's official TEST IDs. They are safe
// to ship a debug build with. Before uploading a release build to Play,
// replace them with your real unit IDs from https://admob.google.com and
// also swap the APPLICATION_ID meta-data in AndroidManifest.xml.
import { Capacitor } from '@capacitor/core';
import {
  AdMob,
  AdmobConsentStatus,
  InterstitialAdPluginEvents,
  RewardAdPluginEvents
} from '@capacitor-community/admob';

// Production interstitial unit IDs.
const INTERSTITIAL_ANDROID = 'ca-app-pub-9555759484764475/3137572875';
const INTERSTITIAL_IOS     = 'ca-app-pub-9555759484764475/2530690914';
const TEST_REWARDED_ANDROID     = 'ca-app-pub-3940256099942544/5224354917';
const TEST_REWARDED_IOS         = 'ca-app-pub-3940256099942544/1712485313';

const isNative = Capacitor.isNativePlatform();
const platform = Capacitor.getPlatform(); // 'ios' | 'android' | 'web'

const interstitialId = platform === 'ios' ? INTERSTITIAL_IOS : INTERSTITIAL_ANDROID;
const rewardedId     = platform === 'ios' ? TEST_REWARDED_IOS     : TEST_REWARDED_ANDROID;

let initialized = false;
let interstitialReady = false;
let rewardedReady = false;
let lastError = '';

export function getLastAdError(): string {
  return lastError;
}

async function ensureConsent(): Promise<void> {
  // GDPR/CCPA consent flow. Only meaningful in the EEA / California;
  // AdMob's UMP form handles both. Non-EU users get 'obtained' immediately.
  try {
    const info = await AdMob.requestConsentInfo();
    if (
      info.isConsentFormAvailable &&
      info.status === AdmobConsentStatus.REQUIRED
    ) {
      await AdMob.showConsentForm();
    }
  } catch {
    // Consent SDK unavailable -- fall back to non-personalized ads.
  }
}

export async function initAds(): Promise<void> {
  if (!isNative || initialized) return;
  try {
    await AdMob.initialize({
      testingDevices: [],
      initializeForTesting: false
    });
    await ensureConsent();
    initialized = true;
    prepareInterstitial();
    prepareRewarded();
  } catch (e) {
    console.warn('AdMob init failed:', e);
  }
}

function prepareInterstitial(): void {
  if (!isNative || !initialized) return;
  lastError = 'preparing...';
  AdMob.prepareInterstitial({ adId: interstitialId })
    .then(() => { interstitialReady = true; lastError = ''; })
    .catch((e: any) => {
      interstitialReady = false;
      lastError = `prepare: ${e?.message ?? String(e)}`;
    });
}

function prepareRewarded(): void {
  if (!isNative || !initialized) return;
  AdMob.prepareRewardVideoAd({ adId: rewardedId })
    .then(() => { rewardedReady = true; })
    .catch(() => { rewardedReady = false; });
}

// Auto-reload after each interstitial dismissal so the next request is
// instant. Rewarded listeners are wired per-call inside showRewarded().
if (isNative) {
  void AdMob.addListener(InterstitialAdPluginEvents.Dismissed, () => {
    interstitialReady = false;
    prepareInterstitial();
  });
}

/** Show an interstitial. Resolves to `true` if the SDK accepted the show
 *  call, `false` otherwise. Does NOT wait for dismissal — callers should
 *  proceed with their own state transition immediately. This is because
 *  some OEM WebViews (Kyocera flip Chromium fork) never fire the SDK's
 *  Dismissed event, and JS timers get throttled while the WebView is
 *  backgrounded by the ad Activity, so awaiting dismissal can hang the
 *  game indefinitely. Phaser auto-pauses while the WebView is hidden, so
 *  a fire-and-forget show works cleanly: the game restarts underneath,
 *  Phaser pauses, ad shows, ad closes, Phaser resumes. */
export async function showInterstitial(): Promise<boolean> {
  if (!isNative) { lastError = 'not native'; return false; }
  if (!initialized) { lastError = 'not initialized'; return false; }

  // If no ad is currently loaded, block on a fresh prepare so a stalled
  // reload after the previous show can't leave us stuck at "not ready"
  // forever.
  if (!interstitialReady) {
    try {
      await AdMob.prepareInterstitial({ adId: interstitialId });
      interstitialReady = true;
    } catch (e: any) {
      lastError = `prepare-on-demand: ${e?.message ?? String(e)}`;
      return false;
    }
  }

  try {
    await AdMob.showInterstitial();
    lastError = '';
    return true;
  } catch (e: any) {
    lastError = `show: ${e?.message ?? String(e)}`;
    interstitialReady = false;
    prepareInterstitial();
    return false;
  }
}

/**
 * Show a rewarded ad. Resolves with `true` if the user watched enough
 * of it to earn the reward, `false` if they skipped, closed early, or
 * no ad was available.
 */
export async function showRewarded(): Promise<boolean> {
  if (!isNative || !initialized || !rewardedReady) return false;
  return new Promise<boolean>((resolve) => {
    let earned = false;
    const rewardHandle = AdMob.addListener(
      RewardAdPluginEvents.Rewarded,
      () => { earned = true; }
    );
    const dismissedHandle = AdMob.addListener(
      RewardAdPluginEvents.Dismissed,
      () => {
        void rewardHandle.then((h) => h.remove());
        void dismissedHandle.then((h) => h.remove());
        resolve(earned);
      }
    );
    AdMob.showRewardVideoAd().catch(() => {
      void rewardHandle.then((h) => h.remove());
      void dismissedHandle.then((h) => h.remove());
      resolve(false);
    });
  });
}

export function isRewardedReady(): boolean {
  return isNative && rewardedReady;
}

export function isInterstitialReady(): boolean {
  return isNative && initialized && interstitialReady;
}

export function isNativePlatform(): boolean {
  return isNative;
}
