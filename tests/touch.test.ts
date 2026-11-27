import { describe, test, expect } from 'bun:test';
import {
  shouldShowTouchControls,
  unionKeys,
  keysFromActiveButtons,
  TouchButtonTracker,
  TOUCH_BUTTONS,
  type TouchButton,
} from '../src/game/touch';
import { mapKeysToInput, defaultKeys } from '../src/game/input';

describe('touch device detection', () => {
  test('shows the controls on touch-capable coarse-pointer devices', () => {
    expect(shouldShowTouchControls({ maxTouchPoints: 2, coarsePointer: true })).toBe(true);
    expect(shouldShowTouchControls({ maxTouchPoints: 1, coarsePointer: true })).toBe(true);
  });

  test('hides the controls on plain desktops', () => {
    expect(shouldShowTouchControls({ maxTouchPoints: 0, coarsePointer: false })).toBe(false);
  });

  test('hides the controls on desktops with a touchscreen (fine primary pointer)', () => {
    expect(shouldShowTouchControls({ maxTouchPoints: 10, coarsePointer: false })).toBe(false);
  });

  test('hides the controls when the pointer is coarse but there are no touch points', () => {
    expect(shouldShowTouchControls({ maxTouchPoints: 0, coarsePointer: true })).toBe(false);
  });
});

describe('unionKeys', () => {
  test('OR-merges every boolean', () => {
    const merged = unionKeys(
      { ...defaultKeys(), left: true, handbrake: true },
      { ...defaultKeys(), right: true, throttle: true },
    );
    expect(merged).toEqual({
      throttle: true,
      brake: false,
      left: true,
      right: true,
      handbrake: true,
    });
  });

  test('touch and keyboard combine into the same effective input as the keyboard alone', () => {
    // touch-only throttle + keyboard-only steer: engine gets both at once
    const touch = keysFromActiveButtons(['throttle']);
    const keyboard = { ...defaultKeys(), left: true };
    const input = mapKeysToInput(unionKeys(keyboard, touch));
    expect(input.throttle).toBe(1);
    expect(input.steer).toBe(1);
  });

  test('opposing steer from two sources still cancel (same rule as keyboard)', () => {
    const merged = unionKeys({ ...defaultKeys(), left: true }, { ...defaultKeys(), right: true });
    expect(mapKeysToInput(merged).steer).toBe(0);
  });

  test('opposing throttle/brake: throttle wins, same as the keyboard path', () => {
    const merged = unionKeys({ ...defaultKeys(), brake: true }, { ...defaultKeys(), throttle: true });
    expect(mapKeysToInput(merged).throttle).toBe(1);
  });
});

describe('TouchButtonTracker', () => {
  test('isActive reflects only currently-held buttons', () => {
    const tracker = new TouchButtonTracker();
    tracker.press('t1', 'throttle');
    tracker.press('t2', 'left');
    expect(tracker.isActive('throttle')).toBe(true);
    expect(tracker.isActive('left')).toBe(true);
    expect(tracker.isActive('brake')).toBe(false);
    tracker.release('t1');
    expect(tracker.isActive('throttle')).toBe(false);
    expect(tracker.isActive('left')).toBe(true);
  });

  test('a button stays held until every touch holding it is released', () => {
    const tracker = new TouchButtonTracker();
    tracker.press('t1', 'throttle');
    tracker.press('t2', 'throttle');
    tracker.release('t1');
    expect(tracker.isActive('throttle')).toBe(true); // t2 still holding
    tracker.release('t2');
    expect(tracker.isActive('throttle')).toBe(false);
  });

  test('release returns the button for the released touch (or null)', () => {
    const tracker = new TouchButtonTracker();
    tracker.press('t1', 'brake');
    expect(tracker.release('t1')).toBe('brake');
    expect(tracker.release('t1')).toBeNull();
    expect(tracker.release('unknown')).toBeNull();
  });

  test('activeButtons dedupes buttons held by multiple touches', () => {
    const tracker = new TouchButtonTracker();
    tracker.press('t1', 'throttle');
    tracker.press('t2', 'throttle');
    tracker.press('t3', 'right');
    expect(tracker.activeButtons().sort()).toEqual(['right', 'throttle']);
  });

  test('releaseAll drops every touch', () => {
    const tracker = new TouchButtonTracker();
    tracker.press('t1', 'left');
    tracker.press('t2', 'throttle');
    tracker.press('t3', 'handbrake');
    tracker.releaseAll();
    expect(tracker.size).toBe(0);
    expect(tracker.isActive('throttle')).toBe(false);
    expect(tracker.isActive('handbrake')).toBe(false);
  });
});

describe('keysFromActiveButtons', () => {
  test('maps every touch button onto its KartKeys field', () => {
    const keys = keysFromActiveButtons([...TOUCH_BUTTONS]);
    expect(keys).toEqual({
      left: true,
      right: true,
      throttle: true,
      brake: true,
      handbrake: true,
    });
  });

  test('stays false for buttons that were not active', () => {
    const keys = keysFromActiveButtons(['throttle', 'handbrake'] as TouchButton[]);
    expect(keys).toEqual({ throttle: true, handbrake: true, left: false, right: false, brake: false });
  });

  test('an empty active set yields all-false keys', () => {
    expect(keysFromActiveButtons([])).toEqual(defaultKeys());
  });

  test('TOUCH_BUTTONS stays in sync with the KartKeys fields it can set', () => {
    const keyboardFields = Object.keys(defaultKeys()).sort();
    // every keyboardable field except none is reachable via touch
    const touchFields: string[] = [...TOUCH_BUTTONS].sort();
    expect(touchFields).toEqual(keyboardFields);
  });
});

describe('end-to-end mapping through mapKeysToInput', () => {
  test('a held touch pedal produces the same input as the keyboard', () => {
    const tracker = new TouchButtonTracker();
    tracker.press('finger', 'throttle');
    tracker.press('other', 'right');
    const input = mapKeysToInput(keysFromActiveButtons(tracker.activeButtons()));
    expect(input).toEqual({ throttle: 1, steer: -1, handbrake: false });
  });

  test('handbrake from touch reaches the physics input', () => {
    const input = mapKeysToInput(keysFromActiveButtons(['handbrake'] as TouchButton[]));
    expect(input.handbrake).toBe(true);
  });
});
