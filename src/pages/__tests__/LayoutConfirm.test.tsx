import { renderToStaticMarkup } from "react-dom/server";
import { MemoryRouter } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";

import type { RoomLayout } from "../../types";
import LayoutConfirm, { resolveLatestConfirmedRoom } from "../LayoutConfirm";

vi.mock("../../components/room/RoomViewer", () => ({
  default: ({ room }: { room: RoomLayout }) => <div>{room.name}</div>,
}));

const BROWSER_ID = "11111111-1111-4111-8111-111111111111";
const APP_ID = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";

describe("Layout confirm scoped recovery", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("shows safe guidance without inventing or confirming a Sample Layout", () => {
    vi.stubGlobal("localStorage", memoryStorage());
    vi.stubGlobal("sessionStorage", memoryStorage());

    const html = renderToStaticMarkup(
      <MemoryRouter initialEntries={["/layout-confirm"]}>
        <LayoutConfirm />
      </MemoryRouter>,
    );

    expect(html).toContain("확정할 배치를 찾지 못했습니다");
    expect(html).toContain("방 선택으로 돌아가기");
    expect(html).not.toContain("확정하기");
    expect(html).not.toContain("모던 원룸");
  });

  it("does not render a confirmed mirror owned by another client", () => {
    const confirmed = room("다른 client 배치");
    vi.stubGlobal("localStorage", memoryStorage({
      "roomfit:browserClientId:v1": BROWSER_ID,
      "roomfit:backendRoomId": "15",
      "roomfit:selectedRoomId": confirmed.id,
      "roomfit:selectedRoomLayout": JSON.stringify(confirmed),
      "roomfit:confirmedRoomLayout": JSON.stringify(confirmed),
      "roomfit:confirmedLayoutsByRoomId": JSON.stringify({ [confirmed.id]: confirmed }),
      "roomfit:confirmedLayoutOwnersByRoomId:v1": JSON.stringify({ [confirmed.id]: APP_ID }),
    }));
    vi.stubGlobal("sessionStorage", memoryStorage());

    const html = renderToStaticMarkup(
      <MemoryRouter initialEntries={["/layout-confirm"]}>
        <LayoutConfirm />
      </MemoryRouter>,
    );

    expect(html).not.toContain("다른 client 배치");
    expect(html).not.toContain("확정하기");
  });

  it("shows the workspace snapshot instead of an older confirmed mirror", () => {
    const current = room("새 작업실에서 편집한 방");
    const older = room("이전 확정 배치");
    vi.stubGlobal("localStorage", memoryStorage({
      "roomfit:selectedRoomId": current.id,
      "roomfit:selectedRoomLayout": JSON.stringify(older),
      "roomfit:backendRoomId": "15",
    }));
    vi.stubGlobal("sessionStorage", memoryStorage());
    const html = renderToStaticMarkup(
      <MemoryRouter initialEntries={[{ pathname: "/layout-confirm", state: { workspaceRoom: current } }]}>
        <LayoutConfirm />
      </MemoryRouter>,
    );
    expect(html).toContain("새 작업실에서 편집한 방");
    expect(html).not.toContain("이전 확정 배치");
    expect(html).toContain("확정하기");
    expect(html).toContain("배치는 이 브라우저에 저장됩니다");
  });

  it("does not show a workspace snapshot for a different selected room", () => {
    vi.stubGlobal("localStorage", memoryStorage({ "roomfit:selectedRoomId": "api-room-16" }));
    vi.stubGlobal("sessionStorage", memoryStorage());
    const html = renderToStaticMarkup(
      <MemoryRouter initialEntries={[{ pathname: "/layout-confirm", state: { workspaceRoom: room("다른 방") } }]}>
        <LayoutConfirm />
      </MemoryRouter>,
    );
    expect(html).not.toContain("다른 방");
    expect(html).not.toContain("확정하기");
  });

  it("accepts only the current room's confirmed latest response", () => {
    const fallback = room("현재 방");
    const matching = { roomId: 15, confirmed: true, recommendedFurniture: [] };

    expect(resolveLatestConfirmedRoom(fallback, 15, matching)).toEqual(fallback);
    expect(resolveLatestConfirmedRoom(fallback, 16, matching)).toBeNull();
    expect(resolveLatestConfirmedRoom(fallback, 15, { ...matching, confirmed: false })).toBeNull();
    expect(resolveLatestConfirmedRoom(fallback, 15, null)).toBeNull();
  });
});

function room(name: string): RoomLayout {
  return {
    id: "api-room-15",
    name,
    width: 4,
    depth: 3,
    height: 2.4,
    source: "ROOMPLAN",
    walls: [],
    doors: [],
    windows: [],
    furniture: [],
  };
}

function memoryStorage(initial: Record<string, string> = {}) {
  const values = new Map(Object.entries(initial));
  return {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => { values.set(key, value); },
    removeItem: (key: string) => { values.delete(key); },
  };
}
