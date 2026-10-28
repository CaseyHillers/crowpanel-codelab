(() => {
  'use strict';

  function clampProgress(value) {
    return typeof value === 'number' && Number.isFinite(value)
      ? Math.min(1, Math.max(0, value)) : 0;
  }

  function readProgressMessage(data) {
    if (!data || typeof data !== 'object' || Array.isArray(data)
      || data.type !== 'crowpanel-story-progress'
      || typeof data.progress !== 'number' || !Number.isFinite(data.progress)
      || typeof data.reducedMotion !== 'boolean') return null;
    return { progress: clampProgress(data.progress), reducedMotion: data.reducedMotion };
  }

  function transition(progress, start, end) {
    const amount = clampProgress((progress - start) / (end - start));
    return amount * amount * (3 - 2 * amount);
  }

  function storyState(value, reducedMotion = false) {
    const progress = clampProgress(value);
    const beat = Math.min(3, Math.floor(progress * 4));
    const position = reducedMotion === true ? [0, .4, .62, 1][beat] : progress;
    const turnBack = transition(position, .16, .36);
    const connectivity = transition(position, .49, .57) * (1 - transition(position, .68, .76));
    const returnFront = transition(position, .67, .84);
    const assembly = transition(position, .76, 1);
    return {
      progress,
      beat,
      yaw: Math.PI * turnBack + (Math.PI + .32) * returnFront,
      pitch: Math.PI / 9 * (1 - 2 * turnBack) + .64 * returnFront,
      highlight: connectivity,
      assembly,
      shellOpacity: transition(position, .77, .88),
      shellSeparation: 26 * (1 - assembly),
      boardSlide: 12 * transition(position, .68, .78) * (1 - assembly),
      feetDrop: 14 * (1 - assembly),
      deskVisible: position >= .76,
      screen: position < .08 ? 'hello' : position < .9 ? 'slideshow' : 'weather',
    };
  }

  globalThis.CrowPanelStoryTimeline = Object.freeze({ clampProgress, readProgressMessage, storyState });
})();
