import { FiArrowRight, FiCheckCircle, FiShoppingBag, FiSmartphone } from "react-icons/fi";
import { useNavigate } from "react-router-dom";

import Button from "../components/ui/Button";
import { homePreviewRoom } from "../mock/homePreviewRoom";
import RoomViewer from "../components/room/RoomViewer";
import { beginNewRoomSetup } from "../config/roomSetupSession";

const features = [
  {
    icon: FiSmartphone,
    title: "스캔 한 번으로 시작",
    description: "RoomFit Scan 앱으로 찍은 내 방을\n지금 배치 그대로 불러와요.",
  },
  {
    icon: FiCheckCircle,
    title: "실제로 들어가는 배치",
    description: "가구 충돌과 여닫는 공간을 확인한\n배치만 추천해요.",
  },
  {
    icon: FiShoppingBag,
    title: "바로 살 수 있는 가구",
    description: "실제 판매 상품으로 배치하고\n쇼핑 리스트로 모아드려요.",
  },
];

export function Home() {
  const navigate = useNavigate();
  return (
    <main className="min-h-screen break-keep bg-[#fbfbfb] text-[#141414]">
      <section className="mx-auto grid min-h-135 max-w-300 items-center gap-8 px-5 py-10 sm:px-8 lg:grid-cols-[0.88fr_1.12fr] lg:px-12 lg:py-14">
        <div className="max-w-130">
          {/* 왼쪽 위 로고(ROOMFIT)와 같은 굵기로, 크기만 키운 워드마크 */}
          <h1 className="text-[56px] font-bold leading-none tracking-[0.01em] text-[#181818] sm:text-[68px] lg:text-[76px]">
            RoomFit
          </h1>

          <p className="mt-6 text-lg font-medium leading-[1.6] text-[#333333] sm:text-xl">
            스캔 한 번으로 시작하는,
            <br />
            내 방에 실제로 들어가는 가구 배치 서비스
          </p>

          <Button
            onClick={() => {
              beginNewRoomSetup();
              navigate("/rooms");
            }}
            className="mt-9 px-8 py-3.5 text-lg"
          >
            시작하기
            <FiArrowRight className="h-5 w-5" />
          </Button>
        </div>

        <div className="hero-room min-h-75 lg:min-h-105">
          <RoomViewer
            room={homePreviewRoom}
            furniture={homePreviewRoom.furniture}
            selectedFurnitureId={null}
            onSelectFurniture={() => undefined}
            onMoveFurniture={() => undefined}
            showValidationIssues={false}
          />
        </div>
      </section>

      <section className="mx-auto max-w-300 px-5 pb-14 sm:px-8 lg:px-12">
        <div className="grid gap-8 border-t border-[#ececec] pt-10 md:grid-cols-3">
          {features.map(({ icon: Icon, title, description }) => (
            <article key={title} className="flex items-center gap-5">
              <Icon className="h-10 w-10 shrink-0 stroke-[1.6] text-[#111111]" />
              <div>
                <h3 className="text-base font-bold text-[#161616]">{title}</h3>
                <p className="mt-2 whitespace-pre-line text-sm leading-normal text-[#777777]">{description}</p>
              </div>
            </article>
          ))}
        </div>
      </section>
    </main>
  );
}
