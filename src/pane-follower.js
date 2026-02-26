import { capturePane } from "./tmux.js";
import { sanitizeTerminalText } from "./terminal-text.js";

const DEFAULT_LINES = 300;
const DEFAULT_INTERVAL_MS = 700;

export function createPaneFollower(sessionName, onSnapshot, onError) {
  let stopped = false;
  let timer = null;
  let lastSnapshot = "";

  async function tick() {
    if (stopped) return;
    try {
      const raw = await capturePane(sessionName, -DEFAULT_LINES, -1);
      const snapshot = sanitizeTerminalText(raw);
      if (snapshot === lastSnapshot) return;
      lastSnapshot = snapshot;
      onSnapshot(snapshot);
    } catch (err) {
      if (onError) onError(err);
    }
  }

  timer = setInterval(tick, DEFAULT_INTERVAL_MS);
  void tick();

  return {
    stop() {
      stopped = true;
      if (timer) clearInterval(timer);
      timer = null;
    }
  };
}
