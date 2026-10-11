import { FiArrowRight, FiCpu, FiEdit3, FiHome } from "react-icons/fi";
import { useNavigate } from "react-router-dom";

import Button from "../components/ui/Button";
import { sampleRoom } from "../mock/sampleRoom";
import RoomViewer from "../components/room/RoomViewer";
import { beginNewRoomSetup } from "../config/roomSetupSession";


const features = [
  {
    icon: FiHome,
    title: "3D 공간 미리보기",
    description: "생성하는 3D로 먼저\n내 공간을 확인하세요.",
  },
  {
    icon: FiCpu,
    title: "AI 맞춤 추천",
    description: "당신의 취향과 라이프스타일을\n분석해 제안해드려요.",
  },
  {
    icon: FiEdit3,
    title: "간편한 편집",
    description: "드래그 앤 드롭으로 자유롭게\n수정할 수 있어요.",
  },
];

const homePreviewRoom = {
  ...sampleRoom,
  camera: {
    ...sampleRoom.camera,
    type: "orthographic" as const,
    position: {
      x: -6.4,
      y: 5.2,
      z: 6.2,
    },
    target: {
      x: 0.15,
      y: 0.7,
      z: -0.1,
    },
    zoom: 82,
  },
};

export function Home() {
  const navigate = useNavigate();
  return (
    <main className="min-h-screen bg-[#fbfbfb] text-[#141414]">

      <section className="ml-20 grid min-h-135 items-center gap-8 px-5 py-10 sm:px-8 lg:grid-cols-[0.88fr_1.12fr] lg:px-12 lg:py-14">        
        <div className="max-w-130">
          <h1 className="flex flex-col gap-3 text-[34px] font-bold leading-[1.2] tracking-normal text-[#111111] sm:text-[44px] lg:text-[50px]">
            <span className="whitespace-nowrap">당신만의 공간,</span>
            <span className="whitespace-nowrap">AI가 완성해드립니다</span>
          </h1>

          <p className="mt-7 text-base font-medium leading-[1.6] text-[#747474] sm:text-lg">
            원하는 스타일과 라이프스타일을 입력하면
            <br />
            AI가 최적의 인테리어를 제안해드려요.
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
          />
        </div>
      </section>

      <section>
        <div className="flex px-35 py-9">
          {features.map((feature, index) => {
            const Icon = feature.icon;

            return (
              <div
                key={feature.title}
                className={`flex-1 ${
                  index === 0
                    ? "flex justify-start"
                    : index === 1
                    ? "flex justify-center"
                    : "flex justify-end"
                }`}
              >
                <article className="flex items-center gap-5">
                  <Icon className="h-10 w-10 shrink-0 stroke-[1.6] text-[#111111]" />

                  <div>
                    <h3 className="text-base font-bold text-[#161616]">
                      {feature.title}
                    </h3>
                    <p className="mt-2 whitespace-pre-line text-sm leading-normal text-[#777777]">
                      {feature.description}
                    </p>
                  </div>
                </article>
              </div>
            );
          })}
        </div>
      </section>
    </main>
  );
}
