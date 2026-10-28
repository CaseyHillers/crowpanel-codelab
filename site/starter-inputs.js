export function createStarterInputs(onUpdate, onCelebration = () => {}) {
  const states = new Map();
  let buffer = "";
  let discarding = false;
  let celebrationSeen = false;

  function update(line) {
    const message = line.endsWith("\r") ? line.slice(0, -1) : line;
    if (message === "DISPLAY CELEBRATION SHOWN") {
      if (!celebrationSeen && states.size === 5 && [...states.values()].every(state => state === "seen")) {
        celebrationSeen = true;
        onCelebration();
      }
      return;
    }
    const match = /^INPUT (Up|Down|Press|Menu|Back) (PRESSED|RELEASED)$/.exec(message);
    if (!match) return;
    const [, name, event] = match;
    const previous = states.get(name);
    if (previous === "seen") return;
    if (event === "RELEASED" && previous !== "pressed") return;
    const state = event === "PRESSED" ? "pressed" : "seen";
    if (state === previous) return;
    states.set(name, state);
    onUpdate(name, state);
  }

  return {
    push(text) {
      let offset = 0;
      while (offset < text.length) {
        const newline = text.indexOf("\n", offset);
        const end = newline === -1 ? text.length : newline;
        if (!discarding) {
          if (buffer.length + end - offset > 4096) {
            buffer = "";
            discarding = true;
          } else {
            buffer += text.slice(offset, end);
          }
        }
        if (newline === -1) return;
        const line = buffer;
        const complete = !discarding;
        buffer = "";
        discarding = false;
        if (complete) update(line);
        offset = newline + 1;
      }
    },
    reset() {
      buffer = "";
      discarding = false;
      states.clear();
      celebrationSeen = false;
    },
  };
}
