import { isAxiosError } from "axios";

import { apiClient } from "./client";
import {
  buildAgentContextRequest,
  type AgentContextRequest,
  type DesignStyleApiValue,
  type FurnitureTypeApiValue,
  type LifestyleGoalApiValue,
} from "./agentContextRequest";
import type { PreferredColorToneApiValue } from "../config/preferredColorTone";
import {
  normalizeBackendFurnitureApiItems,
  type BackendFurnitureApiItem,
} from "./rooms";
import { normalizeCanonicalFurnitureType } from "../config/canonicalFurnitureType";
import { FurnitureAdditionRequestError } from "../config/furnitureAdditionError";
export { RAW_TOTAL_SCORE_MAX } from "../config/recommendationScore";
import type { Furniture, RoomLayout } from "../types";

export type {
  AgentContextRequest,
  DesignStyleApiValue,
  LifestyleGoalApiValue,
} from "./agentContextRequest";

interface ApiResponse<T> {
  success: boolean;
  data: T;
  error?: {
    code: string;
    message: string;
  } | null;
}

export interface AgentContextResponse {
  contextId: number;
  roomId: number;
  lifestyleGoal: LifestyleGoalApiValue;
  designStyle: DesignStyleApiValue[];
  requiredItems: FurnitureTypeApiValue[];
  optionalItems: FurnitureTypeApiValue[];
  selectedImageIds: number[];
  selectedProductIds: string[];
  styleTags: string[];
  preferredColorTone: PreferredColorToneApiValue | null;
}

export interface ScoreSummary {
  collisionScore: number;
  boundaryScore: number;
  doorWindowScore: number;
  pathScore: number;
  goalScore: number;
  styleScore: number;
  totalScore: number;
}

export interface LayoutValidationResult {
  collisionFree: boolean;
  boundaryValid: boolean;
  doorClearance: boolean;
  windowClearance: boolean;
  pathSecured: boolean;
  warnings: string[];
}

export interface InterpretedIntent {
  source?: "LLM" | "RULE_BASED" | string;
  rawIntent?: string;
  targetFurniture?: string;
  deskMinWidth?: number;
  constraints?: Record<string, unknown>;
  fallbackUsed?: boolean;
}

export type FeedbackStatus =
  | "SUCCESS"
  | "PARTIAL_SUCCESS"
  | "FAILED"
  | "NEEDS_CLARIFICATION";

export type FeedbackOperationStatus =
  | "APPLIED"
  | "FAILED"
  | "SKIPPED_DEPENDENCY"
  | "NEEDS_CLARIFICATION";

export interface FeedbackOperationResult {
  operationId: string;
  operationType: string;
  status: FeedbackOperationStatus;
  reasonCode?: string | null;
  message: string;
  targetFurnitureId?: string | null;
  resultFurnitureId?: string | null;
  productId?: string | null;
  variantId?: string | null;
}

export interface FeedbackClarificationCandidate {
  /** Internal handle for a retry request. Never render this value to the user. */
  furnitureId: string;
  type?: string | null;
  label?: string | null;
}

export interface ApplyLayoutFeedbackOptions {
  /** Clarification candidate explicitly chosen by the user for this retry. */
  selectedFurnitureId?: string | null;
}

export interface FeedbackClarification {
  reasonCode: string;
  question: string;
  operationId?: string | null;
  requiredField?: string | null;
  candidates?: FeedbackClarificationCandidate[];
}

export interface FeedbackExecutionSummary {
  summary?: string | null;
  noChangeReason?: string | null;
}

export interface LayoutResponse {
  layoutId: number;
  roomId: number;
  sourceLayoutId: number | null;
  confirmed: boolean;
  confirmedAt: string | null;
  status: string;
  recommendedFurniture: BackendFurnitureApiItem[];
  scoreSummary: ScoreSummary;
  validationResult: LayoutValidationResult;
  interpretedIntent?: InterpretedIntent;
  recommendationStatus?: RecommendationStatus;
  requestedFurnitureCount?: number;
  placedFurnitureCount?: number;
  unplacedFurniture?: UnplacedFurniture[];
  warningCode?: string;
  message?: string;
}

export type RecommendationStatus = "SUCCESS" | "PARTIAL_SUCCESS" | "FAILED";

export interface UnplacedFurniture {
  requestIndex: number;
  furnitureType: string;
  productId?: string | null;
  variantId?: string | null;
  reasonCode: string;
  message: string;
}

export interface LayoutRecommendationResponse extends Omit<LayoutResponse, "layoutId"> {
  layoutId: number | null;
}

export interface FeedbackResponse extends Omit<LayoutResponse, "layoutId"> {
  layoutId?: number | null;
  message?: string;
  feedbackStatus?: FeedbackStatus;
  operationResults?: FeedbackOperationResult[];
  clarification?: FeedbackClarification | null;
  clarifications?: FeedbackClarification[];
  feedbackResult?: FeedbackExecutionSummary | null;
}

export interface ConfirmResponse {
  layoutId: number;
  confirmed: boolean;
  confirmedAt: string;
}

export interface DraftFurnitureAdditionRequest {
  contextId: number;
}

type AgentContextStorage = Pick<Storage, "getItem">;

function readStringArrayFromStorage(
  key: string,
  storage: AgentContextStorage = localStorage,
): string[] {
  const raw = storage.getItem(key);

  if (!raw) {
    return [];
  }

  try {
    const parsed = JSON.parse(raw);

    return Array.isArray(parsed) ? parsed.filter((item): item is string => typeof item === "string") : [];
  } catch {
    return [];
  }
}

export function buildDefaultAgentContextRequest(
  roomId: number,
  storage: AgentContextStorage = localStorage,
): AgentContextRequest {
  return buildAgentContextRequest({
    roomId,
    purpose: storage.getItem("roomfit:selectedPurpose"),
    style: storage.getItem("roomfit:selectedStyle"),
    palette: storage.getItem("roomfit:selectedPalette"),
    additionalFurnitureIds: readStringArrayFromStorage("roomfit:selectedAdditionalFurnitureIds", storage),
  });
}

export async function createDefaultAgentContext(roomId: number): Promise<AgentContextResponse> {
  const request = buildDefaultAgentContextRequest(roomId);
  const response = await apiClient.post<ApiResponse<AgentContextResponse>>(
    "/api/agent/context",
    request,
  );

  return response.data.data;
}

export async function recommendLayout(roomId: number, contextId: number): Promise<LayoutRecommendationResponse> {
  const response = await apiClient.post<ApiResponse<unknown>>("/api/layouts/recommend", {
    roomId,
    contextId,
    // "AI 추천 받기" always starts over: whatever is currently placed
    // (scanned or user-placed) is discarded server-side before the
    // placement engine runs, rather than layering new items on top of it.
    discardExisting: true,
  });

  return normalizeRecommendationResponse(response.data.data);
}

export function normalizeRecommendationResponse(value: unknown): LayoutRecommendationResponse {
  if (!isRecord(value)
    || !isPositiveInteger(value.roomId)
    || !Array.isArray(value.recommendedFurniture)) {
    throw new Error("Invalid layout recommendation response");
  }

  const response = value as unknown as LayoutRecommendationResponse;
  return {
    ...response,
    recommendedFurniture: normalizeBackendFurnitureApiItems(response.recommendedFurniture),
    layoutId: isPositiveInteger(value.layoutId) ? value.layoutId : null,
    recommendationStatus: parseRecommendationStatus(value.recommendationStatus),
    requestedFurnitureCount: readNonNegativeInteger(value.requestedFurnitureCount),
    placedFurnitureCount: readNonNegativeInteger(value.placedFurnitureCount),
    unplacedFurniture: parseUnplacedFurniture(value.unplacedFurniture),
    warningCode: readRequiredString(value.warningCode),
    message: readRequiredString(value.message),
  };
}

export async function getLayout(layoutId: number): Promise<LayoutResponse> {
  const response = await apiClient.get<ApiResponse<LayoutResponse>>(`/api/layouts/${layoutId}`);
  return normalizeLayoutResponse(response.data.data);
}

export async function getLatestConfirmedLayout(roomId: number): Promise<LayoutResponse | null> {
  try {
    const response = await apiClient.get<ApiResponse<LayoutResponse>>(
      `/api/layouts/rooms/${roomId}/confirmed/latest`,
    );
    return normalizeLayoutResponse(response.data.data);
  } catch (error) {
    if (isAxiosError(error) && error.response?.status === 404) {
      return null;
    }
    throw error;
  }
}

export async function createLayoutDraft(layoutId: number): Promise<LayoutResponse> {
  const response = await apiClient.post<ApiResponse<LayoutResponse>>(`/api/layouts/${layoutId}/draft`);
  return normalizeLayoutResponse(response.data.data);
}

export async function updateLayout(layoutId: number, room: RoomLayout): Promise<LayoutResponse> {
  const response = await apiClient.put<ApiResponse<LayoutResponse>>(`/api/layouts/${layoutId}`, {
    furniture: room.furniture.map((item) => toFurniturePositionRequest(room, item)),
  });
  return normalizeLayoutResponse(response.data.data);
}

/**
 * Creates a Layout with no AgentContext, seeded from the room's existing
 * furniture — the starting point for placing catalog products directly,
 * without going through an AI recommendation first (backend:
 * `POST /api/layouts`, `LayoutService#createBlankLayout`).
 */
export async function createBlankLayout(roomId: number): Promise<LayoutResponse> {
  const response = await apiClient.post<ApiResponse<LayoutResponse>>("/api/layouts", { roomId });
  return normalizeLayoutResponse(response.data.data);
}

export interface AddFurnitureAtRequest {
  productId: string;
  position: { x: number; z: number };
  rotation: number;
}

/**
 * Adds a specific catalog product at the given position/rotation, exactly as
 * given — the server does not move or clamp it (backend:
 * `POST /api/layouts/{id}/furniture`, `LayoutService#addFurnitureDirect`).
 * Any resulting overlap/out-of-bounds issue is reported through
 * `validationResult.issues`, not rejected.
 */
export async function addFurnitureAt(
  layoutId: number,
  request: AddFurnitureAtRequest,
): Promise<LayoutResponse> {
  const response = await apiClient.post<ApiResponse<LayoutResponse>>(
    `/api/layouts/${layoutId}/furniture`,
    request,
  );
  return normalizeLayoutResponse(response.data.data);
}

export async function addFurnitureToDraft(
  layoutId: number,
  request: DraftFurnitureAdditionRequest,
): Promise<LayoutResponse> {
  try {
    const response = await apiClient.post<ApiResponse<LayoutResponse>>(
      `/api/layouts/${layoutId}/furniture-additions`,
      request,
    );
    return normalizeLayoutResponse(response.data.data);
  } catch (error) {
    if (isAxiosError<{ error?: { code?: string } }>(error)) {
      const status = error.response?.status;
      const code = error.response?.data.error?.code;
      if (status === 422 && code === "FURNITURE_ADDITION_FAILED") {
        throw new FurnitureAdditionRequestError("PLACEMENT_REJECTED", { cause: error });
      }
      if (!error.response) {
        throw new FurnitureAdditionRequestError("NETWORK", { cause: error });
      }
      if (status !== undefined && status >= 500) {
        throw new FurnitureAdditionRequestError("SERVER", { cause: error });
      }
    }
    throw error;
  }
}

export async function confirmLayout(layoutId: number): Promise<ConfirmResponse> {
  const response = await apiClient.post<ApiResponse<ConfirmResponse>>(`/api/layouts/${layoutId}/confirm`);
  return response.data.data;
}

export async function applyLayoutFeedback(
  layoutId: number,
  feedback: string,
  options: ApplyLayoutFeedbackOptions = {},
): Promise<FeedbackResponse> {
  const selectedFurnitureId = options.selectedFurnitureId?.trim();
  const response = await apiClient.post<ApiResponse<unknown>>("/api/layouts/feedback", {
    layoutId,
    feedback,
    ...(selectedFurnitureId ? { selectedFurnitureId } : {}),
  });

  return normalizeFeedbackResponse(response.data.data);
}

export function normalizeFeedbackResponse(value: unknown): FeedbackResponse {
  if (!isRecord(value)
    || !isPositiveInteger(value.roomId)
    || !Array.isArray(value.recommendedFurniture)) {
    throw new Error("Invalid layout feedback response");
  }

  const response = value as unknown as FeedbackResponse;
  const feedbackStatus = parseFeedbackStatus(value.feedbackStatus);
  const operationResults = parseOperationResults(value.operationResults);
  const clarification = parseClarification(value.clarification);
  const clarifications = parseClarifications(value.clarifications);
  const message = readOptionalString(value.message);
  const feedbackResult = parseFeedbackExecutionSummary(value.feedbackResult);
  const layoutId = isPositiveInteger(value.layoutId) ? value.layoutId : null;

  return {
    ...response,
    recommendedFurniture: normalizeBackendFurnitureApiItems(response.recommendedFurniture),
    layoutId,
    message,
    feedbackStatus,
    operationResults,
    clarification,
    clarifications,
    feedbackResult,
  };
}

export function toFurniturePositionRequest(room: RoomLayout, item: Furniture) {
  return {
    id: item.id,
    position: {
      x: item.position.x + room.width / 2,
      z: item.position.z + room.depth / 2,
    },
    rotation: normalizeDegrees((-item.rotationY * 180) / Math.PI),
    status: toFurnitureStatusApiValue(item.status),
  };
}

function toFurnitureStatusApiValue(status: Furniture["status"]): string {
  const values: Record<Furniture["status"], string> = {
    existing: "EXISTING",
    recommended: "RECOMMENDED",
    user_modified: "USER_MODIFIED",
    deleted: "DELETED",
  };
  return values[status];
}

function normalizeDegrees(value: number): number {
  return ((value % 360) + 360) % 360;
}

function parseFeedbackStatus(value: unknown): FeedbackStatus | undefined {
  return value === "SUCCESS"
    || value === "PARTIAL_SUCCESS"
    || value === "FAILED"
    || value === "NEEDS_CLARIFICATION"
    ? value
    : undefined;
}

function parseRecommendationStatus(value: unknown): RecommendationStatus | undefined {
  return value === "SUCCESS" || value === "PARTIAL_SUCCESS" || value === "FAILED"
    ? value
    : undefined;
}

function parseUnplacedFurniture(value: unknown): UnplacedFurniture[] | undefined {
  if (!Array.isArray(value)) return undefined;

  return value.flatMap((item) => {
    if (!isRecord(item)) return [];
    const requestIndex = readNonNegativeInteger(item.requestIndex);
    const rawFurnitureType = readRequiredString(item.furnitureType);
    const furnitureType = normalizeCanonicalFurnitureType(rawFurnitureType) ?? rawFurnitureType;
    const reasonCode = readRequiredString(item.reasonCode);
    const message = readOptionalString(item.message);
    if (requestIndex === undefined || !furnitureType || !reasonCode || message === undefined) return [];

    return [{
      requestIndex,
      furnitureType,
      reasonCode,
      message,
      ...readNullableStringProperty(item, "productId"),
      ...readNullableStringProperty(item, "variantId"),
    }];
  });
}

function parseFeedbackOperationStatus(value: unknown): FeedbackOperationStatus | undefined {
  return value === "APPLIED"
    || value === "FAILED"
    || value === "SKIPPED_DEPENDENCY"
    || value === "NEEDS_CLARIFICATION"
    ? value
    : undefined;
}

function parseOperationResults(value: unknown): FeedbackOperationResult[] | undefined {
  if (!Array.isArray(value)) return undefined;

  return value.flatMap((item) => {
    if (!isRecord(item)) return [];
    const operationId = readRequiredString(item.operationId);
    const operationType = readRequiredString(item.operationType);
    const status = parseFeedbackOperationStatus(item.status);
    const message = typeof item.message === "string" ? item.message : undefined;

    if (!operationId || !operationType || !status || message === undefined) return [];

    return [{
      operationId,
      operationType,
      status,
      message,
      ...readNullableStringProperty(item, "reasonCode"),
      ...readNullableStringProperty(item, "targetFurnitureId"),
      ...readNullableStringProperty(item, "resultFurnitureId"),
      ...readNullableStringProperty(item, "productId"),
      ...readNullableStringProperty(item, "variantId"),
    }];
  });
}

function parseClarification(value: unknown): FeedbackClarification | null | undefined {
  if (value === null) return null;
  if (!isRecord(value)) return undefined;

  const reasonCode = readRequiredString(value.reasonCode);
  const question = readRequiredString(value.question);
  if (!reasonCode || !question) return undefined;

  const candidates = Array.isArray(value.candidates)
    ? value.candidates.flatMap((candidate) => {
      if (!isRecord(candidate)) return [];
      const furnitureId = readRequiredString(candidate.furnitureId);
      if (!furnitureId) return [];
      const rawType = readOptionalNullableString(candidate.type);
      const type = typeof rawType === "string"
        ? normalizeCanonicalFurnitureType(rawType) ?? rawType
        : rawType;
      return [{
        furnitureId,
        ...(type !== undefined ? { type } : {}),
        ...readNullableStringProperty(candidate, "label"),
      }];
    })
    : undefined;

  return {
    reasonCode,
    question,
    ...readNullableStringProperty(value, "operationId"),
    ...readNullableStringProperty(value, "requiredField"),
    ...(candidates !== undefined ? { candidates } : {}),
  };
}

function normalizeLayoutResponse(response: LayoutResponse): LayoutResponse {
  return {
    ...response,
    recommendedFurniture: normalizeBackendFurnitureApiItems(response.recommendedFurniture),
  };
}

function parseClarifications(value: unknown): FeedbackClarification[] | undefined {
  if (!Array.isArray(value)) return undefined;
  return value.flatMap((item) => {
    const clarification = parseClarification(item);
    return clarification && clarification !== null ? [clarification] : [];
  });
}

function parseFeedbackExecutionSummary(value: unknown): FeedbackExecutionSummary | null | undefined {
  if (value === null) return null;
  if (!isRecord(value)) return undefined;

  const summary = readOptionalNullableString(value.summary);
  const noChangeReason = readOptionalNullableString(value.noChangeReason);
  return {
    ...(summary !== undefined ? { summary } : {}),
    ...(noChangeReason !== undefined ? { noChangeReason } : {}),
  };
}

function readNullableStringProperty<K extends string>(
  value: Record<string, unknown>,
  key: K,
): Partial<Record<K, string | null>> {
  const property = readOptionalNullableString(value[key]);
  return property === undefined ? {} : { [key]: property } as Record<K, string | null>;
}

function readRequiredString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value : undefined;
}

function readOptionalString(value: unknown): string | undefined {
  return typeof value === "string" ? value : undefined;
}

function readOptionalNullableString(value: unknown): string | null | undefined {
  return value === null || typeof value === "string" ? value : undefined;
}

function readNonNegativeInteger(value: unknown): number | undefined {
  return typeof value === "number" && Number.isInteger(value) && value >= 0 ? value : undefined;
}

function isPositiveInteger(value: unknown): value is number {
  return typeof value === "number" && Number.isInteger(value) && value > 0;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
