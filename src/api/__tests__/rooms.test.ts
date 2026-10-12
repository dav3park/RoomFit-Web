import { describe, expect, it, vi } from "vitest";
import {
  applyBackendFurnitureToLayout,
  getRoomById,
  getRecentUploadedRooms,
  getSampleRooms,
  getSampleRoomLayouts,
  replaceRoomFurniture,
  toRoomFurnitureReplaceRequest,
  toRoomUploadRequest,
  uploadRoomLayout,
  type BackendFurnitureApiItem,
} from "../rooms";
import { apiClient } from "../client";
import type { Furniture, RoomLayout } from "../../types";

const baseLayout: RoomLayout = {
  id: "api-room-1",
  name: "테스트 방",
  width: 4,
  depth: 3,
  height: 2.4,
  walls: [],
  doors: [],
  windows: [],
  furniture: [],
};

describe("public sample API", () => {
  it("uses the explicit PUBLIC request scope", async () => {
    const get = vi.spyOn(apiClient, "get").mockResolvedValue({
      data: { success: true, data: [], error: null },
    });

    try {
      await expect(getSampleRooms()).resolves.toEqual([]);
      expect(get).toHaveBeenCalledWith("/api/rooms/samples", {
        roomfitClientScope: "PUBLIC",
      });
    } finally {
      get.mockRestore();
    }
  });
});

describe("scoped recent Room API", () => {
  it("uses the UUID supplied for that list instead of global active scope", async () => {
    const get = vi.spyOn(apiClient, "get").mockResolvedValue({
      data: { success: true, data: [], error: null },
    });
    try {
      await expect(getRecentUploadedRooms(10, "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa")).resolves.toEqual([]);
      expect(get).toHaveBeenCalledWith("/api/rooms/uploads/recent", {
        params: { limit: 10 },
        roomfitClientScope: "EXPLICIT",
        roomfitClientIdOverride: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
      });
    } finally {
      get.mockRestore();
    }
  });

  it("forwards the polling AbortSignal without changing the explicit App scope", async () => {
    const get = vi.spyOn(apiClient, "get").mockResolvedValue({
      data: { success: true, data: [], error: null },
    });
    const controller = new AbortController();
    try {
      await expect(getRecentUploadedRooms(10, "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", controller.signal)).resolves.toEqual([]);
      expect(get).toHaveBeenCalledWith("/api/rooms/uploads/recent", {
        params: { limit: 10 },
        signal: controller.signal,
        roomfitClientScope: "EXPLICIT",
        roomfitClientIdOverride: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
      });
    } finally {
      get.mockRestore();
    }
  });
});

function createBackendFurniture(
  overrides: Partial<BackendFurnitureApiItem> = {},
): BackendFurnitureApiItem {
  return {
    id: "desk-rec-1",
    type: "desk",
    label: "컴팩트 책상",
    width: 1.2,
    depth: 0.6,
    height: 0.73,
    position: { x: 2.6, z: 1.5 },
    rotation: 90,
    status: "RECOMMENDED",
    productId: "desk-compact-01",
    variantId: "desk-compact",
    styleTags: ["minimal", "classic"],
    ...overrides,
  };
}

describe("applyBackendFurnitureToLayout", () => {
  it("preserves catalog metadata and existing coordinate conversions", () => {
    const backendFurniture = createBackendFurniture();
    const result = applyBackendFurnitureToLayout(baseLayout, [backendFurniture]);
    const furniture = result.furniture[0];

    expect(furniture).toMatchObject({
      productId: "desk-compact-01",
      variantId: "desk-compact",
      styleTags: ["minimal", "classic"],
      dimensions: { width: 1.2, depth: 0.6, height: 0.73 },
      rotationY: -Math.PI / 2,
    });
    expect(furniture.position.x).toBeCloseTo(0.6);
    expect(furniture.position.z).toBeCloseTo(0);
    expect(furniture.styleTags).not.toBe(backendFurniture.styleTags);
  });

  it("preserves a null variantId", () => {
    const result = applyBackendFurnitureToLayout(baseLayout, [
      createBackendFurniture({ productId: null, variantId: null, styleTags: [] }),
    ]);

    expect(result.furniture[0]).toMatchObject({
      productId: null,
      variantId: null,
      styleTags: [],
    });
  });

  it("preserves Backend canonical source type separately from render category", () => {
    const result = applyBackendFurnitureToLayout(baseLayout, [
      createBackendFurniture({ type: "MEDIA_CONSOLE" }),
    ]);

    expect(result.furniture[0]).toMatchObject({
      category: "cabinet",
      sourceType: "media_console",
    });
  });

  it("rejects an unknown Backend status instead of changing it to recommended", () => {
    expect(() => applyBackendFurnitureToLayout(baseLayout, [
      createBackendFurniture({ status: "FUTURE_STATUS" }),
    ])).toThrow("Unsupported Backend furniture status: FUTURE_STATUS");
  });

  it("preserves an unknown variantId for render-time fallback", () => {
    const result = applyBackendFurnitureToLayout(baseLayout, [
      createBackendFurniture({ variantId: "future-desk-variant" }),
    ]);

    expect(result.furniture[0].variantId).toBe("future-desk-variant");
  });

  it("normalizes catalog lighting aliases without using the cabinet fallback", () => {
    const result = applyBackendFurnitureToLayout(baseLayout, [
      createBackendFurniture({ type: "mood_lamp", variantId: "lamp-floor" }),
    ]);

    expect(result.furniture[0].category).toBe("lighting");
  });

  it("marks an unknown furniture type as unsupported instead of cabinet", () => {
    const result = applyBackendFurnitureToLayout(baseLayout, [
      createBackendFurniture({ type: "future_unknown", variantId: "future-variant" }),
    ]);

    expect(result.furniture[0].category).toBe("unsupported");
    expect(result.furniture[0].sourceType).toBeUndefined();
  });

  it("preserves a midcentury desk product and variant for the registered renderer", () => {
    const result = applyBackendFurnitureToLayout(baseLayout, [
      createBackendFurniture({
        id: "desk-midcentury-rec-1",
        label: "미드센추리 글라스 책상",
        productId: "desk-midcentury-glass-01",
        variantId: "desk-midcentury-glass",
        width: 1.75,
        depth: 0.74,
        height: 0.812,
        styleTags: ["midcentury", "modern"],
      }),
    ]);

    expect(result.furniture).toHaveLength(1);
    expect(result.furniture[0]).toMatchObject({
      id: "desk-midcentury-rec-1",
      productId: "desk-midcentury-glass-01",
      variantId: "desk-midcentury-glass",
      styleTags: ["midcentury", "modern"],
      dimensions: { width: 1.75, depth: 0.74, height: 0.812 },
    });
  });

  it("uses the same metadata-preserving mapper for a subsequent feedback result", () => {
    const recommended = applyBackendFurnitureToLayout(baseLayout, [createBackendFurniture()]);
    const feedback = applyBackendFurnitureToLayout(recommended, [
      createBackendFurniture({ position: { x: 2.8, z: 1.8 }, rotation: 180 }),
    ]);

    expect(feedback.furniture[0]).toMatchObject({
      productId: "desk-compact-01",
      variantId: "desk-compact",
      styleTags: ["minimal", "classic"],
      rotationY: -Math.PI,
    });
    expect(feedback.furniture[0].position.x).toBeCloseTo(0.8);
    expect(feedback.furniture[0].position.z).toBeCloseTo(0.3);
  });

  it("keeps canonical type and appearance stable from recommendation through feedback and reload", () => {
    const recommendationItem = createBackendFurniture({
      id: "bookshelf-rec-1",
      type: "BOOKSHELF",
      label: "높은 책장",
      productId: "bookshelf-high-01",
      variantId: "bookshelf-high",
      styleTags: ["natural", "storage"],
    });
    const recommended = applyBackendFurnitureToLayout(baseLayout, [recommendationItem]);
    const feedback = applyBackendFurnitureToLayout(recommended, [{
      ...recommendationItem,
      type: "bookshelf",
      position: { x: 2.7, z: 1.8 },
      rotation: 90,
    }]);
    const reloaded = applyBackendFurnitureToLayout(baseLayout, [{
      ...recommendationItem,
      type: "BOOKSHELF",
      position: { x: 2.7, z: 1.8 },
      rotation: 90,
    }]);

    for (const layout of [recommended, feedback, reloaded]) {
      expect(layout.furniture[0]).toMatchObject({
        category: "cabinet",
        productId: "bookshelf-high-01",
        variantId: "bookshelf-high",
        styleTags: ["natural", "storage"],
      });
    }
    expect(feedback.furniture[0]).toEqual(reloaded.furniture[0]);
  });
});

describe("toRoomUploadRequest", () => {
  it("converts a 6x6 center-origin empty room to the Backend upload contract", async () => {
    const { createCustomRoom } = await import("../../config/customRoom");
    const result = createCustomRoom({ name: "[TEST] LLM Feedback", width: "6", depth: "6" });
    expect(result.success).toBe(true);
    if (!result.success) return;

    const request = toRoomUploadRequest(result.room.layout);

    expect(request).toMatchObject({
      name: "[TEST] LLM Feedback",
      room: { width: 6, depth: 6, height: 2.4, unit: "meter" },
      openings: [],
      furniture: [],
    });
    expect(request.walls).toHaveLength(4);
    expect(request.walls[0]).toMatchObject({
      id: "north",
      start: { x: 0, z: 0 },
      end: { x: 6, z: 0 },
    });
    expect(request.walls[3]).toMatchObject({
      id: "west",
      start: { x: 0, z: 6 },
      end: { x: 0, z: 0 },
    });
  });

  it("preserves sample door and window openings when cloning a room", () => {
    const room: RoomLayout = {
      ...baseLayout,
      doors: [{
        id: "door-1",
        label: "현관",
        position: { x: -1, z: 1.5 },
        dimensions: { width: 0.8, depth: 0.18, height: 2.1 },
        rotationY: 0,
        wallId: "south",
      }],
      windows: [{
        id: "window-1",
        label: "창문",
        position: { x: 2, z: 0.4 },
        dimensions: { width: 1.2, depth: 0.18, height: 1.2 },
        rotationY: 0,
        wallId: "east",
      }],
    };

    expect(toRoomUploadRequest(room).openings).toEqual([
      {
        id: "door-1",
        type: "door",
        wall: "south",
        offset: 1,
        width: 0.8,
        height: 2.1,
        sillHeight: null,
      },
      {
        id: "window-1",
        type: "window",
        wall: "east",
        offset: 1.9,
        width: 1.2,
        height: 1.2,
        sillHeight: 0.9,
      },
    ]);
  });

  it("computes an opening's offset along its own real wall id, not the room's width/depth", () => {
    // A wall that isn't one of the 4 cardinal sides — e.g. an L-shaped
    // room's angled/notch wall — proves the offset comes from the wall's own
    // geometry (start -> end) rather than the old north/south/east/west
    // rectangle idealization.
    const room: RoomLayout = {
      ...baseLayout,
      walls: [
        { id: "wall-a", start: { x: -2, z: -1.5 }, end: { x: 2, z: -1.5 } },
        { id: "wall-b", start: { x: 2, z: -1.5 }, end: { x: 2, z: 1.5 } },
      ],
      doors: [{
        id: "door-1",
        label: "현관",
        position: { x: 2, z: 0.4 },
        dimensions: { width: 0.8, depth: 0.18, height: 2.1 },
        rotationY: 0,
        wallId: "wall-b",
      }],
    };

    const opening = toRoomUploadRequest(room).openings[0];
    expect(opening.wall).toBe("wall-b");
    // wall-b runs from z=-1.5 to z=1.5; the door sits at z=0.4, i.e. 1.9m
    // along the wall from its start (-1.5) — not a width/depth-relative offset.
    expect(opening.offset).toBeCloseTo(1.9);
  });

  it("posts the upload contract and returns the Backend roomId", async () => {
    const post = vi.spyOn(apiClient, "post").mockResolvedValue({
      data: { success: true, data: { roomId: 57 }, error: null },
    });

    try {
      await expect(uploadRoomLayout(baseLayout)).resolves.toBe(57);
      expect(post).toHaveBeenCalledWith("/api/rooms/upload", toRoomUploadRequest(baseLayout));
    } finally {
      post.mockRestore();
    }
  });

  it("copies a public sample through the scoped Backend copy endpoint", async () => {
    const post = vi.spyOn(apiClient, "post").mockResolvedValue({
      data: { success: true, data: { roomId: 58 }, error: null },
    });

    try {
      await expect(uploadRoomLayout({ ...baseLayout, id: "api-room-1", source: "SAMPLE" })).resolves.toBe(58);
      expect(post).toHaveBeenCalledWith("/api/rooms/1/copy");
    } finally {
      post.mockRestore();
    }
  });

  it("does not guess a Backend ID for a malformed sample layout ID", async () => {
    await expect(uploadRoomLayout({ ...baseLayout, id: "sample-room", source: "SAMPLE" }))
      .rejects.toThrow("샘플 Room ID가 올바르지 않습니다.");
  });

  it("loads an App handoff Room directly by roomId", async () => {
    const get = vi.spyOn(apiClient, "get").mockResolvedValue({
      data: {
        success: true,
        data: {
          roomId: 57,
          name: "App 업로드 방",
          room: { width: 4, depth: 3, height: 2.4, unit: "meter" },
          openings: [],
          furniture: [],
          source: "ROOMPLAN",
          createdAt: "2026-07-19T00:00:00Z",
        },
        error: null,
      },
    });

    try {
      await expect(getRoomById(57)).resolves.toMatchObject({
        roomId: 57,
        layoutId: "api-room-57",
        source: "ROOMPLAN",
      });
      expect(get).toHaveBeenCalledWith("/api/rooms/57");
    } finally {
      get.mockRestore();
    }
  });

  it("resolves an opening's real position from its wallId, not a rectangle idealization", async () => {
    const get = vi.spyOn(apiClient, "get").mockResolvedValue({
      data: {
        success: true,
        data: [{
          roomId: 61,
          name: "L자 원룸",
          room: { width: 4, depth: 3, height: 2.4, unit: "meter" },
          walls: [
            { id: "wall-a", start: { x: 0, z: 0 }, end: { x: 4, z: 0 }, height: 2.4, thickness: 0.12 },
            { id: "wall-b", start: { x: 4, z: 0 }, end: { x: 4, z: 3 }, height: 2.4, thickness: 0.12 },
          ],
          openings: [{
            id: "door-1",
            type: "door",
            wall: "wall-b",
            offset: 1.9,
            width: 0.8,
            height: 2.1,
            sillHeight: null,
          }, {
            id: "window-height", type: "window", wall: "wall-a", offset: 1.5,
            width: 1.2, height: 1.4, sillHeight: 0.7,
          }],
          furniture: [],
          source: "ROOMPLAN",
          createdAt: "2026-07-19T00:00:00Z",
        }],
        error: null,
      },
    });

    try {
      const [layout] = await getSampleRoomLayouts();
      // wall-b runs (4,0) -> (4,3) in corner-origin space; 1.9m along it is
      // (4, 1.9), then re-centered ( -width/2, -depth/2 ) to the scene's
      // center-origin convention -> (2, 0.4).
      expect(layout.doors[0].wallId).toBe("wall-b");
      expect(layout.doors[0].position.x).toBeCloseTo(2);
      expect(layout.doors[0].position.z).toBeCloseTo(0.4);
      expect(layout.windows[0].sillHeight).toBe(0.7);
      expect(toRoomUploadRequest(layout).openings.find(opening=>opening.id==='window-height')?.sillHeight).toBe(0.7);
    } finally {
      get.mockRestore();
    }
  });
});

describe("Room furniture replacement API", () => {
  it("round-trips the Backend legacy storage type instead of renderer-only cabinet", () => {
    const room = applyBackendFurnitureToLayout(baseLayout, [
      createBackendFurniture({
        id: "storage-1",
        type: "storage",
        label: "수납장",
        productId: null,
        variantId: null,
        styleTags: [],
      }),
    ]);

    expect(room.furniture[0]).toMatchObject({
      category: "cabinet",
      sourceType: "storage",
    });
    expect(toRoomFurnitureReplaceRequest(room).furniture[0]).toMatchObject({
      id: "storage-1",
      type: "storage",
    });
  });

  it("replaces the complete Room furniture snapshot without losing DELETED", async () => {
    const room = roomWithFurniture([
      furniture({
        id: "console-1",
        sourceType: "media_console",
        status: "existing",
        position: { x: -1.25, z: 0.5 },
        rotationY: Math.PI / 2,
      }),
      furniture({ id: "tv-1", sourceType: "tv", status: "deleted" }),
    ]);
    const put = vi.spyOn(apiClient, "put").mockResolvedValue({
      data: {
        success: true,
        data: {
          roomId: 12,
          name: room.name,
          room: { width: room.width, depth: room.depth, height: 2.4, unit: "meter" },
          openings: [],
          furniture: [],
          source: "ROOMPLAN",
          createdAt: "2026-07-20T00:00:00Z",
        },
        error: null,
      },
    });

    try {
      await replaceRoomFurniture(12, room);

      expect(put).toHaveBeenCalledWith("/api/rooms/12/layout", {
        furniture: expect.arrayContaining([
          expect.objectContaining({
            id: "console-1",
            type: "media_console",
            status: "EXISTING",
            position: { x: 0.75, z: 2 },
            rotation: 270,
          }),
          expect.objectContaining({ id: "tv-1", type: "tv", status: "DELETED" }),
        ]),
      });
    } finally {
      put.mockRestore();
    }
  });

  it("serializes every furniture status without collapsing source type or pose", () => {
    const room = roomWithFurniture([
      furniture({ status: "recommended" }),
      furniture({ id: "modified", status: "user_modified", rotationY: -Math.PI / 2 }),
    ]);

    expect(toRoomFurnitureReplaceRequest(room).furniture).toEqual([
      expect.objectContaining({ type: "desk", status: "RECOMMENDED" }),
      expect.objectContaining({ id: "modified", status: "USER_MODIFIED", rotation: 90 }),
    ]);
  });
});

function roomWithFurniture(items: Furniture[]): RoomLayout {
  return { ...baseLayout, furniture: items };
}

function furniture(overrides: Partial<Furniture> = {}): Furniture {
  return {
    id: "desk-1",
    name: "책상",
    category: "desk",
    dimensions: { width: 1, depth: 0.6, height: 0.7 },
    position: { x: 0, z: 0 },
    rotationY: 0,
    color: "#fff",
    material: "wood",
    status: "existing",
    removable: true,
    ...overrides,
  };
}
