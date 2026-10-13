import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import WorkspaceFeedbackPanel from '../WorkspaceFeedbackPanel';
import type { WorkspaceFeedbackState } from '../useWorkspaceFeedback';
import type { WorkspaceFeedbackResponse } from '../../../api/workspaceFeedback';
import type { RoomLayout } from '../../../types';

const room: RoomLayout = { id: 'room', name: '방', width: 6, depth: 6, height: 2.7, walls: [], doors: [], windows: [],
  furniture: [{ id: 'private-desk-id', name: '작업용 책상', category: 'desk', sourceType: 'desk',
    dimensions: { width: 1.2, depth: .6, height: .72 }, position: { x: 0, z: 0 }, rotationY: 0, status: 'existing',
    color: '#849a82', material: { type: 'wood', color: '#849a82' }, removable: true }] };
const idle: WorkspaceFeedbackState = { phase: 'idle', message: '', result: null, preview: null };
function render(state: WorkspaceFeedbackState, blocked = false) {
  return renderToStaticMarkup(<WorkspaceFeedbackPanel flow={{ state, request: vi.fn(), select: vi.fn(), apply: vi.fn(), invalidate: vi.fn() }}
    feedback="책상을 옮겨줘" onChange={vi.fn()} room={room} selectedId={null} enabled blocked={blocked} />);
}
const question = (requiredField: string, candidates = [{ furnitureId: 'private-desk-id' }]): WorkspaceFeedbackState => ({
  ...idle, phase: 'question', message: '어떤 책상인가요?', result: { clarification: { reasonCode: 'AMBIGUOUS_TARGET', question: '어떤 책상인가요?', requiredField, candidates } } as WorkspaceFeedbackResponse,
});

describe('workspace feedback controls', () => {
  it('allows cancellation while pending and reports progress through one live region', () => {
    const html = render({ ...idle, phase: 'pending', message: '확인 중입니다.' });
    expect(html).toContain('요청 취소'); expect(html).toContain('aria-busy="true"');
    expect(html.match(/aria-live="polite"/g)).toHaveLength(1);
    expect(html).not.toContain('이 피드백 적용');
  });
  it('shows target and reference options by name and dimensions without exposing IDs', () => {
    for (const field of ['targetFurnitureId', 'referenceFurnitureId']) {
      const html = render(question(field));
      expect(html).toContain('작업용 책상'); expect(html).toContain('1200 × 600 mm');
      expect(html).not.toContain('private-desk-id'); expect(html).not.toContain('AMBIGUOUS_TARGET');
    }
  });
  it('offers request editing for other clarification fields and empty candidate lists', () => {
    expect(render(question('directionFrame'))).toContain('요청 내용을 수정');
    expect(render(question('targetFurnitureId', []))).toContain('요청 내용을 수정');
  });
  it('prevents applying spatially invalid previews while displaying the reason', () => {
    const html = render({ ...idle, phase: 'ready', preview: { room, changes: ['책상: 위치 이동'],
      validation: { valid: false, reasons: ['창문 채광 공간 침범'], warnings: [], freeArea: 10, reachableCount: 1 } } });
    expect(html).toContain('창문 채광 공간 침범'); expect(html).toMatch(/disabled=""[^>]*>이 피드백 적용/);
    expect(html).toContain('현재 배치로 돌아가기');
  });
  it('keeps errors in the panel and explains recommendation-preview blocking', () => {
    expect(render({ ...idle, phase: 'failed', message: '잠시 후 다시 요청해 주세요.' })).toContain('role="alert"');
    const html = render(idle, true);
    expect(html).toContain('추천 미리보기를 적용하거나'); expect(html).not.toContain('이 피드백 적용');
  });
});
