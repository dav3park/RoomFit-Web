import type { IconType } from "react-icons";
import { FiArrowRight, FiCheckCircle, FiLock, FiMaximize, FiShoppingBag, FiSmartphone } from "react-icons/fi";
import { useNavigate } from "react-router-dom";

import Button from "../components/ui/Button";
import { sampleRoom } from "../mock/sampleRoom";
import RoomViewer from "../components/room/RoomViewer";
import { beginNewRoomSetup } from "../config/roomSetupSession";

// 실제 서비스 흐름(/rooms → /workspace → /layout-confirm)과 같은 순서로 소개한다.
const steps = [
  {
    title: "방 스캔",
    description: "RoomFit Scan 앱으로 방을 한 바퀴 비추면 벽·문·창문과 지금 놓인 가구, 싱크대 같은 설비까지 인식해요.",
  },
  {
    title: "웹으로 불러오기",
    description: "연동 코드로 앱을 연결하면 스캔한 방이 지금 배치 그대로 올라와요. 어긋난 가구 크기는 바로 보정할 수 있어요.",
  },
  {
    title: "상담하고 추천받기",
    description: "라이프스타일·색감·스타일을 고르고 원하는 분위기를 사진이나 글로 알려주면, 실제 상품으로 만든 배치안을 비교해 보여드려요.",
  },
  {
    title: "편집하고 확정",
    description: "가구를 끌어서 옮기며 충돌과 여닫는 공간을 바로 확인하고, 확정하면 필요한 상품을 쇼핑 리스트로 모아드려요.",
  },
];

const highlights: Array<{ icon: IconType; title: string; description: string }> = [
  {
    icon: FiMaximize,
    title: "실측 그대로의 공간",
    description: "ㄱ자 방처럼 벽이 여러 개인 방도 스캔한 벽 모양과 치수 그대로 다뤄요.",
  },
  {
    icon: FiLock,
    title: "옮길 수 없는 건 그대로",
    description: "싱크대·하부장·상부장 같은 붙박이 설비는 고정하고, 그 둘레로만 배치해요.",
  },
  {
    icon: FiCheckCircle,
    title: "들어가는지 먼저 확인",
    description: "가구끼리 겹치는지, 문·창문 앞과 통로가 막히지 않는지 검사한 배치만 제안해요.",
  },
  {
    icon: FiShoppingBag,
    title: "실제로 살 수 있는 가구",
    description: "실제 판매 중인 상품의 크기로 배치하고, 확정하면 구매 링크까지 연결해요.",
  },
];

const homePreviewRoom = {
  ...sampleRoom,
  camera: {
    ...sampleRoom.camera,
    type: "orthographic" as const,
    position: { x: -6.4, y: 5.2, z: 6.2 },
    target: { x: 0.15, y: 0.7, z: -0.1 },
    zoom: 82,
  },
};

export function Home() {
  const navigate = useNavigate();
  const start = () => {
    beginNewRoomSetup();
    navigate("/rooms");
  };

  return (
    <main className="min-h-screen break-keep bg-[#fbfbfb] text-[#141414]">
      <section className="mx-auto grid max-w-300 items-center gap-10 px-5 pb-12 pt-10 sm:px-8 lg:grid-cols-[0.9fr_1.1fr] lg:px-12 lg:pb-16 lg:pt-16">
        <div>
          <h1 className="text-[64px] font-black leading-none tracking-[-0.03em] text-[#111111] sm:text-[88px] lg:text-[104px]">
            RoomFit
          </h1>
          <p className="mt-5 text-lg font-medium leading-[1.55] text-[#222222] sm:text-xl">
            스캔 한 번으로 시작하는,
            <br />
            내 방에 실제로 들어가는 가구 배치 서비스
          </p>

          <div className="mt-9 flex flex-wrap items-center gap-3">
            <Button onClick={start} className="px-7 py-3.5 text-base">
              내 방으로 시작하기
              <FiArrowRight className="h-5 w-5" />
            </Button>
            <a
              href="#how-it-works"
              className="inline-flex items-center gap-2 rounded-full border border-[#dcdcdc] bg-white px-6 py-3.5 text-base font-semibold text-[#333333] transition-colors hover:bg-[#f3f3f3]"
            >
              이용 방법 보기
            </a>
          </div>

          <p className="mt-5 flex items-center gap-2 text-sm text-[#7a7a7a]">
            <FiSmartphone className="h-4 w-4 shrink-0" />
            LiDAR가 없는 기기라면 샘플 방이나 직접 만든 방으로 체험할 수 있어요.
          </p>
        </div>

        <div className="hero-room rounded-3xl border border-[#ececec] bg-white p-2 shadow-[0_24px_60px_rgba(0,0,0,0.06)]">
          <RoomViewer
            room={homePreviewRoom}
            furniture={homePreviewRoom.furniture}
            selectedFurnitureId={null}
            onSelectFurniture={() => undefined}
            onMoveFurniture={() => undefined}
          />
        </div>
      </section>

      <section id="how-it-works" className="scroll-mt-24 border-y border-[#eeeeee] bg-white">
        <div className="mx-auto max-w-300 px-5 py-14 sm:px-8 lg:px-12 lg:py-18">
          <h2 className="text-2xl font-extrabold tracking-[-0.01em] sm:text-3xl">이렇게 진행돼요</h2>
          <p className="mt-3 text-base text-[#747474]">방을 스캔하는 데서 쇼핑 리스트까지, 네 단계면 충분해요.</p>

          <ol className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {steps.map((step, index) => (
              <li key={step.title} className="rounded-2xl border border-[#ececec] bg-[#fbfbfb] p-6">
                <span className="text-sm font-extrabold text-[#9a9a9a]">{String(index + 1).padStart(2, "0")}</span>
                <h3 className="mt-3 text-lg font-bold text-[#141414]">{step.title}</h3>
                <p className="mt-2 text-sm leading-[1.65] text-[#6f6f6f]">{step.description}</p>
              </li>
            ))}
          </ol>
        </div>
      </section>

      <section className="mx-auto max-w-300 px-5 py-14 sm:px-8 lg:px-12 lg:py-18">
        <h2 className="text-2xl font-extrabold tracking-[-0.01em] sm:text-3xl">
          보기 좋은 배치보다,
          <br className="sm:hidden" /> 실제로 들어가는 배치
        </h2>
        <div className="mt-10 grid gap-x-10 gap-y-8 sm:grid-cols-2">
          {highlights.map(({ icon: Icon, title, description }) => (
            <article key={title} className="flex gap-4">
              <span className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-[#111111] text-white">
                <Icon className="h-5 w-5" />
              </span>
              <div>
                <h3 className="text-base font-bold text-[#161616]">{title}</h3>
                <p className="mt-1.5 text-sm leading-[1.65] text-[#747474]">{description}</p>
              </div>
            </article>
          ))}
        </div>
      </section>

      <section className="mx-auto max-w-300 px-5 pb-16 sm:px-8 lg:px-12">
        <div className="flex flex-col items-start justify-between gap-6 rounded-3xl bg-[#111111] px-8 py-10 text-white sm:flex-row sm:items-center lg:px-12">
          <div>
            <h2 className="text-2xl font-extrabold">지금 내 방으로 시작해 보세요</h2>
            <p className="mt-2 text-sm text-[#bdbdbd]">스캔한 방을 불러오거나, 샘플 방으로 먼저 둘러볼 수 있어요.</p>
          </div>
          <button
            type="button"
            onClick={start}
            className="inline-flex shrink-0 items-center gap-2 rounded-full bg-white px-7 py-3.5 text-base font-semibold text-[#111111] transition-colors hover:bg-[#ececec]"
          >
            공간 선택하러 가기
            <FiArrowRight className="h-5 w-5" />
          </button>
        </div>
      </section>
    </main>
  );
}
