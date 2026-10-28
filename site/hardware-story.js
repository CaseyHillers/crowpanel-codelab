import { storyCopyState } from "./story-copy.js";

export function createHardwareStory(section, frame, status) {
  const motion = window.matchMedia("(prefers-reduced-motion: reduce)");
  const beats = [...section.querySelectorAll(".story-beat")];
  const position = section.querySelector(".story-position");
  const scrollHint = section.querySelector(".story-scroll");
  let active = false;
  let scheduled = false;
  let startupTimer;

  function update() {
    scheduled = false;
    if (!active) return;
    const bounds = section.getBoundingClientRect();
    const distance = Math.max(1, bounds.height - window.innerHeight);
    const progress = Math.min(1, Math.max(0, -bounds.top / distance));
    const states = storyCopyState(progress, motion.matches);
    const current = Math.min(3, Math.floor(progress * 4));
    beats.forEach((beat, index) => {
      beat.style.opacity = states[index].opacity;
      beat.style.visibility = states[index].opacity > 0 ? "visible" : "hidden";
      beat.style.transform = `translateY(${states[index].offset}px)`;
      beat.inert = index !== current;
      beat.setAttribute("aria-hidden", String(index !== current));
    });
    position.textContent = `0${current + 1} / 04`;
    scrollHint.textContent = progress > .95 ? "Your board is next →" : "Scroll to explore ↓";
    frame.contentWindow?.postMessage({ type: "crowpanel-story-progress", progress, reducedMotion: motion.matches }, "*");
  }

  function schedule() {
    if (!active || scheduled) return;
    scheduled = true;
    window.requestAnimationFrame(update);
  }

  window.addEventListener("scroll", schedule, { passive: true });
  window.addEventListener("resize", schedule);
  motion.addEventListener("change", schedule);
  frame.addEventListener("load", schedule);
  window.addEventListener("message", (event) => {
    if (!active || event.source !== frame.contentWindow) return;
    if (event.data?.type === "crowpanel-story-ready") {
      clearTimeout(startupTimer);
      status.textContent = "Illustrative CAD · not live device output";
      schedule();
    } else if (event.data?.type === "crowpanel-story-error") {
      clearTimeout(startupTimer);
      status.textContent = "3D view unavailable. Read the story or open the still reference in the appendix.";
    }
  });

  return {
    setActive(value) {
      active = value;
      if (active && !frame.hasAttribute("src")) {
        status.textContent = "Loading hardware illustration… The course works without 3D.";
        frame.src = new URL("./hardware/story.html", document.baseURI).href;
        startupTimer = setTimeout(() => {
          status.textContent = "3D view unavailable. Read the story or open the still reference in the appendix.";
        }, 35000);
      } else if (!active) {
        clearTimeout(startupTimer);
        frame.removeAttribute("src");
      }
      schedule();
    },
  };
}
