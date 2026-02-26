const OSC_RE = /\x1b\][^\x07\x1b]*(?:\x07|\x1b\\)/g;
const DCS_PM_APC_RE = /\x1b[PX^_][\s\S]*?\x1b\\/g;
const CSI_RE = /\x1b\[[0-?]*[ -/]*[@-~]/g;
const ESC_RE = /\x1b[@-_]/g;
const C1_CONTROL_RE = /[\x00-\x08\x0b\x0c\x0e-\x1f\x7f-\x9f]/g;

function collapseCarriageReturns(text) {
  const normalized = text.replace(/\r\n/g, "\n");
  const lines = normalized.split("\n");
  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i];
    if (!line.includes("\r")) continue;
    const parts = line.split("\r");
    lines[i] = parts[parts.length - 1];
  }
  return lines.join("\n");
}

export function sanitizeTerminalText(text) {
  let cleaned = collapseCarriageReturns(String(text));
  cleaned = cleaned
    .replace(OSC_RE, "")
    .replace(DCS_PM_APC_RE, "")
    .replace(CSI_RE, "")
    .replace(ESC_RE, "")
    .replace(C1_CONTROL_RE, "");
  return cleaned;
}

export function decodeUtf8Tail(buffer, tailBytes) {
  const data = Buffer.isBuffer(buffer) ? buffer : Buffer.from(buffer ?? "");
  const want = Math.max(0, Math.min(data.length, Number(tailBytes) || 0));
  let start = Math.max(0, data.length - want);

  // Avoid starting in the middle of a UTF-8 continuation sequence.
  while (start > 0 && (data[start] & 0xc0) === 0x80) {
    start -= 1;
  }

  return data.subarray(start).toString("utf8");
}
