import { apiClient } from './client';
import { isAxiosError } from 'axios';
import type { DesignReferenceImage } from '../config/designConsultationImages';
import type { RoomLayout } from '../types';

export type ConsultationKind = 'PURPOSE' | 'STYLE' | 'PALETTE' | 'KEEP_FURNITURE' | 'OTHER';
export type ConsultationSupport = 'SUPPORTED' | 'NEEDS_ENGINE_SUPPORT' | 'NEEDS_CLARIFICATION' | 'NEEDS_REVIEW';
export interface ConsultationRequirement {
  kind: ConsultationKind;
  value: string;
  description: string;
  source: 'USER_TEXT' | 'REFERENCE_IMAGE' | 'INFERENCE' | 'USER_EDIT';
  evidence: string;
  imageIndex: number | null;
  priority: 'REQUIRED' | 'PREFERRED';
  support: ConsultationSupport;
}
export interface ConsultationAnalysis {
  revision: string;
  source: 'LLM';
  summary: string;
  requirements: ConsultationRequirement[];
  questions: string[];
}
export interface ConsultationSelection extends ConsultationRequirement { included: boolean }

export function consultationFurniture(room: RoomLayout) {
  return room.furniture.filter(item => item.status !== 'deleted').map(item => ({ id: item.id, name: item.name, type: item.sourceType ?? item.category }));
}

// Send a bounded image without EXIF; keep the original attachment for preview and retries.
export async function consultationPhoto(image: DesignReferenceImage, signal: AbortSignal): Promise<Blob> {
  const photo = new Image(); photo.src = image.url; await photo.decode();
  signal.throwIfAborted();
  const canvas = document.createElement('canvas');
  const scale = Math.min(1, 1024 / Math.max(photo.naturalWidth, photo.naturalHeight));
  canvas.width = Math.max(1, Math.round(photo.naturalWidth * scale));
  canvas.height = Math.max(1, Math.round(photo.naturalHeight * scale));
  for (let attempt = 0; attempt < 4; attempt++) {
    const context = canvas.getContext('2d');
    if (!context) throw new Error('사진을 준비하지 못했습니다. 다른 브라우저에서 다시 시도해 주세요.');
    context.fillStyle = '#ffffff'; context.fillRect(0, 0, canvas.width, canvas.height);
    context.drawImage(photo, 0, 0, canvas.width, canvas.height);
    const blob = await new Promise<Blob | null>(resolve => canvas.toBlob(resolve, 'image/jpeg', .8));
    signal.throwIfAborted();
    if (blob && blob.size <= 256 * 1024) return blob;
    canvas.width = Math.max(1, Math.round(canvas.width * .75)); canvas.height = Math.max(1, Math.round(canvas.height * .75));
  }
  throw new Error('사진 용량을 줄이지 못했습니다. 더 작은 사진으로 다시 시도해 주세요.');
}

const consultationValues: Record<string, readonly string[]> = {
  PURPOSE: ['휴식', '업무 / 공부', '취미 / 여가', '수납'], STYLE: ['minimal', 'natural', 'modern', 'classic', 'midcentury'],
  PALETTE: ['auto', 'ivory', 'beige', 'gray', 'brown', 'green', 'blue', 'pink', 'black'],
};

export function validateConsultationAnalysis(value: unknown, revision: string, description: string,
  images: readonly DesignReferenceImage[], furniture: ReturnType<typeof consultationFurniture>): ConsultationAnalysis {
  const fail = () => { throw new Error('분석 결과를 확인하지 못했습니다. 입력을 유지했으니 다시 시도해 주세요.'); };
  if (!value || typeof value !== 'object') return fail();
  const data = value as ConsultationAnalysis;
  if (data.source !== 'LLM' || data.revision !== revision || typeof data.summary !== 'string' || !data.summary.trim() || data.summary.length > 800
      || !Array.isArray(data.requirements) || data.requirements.length > 12 || !Array.isArray(data.questions) || data.questions.length > 4
      || (!data.requirements.length && !data.questions.length)) return fail();
  for (const item of data.requirements) {
    if (!item || !['PURPOSE', 'STYLE', 'PALETTE', 'KEEP_FURNITURE', 'OTHER'].includes(item.kind)
      || !['USER_TEXT', 'REFERENCE_IMAGE', 'INFERENCE'].includes(item.source)
      || !['REQUIRED', 'PREFERRED'].includes(item.priority) || (item.source !== 'USER_TEXT' && item.priority !== 'PREFERRED')
      || !['SUPPORTED', 'NEEDS_ENGINE_SUPPORT', 'NEEDS_CLARIFICATION'].includes(item.support)
      || typeof item.value !== 'string' || item.value.length > 128 || typeof item.description !== 'string'
      || !item.description.trim() || item.description.length > 300 || typeof item.evidence !== 'string' || !item.evidence.trim() || item.evidence.length > 300
      || (item.source === 'USER_TEXT' && !description.includes(item.evidence))
      || (item.source === 'REFERENCE_IMAGE' ? !Number.isInteger(item.imageIndex) || item.imageIndex! < 1 || item.imageIndex! > images.length : item.imageIndex !== null)
      || (consultationValues[item.kind] && !consultationValues[item.kind].includes(item.value))
      || (item.kind === 'OTHER' && (item.value !== '' || item.support !== 'NEEDS_ENGINE_SUPPORT'))
      || (item.kind === 'KEEP_FURNITURE' && (item.source !== 'USER_TEXT' || (item.value && !furniture.some(original => original.id === item.value))))) return fail();
  }
  if (data.questions.some(question => typeof question !== 'string' || !question.trim() || question.length > 300)) return fail();
  return data;
}

export async function analyzeDesignConsultation(description: string, images: readonly DesignReferenceImage[],
  furniture: ReturnType<typeof consultationFurniture>, signal: AbortSignal): Promise<ConsultationAnalysis> {
  const revision = crypto.randomUUID();
  const form = new FormData();
  form.append('brief', new Blob([JSON.stringify({ revision, description, furniture })], { type: 'application/json' }));
  for (const [index, image] of images.entries()) form.append('images', await consultationPhoto(image, signal), `reference-${index + 1}.jpg`);
  signal.throwIfAborted();
  const response = await apiClient.post<{ success: boolean; data: unknown }>('/api/design-consultation/analyze', form, { signal, timeout: 70_000 });
  if (!response.data.success) throw new Error('취향 분석을 완료하지 못했습니다. 잠시 후 다시 시도해 주세요.');
  return validateConsultationAnalysis(response.data.data, revision, description, images, furniture);
}

export function consultationErrorMessage(error: unknown): string {
  if (isAxiosError(error)) {
    const code = error.response?.data?.error?.code;
    const messages: Record<string, string> = {
      CONSULTATION_NOT_CONFIGURED: 'AI 디자인 상담 서버 연결이 아직 설정되지 않았습니다. 입력은 유지됩니다.',
      CONSULTATION_RATE_LIMITED: '분석 요청이 많습니다. 잠시 후 다시 시도해 주세요.',
      CONSULTATION_UPLOAD_TOO_LARGE: '첨부 용량이 너무 큽니다. 사진을 줄인 뒤 다시 시도해 주세요.',
      INVALID_CONSULTATION_IMAGE: '첨부 사진을 읽지 못했습니다. 다른 사진으로 다시 시도해 주세요.',
    };
    const requestId = error.response?.data?.error?.requestId;
    const suffix = typeof requestId === 'string' && /^[A-Za-z0-9_-]{1,128}$/.test(requestId) ? ` (요청 ID: ${requestId})` : '';
    return (messages[code] ?? '취향 분석을 완료하지 못했습니다. 입력은 유지됩니다. 서버 연결을 확인하거나 잠시 후 다시 시도해 주세요.') + suffix;
  }
  return error instanceof Error ? error.message : '취향 분석을 완료하지 못했습니다. 다시 시도해 주세요.';
}
