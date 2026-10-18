import { useEffect, useRef, useState } from 'react';
import { DESIGN_DESCRIPTION_LIMIT, designImageBatchError, prepareDesignImages, releaseDesignImages, type DesignReferenceImage } from '../../config/designConsultationImages';
import { analyzeDesignConsultation, consultationErrorMessage, consultationFurniture, type ConsultationAnalysis, type ConsultationSelection } from '../../api/designConsultation';
import { getActiveRequestClientId } from '../../config/clientScope';
import type { PreparedConsultation } from '../../recommendation/consultation';
import type { RoomLayout } from '../../types';

// Attachments and confirmed conditions belong to this workspace, never room autosave.
export function useDesignConsultationDraft(getRoom: () => RoomLayout, onConditionsChange: () => void) {
  const [description, setDescription] = useState('');
  const [images, setImages] = useState<DesignReferenceImage[]>([]);
  const [processing, setProcessing] = useState(false);
  const [pending, setPending] = useState(false);
  const [analysis, setAnalysis] = useState<ConsultationAnalysis | null>(null);
  const [selections, setSelections] = useState<ConsultationSelection[]>([]);
  const [preparation, setPreparation] = useState<PreparedConsultation | null>(null);
  const [confirmed, setConfirmed] = useState(false);
  const [error, setError] = useState('');
  const attachments = useRef<DesignReferenceImage[]>([]);
  const sequence = useRef(0);
  const reading = useRef(false);
  const analysisSequence = useRef(0);
  const controller = useRef<AbortController | null>(null);
  useEffect(() => () => {
    sequence.current++; analysisSequence.current++;
    controller.current?.abort(); releaseDesignImages(attachments.current);
  }, []);

  function invalidateAnalysis() {
    onConditionsChange();
    analysisSequence.current++; controller.current?.abort(); controller.current = null;
    setPending(false); setPreparation(null); setAnalysis(null); setSelections([]); setConfirmed(false);
  }

  async function addImages(files: File[]) {
    if (!files.length) return;
    if (reading.current) { setError('사진을 읽고 있습니다. 완료된 뒤 다시 붙여넣어 주세요.'); return; }
    const message = designImageBatchError(files, attachments.current.length);
    if (message) { setError(message); return; }
    invalidateAnalysis();
    const request = ++sequence.current;
    reading.current = true; setProcessing(true); setError('');
    try {
      const next = await prepareDesignImages(files);
      if (request !== sequence.current) { releaseDesignImages(next); return; }
      attachments.current = [...attachments.current, ...next]; setImages(attachments.current);
    } catch (cause) {
      if (request === sequence.current) setError(cause instanceof Error ? cause.message : '사진을 읽지 못했습니다. 다시 추가해 주세요.');
    } finally {
      if (request === sequence.current) { reading.current = false; setProcessing(false); }
    }
  }

  async function analyze() {
    if (reading.current || controller.current || (!description.trim() && !attachments.current.length)) return;
    const base = getRoom(), clientId = getActiveRequestClientId();
    const abort = new AbortController(), request = ++analysisSequence.current;
    controller.current = abort; setPending(true); setError(''); setConfirmed(false);
    const current = () => request === analysisSequence.current && !abort.signal.aborted
      && getRoom() === base && getActiveRequestClientId() === clientId;
    try {
      const result = await analyzeDesignConsultation(description.trim(), attachments.current, consultationFurniture(base), abort.signal);
      if (!current()) return;
      setAnalysis(result); setPreparation(result.preparation ?? null);
      setSelections(result.requirements.map(item => ({ ...item, included: true, preparedDescription: result.preparation ? item.description : undefined })));
    } catch (cause) {
      if (current()) setError(consultationErrorMessage(cause));
    } finally {
      if (controller.current === abort) controller.current = null;
      if (request === analysisSequence.current) setPending(false);
    }
  }

  function reset() {
    sequence.current++; reading.current = false; invalidateAnalysis();
    releaseDesignImages(attachments.current); attachments.current = [];
    setDescription(''); setImages([]); setProcessing(false); setError('');
  }

  return {
    description, images, processing, pending, error, analysis, selections, confirmed, preparation,
    rememberPreparation(plan: PreparedConsultation) {
      setPreparation(previous => ({...plan, conditions: [...(previous?.conditions.filter(old => !plan.conditions.some(item => item.id === old.id)) ?? []), ...plan.conditions]}));
      setSelections(items => items.map((item,index) => plan.conditions.some(condition => condition.id === String(index)) ? { ...item, preparedDescription: item.description } : item));
    }, addImages, reset, analyze, invalidateAnalysis,
    setDescription(value: string) { invalidateAnalysis(); setDescription(value.slice(0, DESIGN_DESCRIPTION_LIMIT)); setError(''); },
    removeImage(id: string) {
      invalidateAnalysis(); releaseDesignImages(attachments.current.filter(image => image.id === id));
      attachments.current = attachments.current.filter(image => image.id !== id);
      setImages(attachments.current); setError('');
    },
    edit() { invalidateAnalysis(); setError(''); },
    cancel() { invalidateAnalysis(); setError('분석을 취소했습니다. 입력 내용은 유지됩니다.'); },
    changeCondition(index: number, description: string) {
      onConditionsChange();
      setConfirmed(false);
      setSelections(items => items.map((item, itemIndex) => itemIndex === index ? {
        ...item, description: description.slice(0, 300), kind: 'OTHER', value: '', source: 'USER_EDIT',
        evidence: '', imageIndex: null, support: 'NEEDS_REVIEW',
      } : item));
    },
    includeCondition(index: number, included: boolean) {
      onConditionsChange();
      setConfirmed(false); setSelections(items => items.map((item, itemIndex) => itemIndex === index ? { ...item, included } : item));
    },
    resumeReview() { onConditionsChange(); setConfirmed(false); },
    changePriority(index: number, priority: 'REQUIRED' | 'PREFERRED') {
      onConditionsChange();
      setConfirmed(false); setSelections(items => items.map((item, itemIndex) => itemIndex === index ? { ...item, priority } : item));
    },
    confirm() { if (selections.some(item => item.included) && selections.filter(item => item.included).every(item => item.description.trim())) setConfirmed(true); },
  };
}
