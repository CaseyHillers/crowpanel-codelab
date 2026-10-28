import assert from 'node:assert/strict';
import test from 'node:test';
import '../site/public/hardware/story-timeline.js';

const { clampProgress, readProgressMessage, storyState } = globalThis.CrowPanelStoryTimeline;

test('progress is finite, numeric and bounded, never coerced', () => {
  for (const value of [undefined, null, NaN, Infinity, -Infinity, '0.5', {}, true]) {
    assert.equal(clampProgress(value), 0);
    assert.deepEqual(storyState(value), storyState(0));
  }
  assert.deepEqual(storyState(-4), storyState(0));
  assert.deepEqual(storyState(4), storyState(1));
  assert.equal(clampProgress(.52), .52);
});

test('message contract rejects malformed input, preserves motion preference and clamps finite numbers', () => {
  for (const data of [null, [], 'hello', {}, { type: 'other', progress: 0, reducedMotion: false },
    { type: 'crowpanel-story-progress', progress: '1', reducedMotion: false },
    { type: 'crowpanel-story-progress', progress: NaN, reducedMotion: false },
    { type: 'crowpanel-story-progress', progress: Infinity, reducedMotion: false },
    { type: 'crowpanel-story-progress', progress: .5 },
    { type: 'crowpanel-story-progress', progress: .5, reducedMotion: 'false' }]) {
    assert.equal(readProgressMessage(data), null);
  }
  assert.deepEqual(readProgressMessage({ type: 'crowpanel-story-progress', progress: 9, reducedMotion: true }),
    { progress: 1, reducedMotion: true });
  assert.deepEqual(readProgressMessage({ type: 'crowpanel-story-progress', progress: -2, reducedMotion: false }),
    { progress: 0, reducedMotion: false });
});

test('front board opens the story; final assembly closes shells and rests feet on desk', () => {
  const start = storyState(0);
  assert.equal(start.beat, 0);
  assert.equal(start.yaw, 0);
  assert.equal(start.pitch, Math.PI / 9);
  assert.equal(start.shellOpacity, 0);
  assert.equal(start.deskVisible, false);
  assert.equal(start.screen, 'hello');
  const end = storyState(1);
  assert.equal(end.beat, 3);
  assert.equal(end.assembly, 1);
  assert.equal(end.shellSeparation, 0);
  assert.equal(end.boardSlide, 0);
  assert.equal(end.feetDrop, 0);
  assert.equal(end.shellOpacity, 1);
  assert.equal(end.deskVisible, true);
  assert.equal(end.highlight, 0);
  assert.equal(end.screen, 'weather');
});

test('the front display changes from hello to slideshow before the rear turn, then finishes on weather', () => {
  assert.equal(storyState(0).screen, 'hello');
  assert.equal(storyState(.079).screen, 'hello');
  for (const progress of [.08, .12, .15]) {
    assert.equal(storyState(progress).screen, 'slideshow');
    assert.equal(storyState(progress).yaw, 0);
  }
  assert.equal(storyState(.9).screen, 'weather');
  assert.equal(storyState(1).screen, 'weather');
});

test('rear controls precede a whole-board connectivity highlight, without component coordinates', () => {
  const rear = storyState(.4);
  assert.equal(rear.beat, 1);
  assert.equal(rear.yaw, Math.PI);
  assert.equal(rear.pitch, -Math.PI / 9);
  assert.equal(rear.highlight, 0);
  const connectivity = storyState(.62);
  assert.equal(connectivity.beat, 2);
  assert.equal(connectivity.highlight, 1);
  assert.equal(connectivity.shellOpacity, 0);
});

test('scroll sampling is deterministic, reversible and continuous through assembly', () => {
  const middle = storyState(.85);
  storyState(1);
  assert.deepEqual(storyState(.85), middle);
  assert.ok(middle.shellSeparation > 0 && middle.shellSeparation < 26);
  assert.ok(middle.assembly > 0 && middle.assembly < 1);
  let previous = storyState(0);
  for (let index = 1; index <= 1000; index++) {
    const state = storyState(index / 1000);
    assert.ok(state.assembly >= previous.assembly);
    assert.ok(Math.abs(state.yaw - previous.yaw) < .04);
    for (const key of ['highlight', 'assembly', 'shellOpacity']) {
      assert.ok(state[key] >= 0 && state[key] <= 1);
    }
    previous = state;
  }
});

test('reduced motion has four fixed poses with exact beat boundaries and no interpolated assembly', () => {
  const pose = state => { const { progress, ...rest } = state; return rest; };
  for (const [start, end] of [[0, .249999], [.25, .499999], [.5, .749999], [.75, 1]]) {
    assert.deepEqual(pose(storyState(start, true)), pose(storyState(end, true)));
  }
  assert.equal(storyState(.25, true).yaw, Math.PI);
  assert.equal(storyState(.5, true).highlight, 1);
  assert.equal(storyState(.75, true).assembly, 1);
  assert.notDeepEqual(pose(storyState(.3)), pose(storyState(.35)));
});
