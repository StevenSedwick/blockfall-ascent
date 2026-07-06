import Phaser from 'phaser';
import type { GameMode } from './GameScene';

// Some devices (e.g. flip-phone WebViews at 240x320) can't fit two stacked
// mode buttons plus a title without overlap. On those screens we show only
// Ascent. Real phones (>=360x480) get the normal two-mode menu.
function isTinyScreen(w: number, h: number): boolean {
  return w < 360 || h < 480;
}

// Mode-select screen shown once at boot. Two big touch-friendly buttons -
// Ascent (the original corridor climb) and Stack (jump between falling
// pieces). Selection kicks straight into the game scene with the mode
// baked into the init payload. Also lists each mode's best height so
// players know which scoreboard they're chasing.
const BEST_KEYS: Record<GameMode, string> = {
  ascent: 'blockfall.bestHeight',
  stack: 'blockfall.bestHeight.stack'
};

export class MenuScene extends Phaser.Scene {
  constructor() {
    super('Menu');
  }

  create(): void {
    const { width, height } = this.scale.gameSize;
    const cx = width / 2;
    const cy = height / 2;
    const showStack = !isTinyScreen(width, height);

    this.cameras.main.setBackgroundColor(0x05071a);

    // Title.
    this.add
      .text(cx, Math.max(60, cy - 200), 'BLOCKFALL\nASCENT', {
        fontFamily: 'system-ui, -apple-system, sans-serif',
        fontSize: '48px',
        color: '#ffffff',
        fontStyle: 'bold',
        align: 'center',
        lineSpacing: -6
      })
      .setOrigin(0.5);

    const buttonW = Math.min(280, Math.floor(width * 0.8));
    const buttonH = 96;

    if (!showStack) {
      // Ascent-only layout: single centered button.
      this.makeModeButton('ASCENT', 'Climb the winding corridor', cx, cy, buttonW, buttonH, 0x2a6fb0, 'ascent');
    } else {
      // Two mode buttons, stacked vertically on portrait screens, side-by-
      // side on wide ones. Compute layout from viewport aspect ratio.
      const isPortrait = height >= width * 1.15;
      let ascentX = cx;
      let ascentY = cy;
      let stackX = cx;
      let stackY = cy + buttonH + 24;
      if (!isPortrait) {
        ascentX = cx - buttonW / 2 - 20;
        stackX = cx + buttonW / 2 + 20;
        ascentY = cy + 20;
        stackY = cy + 20;
      }
      this.makeModeButton('ASCENT', 'Climb the winding corridor', ascentX, ascentY, buttonW, buttonH, 0x2a6fb0, 'ascent');
      this.makeModeButton('STACK', 'Jump between falling pieces', stackX, stackY, buttonW, buttonH, 0xb0602a, 'stack');
    }

    // Hint text.
    const hint = showStack
      ? 'Choose a mode  -  M mutes  -  B cycles background'
      : 'Tap to play  -  M mutes  -  B cycles background';
    this.add
      .text(cx, height - 24, hint, {
        fontFamily: 'system-ui, -apple-system, sans-serif',
        fontSize: '13px',
        color: '#808080'
      })
      .setOrigin(0.5, 1);

    // Keyboard shortcuts: 1 = ascent, 2 = stack (when available).
    this.input.keyboard?.on('keydown-ONE', () => this.startGame('ascent'));
    if (showStack) {
      this.input.keyboard?.on('keydown-TWO', () => this.startGame('stack'));
    }

    // Rebuild the whole scene on resize/orientation change - layout is
    // computed from width/height in create() and has no live-update path.
    const onResize = () => this.scene.restart();
    this.scale.on('resize', onResize);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      this.scale.off('resize', onResize);
    });
  }

  private makeModeButton(
    label: string,
    subtitle: string,
    x: number,
    y: number,
    w: number,
    h: number,
    fillColor: number,
    mode: GameMode
  ): void {
    const container = this.add.container(x, y);
    const bg = this.add
      .rectangle(0, 0, w, h, fillColor, 1)
      .setStrokeStyle(2, 0xffffff, 0.4)
      .setOrigin(0.5);
    const title = this.add
      .text(0, -14, label, {
        fontFamily: 'system-ui, -apple-system, sans-serif',
        fontSize: '30px',
        color: '#ffffff',
        fontStyle: 'bold'
      })
      .setOrigin(0.5);
    const sub = this.add
      .text(0, 18, subtitle, {
        fontFamily: 'system-ui, -apple-system, sans-serif',
        fontSize: '13px',
        color: '#e0e0e0'
      })
      .setOrigin(0.5);
    const best = this.loadBest(mode);
    const bestLabel = this.add
      .text(0, h / 2 + 12, best > 0 ? `Best: ${best}` : ' ', {
        fontFamily: 'system-ui, -apple-system, sans-serif',
        fontSize: '12px',
        color: '#a0a0a0'
      })
      .setOrigin(0.5, 0);

    container.add([bg, title, sub, bestLabel]);
    bg.setInteractive({ useHandCursor: true });
    bg.on('pointerover', () => bg.setFillStyle(brighten(fillColor, 0.15)));
    bg.on('pointerout', () => bg.setFillStyle(fillColor));
    bg.on('pointerdown', () => this.startGame(mode));
  }

  private startGame(mode: GameMode): void {
    this.scene.start('Game', { mode });
  }

  private loadBest(mode: GameMode): number {
    try {
      const v = window.localStorage.getItem(BEST_KEYS[mode]);
      return v ? parseInt(v, 10) || 0 : 0;
    } catch {
      return 0;
    }
  }
}

// Lighten a 0xRRGGBB color by moving each channel toward 255 by `amount`.
function brighten(color: number, amount: number): number {
  const r = (color >> 16) & 0xff;
  const g = (color >> 8) & 0xff;
  const b = color & 0xff;
  const nr = Math.min(255, Math.round(r + (255 - r) * amount));
  const ng = Math.min(255, Math.round(g + (255 - g) * amount));
  const nb = Math.min(255, Math.round(b + (255 - b) * amount));
  return (nr << 16) | (ng << 8) | nb;
}
