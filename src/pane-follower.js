import { capturePane } from "./tmux.js";
import { sanitizeTerminalText } from "./terminal-text.js";

const DEFAULT_FAST_INTERVAL_MS = Number(process.env.CAPTURE_FAST_INTERVAL_MS || 110);
const DEFAULT_IDLE_INTERVAL_MS = Number(process.env.CAPTURE_IDLE_INTERVAL_MS || 300);

export function createPaneFollower(sessionName, onSnapshot, onError) {
  let stopped = false;
  let timer = null;
  let inFlight = false;
  let lastSnapshot = "";
  let fastUntil = 0;

  function requestFastMode(ms = 2500) {
    fastUntil = Math.max(fastUntil, Date.now() + ms);
  }

  function scheduleNext(immediate = false) {
    if (stopped) return;
    if (timer) clearTimeout(timer);
    const now = Date.now();
    const isFast = now < fastUntil;
    const delay = immediate ? 0 : (isFast ? DEFAULT_FAST_INTERVAL_MS : DEFAULT_IDLE_INTERVAL_MS);
    timer = setTimeout(() => {
      void tick();
    }, delay);
  }

  async function tick() {
    if (stopped || inFlight) return;
    inFlight = true;
    try {
      const raw = await capturePane(sessionName);
      const snapshot = sanitizeTerminalText(raw);
      if (snapshot !== lastSnapshot) {
        lastSnapshot = snapshot;
        onSnapshot(snapshot);
        // Output changed: stay in fast mode briefly to keep up with prompt updates.
        requestFastMode(2000);
      }
    } catch (err) {
      if (onError) onError(err);
    } finally {
      inFlight = false;
      scheduleNext();
    }
  }

  requestFastMode(4000);
  scheduleNext(true);

  return {
    requestFastMode,
    refreshNow() {
      requestFastMode(2500);
      scheduleNext(true);
    },
    stop() {
      stopped = true;
      if (timer) clearTimeout(timer);
      timer = null;
    }
  };
}
