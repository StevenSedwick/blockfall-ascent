import Phaser from 'phaser';
import type { RunStats } from '../config/types';
import type { GameMode } from './GameScene';
import { showInterstitial } from '../services/ads';

type FinalStats = RunStats & { coins?: number; coinScore?: number; mode?: GameMode };

// Separate best-height slot per mode so Ascent and Stack don't overwrite
// each other's records.
const BEST_KEYS: Record<GameMode, string> = {
  ascent: 'blockfall.bestHeight',
  stack: 'blockfall.bestHeight.stack'
};

// Ad frequency policy.
//
// - No ad if the player died in under MIN_SURVIVAL_SECONDS (short-run
//   deaths are frustrating enough without ads on top).
// - Otherwise show an ad on every DEATHS_PER_AD-th eligible death, but
//   only if AD_COOLDOWN_MS has passed since the last one.
// - Hard cap MAX_ADS_PER_SESSION per app-launch to avoid ever spamming a
//   long play session with ads.
const MIN_SURVIVAL_SECONDS = 75;
const DEATHS_PER_AD = 4;
const AD_COOLDOWN_MS = 5 * 60 * 1000;
const MAX_ADS_PER_SESSION = 4;
const ELIGIBLE_DEATHS_KEY = 'blockfall.eligibleDeaths';

// Session state: in-memory only, resets on app launch.
let sessionAdsShown = 0;
let lastAdAtMs = 0;

export class GameOverScene extends Phaser.Scene {
  private stats!: FinalStats;
  private mode: GameMode = 'ascent';
  private armed = false;
  private fired = false;

  constructor() {
    super('GameOver');
  }

  init(data: FinalStats): void {
    this.stats = data ?? { maxHeightPx: 0, survivalSeconds: 0, score: 0 };
    this.mode = data?.mode === 'stack' ? 'stack' : 'ascent';
    this.armed = false;
    this.fired = false;
  }

  create(): void {
    const { width, height } = this.scale.gameSize;
    const cx = width / 2;
    const cy = height / 2;

    const height_ = Math.floor(this.stats.maxHeightPx);
    const prevBest = this.loadBest();
    const isNewBest = height_ > prevBest;
    if (isNewBest) this.saveBest(height_);
    const best = Math.max(prevBest, height_);

    this.add.rectangle(0, 0, width, height, 0x000000, 0.55).setOrigin(0);

    // Mode label in the top-right corner so the player knows which score
    // slot they're competing against.
    this.add
      .text(width - 16, 16, this.mode === 'stack' ? 'STACK' : 'ASCENT', {
        fontFamily: 'system-ui, -apple-system, sans-serif',
        fontSize: '14px',
        color: '#808080',
        fontStyle: 'bold'
      })
      .setOrigin(1, 0);

    // Hero number: height climbed. This is THE score.
    this.add
      .text(cx, cy - 60, String(height_), {
        fontFamily: 'system-ui, -apple-system, sans-serif',
        fontSize: '120px',
        color: '#ffffff',
        fontStyle: 'bold'
      })
      .setOrigin(0.5);
    this.add
      .text(cx, cy + 20, 'HEIGHT', {
        fontFamily: 'system-ui, -apple-system, sans-serif',
        fontSize: '18px',
        color: '#a0a0a0',
        fontStyle: 'bold'
      })
      .setOrigin(0.5);

    if (isNewBest) {
      const bang = this.add
        .text(cx, cy - 150, 'NEW BEST!', {
          fontFamily: 'system-ui, -apple-system, sans-serif',
          fontSize: '32px',
          color: '#ffd24a',
          fontStyle: 'bold'
        })
        .setOrigin(0.5);
      this.tweens.add({
        targets: bang,
        scale: { from: 0.6, to: 1 },
        alpha: { from: 0, to: 1 },
        duration: 240,
        ease: 'Back.Out'
      });
    } else {
      this.add
        .text(cx, cy - 150, `BEST ${best}`, {
          fontFamily: 'system-ui, -apple-system, sans-serif',
          fontSize: '22px',
          color: '#a0a0a0'
        })
        .setOrigin(0.5);
    }

    // Small stat line below the hero number.
    const coins = this.stats.coins ?? 0;
    this.add
      .text(cx, cy + 70, `${this.stats.survivalSeconds.toFixed(1)}s   ${coins} coins`, {
        fontFamily: 'system-ui, -apple-system, sans-serif',
        fontSize: '18px',
        color: '#808080'
      })
      .setOrigin(0.5);

    const hint = this.add
      .text(cx, cy + 140, 'TAP TO RETRY', {
        fontFamily: 'system-ui, -apple-system, sans-serif',
        fontSize: '22px',
        color: '#6cf0ff',
        fontStyle: 'bold'
      })
      .setOrigin(0.5);
    this.tweens.add({
      targets: hint,
      alpha: { from: 0.4, to: 1 },
      duration: 700,
      yoyo: true,
      repeat: -1
    });

    // Any tap or key restarts. Brief input lockout so the same tap that
    // killed you doesn't also skip the death screen.
    //
    // We attach DOM-level listeners in addition to Phaser's input system
    // because on some OEM WebViews (Kyocera flip Chromium fork) Phaser's
    // input can be dead after the ad Activity backgrounds/foregrounds the
    // WebView, leaving TAP TO RETRY unresponsive. DOM listeners survive.
    const mode = this.mode;
    const restart = () => {
      if (!this.armed || this.fired) return;
      this.fired = true;
      this.scene.start('Game', { mode });
    };
    const menu = () => {
      if (!this.armed || this.fired) return;
      this.fired = true;
      this.scene.start('Menu');
    };
    const domTap = () => restart();
    const domKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' || e.key.toLowerCase() === 'm') menu();
      else restart();
    };
    this.time.delayedCall(180, () => {
      this.armed = true;
      this.input.once('pointerdown', restart);
      this.input.keyboard?.once('keydown', (e: KeyboardEvent) => {
        if (e.key === 'Escape' || e.key.toLowerCase() === 'm') menu();
        else restart();
      });
      window.addEventListener('touchstart', domTap, { passive: true });
      window.addEventListener('mousedown', domTap);
      window.addEventListener('keydown', domKey);
    });

    // Auto-restart when the WebView returns to the foreground after the
    // ad Activity closes. On Kyocera's OEM Chromium fork the WebView can
    // come back with input dead and the user has no way to advance. The
    // visibilitychange event still fires reliably, so use it as an
    // unconditional way to get back into the game.
    let sawHidden = false;
    const onVis = () => {
      if (document.visibilityState === 'hidden') { sawHidden = true; return; }
      if (sawHidden && this.armed && !this.fired) {
        this.time.delayedCall(250, () => { if (!this.fired) restart(); });
      }
    };
    document.addEventListener('visibilitychange', onVis);

    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      window.removeEventListener('touchstart', domTap);
      window.removeEventListener('mousedown', domTap);
      window.removeEventListener('keydown', domKey);
      document.removeEventListener('visibilitychange', onVis);
      this.scale.off('resize', onResize);
    });

    // Rebuild layout on orientation change - all positions are computed
    // from width/height in create() and don't self-update.
    const onResize = () => this.scene.restart({ ...this.stats, mode: this.mode });
    this.scale.on('resize', onResize);

    // Fire the interstitial as soon as the game-over screen appears (every
    // Nth death). The ad Activity takes over the whole screen; when the
    // user closes it, they're back at this game-over screen with the
    // TAP TO RETRY prompt still visible. Tapping it works normally — no
    // async coordination with the ad SDK required.
    this.time.delayedCall(400, () => this.maybeShowAd(restart));
  }

  private maybeShowAd(restart: () => void): void {
    // Free pass for quick deaths -- no ad if the run was too short.
    if ((this.stats.survivalSeconds ?? 0) < MIN_SURVIVAL_SECONDS) return;

    let eligible = 0;
    try {
      eligible = parseInt(window.localStorage.getItem(ELIGIBLE_DEATHS_KEY) ?? '0', 10) || 0;
    } catch { /* ignore */ }
    eligible += 1;
    try { window.localStorage.setItem(ELIGIBLE_DEATHS_KEY, String(eligible)); } catch { /* ignore */ }

    // Cadence gate: only every Nth eligible death.
    if (eligible % DEATHS_PER_AD !== 0) return;
    // Session cap.
    if (sessionAdsShown >= MAX_ADS_PER_SESSION) return;
    // Cooldown since last forced ad.
    const now = Date.now();
    if (lastAdAtMs > 0 && now - lastAdAtMs < AD_COOLDOWN_MS) return;

    lastAdAtMs = now;
    sessionAdsShown += 1;

    showInterstitial().then((shown) => {
      if (!shown) {
        // Ad failed to show -- refund the session slot and cooldown so
        // the player isn't silently penalized for our SDK misfire.
        sessionAdsShown = Math.max(0, sessionAdsShown - 1);
        lastAdAtMs = 0;
        return;
      }
      // On some OEM WebViews (Kyocera flip Chromium fork) touch input
      // dies after the ad Activity closes even though JS keeps running.
      // Restart immediately in the promise resolution, then belt-and-
      // suspenders with a Phaser timer, a raw setTimeout, and finally a
      // hard page reload so the user is never stranded.
      try { restart(); } catch { /* ignore */ }
      this.time.delayedCall(500, () => { if (!this.fired) restart(); });
      setTimeout(() => { if (!this.fired) restart(); }, 500);
      setTimeout(() => {
        if (!this.fired) {
          try { window.location.reload(); } catch { /* ignore */ }
        }
      }, 2500);
    });
  }

  private loadBest(): number {
    try {
      const v = window.localStorage.getItem(BEST_KEYS[this.mode]);
      return v ? parseInt(v, 10) || 0 : 0;
    } catch {
      return 0;
    }
  }

  private saveBest(v: number): void {
    try {
      window.localStorage.setItem(BEST_KEYS[this.mode], String(v));
    } catch {
      // localStorage unavailable (private mode, etc.) -- just skip.
    }
  }
}
