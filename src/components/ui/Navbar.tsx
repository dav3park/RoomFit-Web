import { useEffect, useRef, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import Button from "./Button";
import {
  canAdvanceFromPath,
  requestOnboardingValidation,
} from "../../config/onboardingSelection";
import { getFurnitureAdditionErrorMessage } from "../../config/furnitureAdditionError";
import FurnitureAdditionLimitDialog from "../furniture/FurnitureAdditionLimitDialog";
import { isFurnitureAdditionLimitError } from "../../config/furnitureAdditionPolicy";

interface NavigationStep {
  path: string;
  label: string;
  beforeNext?: () => Promise<unknown> | unknown;
  handlesNextInPage?: boolean;
  // Overrides the generic "다음 단계" wording for this step's own next-button
  // (e.g. a single-page sub-flow that returns to the editor reads better as
  // "완료" than "다음 단계").
  nextLabel?: string;
}

// The main onboarding/edit sequence. `/manage-furniture` is the dedicated
// scan-correction step (room + existing-furniture dimensions), done once
// right after picking a room, before anything else. `/preference`,
// `/reference-image` and `/recommendation` used to be forced steps between
// `/manage-furniture` and `/editor` — they're now editor-launched sub-flows
// (see preferenceFlowSteps below) so the editor itself is reachable right
// after scan correction. Adding furniture directly is an in-editor sidebar
// widget (FurnitureCatalogPanel), not a routed step at all.
const mainFlowSteps: NavigationStep[] = [
  {
    path: "/",
    label: "홈",
    beforeNext: async () => (await import("../../config/roomSetupSession")).beginNewRoomSetup(),
  },
  {
    path: "/rooms",
    label: "샘플 선택",
    beforeNext: async () => (await import("../../config/roomSetupSession")).prepareSelectedRoomForManagement(),
  },
  {
    path: "/manage-furniture",
    label: "스캔 보정",
    beforeNext: async () => (await import("../../config/layoutEditingWorkflow")).prepareManagedFurnitureDraft(),
  },
  {
    path: "/editor",
    label: "편집",
    beforeNext: async () => (await import("../../config/layoutEditingWorkflow")).persistActiveEditorLayout(),
  },
  { path: "/layout-confirm", label: "결과 확인" },
];

// Launched from the editor's "✨ AI 추천 받기" button. Ends on /recommendation,
// which already manages its own transition back to /editor on success
// (handlesNextInPage), so this flow never needs a return-path of its own.
const preferenceFlowSteps: NavigationStep[] = [
  {
    path: "/preference",
    label: "취향 선택",
    beforeNext: async () => (await import("../../config/layoutEditingWorkflow")).refreshActiveDraftNavigationState(),
  },
  {
    path: "/reference-image",
    label: "이미지 선택",
    beforeNext: async () => (await import("../../config/layoutEditingWorkflow")).refreshActiveDraftNavigationState(),
  },
  {
    path: "/recommendation",
    label: "추천 생성",
    handlesNextInPage: true,
  },
];

const allFlows = [mainFlowSteps, preferenceFlowSteps];

function resolveActiveFlow(pathname: string): NavigationStep[] {
  return allFlows.find((steps) => steps.some((step) => step.path === pathname)) ?? mainFlowSteps;
}

export default function Navbar() {
  const location = useLocation();
  const navigate = useNavigate();
  const activeFlow = resolveActiveFlow(location.pathname);
  const currentStepIndex = activeFlow.findIndex((step) => step.path === location.pathname);
  const safeStepIndex = currentStepIndex >= 0 ? currentStepIndex : 0;
  const isHome = activeFlow === mainFlowSteps && safeStepIndex === 0;
  const isLastStep = safeStepIndex === activeFlow.length - 1;
  const previousStep = activeFlow[safeStepIndex - 1];
  const nextStep = activeFlow[safeStepIndex + 1];
  const [isNavigating, setIsNavigating] = useState(false);
  const [navigationError, setNavigationError] = useState("");
  const [isFurnitureLimitDialogOpen, setIsFurnitureLimitDialogOpen] = useState(false);
  const navigationInFlightRef = useRef(false);
  useEffect(() => {
    if (!["/preference", "/reference-image"].includes(location.pathname)) {
      return;
    }

    let cancelled = false;
    import("../../config/layoutEditingWorkflow")
      .then(({ refreshActiveDraftNavigationState }) => refreshActiveDraftNavigationState())
      .then((state) => {
        if (!cancelled && state) {
          navigate(location.pathname, { replace: true, state });
        }
      })
      .catch(() => {
        if (!cancelled) {
          setNavigationError("편집 중인 배치를 불러오지 못했습니다. 이전 단계에서 다시 시도해 주세요.");
        }
      });

    return () => {
      cancelled = true;
    };
  }, [location.pathname, navigate]);

  const goPrevious = () => {
    if (previousStep) {
      navigate(previousStep.path, { state: location.state });
    }
  };

  const goNext = async () => {
    if (navigationInFlightRef.current) return;
    if (!canAdvanceFromPath(location.pathname)) {
      requestOnboardingValidation(location.pathname);
      return;
    }
    navigationInFlightRef.current = true;
    const currentStep = activeFlow[safeStepIndex];
    setIsNavigating(true);
    setNavigationError("");

    try {
      const nextState = await currentStep.beforeNext?.();

      if (nextStep) {
        navigate(nextStep.path, { state: nextState ?? location.state });
      }
    } catch (error) {
      if (isFurnitureAdditionLimitError(error)) {
        setIsFurnitureLimitDialogOpen(true);
        return;
      }
      const furnitureAdditionMessage = getFurnitureAdditionErrorMessage(error);
      if (furnitureAdditionMessage) {
        setNavigationError(furnitureAdditionMessage);
      } else if (error instanceof Error
        && (error.name === "AgentContextRequestValidationError" || error.name === "LayoutValidationBlockedError")) {
        setNavigationError(error.message);
      } else if (!(error instanceof Error && error.name === "RecommendationFeasibilityError")) {
        setNavigationError(
          location.pathname === "/rooms"
            ? "새 방을 만들지 못했습니다. 현재 선택을 유지한 채 다시 시도해 주세요."
            : "배치를 저장하지 못했습니다. 현재 화면에서 다시 시도해 주세요.",
        );
      }
    } finally {
      setIsNavigating(false);
      navigationInFlightRef.current = false;
    }
  };

  return (
    <nav className="fixed inset-x-0 top-0 z-30 h-19 border-b border-[#e8e8e8] bg-[#fbfbfb]">
      <div className="flex h-full items-center justify-between px-10">
        <button
          type="button"
          onClick={() => navigate("/")}
          className="text-xl font-bold tracking-[0.02em] text-[#181818] transition-opacity hover:opacity-70 sm:text-2xl cursor-pointer"
        >
          ROOMFIT
        </button>

        <div className="flex items-center gap-3">
          {!isHome && previousStep && (
            <button
              type="button"
              onClick={goPrevious}
              className="hidden items-center justify-center rounded-full border border-[#111111] bg-white px-7 py-2.5 text-sm font-semibold text-[#111111] transition-colors hover:bg-[#f5f5f5] sm:inline-flex"
            >
              이전 단계
            </button>
          )}

          {/* LayoutConfirm.tsx has its own in-page "확정하기" button inside the
              요약 정보 aside, which also handles the thumbnail capture on
              confirm — keeping this navbar one too just doubled the button. */}
          {nextStep && !isLastStep && !activeFlow[safeStepIndex].handlesNextInPage && (
            <Button onClick={goNext} disabled={isNavigating} className="hidden px-7 py-2.5 sm:inline-flex">
              {isNavigating
                ? "저장 중..."
                : isHome ? "시작하기" : activeFlow[safeStepIndex].nextLabel ?? "다음 단계"}
            </Button>
          )}
        </div>
      </div>
      {navigationError && (
        <p role="alert" className="absolute right-10 top-[70px] rounded-lg bg-[#fff1f1] px-4 py-3 text-sm font-bold text-[#b42318] shadow">
          {navigationError}
        </p>
      )}
      {isFurnitureLimitDialogOpen && (
        <FurnitureAdditionLimitDialog onClose={() => setIsFurnitureLimitDialogOpen(false)} />
      )}
    </nav>
  );
}
