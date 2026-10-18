import { useEffect, useId, useRef } from 'react';
import { FiImage, FiX } from 'react-icons/fi';
import Button from '../ui/Button';
import { DESIGN_DESCRIPTION_LIMIT, DESIGN_IMAGE_ACCEPT } from '../../config/designConsultationImages';
import type { useDesignConsultationDraft } from './useDesignConsultationDraft';

export default function DesignConsultationPanel({ draft }: { draft: ReturnType<typeof useDesignConsultationDraft> }) {
  const inputId = useId();
  const fileInput = useRef<HTMLInputElement>(null);
  const attachButton = useRef<HTMLButtonElement>(null);
  const descriptionInput = useRef<HTMLTextAreaElement>(null);
  const reviewHeading = useRef<HTMLHeadingElement>(null);
  useEffect(() => { if (draft.analysis) reviewHeading.current?.focus(); }, [draft.analysis]);

  const supportLabels = { SUPPORTED: '추천 조건 연결 가능', NEEDS_ENGINE_SUPPORT: '추가 연결 필요', NEEDS_CLARIFICATION: '추가 확인 필요', NEEDS_REVIEW: '수정 내용 재검토 필요' };
  const sourceLabels = { USER_TEXT: '직접 말씀한 조건', REFERENCE_IMAGE: '사진에서 읽은 취향', INFERENCE: 'AI의 추정', USER_EDIT: '직접 수정' };
  const canConfirm = draft.selections.some(item => item.included) && draft.selections.filter(item => item.included).every(item => item.description.trim());
  return <section className="design-consultation" aria-label="취향 전달" aria-busy={draft.pending} tabIndex={0} onPaste={event => {
    const files = Array.from(event.clipboardData.items).filter(item => item.kind === 'file').flatMap(item => {
      const file = item.getAsFile(); return file ? [file] : [];
    });
    if (files.length && !draft.analysis) { event.preventDefault(); void draft.addImages(files); }
  }}>
    <ol className="design-consultation-steps" aria-label="디자인 상담 진행 순서">
      <li aria-current={!draft.analysis ? 'step' : undefined}>취향 전달</li><li aria-current={draft.analysis ? 'step' : undefined}>조건 확인</li><li>추천·비교</li>
    </ol>
    <p className="demo-help">마음에 드는 사진이나 생활 이야기를 들려주세요. 사진과 설명 중 하나만 입력해도 괜찮아요.</p>
    {!draft.analysis && <>
      <label className="demo-field" htmlFor={`${inputId}-description`}>어떤 방에서 지내고 싶으세요?
        <textarea id={`${inputId}-description`} ref={descriptionInput} disabled={draft.pending} value={draft.description} maxLength={DESIGN_DESCRIPTION_LIMIT}
          aria-describedby={`${inputId}-description-help`} onChange={event => draft.setDescription(event.target.value)}
          placeholder="예: 재택근무를 하고 옷이 많아요. 따뜻한 나무 느낌이 좋고, 지금 침대는 유지하고 싶어요." />
      </label>
      <p id={`${inputId}-description-help`} className="demo-help design-consultation-count">생활 방식, 좋아하는 분위기, 유지할 가구를 자유롭게 적어주세요. {draft.description.length.toLocaleString()} / 2,000</p>
      <h3 id={`${inputId}-photos`}>참고 사진 <span className="demo-badge">선택</span></h3>
      <input ref={fileInput} type="file" accept={DESIGN_IMAGE_ACCEPT} multiple hidden aria-label="참고 사진 파일 선택"
        onChange={event => { void draft.addImages(Array.from(event.target.files ?? [])); event.target.value = ''; }} />
      <button ref={attachButton} type="button" className="design-consultation-upload" aria-label={draft.processing ? '사진 읽는 중' : '사진 파일 첨부'} aria-describedby={`${inputId}-image-help`}
        disabled={draft.processing || draft.pending} onClick={() => fileInput.current?.click()}>
        <FiImage aria-hidden="true" /><strong>{draft.processing ? '사진 읽는 중…' : '사진 파일 첨부'}</strong>
        <span>또는 이 창에서 사진을 붙여넣으세요</span>
      </button>
      <p id={`${inputId}-image-help`} className="demo-help">JPG·PNG·WebP · 최대 3장 · 장당 5 MB<br />복사한 사진은 이 창을 클릭하고 Ctrl+V 또는 ⌘V로 붙여넣을 수 있어요.</p>
    </>}
    {draft.analysis && <>
      <h3 ref={reviewHeading} tabIndex={-1}>AI가 이해한 조건</h3>
      <p className="demo-help">{draft.analysis.summary}</p>
      <p className="demo-help">잘못 이해한 내용은 수정하거나 선택을 해제해 주세요. 사진에서 읽은 취향과 AI의 추정도 직접 확인해 주세요.</p>
      <ul className="design-consultation-conditions" aria-label="해석된 조건">
        {draft.selections.map((item, index) => <li key={index}>
          <div className="design-consultation-condition-options">
            <label className="design-consultation-include"><input type="checkbox" checked={item.included} disabled={draft.confirmed}
              onChange={event => draft.includeCondition(index, event.target.checked)} />조건 {index + 1} 포함</label>
            <label className="design-consultation-include"><input type="checkbox" checked={item.priority === 'REQUIRED'} disabled={draft.confirmed}
              aria-label={`조건 ${index + 1}은 꼭 지키기`} onChange={event => draft.changePriority(index, event.target.checked ? 'REQUIRED' : 'PREFERRED')} />꼭 지키기</label>
          </div>
          <p className="demo-help">{sourceLabels[item.source]}{item.imageIndex ? ` · 사진 ${item.imageIndex}` : ''}</p>
          <label className="demo-field">조건 {index + 1} 내용<textarea value={item.description} maxLength={300} disabled={draft.confirmed}
            aria-invalid={item.included && !item.description.trim()} onChange={event => draft.changeCondition(index, event.target.value)} /></label>
          {item.evidence && <p className="demo-help">근거: {item.evidence}</p>}
          <span className="demo-badge">{supportLabels[item.support]}</span>
        </li>)}
      </ul>
      {!!draft.analysis.questions.length && <div className="demo-section"><h3>더 확인하고 싶은 점</h3>
        <ul className="demo-issues">{draft.analysis.questions.map((question, index) => <li key={index}>{question}</li>)}</ul>
        <p className="demo-help">답변은 ‘사진·설명 수정’에서 원래 설명에 추가한 뒤 다시 분석할 수 있어요.</p>
      </div>}
      <p className="demo-help">‘연결 가능’은 기존 엔진에 대응하는 항목이 있다는 뜻이에요. 추가 연결·확인이 필요한 조건까지 반영한 추천은 아직 생성하지 않습니다.</p>
    </>}
    {!!draft.images.length && <ul className="design-consultation-images" aria-label="첨부한 참고 사진">
      {draft.images.map((image, index) => <li key={image.id}>
        <img src={image.url} alt={`참고 사진 ${index + 1}: ${image.file.name}`} />
        <div><strong>{image.file.name}</strong><span>{(image.file.size / 1024 / 1024).toFixed(1)} MB</span></div>
        {!draft.analysis && <button type="button" className="demo-icon-button" disabled={draft.processing || draft.pending}
          aria-label={`참고 사진 ${index + 1} 삭제`} onClick={() => { draft.removeImage(image.id); attachButton.current?.focus(); }}><FiX aria-hidden="true" /></button>}
      </li>)}
    </ul>}
    <div role="status" aria-live="polite" aria-atomic="true">
      {draft.processing && <p className="demo-help">첨부한 사진을 확인하고 있어요.</p>}
      {draft.pending && <p className="demo-help">사진과 설명에서 취향·필수 조건을 분석하고 있어요. 현재 배치는 바뀌지 않습니다.</p>}
      {draft.confirmed && <p className="demo-help">조건 확인을 완료했습니다. 확인한 내용은 작업실에 유지되며, 추천 생성 연결은 다음 단계입니다.</p>}
    </div>
    {draft.error && <p className="demo-save-error" role="alert">{draft.error}</p>}
    <div className="design-consultation-actions">
      {draft.analysis ? <>
        <Button className="w-full" disabled={!canConfirm || draft.confirmed} onClick={draft.confirm}>조건 확인 완료</Button>
        {draft.confirmed && <button type="button" className="demo-outline" onClick={draft.resumeReview}>조건 다시 수정</button>}
        <button type="button" className="demo-outline" onClick={() => { draft.edit(); requestAnimationFrame(() => descriptionInput.current?.focus()); }}>사진·설명 수정</button>
      </> : <>
        <Button className="w-full" disabled={draft.processing || draft.pending || (!draft.description.trim() && !draft.images.length)} onClick={() => void draft.analyze()}>
          {draft.pending ? '취향 분석 중…' : draft.error ? '취향 다시 분석' : '취향 분석하기'}
        </Button>
        {draft.pending && <button type="button" className="demo-outline" onClick={draft.cancel}>분석 취소</button>}
      </>}
    </div>
    <p className="demo-help design-consultation-note">분석할 때 설명·현재 가구 목록과 축소한 참고 사진을 OpenAI에 전달합니다. RoomFit에 별도 저장하지 않으며, 새로고침하거나 작업실을 나가면 입력과 확인한 조건이 사라져요. 현재 배치는 바뀌지 않습니다.</p>
  </section>;
}
