import Phaser from 'phaser';
import { BootScene } from './scenes/BootScene';
import { MenuScene } from './scenes/MenuScene';
import { GameScene } from './scenes/GameScene';
import { GameOverScene } from './scenes/GameOverScene';
import { COLORS } from './config/constants';

const config: Phaser.Types.Core.GameConfig = {
  type: Phaser.AUTO,
  parent: 'game-root',
  backgroundColor: COLORS.background,
  scale: {
    mode: Phaser.Scale.RESIZE,
    autoCenter: Phaser.Scale.CENTER_BOTH,
    width: window.innerWidth,
    height: window.innerHeight
  },
  physics: {
    default: 'arcade',
    arcade: {
      gravity: { x: 0, y: 0 }, // per-body gravity is set explicitly
      debug: false
    }
  },
  input: {
    activePointers: 4 // allow multi-touch (joystick + buttons)
  },
  render: {
    pixelArt: false,
    antialias: true
  },
  scene: [BootScene, MenuScene, GameScene, GameOverScene]
};

// eslint-disable-next-line @typescript-eslint/no-unused-vars
const game = new Phaser.Game(config);

// iOS WebView (Capacitor) and some Android browsers don't reliably fire
// `resize` after an orientation change until the layout viewport has
// finished settling. Force Phaser to re-measure a couple of times so the
// canvas actually follows the new orientation.
function refreshScale(): void {
  game.scale.refresh();
}
window.addEventListener('orientationchange', () => {
  setTimeout(refreshScale, 50);
  setTimeout(refreshScale, 300);
  setTimeout(refreshScale, 600);
});
window.addEventListener('resize', () => setTimeout(refreshScale, 50));
