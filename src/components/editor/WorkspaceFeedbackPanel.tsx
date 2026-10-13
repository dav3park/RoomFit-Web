import Button from '../ui/Button';
import type { useWorkspaceFeedback } from './useWorkspaceFeedback';
import type { RoomLayout } from '../../types';

export default function WorkspaceFeedbackPanel({ flow, feedback, onChange, room, selectedId, enabled, blocked }: {
  flow: ReturnType<typeof useWorkspaceFeedback>;
  feedback: string;
  onChange: (value: string) => void;
  room: RoomLayout;
  selectedId: string | null;
  enabled: boolean;
  blocked: boolean;
}) {
  const state = flow.state;
  const pending = state.phase === 'pending';
  const question = state.result?.clarification;
  const canSelect = question?.requiredField === 'targetFurnitureId' || question?.requiredField === 'referenceFurnitureId';
  const selected = room.furniture.find(item => item.id === selectedId);
  return <section className="demo-inspector-section workspace-feedback" aria-label="AI 피드백" aria-busy={pending}>
    <h2>AI 피드백</h2>
    <p className="demo-help">원하는 변경을 적고 결과를 미리 확인하세요. 적용할 때만 현재 배치가 바뀝니다.</p>
    {selected && <p className="demo-help">선택한 가구: <strong>{selected.name}</strong></p>}
    <label className="demo-field">자연어 요청<textarea value={feedback} maxLength={2000}
      onChange={event => onChange(event.target.value)} placeholder="예: 책상을 방 기준 오른쪽으로 조금 옮겨줘" /></label>
    <div className="demo-edit-actions">
      <Button disabled={!enabled || blocked || pending || !feedback.trim()} onClick={() => flow.request(feedback)}>
        {pending ? '피드백 확인 중…' : state.phase === 'failed' ? '피드백 다시 요청' : '피드백 결과 미리보기'}
      </Button>
      {(pending || state.preview || state.phase === 'question') && <button className="demo-outline" onClick={flow.invalidate}>
        {pending ? '요청 취소' : '현재 배치로 돌아가기'}
      </button>}
    </div>
    {!enabled && <p className="demo-help">선택한 방의 배치 작업실에서 AI 피드백을 사용할 수 있습니다.</p>}
    {blocked && <p className="demo-help">추천 미리보기를 적용하거나 현재 배치로 돌아온 뒤 요청해 주세요.</p>}
    <details><summary>지원하는 요청</summary><p className="demo-help">가구 이동·90° 회전·같은 종류의 상품 교체·추가·삭제를 요청할 수 있습니다. 크기 직접 보정, 색상만 변경, 방 전체 재설계는 아직 지원하지 않습니다.</p></details>
    <div aria-live="polite" aria-atomic="true" className="workspace-feedback-result">
      {state.message && <p className="demo-help" role={state.phase === 'failed' ? 'alert' : 'status'}>{state.message}</p>}
      {state.phase === 'question' && <>
        {canSelect && <div className="workspace-feedback-targets">{question?.candidates?.map(candidate => {
          const item = room.furniture.find(item => item.id === candidate.furnitureId);
          return item && <button className="demo-outline" key={item.id} onClick={() => flow.select(item.id)}>
            <strong>{item.name}</strong><span>{Math.round(item.dimensions.width * 1000)} × {Math.round(item.dimensions.depth * 1000)} mm · {room.furniture.indexOf(item) + 1}번째 가구</span>
          </button>;
        })}</div>}
        {(!canSelect || !question?.candidates?.length) && <p className="demo-help">위 질문에 맞게 요청 내용을 수정한 뒤 다시 미리보기를 눌러 주세요.</p>}
      </>}
      {state.preview && <>
        <h3>변경 내용</h3><ul className="demo-issues">{state.preview.changes.map(change => <li key={change}>{change}</li>)}</ul>
        {!state.preview.validation.valid && <><h3>적용할 수 없는 이유</h3><ul className="demo-issues">{[...new Set(state.preview.validation.reasons)].map(reason => <li key={reason}>{reason}</li>)}</ul></>}
        {!!state.preview.validation.warnings.length && <details><summary>공간 검증 주의사항</summary><ul className="demo-issues">{[...new Set(state.preview.validation.warnings)].map(warning => <li key={warning}>{warning}</li>)}</ul></details>}
        <Button disabled={!state.preview.validation.valid} className="w-full" onClick={flow.apply}>이 피드백 적용</Button>
      </>}
    </div>
  </section>;
}
