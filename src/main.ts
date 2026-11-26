import { GameEngine } from './game/engine';

const container = document.getElementById('game');
if (!container) throw new Error('missing #game container');

const engine = new GameEngine(container);

// reset key
window.addEventListener('keydown', (e) => {
  if (e.code === 'KeyR') engine.reset();
});

// clean shutdown (prevents double-engine leaks in hot reload / tests)
window.addEventListener('beforeunload', () => engine.destroy());

engine.start();

// global for debugging
(window as unknown as Record<string, unknown>).__kartDebug = {
  getSnapshot: () => engine.getSnapshot(),
};
