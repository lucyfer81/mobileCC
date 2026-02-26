import { execFile } from "node:child_process";
import { promisify } from "node:util";
import path from "node:path";
import fs from "node:fs/promises";

const execFileAsync = promisify(execFile);

async function tmux(args) {
  return await execFileAsync("tmux", args, { encoding: "utf8" });
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
  const target = `${sessionName}:0.0`;
  await tmux(["pipe-pane", "-t", target, "-o", `cat >> ${escapeShellArg(logFile)}`]);
}

export async function sendKeys(sessionName, text, enter = true) {
  const target = `${sessionName}:0.0`;
  await tmux(["send-keys", "-t", target, text]);
  if (enter) {
    await tmux(["send-keys", "-t", target, "Enter"]);
  }
}

export async function sendControl(sessionName, action) {
  const target = `${sessionName}:0.0`;
  if (action === "ctrl_c") {
    await tmux(["send-keys", "-t", target, "C-c"]);
    return;
  }
  if (action === "enter") {
    await tmux(["send-keys", "-t", target, "Enter"]);
    return;
  }
  const err = new Error("Unknown control action");
  err.status = 400;
  throw err;
}

export async function capturePane(sessionName, startLine = -300, endLine = -1) {
  const target = `${sessionName}:0.0`;
  const { stdout } = await tmux([
    "capture-pane",
    "-p",
    "-J",
    "-t",
    target,
    "-S",
    String(startLine),
    "-E",
    String(endLine)
  ]);
  return stdout;
}

function escapeShellArg(p) {
  return `'${String(p).replace(/'/g, `'\\''`)}'`;
}
