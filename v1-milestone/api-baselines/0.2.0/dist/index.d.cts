interface ProtocolVersion {
    major: number;
    revision: number;
    minRevision: number;
}
interface MessageIdentity {
    tabId: string;
    instanceId: string;
}
interface ViewClaimToken {
    generation: number;
    claimId: string;
}
interface ProtocolIncompatibleEvent {
    peer: MessageIdentity;
    local: ProtocolVersion;
    remote: ProtocolVersion;
    recovery: 'Save work and reload all application tabs.';
}

type WorkspaceLifecycle = 'initializing' | 'ready' | 'bfcache-suspended' | 'failed' | 'destroyed';
type WorkspaceSyncState = 'pending' | 'repairing' | 'complete';
interface WorkspaceStatus {
    readonly lifecycle: WorkspaceLifecycle;
    readonly sync: WorkspaceSyncState;
    readonly missingPeerIds: readonly string[];
}
declare class CapabilityError extends Error {
    readonly capability: string;
    constructor(capability: string, detail: string);
}
declare class StorageOperationError extends Error {
    readonly storage: 'localStorage' | 'sessionStorage';
    readonly operation: 'read' | 'write' | 'remove';
    constructor(storage: 'localStorage' | 'sessionStorage', operation: 'read' | 'write' | 'remove', cause?: unknown);
}
declare class StorageCorruptionError extends Error {
    constructor(record: string);
}
declare class WorkspaceDestroyedError extends Error {
    constructor();
}
declare class WorkspaceFailedError extends Error {
    constructor(cause?: unknown);
}
declare class ViewAlreadyClaimedError extends Error {
    readonly currentView: string;
    constructor(currentView: string);
}

interface TabMeta {
    id: string;
    view: string | null;
    visible: boolean;
    firstSeenAt: number;
    lastSeenAt: number;
}
interface WorkspaceOptions {
    heartbeat?: number;
    timeout?: number;
    readyTimeout?: number;
    openTimeout?: number;
}
interface ViewOpenOptions<S> {
    url: string;
    syncKeys?: (keyof S & string)[];
}
interface ViewClaimedEvent {
    name: string;
    tab: TabMeta;
    token: ViewClaimToken;
}
interface ViewVacantEvent {
    name: string;
    token: ViewClaimToken;
}
interface ViewConflictEvent {
    name: string;
    existing: TabMeta;
    incoming: TabMeta;
    token?: ViewClaimToken;
}
interface LeaderChangeEvent {
    tab: TabMeta;
    isMe: boolean;
}
interface WorkspaceEventMap {
    'view:claimed': ViewClaimedEvent;
    'view:vacant': ViewVacantEvent;
    'view:conflict': ViewConflictEvent;
    'tab:join': TabMeta;
    'tab:leave': TabMeta;
    'leader:change': LeaderChangeEvent;
    'protocol:incompatible': ProtocolIncompatibleEvent;
    'sync:status': WorkspaceStatus;
}
interface ViewHandle {
    readonly name: string;
    readonly token: ViewClaimToken;
    readonly owner: TabMeta;
    on(event: 'vacant', cb: () => void): () => void;
    on(event: 'conflict', cb: (e: {
        existing: TabMeta;
        incoming: TabMeta;
    }) => void): () => void;
    release(): void;
    focus(): void;
}
type ViewClaimResult = {
    status: 'claimed';
    handle: ViewHandle;
} | {
    status: 'conflict';
    owner: TabMeta | null;
};
interface Workspace<S extends object = Record<string, unknown>> {
    readonly state: WorkspaceState<S>;
    readonly views: WorkspaceViews;
    readonly tabs: WorkspaceTabs;
    /** Resolves when the workspace has completed init (presence discovery, state sync, leader election). */
    readonly ready: Promise<void>;
    status(): WorkspaceStatus;
    claim(viewName: string): Promise<ViewClaimResult>;
    open(viewName: string, options: ViewOpenOptions<S>): Promise<ViewHandle>;
    focus(viewName: string): void;
    destroy(): void;
    onLeader(setup: () => (() => void) | undefined): () => void;
    isLeader(): boolean;
    on<E extends keyof WorkspaceEventMap>(event: E, cb: (payload: WorkspaceEventMap[E]) => void): () => void;
    off<E extends keyof WorkspaceEventMap>(event: E, cb: (payload: WorkspaceEventMap[E]) => void): void;
}
interface WorkspaceState<S extends object> {
    set<K extends keyof S & string>(key: K, value: S[K]): void;
    get<K extends keyof S & string>(key: K): S[K] | undefined;
    on<K extends keyof S & string>(key: K, cb: (value: S[K]) => void): () => void;
    on(key: '*', cb: (key: string, value: unknown) => void): () => void;
    delete<K extends keyof S & string>(key: K): void;
    keys(): Array<keyof S & string>;
    entries(): Array<[keyof S & string, S[keyof S & string]]>;
    setAll(entries: Partial<S>): void;
}
interface WorkspaceViews {
    get(viewName: string): TabMeta | null;
    list(): Record<string, TabMeta>;
    has(viewName: string): boolean;
}
interface WorkspaceTabs {
    list(): TabMeta[];
    current(): TabMeta;
    leader(): TabMeta | null;
}
declare function createWorkspace<S extends object = Record<string, unknown>>(namespace: string, options?: WorkspaceOptions): Workspace<S>;

export { CapabilityError, type LeaderChangeEvent, type ProtocolIncompatibleEvent, type ProtocolVersion, StorageCorruptionError, StorageOperationError, type TabMeta, ViewAlreadyClaimedError, type ViewClaimResult, type ViewClaimToken, type ViewClaimedEvent, type ViewConflictEvent, type ViewHandle, type ViewOpenOptions, type ViewVacantEvent, type Workspace, WorkspaceDestroyedError, type WorkspaceEventMap, WorkspaceFailedError, type WorkspaceLifecycle, type WorkspaceOptions, type WorkspaceState, type WorkspaceStatus, type WorkspaceSyncState, type WorkspaceTabs, type WorkspaceViews, createWorkspace };
