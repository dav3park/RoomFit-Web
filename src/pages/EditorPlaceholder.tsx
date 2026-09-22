import { useEffect, useReducer, useRef, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";

import {
  applyLayoutFeedback,
  createBlankLayout,
  createDefaultAgentContext,
  getLayout,
  recommendLayout,
  type InterpretedIntent,
  type LayoutValidationResult,
  type ScoreSummary,
} from "../api/layouts";
import {
  AgentContextRequestValidationError,
  normalizeBackendRoomId,
} from "../api/agentContextRequest";
import { applyBackendFurnitureToLayout } from "../api/rooms";
import { ensureCustomRoomBackendRoom } from "../api/customRoomBackend";
import EditorFeedbackPanel from "../components/editor/EditorFeedbackPanel";
import {
  beginFeedbackRequest,
  createEmptyFeedbackResult,
  readFeedbackErrorMessage,
  shouldAcceptFeedbackResponse,
  type FeedbackResultState,
} from "../components/editor/feedbackResultState";
import RecommendationResultPanel from "../components/editor/RecommendationResultPanel";
import ScoreSummaryPanel from "../components/editor/ScoreSummaryPanel";
import SelectedFurnitureActions from "../components/editor/SelectedFurnitureActions";
import {
  canResetEditorFurniture,
  createEditorLayoutScopeKey,
  createEditorLayoutState,
  reduceEditorLayoutState,
} from "../components/editor/editorLayoutState";
import {
  resolveFeedbackRoomLayout,
  resolveNextFeedbackLayoutId,
} from "../components/editor/feedbackPresentation";
import RoomViewer from "../components/room/RoomViewer";
import {
  moveFurnitureInsideRoom,
  rotateFurnitureInsideRoom,
} from "../components/room/furnitureBoundary";
import { getLiveMirrorForSelectedRoom } from "../config/confirmedLayouts";
import { readActiveClientScope } from "../config/clientScope";
import {
  resolveRoomLayoutPreferredColorTone,
  withAppliedPreferredColorTone,
} from "../config/appliedColorTone";
import { readPreferredColorTone } from "../config/preferredColorTone";
import {
  isSessionForRoom,
  readActiveLayoutEditingSession,
  readLayoutNavigationState,
  resolveEditorInitialRoomLayout,
  saveLayoutResponseSession,
} from "../config/layoutEditingSession";
import {
  flushEditorLayoutPersistence,
  persistEditorLayoutSnapshot,
} from "../config/layoutEditingWorkflow";
import {
  clearRecommendationResult,
  readRecommendationResult,
  resolveRecommendationDecision,
  saveRecommendationResult,
  type RecommendationResultNotice,
  type RecommendationResultOwner,
} from "../config/recommendationResult";
import { readRoomSetupSession } from "../config/roomSetupSession";
import type { Furniture, RoomLayout, Vector2D } from "../types";

// The latest room mirror saved by the setup/editor workflow.
function loadSelectedRoomLayout(): RoomLayout | null {
  const raw = localStorage.getItem("roomfit:selectedRoomLayout");

  if (!raw) {
    return null;
  }

  try {
    return JSON.parse(raw) as RoomLayout;
  } catch {
    return null;
  }
}

function loadBackendRoomId(): number | null {
  return normalizeBackendRoomId(localStorage.getItem("roomfit:backendRoomId"));
}

function readCurrentRecommendationOwner(): RecommendationResultOwner | null {
  const setup = readRoomSetupSession();
  if (!setup?.roomLayoutId || setup.backendRoomId === null) return null;
  return {
    sessionId: setup.sessionId,
    roomLayoutId: setup.roomLayoutId,
    backendRoomId: setup.backendRoomId,
  };
}

function readCurrentRecommendationNotice(): RecommendationResultNotice | null {
  return readRecommendationResult(readCurrentRecommendationOwner());
}

function saveCurrentRecommendationNotice(notice: RecommendationResultNotice): void {
  const owner = readCurrentRecommendationOwner();
  if (owner) saveRecommendationResult(owner, notice);
}

function clearCurrentRecommendationNotice(): void {
  const owner = readCurrentRecommendationOwner();
  if (owner) clearRecommendationResult(sessionStorage, owner);
}

export default function EditorPlaceholder() {
  const location = useLocation();
  const navigate = useNavigate();
  const routeNavigationState = readLayoutNavigationState(location.state);
  const selectedBaseline = loadSelectedRoomLayout();
  const backendRoomId = loadBackendRoomId();
  const storedSession = readActiveLayoutEditingSession();
  const matchingSession = selectedBaseline && backendRoomId !== null
    && isSessionForRoom(storedSession, selectedBaseline.id, backendRoomId)
    ? storedSession
    : null;
  const ownedRouteNavigationState = routeNavigationState
    && selectedBaseline
    && backendRoomId === routeNavigationState.roomId
    && selectedBaseline.id === routeNavigationState.roomLayoutId
    ? routeNavigationState
    : null;
  const navigationState = matchingSession
    && ownedRouteNavigationState?.activeLayoutId !== matchingSession.activeLayoutId
    ? null
    : ownedRouteNavigationState;
  const matchingSessionLayoutId = matchingSession?.activeLayoutId ?? null;
  const matchingSessionBackendRoomId = matchingSession?.backendRoomId ?? null;
  const matchingSessionEditingMode = matchingSession?.editingMode;
  const navigationHasSavedDraft = Boolean(navigationState?.roomLayout && navigationState.layoutResponse);
  const [layoutId, setLayoutId] = useState<number | null>(
    navigationState?.activeLayoutId ?? matchingSession?.activeLayoutId ?? null,
  );
  const activeClientScope = readActiveClientScope();
  const editorScopeKey = createEditorLayoutScopeKey({
    roomLayoutId: selectedBaseline?.id ?? null,
    backendRoomId,
    activeLayoutId: layoutId,
    clientMode: activeClientScope?.mode ?? null,
    clientId: activeClientScope?.clientId ?? null,
    setupSessionId: activeClientScope?.setupSessionId ?? null,
    scopedRoomLayoutId: activeClientScope?.roomLayoutId ?? null,
    scopedBackendRoomId: activeClientScope?.backendRoomId ?? null,
  });
  const [editorLayout, dispatchEditorLayout] = useReducer(
    reduceEditorLayoutState,
    undefined,
    () => createEditorLayoutState(resolveEditorInitialRoomLayout({
      navigationState,
      activeSession: matchingSession,
      selectedRoomLayout: selectedBaseline,
      liveMirror: getLiveMirrorForSelectedRoom(),
    }), editorScopeKey),
  );
  const roomLayout = editorLayout.roomLayout;
  const preferredColorTone = roomLayout
    ? resolveRoomLayoutPreferredColorTone(roomLayout)
    : null;
  const [selectedFurnitureId, setSelectedFurnitureId] = useState<string | null>(null);
  const [feedback, setFeedback] = useState("");
  const [hideEntranceWalls, setHideEntranceWalls] = useState(false);
  const [isRecommending, setIsRecommending] = useState(false);
  const [isPreparingCatalog, setIsPreparingCatalog] = useState(false);
  const [isApplyingFeedback, setIsApplyingFeedback] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");
  const [scoreSummary, setScoreSummary] = useState<ScoreSummary | null>(
    navigationState?.layoutResponse?.scoreSummary ?? null,
  );
  const [validationResult, setValidationResult] = useState<LayoutValidationResult | null>(
    navigationState?.layoutResponse?.validationResult ?? null,
  );
  const [interpretedIntent, setInterpretedIntent] = useState<InterpretedIntent | null>(null);
  const [feedbackResult, setFeedbackResult] = useState<FeedbackResultState>(createEmptyFeedbackResult);
  const [recommendationNotice, setRecommendationNotice] = useState<RecommendationResultNotice | null>(
    readCurrentRecommendationNotice,
  );
  const recommendationInFlightRef = useRef(false);
  const feedbackInFlightRef = useRef(false);
  const feedbackRequestSequenceRef = useRef(0);
  const activeLayoutIdRef = useRef(layoutId);
  const isMountedRef = useRef(true);
  const customRoomCreationRef = useRef<Promise<number> | null>(null);

  useEffect(() => {
    activeLayoutIdRef.current = layoutId;
  }, [layoutId]);

  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
      feedbackRequestSequenceRef.current += 1;
      feedbackInFlightRef.current = false;
    };
  }, []);

  useEffect(() => {
    if (matchingSessionLayoutId === null || matchingSessionBackendRoomId === null || navigationHasSavedDraft) return;
    let cancelled = false;

    flushEditorLayoutPersistence()
      .then(() => getLayout(matchingSessionLayoutId))
      .then((response) => {
        if (cancelled) return;
        const baseline = loadSelectedRoomLayout();
        if (!baseline || response.roomId !== matchingSessionBackendRoomId) return;
        const restored = applyBackendFurnitureToLayout(baseline, response.recommendedFurniture);
        dispatchEditorLayout({ type: "replace", roomLayout: restored, scopeKey: editorScopeKey });
        setLayoutId(response.layoutId);
        setScoreSummary(response.scoreSummary);
        setValidationResult(response.validationResult);
        saveLayoutResponseSession(baseline.id, response, localStorage, matchingSessionEditingMode);
        localStorage.setItem("roomfit:selectedRoomLayout", JSON.stringify(restored));
      })
      .catch(() => {
        if (!cancelled) {
          setErrorMessage("편집 중인 배치를 불러오지 못했습니다. 방을 다시 선택해 주세요.");
        }
      });

    return () => {
      cancelled = true;
    };
  }, [editorScopeKey, matchingSessionBackendRoomId, matchingSessionEditingMode, matchingSessionLayoutId, navigationHasSavedDraft]);

  useEffect(() => {
    if (!roomLayout) {
      return;
    }

    localStorage.setItem("roomfit:selectedRoomLayout", JSON.stringify(roomLayout));
  }, [roomLayout]);

  useEffect(() => {
    const request = editorLayout.persistenceRequest;
    if (!request) return;
    let active = true;

    persistEditorLayoutSnapshot(request.roomLayout)
      .then((result) => {
        if (!active || !result?.layoutResponse) return;
        setScoreSummary(result.layoutResponse.scoreSummary);
        setValidationResult(result.layoutResponse.validationResult);
      })
      .catch(() => {
        if (active) {
          setErrorMessage("편집 내용을 저장하지 못했습니다. 현재 화면에서 다시 시도해 주세요.");
        }
      })
      .finally(() => {
        if (active) {
          dispatchEditorLayout({
            type: "finishPersistence",
            scopeKey: request.scopeKey,
            requestId: request.requestId,
          });
        }
      });

    return () => {
      active = false;
    };
  }, [editorLayout.persistenceRequest]);

  const handleMoveFurniture = (id: string, position: Vector2D) => {
    dispatchEditorLayout({
      type: "updateEdit",
      scopeKey: editorScopeKey,
      update: (current) => ({
        ...current,
        furniture: current.furniture.map((item) =>
          item.id === id
            ? markUserModified(moveFurnitureInsideRoom(current, item, position))
            : item,
        ),
      }),
    });
  };

  const handleBeginMoveFurniture = () => {
    dispatchEditorLayout({ type: "beginEdit", scopeKey: editorScopeKey });
  };

  const handleEndMoveFurniture = () => {
    dispatchEditorLayout({ type: "endEdit", scopeKey: editorScopeKey });
  };

  const handleRotateFurniture = (id: string) => {
    dispatchEditorLayout({
      type: "edit",
      scopeKey: editorScopeKey,
      update: (current) => ({
        ...current,
        furniture: current.furniture.map((item) =>
          item.id === id
            ? markUserModified(rotateFurnitureInsideRoom(current, item, item.rotationY + Math.PI / 2))
            : item,
        ),
      }),
    });
  };

  const handleDeleteFurniture = (id: string) => {
    dispatchEditorLayout({
      type: "edit",
      scopeKey: editorScopeKey,
      update: (current) => ({
        ...current,
        furniture: current.furniture.map((item) => (
          item.id === id ? { ...item, status: "deleted" } : item
        )),
      }),
    });
  };

  const handleResetFurniture = (id: string) => {
    if (editorLayout.isPersisting
      || !canResetEditorFurniture(editorLayout, editorScopeKey, id)) {
      return;
    }
    setErrorMessage("");
    dispatchEditorLayout({ type: "resetFurniture", scopeKey: editorScopeKey, furnitureId: id });
  };

  // "+ 가구 추가"는 카탈로그에서 실제 제품을 골라 바로 배치하는 화면으로 이동한다.
  // 스캔만 하고 AI 추천을 한 번도 돌리지 않은 방은 아직 layoutId가 없으므로
  // (handleRecommend/handleFeedback을 통해서만 생긴다), 여기서 온디맨드로 빈
  // Layout을 만들어 둔다 — ensureCustomRoomBackendRoom과 같은 패턴.
  const handleOpenCatalog = async () => {
    if (!roomLayout) {
      setErrorMessage("먼저 /rooms에서 샘플 방을 선택해 주세요.");
      return;
    }
    if (layoutId !== null) {
      navigate("/add-furniture");
      return;
    }

    setIsPreparingCatalog(true);
    setErrorMessage("");
    try {
      let roomId = loadBackendRoomId();
      if (roomLayout.source === "CUSTOM") {
        const customRoomSnapshot = loadSelectedRoomLayout() ?? roomLayout;
        customRoomCreationRef.current ??= ensureCustomRoomBackendRoom({ room: customRoomSnapshot });
        roomId = await customRoomCreationRef.current;
      }
      if (roomId === null) {
        setErrorMessage("유효한 백엔드 방을 다시 선택해 주세요.");
        return;
      }

      const response = await createBlankLayout(roomId);
      const blankLayout = applyBackendFurnitureToLayout(roomLayout, response.recommendedFurniture);
      dispatchEditorLayout({
        type: "replace",
        roomLayout: blankLayout,
        scopeKey: createEditorLayoutScopeKey({
          roomLayoutId: roomLayout.id,
          backendRoomId: roomId,
          activeLayoutId: response.layoutId,
          clientMode: activeClientScope?.mode ?? null,
          clientId: activeClientScope?.clientId ?? null,
          setupSessionId: activeClientScope?.setupSessionId ?? null,
          scopedRoomLayoutId: activeClientScope?.roomLayoutId ?? null,
          scopedBackendRoomId: activeClientScope?.backendRoomId ?? null,
        }),
      });
      setLayoutId(response.layoutId);
      setScoreSummary(response.scoreSummary);
      setValidationResult(response.validationResult);
      saveLayoutResponseSession(roomLayout.id, response, localStorage, "INITIAL_SETUP");
      navigate("/add-furniture");
    } catch (error) {
      console.error(error);
      setErrorMessage("가구 추가 화면을 여는 데 실패했습니다. 잠시 후 다시 시도해 주세요.");
    } finally {
      customRoomCreationRef.current = null;
      setIsPreparingCatalog(false);
    }
  };

  const handleRecommend = async () => {
    if (!roomLayout) {
      setErrorMessage("먼저 /rooms에서 샘플 방을 선택해 주세요.");
      return;
    }

    // AI 추천은 항상 빈 방에서 새로 시작한다 (기존 배치를 지우고 재생성) — 되돌릴
    // 수 없는 동작이므로, 지울 것이 실제로 있을 때만 한 번 확인한다.
    const hasExistingFurniture = roomLayout.furniture.some((item) => item.status !== "deleted");
    if (hasExistingFurniture && !window.confirm("기존 배치를 지우고 AI가 새로 추천하게 할까요?")) {
      return;
    }

    if (recommendationInFlightRef.current) {
      return;
    }
    recommendationInFlightRef.current = true;

    const recommendationColorTone = readPreferredColorTone() ?? preferredColorTone;

    let roomId = loadBackendRoomId();

    if (roomLayout.source === "CUSTOM") {
      setIsRecommending(true);
      setErrorMessage("");
      setInterpretedIntent(null);

      try {
        const customRoomSnapshot = loadSelectedRoomLayout() ?? roomLayout;
        customRoomCreationRef.current ??= ensureCustomRoomBackendRoom({ room: customRoomSnapshot });
        roomId = await customRoomCreationRef.current;
      } catch {
        setErrorMessage("커스텀 방을 백엔드에 저장하지 못했습니다. 잠시 후 다시 시도해 주세요.");
        setIsRecommending(false);
        recommendationInFlightRef.current = false;
        return;
      } finally {
        customRoomCreationRef.current = null;
      }
    }

    if (roomId === null) {
      setErrorMessage("유효한 백엔드 방을 다시 선택해 주세요.");
      recommendationInFlightRef.current = false;
      return;
    }

    setIsRecommending(true);
    setErrorMessage("");
    setInterpretedIntent(null);

    try {
      await flushEditorLayoutPersistence();
      const context = await createDefaultAgentContext(roomId);
      const result = await recommendLayout(roomId, context.contextId);

      const decision = resolveRecommendationDecision(result);
      if (decision.status === "FAILED") {
        setScoreSummary(result.scoreSummary);
        setValidationResult(result.validationResult);
        setInterpretedIntent(result.interpretedIntent ?? null);
        if (decision.notice) {
          saveCurrentRecommendationNotice(decision.notice);
          setRecommendationNotice(decision.notice);
        }
        return;
      }
      if (result.layoutId === null) {
        throw new Error("Backend recommendation response has no persisted layoutId.");
      }

      const recommendedLayout = applyBackendFurnitureToLayout(roomLayout, result.recommendedFurniture);
      dispatchEditorLayout({
        type: "replace",
        roomLayout: withAppliedPreferredColorTone(recommendedLayout, recommendationColorTone),
        scopeKey: createEditorLayoutScopeKey({
          roomLayoutId: roomLayout.id,
          backendRoomId: roomId,
          activeLayoutId: result.layoutId,
          clientMode: activeClientScope?.mode ?? null,
          clientId: activeClientScope?.clientId ?? null,
          setupSessionId: activeClientScope?.setupSessionId ?? null,
          scopedRoomLayoutId: activeClientScope?.roomLayoutId ?? null,
          scopedBackendRoomId: activeClientScope?.backendRoomId ?? null,
        }),
      });
      setLayoutId(result.layoutId);
      saveLayoutResponseSession(roomLayout.id, { ...result, layoutId: result.layoutId });
      setScoreSummary(result.scoreSummary);
      setValidationResult(result.validationResult);
      if (decision.notice) {
        saveCurrentRecommendationNotice(decision.notice);
        setRecommendationNotice(decision.notice);
      } else {
        clearCurrentRecommendationNotice();
        setRecommendationNotice(null);
      }
    } catch (error) {
      console.error(error);
      setErrorMessage(
        error instanceof AgentContextRequestValidationError
          ? error.message
          : "AI 추천 생성에 실패했습니다. 백엔드 서버 상태를 확인해 주세요.",
      );
    } finally {
      setIsRecommending(false);
      recommendationInFlightRef.current = false;
    }
  };

  const handleFeedback = async (selectedFurnitureIdOverride?: string | null) => {
    if (!roomLayout) {
      setFeedbackResult({ presentation: null, errorMessage: "먼저 /rooms에서 샘플 방을 선택해 주세요." });
      return;
    }

    if (!layoutId) {
      setFeedbackResult({ presentation: null, errorMessage: "먼저 AI 추천 생성을 실행해 주세요." });
      return;
    }

    if (!feedback.trim()) {
      setFeedbackResult({ presentation: null, errorMessage: "피드백을 입력해 주세요." });
      return;
    }

    if (!beginFeedbackRequest(feedbackInFlightRef)) {
      return;
    }
    const selectedFurnitureForFeedback = selectedFurnitureIdOverride
      && roomLayout.furniture.some((item) => item.id === selectedFurnitureIdOverride && item.status !== "deleted")
      ? selectedFurnitureIdOverride
      : null;
    const requestSequence = feedbackRequestSequenceRef.current + 1;
    const requestedLayoutId = layoutId;
    const requestedFeedback = feedback.trim();
    feedbackRequestSequenceRef.current = requestSequence;

    setIsApplyingFeedback(true);
    setErrorMessage("");
    setFeedbackResult(createEmptyFeedbackResult());
    setInterpretedIntent(null);

    try {
      await flushEditorLayoutPersistence();
      const result = await applyLayoutFeedback(requestedLayoutId, requestedFeedback, {
        selectedFurnitureId: selectedFurnitureForFeedback,
      });
      if (!shouldAcceptFeedbackResponse({
        isMounted: isMountedRef.current,
        currentSequence: feedbackRequestSequenceRef.current,
        requestSequence,
        activeLayoutId: activeLayoutIdRef.current,
        requestedLayoutId,
      })) {
        return;
      }
      const nextFeedback = resolveFeedbackRoomLayout(roomLayout, result);
      const nextLayoutId = resolveNextFeedbackLayoutId(requestedLayoutId, result.layoutId);

      if (nextFeedback.roomLayout !== roomLayout) {
        dispatchEditorLayout({
          type: "replace",
          roomLayout: nextFeedback.roomLayout,
          scopeKey: createEditorLayoutScopeKey({
            roomLayoutId: roomLayout.id,
            backendRoomId,
            activeLayoutId: nextLayoutId ?? requestedLayoutId,
            clientMode: activeClientScope?.mode ?? null,
            clientId: activeClientScope?.clientId ?? null,
            setupSessionId: activeClientScope?.setupSessionId ?? null,
            scopedRoomLayoutId: activeClientScope?.roomLayoutId ?? null,
            scopedBackendRoomId: activeClientScope?.backendRoomId ?? null,
          }),
        });
      }
      if (nextLayoutId !== null) {
        setLayoutId(nextLayoutId);
        saveLayoutResponseSession(roomLayout.id, { ...result, layoutId: nextLayoutId });
      }
      setScoreSummary(result.scoreSummary);
      setValidationResult(result.validationResult);
      setInterpretedIntent(result.interpretedIntent ?? null);
      setFeedbackResult({ presentation: nextFeedback.presentation, errorMessage: "" });
    } catch (error) {
      console.error(error);
      if (shouldAcceptFeedbackResponse({
        isMounted: isMountedRef.current,
        currentSequence: feedbackRequestSequenceRef.current,
        requestSequence,
        activeLayoutId: activeLayoutIdRef.current,
        requestedLayoutId,
      })) {
        setFeedbackResult({ presentation: null, errorMessage: readFeedbackErrorMessage(error) });
      }
    } finally {
      feedbackInFlightRef.current = false;
      if (isMountedRef.current && feedbackRequestSequenceRef.current === requestSequence) {
        setIsApplyingFeedback(false);
      }
    }
  };

  const handleClarificationCandidate = (furnitureId: string) => {
    if (!roomLayout?.furniture.some((item) => item.id === furnitureId && item.status !== "deleted")) {
      return;
    }
    setSelectedFurnitureId(furnitureId);
    void handleFeedback(furnitureId);
  };

  if (!roomLayout) {
    return (
      <main className="grid min-h-[calc(100vh-76px)] place-items-center bg-[#fbfbfb] px-5 text-center text-[#141414]">
        <section>
          <span className="text-sm font-bold text-[#777777]">NO ROOM SELECTED</span>
          <h1 className="mt-4 text-3xl font-extrabold">선택된 방이 없습니다</h1>
          <p className="mt-4 text-base text-[#777777]">먼저 /rooms에서 샘플 방을 선택한 뒤 편집 화면으로 이동해 주세요.</p>
        </section>
      </main>
    );
  }

  const warnings = validationResult?.warnings ?? [];
  const selectedFurniture = selectedFurnitureId
    ? roomLayout.furniture.find((item) => item.id === selectedFurnitureId)
    : undefined;
  const canResetSelectedFurniture = !editorLayout.isPersisting
    && canResetEditorFurniture(editorLayout, editorScopeKey, selectedFurniture?.id ?? null);

  return (
    <main className="min-h-[calc(100vh-76px)] bg-[#fbfbfb] text-[#141414]">
      <section className="grid min-h-[calc(100vh-76px)] grid-cols-1 lg:grid-cols-[minmax(0,1fr)_380px]">
        <section className="relative flex min-h-140 flex-col px-6 py-6 lg:px-8">
          <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
            <div className="flex min-w-0 flex-wrap items-center gap-3">
              <h1 className="min-w-0 truncate text-2xl font-extrabold ml-2">{roomLayout.name}</h1>
              <span className="rounded-full bg-[#eeeeee] px-3 py-1 text-xs font-bold text-[#777777]">
                가구 {roomLayout.furniture.filter((item) => item.status !== "deleted").length}개
              </span>
              <span className="rounded-full bg-[#eeeeee] px-3 py-1 text-xs font-bold text-[#777777]">
                {roomLayout.width}m × {roomLayout.depth}m
              </span>
            </div>

            <label className="flex cursor-pointer items-center gap-2 rounded-lg border border-[#dfdfdf] bg-white px-3 py-2 text-sm font-extrabold text-[#333333] transition-colors hover:bg-[#f6f6f6]">
              <input
                type="checkbox"
                checked={hideEntranceWalls}
                onChange={(event) => setHideEntranceWalls(event.target.checked)}
                className="h-4 w-4 accent-[#111111]"
              />
              내부 보기
            </label>
          </div>

          <div className="mb-3 flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => void handleOpenCatalog()}
              disabled={isPreparingCatalog}
              className="inline-flex min-h-10 items-center gap-2 rounded-lg border border-[#e2e2e2] bg-white px-4 py-2 text-sm font-extrabold text-[#222222] transition-colors hover:bg-[#f2f2f2] disabled:cursor-wait disabled:opacity-60"
            >
              <span aria-hidden="true">+</span> {isPreparingCatalog ? "준비 중..." : "가구 추가"}
            </button>
            <button
              type="button"
              onClick={() => navigate("/preference", { state: location.state })}
              className="inline-flex min-h-10 items-center gap-2 rounded-lg bg-[#111111] px-4 py-2 text-sm font-extrabold text-white transition-colors hover:bg-[#333333]"
            >
              <span aria-hidden="true">✨</span> AI 추천 받기
            </button>
          </div>

          <SelectedFurnitureActions
            selectedFurnitureId={selectedFurniture?.id ?? null}
            selectedFurnitureName={selectedFurniture?.name}
            canEditSelection={selectedFurniture?.status !== "deleted"}
            onRotate={handleRotateFurniture}
            onDelete={handleDeleteFurniture}
            onReset={handleResetFurniture}
            canReset={canResetSelectedFurniture}
          />

          <div className="manage-room flex-1">
            <RoomViewer
              room={roomLayout}
              furniture={roomLayout.furniture.filter((item) => item.status !== "deleted")}
              selectedFurnitureId={selectedFurnitureId}
              onSelectFurniture={setSelectedFurnitureId}
              onMoveFurniture={handleMoveFurniture}
              onBeginMoveFurniture={handleBeginMoveFurniture}
              onEndMoveFurniture={handleEndMoveFurniture}
              hideEntranceWalls={hideEntranceWalls}
              alignCameraToEntrance
              showEditingHelpers
              preferredColorTone={preferredColorTone}
            />
          </div>
        </section>

        <aside className="space-y-5 border-t border-[#eeeeee] bg-[#fbfbfb] p-5 lg:border-l lg:border-t-0">
          <EditorFeedbackPanel
            layoutReady={Boolean(layoutId)}
            feedback={feedback}
            isApplyingFeedback={isApplyingFeedback}
            isRecommending={isRecommending}
            result={feedbackResult}
            onFeedbackChange={setFeedback}
            onApplyFeedback={() => void handleFeedback()}
            onRecommend={handleRecommend}
            onSelectCandidate={handleClarificationCandidate}
          />

          {recommendationNotice && (
            <RecommendationResultPanel
              notice={recommendationNotice}
              onReturnToFurniture={() => navigate("/add-furniture", { state: location.state })}
            />
          )}

          {interpretedIntent && (
            <section className="rounded-xl border border-[#dfe8ff] bg-[#f7f9ff] p-5">
              <h2 className="text-lg font-extrabold">LLM 해석 결과</h2>
              <dl className="mt-4 space-y-3 text-sm">
                <InfoItem label="source" value={interpretedIntent.source ?? "-"} />
                <InfoItem label="intent" value={interpretedIntent.rawIntent ?? "-"} />
                <InfoItem label="target" value={interpretedIntent.targetFurniture ?? "-"} />
                <InfoItem label="fallback" value={String(interpretedIntent.fallbackUsed ?? false)} />
              </dl>
            </section>
          )}

          {scoreSummary && validationResult && recommendationNotice?.status !== "FAILED" && (
            <ScoreSummaryPanel
              scoreSummary={scoreSummary}
              validationResult={validationResult}
              recommendationStatus={recommendationNotice?.status}
            />
          )}

          {validationResult && (
            <section data-editor-section="validation" className="rounded-xl border border-[#e6e6e6] bg-white p-5">
              <h2 className="text-lg font-extrabold">검증 결과</h2>
              <div className="mt-4 space-y-2 text-sm font-semibold">
                <CheckLine label="충돌 없음" ok={validationResult.collisionFree} />
                <CheckLine label="방 경계 내 배치" ok={validationResult.boundaryValid} />
                <CheckLine label="문 앞 공간 확보" ok={validationResult.doorClearance} />
                <CheckLine label="창문 앞 공간 확보" ok={validationResult.windowClearance} />
                <CheckLine label="이동 동선 확보" ok={validationResult.pathSecured} />
              </div>

              {warnings.length > 0 && (
                <div className="mt-4 rounded-xl bg-[#fff8e6] p-4">
                  <strong className="text-sm font-extrabold text-[#9a6500]">경고</strong>
                  <ul className="mt-2 list-disc space-y-1 pl-5 text-sm font-semibold text-[#8a5a00]">
                    {warnings.map((warning) => (
                      <li key={warning}>{warning}</li>
                    ))}
                  </ul>
                </div>
              )}
            </section>
          )}

          {errorMessage && (
            <section role="alert" className="rounded-xl border border-[#ffd8d8] bg-[#fff5f5] p-5 text-sm font-bold text-[#c0392b]">
              {errorMessage}
            </section>
          )}
        </aside>
      </section>
    </main>
  );
}

function markUserModified(item: Furniture): Furniture {
  return item.status === "deleted" ? item : { ...item, status: "user_modified" };
}

function InfoItem({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-4">
      <dt className="font-bold text-[#777777]">{label}</dt>
      <dd className="font-extrabold text-[#111111]">{value}</dd>
    </div>
  );
}

function CheckLine({ label, ok }: { label: string; ok: boolean }) {
  return (
    <div className="flex items-center justify-between">
      <span>{label}</span>
      <span className={ok ? "text-[#16803a]" : "text-[#d35400]"}>{ok ? "양호" : "경고"}</span>
    </div>
  );
}
