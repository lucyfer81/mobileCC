import { execFile } from "node:child_process";
import { promisify } from "node:util";
import path from "node:path";
import fs from "node:fs/promises";

const execFileAsync = promisify(execFile);

async function tmux(args) {
  return await execFileAsync("tmux", args, { encoding: "utf8" });
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function resolveActiveTarget(sessionName) {
  const { stdout } = await tmux([
    "display-message",
    "-p",
    "-t",
    sessionName,
    "#{session_name}:#{window_index}.#{pane_index}"
  ]);
  const target = stdout.trim();
  return target || `${sessionName}:0.0`;
}

export async function listSessions() {
  try {
    const { stdout } = await tmux(["list-sessions", "-F", "#{session_name}"]);
    return stdout
      .split("\n")
      .map(s => s.trim())
      .filter(Boolean);
  } catch (e) {
    return [];
  }
}

export async function hasSession(sessionName) {
  try {
    await tmux(["has-session", "-t", sessionName]);
    return true;
  } catch {
    return false;
  }
}

export async function ensureLogDir(logDir) {
  await fs.mkdir(logDir, { recursive: true });
}

export function logPathFor(logDir, sessionName) {
  return path.join(logDir, `${sessionName}.log`);
}

export async function ensurePipePane(sessionName, logFile) {
  await fs.appendFile(logFile, "");
  const target = await resolveActiveTarget(sessionName);
  await tmux(["pipe-pane", "-t", target, "-o", `cat >> ${escapeShellArg(logFile)}`]);
}

function mapSubmitSequence(submitKey) {
  if (submitKey === "enter") return ["C-m"];
  if (submitKey === "esc_enter") return ["Escape", "C-m"];
  // Codex commonly uses "tab to queue message" then Enter to send.
  if (submitKey === "tab") return ["Tab", "C-m", "C-m"];
  if (submitKey === "ctrl_j") return ["C-j"];
  return ["Tab", "C-m", "C-m"];
}

export async function sendKeys(sessionName, text, enter = true, submitKey = "tab") {
  const target = await resolveActiveTarget(sessionName);
  await tmux(["send-keys", "-t", target, "-l", text]);
  // Give TUI a short moment to process pasted text before submit keys.
  await sleep(80);
  if (enter) {
    const sequence = mapSubmitSequence(submitKey);
    for (const key of sequence) {
      await tmux(["send-keys", "-t", target, key]);
      await sleep(40);
    }
  }
}

export async function sendControl(sessionName, action) {
  const target = await resolveActiveTarget(sessionName);
  if (action === "ctrl_c") {
    await tmux(["send-keys", "-t", target, "C-c"]);
    return;
  }
  if (action === "enter") {
    await tmux(["send-keys", "-t", target, "Enter"]);
    return;
  }
  if (action === "ctrl_j") {
    await tmux(["send-keys", "-t", target, "C-j"]);
    return;
  }
  if (action === "esc_enter") {
    await tmux(["send-keys", "-t", target, "Escape"]);
    await tmux(["send-keys", "-t", target, "C-m"]);
    return;
  }
  if (action === "tab") {
    await tmux(["send-keys", "-t", target, "Tab"]);
    return;
  }
  const err = new Error("Unknown control action");
  err.status = 400;
  throw err;
}

export async function capturePane(sessionName, startLine = null, endLine = null) {
  const target = await resolveActiveTarget(sessionName);
  const args = [
    "capture-pane",
    "-p",
    "-J",
    "-t",
    target
  ];
  if (Number.isInteger(startLine)) {
    args.push("-S", String(startLine));
  }
  if (Number.isInteger(endLine)) {
    args.push("-E", String(endLine));
  }
  const { stdout } = await tmux(args);
  return stdout;
}

function escapeShellArg(p) {
  return `'${String(p).replace(/'/g, `'\\''`)}'`;
}
