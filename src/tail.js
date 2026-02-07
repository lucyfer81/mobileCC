import { spawn } from "node:child_process";

function stripAnsi(text) {
  let cleaned = text;
  // CSI 序列（颜色、光标等）
  cleaned = cleaned.replace(/\x1b\[[0-9;]*[mGKHfABCD]/g, '');
  // DEC 私有模式（? + 数字 + h/l）
  cleaned = cleaned.replace(/\x1b\[[?][0-9;]*[hl]/g, '');
  // OSC 序列
  cleaned = cleaned.replace(/\x1b\][^\x07]*\x07/g, '');
  cleaned = cleaned.replace(/\x1b\][^\x1b]*\x1b\\/g, '');
  return cleaned;
}

export function createTailFollower(logFile, onLine) {
  const child = spawn("tail", ["-n", "200", "-F", logFile], {
    stdio: ["ignore", "pipe", "pipe"]
  });

  let buf = "";
  child.stdout.on("data", (chunk) => {
    buf += chunk.toString("utf8");
    let idx;
    while ((idx = buf.indexOf("\n")) >= 0) {
      const line = buf.slice(0, idx + 1);
      buf = buf.slice(idx + 1);
      onLine(stripAnsi(line));
    }
    if (buf.length > 8192) {
      onLine(stripAnsi(buf));
      buf = "";
    }
  });

  child.stderr.on("data", () => {});

  return {
    stop() {
      child.kill("SIGTERM");
    }
  };
}
