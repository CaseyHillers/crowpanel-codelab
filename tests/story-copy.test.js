import assert from 'node:assert/strict';
import test from 'node:test';
import { storyCopyState } from '../site/story-copy.js';

const boundaries = [.25, .5, .75];
const tolerance = 1e-10;
const opacities = state => state.map(chapter => chapter.opacity);

function approximately(actual, expected, message) {
  assert.ok(Math.abs(actual - expected) < tolerance, `${message}: ${actual} ≠ ${expected}`);
}

function assertBoundedState(state) {
  assert.ok(Array.isArray(state));
  assert.equal(state.length, 4);
  for (const chapter of state) {
    assert.deepEqual(Object.keys(chapter).sort(), ['offset', 'opacity']);
    assert.ok(Number.isFinite(chapter.opacity));
    assert.ok(chapter.opacity >= 0 && chapter.opacity <= 1);
    assert.ok(Number.isFinite(chapter.offset));
    assert.ok(chapter.offset >= -36 && chapter.offset <= 36);
  }
}

test('first and last chapters are fully visible at the story endpoints', () => {
  assert.deepEqual(opacities(storyCopyState(0)), [1, 0, 0, 0]);
  assert.deepEqual(opacities(storyCopyState(1)), [0, 0, 0, 1]);
  for (const [progress, expected] of [
    [.125, [1, 0, 0, 0]],
    [.375, [0, 1, 0, 0]],
    [.625, [0, 0, 1, 0]],
    [.875, [0, 0, 0, 1]],
  ]) {
    assert.deepEqual(opacities(storyCopyState(progress)), expected);
  }
});

test('crossfades span .035 on each side of each beat and use smoothstep blending', () => {
  for (const [outgoing, boundary] of boundaries.entries()) {
    for (const [distance, incomingOpacity] of [
      [-.035, 0], [-.0175, .15625], [0, .5], [.0175, .84375], [.035, 1],
    ]) {
      const state = storyCopyState(boundary + distance);
      approximately(state[outgoing].opacity, 1 - incomingOpacity, 'outgoing blend');
      approximately(state[outgoing + 1].opacity, incomingOpacity, 'incoming blend');
      for (const [index, chapter] of state.entries()) {
        if (index !== outgoing && index !== outgoing + 1) assert.equal(chapter.opacity, 0);
      }
    }
  }
});

test('text stays visible and bounded throughout forward scrolling', () => {
  let previous = storyCopyState(0);
  for (let sample = 0; sample <= 2000; sample++) {
    const state = storyCopyState(sample / 2000);
    assertBoundedState(state);
    approximately(state.reduce((sum, chapter) => sum + chapter.opacity, 0), 1,
      'total visible opacity');
    assert.ok(Math.max(...opacities(state)) >= .5 - tolerance, 'text must never disappear');
    assert.ok(state.filter(chapter => chapter.opacity > 0).length <= 2);
    for (const [index, chapter] of state.entries()) {
      assert.ok(Math.abs(chapter.opacity - previous[index].opacity) < .012,
        'small scroll steps must not jump opacity');
    }
    previous = state;
  }
});

test('opacity is continuous at crossfade edges and centers, with eased endpoints', () => {
  const epsilon = 1e-7;
  for (const [outgoing, boundary] of boundaries.entries()) {
    for (const progress of [boundary - .035, boundary, boundary + .035]) {
      const before = storyCopyState(progress - epsilon);
      const after = storyCopyState(progress + epsilon);
      for (let index = 0; index < 4; index++) {
        assert.ok(Math.abs(after[index].opacity - before[index].opacity) < 1e-5);
      }
    }
    const entering = storyCopyState(boundary - .035 + epsilon)[outgoing + 1].opacity;
    const leaving = 1 - storyCopyState(boundary + .035 - epsilon)[outgoing + 1].opacity;
    assert.ok(entering / epsilon < .001, 'fade-in must start with a flat slope');
    assert.ok(leaving / epsilon < .001, 'fade-out must end with a flat slope');
  }
});

test('sampling is deterministic and reversible, independent of calls and motion preferences', () => {
  const progressValues = [0, .215, .2325, .25, .2675, .285, .49, .5, .73, .75, .9, 1];
  const snapshots = progressValues.map(progress => storyCopyState(progress));
  const expected = structuredClone(snapshots);
  for (const progress of [...progressValues].reverse()) {
    storyCopyState(progress, true);
    assert.deepEqual(storyCopyState(progress), expected[progressValues.indexOf(progress)]);
  }
  assert.deepEqual(snapshots, expected, 'later calls must not mutate earlier results');
  for (const [index, progress] of progressValues.entries()) {
    assert.deepEqual(storyCopyState(progress, false), expected[index]);
  }
});

test('invalid progress resets to zero and finite out-of-range progress clamps to endpoints', () => {
  for (const reducedMotion of [false, true]) {
    for (const progress of [undefined, null, NaN, Infinity, -Infinity, '0.5', '', true,
      false, {}, [], [.5], Symbol('progress'), 1n]) {
      const state = storyCopyState(progress, reducedMotion);
      assertBoundedState(state);
      assert.deepEqual(state, storyCopyState(0, reducedMotion));
    }
    for (const progress of [-Number.MAX_VALUE, -1, -.001]) {
      assert.deepEqual(storyCopyState(progress, reducedMotion), storyCopyState(0, reducedMotion));
    }
    for (const progress of [1.001, 2, Number.MAX_VALUE]) {
      assert.deepEqual(storyCopyState(progress, reducedMotion), storyCopyState(1, reducedMotion));
    }
  }
});

test('reduced motion switches discretely at beat boundaries and never translates text', () => {
  for (const [progress, active] of [
    [0, 0], [.249999, 0], [.25, 1], [.499999, 1], [.5, 2],
    [.749999, 2], [.75, 3], [1, 3],
  ]) {
    const state = storyCopyState(progress, true);
    assertBoundedState(state);
    assert.deepEqual(opacities(state), [0, 1, 2, 3].map(index => Number(index === active)));
  }
  for (let sample = 0; sample <= 1000; sample++) {
    const state = storyCopyState(sample / 1000, true);
    assertBoundedState(state);
    assert.equal(state.filter(chapter => chapter.opacity === 1).length, 1);
    for (const chapter of state) {
      assert.ok(chapter.opacity === 0 || chapter.opacity === 1);
      assert.equal(chapter.offset, 0);
    }
  }
});
