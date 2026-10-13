import { useCallback, useEffect, useRef, useState } from 'react';
import type { RoomLayout } from '../../types';
import { previewWorkspaceFeedback, type WorkspaceFeedbackRequest, type WorkspaceFeedbackResponse, type WorkspaceFeedbackSelection } from '../../api/workspaceFeedback';
import { buildWorkspaceFeedbackRequest, prepareWorkspaceFeedbackPreview, type WorkspaceFeedbackPreview } from '../../config/workspaceFeedback';
import { readFeedbackErrorMessage } from './feedbackResultState';
import { getActiveRequestClientId } from '../../config/clientScope';
import { validateRecommendationLayout } from '../../recommendation/layoutValidation';

export interface WorkspaceFeedbackState {
  phase: 'idle' | 'pending' | 'failed' | 'question' | 'ready' | 'applied';
  message: string;
  result: WorkspaceFeedbackResponse | null;
  preview: WorkspaceFeedbackPreview | null;
}
const empty = (): WorkspaceFeedbackState => ({ phase: 'idle', message: '', result: null, preview: null });

export function useWorkspaceFeedback(options: {
  backendRoomId?: number;
  getRoom: () => RoomLayout;
  preferences: WorkspaceFeedbackRequest['preferences'];
  selectedFurnitureId: string | null;
  onRequest: () => void;
  onApply: (room: RoomLayout) => void;
}) {
  const [state, setState] = useState<WorkspaceFeedbackState>(empty);
  const sequence = useRef(0);
  const mounted = useRef(false);
  const controller = useRef<AbortController | null>(null);
  const context = useRef<{ base: RoomLayout; request: WorkspaceFeedbackRequest; clientId: string | null } | null>(null);
  useEffect(() => {
    mounted.current = true;
    return () => { mounted.current = false; controller.current?.abort(); };
  }, []);
  const invalidate = useCallback(() => {
    sequence.current++; controller.current?.abort(); controller.current = null; context.current = null;
    setState(empty());
  }, []);

  async function execute(request: WorkspaceFeedbackRequest, base: RoomLayout, clientId: string | null) {
    if (controller.current) return;
    options.onRequest();
    const current = ++sequence.current;
    const abort = new AbortController(); controller.current = abort;
    context.current = { base, request, clientId };
    const currentRequest = () => mounted.current && sequence.current === current && !abort.signal.aborted
      && options.getRoom() === base && getActiveRequestClientId() === clientId;
    setState({ ...empty(), phase: 'pending', message: '변경 후보를 확인하고 있습니다. 현재 배치는 유지됩니다.' });
    try {
      const response = await previewWorkspaceFeedback(request, abort.signal);
      if (!currentRequest()) return;
      if (response.status === 'NEEDS_CLARIFICATION') {
        if (!response.clarification?.question) throw new Error('대상 확인 질문을 읽지 못했습니다. 요청을 다시 작성해 주세요.');
        const candidates = response.clarification.candidates ?? [];
        if (candidates.some(item => !base.furniture.some(original => original.id === item.furnitureId && original.status !== 'deleted'))) {
          throw new Error('현재 배치에 없는 대상입니다. 요청을 다시 작성해 주세요.');
        }
        setState({ ...empty(), phase: 'question', message: response.clarification.question, result: response });
      } else if (response.status === 'FAILED') {
        setState({ ...empty(), phase: 'failed', message: response.summary || '조건을 만족하는 후보를 찾지 못했습니다. 현재 배치를 유지합니다.', result: response });
      } else {
        const preview = prepareWorkspaceFeedbackPreview(base, request, response);
        setState({ phase: 'ready', message: 'AI 피드백 미리보기입니다. 적용 전까지 현재 배치는 유지됩니다.', result: response, preview });
      }
    } catch (error) {
      if (!currentRequest()) return;
      const message = error instanceof Error && !('isAxiosError' in error) ? error.message : readFeedbackErrorMessage(error);
      setState({ ...empty(), phase: 'failed', message });
    } finally {
      if (controller.current === abort) controller.current = null;
      if (mounted.current && sequence.current === current
          && (options.getRoom() !== base || getActiveRequestClientId() !== clientId)) {
        context.current = null; setState(empty());
      }
    }
  }

  function request(feedback: string) {
    if (controller.current) return;
    try {
      const base = options.getRoom();
      const request = buildWorkspaceFeedbackRequest(base, options.backendRoomId ?? 0, crypto.randomUUID(), feedback,
        options.preferences, options.selectedFurnitureId);
      void execute(request, base, getActiveRequestClientId());
    } catch (error) { setState({ ...empty(), phase: 'failed', message: error instanceof Error ? error.message : '현재 배치를 확인한 뒤 다시 요청해 주세요.' }); }
  }

  function select(furnitureId: string) {
    const pinned = context.current, question = state.result?.clarification;
    if (!pinned || state.phase !== 'question' || options.getRoom() !== pinned.base || !question?.candidates?.some(item => item.furnitureId === furnitureId)) return;
    const field = question.requiredField;
    if (field !== 'targetFurnitureId' && field !== 'referenceFurnitureId') return;
    const answer: WorkspaceFeedbackSelection = { furnitureId, requiredField: field, revision: pinned.request.revision, feedback: pinned.request.feedback };
    const selections = [...pinned.request.clarificationSelections ?? []].filter(item => item.requiredField !== field);
    const next = { ...pinned.request, clarificationSelections: [...selections, answer] };
    void execute(next, pinned.base, pinned.clientId);
  }

  function apply() {
    const pinned = context.current;
    if (state.phase !== 'ready' || !state.preview || !pinned || options.getRoom() !== pinned.base
        || getActiveRequestClientId() !== pinned.clientId) { invalidate(); return; }
    const validation = validateRecommendationLayout(state.preview.room);
    if (!validation.valid) {
      setState({ ...state, preview: { ...state.preview, validation }, message: '공간 검증을 통과하지 못했습니다. 현재 배치는 유지됩니다.' });
      return;
    }
    const next = structuredClone(state.preview.room);
    options.onApply(next);
    setState({ ...state, phase: 'applied', preview: null, message: 'AI 피드백을 현재 배치에 적용했습니다.' });
  }

  return { state, request, select, apply, invalidate };
}
