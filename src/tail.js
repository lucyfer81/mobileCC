import { spawn } from "node:child_process";

function stripAnsi(text) {
  // 按行处理，对每一行单独处理 \r 覆盖，然后再连接
  const lines = text.split('\n');
  const processedLines = [];

  for (let line of lines) {
    // 先去掉行尾所有连续的 \r（如果有的话）
    let trimmed = line;
    while (trimmed.endsWith('\r')) {
      trimmed = trimmed.slice(0, -1);
    }

    // 跳过空行
    if (!trimmed) {
      continue;
    }

    // 检查是否是纯spinner动画（包含光标上移但没有实质文本）
    const withoutAnsi = trimmed
      .replace(/\x1b\[[0-9;]*[mGKHfABCD]/g, '')
      .replace(/\x1b\[[?][0-9;]*[hl]/g, '')
      .replace(/\x1b\][^\x07]*\x07/g, '')
      .replace(/\x1b\][^\x1b]*\x1b\\/g, '')
      .replace(/\r/g, '')
      .trim();

    const hasCursorUp = /\x1b\[[0-9]+A/.test(line);
    const isShort = withoutAnsi.length < 10;
    const isSpinnerOnly = /^[✻✽✶✢·●*⠂⠐…]+$/.test(withoutAnsi);

    // 如果是纯spinner动画，跳过
    if (hasCursorUp && (isShort || isSpinnerOnly)) {
      continue;
    }

    // 按 \r 分割，找到最有实质内容的那个部分
    const parts = trimmed.split(/\r/);

    // 找到去除ANSI后最有内容的part（不是纯空格）
    let bestPart = '';
    let bestContentLength = 0;

    for (const part of parts) {
      const content = part
        .replace(/\x1b\[[0-9;]*[mGKHfABCD]/g, '')
        .replace(/\x1b\[[?][0-9;]*[hl]/g, '')
        .replace(/\x1b\][^\x07]*\x07/g, '')
        .replace(/\x1b\][^\x1b]*\x1b\\/g, '')
        .replace(/\r/g, '')
        .trim();

      if (content.length > bestContentLength) {
        bestContentLength = content.length;
        bestPart = part;
      }
    }

    if (bestPart) {
      processedLines.push(bestPart);
    }
  }

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
