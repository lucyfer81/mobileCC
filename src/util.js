export function mustSessionName(name) {
  const s = String(name || "").trim();
  if (!/^[A-Za-z0-9._-]{1,64}$/.test(s)) {
    const err = new Error("Invalid session name. Use [A-Za-z0-9._-], length 1-64.");
    err.status = 400;
    throw err;
  }
  return s;
}

export function safeJson(res, obj, status = 200) {
  res.status(status).json(obj);
}

export function httpError(res, err) {
  const status = err?.status || 500;
  res.status(status).json({
    error: err?.message || "Internal error"
  });
}
