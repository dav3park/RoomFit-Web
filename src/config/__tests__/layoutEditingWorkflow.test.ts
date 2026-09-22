import { describe, expect, it, vi } from "vitest";

import {
  buildDefaultAgentContextRequest,
  toFurniturePositionRequest,
  type LayoutRecommendationResponse,
  type LayoutResponse,
} from "../../api/layouts";
import { applyBackendFurnitureToLayout, type BackendFurnitureApiItem } from "../../api/rooms";
import {
  createEditorLayoutState,
  reduceEditorLayoutState,
} from "../../components/editor/editorLayoutState";
import type { Furniture, RoomLayout } from "../../types";
import {
  confirmActiveLayout,
  createRecommendationFingerprintFromRequest,
  flushEditorLayoutPersistence,
  flushManagedFurniturePersistence,
  LayoutValidationBlockedError,
  loadManagedFurnitureLayout,
  persistActiveEditorLayout,
  prepareAdditionalFurnitureForEditor,
  prepareFurnitureSelectionForRecommendation,
  prepareRecommendationTransitionForEditor,
  prepareManagedFurnitureDraft,
  persistManagedFurnitureSnapshot,
  persistEditorLayoutSnapshot,
  refreshActiveDraftNavigationState,
  type LayoutWorkflowApi,
} from "../layoutEditingWorkflow";
import {
  readActiveLayoutEditingSession,
  resolveEditorInitialRoomLayout,
  saveActiveLayoutEditingSession,
} from "../layoutEditingSession";
import {
  readRecommendationResult,
  RecommendationFeasibilityError,
  resolveRecommendationDecision,
  saveRecommendationResult,
} from "../recommendationResult";
import { FurnitureAdditionRequestError } from "../furnitureAdditionError";
import { FurnitureAdditionLimitError } from "../furnitureAdditionPolicy";

const EIGHT_ADDITIONAL_FURNITURE = [
  "bed", "sofa", "desk", "nightstand", "side-table", "desk-chair", "bookshelf", "plant",
];

class MemoryStorage {
  private readonly values = new Map<string, string>();

  getItem(key: string): string | null {
    return this.values.get(key) ?? null;
  }

  setItem(key: string, value: string): void {
    this.values.set(key, value);
  }

  removeItem(key: string): void {
    this.values.delete(key);
  }
}

describe("Draft layout editing workflow", () => {
  it.each([
    ["App 업로드", 41, "app-client"],
    ["Web 직접 생성", 42, "browser-client"],
    ["Sample private copy", 43, "browser-client"],
  ])("keeps the %s room and waits for the explicit recommendation CTA", async (_source, roomId, scope) => {
    const room = createRoom(`api-room-${roomId}`);
    room.width = 4.7;
    room.depth = 3.6;
    room.doors = [{
      id: "door-1", label: "문", position: { x: 0, z: -1.8 },
      dimensions: { width: 0.9, depth: 0.1, height: 2 }, rotationY: 0,
    }];
    const storage = selectedRoomStorage(room, roomId);
    storage.setItem("roomfit:selectedAdditionalFurnitureIds", '["plant"]');
    const browser = setupBrowserStorage(room.id, roomId, `${scope}-${roomId}`);
    const activeScope = JSON.stringify({
      version: 1,
      mode: scope === "app-client" ? "APP_UUID" : "BROWSER_UUID",
      clientId: scope === "app-client"
        ? "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa"
        : "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
      setupSessionId: `${scope}-${roomId}`,
      backendRoomId: roomId,
      roomLayoutId: room.id,
    });
    browser.setItem("roomfit:activeClientScope:v1", activeScope);
    const recommendation = recommendationResponse(51, "SUCCESS", { roomId });
    const api = fakeApi({ recommendation });

    const prepared = await prepareFurnitureSelectionForRecommendation(storage, api);

    expect(prepared).toMatchObject({ roomId, roomLayoutId: room.id, activeLayoutId: null });
    expect(api.createDefaultAgentContext).not.toHaveBeenCalled();
    expect(api.recommendLayout).not.toHaveBeenCalled();
    expect(readRoom(storage)).toMatchObject({ id: room.id, width: 4.7, depth: 3.6 });
    expect(readRoom(storage)?.doors).toEqual(room.doors);
    expect(browser.getItem("roomfit:activeClientScope:v1")).toBe(activeScope);

    const generated = await prepareAdditionalFurnitureForEditor(storage, api, browser);
    expect(api.createDefaultAgentContext).toHaveBeenCalledExactlyOnceWith(roomId);
    expect(api.recommendLayout).toHaveBeenCalledExactlyOnceWith(roomId, 51);
    expect(generated).toMatchObject({ roomId, roomLayoutId: room.id, activeLayoutId: 51 });
    expect(storage.getItem("roomfit:selectedAdditionalFurnitureIds")).toBe('["plant"]');
  });

  it("keeps the public Sample template unchanged and generates its existing private target only once", async () => {
    const publicTemplate = createRoom("sample-template");
    publicTemplate.source = "SAMPLE";
    const originalTemplate = JSON.stringify(publicTemplate);
    const privateCopy = { ...publicTemplate, id: "api-room-43", source: "ROOMPLAN" };
    const storage = selectedRoomStorage(privateCopy, 43);
    storage.setItem("roomfit:selectedAdditionalFurnitureIds", '["plant"]');
    const browser = setupBrowserStorage(privateCopy.id, 43, "sample-private-copy");
    const api = fakeApi({ recommendation: recommendationResponse(71, "SUCCESS", { roomId: 43 }) });

    await prepareFurnitureSelectionForRecommendation(storage, api);
    await prepareAdditionalFurnitureForEditor(storage, api, browser);

    expect(JSON.stringify(publicTemplate)).toBe(originalTemplate);
    expect(storage.getItem("roomfit:backendRoomId")).toBe("43");
    expect(api.recommendLayout).toHaveBeenCalledExactlyOnceWith(43, 51);
  });

  it.each([
    ["휴식/내추럴/우드", "rest", "natural", "brown"],
    ["업무/모던/그레이", "work", "modern", "gray"],
    ["취미/모던/핑크", "hobby", "modern", "pink"],
    ["일반 저장/클래식/아이보리", "storage", "classic", "ivory"],
  ])("routes %s through the same Backend recommendation CTA", async (_label, purpose, style, palette) => {
    const room = createRoom("api-room-9");
    room.source = "ROOMPLAN";
    const storage = selectedRoomStorage(room, 9);
    storage.setItem("roomfit:selectedPurpose", purpose);
    storage.setItem("roomfit:selectedPalette", palette);
    storage.setItem("roomfit:selectedStyle", style);
    storage.setItem("roomfit:selectedAdditionalFurnitureIds", JSON.stringify([
      "sofa", "nightstand", "side-table", "tv", "tv-console", "mood-light", "plant", "monitor",
    ]));
    const browser = setupBrowserStorage(room.id, 9, `backend-${purpose}`);
    const api = fakeApi({ recommendation: recommendationResponse(72, "SUCCESS", { roomId: 9 }) });

    await prepareFurnitureSelectionForRecommendation(storage, api);
    expect(api.createDefaultAgentContext).not.toHaveBeenCalled();
    expect(api.recommendLayout).not.toHaveBeenCalled();

    const generated = await prepareRecommendationTransitionForEditor(storage, api, browser);

    expect(api.createDefaultAgentContext).toHaveBeenCalledExactlyOnceWith(9);
    expect(api.recommendLayout).toHaveBeenCalledExactlyOnceWith(9, 51);
    expect(generated).toMatchObject({ roomId: 9, activeLayoutId: 72, editingMode: "INITIAL_SETUP" });
    expect(storage.getItem("roomfit:selectedAdditionalFurnitureIds")).toBe(JSON.stringify([
      "sofa", "nightstand", "side-table", "tv", "tv-console", "mood-light", "plant", "monitor",
    ]));
    expect(generated?.roomLayout?.furniture.some(({ id }) => id.startsWith("natural-"))).toBe(false);
  });

  it("reuses an existing initial recommendation only when the request fingerprint matches", async () => {
    const room = createRoom();
    const storage = selectedRoomStorage(room);
    storage.setItem("roomfit:selectedAdditionalFurnitureIds", '["plant"]');
    const browser = setupBrowserStorage(room.id, 1, "existing-recommendation");
    const api = fakeApi({ recommendation: recommendationResponse(61, "SUCCESS") });

    await prepareRecommendationTransitionForEditor(storage, api, browser);
    vi.mocked(api.getLayout).mockResolvedValueOnce(response(61, false, null));

    const resumed = await prepareRecommendationTransitionForEditor(storage, api, browser);

    expect(resumed).toMatchObject({ roomId: 1, activeLayoutId: 61, editingMode: "INITIAL_SETUP" });
    expect(api.createDefaultAgentContext).toHaveBeenCalledTimes(1);
    expect(api.recommendLayout).toHaveBeenCalledTimes(1);
  });

  it("does not trust a legacy INITIAL_SETUP Layout without a request fingerprint", async () => {
    const room = createRoom();
    const storage = selectedRoomStorage(room);
    storage.setItem("roomfit:selectedAdditionalFurnitureIds", '["plant"]');
    const browser = setupBrowserStorage(room.id, 1, "legacy-recommendation");
    saveActiveLayoutEditingSession({
      roomLayoutId: room.id,
      backendRoomId: 1,
      activeLayoutId: 61,
      sourceLayoutId: null,
      editingMode: "INITIAL_SETUP",
      confirmed: false,
    }, storage);
    const api = fakeApi({
      active: response(61, false, null),
      recommendation: recommendationResponse(62, "SUCCESS"),
    });

    const resumed = await prepareRecommendationTransitionForEditor(storage, api, browser);

    expect(resumed).toMatchObject({ roomId: 1, activeLayoutId: 62, editingMode: "INITIAL_SETUP" });
    expect(api.getLayout).toHaveBeenCalledExactlyOnceWith(61);
    expect(api.recommendLayout).toHaveBeenCalledExactlyOnceWith(1, 51);
  });

  it.each([
    ["lifestyle", "roomfit:selectedPurpose", "rest"],
    ["style", "roomfit:selectedStyle", "natural"],
    ["color", "roomfit:selectedPalette", "brown"],
    ["selected items", "roomfit:selectedAdditionalFurnitureIds", '["bed","plant"]'],
  ])("generates a new initial Layout when %s changes", async (_label, key, value) => {
    const room = createRoom();
    const storage = selectedRoomStorage(room);
    storage.setItem("roomfit:selectedAdditionalFurnitureIds", '["plant"]');
    const browser = setupBrowserStorage(room.id, 1, `changed-${key}`);
    const api = fakeApi({ recommendation: recommendationResponse(61, "SUCCESS") });

    await prepareRecommendationTransitionForEditor(storage, api, browser);
    storage.setItem(key, value);
    vi.mocked(api.getLayout).mockResolvedValueOnce(response(61, false, null));
    vi.mocked(api.recommendLayout).mockResolvedValueOnce(recommendationResponse(62, "SUCCESS"));

    const regenerated = await prepareRecommendationTransitionForEditor(storage, api, browser);

    expect(regenerated?.activeLayoutId).toBe(62);
    expect(api.recommendLayout).toHaveBeenCalledTimes(2);
  });

  it("generates a new Layout when selectedProductIds no longer match", async () => {
    const room = createRoom();
    const storage = selectedRoomStorage(room);
    storage.setItem("roomfit:selectedAdditionalFurnitureIds", '["plant"]');
    const browser = setupBrowserStorage(room.id, 1, "changed-products");
    const clientId = "11111111-1111-4111-8111-111111111111";
    browser.setItem("roomfit:activeClientScope:v1", JSON.stringify({
      version: 1,
      mode: "BROWSER_UUID",
      clientId,
      setupSessionId: "changed-products",
      backendRoomId: 1,
      roomLayoutId: room.id,
    }));
    const request = buildDefaultAgentContextRequest(1, storage);
    saveActiveLayoutEditingSession({
      roomLayoutId: room.id,
      backendRoomId: 1,
      activeLayoutId: 61,
      sourceLayoutId: null,
      editingMode: "INITIAL_SETUP",
      confirmed: false,
      recommendationFingerprint: createRecommendationFingerprintFromRequest({
        roomLayoutId: room.id,
        clientId,
        request: { ...request, selectedProductIds: ["plant-old-product"] },
      }),
    }, storage);
    const api = fakeApi({
      active: response(61, false, null),
      recommendation: recommendationResponse(62, "SUCCESS"),
    });

    const regenerated = await prepareRecommendationTransitionForEditor(storage, api, browser);

    expect(regenerated?.activeLayoutId).toBe(62);
    expect(api.recommendLayout).toHaveBeenCalledExactlyOnceWith(1, 51);
  });

  it("includes room, optional items, products, and client scope in the fingerprint", () => {
    const base = {
      roomLayoutId: "api-room-1",
      clientId: "11111111-1111-4111-8111-111111111111",
      request: {
        ...buildDefaultAgentContextRequest(1, selectedRoomStorageWithPlant()),
        optionalItems: [],
        selectedProductIds: [],
      },
    };
    const fingerprint = createRecommendationFingerprintFromRequest(base);

    expect(createRecommendationFingerprintFromRequest({
      ...base,
      request: { ...base.request, roomId: 2 },
    })).not.toBe(fingerprint);
    expect(createRecommendationFingerprintFromRequest({
      ...base,
      request: { ...base.request, optionalItems: ["mood_lamp"] },
    })).not.toBe(fingerprint);
    expect(createRecommendationFingerprintFromRequest({
      ...base,
      request: { ...base.request, selectedProductIds: ["plant-product"] },
    })).not.toBe(fingerprint);
    expect(createRecommendationFingerprintFromRequest({
      ...base,
      clientId: "22222222-2222-4222-8222-222222222222",
    })).not.toBe(fingerprint);
  });

  it("does not persist a recommendation when selections change in flight", async () => {
    const room = createRoom();
    const storage = selectedRoomStorage(room);
    storage.setItem("roomfit:selectedAdditionalFurnitureIds", '["plant"]');
    const browser = setupBrowserStorage(room.id, 1, "changed-in-flight");
    const api = fakeApi();
    const deferred = createDeferred<LayoutRecommendationResponse>();
    vi.mocked(api.recommendLayout).mockReturnValueOnce(deferred.promise);

    const pending = prepareRecommendationTransitionForEditor(storage, api, browser);
    await vi.waitFor(() => expect(api.recommendLayout).toHaveBeenCalledTimes(1));
    storage.setItem("roomfit:selectedPurpose", "rest");
    deferred.resolve(recommendationResponse(61, "SUCCESS"));

    await expect(pending).rejects.toMatchObject({ name: "AbortError" });
    expect(readActiveLayoutEditingSession(storage)).toBeNull();
    expect(readRoom(storage)).toEqual(room);
  });

  it("does not persist a recommendation when room and client scope change in flight", async () => {
    const roomA = createRoom("api-room-1");
    const storage = selectedRoomStorage(roomA, 1);
    storage.setItem("roomfit:selectedAdditionalFurnitureIds", '["plant"]');
    const browser = setupBrowserStorage(roomA.id, 1, "scope-in-flight");
    const api = fakeApi();
    const deferred = createDeferred<LayoutRecommendationResponse>();
    vi.mocked(api.recommendLayout).mockReturnValueOnce(deferred.promise);

    const pending = prepareRecommendationTransitionForEditor(storage, api, browser);
    await vi.waitFor(() => expect(api.recommendLayout).toHaveBeenCalledTimes(1));
    const roomB = createRoom("api-room-2");
    selectRoom(storage, roomB, 2);
    browser.setItem("roomfit:activeClientScope:v1", JSON.stringify({
      version: 1,
      mode: "APP_UUID",
      clientId: "22222222-2222-4222-8222-222222222222",
      setupSessionId: "scope-in-flight",
      backendRoomId: 2,
      roomLayoutId: roomB.id,
    }));
    deferred.resolve(recommendationResponse(61, "SUCCESS"));

    await expect(pending).rejects.toMatchObject({ name: "AbortError" });
    expect(readActiveLayoutEditingSession(storage)).toBeNull();
    expect(readRoom(storage)).toEqual(roomB);
  });

  it("loads a newly created Room without making any Layout request", async () => {
    const room = createRoom("api-room-42");
    room.furniture = [];
    const storage = selectedRoomStorage(room, 42);
    const browser = setupBrowserStorage(room.id, 42, "custom-setup");
    const backendRoom = { ...room, name: "Backend custom room", furniture: [] };
    const api = fakeApi({ room: backendRoom });

    const restored = await loadManagedFurnitureLayout(room, 42, storage, api, browser);

    expect(restored).toEqual(backendRoom);
    expect(restored?.furniture).toEqual([]);
    expect(api.getRoomLayout).toHaveBeenCalledWith(42);
    expect(api.getLayout).not.toHaveBeenCalled();
    expect(api.getLatestConfirmedLayout).not.toHaveBeenCalled();
  });

  it("loads existing Room furniture before the first Layout exists", async () => {
    const room = createRoom("api-room-43");
    room.furniture = [];
    const storage = selectedRoomStorage(room, 43);
    const browser = setupBrowserStorage(room.id, 43, "custom-furniture-setup");
    const backendRoom = createRoom(room.id, -0.25, Math.PI / 2);
    const api = fakeApi({ room: backendRoom });

    const restored = await loadManagedFurnitureLayout(room, 43, storage, api, browser);

    expect(restored?.furniture.map((item) => item.id)).toEqual(["bed-1", "desk-1"]);
    expect(api.getRoomLayout).toHaveBeenCalledWith(43);
    expect(api.getLatestConfirmedLayout).not.toHaveBeenCalled();
  });

  it("reloads a persisted initial deletion from Backend Room", async () => {
    const room = createRoom();
    const backend = createRoom();
    backend.furniture[1].status = "deleted";
    const storage = selectedRoomStorage(room);

    const restored = await loadManagedFurnitureLayout(
      room,
      1,
      storage,
      fakeApi({ room: backend }),
    );

    expect(restored?.furniture[1].status).toBe("deleted");
  });

  it("keeps the existing Layout lookup path for a re-edit setup", async () => {
    const room = createRoom("api-room-7");
    const storage = selectedRoomStorage(room, 7);
    const browser = setupBrowserStorage(room.id, 7, "reedit-setup", "REEDIT");
    markConfirmed(storage, room);
    const latest = response(70, true, null, backendFurnitureFromRoom(room), 7);
    const api = fakeApi({ latest });

    const restored = await loadManagedFurnitureLayout(room, 7, storage, api, browser);

    expect(restored).not.toBeNull();
    expect(api.getLatestConfirmedLayout).toHaveBeenCalledWith(7);
    expect(api.getRoomLayout).not.toHaveBeenCalled();
  });

  it("recovers stale confirmed evidence only after the Room remains readable", async () => {
    const room = createRoom("api-room-45");
    const storage = selectedRoomStorage(room, 45);
    const browser = setupBrowserStorage(room.id, 45, "stale-reedit", "REEDIT");
    markConfirmed(storage, room);
    const api = fakeApi({ room, latest: null });

    const restored = await loadManagedFurnitureLayout(room, 45, storage, api, browser);

    expect(restored).toEqual(room);
    expect(api.getLatestConfirmedLayout).toHaveBeenCalledWith(45);
    expect(api.getRoomLayout).toHaveBeenCalledWith(45);
    expect(readActiveLayoutEditingSession(storage)).toBeNull();
    expect(JSON.parse(storage.getItem("roomfit:confirmedLayoutsByRoomId") ?? "{}")[room.id]).toBeUndefined();
    expect(JSON.parse(browser.getItem("roomfit:roomSetupSession") ?? "null")).toMatchObject({
      roomLayoutId: room.id,
      backendRoomId: 45,
      mode: "NEW",
    });
  });

  it("does not recover a stale re-edit when the Room is not readable in the current scope", async () => {
    const room = createRoom("api-room-46");
    const storage = selectedRoomStorage(room, 46);
    const browser = setupBrowserStorage(room.id, 46, "wrong-scope-reedit", "REEDIT");
    markConfirmed(storage, room);
    const api = fakeApi({ latest: null });
    vi.mocked(api.getRoomLayout).mockRejectedValueOnce(new Error("ROOM_NOT_FOUND"));

    await expect(loadManagedFurnitureLayout(room, 46, storage, api, browser))
      .rejects.toThrow("ROOM_NOT_FOUND");

    expect(JSON.parse(storage.getItem("roomfit:confirmedLayoutsByRoomId") ?? "{}")[room.id]).toBeDefined();
    expect(JSON.parse(browser.getItem("roomfit:roomSetupSession") ?? "null").mode).toBe("REEDIT");
  });

  it("preserves move, rotation, and deletion through every intermediate route", async () => {
    const editedRoom = createRoom("api-room-1", -0.8, Math.PI / 2);
    editedRoom.furniture[1].status = "deleted";
    const storage = selectedRoomStorage(editedRoom);
    const browser = setupBrowserStorage(editedRoom.id, 1, "preserve-reedit", "REEDIT");
    markConfirmed(storage, editedRoom);
    const confirmed = response(10, true, null);
    const draft = response(11, false, 10);
    const saved = response(11, false, 10, backendFurnitureFromRoom(editedRoom));
    const api = fakeApi({ latest: confirmed, draft, saved, active: saved });

    const manageState = await prepareManagedFurnitureDraft(storage, api, browser);
    const preferenceState = await refreshActiveDraftNavigationState(storage, api);
    const referenceState = await refreshActiveDraftNavigationState(storage, api);
    const addFurnitureState = await prepareAdditionalFurnitureForEditor(storage, api);

    for (const state of [manageState, preferenceState, referenceState, addFurnitureState]) {
      expect(state).toMatchObject({
        roomId: 1,
        roomLayoutId: "api-room-1",
        sourceLayoutId: 10,
        activeLayoutId: 11,
        editingMode: "REEDIT_DRAFT",
      });
    }
    expect(api.addFurnitureToDraft).not.toHaveBeenCalled();
    expect(addFurnitureState?.roomLayout?.furniture[0].position.x).toBe(-0.8);
    expectEquivalentRotation(addFurnitureState?.roomLayout?.furniture[0].rotationY, Math.PI / 2);
    expect(addFurnitureState?.roomLayout?.furniture[1].status).toBe("deleted");
    expect(resolveEditorInitialRoomLayout({
      navigationState: addFurnitureState,
      activeSession: readActiveLayoutEditingSession(storage),
      selectedRoomLayout: readRoom(storage),
      liveMirror: createRoom("api-room-1", 0.9, 0),
    })).toEqual(addFurnitureState?.roomLayout);
  });

  it("creates a Draft only after the confirmed source and saves the full latest snapshot", async () => {
    const storage = selectedRoomStorage(createRoom("api-room-1", -0.8, Math.PI / 2));
    storage.setItem("roomfit:confirmedRoomLayout", JSON.stringify(createRoom("api-room-1", 0.9, 0)));
    const browser = setupBrowserStorage("api-room-1", 1, "confirmed-source", "REEDIT");
    markConfirmed(storage, createRoom("api-room-1"));
    const api = fakeApi({
      latest: response(10, true, null),
      draft: response(11, false, 10),
      saved: response(11, false, 10, backendFurniture(-0.8, Math.PI / 2)),
    });

    const result = await prepareManagedFurnitureDraft(storage, api, browser);

    expect(result?.activeLayoutId).toBe(11);
    expect(api.createLayoutDraft).toHaveBeenCalledWith(10);
    const [updatedId, fullRoom] = vi.mocked(api.updateLayout).mock.calls[0];
    expect(updatedId).toBe(11);
    expect(fullRoom.furniture.map((item) => item.id)).toEqual(["bed-1", "desk-1"]);
    expect(fullRoom.furniture[0].position).toEqual({ x: -0.8, z: 0 });
    expect(fullRoom.furniture[0].rotationY).toBe(Math.PI / 2);
    expect(readActiveLayoutEditingSession(storage)).toMatchObject({
      activeLayoutId: 11,
      sourceLayoutId: 10,
      editingMode: "REEDIT_DRAFT",
      confirmed: false,
    });
    expect(JSON.parse(storage.getItem("roomfit:confirmedRoomLayout") ?? "null").furniture[0].position.x).toBe(0.9);
  });

  it("reuses an existing unconfirmed Draft and keeps the original source ID", async () => {
    const storage = selectedRoomStorage(createRoom());
    saveDraftSession(storage, 21, 10);
    const childResponse = response(21, false, 20);
    const api = fakeApi({ active: childResponse, saved: childResponse });

    const result = await prepareManagedFurnitureDraft(storage, api);

    expect(result?.activeLayoutId).toBe(21);
    expect(result?.sourceLayoutId).toBe(10);
    expect(api.createLayoutDraft).not.toHaveBeenCalled();
    expect(api.updateLayout).toHaveBeenCalledWith(21, expect.any(Object));
  });

  it("does not navigate or overwrite recovery mirrors when Draft update fails", async () => {
    const room = createRoom("api-room-1", -0.7, Math.PI / 2);
    const storage = selectedRoomStorage(room);
    storage.setItem("roomfit:confirmedRoomLayout", JSON.stringify(createRoom("api-room-1", 0.9, 0)));
    const browser = setupBrowserStorage(room.id, 1, "failed-reedit", "REEDIT");
    markConfirmed(storage, room);
    const api = fakeApi({ latest: response(10, true, null), draft: response(11, false, 10) });
    vi.mocked(api.updateLayout).mockRejectedValueOnce(new Error("network"));

    await expect(prepareManagedFurnitureDraft(storage, api, browser)).rejects.toThrow("network");

    expect(readRoom(storage)?.furniture[0].position.x).toBe(-0.7);
    expect(JSON.parse(storage.getItem("roomfit:confirmedRoomLayout") ?? "null").furniture[0].position.x).toBe(0.9);
    expect(readActiveLayoutEditingSession(storage)?.activeLayoutId).toBe(11);
  });

  it("keeps the Draft byte-for-byte unchanged when Add Furniture has no selection", async () => {
    const room = createRoom("api-room-1", -0.65, Math.PI / 2);
    const storage = selectedRoomStorage(room);
    saveDraftSession(storage, 11, 10);
    const active = response(11, false, 10, backendFurnitureFromRoom(room));
    const api = fakeApi({ active });

    const before = JSON.stringify(active.recommendedFurniture);
    const result = await prepareAdditionalFurnitureForEditor(storage, api);

    expect(JSON.stringify(result?.layoutResponse?.recommendedFurniture)).toBe(before);
    expect(api.createDefaultAgentContext).not.toHaveBeenCalled();
    expect(api.addFurnitureToDraft).not.toHaveBeenCalled();
  });

  it("adds only selected missing furniture while preserving existing Draft coordinates", async () => {
    const room = createRoom("api-room-1", -0.6, Math.PI / 2);
    const storage = selectedRoomStorage(room);
    storage.setItem("roomfit:selectedAdditionalFurnitureIds", JSON.stringify(["mood-light"]));
    saveDraftSession(storage, 11, 10);
    const active = response(11, false, 10, backendFurnitureFromRoom(room));
    const addedItems = [...active.recommendedFurniture, backendItem("lamp-rec-1", "lamp", 1.1, 0.5, 0)];
    const added = response(11, false, 10, addedItems);
    const api = fakeApi({ active, added });

    const result = await prepareAdditionalFurnitureForEditor(storage, api);

    expect(api.createDefaultAgentContext).toHaveBeenCalledWith(1);
    expect(api.addFurnitureToDraft).toHaveBeenCalledWith(11, { contextId: 51 });
    expect(result?.roomLayout?.furniture.map((item) => item.id)).toEqual(["bed-1", "desk-1", "lamp-rec-1"]);
    expect(result?.roomLayout?.furniture[0].position.x).toBeCloseTo(-0.6);
    expectEquivalentRotation(result?.roomLayout?.furniture[0].rotationY, Math.PI / 2);
  });

  it("keeps the existing Draft intact when additive placement fails", async () => {
    const room = createRoom("api-room-1", -0.6, Math.PI / 2);
    const storage = selectedRoomStorage(room);
    storage.setItem("roomfit:selectedAdditionalFurnitureIds", JSON.stringify(["mood-light"]));
    saveDraftSession(storage, 11, 10);
    const active = response(11, false, 10, backendFurnitureFromRoom(room));
    const api = fakeApi({ active });
    vi.mocked(api.addFurnitureToDraft).mockRejectedValueOnce(new Error("no placement"));

    await expect(prepareAdditionalFurnitureForEditor(storage, api)).rejects.toThrow("no placement");

    expect(readRoom(storage)?.furniture.map((item) => item.id)).toEqual(["bed-1", "desk-1"]);
    expect(readRoom(storage)?.furniture[0].position.x).toBeCloseTo(-0.6);
    expect(readActiveLayoutEditingSession(storage)?.activeLayoutId).toBe(11);
  });

  it.each([
    [0, EIGHT_ADDITIONAL_FURNITURE],
    [4, EIGHT_ADDITIONAL_FURNITURE],
  ])("allows existing %i plus selections up to the final limit", async (existingCount, selectedIds) => {
    const room = roomWithFurnitureCount(existingCount);
    const storage = selectedRoomStorage(room);
    storage.setItem("roomfit:selectedAdditionalFurnitureIds", JSON.stringify(selectedIds));
    saveDraftSession(storage, 11, 10);
    const active = response(11, false, 10, backendFurnitureFromRoom(room));
    const api = fakeApi({ active, added: active });

    await expect(prepareAdditionalFurnitureForEditor(storage, api)).resolves.not.toBeNull();

    expect(api.createDefaultAgentContext).toHaveBeenCalledTimes(1);
    expect(api.addFurnitureToDraft).toHaveBeenCalledWith(11, { contextId: 51 });
  });

  it.each([
    [5, EIGHT_ADDITIONAL_FURNITURE],
    [12, ["bed"]],
    [0, [...EIGHT_ADDITIONAL_FURNITURE, "rug"]],
  ])("blocks existing %i before every Backend request and preserves selection", async (existingCount, selectedIds) => {
    const room = roomWithFurnitureCount(existingCount);
    const storage = selectedRoomStorage(room);
    const serializedSelection = JSON.stringify(selectedIds);
    storage.setItem("roomfit:selectedAdditionalFurnitureIds", serializedSelection);
    saveDraftSession(storage, 11, 10);
    const api = fakeApi();

    await expect(prepareAdditionalFurnitureForEditor(storage, api))
      .rejects.toBeInstanceOf(FurnitureAdditionLimitError);

    expect(api.getLayout).not.toHaveBeenCalled();
    expect(api.getLatestConfirmedLayout).not.toHaveBeenCalled();
    expect(api.createDefaultAgentContext).not.toHaveBeenCalled();
    expect(api.addFurnitureToDraft).not.toHaveBeenCalled();
    expect(api.recommendLayout).not.toHaveBeenCalled();
    expect(storage.getItem("roomfit:selectedAdditionalFurnitureIds")).toBe(serializedSelection);
    expect(readRoom(storage)?.furniture).toHaveLength(existingCount);
  });

  it("allows retry after the user closes the limit dialog and removes one selection", async () => {
    const room = roomWithFurnitureCount(5);
    const storage = selectedRoomStorage(room);
    storage.setItem("roomfit:selectedAdditionalFurnitureIds", JSON.stringify(EIGHT_ADDITIONAL_FURNITURE));
    saveDraftSession(storage, 11, 10);
    const active = response(11, false, 10, backendFurnitureFromRoom(room));
    const api = fakeApi({ active, added: active });

    await expect(prepareAdditionalFurnitureForEditor(storage, api))
      .rejects.toBeInstanceOf(FurnitureAdditionLimitError);
    expect(storage.getItem("roomfit:selectedAdditionalFurnitureIds"))
      .toBe(JSON.stringify(EIGHT_ADDITIONAL_FURNITURE));

    storage.setItem(
      "roomfit:selectedAdditionalFurnitureIds",
      JSON.stringify(EIGHT_ADDITIONAL_FURNITURE.slice(0, 7)),
    );
    await expect(prepareAdditionalFurnitureForEditor(storage, api)).resolves.not.toBeNull();

    expect(api.addFurnitureToDraft).toHaveBeenCalledTimes(1);
  });

  it("keeps Backend 422 as a retryable domain rejection without changing the Layout or selection", async () => {
    const room = roomWithFurnitureCount(2);
    const storage = selectedRoomStorage(room);
    storage.setItem("roomfit:selectedAdditionalFurnitureIds", JSON.stringify(["plant"]));
    saveDraftSession(storage, 11, 10);
    const active = response(11, false, 10, backendFurnitureFromRoom(room));
    const api = fakeApi({ active, added: active });
    vi.mocked(api.addFurnitureToDraft).mockRejectedValueOnce(
      new FurnitureAdditionRequestError("PLACEMENT_REJECTED"),
    );

    await expect(prepareAdditionalFurnitureForEditor(storage, api))
      .rejects.toMatchObject({ kind: "PLACEMENT_REJECTED" });

    expect(storage.getItem("roomfit:selectedAdditionalFurnitureIds")).toBe('["plant"]');
    expect(JSON.stringify(readRoom(storage)))
      .toBe(JSON.stringify(applyBackendFurnitureToLayout(room, active.recommendedFurniture)));
    expect(readActiveLayoutEditingSession(storage)?.activeLayoutId).toBe(11);

    await expect(prepareAdditionalFurnitureForEditor(storage, api)).resolves.not.toBeNull();
    expect(api.addFurnitureToDraft).toHaveBeenCalledTimes(2);
  });

  it("uses Backend Draft over both stale selected and confirmed mirrors after refresh", async () => {
    const storage = selectedRoomStorage(createRoom("api-room-1", 0.8, 0));
    storage.setItem("roomfit:confirmedRoomLayout", JSON.stringify(createRoom("api-room-1", 0.9, 0)));
    saveDraftSession(storage, 42, 40);
    const active = response(42, false, 40, backendFurniture(-0.4, Math.PI / 2));
    const api = fakeApi({ active });

    expect(resolveEditorInitialRoomLayout({
      navigationState: null,
      activeSession: readActiveLayoutEditingSession(storage),
      selectedRoomLayout: readRoom(storage),
      liveMirror: createRoom("api-room-1", 0.9, 0),
    })).toBeNull();

    const recovered = await refreshActiveDraftNavigationState(storage, api);
    expect(recovered?.roomLayout?.furniture[0].position.x).toBeCloseTo(-0.4);
    expectEquivalentRotation(recovered?.roomLayout?.furniture[0].rotationY, Math.PI / 2);
  });

  it("does not expose Room A Draft while Room B is selected and recovers A on return", async () => {
    const roomA = createRoom("api-room-a", -0.4, Math.PI / 2);
    const storage = selectedRoomStorage(roomA, 1);
    saveDraftSession(storage, 31, 30, roomA.id, 1);
    const api = fakeApi({ active: response(31, false, 30, backendFurnitureFromRoom(roomA), 1) });

    const roomB = createRoom("api-room-b", 0.6, 0);
    selectRoom(storage, roomB, 2);
    vi.mocked(api.getLatestConfirmedLayout).mockResolvedValueOnce(null);
    const roomBState = await refreshActiveDraftNavigationState(storage, api);
    expect(roomBState).toMatchObject({ roomId: 2, roomLayoutId: "api-room-b", editingMode: "INITIAL_SETUP" });
    expect(api.getLayout).not.toHaveBeenCalled();

    selectRoom(storage, roomA, 1);
    const roomAState = await refreshActiveDraftNavigationState(storage, api);
    expect(roomAState?.activeLayoutId).toBe(31);
    expect(roomAState?.roomLayout?.furniture[0].position.x).toBeCloseTo(-0.4);
  });

  it("keeps INITIAL_SETUP separate when no confirmed Layout exists", async () => {
    const storage = selectedRoomStorage(createRoom());
    const api = fakeApi({ latest: null });

    const result = await prepareManagedFurnitureDraft(storage, api);

    expect(result).toMatchObject({
      activeLayoutId: null,
      sourceLayoutId: null,
      editingMode: "INITIAL_SETUP",
    });
    expect(api.createLayoutDraft).not.toHaveBeenCalled();
    expect(api.updateLayout).not.toHaveBeenCalled();
  });

  it("persists initial manage-furniture deletion before next navigation", async () => {
    const room = createRoom();
    room.furniture[1].status = "deleted";
    const storage = selectedRoomStorage(room);
    const api = fakeApi({ latest: null, replacedRoom: room });

    const state = await prepareManagedFurnitureDraft(storage, api);

    expect(api.replaceRoomFurniture).toHaveBeenCalledWith(1, room);
    expect(state?.roomLayout?.furniture[1].status).toBe("deleted");
  });

  it("uses Layout Draft persistence instead of Room replacement during re-edit", async () => {
    const room = createRoom();
    const storage = selectedRoomStorage(room);
    const api = fakeApi({ saved: response(31, false, 10) });
    saveDraftSession(storage, 31, 10);

    await persistManagedFurnitureSnapshot(room, storage, api);

    expect(api.updateLayout).toHaveBeenCalledWith(31, room);
    expect(api.replaceRoomFurniture).not.toHaveBeenCalled();
  });

  it("serializes manage-furniture snapshots in user action order", async () => {
    const firstRoom = createRoom("api-room-1", -0.4);
    const secondRoom = createRoom("api-room-1", 0.4);
    const storage = selectedRoomStorage(firstRoom);
    const first = createDeferred<RoomLayout>();
    const api = fakeApi();
    vi.mocked(api.replaceRoomFurniture)
      .mockReturnValueOnce(first.promise)
      .mockResolvedValueOnce(secondRoom);

    const firstSave = persistManagedFurnitureSnapshot(firstRoom, storage, api);
    const secondSave = persistManagedFurnitureSnapshot(secondRoom, storage, api);
    await vi.waitFor(() => expect(api.replaceRoomFurniture).toHaveBeenCalledTimes(1));
    first.resolve(firstRoom);
    await firstSave;
    await secondSave;

    expect(vi.mocked(api.replaceRoomFurniture).mock.calls.map(([, saved]) => saved.furniture[0].position.x))
      .toEqual([-0.4, 0.4]);
  });

  it("does not send an old queued snapshot after another Room is selected", async () => {
    const firstRoom = createRoom("api-room-1", -0.4);
    const staleRoom = createRoom("api-room-1", 0.4);
    const nextRoom = createRoom("api-room-2", 0.8);
    const storage = selectedRoomStorage(firstRoom);
    const first = createDeferred<RoomLayout>();
    const api = fakeApi();
    vi.mocked(api.replaceRoomFurniture).mockReturnValueOnce(first.promise);

    const firstSave = persistManagedFurnitureSnapshot(firstRoom, storage, api);
    await vi.waitFor(() => expect(api.replaceRoomFurniture).toHaveBeenCalledTimes(1));
    const staleSave = persistManagedFurnitureSnapshot(staleRoom, storage, api);
    selectRoom(storage, nextRoom, 2);
    first.resolve(firstRoom);

    await expect(firstSave).resolves.toBeNull();
    await expect(staleSave).resolves.toBeNull();
    expect(api.replaceRoomFurniture).toHaveBeenCalledExactlyOnceWith(1, firstRoom);
    expect(readRoom(storage)).toEqual(nextRoom);
  });

  it("does not send an old queued snapshot after the active Draft changes", async () => {
    const firstRoom = createRoom("api-room-1", -0.4);
    const staleRoom = createRoom("api-room-1", 0.4);
    const storage = selectedRoomStorage(firstRoom);
    saveDraftSession(storage, 31, 10);
    const first = createDeferred<LayoutResponse>();
    const api = fakeApi();
    vi.mocked(api.updateLayout).mockReturnValueOnce(first.promise);

    const firstSave = persistManagedFurnitureSnapshot(firstRoom, storage, api);
    await vi.waitFor(() => expect(api.updateLayout).toHaveBeenCalledTimes(1));
    const staleSave = persistManagedFurnitureSnapshot(staleRoom, storage, api);
    saveDraftSession(storage, 32, 10);
    first.resolve(response(31, false, 10, backendFurnitureFromRoom(firstRoom)));

    await expect(firstSave).resolves.toBeNull();
    await expect(staleSave).resolves.toBeNull();
    expect(api.updateLayout).toHaveBeenCalledExactlyOnceWith(31, firstRoom);
  });

  it("drops manage-furniture persistence when the client scope changes", async () => {
    const room = createRoom();
    const storage = selectedRoomStorage(room);
    const browser = setupBrowserStorage(room.id, 1, "scope-a");
    const activeScope = (clientId: string, setupSessionId: string) => JSON.stringify({
      version: 1,
      mode: "APP_UUID",
      clientId,
      setupSessionId,
      backendRoomId: 1,
      roomLayoutId: room.id,
    });
    browser.setItem("roomfit:activeClientScope:v1", activeScope(
      "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
      "scope-a",
    ));
    const api = fakeApi();

    const pending = persistManagedFurnitureSnapshot(room, storage, api, browser);
    browser.setItem("roomfit:activeClientScope:v1", activeScope(
      "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
      "scope-b",
    ));

    await expect(pending).resolves.toBeNull();
    expect(api.replaceRoomFurniture).not.toHaveBeenCalled();
  });

  it("does not let an older success replace a newer local snapshot when the newer save fails", async () => {
    const firstRoom = createRoom("api-room-1", -0.4);
    const latestRoom = createRoom("api-room-1", 0.4);
    const storage = selectedRoomStorage(firstRoom);
    const first = createDeferred<RoomLayout>();
    const api = fakeApi();
    vi.mocked(api.replaceRoomFurniture)
      .mockReturnValueOnce(first.promise)
      .mockRejectedValueOnce(new Error("latest save failed"));

    const firstSave = persistManagedFurnitureSnapshot(firstRoom, storage, api);
    await vi.waitFor(() => expect(api.replaceRoomFurniture).toHaveBeenCalledTimes(1));
    storage.setItem("roomfit:selectedRoomLayout", JSON.stringify(latestRoom));
    const latestSave = persistManagedFurnitureSnapshot(latestRoom, storage, api);
    const latestFailure = expect(latestSave).rejects.toThrow("latest save failed");
    first.resolve(firstRoom);

    await expect(firstSave).resolves.toEqual(firstRoom);
    expect(readRoom(storage)).toEqual(latestRoom);
    await latestFailure;
    expect(readRoom(storage)).toEqual(latestRoom);

    vi.mocked(api.replaceRoomFurniture).mockResolvedValueOnce(latestRoom);
    await persistManagedFurnitureSnapshot(latestRoom, storage, api);
  });

  it("keeps the edited mirror and rejects navigation when Room persistence fails", async () => {
    const room = createRoom();
    room.furniture[1].status = "deleted";
    const serializedRoom = JSON.stringify(room);
    const storage = selectedRoomStorage(room);
    const api = fakeApi();
    vi.mocked(api.replaceRoomFurniture).mockRejectedValueOnce(new Error("save failed"));

    await expect(persistManagedFurnitureSnapshot(room, storage, api)).rejects.toThrow("save failed");
    expect(storage.getItem("roomfit:selectedRoomLayout")).toBe(serializedRoom);
    await expect(prepareManagedFurnitureDraft(storage, api)).rejects.toThrow("save failed");
    expect(storage.getItem("roomfit:selectedRoomLayout")).toBe(serializedRoom);

    vi.mocked(api.replaceRoomFurniture).mockResolvedValueOnce(room);
    await persistManagedFurnitureSnapshot(room, storage, api);
    await expect(flushManagedFurniturePersistence()).resolves.toBeUndefined();
  });

  it("enters initial setup without probing a Layout endpoint for a new Room", async () => {
    const room = createRoom("api-room-44");
    const storage = selectedRoomStorage(room, 44);
    const browser = setupBrowserStorage(room.id, 44, "no-layout-setup");
    const api = fakeApi();

    const result = await prepareManagedFurnitureDraft(storage, api, browser);

    expect(result).toMatchObject({
      roomId: 44,
      roomLayoutId: room.id,
      activeLayoutId: null,
      sourceLayoutId: null,
      editingMode: "INITIAL_SETUP",
    });
    expect(api.getLayout).not.toHaveBeenCalled();
    expect(api.getLatestConfirmedLayout).not.toHaveBeenCalled();
    expect(api.getRoomLayout).not.toHaveBeenCalled();
  });

  it("creates and persists an initial Layout before navigating to Editor", async () => {
    const room = createRoom();
    const storage = selectedRoomStorage(room);
    storage.setItem("roomfit:selectedAdditionalFurnitureIds", '["plant"]');
    const browser = setupBrowserStorage(room.id, 1, "setup-success");
    const recommendation = recommendationResponse(51, "SUCCESS");
    const api = fakeApi({ latest: null, recommendation });

    const result = await prepareAdditionalFurnitureForEditor(storage, api, browser);

    expect(api.createDefaultAgentContext).toHaveBeenCalledWith(1);
    expect(api.recommendLayout).toHaveBeenCalledWith(1, 51);
    expect(result?.activeLayoutId).toBe(51);
    expect(result?.roomLayout?.furniture.map((item) => item.id)).toEqual(["bed-1", "desk-1"]);
    expect(readActiveLayoutEditingSession(storage)).toMatchObject({
      activeLayoutId: 51,
      editingMode: "INITIAL_SETUP",
    });
  });

  it("keeps the legacy recommendation success flow when additive fields are absent", async () => {
    const room = createRoom();
    const storage = selectedRoomStorage(room);
    storage.setItem("roomfit:selectedAdditionalFurnitureIds", '["plant"]');
    const legacy = response(54, false, null) as LayoutRecommendationResponse;
    const api = fakeApi({ latest: null, recommendation: legacy });

    const result = await prepareAdditionalFurnitureForEditor(storage, api, new MemoryStorage());

    expect(result?.activeLayoutId).toBe(54);
    expect(readActiveLayoutEditingSession(storage)?.activeLayoutId).toBe(54);
  });

  it("does not impose an artificial fixed delay on a production-reachable recommendation", async () => {
    vi.useFakeTimers();
    const room = createRoom();
    const storage = selectedRoomStorage(room);
    storage.setItem("roomfit:selectedPurpose", "rest");
    storage.setItem("roomfit:selectedStyle", "natural");
    storage.setItem("roomfit:selectedPalette", "brown");
    storage.setItem("roomfit:selectedAdditionalFurnitureIds", '["bed"]');
    const api = fakeApi({ latest: null });

    try {
      let settled = false;
      const generation = prepareAdditionalFurnitureForEditor(storage, api, new MemoryStorage())
        .then((result) => {
          settled = true;
          return result;
        });
      await vi.advanceTimersByTimeAsync(0);

      expect(settled).toBe(true);
      expect((await generation)?.activeLayoutId).toBe(51);
      expect(api.createDefaultAgentContext).toHaveBeenCalledExactlyOnceWith(1);
      expect(api.recommendLayout).toHaveBeenCalledExactlyOnceWith(1, 51);
    } finally {
      vi.useRealTimers();
    }
  });

  it("persists PARTIAL_SUCCESS details for the same setup and applies placed furniture", async () => {
    const room = createRoom();
    const storage = selectedRoomStorage(room);
    storage.setItem("roomfit:selectedAdditionalFurnitureIds", '["plant"]');
    const browser = setupBrowserStorage(room.id, 1, "setup-partial");
    const recommendation = recommendationResponse(52, "PARTIAL_SUCCESS", {
      requestedFurnitureCount: 3,
      placedFurnitureCount: 2,
      unplacedFurniture: [{
        requestIndex: 2,
        furnitureType: "sofa",
        productId: "sofa-01",
        variantId: null,
        reasonCode: "COLLISION_DETECTED",
        message: "소파가 다른 가구와 충돌합니다.",
      }],
      warningCode: "INSUFFICIENT_ROOM_SPACE",
      message: "일부 가구만 배치했습니다.",
    });
    const api = fakeApi({ latest: null, recommendation });

    const result = await prepareAdditionalFurnitureForEditor(storage, api, browser);

    expect(result?.activeLayoutId).toBe(52);
    expect(readRecommendationResult({
      sessionId: "setup-partial",
      roomLayoutId: room.id,
      backendRoomId: 1,
    }, browser)).toMatchObject({
      status: "PARTIAL_SUCCESS",
      requestedFurnitureCount: 3,
      placedFurnitureCount: 2,
      warningCode: "INSUFFICIENT_ROOM_SPACE",
    });
  });

  it("keeps selections and Layout state intact on FAILED, then allows retry", async () => {
    const room = createRoom();
    const storage = selectedRoomStorage(room);
    storage.setItem("roomfit:selectedAdditionalFurnitureIds", JSON.stringify(["bed", "sofa"]));
    const browser = setupBrowserStorage(room.id, 1, "setup-retry");
    const failed = recommendationResponse(null, "FAILED", {
      requestedFurnitureCount: 2,
      placedFurnitureCount: 0,
      unplacedFurniture: [{
        requestIndex: 0,
        furnitureType: "bed",
        reasonCode: "NO_VALID_BOUNDARY_PLACEMENT",
        message: "침대를 방 경계 안에 배치할 수 없습니다.",
      }],
      warningCode: "INSUFFICIENT_ROOM_SPACE",
      message: "공간이 부족합니다.",
    });
    const api = fakeApi({ latest: null, recommendation: failed });
    const before = storage.getItem("roomfit:selectedRoomLayout");

    await expect(prepareAdditionalFurnitureForEditor(storage, api, browser))
      .rejects.toBeInstanceOf(RecommendationFeasibilityError);

    expect(storage.getItem("roomfit:selectedRoomLayout")).toBe(before);
    expect(storage.getItem("roomfit:selectedAdditionalFurnitureIds")).toBe('["bed","sofa"]');
    expect(readActiveLayoutEditingSession(storage)).toBeNull();

    vi.mocked(api.recommendLayout).mockResolvedValueOnce(recommendationResponse(53, "SUCCESS"));
    storage.setItem("roomfit:selectedAdditionalFurnitureIds", JSON.stringify(["bed"]));
    const retried = await prepareAdditionalFurnitureForEditor(storage, api, browser);

    expect(retried?.activeLayoutId).toBe(53);
    expect(api.recommendLayout).toHaveBeenCalledTimes(2);
    expect(readRecommendationResult({
      sessionId: "setup-retry",
      roomLayoutId: room.id,
      backendRoomId: 1,
    }, browser)).toBeNull();
  });

  it("does not overwrite an unrelated active Layout ID with a FAILED response", async () => {
    const room = createRoom("api-room-2");
    const storage = selectedRoomStorage(room, 2);
    storage.setItem("roomfit:selectedAdditionalFurnitureIds", '["plant"]');
    saveDraftSession(storage, 88, 80, "api-room-1", 1);
    const browser = setupBrowserStorage(room.id, 2, "setup-room-2");
    const api = fakeApi({
      latest: null,
      recommendation: recommendationResponse(null, "FAILED", { roomId: 2 }),
    });

    await expect(prepareAdditionalFurnitureForEditor(storage, api, browser))
      .rejects.toBeInstanceOf(RecommendationFeasibilityError);

    expect(readActiveLayoutEditingSession(storage)?.activeLayoutId).toBe(88);
  });

  it("keeps the last partial Layout when a revised selection returns FAILED", async () => {
    const room = createRoom();
    const storage = selectedRoomStorage(room);
    storage.setItem("roomfit:selectedAdditionalFurnitureIds", '["plant"]');
    const browser = setupBrowserStorage(room.id, 1, "setup-partial-retry");
    const api = fakeApi({
      latest: null,
      recommendation: recommendationResponse(61, "PARTIAL_SUCCESS", {
        requestedFurnitureCount: 2,
        placedFurnitureCount: 1,
      }),
    });
    const partial = await prepareAdditionalFurnitureForEditor(storage, api, browser);
    const partialMirror = storage.getItem("roomfit:selectedRoomLayout");
    expect(partial?.activeLayoutId).toBe(61);

    vi.mocked(api.getLayout).mockResolvedValueOnce({
      ...response(61, false, null),
      recommendationStatus: "PARTIAL_SUCCESS",
    });
    vi.mocked(api.recommendLayout).mockResolvedValueOnce(recommendationResponse(null, "FAILED"));

    await expect(prepareAdditionalFurnitureForEditor(storage, api, browser))
      .rejects.toBeInstanceOf(RecommendationFeasibilityError);

    expect(readActiveLayoutEditingSession(storage)?.activeLayoutId).toBe(61);
    expect(storage.getItem("roomfit:selectedRoomLayout")).toBe(partialMirror);
  });

  it("keeps a transport failure distinct from a normal feasibility result", async () => {
    const room = createRoom();
    const storage = selectedRoomStorage(room);
    storage.setItem("roomfit:selectedAdditionalFurnitureIds", '["plant"]');
    const browser = setupBrowserStorage(room.id, 1, "setup-network");
    const api = fakeApi({ latest: null });
    vi.mocked(api.recommendLayout).mockRejectedValueOnce(new Error("network unavailable"));

    await expect(prepareAdditionalFurnitureForEditor(storage, api, browser))
      .rejects.toThrow("network unavailable");

    expect(readRecommendationResult({
      sessionId: "setup-network",
      roomLayoutId: room.id,
      backendRoomId: 1,
    }, browser)).toBeNull();
    expect(readActiveLayoutEditingSession(storage)).toBeNull();
  });

  it("serializes every ID, center-origin pose, and DELETED status", () => {
    const room = createRoom("api-room-1", -0.8, Math.PI / 2);
    room.furniture[0].status = "user_modified";
    room.furniture[1].status = "deleted";

    const request = room.furniture.map((item) => toFurniturePositionRequest(room, item));

    expect(request.map((item) => item.id)).toEqual(["bed-1", "desk-1"]);
    expect(request[0]).toEqual({
      id: "bed-1",
      position: { x: 1.2, z: 1.5 },
      rotation: 270,
      status: "USER_MODIFIED",
    });
    expect(request[1].status).toBe("DELETED");
  });

  it("persists selected furniture reset for rotation, deletion, and movement before refresh and confirm", async () => {
    const original = createRoom();
    const storage = selectedRoomStorage(original);
    saveDraftSession(storage, 31, 10);
    let backendDraft = response(31, false, 10, backendFurnitureFromRoom(original));
    const api = fakeApi({ active: backendDraft, saved: backendDraft });
    vi.mocked(api.getLayout).mockImplementation(async () => backendDraft);
    vi.mocked(api.updateLayout).mockImplementation(async (layoutId, nextRoom) => {
      backendDraft = response(layoutId, false, 10, backendFurnitureFromRoom(nextRoom));
      return backendDraft;
    });

    const persist = async (nextRoom: RoomLayout) => {
      storage.setItem("roomfit:selectedRoomLayout", JSON.stringify(nextRoom));
      await persistEditorLayoutSnapshot(nextRoom, storage, api);
    };
    const resetToBaseline = (editedRoom: RoomLayout, furnitureId: string) => {
      let state = createEditorLayoutState(original, "room-1:client-a:layout-31");
      state = reduceEditorLayoutState(state, {
        type: "edit",
        scopeKey: state.scopeKey,
        update: () => editedRoom,
      });
      state = reduceEditorLayoutState(state, {
        type: "resetFurniture",
        scopeKey: state.scopeKey,
        furnitureId,
      });
      return state.persistenceRequest!.roomLayout;
    };

    const rotated = {
      ...original,
      furniture: original.furniture.map((item) => item.id === "bed-1"
        ? { ...item, rotationY: Math.PI / 2 }
        : item),
    };
    await persist(rotated);
    expect(backendDraft.recommendedFurniture[0].rotation).toBe(270);
    await persist(resetToBaseline(rotated, "bed-1"));
    const rotationRefresh = await refreshActiveDraftNavigationState(storage, api);
    expectEquivalentRotation(rotationRefresh?.roomLayout?.furniture[0].rotationY, original.furniture[0].rotationY);

    const deleted = {
      ...original,
      furniture: original.furniture.map((item) => item.id === "desk-1"
        ? { ...item, status: "deleted" as const }
        : item),
    };
    await persist(deleted);
    expect(backendDraft.recommendedFurniture[1].status).toBe("DELETED");
    await persist(resetToBaseline(deleted, "desk-1"));
    const deletionRefresh = await refreshActiveDraftNavigationState(storage, api);
    expect(deletionRefresh?.roomLayout?.furniture[1]).toMatchObject({
      status: "user_modified",
      productId: original.furniture[1].productId,
      variantId: original.furniture[1].variantId,
    });
    expect(deletionRefresh?.roomLayout?.furniture[1].position.x).toBeCloseTo(original.furniture[1].position.x);
    expect(deletionRefresh?.roomLayout?.furniture[1].position.z).toBeCloseTo(original.furniture[1].position.z);
    expectEquivalentRotation(
      deletionRefresh?.roomLayout?.furniture[1].rotationY,
      original.furniture[1].rotationY,
    );

    const moved = {
      ...original,
      furniture: original.furniture.map((item) => item.id === "bed-1"
        ? { ...item, position: { x: 1.1, z: -0.6 } }
        : item),
    };
    await persist(moved);
    expect(backendDraft.recommendedFurniture[0].position).toEqual({ x: 3.1, z: 0.9 });
    await persist(resetToBaseline(moved, "bed-1"));
    const moveRefresh = await refreshActiveDraftNavigationState(storage, api);
    expect(moveRefresh?.roomLayout?.furniture[0].position).toEqual(original.furniture[0].position);

    const confirmed = await confirmActiveLayout(moveRefresh!.roomLayout!, storage, api);
    expect(confirmed.furniture).toEqual(moveRefresh?.roomLayout?.furniture);
    expect(api.confirmLayout).toHaveBeenCalledWith(31);
  });

  it("drops a queued editor snapshot when the client scope changes", async () => {
    const room = createRoom();
    const storage = selectedRoomStorage(room);
    saveDraftSession(storage, 31, 10);
    const browser = setupBrowserStorage(room.id, 1, "scope-a");
    const activeScope = (clientId: string, setupSessionId: string) => JSON.stringify({
      version: 1,
      mode: "APP_UUID",
      clientId,
      setupSessionId,
      backendRoomId: 1,
      roomLayoutId: room.id,
    });
    browser.setItem("roomfit:activeClientScope:v1", activeScope(
      "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
      "scope-a",
    ));
    const api = fakeApi();

    const pending = persistEditorLayoutSnapshot(room, storage, api, browser);
    browser.setItem("roomfit:activeClientScope:v1", activeScope(
      "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
      "scope-b",
    ));

    await expect(pending).resolves.toBeNull();
    expect(api.updateLayout).not.toHaveBeenCalled();
  });

  it("surfaces the latest editor persistence failure before dependent requests", async () => {
    const room = createRoom();
    const storage = selectedRoomStorage(room);
    saveDraftSession(storage, 31, 10);
    const api = fakeApi();
    vi.mocked(api.updateLayout).mockRejectedValueOnce(new Error("save failed"));

    await expect(persistEditorLayoutSnapshot(room, storage, api)).rejects.toThrow("save failed");
    await expect(flushEditorLayoutPersistence()).rejects.toThrow("save failed");

    vi.mocked(api.updateLayout).mockResolvedValueOnce(response(31, false, 10));
    await expect(persistEditorLayoutSnapshot(room, storage, api)).resolves.not.toBeNull();
    await expect(flushEditorLayoutPersistence()).resolves.toBeUndefined();
  });

  it("blocks moving past the editor with a specific message when the layout has a collision, but never blocks a plain drag-end autosave", async () => {
    const room = createRoom();
    const storage = selectedRoomStorage(room);
    saveDraftSession(storage, 31, 10);
    const api = fakeApi();
    const invalid = {
      ...response(31, false, 10),
      validationResult: {
        collisionFree: false,
        boundaryValid: true,
        doorClearance: true,
        windowClearance: true,
        pathSecured: true,
        warnings: ["가구 충돌이 감지되었습니다."],
        issues: [{
          furnitureId: "bed-1",
          otherFurnitureId: "desk-1",
          type: "BODY_COLLISION" as const,
          severity: "ERROR" as const,
          message: "가구가 서로 겹칩니다.",
        }],
      },
    };

    // A mid-drag autosave (persistEditorLayoutSnapshot) must still succeed —
    // otherwise the user could never drag the offending piece to a safe spot.
    vi.mocked(api.updateLayout).mockResolvedValueOnce(invalid);
    await expect(persistEditorLayoutSnapshot(room, storage, api)).resolves.not.toBeNull();

    // Moving past the editor ("다음 단계") is the one that must block, with a
    // message naming the actual problem.
    vi.mocked(api.updateLayout).mockResolvedValueOnce(invalid);
    await expect(persistActiveEditorLayout(storage, api)).rejects.toThrow(LayoutValidationBlockedError);
    vi.mocked(api.updateLayout).mockResolvedValueOnce(invalid);
    await expect(persistActiveEditorLayout(storage, api)).rejects.toThrow("가구끼리 겹쳐 있어요");

    // Confirming goes through the same persist step first, so it's blocked
    // before the backend's own confirm endpoint is ever called.
    vi.mocked(api.updateLayout).mockResolvedValueOnce(invalid);
    await expect(confirmActiveLayout(room, storage, api)).rejects.toThrow(LayoutValidationBlockedError);
    expect(api.confirmLayout).not.toHaveBeenCalled();
  });

  it("surfaces a reset save failure, preserves the Backend Draft, and allows a retry", async () => {
    const baseline = createRoom();
    const deleted = {
      ...baseline,
      furniture: baseline.furniture.map((item) => item.id === "desk-1"
        ? { ...item, status: "deleted" as const }
        : item),
    };
    const storage = selectedRoomStorage(deleted);
    saveDraftSession(storage, 31, 10);
    let backendDraft = response(31, false, 10, backendFurnitureFromRoom(deleted));
    const api = fakeApi({ active: backendDraft, saved: backendDraft });
    vi.mocked(api.updateLayout)
      .mockRejectedValueOnce(new Error("reset save failed"))
      .mockImplementationOnce(async (layoutId, nextRoom) => {
        backendDraft = response(layoutId, false, 10, backendFurnitureFromRoom(nextRoom));
        return backendDraft;
      });
    let state = createEditorLayoutState(baseline, "room-1:client-a:layout-31");
    state = reduceEditorLayoutState(state, {
      type: "edit",
      scopeKey: state.scopeKey,
      update: () => deleted,
    });
    state = reduceEditorLayoutState(state, {
      type: "resetFurniture",
      scopeKey: state.scopeKey,
      furnitureId: "desk-1",
    });
    const resetLayout = state.persistenceRequest!.roomLayout;

    await expect(persistEditorLayoutSnapshot(resetLayout, storage, api))
      .rejects.toThrow("reset save failed");
    await expect(flushEditorLayoutPersistence()).rejects.toThrow("reset save failed");
    expect(backendDraft.recommendedFurniture[1].status).toBe("DELETED");

    await expect(persistEditorLayoutSnapshot(resetLayout, storage, api)).resolves.not.toBeNull();
    expect(backendDraft.recommendedFurniture[1]).toMatchObject({
      status: "USER_MODIFIED",
      productId: baseline.furniture[1].productId,
      variantId: baseline.furniture[1].variantId,
    });
  });

  it("confirms only the active Draft and clears the editing session only after success", async () => {
    const room = createRoom();
    const storage = selectedRoomStorage(room);
    saveDraftSession(storage, 31, 10);
    const draft = response(31, false, 10);
    const api = fakeApi({ active: draft, saved: draft });

    await confirmActiveLayout(room, storage, api);

    expect(api.updateLayout).toHaveBeenCalledWith(31, expect.any(Object));
    expect(api.confirmLayout).toHaveBeenCalledWith(31);
    expect(readActiveLayoutEditingSession(storage)).toBeNull();

    saveDraftSession(storage, 32, 10);
    vi.mocked(api.updateLayout).mockResolvedValueOnce(response(32, false, 10));
    vi.mocked(api.confirmLayout).mockRejectedValueOnce(new Error("confirm failed"));
    await expect(confirmActiveLayout(room, storage, api)).rejects.toThrow("confirm failed");
    expect(readActiveLayoutEditingSession(storage)?.activeLayoutId).toBe(32);
  });

  it("blocks update and confirm while the current setup owns a FAILED recommendation", async () => {
    const room = createRoom();
    const storage = selectedRoomStorage(room);
    const browser = setupBrowserStorage(room.id, 1, "failed-confirm-setup");
    saveDraftSession(storage, 31, 10);
    const api = fakeApi({ active: response(31, false, 10) });
    const notice = resolveRecommendationDecision(recommendationResponse(null, "FAILED", {
      message: "공간이 부족합니다.",
    })).notice!;
    saveRecommendationResult({
      sessionId: "failed-confirm-setup",
      roomLayoutId: room.id,
      backendRoomId: 1,
    }, notice, browser);

    await expect(confirmActiveLayout(room, storage, api, browser))
      .rejects.toBeInstanceOf(RecommendationFeasibilityError);
    expect(api.updateLayout).not.toHaveBeenCalled();
    expect(api.confirmLayout).not.toHaveBeenCalled();
    expect(readActiveLayoutEditingSession(storage)?.activeLayoutId).toBe(31);
  });
});

function selectedRoomStorage(room: RoomLayout, backendRoomId = 1): MemoryStorage {
  const storage = new MemoryStorage();
  selectRoom(storage, room, backendRoomId);
  storage.setItem("roomfit:selectedPurpose", "work");
  storage.setItem("roomfit:selectedStyle", "modern");
  storage.setItem("roomfit:selectedPalette", "gray");
  return storage;
}

function markConfirmed(storage: MemoryStorage, room: RoomLayout): void {
  storage.setItem("roomfit:confirmedLayoutsByRoomId", JSON.stringify({ [room.id]: room }));
}

function setupBrowserStorage(
  roomLayoutId: string,
  backendRoomId: number,
  sessionId: string,
  mode: "NEW" | "REEDIT" = "NEW",
): MemoryStorage {
  const storage = new MemoryStorage();
  storage.setItem("roomfit:roomSetupSession", JSON.stringify({
    version: 1,
    sessionId,
    roomLayoutId,
    backendRoomId,
    mode,
    createdAt: "2026-07-18T10:00:00.000Z",
  }));
  return storage;
}

function selectRoom(storage: MemoryStorage, room: RoomLayout, backendRoomId: number): void {
  storage.setItem("roomfit:selectedRoomId", room.id);
  storage.setItem("roomfit:backendRoomId", String(backendRoomId));
  storage.setItem("roomfit:selectedRoomLayout", JSON.stringify(room));
}

function saveDraftSession(
  storage: MemoryStorage,
  activeLayoutId: number,
  sourceLayoutId: number,
  roomLayoutId = "api-room-1",
  backendRoomId = 1,
): void {
  saveActiveLayoutEditingSession({
    roomLayoutId,
    backendRoomId,
    activeLayoutId,
    sourceLayoutId,
    editingMode: "REEDIT_DRAFT",
    confirmed: false,
  }, storage);
}

function readRoom(storage: MemoryStorage): RoomLayout | null {
  const raw = storage.getItem("roomfit:selectedRoomLayout");
  return raw ? JSON.parse(raw) as RoomLayout : null;
}

function createRoom(id = "api-room-1", x = -0.5, rotationY = 0): RoomLayout {
  return {
    id,
    name: "재편집 방",
    width: 4,
    depth: 3,
    walls: [],
    doors: [],
    windows: [],
    furniture: [
      furniture("bed-1", "bed", x, rotationY),
      furniture("desk-1", "desk", 0.7, 0),
    ],
  };
}

function roomWithFurnitureCount(count: number): RoomLayout {
  const room = createRoom();
  room.furniture = Array.from({ length: count }, (_, index) =>
    furniture(`furniture-${index}`, "desk", -1.5 + (index % 4), 0));
  return room;
}

function furniture(id: string, category: Furniture["category"], x: number, rotationY: number): Furniture {
  return {
    id,
    name: id,
    category,
    productId: `${category}-product`,
    variantId: category === "desk" ? "desk-compact" : null,
    styleTags: ["minimal"],
    dimensions: { width: 0.5, depth: 0.5, height: 0.7 },
    position: { x, z: 0 },
    rotationY,
    color: "#fff",
    material: "wood",
    status: "user_modified",
    removable: true,
  };
}

function backendFurniture(x: number, rotationY: number): BackendFurnitureApiItem[] {
  return backendFurnitureFromRoom(createRoom("api-room-1", x, rotationY));
}

function backendFurnitureFromRoom(room: RoomLayout): BackendFurnitureApiItem[] {
  return room.furniture.map((item) => backendItem(
    item.id,
    item.category,
    item.position.x + room.width / 2,
    item.position.z + room.depth / 2,
    ((-item.rotationY * 180) / Math.PI + 360) % 360,
    item,
  ));
}

function expectEquivalentRotation(actual: number | undefined, expected: number): void {
  expect(actual).toBeDefined();
  const fullTurn = Math.PI * 2;
  const difference = ((((actual as number) - expected) % fullTurn) + fullTurn) % fullTurn;
  expect(Math.min(difference, fullTurn - difference)).toBeCloseTo(0);
}

function backendItem(
  id: string,
  type: string,
  x: number,
  z: number,
  rotation: number,
  source?: Furniture,
): BackendFurnitureApiItem {
  return {
    id,
    type,
    label: source?.name ?? id,
    width: source?.dimensions.width ?? 0.25,
    depth: source?.dimensions.depth ?? 0.25,
    height: source?.dimensions.height ?? 1.4,
    position: { x, z },
    rotation,
    status: source?.status === "deleted" ? "DELETED" : "USER_MODIFIED",
    productId: source?.productId ?? null,
    variantId: source?.variantId ?? null,
    styleTags: source?.styleTags ?? [],
  };
}

function response(
  layoutId: number,
  confirmed: boolean,
  sourceLayoutId: number | null,
  items = backendFurniture(-0.5, 0),
  roomId = 1,
): LayoutResponse {
  return {
    layoutId,
    roomId,
    sourceLayoutId,
    confirmed,
    confirmedAt: confirmed ? "2026-07-18T10:00:00" : null,
    status: "SUCCESS",
    recommendedFurniture: items,
    scoreSummary: {
      collisionScore: 100,
      boundaryScore: 100,
      doorWindowScore: 100,
      pathScore: 100,
      goalScore: 100,
      styleScore: 100,
      totalScore: 100,
    },
    validationResult: {
      collisionFree: true,
      boundaryValid: true,
      doorClearance: true,
      windowClearance: true,
      pathSecured: true,
      warnings: [],
    },
  };
}

function fakeApi({
  room = createRoom(),
  replacedRoom = room,
  latest = null,
  active = response(11, false, 10),
  draft = response(11, false, 10),
  saved = response(11, false, 10),
  added = response(11, false, 10),
  recommendation = recommendationResponse(51, "SUCCESS"),
}: {
  room?: RoomLayout;
  replacedRoom?: RoomLayout;
  latest?: LayoutResponse | null;
  active?: LayoutResponse;
  draft?: LayoutResponse;
  saved?: LayoutResponse;
  added?: LayoutResponse;
  recommendation?: LayoutRecommendationResponse;
} = {}): LayoutWorkflowApi {
  return {
    getRoomLayout: vi.fn().mockResolvedValue(room),
    replaceRoomFurniture: vi.fn().mockResolvedValue(replacedRoom),
    getLayout: vi.fn().mockResolvedValue(active),
    getLatestConfirmedLayout: vi.fn().mockResolvedValue(latest),
    createLayoutDraft: vi.fn().mockResolvedValue(draft),
    updateLayout: vi.fn().mockResolvedValue(saved),
    addFurnitureToDraft: vi.fn().mockResolvedValue(added),
    createDefaultAgentContext: vi.fn().mockResolvedValue({
      contextId: 51,
      roomId: 1,
      lifestyleGoal: "STUDY_FOCUSED",
      designStyle: ["MINIMAL"],
      requiredItems: ["lamp"],
      optionalItems: [],
      selectedImageIds: [1],
      selectedProductIds: [],
      styleTags: [],
      preferredColorTone: null,
    }),
    recommendLayout: vi.fn().mockResolvedValue(recommendation),
    confirmLayout: vi.fn().mockResolvedValue({
      layoutId: saved.layoutId,
      confirmed: true,
      confirmedAt: "2026-07-18T11:00:00",
    }),
  };
}

function recommendationResponse(
  layoutId: number | null,
  recommendationStatus: "SUCCESS" | "PARTIAL_SUCCESS" | "FAILED",
  overrides: Partial<LayoutRecommendationResponse> = {},
): LayoutRecommendationResponse {
  return {
    ...response(layoutId ?? 1, false, null),
    layoutId,
    recommendationStatus,
    requestedFurnitureCount: 2,
    placedFurnitureCount: recommendationStatus === "FAILED" ? 0 : 2,
    unplacedFurniture: [],
    ...overrides,
  };
}

function selectedRoomStorageWithPlant(): MemoryStorage {
  const storage = selectedRoomStorage(createRoom());
  storage.setItem("roomfit:selectedAdditionalFurnitureIds", '["plant"]');
  return storage;
}

function createDeferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((resolver, rejecter) => {
    resolve = resolver;
    reject = rejecter;
  });
  return { promise, resolve, reject };
}
