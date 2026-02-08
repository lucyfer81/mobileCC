import { spawn } from "node:child_process";

function stripAnsi(text) {
  // 按行处理，对每一行单独处理 \r 覆盖，然后再连接
  const lines = text.split('\n');
  const processedLines = lines.map(line => {
    // 先去掉行尾所有连续的 \r（如果有的话）
    let trimmed = line;
    while (trimmed.endsWith('\r')) {
      trimmed = trimmed.slice(0, -1);
    }

    // 如果整行都是空的，直接返回空字符串
    if (!trimmed) {
      return '';
    }

    // 按 \r 分割，只保留最后一段
    const parts = trimmed.split(/\r/);
    const lastPart = parts[parts.length - 1];

    // 如果最后一段是空的，检查是否有其他非空段
    if (!lastPart && parts.length > 1) {
      // 从后往前找第一个非空段
      for (let i = parts.length - 2; i >= 0; i--) {
        if (parts[i]) {
          return parts[i];
        }
      }
    }

    return lastPart;
  });

  let cleaned = processedLines.join('\n');

  // CSI 序列（颜色、光标等）
  cleaned = cleaned.replace(/\x1b\[[0-9;]*[mGKHfABCD]/g, '');
  // DEC 私有模式（? + 数字 + h/l）
  cleaned = cleaned.replace(/\x1b\[[?][0-9;]*[hl]/g, '');
  // OSC 序列
  cleaned = cleaned.replace(/\x1b\][^\x07]*\x07/g, '');
  cleaned = cleaned.replace(/\x1b\][^\x1b]*\x1b\\/g, '');

  // 清理剩余的回车符（CR），只保留换行符（LF）
  cleaned = cleaned.replace(/\r\n/g, '\n');  // Windows CRLF -> LF
  cleaned = cleaned.replace(/\r/g, '');      // 单独 CR 删除

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
