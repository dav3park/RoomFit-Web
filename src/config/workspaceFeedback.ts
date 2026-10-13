import type { Furniture, RoomLayout } from '../types';
import { applyBackendFurnitureToLayout, toRoomFurnitureReplaceRequest } from '../api/rooms';
import type { BackendFurnitureApiItem } from '../api/rooms';
import type { WorkspaceFeedbackRequest, WorkspaceFeedbackResponse, WorkspaceFeedbackOperation } from '../api/workspaceFeedback';
import { furnitureType, validateRecommendationLayout, type LayoutValidation } from '../recommendation/layoutValidation';
import { hasDeskLoftConflict } from './furnitureSelectionPolicy';
import catalog from '../data/furniture/catalog.json';
import { isCanonicalFurnitureType } from './canonicalFurnitureType';

const allFields = ['PRODUCT', 'DIMENSIONS', 'POSITION', 'ORIENTATION', 'APPEARANCE'] as const;
type Field = typeof allFields[number];
const allowedFields: Record<WorkspaceFeedbackOperation, readonly Field[]> = {
  MOVE: ['POSITION'], ROTATE: ['ORIENTATION'],
  REPLACE_PRODUCT: ['PRODUCT', 'DIMENSIONS', 'APPEARANCE'], SWAP_FURNITURE: ['PRODUCT', 'DIMENSIONS', 'APPEARANCE'],
  ADD_FURNITURE: [], REMOVE_FURNITURE: [],
};
export interface WorkspaceFeedbackPreview {
  room: RoomLayout;
  validation: LayoutValidation;
  changes: string[];
}

export function buildWorkspaceFeedbackRequest(room: RoomLayout, roomId: number, revision: string, feedback: string,
  preferences: WorkspaceFeedbackRequest['preferences'], selectedFurnitureId: string | null): WorkspaceFeedbackRequest {
  if (!Number.isInteger(roomId) || roomId <= 0) throw new Error('선택한 공간을 다시 불러온 뒤 요청해 주세요.');
  if (!feedback.trim() || feedback.length > 2000) throw new Error('변경 요청을 1~2000자로 입력해 주세요.');
  const active = room.furniture.filter(item => item.status !== 'deleted');
  if (active.length > 12) throw new Error('AI 피드백은 가구 12개 이하의 배치에서 사용할 수 있습니다.');
  const converted = toRoomFurnitureReplaceRequest({ ...room, furniture: active }).furniture;
  const furniture = converted.map((item, index) => {
    const original = active[index];
    const type = furnitureType(original);
    if (!isCanonicalFurnitureType(type)) throw new Error(`${original.name}: 가구 종류를 확인한 뒤 요청해 주세요.`);
    return { ...item, type, productId: original.productId ?? null, variantId: original.variantId ?? null, styleTags: [...original.styleTags ?? []] };
  });
  return {
    roomId, revision, feedback: feedback.trim(), preferences,
    roomDimensions: { width: room.width, depth: room.depth, height: room.height ?? 2.7 }, furniture,
    lockedFurnitureIds: active.filter(item => item.recommendationLocked).map(item => item.id),
    selectedFurnitureId: active.some(item => item.id === selectedFurnitureId) ? selectedFurnitureId : null,
  };
}

function near(a: number, b: number) { return Number.isFinite(a) && Number.isFinite(b) && Math.abs(a - b) < 1e-6; }
function changed(a: BackendFurnitureApiItem, b: BackendFurnitureApiItem, field: Field) {
  switch (field) {
    case 'POSITION': return !near(a.position.x, b.position.x) || !near(a.position.z, b.position.z);
    case 'ORIENTATION': return !near(((a.rotation % 360) + 360) % 360, ((b.rotation % 360) + 360) % 360);
    case 'DIMENSIONS': return !near(a.width, b.width) || !near(a.depth, b.depth) || !near(a.height, b.height);
    case 'PRODUCT': return a.productId !== b.productId || a.variantId !== b.variantId || a.label !== b.label;
    case 'APPEARANCE': return JSON.stringify(a.styleTags) !== JSON.stringify(b.styleTags);
  }
}
function assertFurniture(item: BackendFurnitureApiItem) {
  if (!item || typeof item.id !== 'string' || !item.id || typeof item.label !== 'string'
      || !isCanonicalFurnitureType(item.type) || !item.position
      || ![item.width, item.depth, item.height].every(value => Number.isFinite(value) && value > 0 && value <= 50)
      || ![item.position.x, item.position.z, item.rotation].every(Number.isFinite)
      || Math.abs(item.position.x) > 100 || Math.abs(item.position.z) > 100
      || !['EXISTING', 'RECOMMENDED', 'USER_MODIFIED'].includes(item.status)
      || !Array.isArray(item.styleTags) || !item.styleTags.every(tag => typeof tag === 'string')) {
    throw new Error('피드백 후보의 가구 정보를 확인하지 못했습니다. 현재 배치는 유지됩니다.');
  }
}

export function prepareWorkspaceFeedbackPreview(original: RoomLayout, request: WorkspaceFeedbackRequest,
  response: WorkspaceFeedbackResponse): WorkspaceFeedbackPreview {
  if (response.status !== 'SUCCESS' || response.revision !== request.revision || response.source !== 'LLM') {
    throw new Error('현재 요청에 맞는 미리보기가 아닙니다. 다시 요청해 주세요.');
  }
  const server = response.validationResult;
  if (!server || ![server.collisionFree, server.boundaryValid, server.doorClearance, server.windowClearance, server.pathSecured].every(value => value === true)) {
    throw new Error('서버 공간 검증을 통과하지 못했습니다. 현재 배치는 유지됩니다.');
  }
  if (response.operationResults.length < 1 || response.operationResults.length > 4) {
    throw new Error('한 번에 적용할 수 있는 작업은 1~4개입니다. 현재 배치는 유지됩니다.');
  }
  const operations = new Map<string, Set<Field>>();
  const added = new Set<string>(), removed = new Set<string>();
  for (const operation of response.operationResults) {
    if (operation.status !== 'APPLIED' || !operation.affectedFurnitureId || !Object.hasOwn(allowedFields, operation.type)) {
      throw new Error('모든 작업이 완료된 후보가 아닙니다. 현재 배치는 유지됩니다.');
    }
    const id = operation.affectedFurnitureId;
    if (operation.type === 'ADD_FURNITURE') added.add(id);
    if (operation.type === 'REMOVE_FURNITURE') removed.add(id);
    const fields = operations.get(id) ?? new Set<Field>();
    allowedFields[operation.type].forEach(field => fields.add(field)); operations.set(id, fields);
  }
  if (!operations.size || response.furniture.length > 12) throw new Error('적용 가능한 변경을 확인하지 못했습니다. 현재 배치는 유지됩니다.');
  const returned = new Map<string, BackendFurnitureApiItem>();
  response.furniture.forEach(item => {
    assertFurniture(item);
    if (returned.has(item.id)) throw new Error('가구 식별자가 중복된 후보입니다. 현재 배치는 유지됩니다.');
    returned.set(item.id, item);
  });
  const requestedIds = new Set(request.furniture.map(item => item.id));
  for (const operation of response.operationResults) {
    const id = operation.affectedFurnitureId!;
    if (operation.type === 'ADD_FURNITURE' ? requestedIds.has(id) || !returned.has(id)
        : operation.type === 'REMOVE_FURNITURE' ? !requestedIds.has(id) || returned.has(id)
        : !requestedIds.has(id) || !returned.has(id)) {
      throw new Error('작업 결과와 후보 가구가 일치하지 않습니다. 현재 배치는 유지됩니다.');
    }
  }
  const changes: string[] = [];
  for (const before of request.furniture) {
    const after = returned.get(before.id);
    if (!after) {
      if (!removed.has(before.id) || request.lockedFurnitureIds.includes(before.id)) throw new Error('유지해야 할 가구가 삭제된 후보입니다. 현재 배치는 유지됩니다.');
      changes.push(`${before.label}: 삭제`); continue;
    }
    if (before.type !== after.type || before.status !== after.status) throw new Error('가구 종류 또는 상태가 바뀐 후보입니다. 현재 배치는 유지됩니다.');
    for (const field of allFields) {
      if (changed(before, after, field) && (request.lockedFurnitureIds.includes(before.id) || !operations.get(before.id)?.has(field))) {
        throw new Error(`${before.label}: 고정 조건 또는 요청한 변경 범위를 벗어났습니다. 현재 배치는 유지됩니다.`);
      }
    }
    const parts = [changed(before, after, 'POSITION') ? '위치 이동' : '', changed(before, after, 'ORIENTATION') ? '회전' : '',
      changed(before, after, 'PRODUCT') ? `${after.label}로 교체` : ''].filter(Boolean);
    if (parts.length) changes.push(`${before.label}: ${parts.join(' · ')}`);
  }
  const originals = new Map(original.furniture.map(item => [item.id, item]));
  const converted = applyBackendFurnitureToLayout(original, response.furniture).furniture;
  const furniture = response.furniture.map((item, index): Furniture => {
    const before = originals.get(item.id);
    if (!before && !added.has(item.id)) throw new Error('요청하지 않은 가구가 추가된 후보입니다. 현재 배치는 유지됩니다.');
    const sameProduct = before && before.productId == item.productId && before.variantId == item.variantId;
    if (!sameProduct && !catalog.products.some(product => product.productId === item.productId && product.variantId === item.variantId && product.furnitureType === item.type)) {
      throw new Error(`${item.label}: 화면에 표시할 수 있는 상품을 확인하지 못했습니다. 현재 배치는 유지됩니다.`);
    }
    if (!before) changes.push(`${item.label}: 추가`);
    const appearance = sameProduct ? before : {
      ...converted[index], color: before?.color ?? converted[index].color, material: before?.material ?? converted[index].material,
      theme: before?.theme, mountHeight: before?.mountHeight, recommendationLocked: before?.recommendationLocked,
    };
    return {
      ...appearance, dimensions: { width: item.width, depth: item.depth, height: item.height },
      // The legacy mapper may clamp or treat small degrees as radians; preview must use the exact returned pose.
      position: { x: item.position.x - original.width / 2, z: item.position.z - original.depth / 2 },
      rotationY: -item.rotation * Math.PI / 180,
    };
  });
  const room = { ...original, furniture: [...furniture, ...original.furniture.filter(item => item.status === 'deleted')] };
  if (!changes.length) throw new Error('현재 배치와 다른 후보를 찾지 못했습니다.');
  const validation = validateRecommendationLayout(room);
  if (hasDeskLoftConflict([], room.furniture)) { validation.valid = false; validation.reasons.push('로프트 침대와 별도 책상은 함께 배치할 수 없습니다.'); }
  return { room, validation, changes };
}
