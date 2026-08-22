// ../../../../private/var/folders/sw/58kq1_l51_91cltcypr_d_nm0000gn/T/tabula-compat-snapshot-ueFoMk/package/dist/chunk-ISUX6R5A.js
var CapabilityError = class extends Error {
  capability;
  constructor(capability, detail) {
    super(`Tabula requires ${capability}. ${detail}`);
    this.name = "CapabilityError";
    this.capability = capability;
  }
};
var StorageOperationError = class extends Error {
  storage;
  operation;
  constructor(storage, operation, cause) {
    super(`Tabula could not ${operation} ${storage}; the operation was not committed.`, { cause });
    this.name = "StorageOperationError";
    this.storage = storage;
    this.operation = operation;
  }
};
var StorageCorruptionError = class extends Error {
  constructor(record) {
    super(`Tabula found a corrupt authoritative storage record for ${record}.`);
    this.name = "StorageCorruptionError";
  }
};
var WorkspaceDestroyedError = class extends Error {
  constructor() {
    super("This Tabula workspace has been destroyed.");
    this.name = "WorkspaceDestroyedError";
  }
};
var WorkspaceFailedError = class extends Error {
  constructor(cause) {
    super("This Tabula workspace failed because coordination could not continue.", { cause });
    this.name = "WorkspaceFailedError";
  }
};
var ViewAlreadyClaimedError = class extends Error {
  currentView;
  constructor(currentView) {
    super(`This tab already owns the '${currentView}' view; release it before claiming another.`);
    this.name = "ViewAlreadyClaimedError";
    this.currentView = currentView;
  }
};
var documentIdentity;
var documentMessageCounter = 0;
function getDocumentIdentity() {
  if (!documentIdentity) {
    documentIdentity = {
      instanceId: crypto.randomUUID(),
      startedAt: Date.now()
    };
  }
  return documentIdentity;
}
function nextMessageId(instanceId) {
  return `${instanceId}:${++documentMessageCounter}`;
}
function requireStorage(name) {
  try {
    const storage = globalThis[name];
    if (!storage) throw new Error(`${name} is unavailable`);
    return storage;
  } catch (cause) {
    throw new CapabilityError(name, `Access is blocked or unavailable. ${String(cause)}`);
  }
}
function probeStorage(name) {
  const storage = requireStorage(name);
  const key = `tabula:capability-probe:${crypto.randomUUID()}`;
  const value = crypto.randomUUID();
  try {
    storage.setItem(key, value);
    if (storage.getItem(key) !== value) throw new Error("round-trip verification failed");
    storage.removeItem(key);
  } catch (cause) {
    try {
      storage.removeItem(key);
    } catch {
    }
    throw new CapabilityError(
      name,
      `Read, write, and remove access must be available. ${String(cause)}`
    );
  }
}
function assertBaselineCapabilities() {
  if (typeof window === "undefined") {
    throw new CapabilityError("a browser window", "Server and worker runtimes are unsupported.");
  }
  if (window.self !== window.top) {
    throw new CapabilityError("a top-level browsing context", "Iframes are unsupported.");
  }
  if (globalThis.isSecureContext !== true) {
    throw new CapabilityError("a secure context", "Use HTTPS or a secure localhost context.");
  }
  if (typeof globalThis.crypto?.randomUUID !== "function") {
    throw new CapabilityError("crypto.randomUUID()", "A modern secure browser is required.");
  }
  if (typeof globalThis.structuredClone !== "function") {
    throw new CapabilityError(
      "structuredClone()",
      "A modern browser with structured cloning is required."
    );
  }
  if (typeof globalThis.BroadcastChannel !== "function") {
    throw new CapabilityError(
      "BroadcastChannel",
      "For Node.js tests, use @thinkly/tabula-js/testing."
    );
  }
  if (typeof globalThis.navigator?.locks?.request !== "function") {
    throw new CapabilityError("Web Locks", "navigator.locks.request() must be available.");
  }
  probeStorage("localStorage");
  probeStorage("sessionStorage");
}
function storageGet(storage, storageName, key) {
  try {
    return storage.getItem(key);
  } catch (cause) {
    throw new StorageOperationError(storageName, "read", cause);
  }
}
function storageSet(storage, storageName, key, value) {
  try {
    storage.setItem(key, value);
  } catch (cause) {
    throw new StorageOperationError(storageName, "write", cause);
  }
}
function storageRemove(storage, storageName, key) {
  try {
    storage.removeItem(key);
  } catch (cause) {
    throw new StorageOperationError(storageName, "remove", cause);
  }
}
var PROTOCOL_MAJOR = 1;
var PROTOCOL_REVISION = 1;
var PROTOCOL_MIN_REVISION = 0;
var MAX_MESSAGE_BYTES = 1024 * 1024;
var MAX_STRUCTURE_DEPTH = 64;
var MAX_STRUCTURE_NODES = 1e4;
var MAX_STATE_KEYS = 1024;
var MAX_PRESENCE_PEERS = 256;
var MAX_NAME_BYTES = 128;
var MAX_ID_BYTES = 256;
var DANGEROUS_KEYS = /* @__PURE__ */ new Set(["__proto__", "prototype", "constructor"]);
var textEncoder = new TextEncoder();
var MESSAGE_TYPES = /* @__PURE__ */ new Set([
  "identity:probe",
  "identity:claim",
  "tab:announce",
  "tab:heartbeat",
  "tab:leave",
  "state:sync-request",
  "state:sync",
  "state:set",
  "state:delete",
  "state:batch",
  "view:claim",
  "view:claimed",
  "view:release",
  "view:conflict",
  "view:focus",
  "view:intent-claim",
  "view:intent-state",
  "leader:query",
  "leader:change",
  "protocol:reject"
]);
var LOCAL_PROTOCOL = Object.freeze({
  major: PROTOCOL_MAJOR,
  revision: PROTOCOL_REVISION,
  minRevision: PROTOCOL_MIN_REVISION
});
function isRecord(value) {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
function isFiniteTimestamp(value) {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 0;
}
function hasSafeOwnKeys(value) {
  return Object.keys(value).every((key) => !DANGEROUS_KEYS.has(key));
}
function byteLength(value) {
  return textEncoder.encode(value).byteLength;
}
function isValidId(value) {
  return typeof value === "string" && value.length > 0 && byteLength(value) <= MAX_ID_BYTES && !/\p{Cc}/u.test(value);
}
function isValidName(value) {
  return typeof value === "string" && value.length > 0 && byteLength(value) <= MAX_NAME_BYTES && !/\p{Cc}/u.test(value) && !DANGEROUS_KEYS.has(value);
}
function parseVersion(value) {
  if (!isRecord(value) || !hasSafeOwnKeys(value)) return null;
  const { major, revision } = value;
  const minRevision = value.minRevision ?? 0;
  if (!Number.isSafeInteger(major) || !Number.isSafeInteger(revision) || !Number.isSafeInteger(minRevision) || major < 0 || revision < 0 || minRevision < 0 || minRevision > revision) {
    return null;
  }
  return {
    major,
    revision,
    minRevision
  };
}
function parseIdentity(value) {
  if (!isRecord(value) || !hasSafeOwnKeys(value)) return null;
  if (!isValidId(value.tabId) || !isValidId(value.instanceId)) return null;
  return { tabId: value.tabId, instanceId: value.instanceId };
}
function parseTarget(value) {
  if (!isRecord(value) || !hasSafeOwnKeys(value) || !isValidId(value.tabId)) return null;
  if (value.instanceId !== void 0 && !isValidId(value.instanceId)) return null;
  return value.instanceId === void 0 ? { tabId: value.tabId } : { tabId: value.tabId, instanceId: value.instanceId };
}
function protocolRangesOverlap(remote) {
  return remote.major === LOCAL_PROTOCOL.major && remote.minRevision <= LOCAL_PROTOCOL.revision && LOCAL_PROTOCOL.minRevision <= remote.revision;
}
function structuralBudgetIsValid(root) {
  let bytes = 0;
  let nodes = 0;
  const seen = /* @__PURE__ */ new Set();
  const pending = [{ value: root, depth: 0 }];
  while (pending.length > 0) {
    const current = pending.pop();
    const { value, depth } = current;
    if (depth > MAX_STRUCTURE_DEPTH || ++nodes > MAX_STRUCTURE_NODES) return false;
    if (typeof value === "string") {
      bytes += byteLength(value);
    } else if (typeof value === "number" || typeof value === "boolean" || typeof value === "bigint" || value === null || value === void 0) {
      bytes += 8;
    } else if (typeof value === "symbol" || typeof value === "function") {
      return false;
    } else if (typeof value === "object") {
      if (seen.has(value)) continue;
      seen.add(value);
      if (typeof SharedArrayBuffer !== "undefined" && value instanceof SharedArrayBuffer)
        return false;
      if (value instanceof ArrayBuffer) {
        bytes += value.byteLength;
      } else if (ArrayBuffer.isView(value)) {
        bytes += value.byteLength;
      } else if (value instanceof Date) {
        if (!Number.isFinite(value.getTime())) return false;
        bytes += 8;
      } else if (value instanceof RegExp) {
        bytes += byteLength(value.source) + byteLength(value.flags);
      } else if (typeof Blob !== "undefined" && value instanceof Blob) {
        bytes += value.size;
      } else if (value instanceof Map) {
        for (const [key, entry] of value) {
          if (typeof key === "string" && DANGEROUS_KEYS.has(key)) return false;
          pending.push({ value: key, depth: depth + 1 }, { value: entry, depth: depth + 1 });
        }
      } else if (value instanceof Set || Array.isArray(value)) {
        for (const entry of value) pending.push({ value: entry, depth: depth + 1 });
      } else {
        let keys;
        try {
          keys = Object.keys(value);
        } catch {
          return false;
        }
        for (const key of keys) {
          if (DANGEROUS_KEYS.has(key)) return false;
          bytes += byteLength(key);
          try {
            pending.push({ value: value[key], depth: depth + 1 });
          } catch {
            return false;
          }
        }
      }
    }
    if (bytes > MAX_MESSAGE_BYTES) return false;
  }
  return true;
}
function isValidStateKey(value) {
  return isValidId(value) && !DANGEROUS_KEYS.has(value);
}
function isStateEntry(value) {
  return isRecord(value) && hasSafeOwnKeys(value) && "value" in value && value.value !== void 0 && isFiniteTimestamp(value.ts) && isValidId(value.tabId) && Number.isSafeInteger(value.version) && value.version >= 0 && structuralBudgetIsValid(value.value);
}
function isStateOperation(value) {
  if (!isRecord(value) || !hasSafeOwnKeys(value)) return false;
  if (!isValidStateKey(value.key) || !isRecord(value.clock) || !hasSafeOwnKeys(value.clock) || !isFiniteTimestamp(value.clock.wallTime) || !Number.isSafeInteger(value.clock.logical) || value.clock.logical < 0 || !isValidId(value.tabId) || !isValidId(value.instanceId) || !isValidId(value.operationId)) {
    return false;
  }
  if (value.kind === "delete") return !("value" in value);
  return value.kind === "set" && "value" in value && value.value !== void 0 && structuralBudgetIsValid(value.value);
}
function isStateRecord(value) {
  if (!isRecord(value) || !hasSafeOwnKeys(value)) return false;
  const entries = Object.entries(value);
  return entries.length <= MAX_STATE_KEYS && entries.every(
    ([key, entry]) => isValidStateKey(key) && (isStateEntry(entry) || isStateOperation(entry) && entry.key === key)
  );
}
function isStateBatch(value) {
  if (!Array.isArray(value) || value.length === 0 || value.length > MAX_STATE_KEYS) return false;
  const keys = /* @__PURE__ */ new Set();
  for (const operation of value) {
    if (!isStateOperation(operation) || keys.has(operation.key)) return false;
    keys.add(operation.key);
  }
  return true;
}
function isStateOperationList(value) {
  if (!Array.isArray(value) || value.length > MAX_STATE_KEYS) return false;
  const keys = /* @__PURE__ */ new Set();
  for (const operation of value) {
    if (!isStateOperation(operation) || keys.has(operation.key)) return false;
    keys.add(operation.key);
  }
  return true;
}
function isViewClaimToken(value) {
  return isRecord(value) && hasSafeOwnKeys(value) && Number.isSafeInteger(value.generation) && value.generation > 0 && isValidId(value.claimId);
}
function hasName(value) {
  return isRecord(value) && hasSafeOwnKeys(value) && isValidName(value.name);
}
function validatePayload(type, payload) {
  switch (type) {
    case "identity:probe":
    case "identity:claim":
      return isRecord(payload) && hasSafeOwnKeys(payload) && isFiniteTimestamp(payload.startedAt);
    case "tab:announce":
      return isRecord(payload) && hasSafeOwnKeys(payload) && typeof payload.visible === "boolean" && (payload.view === null || isValidName(payload.view)) && isFiniteTimestamp(payload.createdAt);
    case "tab:heartbeat":
    case "tab:leave":
      return payload === null;
    case "state:set":
      return isRecord(payload) && hasSafeOwnKeys(payload) && ("operation" in payload && isStateOperation(payload.operation) && payload.operation.kind === "set" || isValidStateKey(payload.key) && isStateEntry(payload.entry));
    case "state:delete":
      return isRecord(payload) && hasSafeOwnKeys(payload) && ("operation" in payload && isStateOperation(payload.operation) && payload.operation.kind === "delete" || isValidStateKey(payload.key));
    case "state:batch":
      return isRecord(payload) && hasSafeOwnKeys(payload) && isStateBatch(payload.operations);
    case "state:sync-request":
      return payload === null || isRecord(payload) && hasSafeOwnKeys(payload) && isValidId(payload.requestId) && isValidId(payload.requesterInstanceId) && Number.isSafeInteger(payload.requesterGeneration) && payload.requesterGeneration > 0 && Array.isArray(payload.knownPeers) && payload.knownPeers.length <= 256 && payload.knownPeers.every(isValidId) && new Set(payload.knownPeers).size === payload.knownPeers.length && Number.isSafeInteger(payload.protocolRevision) && payload.protocolRevision >= 0;
    case "state:sync":
      return isRecord(payload) && hasSafeOwnKeys(payload) && isStateRecord(payload.state) && (!("requestId" in payload) || isValidId(payload.requestId) && isValidId(payload.requesterInstanceId) && Number.isSafeInteger(payload.requesterGeneration) && payload.requesterGeneration > 0 && isValidId(payload.responderId) && isValidId(payload.responderInstanceId) && (payload.responderState === "initializing" || payload.responderState === "ready") && payload.complete === true);
    case "view:claim":
      return hasName(payload);
    case "view:claimed":
      return isRecord(payload) && hasName(payload) && isValidId(payload.tabId) && (payload.instanceId === void 0 && payload.token === void 0 || isValidId(payload.instanceId) && isViewClaimToken(payload.token));
    case "view:release":
    case "view:focus":
      return isRecord(payload) && hasName(payload) && (payload.token === void 0 || isViewClaimToken(payload.token)) && (payload.request === void 0 || typeof payload.request === "boolean");
    case "view:conflict":
      return isRecord(payload) && hasName(payload) && isValidId(payload.existingTabId) && isValidId(payload.incomingTabId);
    case "view:intent-claim":
      return isRecord(payload) && hasName(payload) && isValidId(payload.intentId) && isViewClaimToken(payload.token);
    case "view:intent-state":
      return isRecord(payload) && hasName(payload) && isValidId(payload.intentId) && isViewClaimToken(payload.token) && isStateOperationList(payload.operations);
    case "leader:query":
      return payload === null;
    case "leader:change":
      return isRecord(payload) && hasSafeOwnKeys(payload) && isValidId(payload.tabId) && (payload.generation === void 0 && payload.instanceId === void 0 || Number.isSafeInteger(payload.generation) && payload.generation > 0 && isValidId(payload.instanceId));
    case "protocol:reject":
      return isRecord(payload) && hasSafeOwnKeys(payload) && parseVersion(payload.local) !== null && parseVersion(payload.remote) !== null && payload.recovery === "Save work and reload all application tabs.";
  }
}
function validateInboundMessage(data) {
  try {
    if (!isRecord(data) || !hasSafeOwnKeys(data) || !structuralBudgetIsValid(data)) {
      return { kind: "invalid" };
    }
    const protocol = parseVersion(data.protocol);
    const from = parseIdentity(data.from);
    const to = data.to === void 0 ? void 0 : parseTarget(data.to);
    if (!protocol || !from || data.to !== void 0 && !to || !isValidId(data.id) || typeof data.type !== "string" || !isFiniteTimestamp(data.sentAt) || !Object.hasOwn(data, "payload")) {
      return { kind: "invalid" };
    }
    if (!protocolRangesOverlap(protocol)) {
      return {
        kind: "incompatible",
        peer: from,
        remote: protocol,
        ...to ? { to } : {},
        type: data.type
      };
    }
    if (!MESSAGE_TYPES.has(data.type)) return { kind: "unknown", type: data.type };
    const type = data.type;
    if (!validatePayload(type, data.payload)) return { kind: "invalid" };
    return {
      kind: "valid",
      message: {
        protocol,
        type,
        id: data.id,
        from,
        ...to ? { to } : {},
        sentAt: data.sentAt,
        payload: data.payload
      }
    };
  } catch {
    return { kind: "invalid" };
  }
}
function validateStoredPresence(value) {
  if (!isRecord(value) || !hasSafeOwnKeys(value) || !isFiniteTimestamp(value.lastSeen) || !isFiniteTimestamp(value.createdAt) || typeof value.visible !== "boolean" || !(value.view === null || isValidName(value.view))) {
    return null;
  }
  return {
    lastSeen: value.lastSeen,
    createdAt: value.createdAt,
    visible: value.visible,
    view: value.view
  };
}
function validateStoredViewRegistryEntry(value) {
  if (!isRecord(value) || !hasSafeOwnKeys(value) || !isValidId(value.tabId) || !isValidId(value.instanceId) || !isFiniteTimestamp(value.claimedAt) || !isViewClaimToken(value.token)) {
    return null;
  }
  return {
    tabId: value.tabId,
    instanceId: value.instanceId,
    claimedAt: value.claimedAt,
    token: value.token
  };
}
function validateStoredOpenIntent(value) {
  if (!isRecord(value) || !hasSafeOwnKeys(value) || Object.keys(value).length !== 6 || !isValidId(value.intentId) || !isValidName(value.view) || !isRecord(value.requester) || !hasSafeOwnKeys(value.requester) || Object.keys(value.requester).length !== 2 || !isValidId(value.requester.tabId) || !isValidId(value.requester.instanceId) || !Array.isArray(value.syncKeys) || value.syncKeys.length > MAX_STATE_KEYS || !value.syncKeys.every(isValidStateKey) || new Set(value.syncKeys).size !== value.syncKeys.length || !isFiniteTimestamp(value.createdAt) || !isFiniteTimestamp(value.expiresAt) || value.expiresAt < value.createdAt) {
    return null;
  }
  return {
    intentId: value.intentId,
    view: value.view,
    requester: { tabId: value.requester.tabId, instanceId: value.requester.instanceId },
    syncKeys: [...value.syncKeys],
    createdAt: value.createdAt,
    expiresAt: value.expiresAt
  };
}
function getTabId() {
  const existing = storageGet(sessionStorage, "sessionStorage", "tabula:tab-id");
  if (isValidId(existing)) return existing;
  const id = crypto.randomUUID();
  storageSet(sessionStorage, "sessionStorage", "tabula:tab-id", id);
  return id;
}
function replaceTabId(id) {
  storageSet(sessionStorage, "sessionStorage", "tabula:tab-id", id);
}
var Dedup = class {
  seen = /* @__PURE__ */ new Map();
  limit;
  ttlMs;
  now;
  constructor(limit = 2048, ttlMs = 5 * 6e4, now = Date.now) {
    this.limit = limit;
    this.ttlMs = ttlMs;
    this.now = now;
  }
  isDuplicate(id) {
    const now = this.now();
    const previous = this.seen.get(id);
    if (previous !== void 0 && now - previous <= this.ttlMs) return true;
    if (previous !== void 0) this.seen.delete(id);
    this.prune(now);
    this.seen.set(id, now);
    while (this.seen.size > this.limit) {
      const oldest = this.seen.keys().next().value;
      if (oldest === void 0) break;
      this.seen.delete(oldest);
    }
    return false;
  }
  get size() {
    return this.seen.size;
  }
  prune(now) {
    for (const [id, seenAt] of this.seen) {
      if (now - seenAt <= this.ttlMs) break;
      this.seen.delete(id);
    }
  }
};
var Channel = class {
  bc;
  handlers = /* @__PURE__ */ new Set();
  dedup = new Dedup();
  identity;
  incompatibilities = /* @__PURE__ */ new Map();
  incompatibilityHandlers = /* @__PURE__ */ new Set();
  warnedAtCapacity = false;
  closed = false;
  constructor(namespace, tabId, instanceId = crypto.randomUUID()) {
    if (typeof BroadcastChannel === "undefined") {
      throw new Error(
        "Tabula requires BroadcastChannel. Supported in all modern browsers. For Node.js testing, use @thinkly/tabula-js/testing."
      );
    }
    this.bc = new BroadcastChannel(`tabula:${namespace}`);
    this.identity = { tabId, instanceId };
    this.bc.onmessage = (e) => {
      const result = validateInboundMessage(e.data);
      if (result.kind === "invalid" || result.kind === "unknown") return;
      if (result.kind === "incompatible") {
        if (!this.matchesTarget(result.to)) return;
        if (result.peer.tabId === this.identity.tabId && result.peer.instanceId === this.identity.instanceId) {
          return;
        }
        const firstReport = this.reportIncompatible(result.peer, result.remote);
        if (firstReport && result.type !== "protocol:reject") {
          this.send(
            "protocol:reject",
            {
              local: LOCAL_PROTOCOL,
              remote: result.remote,
              recovery: "Save work and reload all application tabs."
            },
            result.peer
          );
        }
        return;
      }
      const msg = result.message;
      if (!this.matchesTarget(msg.to)) return;
      if (msg.from.tabId === this.identity.tabId && msg.from.instanceId === this.identity.instanceId) {
        return;
      }
      if (msg.type === "protocol:reject") return;
      if (this.dedup.isDuplicate(msg.id)) return;
      for (const h of this.handlers) h(msg);
    };
  }
  send(type, payload, to) {
    const msg = {
      protocol: LOCAL_PROTOCOL,
      type,
      from: this.identity,
      ...to ? { to: typeof to === "string" ? { tabId: to } : to } : {},
      payload,
      id: nextMessageId(this.identity.instanceId),
      sentAt: Date.now()
    };
    if (!this.closed) this.bc.postMessage(msg);
    return msg;
  }
  getIdentity() {
    return { ...this.identity };
  }
  replaceTabId(tabId) {
    this.identity = { ...this.identity, tabId };
  }
  onMessage(handler) {
    this.handlers.add(handler);
    return () => this.handlers.delete(handler);
  }
  onProtocolIncompatible(handler) {
    this.incompatibilityHandlers.add(handler);
    return () => this.incompatibilityHandlers.delete(handler);
  }
  close() {
    this.closed = true;
    this.handlers.clear();
    this.incompatibilityHandlers.clear();
    this.bc.close();
  }
  matchesTarget(target) {
    return !target || target.tabId === this.identity.tabId && (target.instanceId === void 0 || target.instanceId === this.identity.instanceId);
  }
  reportIncompatible(peer, remote) {
    const key = `${peer.instanceId}\0${remote.major}\0${remote.minRevision}\0${remote.revision}`;
    if (this.incompatibilities.has(key)) return false;
    if (this.incompatibilities.size >= 128) {
      if (!this.warnedAtCapacity) {
        this.warnedAtCapacity = true;
        console.warn("Tabula protocol incompatibility reporting reached its 128-peer limit.");
      }
      return false;
    }
    this.incompatibilities.set(key, Date.now());
    const event = {
      peer,
      local: LOCAL_PROTOCOL,
      remote,
      recovery: "Save work and reload all application tabs."
    };
    for (const handler of this.incompatibilityHandlers) handler(event);
    return true;
  }
};
var Registry = class {
  prefix;
  handler = null;
  listeners = /* @__PURE__ */ new Set();
  knownViews = /* @__PURE__ */ new Set();
  scannedOnce = false;
  warnedCorruption = false;
  constructor(namespace) {
    this.prefix = `tabula:${namespace}:view:`;
  }
  /** Scan localStorage once to seed the knownViews set */
  ensureScanned() {
    if (this.scannedOnce) return;
    this.scannedOnce = true;
    try {
      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (key?.startsWith(this.prefix)) {
          const view = key.slice(this.prefix.length);
          if (isValidName(view)) this.knownViews.add(view);
        }
      }
    } catch (cause) {
      throw new StorageOperationError("localStorage", "read", cause);
    }
  }
  get(view) {
    if (!isValidName(view)) return null;
    const key = this.prefix + view;
    const raw = storageGet(localStorage, "localStorage", key);
    if (!raw) return null;
    try {
      const entry = validateStoredViewRegistryEntry(JSON.parse(raw));
      if (entry) return entry;
    } catch {
    }
    this.quarantine(key);
    return null;
  }
  set(view, entry) {
    storageSet(localStorage, "localStorage", this.prefix + view, JSON.stringify(entry));
    this.knownViews.add(view);
  }
  delete(view) {
    storageRemove(localStorage, "localStorage", this.prefix + view);
    this.knownViews.delete(view);
  }
  list() {
    this.ensureScanned();
    const out = /* @__PURE__ */ Object.create(null);
    for (const view of this.knownViews) {
      const entry = this.get(view);
      if (entry) {
        out[view] = entry;
      } else {
        this.knownViews.delete(view);
      }
    }
    return out;
  }
  startListening() {
    if (this.handler) return;
    this.handler = (e) => {
      if (!e.key?.startsWith(this.prefix)) return;
      const view = e.key.slice(this.prefix.length);
      if (!isValidName(view)) return;
      let entry = null;
      if (e.newValue) {
        try {
          entry = validateStoredViewRegistryEntry(JSON.parse(e.newValue));
        } catch {
        }
        if (!entry) return;
        this.knownViews.add(view);
      } else {
        this.knownViews.delete(view);
      }
      for (const l of this.listeners) l(view, entry);
    };
    window.addEventListener("storage", this.handler);
  }
  onChange(listener) {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }
  stopListening() {
    if (this.handler) {
      window.removeEventListener("storage", this.handler);
      this.handler = null;
    }
    this.listeners.clear();
  }
  quarantine(key) {
    try {
      storageRemove(localStorage, "localStorage", key);
    } catch {
    }
    if (!this.warnedCorruption) {
      this.warnedCorruption = true;
      console.warn("Tabula removed a corrupt view-registry projection from localStorage.");
    }
  }
};
var Presence = class {
  tabId;
  tabMap = /* @__PURE__ */ new Map();
  channel;
  heartbeatMs;
  timeoutMs;
  tickTimer = null;
  onJoin;
  onLeave;
  currentView = null;
  visibilityHandler = null;
  createdAt;
  presencePrefix;
  warnedAtCapacity = false;
  started = false;
  warnedStorage = false;
  constructor(channel, tabId, heartbeatMs, timeoutMs, onJoin, onLeave, namespace) {
    this.channel = channel;
    this.tabId = tabId;
    this.heartbeatMs = heartbeatMs;
    this.timeoutMs = timeoutMs;
    this.onJoin = onJoin;
    this.onLeave = onLeave;
    this.createdAt = Date.now();
    this.presencePrefix = `tabula:${namespace}:tab:`;
    const self = {
      id: tabId,
      view: null,
      visible: typeof document !== "undefined" ? document.visibilityState === "visible" : true,
      firstSeenAt: this.createdAt,
      lastSeenAt: this.createdAt
    };
    this.tabMap.set(tabId, self);
  }
  start() {
    if (this.started) return;
    this.started = true;
    this.announce();
    this.tickTimer = setInterval(() => {
      this.updateSelf();
      this.writePresence();
      this.channel.send("tab:heartbeat", null);
      this.prune();
    }, this.heartbeatMs);
    if (typeof document !== "undefined") {
      this.visibilityHandler = () => {
        this.updateSelf();
        this.writePresence();
        if (document.visibilityState === "visible") {
          this.announce();
        }
      };
      document.addEventListener("visibilitychange", this.visibilityHandler);
    }
  }
  announce() {
    this.writePresence();
    const payload = {
      visible: this.getSelf().visible,
      view: this.currentView,
      createdAt: this.createdAt
    };
    this.channel.send("tab:announce", payload);
  }
  handleMessage(msg) {
    if (msg.type === "tab:announce") {
      const payload = msg.payload;
      const senderTabId = msg.from.tabId;
      const existing = this.tabMap.get(senderTabId);
      if (!existing && this.tabMap.size >= MAX_PRESENCE_PEERS) {
        if (!this.warnedAtCapacity) {
          this.warnedAtCapacity = true;
          console.warn("Tabula presence reached its 256-peer limit; new peers are ignored.");
        }
        return;
      }
      const tab = {
        id: senderTabId,
        view: payload.view,
        visible: payload.visible,
        firstSeenAt: existing?.firstSeenAt ?? payload.createdAt ?? Date.now(),
        lastSeenAt: Date.now()
      };
      this.tabMap.set(senderTabId, tab);
      if (!existing) this.onJoin(tab);
      if (!existing) this.announce();
    } else if (msg.type === "tab:heartbeat") {
      const existing = this.tabMap.get(msg.from.tabId);
      if (existing) {
        existing.lastSeenAt = Date.now();
      }
    } else if (msg.type === "tab:leave") {
      const senderTabId = msg.from.tabId;
      const tab = this.tabMap.get(senderTabId);
      if (tab) {
        this.tabMap.delete(senderTabId);
        this.removePresenceEntry(senderTabId);
        this.onLeave(tab);
      }
    }
  }
  setView(view) {
    this.currentView = view;
    const self = this.tabMap.get(this.tabId);
    if (self) self.view = view;
    this.writePresence();
  }
  getSelf() {
    return this.tabMap.get(this.tabId);
  }
  getTab(id) {
    return this.tabMap.get(id);
  }
  getAllTabs() {
    return Array.from(this.tabMap.values());
  }
  discoverStoredPeers() {
    const now = Date.now();
    try {
      for (let index = 0; index < localStorage.length; index++) {
        const key = localStorage.key(index);
        if (!key?.startsWith(this.presencePrefix)) continue;
        const tabId = key.slice(this.presencePrefix.length);
        if (tabId === this.tabId || !isValidId(tabId) || this.tabMap.has(tabId)) continue;
        const raw = localStorage.getItem(key);
        if (!raw) continue;
        let entry;
        try {
          entry = validateStoredPresence(JSON.parse(raw));
        } catch {
          continue;
        }
        if (!entry || now - entry.lastSeen > this.timeoutMs * 3) continue;
        if (this.tabMap.size >= MAX_PRESENCE_PEERS) {
          if (!this.warnedAtCapacity) {
            this.warnedAtCapacity = true;
            console.warn("Tabula presence reached its 256-peer limit; new peers are ignored.");
          }
          return;
        }
        const tab = {
          id: tabId,
          view: entry.view ?? null,
          visible: entry.visible ?? true,
          firstSeenAt: entry.createdAt,
          lastSeenAt: entry.lastSeen
        };
        this.tabMap.set(tabId, tab);
        this.onJoin(tab);
      }
    } catch (cause) {
      throw new StorageOperationError("localStorage", "read", cause);
    }
  }
  isAlive(tabId) {
    return this.tabMap.has(tabId);
  }
  broadcastLeave() {
    this.channel.send("tab:leave", null);
    this.removePresenceEntry(this.tabId);
  }
  stop() {
    if (this.tickTimer) clearInterval(this.tickTimer);
    if (this.visibilityHandler && typeof document !== "undefined") {
      document.removeEventListener("visibilitychange", this.visibilityHandler);
    }
    this.tickTimer = null;
    this.visibilityHandler = null;
    this.started = false;
  }
  reidentify(tabId) {
    const oldTabId = this.tabId;
    const self = this.getSelf();
    this.removePresenceEntry(oldTabId);
    this.tabMap.delete(oldTabId);
    this.tabId = tabId;
    self.id = tabId;
    self.firstSeenAt = Date.now();
    self.lastSeenAt = self.firstSeenAt;
    self.view = null;
    this.currentView = null;
    this.tabMap.set(tabId, self);
    this.writePresence();
  }
  updateSelf() {
    const self = this.tabMap.get(this.tabId);
    if (self) {
      self.visible = typeof document !== "undefined" ? document.visibilityState === "visible" : true;
      self.lastSeenAt = Date.now();
    }
  }
  /** Write this tab's presence to localStorage (not throttled by Chrome). */
  writePresence() {
    try {
      storageSet(
        localStorage,
        "localStorage",
        this.presencePrefix + this.tabId,
        JSON.stringify({
          lastSeen: Date.now(),
          createdAt: this.createdAt,
          visible: this.getSelf().visible,
          view: this.currentView
        })
      );
    } catch (error) {
      this.warnStorage(error);
    }
  }
  removePresenceEntry(tabId) {
    try {
      storageRemove(localStorage, "localStorage", this.presencePrefix + tabId);
    } catch (error) {
      this.warnStorage(error);
    }
  }
  warnStorage(error) {
    if (this.warnedStorage) return;
    this.warnedStorage = true;
    console.warn("Tabula presence could not update its localStorage projection.", error);
  }
  prune() {
    const now = Date.now();
    for (const [id, tab] of this.tabMap) {
      if (id === this.tabId) continue;
      let lastActivity = tab.lastSeenAt;
      try {
        const raw = localStorage.getItem(this.presencePrefix + id);
        if (raw) {
          const entry = validateStoredPresence(JSON.parse(raw));
          if (!entry) continue;
          if (entry.lastSeen > lastActivity) {
            lastActivity = entry.lastSeen;
            tab.lastSeenAt = entry.lastSeen;
            if (entry.visible !== void 0) tab.visible = entry.visible;
            if (entry.view !== void 0) tab.view = entry.view;
          }
        } else {
          if (now - lastActivity > this.timeoutMs) {
            this.tabMap.delete(id);
            this.onLeave(tab);
          }
          continue;
        }
      } catch {
      }
      if (now - lastActivity > this.timeoutMs * 3) {
        this.tabMap.delete(id);
        this.removePresenceEntry(id);
        this.onLeave(tab);
      }
    }
  }
};
var Leader = class {
  lockName;
  generationKey;
  channel;
  presence;
  projection = null;
  onChange;
  onAuthorityChange;
  onError;
  active = false;
  held = false;
  runVersion = 0;
  acquisitionAbort = null;
  releaseHeld = null;
  constructor(namespace, channel, presence, onChange, onAuthorityChange = () => void 0, onError = () => void 0) {
    const encodedNamespace = encodeURIComponent(namespace);
    this.lockName = `tabula-js:v1:${encodedNamespace}:leader`;
    this.generationKey = `tabula:${encodedNamespace}:leader-generation`;
    this.channel = channel;
    this.presence = presence;
    this.onChange = onChange;
    this.onAuthorityChange = onAuthorityChange;
    this.onError = onError;
  }
  start() {
    if (this.active) return;
    this.active = true;
    const runVersion = ++this.runVersion;
    const controller = new AbortController();
    this.acquisitionAbort = controller;
    this.channel.send("leader:query", null);
    void navigator.locks.request(this.lockName, { mode: "exclusive", signal: controller.signal }, async () => {
      if (!this.active || runVersion !== this.runVersion) return;
      const generation = this.incrementGeneration();
      const identity = this.channel.getIdentity();
      const projection = { generation, tabId: identity.tabId, instanceId: identity.instanceId };
      this.held = true;
      try {
        this.acceptProjection(projection);
        this.announce(projection);
        this.onAuthorityChange(true);
        await new Promise((resolve) => {
          this.releaseHeld = resolve;
        });
      } finally {
        this.releaseHeld = null;
        if (this.held) {
          this.held = false;
          this.onAuthorityChange(false);
        }
      }
    }).catch((error) => {
      if (runVersion !== this.runVersion || controller.signal.aborted) return;
      this.onError(error);
    });
  }
  getLeaderId() {
    return this.projection?.tabId ?? null;
  }
  isLeader() {
    return this.held;
  }
  handleMessage(msg) {
    if (msg.type === "leader:query") {
      if (this.held && this.projection) this.announce(this.projection, msg.from);
      return;
    }
    if (msg.type !== "leader:change") return;
    const payload = msg.payload;
    if (typeof payload.generation !== "number" || typeof payload.tabId !== "string" || typeof payload.instanceId !== "string") {
      return;
    }
    this.acceptProjection({
      generation: payload.generation,
      tabId: payload.tabId,
      instanceId: payload.instanceId
    });
  }
  refreshProjection() {
    if (this.projection && this.presence.getTab(this.projection.tabId)) {
      this.onChange(this.projection.tabId);
    }
  }
  stop() {
    if (!this.active && !this.held) return;
    this.active = false;
    this.runVersion++;
    this.acquisitionAbort?.abort();
    this.acquisitionAbort = null;
    if (this.held) {
      this.held = false;
      try {
        this.onAuthorityChange(false);
      } finally {
        this.releaseHeld?.();
      }
      return;
    }
    this.releaseHeld?.();
  }
  reset() {
    this.stop();
    this.projection = null;
  }
  incrementGeneration() {
    const raw = storageGet(localStorage, "localStorage", this.generationKey);
    let current = 0;
    if (raw !== null) {
      if (!/^(0|[1-9]\d*)$/.test(raw)) {
        throw new StorageCorruptionError(this.generationKey);
      }
      current = Number(raw);
      if (!Number.isSafeInteger(current) || current < 0 || current >= Number.MAX_SAFE_INTEGER) {
        throw new StorageCorruptionError(this.generationKey);
      }
    }
    const next = current + 1;
    storageSet(localStorage, "localStorage", this.generationKey, String(next));
    return next;
  }
  announce(projection, to) {
    this.channel.send("leader:change", projection, to);
  }
  acceptProjection(incoming) {
    const current = this.projection;
    if (current) {
      if (incoming.generation < current.generation) return;
      if (incoming.generation === current.generation && (incoming.tabId !== current.tabId || incoming.instanceId !== current.instanceId)) {
        return;
      }
      if (incoming.generation === current.generation && incoming.tabId === current.tabId && incoming.instanceId === current.instanceId) {
        return;
      }
    }
    this.projection = incoming;
    this.refreshProjection();
  }
};
var State = class {
  entries = /* @__PURE__ */ new Map();
  keyListeners = /* @__PURE__ */ new Map();
  wildcardListeners = /* @__PURE__ */ new Set();
  channel;
  wallTime = 0;
  logical = 0;
  constructor(channel, _tabId) {
    this.channel = channel;
  }
  set(key, value) {
    this.assertKey(key);
    this.ensureCapacity([key]);
    const cloned = this.cloneValue(value);
    const operation = this.createOperation(key, "set", cloned);
    if (!structuralBudgetIsValid({ operation })) {
      throw new TypeError("State operation exceeds Tabula message safety limits.");
    }
    this.channel.send("state:set", { operation });
    this.applyOperations([operation]);
  }
  get(key) {
    const operation = this.entries.get(key);
    return operation?.kind === "set" ? operation.value : void 0;
  }
  delete(key) {
    this.assertKey(key);
    this.ensureCapacity([key]);
    const operation = this.createOperation(key, "delete");
    this.channel.send("state:delete", { operation });
    this.applyOperations([operation]);
  }
  onKey(key, cb) {
    let set = this.keyListeners.get(key);
    if (!set) {
      set = /* @__PURE__ */ new Set();
      this.keyListeners.set(key, set);
    }
    const wrapped = cb;
    set.add(wrapped);
    return () => set.delete(wrapped);
  }
  onWildcard(cb) {
    this.wildcardListeners.add(cb);
    return () => this.wildcardListeners.delete(cb);
  }
  handleMessage(msg) {
    if (msg.type === "state:set") {
      const operation = this.operationFromSetMessage(msg);
      if (operation) this.acceptRemoteOperations([operation], msg.from, true);
    } else if (msg.type === "state:delete") {
      const operation = this.operationFromDeleteMessage(msg);
      if (operation) this.acceptRemoteOperations([operation], msg.from, true);
    } else if (msg.type === "state:batch") {
      const { operations } = msg.payload;
      this.acceptRemoteOperations(operations, msg.from, true);
    } else if (msg.type === "state:sync-request" && msg.payload === null) {
      const snapshot = /* @__PURE__ */ Object.create(null);
      for (const [k, v] of this.entries) snapshot[k] = v;
      this.channel.send("state:sync", { state: snapshot }, msg.from);
    } else if (msg.type === "state:sync" && typeof msg.payload === "object" && msg.payload !== null && !("requestId" in msg.payload)) {
      this.mergeSyncMessage(msg);
    }
  }
  mergeSyncMessage(msg) {
    const { state: snapshot } = msg.payload;
    const operations = Object.entries(snapshot).map(
      ([key, entry]) => this.operationFromSnapshot(key, entry, msg)
    );
    this.acceptRemoteOperations(
      operations.filter((operation) => operation !== null),
      msg.from,
      false
    );
  }
  requestSync(payload) {
    this.channel.send("state:sync-request", payload ?? null);
  }
  reidentify(_tabId) {
  }
  stop() {
    this.keyListeners.clear();
    this.wildcardListeners.clear();
  }
  getSnapshot() {
    const out = /* @__PURE__ */ Object.create(null);
    for (const [k, v] of this.entries) out[k] = v;
    return out;
  }
  keys() {
    return [...this.entries].filter(([, operation]) => operation.kind === "set").map(([key]) => key);
  }
  allEntries() {
    return [...this.entries].filter(([, operation]) => operation.kind === "set").map(([key, operation]) => [
      key,
      operation.value
    ]);
  }
  setAll(entries) {
    const normalized = Object.entries(entries).sort(
      ([left], [right]) => this.compareStrings(left, right)
    );
    if (normalized.length === 0) return;
    for (const [key] of normalized) this.assertKey(key);
    this.ensureCapacity(normalized.map(([key]) => key));
    const cloned = normalized.map(([key, value]) => [key, this.cloneValue(value)]);
    const operations = cloned.map(([key, value]) => this.createOperation(key, "set", value));
    if (!structuralBudgetIsValid({ operations })) {
      throw new TypeError("State batch exceeds Tabula message safety limits.");
    }
    this.channel.send("state:batch", { operations });
    this.applyOperations(operations);
  }
  getOperationsForSync(keys) {
    const operations = [];
    for (const key of [...new Set(keys)].sort((left, right) => this.compareStrings(left, right))) {
      const operation = this.entries.get(key);
      if (operation) operations.push(operation);
    }
    return operations;
  }
  mergeIntentOperations(operations, sender) {
    this.acceptRemoteOperations(operations, sender, false);
  }
  assertKey(key) {
    if (!isValidStateKey(key)) {
      throw new TypeError("State keys must be non-empty, safe strings of at most 256 UTF-8 bytes.");
    }
  }
  ensureCapacity(keys) {
    const additions = new Set(keys.filter((key) => !this.entries.has(key)));
    if (this.entries.size + additions.size > MAX_STATE_KEYS) {
      throw new RangeError(`Tabula state is limited to ${MAX_STATE_KEYS} observed keys.`);
    }
  }
  cloneValue(value) {
    if (value === void 0) {
      throw new TypeError("state.set() does not accept undefined; use state.delete() for absence.");
    }
    if (!structuralBudgetIsValid(value)) {
      throw new TypeError("State value exceeds Tabula structured-clone safety limits.");
    }
    return structuredClone(value);
  }
  createOperation(key, kind, value) {
    const identity = this.channel.getIdentity();
    const base = {
      key,
      clock: this.tick(),
      tabId: identity.tabId,
      instanceId: identity.instanceId,
      operationId: crypto.randomUUID()
    };
    return kind === "set" ? { ...base, kind, value } : { ...base, kind };
  }
  tick(remote) {
    const now = Date.now();
    const previousWall = this.wallTime;
    const previousLogical = this.logical;
    const remoteWall = remote?.wallTime ?? -1;
    const wallTime = Math.max(now, previousWall, remoteWall);
    if (remote && wallTime === previousWall && wallTime === remoteWall) {
      this.logical = Math.max(previousLogical, remote.logical) + 1;
    } else if (wallTime === previousWall) {
      this.logical = previousLogical + 1;
    } else if (remote && wallTime === remoteWall) {
      this.logical = remote.logical + 1;
    } else {
      this.logical = 0;
    }
    this.wallTime = wallTime;
    return { wallTime, logical: this.logical };
  }
  acceptRemoteOperations(operations, sender, requireSenderMatch) {
    const accepted = [];
    const newKeys = /* @__PURE__ */ new Set();
    for (const operation of operations) {
      if (requireSenderMatch && (operation.tabId !== sender.tabId || operation.instanceId !== sender.instanceId)) {
        continue;
      }
      this.tick(operation.clock);
      if (!this.entries.has(operation.key) && !newKeys.has(operation.key)) {
        if (this.entries.size + newKeys.size >= MAX_STATE_KEYS) continue;
        newKeys.add(operation.key);
      }
      const existing = this.entries.get(operation.key);
      if (!existing || this.compareOperations(operation, existing) > 0) accepted.push(operation);
    }
    this.applyOperations(accepted);
  }
  applyOperations(operations) {
    const winners = [...operations].sort((left, right) => this.compareStrings(left.key, right.key)).filter((operation) => {
      const existing = this.entries.get(operation.key);
      return !existing || this.compareOperations(operation, existing) > 0;
    });
    for (const operation of winners) this.entries.set(operation.key, operation);
    for (const operation of winners) this.notifyKey(operation.key, this.operationValue(operation));
    for (const operation of winners)
      this.notifyWildcard(operation.key, this.operationValue(operation));
  }
  compareOperations(left, right) {
    for (const [leftValue, rightValue] of [
      [left.clock.wallTime, right.clock.wallTime],
      [left.clock.logical, right.clock.logical]
    ]) {
      if (leftValue !== rightValue) return leftValue < rightValue ? -1 : 1;
    }
    for (const [leftValue, rightValue] of [
      [left.tabId, right.tabId],
      [left.instanceId, right.instanceId],
      [left.operationId, right.operationId]
    ]) {
      const comparison = this.compareStrings(leftValue, rightValue);
      if (comparison !== 0) return comparison;
    }
    return 0;
  }
  compareStrings(left, right) {
    return left === right ? 0 : left < right ? -1 : 1;
  }
  operationValue(operation) {
    return operation.kind === "set" ? operation.value : void 0;
  }
  notifyKey(key, value) {
    const listeners = this.keyListeners.get(key);
    if (listeners) for (const cb of listeners) cb(value);
  }
  notifyWildcard(key, value) {
    for (const cb of this.wildcardListeners) cb(key, value);
  }
  operationFromSetMessage(msg) {
    const payload = msg.payload;
    if (payload.operation) return payload.operation;
    if (!payload.key || !payload.entry) return null;
    return {
      kind: "set",
      key: payload.key,
      value: payload.entry.value,
      clock: { wallTime: payload.entry.ts, logical: payload.entry.version },
      tabId: payload.entry.tabId,
      instanceId: msg.from.instanceId,
      operationId: `legacy:${msg.id}`
    };
  }
  operationFromDeleteMessage(msg) {
    const payload = msg.payload;
    if (payload.operation) return payload.operation;
    if (!payload.key) return null;
    return {
      kind: "delete",
      key: payload.key,
      clock: { wallTime: msg.sentAt, logical: 0 },
      tabId: msg.from.tabId,
      instanceId: msg.from.instanceId,
      operationId: `legacy:${msg.id}`
    };
  }
  operationFromSnapshot(key, entry, msg) {
    if ("kind" in entry) return entry.key === key ? entry : null;
    return {
      kind: "set",
      key,
      value: entry.value,
      clock: { wallTime: entry.ts, logical: entry.version },
      tabId: entry.tabId,
      instanceId: msg.from.instanceId,
      operationId: `legacy:${msg.id}:${key}`
    };
  }
};
var Views = class {
  registry;
  channel;
  presence;
  lockPrefix;
  generationPrefix;
  rememberedViewKey;
  pendingOpenPrefix;
  onClaimed;
  onVacant;
  onConflict;
  onIntentClaim;
  applyIntentState;
  onError;
  projections = /* @__PURE__ */ new Map();
  activeClaim = null;
  claimInFlight = null;
  incomingIntents = /* @__PURE__ */ new Map();
  visibilityHandler = null;
  registryUnsubscribe = null;
  started = false;
  warnedIntentCorruption = false;
  constructor(namespace, registry, channel, presence, onClaimed, onVacant, onConflict, onIntentClaim, applyIntentState, onError = () => void 0) {
    const encodedNamespace = encodeURIComponent(namespace);
    this.registry = registry;
    this.channel = channel;
    this.presence = presence;
    this.lockPrefix = `tabula-js:v1:${encodedNamespace}:view:`;
    this.generationPrefix = `tabula:${encodedNamespace}:view-generation:`;
    this.rememberedViewKey = `tabula:${encodedNamespace}:view-name`;
    this.pendingOpenPrefix = `tabula:${namespace}:pending-open:`;
    this.onClaimed = onClaimed;
    this.onVacant = onVacant;
    this.onConflict = onConflict;
    this.onIntentClaim = onIntentClaim;
    this.applyIntentState = applyIntentState;
    this.onError = onError;
  }
  start() {
    if (this.started) return;
    this.started = true;
    this.registryUnsubscribe = this.registry.onChange((viewName, entry) => {
      if (entry) this.acceptRegistryProjection(viewName, entry);
    });
    if (typeof document !== "undefined") {
      this.visibilityHandler = () => {
        if (document.visibilityState === "visible") this.reconcile();
      };
      document.addEventListener("visibilitychange", this.visibilityHandler);
    }
    if (this.activeClaim) {
      this.writeLocalProjection(this.activeClaim);
      this.announceClaim(this.activeClaim);
    }
  }
  loadFromRegistry() {
    for (const [viewName, entry] of Object.entries(this.registry.list())) {
      this.acceptRegistryProjection(viewName, entry);
    }
  }
  validateAgainstPresence() {
    for (const [viewName, projection] of this.projections) {
      if (!this.presence.isAlive(projection.tab.id)) {
        this.verifyVacancy(viewName, projection);
      }
    }
  }
  async claim(viewName) {
    if (!isValidName(viewName)) {
      throw new TypeError("View names must be safe strings of at most 128 bytes.");
    }
    if (this.activeClaim) {
      if (this.activeClaim.name === viewName) {
        return { status: "claimed", authority: this.activeClaim };
      }
      throw new ViewAlreadyClaimedError(this.activeClaim.name);
    }
    if (this.claimInFlight) {
      if (this.claimInFlight.name === viewName) return this.claimInFlight.promise;
      throw new ViewAlreadyClaimedError(this.claimInFlight.name);
    }
    const promise = this.acquire(viewName);
    this.claimInFlight = { name: viewName, promise };
    const clearInFlight = () => {
      if (this.claimInFlight?.promise === promise) this.claimInFlight = null;
    };
    void promise.then(clearInFlight, clearInFlight);
    return promise;
  }
  async restoreRememberedView() {
    const remembered = storageGet(sessionStorage, "sessionStorage", this.rememberedViewKey);
    if (!remembered) return;
    if (!isValidName(remembered)) {
      storageRemove(sessionStorage, "sessionStorage", this.rememberedViewKey);
      return;
    }
    const result = await this.claim(remembered);
    if (result.status === "conflict") {
      storageRemove(sessionStorage, "sessionStorage", this.rememberedViewKey);
    }
  }
  release(viewName, token, forget = true) {
    if (this.activeClaim && this.activeClaim.name === viewName && this.tokensEqual(this.activeClaim.token, token)) {
      this.releaseLocal(forget);
      return;
    }
    const projection = this.projections.get(viewName);
    if (!projection || !this.tokensEqual(projection.token, token)) return;
    this.channel.send(
      "view:release",
      { name: viewName, token, request: true },
      { tabId: projection.tab.id, instanceId: projection.instanceId }
    );
  }
  releaseCurrent(forget = true) {
    if (this.activeClaim) this.releaseLocal(forget);
  }
  handleMessage(msg) {
    if (msg.type === "view:claimed") {
      this.handleClaimedMessage(msg);
    } else if (msg.type === "view:release") {
      this.handleReleaseMessage(msg);
    } else if (msg.type === "view:focus") {
      this.handleFocusMessage(msg);
    } else if (msg.type === "view:intent-claim") {
      this.handleIntentClaimMessage(msg);
    } else if (msg.type === "view:intent-state") {
      this.handleIntentStateMessage(msg);
    }
  }
  get(viewName) {
    return this.projections.get(viewName)?.tab ?? null;
  }
  getAuthority(viewName) {
    const projection = this.projections.get(viewName);
    return projection ? { name: viewName, owner: projection.tab, token: { ...projection.token } } : null;
  }
  listAll() {
    const out = {};
    for (const [name, projection] of this.projections) out[name] = projection.tab;
    return out;
  }
  has(viewName) {
    return this.projections.has(viewName);
  }
  focus(viewName, token) {
    const projection = this.projections.get(viewName);
    if (!projection) return;
    const requestedToken = token ?? projection.token;
    if (!this.tokensEqual(projection.token, requestedToken)) return;
    this.channel.send(
      "view:focus",
      { name: viewName, token: requestedToken },
      { tabId: projection.tab.id, instanceId: projection.instanceId }
    );
  }
  cleanupForTab(tabId) {
    for (const [viewName, projection] of this.projections) {
      if (projection.tab.id === tabId) this.verifyVacancy(viewName, projection);
    }
  }
  sendIntentState(claim, operations) {
    this.channel.send(
      "view:intent-state",
      { intentId: claim.intentId, name: claim.name, token: claim.token, operations },
      claim.claimant
    );
  }
  stop() {
    if (this.visibilityHandler && typeof document !== "undefined") {
      document.removeEventListener("visibilitychange", this.visibilityHandler);
    }
    this.visibilityHandler = null;
    this.registryUnsubscribe?.();
    this.registryUnsubscribe = null;
    for (const intent of this.incomingIntents.values()) clearTimeout(intent.timer);
    this.incomingIntents.clear();
    this.started = false;
  }
  reconcileNow() {
    this.reconcile();
  }
  acquire(viewName) {
    return new Promise((resolve, reject) => {
      let settled = false;
      const settle = (result) => {
        if (settled) return;
        settled = true;
        resolve(result);
      };
      void navigator.locks.request(
        this.lockName(viewName),
        { mode: "exclusive", ifAvailable: true },
        async (lock) => {
          if (!lock) {
            const owner = this.get(viewName);
            if (owner) {
              this.onConflict(
                viewName,
                owner,
                this.presence.getSelf(),
                this.projections.get(viewName)?.token
              );
            }
            settle({ status: "conflict", owner });
            return;
          }
          let authority = null;
          try {
            const identity = this.channel.getIdentity();
            const token = {
              generation: this.incrementGeneration(viewName),
              claimId: crypto.randomUUID()
            };
            this.presence.setView(viewName);
            const owner = this.presence.getSelf();
            let releaseLock = () => void 0;
            const released = new Promise((release) => {
              releaseLock = release;
            });
            authority = { name: viewName, owner, token, releaseLock };
            this.activeClaim = authority;
            this.writeLocalProjection(authority);
            storageSet(sessionStorage, "sessionStorage", this.rememberedViewKey, viewName);
            this.acceptProjection(viewName, {
              tab: owner,
              instanceId: identity.instanceId,
              token
            });
            this.announceClaim(authority);
            this.consumePendingIntent(viewName, token);
            settle({ status: "claimed", authority });
            await released;
          } catch (error) {
            if (authority) this.rollbackLocalClaim(authority);
            if (!settled) {
              settled = true;
              reject(error);
            } else {
              this.onError(error);
            }
          }
        }
      ).catch((error) => {
        if (settled) {
          this.onError(error);
          return;
        }
        settled = true;
        reject(error);
      });
    });
  }
  rollbackLocalClaim(claim) {
    if (!this.activeClaim || !this.tokensEqual(this.activeClaim.token, claim.token)) return;
    this.activeClaim = null;
    try {
      this.removeRegistryProjection(claim.name, claim.token);
    } catch {
    }
    const current = this.projections.get(claim.name);
    if (current && this.tokensEqual(current.token, claim.token)) {
      this.projections.delete(claim.name);
      try {
        this.onVacant(claim.name, claim.token);
      } catch {
      }
    }
    if (this.presence.getSelf().view === claim.name) this.presence.setView(null);
    try {
      storageRemove(sessionStorage, "sessionStorage", this.rememberedViewKey);
    } catch {
    }
    this.channel.send("view:release", { name: claim.name, token: claim.token });
  }
  releaseLocal(forget) {
    const claim = this.activeClaim;
    if (!claim) return;
    this.activeClaim = null;
    this.removeRegistryProjection(claim.name, claim.token);
    const current = this.projections.get(claim.name);
    if (current && this.tokensEqual(current.token, claim.token)) {
      this.projections.delete(claim.name);
      this.onVacant(claim.name, claim.token);
    }
    if (this.presence.getSelf().view === claim.name) this.presence.setView(null);
    if (forget) storageRemove(sessionStorage, "sessionStorage", this.rememberedViewKey);
    this.channel.send("view:release", { name: claim.name, token: claim.token });
    claim.releaseLock();
  }
  handleClaimedMessage(msg) {
    const payload = msg.payload;
    if (payload.instanceId && payload.token) {
      if (payload.tabId !== msg.from.tabId || payload.instanceId !== msg.from.instanceId) return;
      this.acceptProjection(payload.name, {
        tab: this.tabFor(payload.tabId, payload.name),
        instanceId: payload.instanceId,
        token: payload.token
      });
      return;
    }
    const current = this.projections.get(payload.name);
    if (current?.token.generation) return;
    this.acceptProjection(payload.name, {
      tab: this.tabFor(payload.tabId, payload.name),
      instanceId: msg.from.instanceId,
      token: { generation: 0, claimId: `legacy:${msg.id}` }
    });
  }
  handleReleaseMessage(msg) {
    const payload = msg.payload;
    if (!payload.token) {
      const current = this.projections.get(payload.name);
      if (current?.token.generation === 0 && current.tab.id === msg.from.tabId) {
        this.applyVacancy(payload.name, current.token);
      }
      return;
    }
    if (payload.request) {
      if (this.activeClaim?.name === payload.name && this.tokensEqual(this.activeClaim.token, payload.token)) {
        this.releaseLocal(true);
      }
      return;
    }
    this.applyVacancy(payload.name, payload.token);
  }
  handleFocusMessage(msg) {
    const payload = msg.payload;
    if (!this.activeClaim || this.activeClaim.name !== payload.name) return;
    if (!payload.token) {
      if (this.activeClaim.token.generation === 0) window.focus();
      return;
    }
    if (this.tokensEqual(this.activeClaim.token, payload.token)) window.focus();
  }
  handleIntentClaimMessage(msg) {
    const payload = msg.payload;
    const projection = this.projections.get(payload.name);
    if (!projection || projection.tab.id !== msg.from.tabId || projection.instanceId !== msg.from.instanceId || !this.tokensEqual(projection.token, payload.token)) {
      return;
    }
    this.onIntentClaim({ ...payload, claimant: msg.from });
  }
  handleIntentStateMessage(msg) {
    const payload = msg.payload;
    const pending = this.incomingIntents.get(payload.intentId);
    if (!pending || pending.name !== payload.name || !this.tokensEqual(pending.token, payload.token) || pending.requester.tabId !== msg.from.tabId || pending.requester.instanceId !== msg.from.instanceId) {
      return;
    }
    clearTimeout(pending.timer);
    this.incomingIntents.delete(payload.intentId);
    this.applyIntentState(payload.operations, msg.from);
  }
  consumePendingIntent(viewName, token) {
    const key = this.pendingOpenPrefix + viewName;
    const raw = storageGet(localStorage, "localStorage", key);
    if (!raw) return;
    let intent = null;
    try {
      intent = validateStoredOpenIntent(JSON.parse(raw));
    } catch {
    }
    if (!intent || intent.view !== viewName || intent.expiresAt < Date.now()) {
      storageRemove(localStorage, "localStorage", key);
      if (!intent && !this.warnedIntentCorruption) {
        this.warnedIntentCorruption = true;
        console.warn("Tabula removed a corrupt pending-open intent from localStorage.");
      }
      return;
    }
    const acceptedIntent = intent;
    this.removeIntentIfCurrent(key, acceptedIntent.intentId);
    const timer = setTimeout(
      () => {
        this.incomingIntents.delete(acceptedIntent.intentId);
      },
      Math.max(0, acceptedIntent.expiresAt - Date.now())
    );
    this.incomingIntents.set(acceptedIntent.intentId, {
      intentId: acceptedIntent.intentId,
      name: viewName,
      token,
      claimant: this.channel.getIdentity(),
      requester: acceptedIntent.requester,
      timer
    });
    while (this.incomingIntents.size > 16) {
      const oldest = this.incomingIntents.entries().next().value;
      if (!oldest) break;
      clearTimeout(oldest[1].timer);
      this.incomingIntents.delete(oldest[0]);
    }
    this.channel.send(
      "view:intent-claim",
      { intentId: acceptedIntent.intentId, name: viewName, token },
      acceptedIntent.requester
    );
  }
  removeIntentIfCurrent(key, intentId) {
    const current = storageGet(localStorage, "localStorage", key);
    if (!current) return;
    try {
      const parsed = validateStoredOpenIntent(JSON.parse(current));
      if (parsed?.intentId !== intentId) return;
    } catch {
      return;
    }
    storageRemove(localStorage, "localStorage", key);
  }
  acceptRegistryProjection(viewName, entry) {
    this.acceptProjection(viewName, {
      tab: this.tabFor(entry.tabId, viewName),
      instanceId: entry.instanceId,
      token: entry.token
    });
  }
  acceptProjection(viewName, incoming) {
    const current = this.projections.get(viewName);
    if (current) {
      if (incoming.token.generation < current.token.generation) return;
      if (incoming.token.generation === current.token.generation && !this.tokensEqual(incoming.token, current.token)) {
        return;
      }
      if (this.tokensEqual(incoming.token, current.token) && incoming.tab.id === current.tab.id && incoming.instanceId === current.instanceId) {
        return;
      }
    }
    this.projections.set(viewName, incoming);
    this.onClaimed(viewName, incoming.tab, incoming.token);
  }
  applyVacancy(viewName, token) {
    const current = this.projections.get(viewName);
    if (!current || !this.tokensEqual(current.token, token)) return;
    this.projections.delete(viewName);
    this.onVacant(viewName, token);
  }
  verifyVacancy(viewName, expected) {
    void navigator.locks.request(this.lockName(viewName), { mode: "exclusive", ifAvailable: true }, (lock) => {
      if (!lock) return;
      const current = this.projections.get(viewName);
      if (!current || !this.tokensEqual(current.token, expected.token)) return;
      this.removeRegistryProjection(viewName, expected.token);
      this.applyVacancy(viewName, expected.token);
      this.channel.send("view:release", { name: viewName, token: expected.token });
    }).catch(this.onError);
  }
  reconcile() {
    for (const [viewName, entry] of Object.entries(this.registry.list())) {
      this.acceptRegistryProjection(viewName, entry);
    }
    if (this.activeClaim) {
      this.writeLocalProjection(this.activeClaim);
      this.announceClaim(this.activeClaim);
    }
    this.validateAgainstPresence();
  }
  writeLocalProjection(authority) {
    const identity = this.channel.getIdentity();
    this.registry.set(authority.name, {
      tabId: identity.tabId,
      instanceId: identity.instanceId,
      claimedAt: Date.now(),
      token: authority.token
    });
  }
  removeRegistryProjection(viewName, token) {
    const entry = this.registry.get(viewName);
    if (!entry || !this.tokensEqual(entry.token, token)) return;
    this.registry.delete(viewName);
  }
  announceClaim(authority) {
    const identity = this.channel.getIdentity();
    this.channel.send("view:claimed", {
      name: authority.name,
      tabId: identity.tabId,
      instanceId: identity.instanceId,
      token: authority.token
    });
  }
  incrementGeneration(viewName) {
    const key = this.generationPrefix + encodeURIComponent(viewName);
    const raw = storageGet(localStorage, "localStorage", key);
    let current = 0;
    if (raw !== null) {
      if (!/^(0|[1-9]\d*)$/.test(raw)) throw new StorageCorruptionError(key);
      current = Number(raw);
      if (!Number.isSafeInteger(current) || current < 0 || current >= Number.MAX_SAFE_INTEGER) {
        throw new StorageCorruptionError(key);
      }
    }
    const next = current + 1;
    storageSet(localStorage, "localStorage", key, String(next));
    return next;
  }
  tabFor(tabId, viewName) {
    return this.presence.getTab(tabId) ?? {
      id: tabId,
      view: viewName,
      visible: true,
      firstSeenAt: Date.now(),
      lastSeenAt: Date.now()
    };
  }
  lockName(viewName) {
    return this.lockPrefix + encodeURIComponent(viewName);
  }
  tokensEqual(left, right) {
    return left.generation === right.generation && left.claimId === right.claimId;
  }
};
var MAX_SYNC_CORRELATIONS = 16;
var SYNC_RETRY_BASE_MS = 50;
var SYNC_RETRY_MAX_MS = 1e3;
var Coordinator = class {
  namespace;
  channel;
  registry;
  presence;
  leader;
  state;
  views;
  domainsAttached = false;
  tabId;
  instanceId;
  startedAt;
  options;
  lifecycle = "initializing";
  sync = "pending";
  missingPeerIds = /* @__PURE__ */ new Set();
  queue = [];
  readyResolve;
  readyReject;
  readySettled = false;
  readyPromise;
  initAbort = null;
  identityClaims = /* @__PURE__ */ new Map();
  identityRepairRequested = false;
  identityRepairing = false;
  resourceCleanups = /* @__PURE__ */ new Set();
  syncGeneration = 0;
  syncRounds = /* @__PURE__ */ new Map();
  activeSyncRound = null;
  syncProgressWaiters = /* @__PURE__ */ new Set();
  syncRetryTimer = null;
  syncRetryDelay = SYNC_RETRY_BASE_MS;
  preserveViewOnDestroy = false;
  // event system
  eventListeners = /* @__PURE__ */ new Map();
  // leader callbacks
  leaderSetups = [];
  pagehideHandler;
  pageshowHandler;
  constructor(namespace, opts) {
    this.namespace = namespace;
    this.readyPromise = new Promise((resolve, reject) => {
      this.readyResolve = resolve;
      this.readyReject = reject;
    });
    void this.readyPromise.catch(() => void 0);
    this.options = {
      heartbeat: opts.heartbeat ?? 1500,
      timeout: opts.timeout ?? 5e3,
      readyTimeout: opts.readyTimeout ?? 1e3,
      openTimeout: opts.openTimeout ?? 1e4
    };
    const documentIdentity2 = getDocumentIdentity();
    this.instanceId = documentIdentity2.instanceId;
    this.startedAt = documentIdentity2.startedAt;
    this.tabId = getTabId();
    this.channel = new Channel(namespace, this.tabId, this.instanceId);
    this.registry = new Registry(namespace);
    this.channel.onProtocolIncompatible((event) => this.emit("protocol:incompatible", event));
    this.channel.onMessage((msg) => this.handleIdentityMessage(msg));
    this.pagehideHandler = (event) => {
      if (event.persisted) {
        this.suspendForBfcache();
      } else {
        this.preserveViewOnDestroy = true;
        this.destroy();
      }
    };
    this.pageshowHandler = (event) => {
      if (event.persisted) this.resumeFromBfcache();
    };
    window.addEventListener("pagehide", this.pagehideHandler);
    window.addEventListener("pageshow", this.pageshowHandler);
    this.attachDomains();
    this.startInitialization();
  }
  attachDomains() {
    this.presence = new Presence(
      this.channel,
      this.tabId,
      this.options.heartbeat,
      this.options.timeout,
      (tab) => {
        this.emit("tab:join", tab);
        this.leader.refreshProjection();
        this.handleSyncPeerJoin();
      },
      (tab) => {
        this.emit("tab:leave", tab);
        this.views.cleanupForTab(tab.id);
        this.handleSyncPeerLeave();
      },
      this.namespace
    );
    this.leader = new Leader(
      this.namespace,
      this.channel,
      this.presence,
      (leaderId) => {
        const tab = this.presence.getTab(leaderId);
        if (!tab) return;
        this.emit("leader:change", { tab, isMe: leaderId === this.tabId });
      },
      (held) => {
        if (held) this.runLeaderCallbacks();
        else this.stopLeaderCallbacks();
      },
      (error) => this.fail(error)
    );
    this.state = new State(this.channel, this.tabId);
    this.views = new Views(
      this.namespace,
      this.registry,
      this.channel,
      this.presence,
      (name, tab, token) => this.emit("view:claimed", { name, tab, token }),
      (name, token) => this.emit("view:vacant", { name, token }),
      (name, existing, incoming, token) => this.emit("view:conflict", { name, existing, incoming, token }),
      (claim) => this.emit("view:intent-claim", claim),
      (operations, sender) => this.state.mergeIntentOperations(operations, sender),
      (error) => this.fail(error)
    );
    this.channel.onMessage((msg) => {
      if (msg.type === "identity:probe" || msg.type === "identity:claim") return;
      if (msg.from.tabId === this.tabId && msg.from.instanceId !== this.instanceId) return;
      if (this.lifecycle === "bfcache-suspended" && msg.type === "state:sync-request") return;
      this.handleSyncMessage(msg);
      this.presence.handleMessage(msg);
      this.leader.handleMessage(msg);
      this.state.handleMessage(msg);
      this.views.handleMessage(msg);
      if (msg.type === "tab:announce") this.handleSyncPeerActivity();
    });
    this.registry.startListening();
    this.domainsAttached = true;
  }
  startInitialization() {
    this.initAbort?.abort();
    const controller = new AbortController();
    this.initAbort = controller;
    void this.initialize(controller.signal).catch((error) => {
      if (controller.signal.aborted || this.isTerminal()) return;
      this.fail(error);
    });
  }
  async initialize(signal) {
    const deadline = Date.now() + this.options.readyTimeout;
    this.resetSyncHandshake();
    this.syncGeneration++;
    this.setSync("pending", []);
    await this.establishIdentity(deadline, signal);
    this.ensureRunning(signal);
    this.presence.start();
    this.leader.start();
    this.presence.discoverStoredPeers();
    const knownFromRegistry = Object.values(this.registry.list());
    const expectedTabs = new Set(knownFromRegistry.map((e) => e.tabId));
    for (const tab of this.presence.getAllTabs()) expectedTabs.add(tab.id);
    expectedTabs.delete(this.tabId);
    await this.waitForTabs(expectedTabs, this.remainingBudget(deadline, 150), signal);
    this.ensureRunning(signal);
    await this.syncState(deadline, signal);
    this.ensureRunning(signal);
    this.views.loadFromRegistry();
    await this.views.restoreRememberedView();
    this.ensureRunning(signal);
    this.views.validateAgainstPresence();
    this.views.start();
    this.lifecycle = "ready";
    if (this.isSyncComplete()) {
      this.setSync("complete", []);
    } else {
      this.setSync("repairing", this.getMissingSyncPeerIds());
      this.scheduleSyncRetry();
    }
    this.flushQueue();
    if (!this.readySettled) {
      this.readySettled = true;
      this.readyResolve();
    }
    this.runLeaderCallbacks();
  }
  remainingBudget(deadline, stageLimit) {
    return Math.max(0, Math.min(stageLimit, deadline - Date.now()));
  }
  waitForTabs(expected, maxMs, signal) {
    return new Promise((resolve) => {
      let settled = false;
      const resources = {};
      const finish = () => {
        if (settled) return;
        settled = true;
        clearTimeout(timeout);
        resources.unsub?.();
        signal.removeEventListener("abort", finish);
        resolve();
      };
      const timeout = setTimeout(finish, maxMs);
      signal.addEventListener("abort", finish, { once: true });
      if (expected.size === 0) {
        finish();
        return;
      }
      const check = () => {
        for (const tabId of expected) {
          if (!this.presence.isAlive(tabId)) return false;
        }
        return true;
      };
      if (check()) {
        finish();
        return;
      }
      resources.unsub = this.onInternal("tab:join", () => {
        if (check()) finish();
      });
    });
  }
  async syncState(deadline, signal) {
    if (this.currentSyncPeerIds().length === 0) return;
    this.startSyncRound();
    let retryDelay = SYNC_RETRY_BASE_MS;
    let nextRetryAt = Date.now() + retryDelay;
    while (!signal.aborted && !this.isSyncComplete()) {
      const now = Date.now();
      if (now >= deadline) return;
      await this.waitForSyncProgress(Math.min(deadline, nextRetryAt) - now, signal);
      this.ensureRunning(signal);
      if (this.isSyncComplete() || Date.now() >= deadline) return;
      if (Date.now() >= nextRetryAt) {
        this.startSyncRound();
        retryDelay = Math.min(retryDelay * 2, SYNC_RETRY_MAX_MS);
        nextRetryAt = Date.now() + retryDelay;
      }
    }
  }
  handleSyncMessage(msg) {
    if (msg.type === "state:sync-request" && msg.payload !== null) {
      if (this.lifecycle === "bfcache-suspended") return;
      const request = msg.payload;
      if (request.requesterInstanceId !== msg.from.instanceId || request.protocolRevision !== msg.protocol.revision) {
        return;
      }
      const identity = this.channel.getIdentity();
      const response = {
        requestId: request.requestId,
        requesterInstanceId: request.requesterInstanceId,
        requesterGeneration: request.requesterGeneration,
        responderId: identity.tabId,
        responderInstanceId: identity.instanceId,
        responderState: this.lifecycle === "ready" ? "ready" : "initializing",
        complete: true,
        state: this.state.getSnapshot()
      };
      this.channel.send("state:sync", response, msg.from);
      return;
    }
    if (msg.type !== "state:sync" || typeof msg.payload !== "object" || msg.payload === null || !("requestId" in msg.payload)) {
      return;
    }
    this.handleSyncResponse(msg, msg.payload);
  }
  handleSyncResponse(msg, response) {
    if (response.requesterInstanceId !== this.instanceId || response.requesterGeneration !== this.syncGeneration || response.responderId !== msg.from.tabId || response.responderInstanceId !== msg.from.instanceId) {
      return;
    }
    const round = this.syncRounds.get(response.requestId);
    if (!round || round.generation !== this.syncGeneration) return;
    this.state.mergeSyncMessage(msg);
    if (round.expectedPeerIds.has(response.responderId)) {
      if (response.responderState === "ready") {
        round.readyResponderIds.add(response.responderId);
        round.initializingResponders.delete(response.responderId);
      } else {
        round.initializingResponders.set(response.responderId, {
          instanceId: response.responderInstanceId,
          empty: Object.keys(response.state).length === 0
        });
      }
    }
    this.notifySyncProgress();
    this.updateReadySyncStatus();
  }
  startSyncRound() {
    const expectedPeerIds = new Set(this.currentSyncPeerIds());
    if (expectedPeerIds.size === 0) {
      this.notifySyncProgress();
      return;
    }
    const requestId = crypto.randomUUID();
    const round = {
      requestId,
      generation: this.syncGeneration,
      createdAt: Date.now(),
      expectedPeerIds,
      readyResponderIds: /* @__PURE__ */ new Set(),
      initializingResponders: /* @__PURE__ */ new Map()
    };
    this.syncRounds.set(requestId, round);
    this.activeSyncRound = round;
    while (this.syncRounds.size > MAX_SYNC_CORRELATIONS) {
      const oldest = this.syncRounds.keys().next().value;
      if (oldest === void 0) break;
      this.syncRounds.delete(oldest);
    }
    this.state.requestSync({
      requestId,
      requesterInstanceId: this.instanceId,
      requesterGeneration: this.syncGeneration,
      knownPeers: [...expectedPeerIds].sort(),
      protocolRevision: LOCAL_PROTOCOL.revision
    });
  }
  currentSyncPeerIds() {
    return this.presence.getAllTabs().map((tab) => tab.id).filter((tabId) => tabId !== this.tabId).sort();
  }
  isSyncComplete() {
    const livePeerIds = this.currentSyncPeerIds();
    if (livePeerIds.length === 0) return true;
    for (const round of [...this.syncRounds.values()].reverse()) {
      if (this.isSyncRoundComplete(round, livePeerIds)) return true;
    }
    return false;
  }
  isSyncRoundComplete(round, livePeerIds) {
    if (round.generation !== this.syncGeneration) return false;
    if (livePeerIds.some((tabId) => !round.expectedPeerIds.has(tabId))) return false;
    if (livePeerIds.every((tabId) => round.readyResponderIds.has(tabId))) return true;
    if (Object.keys(this.state.getSnapshot()).length > 0) return false;
    if (!livePeerIds.every((tabId) => {
      const response = round.initializingResponders.get(tabId);
      return response?.empty === true;
    })) {
      return false;
    }
    const cohortInstances = [
      this.instanceId,
      ...livePeerIds.map((tabId) => round.initializingResponders.get(tabId)?.instanceId)
    ];
    return this.instanceId === cohortInstances.sort()[0];
  }
  getMissingSyncPeerIds() {
    if (this.isSyncComplete()) return [];
    const round = this.activeSyncRound;
    return this.currentSyncPeerIds().filter(
      (tabId) => !round?.expectedPeerIds.has(tabId) || !round.readyResponderIds.has(tabId)
    );
  }
  waitForSyncProgress(maxMs, signal) {
    return new Promise((resolve) => {
      let settled = false;
      const finish = () => {
        if (settled) return;
        settled = true;
        clearTimeout(timeout);
        this.syncProgressWaiters.delete(finish);
        signal.removeEventListener("abort", finish);
        resolve();
      };
      const timeout = setTimeout(finish, Math.max(0, maxMs));
      this.syncProgressWaiters.add(finish);
      signal.addEventListener("abort", finish, { once: true });
    });
  }
  notifySyncProgress() {
    for (const finish of [...this.syncProgressWaiters]) finish();
  }
  handleSyncPeerJoin() {
    this.notifySyncProgress();
    if (this.lifecycle === "ready") this.beginImmediateRepair();
  }
  handleSyncPeerLeave() {
    this.notifySyncProgress();
    this.updateReadySyncStatus();
  }
  handleSyncPeerActivity() {
    if (this.lifecycle !== "ready" || this.sync !== "repairing") return;
    if (this.activeSyncRound && Date.now() - this.activeSyncRound.createdAt < SYNC_RETRY_BASE_MS) {
      return;
    }
    this.beginImmediateRepair();
  }
  beginImmediateRepair() {
    if (this.lifecycle !== "ready" || this.isTerminal()) return;
    this.cancelSyncRetry();
    this.syncRetryDelay = SYNC_RETRY_BASE_MS;
    this.startSyncRound();
    this.updateReadySyncStatus();
  }
  updateReadySyncStatus() {
    if (this.lifecycle !== "ready" || this.isTerminal()) return;
    if (this.isSyncComplete()) {
      this.cancelSyncRetry();
      this.syncRetryDelay = SYNC_RETRY_BASE_MS;
      this.setSync("complete", []);
      return;
    }
    this.setSync("repairing", this.getMissingSyncPeerIds());
    this.scheduleSyncRetry();
  }
  scheduleSyncRetry() {
    if (this.syncRetryTimer || this.lifecycle !== "ready" || this.sync !== "repairing" || this.isTerminal()) {
      return;
    }
    const delay = this.syncRetryDelay;
    this.syncRetryTimer = setTimeout(() => {
      this.syncRetryTimer = null;
      if (this.lifecycle !== "ready" || this.sync !== "repairing" || this.isTerminal()) return;
      this.startSyncRound();
      this.syncRetryDelay = Math.min(this.syncRetryDelay * 2, SYNC_RETRY_MAX_MS);
      this.updateReadySyncStatus();
    }, delay);
  }
  cancelSyncRetry() {
    if (this.syncRetryTimer) clearTimeout(this.syncRetryTimer);
    this.syncRetryTimer = null;
  }
  resetSyncHandshake() {
    this.cancelSyncRetry();
    this.notifySyncProgress();
    this.syncRounds.clear();
    this.activeSyncRound = null;
    this.syncRetryDelay = SYNC_RETRY_BASE_MS;
  }
  async establishIdentity(deadline, signal) {
    while (!signal.aborted) {
      this.identityClaims.clear();
      this.channel.send("identity:probe", { startedAt: this.startedAt });
      await this.waitForIdentityClaims(this.remainingBudget(deadline, 75), signal);
      this.ensureRunning(signal);
      if (!this.hasEarlierIdentityClaim()) return;
      this.applyFreshTabId();
      if (Date.now() >= deadline) return;
    }
  }
  waitForIdentityClaims(maxMs, signal) {
    return new Promise((resolve) => {
      let settled = false;
      const finish = () => {
        if (settled) return;
        settled = true;
        clearTimeout(timeout);
        signal.removeEventListener("abort", finish);
        resolve();
      };
      const timeout = setTimeout(finish, maxMs);
      signal.addEventListener("abort", finish, { once: true });
    });
  }
  handleIdentityMessage(msg) {
    if (msg.type !== "identity:probe" && msg.type !== "identity:claim") return;
    if (msg.from.tabId !== this.tabId || msg.from.instanceId === this.instanceId) return;
    const { startedAt } = msg.payload;
    this.identityClaims.set(msg.from.instanceId, startedAt);
    if (msg.type === "identity:probe") {
      this.channel.send("identity:claim", { startedAt: this.startedAt }, msg.from);
    }
    if (this.isEarlierClaim(startedAt, msg.from.instanceId)) {
      this.identityRepairRequested = true;
      if (this.lifecycle === "ready") this.scheduleIdentityRepair();
    }
  }
  hasEarlierIdentityClaim() {
    for (const [instanceId, startedAt] of this.identityClaims) {
      if (this.isEarlierClaim(startedAt, instanceId)) return true;
    }
    return false;
  }
  isEarlierClaim(startedAt, instanceId) {
    return startedAt < this.startedAt || startedAt === this.startedAt && instanceId < this.instanceId;
  }
  applyFreshTabId() {
    const nextTabId = crypto.randomUUID();
    replaceTabId(nextTabId);
    this.tabId = nextTabId;
    this.channel.replaceTabId(nextTabId);
    if (this.domainsAttached) {
      this.presence.reidentify(nextTabId);
      this.state.reidentify(nextTabId);
      this.leader.reset();
    }
    this.identityRepairRequested = false;
  }
  scheduleIdentityRepair() {
    if (this.identityRepairing || this.isTerminal()) return;
    this.identityRepairing = true;
    queueMicrotask(() => {
      void this.repairIdentity().catch((error) => this.fail(error)).finally(() => {
        this.identityRepairing = false;
      });
    });
  }
  async repairIdentity() {
    if (!this.identityRepairRequested || this.isTerminal()) return;
    this.lifecycle = "initializing";
    this.stopLeaderCallbacks();
    this.leader.stop();
    this.views.releaseCurrent(false);
    this.presence.broadcastLeave();
    this.presence.stop();
    this.views.stop();
    this.applyFreshTabId();
    this.startInitialization();
  }
  suspendForBfcache() {
    if (this.isTerminal() || this.lifecycle === "bfcache-suspended") return;
    this.initAbort?.abort();
    this.resetSyncHandshake();
    this.lifecycle = "bfcache-suspended";
    this.setSync("pending", []);
    this.stopLeaderCallbacks();
    if (this.domainsAttached) {
      this.leader.stop();
      this.presence.stop();
      this.views.stop();
    }
  }
  resumeFromBfcache() {
    if (this.lifecycle !== "bfcache-suspended") return;
    this.lifecycle = "initializing";
    this.startInitialization();
  }
  setSync(sync, missingPeerIds) {
    const nextMissing = new Set(missingPeerIds);
    const changed = this.sync !== sync || nextMissing.size !== this.missingPeerIds.size || [...nextMissing].some((id) => !this.missingPeerIds.has(id));
    this.sync = sync;
    this.missingPeerIds = nextMissing;
    if (changed) this.emit("sync:status", this.status());
  }
  status() {
    return Object.freeze({
      lifecycle: this.lifecycle,
      sync: this.sync,
      missingPeerIds: Object.freeze([...this.missingPeerIds].sort())
    });
  }
  ensureRunning(signal) {
    if (signal.aborted || this.isTerminal() || this.lifecycle === "bfcache-suspended") {
      throw new DOMException("Tabula initialization was aborted.", "AbortError");
    }
  }
  isTerminal() {
    return this.lifecycle === "failed" || this.lifecycle === "destroyed";
  }
  assertActive() {
    if (this.lifecycle === "destroyed") throw new WorkspaceDestroyedError();
    if (this.lifecycle === "failed") throw new WorkspaceFailedError();
  }
  fail(cause) {
    if (this.isTerminal()) return;
    this.lifecycle = "failed";
    const error = new WorkspaceFailedError(cause);
    if (!this.readySettled) {
      this.readySettled = true;
      this.readyReject(error);
    }
    this.cleanupTerminal(error);
  }
  // ── Event system ──
  emit(event, payload) {
    if (this.isTerminal()) return;
    const listeners = this.eventListeners.get(event);
    if (!listeners) return;
    for (const cb of listeners) cb(payload);
  }
  on(event, cb) {
    this.assertActive();
    return this.onInternal(event, cb);
  }
  onInternal(event, cb) {
    let set = this.eventListeners.get(event);
    if (!set) {
      set = /* @__PURE__ */ new Set();
      this.eventListeners.set(event, set);
    }
    set.add(cb);
    return () => set.delete(cb);
  }
  off(event, cb) {
    this.assertActive();
    this.eventListeners.get(event)?.delete(cb);
  }
  // ── Leader callbacks ──
  addLeaderSetup(setup) {
    this.assertActive();
    const entry = { setup, cleanup: void 0, active: false };
    this.leaderSetups.push(entry);
    if (this.lifecycle === "ready" && this.leader.isLeader()) {
      this.activateLeaderSetup(entry);
    }
    return () => {
      this.deactivateLeaderSetup(entry);
      const idx = this.leaderSetups.indexOf(entry);
      if (idx >= 0) this.leaderSetups.splice(idx, 1);
    };
  }
  runLeaderCallbacks() {
    if (this.lifecycle !== "ready") return;
    for (const entry of this.leaderSetups) {
      if (this.leader.isLeader()) {
        this.activateLeaderSetup(entry);
      } else {
        this.deactivateLeaderSetup(entry);
      }
    }
  }
  stopLeaderCallbacks() {
    for (const entry of this.leaderSetups) this.deactivateLeaderSetup(entry);
  }
  activateLeaderSetup(entry) {
    if (entry.active) return;
    entry.active = true;
    try {
      entry.cleanup = entry.setup() ?? void 0;
    } catch (error) {
      console.error("Tabula onLeader setup threw an error.", error);
    }
  }
  deactivateLeaderSetup(entry) {
    if (!entry.active) return;
    entry.active = false;
    const cleanup = entry.cleanup;
    entry.cleanup = void 0;
    try {
      cleanup?.();
    } catch (error) {
      console.error("Tabula onLeader cleanup threw an error.", error);
    }
  }
  // ── Queue ──
  flushQueue() {
    for (const item of this.queue) item.fn();
    this.queue = [];
  }
  enqueue(fn) {
    this.assertActive();
    if (this.lifecycle === "ready") {
      fn();
    } else {
      this.queue.push({ fn });
    }
  }
  runWhenReady(fn) {
    this.assertActive();
    if (this.lifecycle === "ready") return Promise.resolve().then(fn);
    return new Promise((resolve, reject) => {
      this.queue.push({
        fn: () => {
          void Promise.resolve().then(fn).then(resolve, reject);
        },
        reject
      });
    });
  }
  trackResource(cleanup) {
    this.assertActive();
    this.resourceCleanups.add(cleanup);
    return () => this.resourceCleanups.delete(cleanup);
  }
  // ── Public accessors ──
  getState() {
    return this.state;
  }
  getViews() {
    return this.views;
  }
  getPresence() {
    return this.presence;
  }
  getLeader() {
    return this.leader;
  }
  getTabId() {
    return this.tabId;
  }
  getIdentity() {
    return this.channel.getIdentity();
  }
  getOpenTimeout() {
    return this.options.openTimeout;
  }
  isReady() {
    return this.lifecycle === "ready";
  }
  destroy() {
    if (this.lifecycle === "destroyed" || this.lifecycle === "failed") return;
    this.lifecycle = "destroyed";
    const error = new WorkspaceDestroyedError();
    if (!this.readySettled) {
      this.readySettled = true;
      this.readyReject(error);
    }
    this.cleanupTerminal(error);
  }
  cleanupTerminal(error) {
    this.initAbort?.abort();
    this.initAbort = null;
    this.resetSyncHandshake();
    this.stopLeaderCallbacks();
    this.leader.stop();
    this.leaderSetups = [];
    if (this.domainsAttached) {
      try {
        this.views.releaseCurrent(!this.preserveViewOnDestroy);
        this.presence.broadcastLeave();
      } catch {
      }
      this.presence.stop();
      this.views.stop();
      this.state.stop();
    }
    this.registry.stopListening();
    for (const cleanup of this.resourceCleanups) cleanup();
    this.resourceCleanups.clear();
    for (const item of this.queue) item.reject?.(error);
    this.queue = [];
    this.channel.close();
    window.removeEventListener("pagehide", this.pagehideHandler);
    window.removeEventListener("pageshow", this.pageshowHandler);
    this.eventListeners.clear();
  }
};
function createWorkspace(namespace, options = {}) {
  if (!isValidName(namespace)) {
    throw new Error(
      "createWorkspace() requires a non-empty namespace of at most 128 UTF-8 bytes. This identifies your workspace across tabs \u2014 e.g. createWorkspace('my-app')."
    );
  }
  for (const [name, value] of [
    ["heartbeat", options.heartbeat],
    ["timeout", options.timeout],
    ["readyTimeout", options.readyTimeout],
    ["openTimeout", options.openTimeout]
  ]) {
    if (value !== void 0 && (!Number.isFinite(value) || value <= 0)) {
      throw new TypeError(`createWorkspace() option ${name} must be a positive finite number.`);
    }
  }
  assertBaselineCapabilities();
  const coord = new Coordinator(namespace, options);
  const stateApi = {
    set(key, value) {
      coord.enqueue(() => coord.getState().set(key, value));
    },
    get(key) {
      coord.assertActive();
      return coord.getState().get(key);
    },
    on(key, cb) {
      coord.assertActive();
      if (key === "*") {
        return coord.getState().onWildcard(cb);
      }
      return coord.getState().onKey(key, cb);
    },
    delete(key) {
      coord.enqueue(() => coord.getState().delete(key));
    },
    keys() {
      coord.assertActive();
      return coord.getState().keys();
    },
    entries() {
      coord.assertActive();
      return coord.getState().allEntries();
    },
    setAll(entries) {
      coord.enqueue(() => coord.getState().setAll(entries));
    }
  };
  const viewsApi = {
    get: (name) => {
      coord.assertActive();
      return coord.getViews().get(name);
    },
    list: () => {
      coord.assertActive();
      return coord.getViews().listAll();
    },
    has: (name) => {
      coord.assertActive();
      return coord.getViews().has(name);
    }
  };
  const tabsApi = {
    list: () => {
      coord.assertActive();
      return coord.getPresence().getAllTabs();
    },
    current: () => {
      coord.assertActive();
      return coord.getPresence().getSelf();
    },
    leader: () => {
      coord.assertActive();
      const lid = coord.getLeader().getLeaderId();
      if (!lid) return null;
      return coord.getPresence().getTab(lid) ?? null;
    }
  };
  const tokensEqual = (left, right) => left.generation === right.generation && left.claimId === right.claimId;
  const createViewHandle = (authority) => {
    const on = (event, cb) => {
      coord.assertActive();
      if (event === "vacant") {
        return coord.on("view:vacant", (payload) => {
          const vacancy = payload;
          if (vacancy.name === authority.name && tokensEqual(vacancy.token, authority.token)) cb();
        });
      }
      return coord.on("view:conflict", (payload) => {
        const conflict = payload;
        if (conflict.name === authority.name && (!conflict.token || tokensEqual(conflict.token, authority.token))) {
          cb({ existing: conflict.existing, incoming: conflict.incoming });
        }
      });
    };
    return {
      name: authority.name,
      token: { ...authority.token },
      owner: { ...authority.owner },
      on,
      release() {
        coord.enqueue(() => coord.getViews().release(authority.name, authority.token));
      },
      focus() {
        coord.enqueue(() => coord.getViews().focus(authority.name, authority.token));
      }
    };
  };
  const pendingOpens = /* @__PURE__ */ new Map();
  const pendingOpenPrefix = `tabula:${namespace}:pending-open:`;
  const removeIntentIfCurrent = (key, intentId) => {
    const raw = storageGet(localStorage, "localStorage", key);
    if (!raw) return;
    let current = null;
    try {
      current = validateStoredOpenIntent(JSON.parse(raw));
    } catch {
      return;
    }
    if (current?.intentId === intentId) storageRemove(localStorage, "localStorage", key);
  };
  const workspace = {
    state: stateApi,
    views: viewsApi,
    tabs: tabsApi,
    ready: coord.readyPromise,
    status: () => coord.status(),
    claim(viewName) {
      return coord.runWhenReady(async () => {
        const result = await coord.getViews().claim(viewName);
        return result.status === "claimed" ? { status: "claimed", handle: createViewHandle(result.authority) } : { status: "conflict", owner: result.owner };
      });
    },
    open(viewName, opts) {
      return coord.runWhenReady(async () => {
        if (!isValidName(viewName)) {
          throw new TypeError("View names must be safe strings of at most 128 bytes.");
        }
        if (!opts || typeof opts.url !== "string") {
          throw new TypeError("app.open() requires a URL string.");
        }
        const existing = coord.getViews().get(viewName);
        if (existing) {
          const self = coord.getPresence().getSelf();
          coord.getViews().focus(viewName);
          throw Object.assign(new Error(`View '${viewName}' is already held by another tab.`), {
            existing,
            self
          });
        }
        const syncKeys = [...new Set(opts.syncKeys ?? [])];
        if (syncKeys.some((key) => !isValidStateKey(key))) {
          throw new TypeError("syncKeys must contain safe state key strings.");
        }
        if (syncKeys.length > MAX_STATE_KEYS) {
          throw new RangeError(`syncKeys is limited to ${MAX_STATE_KEYS} keys.`);
        }
        const url = new URL(opts.url, window.location.href).toString();
        const timeout = coord.getOpenTimeout();
        const createdAt = Date.now();
        const intent = {
          intentId: crypto.randomUUID(),
          view: viewName,
          requester: coord.getIdentity(),
          syncKeys,
          createdAt,
          expiresAt: createdAt + timeout
        };
        const pendingKey = pendingOpenPrefix + viewName;
        pendingOpens.get(viewName)?.cancel(new Error(`A newer app.open('${viewName}') call superseded this request.`));
        const authority = await new Promise((resolve, reject) => {
          let settled = false;
          let timeoutId = null;
          let unsubscribe = () => void 0;
          let untrack = () => void 0;
          const request = { cancel: (error) => finish(error) };
          const cleanup = () => {
            if (timeoutId) clearTimeout(timeoutId);
            unsubscribe();
            untrack();
            if (pendingOpens.get(viewName) === request) pendingOpens.delete(viewName);
            try {
              removeIntentIfCurrent(pendingKey, intent.intentId);
            } catch {
            }
          };
          function finish(error, value) {
            if (settled) return;
            settled = true;
            cleanup();
            if (error) reject(error);
            else resolve(value);
          }
          pendingOpens.set(viewName, request);
          unsubscribe = coord.on("view:intent-claim", (payload) => {
            const claim = payload;
            if (claim.intentId !== intent.intentId || claim.name !== viewName) return;
            const claimedAuthority = coord.getViews().getAuthority(viewName);
            if (!claimedAuthority || !tokensEqual(claimedAuthority.token, claim.token)) return;
            coord.getViews().sendIntentState(claim, coord.getState().getOperationsForSync(syncKeys));
            finish(null, claimedAuthority);
          });
          untrack = coord.trackResource(() => finish(new WorkspaceDestroyedError()));
          timeoutId = setTimeout(
            () => finish(
              new Error(
                `View '${viewName}' was not claimed by the new tab within ${timeout}ms. Make sure the opened page calls app.claim('${viewName}').`
              )
            ),
            timeout
          );
          try {
            storageSet(localStorage, "localStorage", pendingKey, JSON.stringify(intent));
            if (!window.open(url)) {
              finish(
                new Error(
                  `Failed to open tab for view '${viewName}'. The browser may have blocked the popup. app.open() must be called in direct response to a user gesture (click, keyboard).`
                )
              );
            }
          } catch (error) {
            finish(error instanceof Error ? error : new Error(String(error)));
          }
        });
        return createViewHandle(authority);
      });
    },
    focus(viewName) {
      coord.enqueue(() => coord.getViews().focus(viewName));
    },
    destroy() {
      coord.destroy();
    },
    onLeader(setup) {
      return coord.addLeaderSetup(setup);
    },
    isLeader() {
      coord.assertActive();
      return coord.isReady() && coord.getLeader().isLeader();
    },
    on(event, cb) {
      return coord.on(event, cb);
    },
    off(event, cb) {
      coord.off(event, cb);
    }
  };
  return workspace;
}

// compat/published-participant.js
function start(namespace) {
  const workspace = createWorkspace(namespace, { heartbeat: 100, timeout: 500, readyTimeout: 700 });
  const handles = /* @__PURE__ */ new Map();
  return {
    ready: workspace.ready,
    current: () => workspace.tabs.current().id,
    tabs: () => workspace.tabs.list().map((tab) => tab.id),
    leader: () => workspace.tabs.leader()?.id ?? null,
    get: (key) => workspace.state.get(key),
    set: (key, value) => workspace.state.set(key, value),
    delete: (key) => workspace.state.delete(key),
    view: (name) => workspace.views.get(name)?.id ?? null,
    async claim(name) {
      const result = await workspace.claim(name);
      if (result.status === "claimed") handles.set(name, result.handle);
      return result.status;
    },
    destroy: () => workspace.destroy()
  };
}
export {
  start
};
