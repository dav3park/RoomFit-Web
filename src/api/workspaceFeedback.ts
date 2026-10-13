import { apiClient } from './client';
import type { BackendFurnitureApiItem } from './rooms';
import type { FeedbackClarification, LayoutValidationResult } from './layouts';
import type { RecommendationPalette, RecommendationPurpose, RecommendationStyle } from '../recommendation/engine';

export type WorkspaceFeedbackOperation = 'MOVE' | 'ROTATE' | 'REPLACE_PRODUCT' | 'ADD_FURNITURE' | 'REMOVE_FURNITURE' | 'SWAP_FURNITURE';
export interface WorkspaceFeedbackOperationResult {
  operationId: string;
  type: WorkspaceFeedbackOperation;
  status: 'APPLIED' | 'FAILED' | 'SKIPPED';
  reasonCode: string | null;
  affectedFurnitureId: string | null;
}
export interface WorkspaceFeedbackSelection {
  revision: string;
  feedback: string;
  requiredField: 'targetFurnitureId' | 'referenceFurnitureId';
  furnitureId: string;
}
export interface WorkspaceFeedbackRequest {
  roomId: number;
  revision: string;
  feedback: string;
  roomDimensions: { width: number; depth: number; height: number };
  furniture: BackendFurnitureApiItem[];
  lockedFurnitureIds: string[];
  selectedFurnitureId: string | null;
  preferences: { purpose: RecommendationPurpose; style: RecommendationStyle; palette: RecommendationPalette };
  clarificationSelections?: WorkspaceFeedbackSelection[];
}
export interface WorkspaceFeedbackResponse {
  revision: string;
  status: 'SUCCESS' | 'FAILED' | 'NEEDS_CLARIFICATION';
  source: 'LLM';
  reasonCode: string | null;
  summary: string;
  furniture: BackendFurnitureApiItem[];
  operationResults: WorkspaceFeedbackOperationResult[];
  clarification: FeedbackClarification | null;
  validationResult: LayoutValidationResult;
}

export async function previewWorkspaceFeedback(request: WorkspaceFeedbackRequest, signal: AbortSignal): Promise<WorkspaceFeedbackResponse> {
  const response = await apiClient.post<{ success: boolean; data: WorkspaceFeedbackResponse }>(
    '/api/layouts/feedback/preview', request, { signal },
  );
  const data = response.data.data;
  if (!response.data.success || !data || data.revision !== request.revision || data.source !== 'LLM'
      || !['SUCCESS', 'FAILED', 'NEEDS_CLARIFICATION'].includes(data.status)
      || typeof data.summary !== 'string' || !Array.isArray(data.furniture) || !Array.isArray(data.operationResults)) {
    throw new Error('피드백 응답을 확인하지 못했습니다. 현재 배치는 유지됩니다. 다시 요청해 주세요.');
  }
  return data;
}
