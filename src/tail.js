import { spawn } from "node:child_process";
import { StringDecoder } from "node:string_decoder";
import { sanitizeTerminalText } from "./terminal-text.js";

export function createTailFollower(logFile, onLine) {
  const child = spawn("tail", ["-n", "200", "-F", logFile], {
    stdio: ["ignore", "pipe", "pipe"]
  });

  let buf = "";
  const decoder = new StringDecoder("utf8");
  child.stdout.on("data", (chunk) => {
    buf += decoder.write(chunk);
    let idx;
    while ((idx = buf.indexOf("\n")) >= 0) {
      const line = buf.slice(0, idx + 1);
      buf = buf.slice(idx + 1);
      onLine(sanitizeTerminalText(line));
    }
    if (buf.length > 8192) {
      onLine(sanitizeTerminalText(buf));
      buf = "";
    }
  });

  child.stdout.on("end", () => {
    const rest = decoder.end();
    if (!rest) return;
    const cleaned = sanitizeTerminalText(rest);
    if (cleaned) onLine(cleaned);
  });

  child.stderr.on("data", () => {});

  return {
    stop() {
      child.kill("SIGTERM");
    }
  };
}
