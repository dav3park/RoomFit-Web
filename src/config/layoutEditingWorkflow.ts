import {
  addFurnitureToDraft,
  buildDefaultAgentContextRequest,
  confirmLayout,
  createDefaultAgentContext,
  createLayoutDraft,
  getLatestConfirmedLayout,
  getLayout,
  recommendLayout,
  updateLayout,
  type AgentContextRequest,
  type LayoutRecommendationResponse,
  type LayoutResponse,
  type LayoutValidationResult,
} from "../api/layouts";
import {
  AgentContextRequestValidationError,
  resolveRequiredFurnitureTypes,
} from "../api/agentContextRequest";
import { applyBackendFurnitureToLayout, getRoomById, replaceRoomFurniture } from "../api/rooms";
import type { RoomLayout } from "../types";
import {
  resolveRoomLayoutPreferredColorTone,
  withAppliedPreferredColorTone,
} from "./appliedColorTone";
import {
  clearActiveLayoutEditingSession,
  createInitialSetupNavigationState,
  createLayoutNavigationState,
  isSessionForRoom,
  readActiveLayoutEditingSession,
  saveLayoutResponseSession,
  type LayoutNavigationState,
} from "./layoutEditingSession";
import {
  clearRecommendationResult,
  readRecommendationResult,
  RecommendationFeasibilityError,
  resolveRecommendationDecision,
  saveRecommendationResult,
  type RecommendationResultOwner,
} from "./recommendationResult";
import { clearConfirmedLayout, hasConfirmedLayout } from "./confirmedLayouts";
import { bindRoomToSetupSession, readRoomSetupSession } from "./roomSetupSession";
import { getActiveRequestClientId } from "./clientScope";
import { readPreferredColorTone } from "./preferredColorTone";
import { assertFurnitureAdditionAllowed } from "./furnitureAdditionPolicy";
import { hasDeskLoftConflict, DESK_LOFT_CONFLICT_MESSAGE } from "./furnitureSelectionPolicy";

type WorkflowStorage = Pick<Storage, "getItem" | "setItem" | "removeItem">;

export interface LayoutWorkflowApi {
  getRoomLayout: (roomId: number) => Promise<RoomLayout>;
  replaceRoomFurniture: typeof replaceRoomFurniture;
  getLayout: typeof getLayout;
  getLatestConfirmedLayout: typeof getLatestConfirmedLayout;
  createLayoutDraft: typeof createLayoutDraft;
  updateLayout: typeof updateLayout;
  addFurnitureToDraft: typeof addFurnitureToDraft;
  createDefaultAgentContext: typeof createDefaultAgentContext;
  recommendLayout: typeof recommendLayout;
  confirmLayout: typeof confirmLayout;
}

const defaultApi: LayoutWorkflowApi = {
  getRoomLayout: async (roomId) => (await getRoomById(roomId)).layout,
  replaceRoomFurniture,
  getLayout,
  getLatestConfirmedLayout,
  createLayoutDraft,
  updateLayout,
  addFurnitureToDraft,
  createDefaultAgentContext,
  recommendLayout,
  confirmLayout,
};

interface EditorPersistenceOwner {
  roomLayoutId: string;
  backendRoomId: number;
  activeLayoutId: number;
  clientId: string | null;
}

interface ManagedFurniturePersistenceOwner {
  roomLayoutId: string;
  backendRoomId: number;
  activeLayoutId: number | null;
  sessionIdentity: string | null;
  clientId: string | null;
}

let pendingEditorLayoutPersistence: Promise<void> = Promise.resolve();
let latestEditorLayoutPersistence: Promise<unknown> = Promise.resolve();
let pendingManagedFurniturePersistence: Promise<void> = Promise.resolve();
let latestManagedFurniturePersistence: Promise<unknown> = Promise.resolve();
const managedFurnitureRevisions = new WeakMap<object, Map<string, number>>();

export function persistManagedFurnitureSnapshot(
  room: RoomLayout,
  storage: WorkflowStorage = localStorage,
  api: LayoutWorkflowApi = defaultApi,
  browserSession: WorkflowStorage | null = defaultBrowserSession(),
): Promise<RoomLayout | null> {
  const owner = readManagedFurniturePersistenceOwner(room, storage, browserSession);
  if (!owner) return Promise.resolve(null);
  const ownerKey = managedFurnitureOwnerKey(owner);
  const revision = nextManagedFurnitureRevision(storage, ownerKey);
  const persist = () => persistManagedFurnitureNow(
    room,
    owner,
    ownerKey,
    revision,
    storage,
    api,
    browserSession,
  );
  const task = pendingManagedFurniturePersistence.then(persist, persist);
  pendingManagedFurniturePersistence = task.then(() => undefined, () => undefined);
  latestManagedFurniturePersistence = task;
  return task;
}

export async function flushManagedFurniturePersistence(): Promise<void> {
  await latestManagedFurniturePersistence;
}

export function settleLatestManagedFurniturePersistence(
  request: Promise<unknown>,
  revisionRef: { current: number },
  onSuccess: () => void,
  onFailure: () => void,
): void {
  const revision = ++revisionRef.current;
  void request.then(
    () => {
      if (revisionRef.current === revision) onSuccess();
    },
    () => {
      if (revisionRef.current === revision) onFailure();
    },
  );
}

async function persistManagedFurnitureNow(
  room: RoomLayout,
  owner: ManagedFurniturePersistenceOwner,
  ownerKey: string,
  revision: number,
  storage: WorkflowStorage,
  api: LayoutWorkflowApi,
  browserSession: WorkflowStorage | null,
): Promise<RoomLayout | null> {
  if (!isManagedFurniturePersistenceOwnerCurrent(owner, storage, browserSession)) return null;

  let saved: RoomLayout;
  if (owner.activeLayoutId !== null) {
    const response = await api.updateLayout(owner.activeLayoutId, room);
    assertActiveDraftResponse(response, owner.activeLayoutId, owner.backendRoomId);
    saved = applyBackendFurnitureToLayout(room, response.recommendedFurniture);
  } else {
    saved = await api.replaceRoomFurniture(owner.backendRoomId, room);
  }

  if (!isManagedFurniturePersistenceOwnerCurrent(owner, storage, browserSession)) return null;
  if (readManagedFurnitureRevision(storage, ownerKey) === revision) {
    persistActiveDraftMirror(saved, storage);
  }
  return saved;
}

function readManagedFurniturePersistenceOwner(
  room: RoomLayout,
  storage: WorkflowStorage,
  browserSession: WorkflowStorage | null,
): ManagedFurniturePersistenceOwner | null {
  const selected = readSelectedRoomLayout(storage);
  const backendRoomId = parseBackendRoomId(storage.getItem("roomfit:backendRoomId"));
  if (selected?.id !== room.id || backendRoomId === null) return null;
  const session = readActiveLayoutEditingSession(storage);
  const activeLayoutId = isSessionForRoom(session, room.id, backendRoomId) && !session.confirmed
    ? session.activeLayoutId
    : null;
  return {
    roomLayoutId: room.id,
    backendRoomId,
    activeLayoutId,
    sessionIdentity: createActiveSessionIdentity(storage),
    clientId: browserSession ? getActiveRequestClientId(storage, browserSession) : null,
  };
}

function isManagedFurniturePersistenceOwnerCurrent(
  owner: ManagedFurniturePersistenceOwner,
  storage: WorkflowStorage,
  browserSession: WorkflowStorage | null,
): boolean {
  const selected = readSelectedRoomLayout(storage);
  const backendRoomId = parseBackendRoomId(storage.getItem("roomfit:backendRoomId"));
  const clientId = browserSession ? getActiveRequestClientId(storage, browserSession) : null;
  return selected?.id === owner.roomLayoutId
    && backendRoomId === owner.backendRoomId
    && createActiveSessionIdentity(storage) === owner.sessionIdentity
    && clientId === owner.clientId;
}

function managedFurnitureOwnerKey(owner: ManagedFurniturePersistenceOwner): string {
  return JSON.stringify(owner);
}

function nextManagedFurnitureRevision(storage: WorkflowStorage, ownerKey: string): number {
  let revisions = managedFurnitureRevisions.get(storage);
  if (!revisions) {
    revisions = new Map<string, number>();
    managedFurnitureRevisions.set(storage, revisions);
  }
  const revision = (revisions.get(ownerKey) ?? 0) + 1;
  revisions.set(ownerKey, revision);
  return revision;
}

function readManagedFurnitureRevision(storage: WorkflowStorage, ownerKey: string): number | null {
  return managedFurnitureRevisions.get(storage)?.get(ownerKey) ?? null;
}

export async function loadManagedFurnitureLayout(
  room: RoomLayout,
  backendRoomId: number,
  storage: WorkflowStorage = localStorage,
  api: LayoutWorkflowApi = defaultApi,
  browserSession: WorkflowStorage | null = defaultBrowserSession(),
): Promise<RoomLayout | null> {
  const session = readActiveLayoutEditingSession(storage);
  if (isSessionForRoom(session, room.id, backendRoomId) && !session.confirmed) {
    const response = await api.getLayout(session.activeLayoutId);
    assertLayoutOwner(response, backendRoomId);
    saveLayoutResponseSession(room.id, response, storage, session.editingMode);
    const restored = applyBackendFurnitureToLayout(room, response.recommendedFurniture);
    persistActiveDraftMirror(restored, storage);
    return restored;
  }

  if (!isConfirmedReedit(room.id, backendRoomId, storage, browserSession)) {
    return loadRoomDetailForInitialSetup(room, backendRoomId, storage, api, browserSession);
  }

  const response = await api.getLatestConfirmedLayout(backendRoomId);

  if (!response) {
    return loadRoomDetailForInitialSetup(room, backendRoomId, storage, api, browserSession, true);
  }
  assertLayoutOwner(response, backendRoomId);
  if (!response.confirmed) {
    saveLayoutResponseSession(room.id, response, storage, session?.editingMode);
  }
  const restored = applyBackendFurnitureToLayout(room, response.recommendedFurniture);
  if (!response.confirmed) {
    persistActiveDraftMirror(restored, storage);
  }
  return restored;
}

export async function prepareManagedFurnitureDraft(
  storage: WorkflowStorage = localStorage,
  api: LayoutWorkflowApi = defaultApi,
  browserSession: WorkflowStorage | null = defaultBrowserSession(),
): Promise<LayoutNavigationState | null> {
  await flushManagedFurniturePersistence();
  const room = readSelectedRoomLayout(storage);
  const backendRoomId = parseBackendRoomId(storage.getItem("roomfit:backendRoomId"));
  if (!room || backendRoomId === null) return null;

  const session = readActiveLayoutEditingSession(storage);
  const active = isSessionForRoom(session, room.id, backendRoomId)
    ? await api.getLayout(session.activeLayoutId)
    : isConfirmedReedit(room.id, backendRoomId, storage, browserSession)
      ? await api.getLatestConfirmedLayout(backendRoomId)
      : null;

  if (!active) {
    const savedRoom = await api.replaceRoomFurniture(backendRoomId, room);
    persistActiveDraftMirror(savedRoom, storage);
    recoverInitialSetupSession(room.id, backendRoomId, storage, browserSession);
    return createInitialSetupNavigationState(room.id, backendRoomId, savedRoom);
  }
  assertLayoutOwner(active, backendRoomId);

  const editable = active.confirmed
    ? await api.createLayoutDraft(active.layoutId)
    : active;
  assertActiveDraftResponse(editable, editable.layoutId, backendRoomId);
  saveLayoutResponseSession(room.id, editable, storage, "REEDIT_DRAFT");

  const saved = await api.updateLayout(editable.layoutId, room);
  assertActiveDraftResponse(saved, editable.layoutId, backendRoomId);
  const savedRoom = applyBackendFurnitureToLayout(room, saved.recommendedFurniture);
  persistActiveDraftMirror(savedRoom, storage);
  const savedSession = saveLayoutResponseSession(room.id, saved, storage, "REEDIT_DRAFT");
  return createLayoutNavigationState(savedSession, saved, savedRoom);
}

export async function refreshActiveDraftNavigationState(
  storage: WorkflowStorage = localStorage,
  api: LayoutWorkflowApi = defaultApi,
): Promise<LayoutNavigationState | null> {
  const room = readSelectedRoomLayout(storage);
  const backendRoomId = parseBackendRoomId(storage.getItem("roomfit:backendRoomId"));
  if (!room || backendRoomId === null) return null;

  const session = readActiveLayoutEditingSession(storage);
  if (!isSessionForRoom(session, room.id, backendRoomId) || session.confirmed) {
    return createInitialSetupNavigationState(room.id, backendRoomId, room);
  }

  const response = await api.getLayout(session.activeLayoutId);
  assertActiveDraftResponse(response, session.activeLayoutId, backendRoomId);
  const restored = applyBackendFurnitureToLayout(room, response.recommendedFurniture);
  persistActiveDraftMirror(restored, storage);
  const savedSession = saveLayoutResponseSession(room.id, response, storage, session.editingMode);
  return createLayoutNavigationState(savedSession, response, restored);
}

export async function prepareAdditionalFurnitureForEditor(
  storage: WorkflowStorage = localStorage,
  api: LayoutWorkflowApi = defaultApi,
  browserSession: WorkflowStorage = sessionStorage,
  signal?: AbortSignal,
): Promise<LayoutNavigationState | null> {
  const selectedIds = readStringArray(storage.getItem("roomfit:selectedAdditionalFurnitureIds"));
  assertFurnitureAdditionAllowed(readSelectedRoomLayout(storage), selectedIds);

  const current = await refreshActiveDraftNavigationState(storage, api);
  throwIfRecommendationCancelled(signal);
  if (!current) {
    return current;
  }

  assertFurnitureAdditionAllowed(current.roomLayout ?? readSelectedRoomLayout(storage), selectedIds);

  if (current.editingMode === "INITIAL_SETUP") {
    return prepareInitialRecommendation(current, storage, browserSession, api, signal);
  }

  if (current.editingMode !== "REEDIT_DRAFT" || current.activeLayoutId === null) return current;

  if (hasDeskLoftConflict(selectedIds, current.roomLayout?.furniture ?? [])) {
    throw new Error(DESK_LOFT_CONFLICT_MESSAGE);
  }
  if (resolveRequiredFurnitureTypes(selectedIds).length === 0) {
    return current;
  }

  const context = await api.createDefaultAgentContext(current.roomId);
  const response = await api.addFurnitureToDraft(current.activeLayoutId, {
    contextId: context.contextId,
  });
  assertActiveDraftResponse(response, current.activeLayoutId, current.roomId);

  const baseline = current.roomLayout ?? readSelectedRoomLayout(storage);
  if (!baseline) return current;
  const restored = applyBackendFurnitureToLayout(baseline, response.recommendedFurniture);
  persistActiveDraftMirror(restored, storage);
  const session = saveLayoutResponseSession(current.roomLayoutId, response, storage, "REEDIT_DRAFT");
  return createLayoutNavigationState(session, response, restored);
}

export async function prepareRecommendationTransitionForEditor(
  storage: WorkflowStorage = localStorage,
  api: LayoutWorkflowApi = defaultApi,
  browserSession: WorkflowStorage = sessionStorage,
  signal?: AbortSignal,
): Promise<LayoutNavigationState | null> {
  const current = await refreshActiveDraftNavigationState(storage, api);
  throwIfRecommendationCancelled(signal);
  if (current?.editingMode === "INITIAL_SETUP" && current.activeLayoutId !== null) {
    const fingerprint = createRecommendationFingerprint(current, storage, browserSession);
    const session = readActiveLayoutEditingSession(storage);
    if (session?.activeLayoutId === current.activeLayoutId
      && session.recommendationFingerprint === fingerprint) {
      return current;
    }

    const selectedIds = readStringArray(storage.getItem("roomfit:selectedAdditionalFurnitureIds"));
    const baseline = await api.getRoomLayout(current.roomId);
    throwIfRecommendationCancelled(signal);
    if (baseline.id !== current.roomLayoutId) {
      throw new Error("Backend Room response does not match the selected Room.");
    }
    assertFurnitureAdditionAllowed(baseline, selectedIds);
    if (hasDeskLoftConflict(selectedIds, baseline.furniture)) {
      throw new AgentContextRequestValidationError(DESK_LOFT_CONFLICT_MESSAGE);
    }
    return prepareInitialRecommendation(
      current,
      storage,
      browserSession,
      api,
      signal,
      fingerprint,
      baseline,
    );
  }
  return prepareAdditionalFurnitureForEditor(storage, api, browserSession, signal);
}

export async function prepareFurnitureSelectionForRecommendation(
  storage: WorkflowStorage = localStorage,
  api: LayoutWorkflowApi = defaultApi,
): Promise<LayoutNavigationState | null> {
  const selectedIds = readStringArray(storage.getItem("roomfit:selectedAdditionalFurnitureIds"));
  const selectedRoom = readSelectedRoomLayout(storage);
  assertFurnitureAdditionAllowed(selectedRoom, selectedIds);
  assertRecommendationSelectionReady(selectedIds);

  const current = await refreshActiveDraftNavigationState(storage, api);
  if (!current) return null;

  assertFurnitureAdditionAllowed(current.roomLayout ?? selectedRoom, selectedIds);
  if (hasDeskLoftConflict(selectedIds, current.roomLayout?.furniture ?? [])) {
    throw new AgentContextRequestValidationError(DESK_LOFT_CONFLICT_MESSAGE);
  }
  return current;
}

async function prepareInitialRecommendation(
  current: LayoutNavigationState,
  storage: WorkflowStorage,
  browserSession: WorkflowStorage,
  api: LayoutWorkflowApi,
  signal?: AbortSignal,
  knownFingerprint?: string,
  baselineOverride?: RoomLayout,
): Promise<LayoutNavigationState> {
  throwIfRecommendationCancelled(signal);
  const baseline = baselineOverride ?? current.roomLayout ?? readSelectedRoomLayout(storage);
  if (!baseline) return current;
  const recommendationFingerprint = knownFingerprint
    ?? createRecommendationFingerprint(current, storage, browserSession);
  const expectedSessionIdentity = createActiveSessionIdentity(storage);
  assertRecommendationRequestIsCurrent(
    current,
    recommendationFingerprint,
    expectedSessionIdentity,
    storage,
    browserSession,
    signal,
  );

  const context = await api.createDefaultAgentContext(current.roomId);
  assertRecommendationRequestIsCurrent(
    current,
    recommendationFingerprint,
    expectedSessionIdentity,
    storage,
    browserSession,
    signal,
  );
  const response = await api.recommendLayout(current.roomId, context.contextId);
  assertRecommendationRequestIsCurrent(
    current,
    recommendationFingerprint,
    expectedSessionIdentity,
    storage,
    browserSession,
    signal,
  );
  if (response.roomId !== current.roomId) {
    throw new Error("The Backend Layout belongs to a different Room.");
  }
  const decision = resolveRecommendationDecision(response);
  const owner = resolveRecommendationOwner(current, browserSession);

  if (decision.status === "FAILED") {
    if (decision.notice && owner) {
      saveRecommendationResult(owner, decision.notice, browserSession);
    }
    throw new RecommendationFeasibilityError(decision.notice!);
  }

  const persistedResponse = requirePersistedRecommendation(response);
  assertLayoutOwner(persistedResponse, current.roomId);
  const recommended = applyBackendFurnitureToLayout(baseline, persistedResponse.recommendedFurniture);
  const restored = withAppliedPreferredColorTone(
    recommended,
    readPreferredColorTone(storage) ?? resolveRoomLayoutPreferredColorTone(baseline, storage),
  );
  persistActiveDraftMirror(restored, storage);
  const session = saveLayoutResponseSession(
    current.roomLayoutId,
    persistedResponse,
    storage,
    "INITIAL_SETUP",
    recommendationFingerprint,
  );

  if (decision.notice && owner) {
    saveRecommendationResult(owner, decision.notice, browserSession);
  } else if (owner) {
    clearRecommendationResult(browserSession, owner);
  }

  return createLayoutNavigationState(session, persistedResponse, restored);
}

function createRecommendationFingerprint(
  current: LayoutNavigationState,
  storage: WorkflowStorage,
  browserSession: WorkflowStorage,
): string {
  return createRecommendationFingerprintFromRequest({
    roomLayoutId: current.roomLayoutId,
    clientId: getActiveRequestClientId(storage, browserSession),
    request: buildDefaultAgentContextRequest(current.roomId, storage),
  });
}

export function createRecommendationFingerprintFromRequest({
  roomLayoutId,
  clientId,
  request,
}: {
  roomLayoutId: string;
  clientId: string | null;
  request: AgentContextRequest;
}): string {
  return JSON.stringify({
    version: 1,
    roomLayoutId,
    clientId,
    roomId: request.roomId,
    lifestyleGoal: request.lifestyleGoal,
    designStyle: [...request.designStyle].sort(),
    requiredItems: [...request.requiredItems].sort(),
    optionalItems: [...request.optionalItems].sort(),
    selectedImageIds: [...request.selectedImageIds].sort((left, right) => left - right),
    selectedProductIds: [...request.selectedProductIds].sort(),
    preferredColorTone: request.preferredColorTone,
  });
}

function assertRecommendationRequestIsCurrent(
  current: LayoutNavigationState,
  expectedFingerprint: string,
  expectedSessionIdentity: string | null,
  storage: WorkflowStorage,
  browserSession: WorkflowStorage,
  signal?: AbortSignal,
): void {
  throwIfRecommendationCancelled(signal);
  const selectedRoom = readSelectedRoomLayout(storage);
  const backendRoomId = parseBackendRoomId(storage.getItem("roomfit:backendRoomId"));
  const session = readActiveLayoutEditingSession(storage);
  if (selectedRoom?.id !== current.roomLayoutId
    || backendRoomId !== current.roomId
    || createActiveSessionIdentity(storage) !== expectedSessionIdentity
    || (current.activeLayoutId !== null
      && (!isSessionForRoom(session, current.roomLayoutId, current.roomId)
        || session.activeLayoutId !== current.activeLayoutId
        || session.confirmed))) {
    throwRecommendationAbort();
  }

  try {
    if (createRecommendationFingerprint(current, storage, browserSession) !== expectedFingerprint) {
      throwRecommendationAbort();
    }
  } catch (error) {
    if (error instanceof DOMException && error.name === "AbortError") throw error;
    throwRecommendationAbort();
  }
}

function createActiveSessionIdentity(storage: WorkflowStorage): string | null {
  const session = readActiveLayoutEditingSession(storage);
  return session ? JSON.stringify({
    roomLayoutId: session.roomLayoutId,
    backendRoomId: session.backendRoomId,
    activeLayoutId: session.activeLayoutId,
    sourceLayoutId: session.sourceLayoutId,
    editingMode: session.editingMode,
    confirmed: session.confirmed,
  }) : null;
}

function throwIfRecommendationCancelled(signal?: AbortSignal): void {
  if (signal?.aborted) throwRecommendationAbort();
}

function throwRecommendationAbort(): never {
  throw new DOMException("The recommendation request is no longer current.", "AbortError");
}

export async function persistActiveEditorLayout(
  storage: WorkflowStorage = localStorage,
  api: LayoutWorkflowApi = defaultApi,
  browserSession: WorkflowStorage | null = defaultBrowserSession(),
): Promise<LayoutNavigationState | null> {
  await pendingEditorLayoutPersistence;
  const room = readSelectedRoomLayout(storage);
  if (!room) return null;
  const owner = readEditorPersistenceOwner(room, storage, browserSession);
  if (!owner) return null;

  return persistEditorLayoutNow(room, owner, storage, api, browserSession, true);
}

export function persistEditorLayoutSnapshot(
  room: RoomLayout,
  storage: WorkflowStorage = localStorage,
  api: LayoutWorkflowApi = defaultApi,
  browserSession: WorkflowStorage | null = defaultBrowserSession(),
): Promise<LayoutNavigationState | null> {
  const owner = readEditorPersistenceOwner(room, storage, browserSession);
  if (!owner) return Promise.resolve(null);

  const persist = () => persistEditorLayoutNow(room, owner, storage, api, browserSession, false);
  const request = pendingEditorLayoutPersistence.then(persist, persist);
  pendingEditorLayoutPersistence = request.then(() => undefined, () => undefined);
  latestEditorLayoutPersistence = request;
  return request;
}

export async function flushEditorLayoutPersistence(): Promise<void> {
  await latestEditorLayoutPersistence;
}

async function persistEditorLayoutNow(
  room: RoomLayout,
  owner: EditorPersistenceOwner,
  storage: WorkflowStorage,
  api: LayoutWorkflowApi,
  browserSession: WorkflowStorage | null,
  persistMirror: boolean,
): Promise<LayoutNavigationState | null> {
  if (!isEditorPersistenceOwnerCurrent(owner, storage, browserSession)) return null;
  assertRecommendationCanBeConfirmed(room, storage, browserSession);

  const saved = await api.updateLayout(owner.activeLayoutId, room);
  assertActiveDraftResponse(saved, owner.activeLayoutId, owner.backendRoomId);
  // Only the "다음 단계"/확정 flush (persistMirror=true) blocks on a bad
  // layout — every in-editor drag-end autosave (persistMirror=false) must
  // still succeed even mid-collision, or the user couldn't drag a piece out
  // of a bad spot in the first place.
  if (persistMirror) {
    assertLayoutIsConfirmable(saved.validationResult);
  }
  if (!isEditorPersistenceOwnerCurrent(owner, storage, browserSession)) return null;

  const savedRoom = applyBackendFurnitureToLayout(room, saved.recommendedFurniture);
  if (persistMirror) persistActiveDraftMirror(savedRoom, storage);
  const session = readActiveLayoutEditingSession(storage);
  const savedSession = saveLayoutResponseSession(room.id, saved, storage, session?.editingMode);
  return createLayoutNavigationState(savedSession, saved, savedRoom);
}

function readEditorPersistenceOwner(
  room: RoomLayout,
  storage: WorkflowStorage,
  browserSession: WorkflowStorage | null,
): EditorPersistenceOwner | null {
  const backendRoomId = parseBackendRoomId(storage.getItem("roomfit:backendRoomId"));
  const session = readActiveLayoutEditingSession(storage);
  if (backendRoomId === null
    || !isSessionForRoom(session, room.id, backendRoomId)
    || session.confirmed) {
    return null;
  }

  return {
    roomLayoutId: room.id,
    backendRoomId,
    activeLayoutId: session.activeLayoutId,
    clientId: browserSession ? getActiveRequestClientId(storage, browserSession) : null,
  };
}

function isEditorPersistenceOwnerCurrent(
  owner: EditorPersistenceOwner,
  storage: WorkflowStorage,
  browserSession: WorkflowStorage | null,
): boolean {
  const selected = readSelectedRoomLayout(storage);
  const backendRoomId = parseBackendRoomId(storage.getItem("roomfit:backendRoomId"));
  const session = readActiveLayoutEditingSession(storage);
  const clientId = browserSession ? getActiveRequestClientId(storage, browserSession) : null;
  return selected?.id === owner.roomLayoutId
    && backendRoomId === owner.backendRoomId
    && isSessionForRoom(session, owner.roomLayoutId, owner.backendRoomId)
    && !session.confirmed
    && session.activeLayoutId === owner.activeLayoutId
    && clientId === owner.clientId;
}

export async function confirmActiveLayout(
  room: RoomLayout,
  storage: WorkflowStorage = localStorage,
  api: LayoutWorkflowApi = defaultApi,
  browserSession: WorkflowStorage | null = defaultBrowserSession(),
): Promise<RoomLayout> {
  const persisted = await persistActiveEditorLayout(storage, api, browserSession);
  const layoutToConfirm = persisted?.roomLayout ?? room;
  const backendRoomId = parseBackendRoomId(storage.getItem("roomfit:backendRoomId"));
  const session = readActiveLayoutEditingSession(storage);

  if (backendRoomId !== null && isSessionForRoom(session, room.id, backendRoomId)) {
    const response = await api.confirmLayout(session.activeLayoutId);
    if (!response.confirmed) {
      throw new Error("Backend did not confirm the active Draft layout.");
    }
    clearActiveLayoutEditingSession(storage);
  }

  return layoutToConfirm;
}

// ERROR-severity issue types — these are what block moving past the editor.
// ZONE_INTRUSION is WARNING-only (see ValidationService.java) and never
// appears here.
const BLOCKING_ISSUE_LABELS: Record<string, string> = {
  BODY_COLLISION: "가구끼리 겹쳐 있어요",
  OUT_OF_BOUNDS: "방 범위를 벗어난 가구가 있어요",
  DOOR_CLEARANCE: "문 앞 공간을 가리고 있어요",
  WINDOW_CLEARANCE: "창문 앞 공간을 가리고 있어요",
  PATH_BLOCKED: "이동 동선을 막고 있어요",
};

export class LayoutValidationBlockedError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "LayoutValidationBlockedError";
  }
}

/**
 * 백엔드는 하드-invalid(충돌/경계/문/창/동선 중 하나라도 실패)한 레이아웃의
 * confirm 자체를 이미 거부하지만(INVALID_FURNITURE_POSITION), 그 전에 "다음
 * 단계"에서부터 왜 못 넘어가는지 구체적으로 알려주기 위한 선제 체크.
 */
function assertLayoutIsConfirmable(validationResult: LayoutValidationResult): void {
  const reasons = describeBlockingIssues(validationResult);
  if (reasons.length > 0) {
    throw new LayoutValidationBlockedError(
      `배치에 문제가 있어 다음 단계로 이동할 수 없어요: ${reasons.join(", ")}`,
    );
  }
}

function describeBlockingIssues(validationResult: LayoutValidationResult): string[] {
  if (validationResult.issues) {
    const errorTypes = new Set(
      validationResult.issues
        .filter((issue) => issue.severity === "ERROR")
        .map((issue) => issue.type),
    );
    return [...errorTypes].map((type) => BLOCKING_ISSUE_LABELS[type] ?? type);
  }

  // Older/mocked responses may not carry `issues` — fall back to the 5
  // summary booleans every LayoutValidationResult has always had.
  const reasons: string[] = [];
  if (!validationResult.collisionFree) reasons.push(BLOCKING_ISSUE_LABELS.BODY_COLLISION);
  if (!validationResult.boundaryValid) reasons.push(BLOCKING_ISSUE_LABELS.OUT_OF_BOUNDS);
  if (!validationResult.doorClearance) reasons.push(BLOCKING_ISSUE_LABELS.DOOR_CLEARANCE);
  if (!validationResult.windowClearance) reasons.push(BLOCKING_ISSUE_LABELS.WINDOW_CLEARANCE);
  if (!validationResult.pathSecured) reasons.push(BLOCKING_ISSUE_LABELS.PATH_BLOCKED);
  return reasons;
}

function assertRecommendationCanBeConfirmed(
  room: RoomLayout,
  storage: WorkflowStorage,
  browserSession: WorkflowStorage | null,
): void {
  if (!browserSession) return;
  const backendRoomId = parseBackendRoomId(storage.getItem("roomfit:backendRoomId"));
  const setup = readRoomSetupSession(browserSession);
  if (backendRoomId === null
    || !setup
    || setup.roomLayoutId !== room.id
    || setup.backendRoomId !== backendRoomId) {
    return;
  }

  const notice = readRecommendationResult({
    sessionId: setup.sessionId,
    roomLayoutId: room.id,
    backendRoomId,
  }, browserSession);
  if (notice?.status === "FAILED") {
    throw new RecommendationFeasibilityError(notice);
  }
}

function readSelectedRoomLayout(storage: WorkflowStorage): RoomLayout | null {
  return parseRoomLayout(storage.getItem("roomfit:selectedRoomLayout"));
}

function parseRoomLayout(raw: string | null): RoomLayout | null {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as RoomLayout;
    return parsed && typeof parsed.id === "string" && Array.isArray(parsed.furniture) ? parsed : null;
  } catch {
    return null;
  }
}

function persistActiveDraftMirror(room: RoomLayout, storage: WorkflowStorage): void {
  storage.setItem("roomfit:selectedRoomLayout", JSON.stringify(room));
}

function assertLayoutOwner(response: LayoutResponse, roomId: number): void {
  if (response.roomId !== roomId) {
    throw new Error("The Backend Layout belongs to a different Room.");
  }
}

function assertActiveDraftResponse(response: LayoutResponse, layoutId: number, roomId: number): void {
  if (response.layoutId !== layoutId || response.roomId !== roomId || response.confirmed) {
    throw new Error("The Backend response does not match the active Draft session.");
  }
}

function readStringArray(raw: string | null): string[] {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter((item): item is string => typeof item === "string") : [];
  } catch {
    return [];
  }
}

function parseBackendRoomId(raw: string | null): number | null {
  if (!raw) return null;
  const parsed = Number(raw);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : null;
}

function isConfirmedReedit(
  roomLayoutId: string,
  backendRoomId: number,
  storage: WorkflowStorage,
  browserSession: WorkflowStorage | null,
): boolean {
  if (!browserSession) return false;
  const setup = readRoomSetupSession(browserSession);
  return setup?.mode === "REEDIT"
    && setup.roomLayoutId === roomLayoutId
    && setup.backendRoomId === backendRoomId
    && hasConfirmedLayout(roomLayoutId, storage, getActiveRequestClientId(storage, browserSession));
}

async function loadRoomDetailForInitialSetup(
  room: RoomLayout,
  backendRoomId: number,
  storage: WorkflowStorage,
  api: LayoutWorkflowApi,
  browserSession: WorkflowStorage | null,
  clearStaleConfirmation = false,
): Promise<RoomLayout> {
  const backendRoom = await api.getRoomLayout(backendRoomId);
  if (backendRoom.id !== room.id) {
    throw new Error("Backend Room response does not match the selected Room.");
  }

  if (clearStaleConfirmation) {
    clearConfirmedLayout(room.id, storage);
  }
  clearActiveLayoutEditingSession(storage);
  recoverInitialSetupSession(room.id, backendRoomId, storage, browserSession);
  storage.setItem("roomfit:selectedRoomLayout", JSON.stringify(backendRoom));
  return backendRoom;
}

function recoverInitialSetupSession(
  roomLayoutId: string,
  backendRoomId: number,
  storage: WorkflowStorage,
  browserSession: WorkflowStorage | null,
): void {
  if (!browserSession) return;
  const setup = readRoomSetupSession(browserSession);
  if (setup?.roomLayoutId === roomLayoutId && setup.backendRoomId === backendRoomId && setup.mode !== "NEW") {
    bindRoomToSetupSession(roomLayoutId, backendRoomId, "NEW", storage, browserSession);
  }
}

function defaultBrowserSession(): WorkflowStorage | null {
  return typeof sessionStorage === "undefined" ? null : sessionStorage;
}

function resolveRecommendationOwner(
  current: LayoutNavigationState,
  browserSession: WorkflowStorage,
): RecommendationResultOwner | null {
  const setup = readRoomSetupSession(browserSession);
  if (!setup
    || setup.roomLayoutId !== current.roomLayoutId
    || setup.backendRoomId !== current.roomId) {
    return null;
  }
  return {
    sessionId: setup.sessionId,
    roomLayoutId: current.roomLayoutId,
    backendRoomId: current.roomId,
  };
}

function assertRecommendationSelectionReady(selectedIds: string[]): void {
  if (resolveRequiredFurnitureTypes(selectedIds).length === 0) {
    throw new AgentContextRequestValidationError("추천에 포함할 가구를 하나 이상 선택해 주세요.");
  }
}

function requirePersistedRecommendation(response: LayoutRecommendationResponse): LayoutResponse {
  if (!isPositiveInteger(response.layoutId)) {
    throw new Error("Backend recommendation response has no persisted layoutId.");
  }
  return { ...response, layoutId: response.layoutId };
}

function isPositiveInteger(value: unknown): value is number {
  return typeof value === "number" && Number.isInteger(value) && value > 0;
}
