import { getActiveRequestClientId } from '../config/clientScope';
import { auditConsultationProposal } from '../recommendation/consultationAudit';
import { compileConsultation, type CompiledConsultation } from '../recommendation/consultation';
import { consultationErrorMessage, consultationFurniture, resolveConsultationPreparation } from '../api/designConsultation';
import { getAutomaticColorScheme } from '../config/automaticColorSchemes';
import { useEffect, useId, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { FiList, FiBox, FiCheck, FiHome, FiRotateCw, FiTrash2, FiSliders, FiLock, FiUnlock, FiX, FiMessageSquare, FiAlertCircle } from 'react-icons/fi';
import Button from '../components/ui/Button';
import DemoFurnitureCard from './DemoFurnitureCard';
import DemoSceneTools from './DemoSceneTools';
import { demoPlacementReason, demoPlacementIssues, demoOverlapHighlights } from './demoPlacement';
import RoomViewer from '../components/room/RoomViewer';
import { moveFurnitureInsideRoom, rotateFurnitureInsideRoom } from '../components/room/furnitureBoundary';
import { FURNITURE_SELECTION_ITEMS, FURNITURE_SELECTION_CATEGORIES } from '../config/furnitureSelectionCatalog';
import { PREFERRED_COLOR_TONE_OPTIONS, type PreferredColorToneId } from '../config/preferredColorTone';
import {buildDemoValidationReport} from './demoValidation';
import DemoValidationPanel from './DemoValidationPanel';
import type { Furniture, RoomLayout, Vector2D } from '../types';
import { addDemoProduct, resizeDemoFurniture, furnitureDimensionRangeMm, readDemoDraft, copyDemoRoom, DEMO_PRODUCTS, DEMO_ROOMS, type DemoProduct } from './workspaceDemoState';
import minimal from '../assets/styles/minimal.png';
import natural from '../assets/styles/natural.png';
import modern from '../assets/styles/modern.png';
import classic from '../assets/styles/classic.png';
import midcentury from '../assets/styles/midcentury.png';
import './workspaceDemo.css';
import type { RecommendationPalette, RecommendationPurpose, RecommendationStyle, RecommendationResult, RecommendationOptions } from '../recommendation/engine';
import RecommendationThumbnail from '../recommendation/RecommendationThumbnail';
import { MAX_ACTIVE_FURNITURE } from '../config/furnitureAdditionPolicy';
import { getFurnitureSelectionBlockReason } from '../config/furnitureSelectionPolicy';
import { getLayoutAppliedColorScheme, getLayoutAppliedPreferredColorTone, resolveRoomLayoutPreferredColorTone } from '../config/appliedColorTone';
import DesignConsultationPanel from '../components/editor/DesignConsultationPanel';
import { useDesignConsultationDraft } from '../components/editor/useDesignConsultationDraft';
import { isFixtureFurniture } from "../config/fixtureType";

const tools = [{ id: 'room', label: '방 · 스캔 보정', icon: FiHome }, { id: 'furniture', label: '가구 탐색', icon: FiBox }, { id: 'ai', label: '추천', icon: FiSliders }, { id: 'consultation', label: 'AI 디자인 상담', icon: FiMessageSquare }, { id: 'results', label: '검증 · 결과', icon: FiList }] as const;
const styles = [{ id: 'minimal', title: '미니멀', image: minimal }, { id: 'natural', title: '내추럴', image: natural }, { id: 'modern', title: '모던', image: modern }, { id: 'classic', title: '클래식', image: classic }, { id: 'midcentury', title: '미드센추리', image: midcentury }] as const;
const purposes = ['휴식', '업무 / 공부', '취미 / 여가', '수납'] as const;
const axes = [{ id: 'width', label: '가로' }, { id: 'depth', label: '세로' }] as const;

interface WorkspaceService {
  initialRoom: RoomLayout;
  onSave: (room: RoomLayout) => RoomLayout;
  onNext: (room: RoomLayout) => Promise<void>;
  onChooseRoom: (room: RoomLayout) => Promise<void>;
}

export default function WorkspaceDemo({service}: {service?: WorkspaceService}) {
  const [room, setRoom] = useState(() => copyDemoRoom(service?.initialRoom ?? readDemoDraft() ?? DEMO_ROOMS[0]));
  const [baseline, setBaseline] = useState(() => copyDemoRoom(service?.initialRoom ?? readDemoDraft() ?? DEMO_ROOMS[0]));
  const [tool, setTool] = useState<(typeof tools)[number]['id']>('room');
  const [panelOpen, setPanelOpen] = useState(true);
  const [roomChoice, setRoomChoice] = useState(room.id);
  const [roomSource, setRoomSource] = useState(service ? '선택한 공간' : '로컬 샘플');
  const [busy, setBusy] = useState(false);
  const operationRef = useRef(false);
  const [category, setCategory] = useState('침대');
  const [search, setSearch] = useState('');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [interior, setInterior] = useState(true);
  const [cameraKey, setCameraKey] = useState(0);
  const [purpose, setPurpose] = useState<RecommendationPurpose>('휴식');
  const [palette, setPalette] = useState<RecommendationPalette>(() => getLayoutAppliedColorScheme(service?.initialRoom??room)?'auto':(service ? resolveRoomLayoutPreferredColorTone(service.initialRoom) : getLayoutAppliedPreferredColorTone(room)) ?? 'auto');
  const [style, setStyle] = useState<RecommendationStyle>('natural');
  const [keepTypes, setKeepTypes] = useState(true);
  const [keepSizes, setKeepSizes] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [recommendations, setRecommendations] = useState<RecommendationResult | null>(null);
  const workerRef = useRef<Worker | null>(null);
  const preparationRef = useRef<AbortController | null>(null);
  const recommendationSource = useRef<'manual' | 'consultation'>('manual');
  const [preparing, setPreparing] = useState(false);
  const [consultationReport, setConsultationReport] = useState<CompiledConsultation | null>(null);
  const [consultationError, setConsultationError] = useState('');
  const recommendationResults = useRef<HTMLElement>(null);
  useEffect(() => { if(recommendations) recommendationResults.current?.focus(); }, [recommendations]);
  useEffect(() => () => {workerRef.current?.terminate();preparationRef.current?.abort();}, []);
  const [candidate, setCandidate] = useState<RoomLayout | null>(null);
  const [appliedPalette, setAppliedPalette] = useState<PreferredColorToneId | null>(() => service ? resolveRoomLayoutPreferredColorTone(service.initialRoom) : getLayoutAppliedPreferredColorTone(room));
  const [notice, setNotice] = useState(service ? '가구를 끌어 배치하거나 선택해 공간을 편집하세요.' : '샘플 방에서 자유롭게 배치를 편집해 보세요.');
  const [saveError, setSaveError] = useState('');
  // The 3D toolbar renders in a separate root; rapid edits must use the latest layout.
  const latestRoom = useRef(room);
  const moving = useRef(false);
  const [confirmed, setConfirmed] = useState(false);
  const consultationDraft = useDesignConsultationDraft(() => latestRoom.current, invalidateConsultationRecommendations);
  const stage = useRef<HTMLElement>(null);
  const panelToggle = useRef<HTMLButtonElement>(null);
  const [draggingProduct, setDraggingProduct] = useState(false);
  const [pending, setPending] = useState<Furniture | null>(null);
  const dragRejection = useRef<string | null>(null);
  const pendingRef = useRef<Furniture | null>(null);
  const [showAllClearance, setShowAllClearance] = useState(false);
  function cancelPlacement() { pendingRef.current = null; setPending(null); setDraggingProduct(false); }
  useEffect(() => {
    const escape = (event: KeyboardEvent) => { if (event.key === 'Escape') { cancelPlacement(); setSelectedId(null); setNotice('가구 선택과 배치 미리보기를 해제했습니다.'); } };
    window.addEventListener('keydown', escape);
    return () => window.removeEventListener('keydown', escape);
  }, []);
  const displayedRoom = candidate ?? room;
  const selected = room.furniture.find(item => item.id === selectedId);
  const spaceRules = demoOverlapHighlights(displayedRoom);
  const issues = spaceRules.findings;
  const validationReport = buildDemoValidationReport(displayedRoom,spaceRules);
  const hasValidationIssues = validationReport.items.length > 0;
  const products = DEMO_PRODUCTS.filter(product => {
    const meta = FURNITURE_SELECTION_ITEMS.find(item => item.canonicalType === product.furnitureType);
    return (category === '전체' || meta?.category === category) && product.label.includes(search.trim());
  });

  function persistRoom(next: RoomLayout) {
    try {
      if (service) service.onSave(next);
      else localStorage.setItem('roomfit:workspaceDemoDraft', JSON.stringify(next));
      setSaveError('');
    } catch {
      setSaveError('자동 저장하지 못했습니다. 현재 편집은 유지됩니다. 브라우저 저장 공간을 확인한 뒤 다시 변경하거나 다음 단계에서 재시도해 주세요.');
    }
  }
  function changeRoom(next: RoomLayout) {
    consultationDraft.invalidateAnalysis();
    invalidateRecommendations();
    latestRoom.current = next;
    setRoom(next); setCandidate(null); setConfirmed(false);
    if (!moving.current) persistRoom(next);
    setNotice('배치를 변경했습니다. 현재 상태는 이 브라우저에 자동 저장됩니다.');
  }
  function transformSelected(update: (item: Furniture) => Furniture) {
    if (!selected || candidate) return;
    const current = latestRoom.current;
    changeRoom({ ...current, furniture: current.furniture.map(item => item.id === selected.id ? { ...update(item), status: 'user_modified' } : item) });
  }
  function move(id: string, position: Vector2D) {
    if (candidate) return;
    const current = latestRoom.current;
    changeRoom({ ...current, furniture: current.furniture.map(item => item.id === id ? { ...moveFurnitureInsideRoom(current, item, position), status: 'user_modified' } : item) });
  }
  function rotate(id: string) {
    if (candidate) return;
    const current = latestRoom.current;
    changeRoom({ ...current, furniture: current.furniture.map(item => item.id === id ? { ...rotateFurnitureInsideRoom(current, item, item.rotationY + Math.PI / 2), status: 'user_modified' } : item) });
  }
  function place(product: DemoProduct, drag = false) {
    if (candidate || busy) return;
    if (service) {
      const block = getFurnitureSelectionBlockReason(product.variantId === "bed-loft-desk" ? product.variantId : product.furnitureType, [], room);
      if (block || room.furniture.filter(item => item.status !== 'deleted').length >= MAX_ACTIVE_FURNITURE) { setNotice(block ?? `가구는 최대 ${MAX_ACTIVE_FURNITURE}개까지 배치할 수 있습니다.`); return; }
    }
    dragRejection.current = null;
    const item = addDemoProduct(room, product).furniture.at(-1)!;
    pendingRef.current = item; setPending(item); setSelectedId(null);
    if (!drag && window.innerWidth <= 760) { setPanelOpen(false); stage.current?.scrollIntoView({block: 'start'}); }
    setNotice('배치 미리보기입니다. 바닥을 눌러 위치를 지정한 뒤 추가하세요. 이미지를 바닥으로 끌어 놓아도 됩니다.');
  }
  function pointPlacement(position: Vector2D) {
    if (!pendingRef.current) return;
    const next = { ...pendingRef.current, position };
    pendingRef.current = next; setPending(next);
    if (draggingProduct) setNotice(demoPlacementReason(room, next) ?? (demoPlacementIssues(room,next).some(issue=>issue.type==='BODY_COLLISION') ? '가구가 겹치지만 놓으면 추가됩니다. 빨간 표시를 확인하세요.' : '배치 가능한 위치입니다. 놓으면 가구를 한 번 추가합니다.'));
  }
  function commitPlacement(position?: Vector2D) {
    const current = pendingRef.current;
    if (!current || candidate) return;
    const item = position ? { ...current, position } : current;
    const reason = demoPlacementReason(room, item);
    if (reason) { dragRejection.current = reason; pointPlacement(item.position); setNotice(`배치할 수 없습니다: ${reason}`); return; }
    cancelPlacement(); changeRoom({ ...latestRoom.current, furniture: [...latestRoom.current.furniture, item] }); setSelectedId(item.id); setPanelOpen(false);
    setNotice(demoPlacementIssues(room,item).some(issue=>issue.type==='BODY_COLLISION') ? '가구를 추가했습니다. 다른 가구와 겹친 부분은 빨간색으로 표시됩니다.' : service ? '지정한 위치에 가구를 추가했습니다.' : '지정한 위치에 가구를 한 번 추가했습니다. 로컬 데모 배치입니다.');
  }
  function loadRoom(uploadSample = false) {
    cancelPlacement();
    consultationDraft.reset();
    const next = copyDemoRoom(DEMO_ROOMS.find(item => item.id === roomChoice) ?? DEMO_ROOMS[0]);
    setBaseline(copyDemoRoom(next)); changeRoom(next); setSelectedId(null); setAppliedPalette(null);
    setRoomSource(uploadSample ? '불러오기 예시 · 실제 업로드 없음' : '로컬 샘플');
    setNotice('선택한 로컬 샘플을 불러왔습니다. 이전 데모 편집은 초기화되었습니다.');
  }
  function closePanel() { setPanelOpen(false); panelToggle.current?.focus(); }
  function stopGeneration() { preparationRef.current?.abort(); preparationRef.current = null; setPreparing(false); workerRef.current?.terminate(); workerRef.current = null; setGenerating(false); }
  function invalidateRecommendations() { stopGeneration(); setRecommendations(null); setCandidate(null); }
  function updateInput(action: () => void) { invalidateRecommendations(); action(); }
  function invalidateConsultationRecommendations() {
    setConsultationReport(null);setConsultationError('');
    if(recommendationSource.current==='consultation')invalidateRecommendations();
  }
  function generate() {
    recommendationSource.current='manual';setConsultationReport(null);setConsultationError('');
    runGeneration({purpose,style,palette,mode:'new',keepTypes,keepSizes});
  }
  async function generateConsultation() {
    if(!consultationDraft.confirmed||busy||preparationRef.current||workerRef.current)return;
    invalidateRecommendations();recommendationSource.current='consultation';setConsultationReport(null);setConsultationError('');
    const abort=new AbortController(),base=latestRoom.current,clientId=getActiveRequestClientId();
    preparationRef.current=abort;setPreparing(true);
    const current=()=>preparationRef.current===abort&&!abort.signal.aborted&&latestRoom.current===base&&getActiveRequestClientId()===clientId;
    try {
      const prepared=await resolveConsultationPreparation(consultationDraft.selections,consultationDraft.preparation,consultationFurniture(base),abort.signal);
      if(!current())return;
      const compiled=compileConsultation(consultationDraft.selections,prepared,base);
      consultationDraft.rememberPreparation(prepared);
      setConsultationReport(compiled);
      preparationRef.current=null;setPreparing(false);
      if(compiled.options)runGeneration(compiled.options);
    } catch(error) {if(current())setConsultationError(consultationErrorMessage(error));}
    finally {if(preparationRef.current===abort){preparationRef.current=null;setPreparing(false);}}
  }
  function runGeneration(options:RecommendationOptions) {
    stopGeneration(); cancelPlacement(); setCandidate(null); setRecommendations(null); setSelectedId(null); setGenerating(true);
    setNotice('상품 태그를 비교하고, 문·수납 개폐와 60 cm 이동 통로를 확인하고 있습니다.');
    const original=copyDemoRoom(latestRoom.current);
    try {
      const worker = new Worker(new URL('../recommendation/worker.ts', import.meta.url), {type:'module'});
      workerRef.current = worker;
      worker.onmessage = (event:MessageEvent<{result?:RecommendationResult;error?:string}>) => {
        if(workerRef.current !== worker) return;
        stopGeneration();
        if(event.data.result) {
          const result=event.data.result;
          if(options.constraints){
            const audited=result.proposals.map(proposal=>({...proposal,consultationAudit:auditConsultationProposal(proposal.room,options,original)}));
            result.proposals=audited.filter(proposal=>proposal.consultationAudit.valid);
            result.messages=[...result.messages,...new Set(audited.filter(proposal=>!proposal.consultationAudit.valid).flatMap(proposal=>proposal.consultationAudit.issues))];
          }
          setRecommendations(result);
          setCandidate(result.proposals[0]?.room ?? null);
          setNotice(result.proposals.length ? `추천안 ${result.proposals.length}개를 찾았습니다. 적용 전까지 현재 배치는 유지됩니다.` : '조건을 만족하는 추천안을 찾지 못했습니다. 현재 배치를 유지합니다.');
        } else setNotice(event.data.error ?? '추천을 생성하지 못했습니다. 현재 배치는 유지됩니다.');
      };
      worker.onerror = () => { if(workerRef.current === worker) {stopGeneration(); setNotice('추천 생성에 실패했습니다. 현재 배치는 유지됩니다. 다시 시도해 주세요.');} };
      worker.postMessage({room:original,options:{...options,seed:crypto.getRandomValues(new Uint32Array(1))[0]}});
    } catch {stopGeneration(); setNotice('추천 계산을 시작하지 못했습니다. 현재 배치는 유지됩니다. 다시 시도해 주세요.');}
  }
  async function serviceAction(action: 'choose' | 'next') {
    if (!service || operationRef.current) return;
    operationRef.current = true; setBusy(true); cancelPlacement();
    try {
      const snapshot = copyDemoRoom(latestRoom.current);
      if (action === 'next') await service.onNext(snapshot);
      else await service.onChooseRoom(snapshot);
    } catch (error) {
      setNotice(error instanceof Error ? error.message : '저장하지 못했습니다. 현재 편집 내용을 유지합니다. 다시 시도해 주세요.');
    } finally { operationRef.current = false; setBusy(false); }
  }

  const editing = pending ?? selected;
  const editingRules = pending ? demoOverlapHighlights({...room,furniture:[...room.furniture,pending]}) : spaceRules;
  const originalDimensions = editing && (editing.resizeBaseDimensions ?? DEMO_PRODUCTS.find(product => product.productId === editing.productId)?.dimensions ?? baseline.furniture.find(item => item.id === editing.id)?.dimensions ?? editing.dimensions);
  function resizeEditing(axis: 'width' | 'depth', value: number, absolute = false) {
    if (!editing || !originalDimensions) return;
    const current = pendingRef.current ?? latestRoom.current.furniture.find(item => item.id === editing.id);
    if (!current) return;
    const delta = absolute ? value - current.dimensions[axis] : value;
    const next = resizeDemoFurniture(latestRoom.current, current, originalDimensions, axis, delta);
    if (pendingRef.current) { pendingRef.current = next; setPending(next); }
    else transformSelected(() => next);
  }
  const editToolbar = editing && <div className="demo-floating-toolbar" role="group" aria-label={pending ? '가구 배치 미리보기' : '선택 가구 편집'} onPointerDown={event => event.stopPropagation()} onClick={event => event.stopPropagation()}>
    <div className="demo-toolbar-title"><strong>{editing.name}{pending ? ' · 미리보기' : ''}</strong><button className="demo-icon-button" aria-label={pending ? '배치 취소' : '가구 선택 해제'} onClick={() => { cancelPlacement(); setSelectedId(null); }}><FiX /></button></div>
    {!pending && isFixtureFurniture(editing) ? <p className="demo-toolbar-note" role="status">고정설비라 이동·삭제할 수 없습니다.</p> : <div className="demo-toolbar-actions">
      <button className="demo-outline" aria-label="90° 회전" title="90° 회전" onClick={() => { if (pending) { const next={...pending,rotationY:pending.rotationY+Math.PI/2}; pendingRef.current=next; setPending(next); } else rotate(editing.id); }}><FiRotateCw /></button>
      <button className="demo-outline" aria-label={pending ? '배치 취소' : '가구 삭제'} title={pending ? '배치 취소' : '가구 삭제'} onClick={() => { if (pending) cancelPlacement(); else { changeRoom({...latestRoom.current,furniture:latestRoom.current.furniture.filter(item=>item.id!==editing.id)}); setSelectedId(null); } }}><FiTrash2 /></button>
      {!pending && <button className="demo-outline" aria-label="추천에서 가구 고정" aria-pressed={!!editing.recommendationLocked} title="추천에서 상품·위치·크기 고정" onClick={()=>transformSelected(item=>({...item,recommendationLocked:!item.recommendationLocked}))}>{editing.recommendationLocked ? <FiLock /> : <FiUnlock />}</button>}
      <div className="demo-toolbar-sizes">{axes.map(axis => <DimensionControl key={`${editing.id}-${axis.id}`} label={`가구 ${axis.label}`} displayLabel={axis.label} base={originalDimensions![axis.id]} value={editing.dimensions[axis.id]} onChange={delta => resizeEditing(axis.id,delta)} onSet={value => resizeEditing(axis.id,value,true)} />)}</div>
      {pending && <button className="demo-outline" disabled={!!demoPlacementReason(room,pending)} onClick={() => commitPlacement()}>이 위치에 추가</button>}
    </div>}
    <p className="demo-toolbar-note" role="status" title={editingRules.reasons.get(editing.id)?.join(' · ')}>{
      (pending && demoPlacementReason(room,pending)) ||
      (editingRules.status.get(editing.id) === 'blocked' ? '충돌·개폐 공간 침범' : editingRules.status.get(editing.id) === 'warning' ? '권장 접근 공간 주의' : '여유 공간 확보')
    }{pending && !demoPlacementReason(room,pending) ? ' · 추가 가능' : ''}</p>

  </div>;

  return <main className={`workspace-demo ${service ? 'workspace-service' : ''}`} aria-busy={busy || generating || preparing} data-saving={busy}>
    <header className="demo-header">
      <Link to="/" className="demo-logo">ROOMFIT</Link>
      <span className="demo-name">배치 작업실 {!service && <span className="demo-badge">UI 데모</span>}</span>
      {service ? <div className="demo-header-actions"><button className="demo-outline" disabled={busy} onClick={() => void serviceAction('choose')}>이전 단계</button><Button disabled={busy || generating || preparing || !!candidate} onClick={() => void serviceAction('next')}>다음 단계</Button></div> : <>      <div className="demo-header-actions"><Button onClick={() => { setConfirmed(true); setNotice('확정 화면 예시입니다. 실제 배치는 저장·확정되지 않았습니다.'); }} disabled={!!candidate || issues.some(item => item.severity === 'ERROR')}>데모 확정</Button></div></> }
    </header>
    {!service && <div className="demo-disclaimer">로컬 샘플 배치입니다. AI 디자인 상담에서 분석을 요청할 때만 사진·설명을 전송하며, 배치는 서버에 저장하지 않습니다.</div>}
    <div className={`demo-workspace ${panelOpen ? '' : 'demo-panel-collapsed'} ${selected && !candidate ? 'demo-has-selection' : ''}`}>
      <section className="demo-tools" aria-label="작업 도구">
        <div className="demo-tool-buttons">{tools.map(({ id, label, icon: Icon }) => <button key={id} ref={tool === id ? panelToggle : undefined} title={label} aria-label={label} aria-describedby={id==='results'&&hasValidationIssues?'demo-validation-status':undefined} aria-pressed={tool === id && panelOpen} aria-controls="demo-tool-panel" onClick={() => { setPanelOpen(tool !== id || !panelOpen); setTool(id); }}><Icon aria-hidden="true" /><span>{label}</span>{id==='results'&&hasValidationIssues&&<FiAlertCircle className="demo-validation-alert" aria-hidden="true" />}</button>)}</div>
        <p id="demo-validation-status" className="sr-only" role="status">{hasValidationIssues?'표시 중인 배치에 확인할 문제가 있습니다.':'표시 중인 배치에 확인할 문제가 없습니다.'}</p>

      </section>
      {panelOpen && <aside id="demo-tool-panel" className="demo-tool-panel" aria-label={tools.find(item => item.id === tool)!.label}>
        <div className="demo-panel-heading"><h2>{tools.find(item => item.id === tool)!.label}</h2><button aria-label="작업 패널 닫기" className="demo-icon-button" onClick={closePanel}><FiX /></button></div>
        <div className="demo-panel-content">
          {tool === 'room' && <>
            {service ? <><h3>{room.name}</h3><button className="demo-outline" disabled={busy} onClick={() => void serviceAction('choose')}>다른 공간 선택</button></> : <>            <label className="demo-field">샘플 방<select value={roomChoice} onChange={event => setRoomChoice(event.target.value)}>{DEMO_ROOMS.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label>
            <p className="demo-help">불러오면 현재 데모 편집이 초기화됩니다.</p>
            <Button onClick={() => loadRoom()} className="w-full">선택한 샘플 불러오기</Button>
            <details className="demo-section"><summary>스캔한 방 불러오기</summary><p className="demo-help">실제 서비스는 RoomPlan 업로드와 앱 페어링을 지원합니다. 여기서는 선택한 샘플로 불러오기 흐름만 확인합니다.</p><button className="demo-outline" onClick={() => loadRoom(true)}>샘플로 불러오기 체험</button><p className="demo-help">파일 전송 및 앱 연결은 실행하지 않습니다.</p></details>
</>}
            <section className="demo-section"><h3>가구 스캔 보정</h3><p className="demo-help">가구를 선택하면 작은 도구막대에서 가로·세로를 보정할 수 있어요.</p>{room.furniture.map(item => <button key={item.id} className="demo-list-row" aria-pressed={selectedId === item.id} disabled={!!candidate} onClick={() => { setSelectedId(item.id); setPanelOpen(false); }}>{item.name}<span>{Math.round(item.dimensions.width * 1000)} mm</span></button>)}</section>
          </>}
          {tool === 'room' && <>          <details className="demo-furniture-list"><summary>배치된 가구 ({room.furniture.length})</summary>{room.furniture.map(item => <button key={item.id} disabled={!!candidate} aria-pressed={selectedId === item.id} className="demo-list-row" onClick={() => { setSelectedId(item.id); setPanelOpen(false); }}>{item.name}{selectedId === item.id && <FiCheck />}</button>)}{!room.furniture.length && <p className="demo-help">가구 탐색에서 상품을 추가해 주세요.</p>}</details></>}
          {tool === 'furniture' && <>
            <p className="demo-help">이미지나 상품명을 바닥으로 끌어 배치하세요. 클릭하면 위치를 지정합니다. 회전 아이콘으로 미리보기를 돌려볼 수 있습니다.</p>
            <label className="demo-field">가구 검색<input value={search} onChange={event => setSearch(event.target.value)} placeholder="상품 이름으로 찾기" /></label>
            <label className="demo-field">종류<select value={category} onChange={event => setCategory(event.target.value)}>{FURNITURE_SELECTION_CATEGORIES.map(item => <option key={item}>{item}</option>)}</select></label>
            <div className="demo-catalog">{products.map(product => <DemoFurnitureCard key={product.productId} product={product} disabled={!!candidate} onAdd={() => place(product)} onDragStart={() => { setDraggingProduct(true); place(product, true); }} onDragEnd={() => { if (pendingRef.current) setNotice(dragRejection.current ? `배치할 수 없습니다: ${dragRejection.current}` : '드래그 배치를 취소했습니다. 가구는 추가되지 않았습니다.'); cancelPlacement(); }} />)}</div>
            {!products.length && <p className="demo-help">일치하는 상품이 없습니다. 검색어를 바꿔 주세요.</p>}
          </>}
          {tool === 'consultation' && <DesignConsultationPanel draft={consultationDraft} onGenerate={()=>void generateConsultation()} preparing={preparing} generating={generating&&!!consultationReport} busy={busy}
            report={consultationReport} preparationError={consultationError} onCancel={()=>{stopGeneration();setNotice('추천 생성을 취소했습니다. 현재 배치는 유지됩니다.');}} />}
          {tool === 'results' && <>
            <DemoValidationPanel report={validationReport} preview={!!candidate} selectedId={selectedId} onSelect={candidate?undefined:id=>{
              setSelectedId(id);
              if(window.innerWidth<=760)setPanelOpen(false);
              stage.current?.querySelector<HTMLElement>('.demo-viewer')?.focus({preventScroll:true});
            }} />
            {service ? <section className="demo-inspector-section">
              <h2>자동 저장</h2>
              <p className="demo-save-state">{saveError ? '자동 저장 실패' : '현재 배치 자동 저장'}</p>
              <p className="demo-help">가구를 변경할 때마다 현재 배치가 이 브라우저에 자동 저장됩니다. 상단 다음 단계에서 최종 배치를 확인할 수 있습니다.</p>
              <button className="demo-outline" onClick={() => { setTool('furniture'); setPanelOpen(true); setNotice('가구 탐색 메뉴에서 배치를 계속 편집할 수 있습니다.'); }}>가구 편집으로 돌아가기</button>
            </section> : <section className="demo-inspector-section">
              <h2>저장 · 최종 확정</h2>
              <p className="demo-save-state">{confirmed ? '데모 확정 화면 예시' : saveError ? '자동 저장 실패' : '현재 배치 자동 저장'}</p>
              <p className="demo-help">가구 변경은 이 브라우저에 자동 저장됩니다. 실제 서버 저장·확정은 실행하지 않습니다.</p>
              <details><summary>쇼핑 리스트 ({room.furniture.filter(item => item.productId).length})</summary>{room.furniture.filter(item => item.productId).map(item => <p className="demo-help" key={item.id}>{item.name}</p>)}{!room.furniture.some(item => item.productId) && <p className="demo-help">추가한 카탈로그 상품이 없습니다.</p>}</details>
            </section>}
          </>}
          {tool === 'ai' && <>
            <p className="demo-help">취향과 유지할 조건을 골라 최대 3개의 배치를 비교하세요. 적용하기 전에는 현재 배치를 바꾸지 않습니다.</p>
            <section className="demo-section" aria-labelledby="recommendation-conditions-title">
              <h3 id="recommendation-conditions-title">유지할 조건</h3>
              <div className="recommendation-conditions">
                <label className="recommendation-condition">
                  <input type="checkbox" checked={keepTypes} aria-labelledby="keep-types-title" aria-describedby="keep-types-description"
                    onChange={event=>updateInput(()=>{setKeepTypes(event.target.checked);if(!event.target.checked)setKeepSizes(false);})} />
                  <span><strong id="keep-types-title">기존 가구 종류·개수 유지</strong><span id="keep-types-description">현재 가구의 종류와 개수를 유지해 추천해요.</span></span>
                </label>
                <label className="recommendation-condition">
                  <input type="checkbox" checked={keepSizes} disabled={!keepTypes} aria-labelledby="keep-sizes-title" aria-describedby="keep-sizes-description"
                    onChange={event=>updateInput(()=>setKeepSizes(event.target.checked))} />
                  <span><strong id="keep-sizes-title">기존 가구 크기 유지</strong><span id="keep-sizes-description">{keepTypes?'가로·세로·높이를 현재 크기로 유지해요.':'종류·개수 유지를 먼저 선택해 주세요.'}</span></span>
                </label>
              </div>
              <p className="demo-help">선택한 조건을 지키며 상품과 배치를 새로 추천해요.</p>
              <p className="demo-help">가구 도구막대의 자물쇠로 상품·위치·크기를 고정할 수 있어요. 선택한 색감은 고정 가구에도 적용됩니다.</p>
            </section>
            <section className="demo-section"><h3>라이프스타일</h3><div className="demo-choice-grid">{purposes.map(item => <button key={item} className="demo-choice" aria-pressed={purpose === item} onClick={() => updateInput(() => setPurpose(item))}>{item}</button>)}</div></section>
            <section className="demo-section"><h3>선호하는 색감</h3><div className="demo-palette"><button aria-label="선택 안 함 · 자동 색 조합" aria-pressed={palette==='auto'} onClick={()=>updateInput(()=>setPalette('auto'))}><span className="demo-palette-auto">자동</span>선택 안 함</button>{PREFERRED_COLOR_TONE_OPTIONS.map(item => <button key={item.id} aria-label={item.label} aria-pressed={palette === item.id} onClick={() => updateInput(() => setPalette(item.id))}><span style={{ background: item.colors.length > 1 ? `linear-gradient(135deg, ${item.colors[0]} 50%, ${item.colors[1]} 50%)` : item.colors[0] }} />{item.label}</button>)}</div><p className="demo-help">{palette==='auto'?'스타일·라이프스타일·바닥색에 맞는 색 조합을 추천안마다 제안합니다.':'선택한 색감을 가구의 재질과 부위에 나눠 적용합니다.'}</p></section>
            <section className="demo-section"><h3>인테리어 스타일</h3><p className="demo-help">이미지 선택이 추천 스타일 선택으로 연결됩니다.</p><div className="demo-style-grid">{styles.map(item => <button key={item.id} aria-label={item.title} aria-pressed={style === item.id} onClick={() => updateInput(() => setStyle(item.id))}><img src={item.image} alt={item.title} /><span>{item.title}</span>{style === item.id && <FiCheck aria-hidden="true" />}</button>)}</div></section>
            <div className="recommendation-actions">
              <Button onClick={generate} disabled={generating || busy} className="w-full">{generating ? '배치 계산 중…' : '추천 생성'}</Button>
              {generating && <button className="demo-outline" onClick={()=>{stopGeneration();setNotice('추천 생성을 취소했습니다. 현재 배치는 유지됩니다.');}}>계산 취소</button>}
            </div>
            <p className="demo-help">창문 가림·문과 수납 개폐·60 cm 통로를 확인하고, 가구 묶음·채광·균형을 비교합니다. 창턱 높이가 없으면 화면의 추정 높이를 사용하며 실제 개폐 방식은 다를 수 있습니다.</p>

          </>}
            {(tool==='ai'||tool==='consultation') && recommendations && <section ref={recommendationResults} tabIndex={-1} className="demo-section" aria-label="추천안 비교">
              <h3>추천안 비교</h3>
              {!!recommendations.proposals.length&&consultationReport&&<details><summary>추천 기준으로 사용한 요청</summary><ul className="demo-issues">{consultationReport.reflected.map((text,index)=><li key={index}>{text}</li>)}</ul></details>}
              {recommendations.messages.map(message=><p className="demo-help" key={message} role="status">{message}</p>)}
              {recommendations.proposals.map((proposal,index)=><div key={proposal.id} className="recommendation-proposal">
                <button className="recommendation-preview" aria-pressed={candidate===proposal.room} onClick={()=>setCandidate(proposal.room)}>
                  <RecommendationThumbnail room={proposal.room} /><RecommendationColourSwatches schemeId={proposal.room.appliedColorSchemeId} /><strong>{index+1}. {proposal.title}</strong>
                  {proposal.features.map(feature=><span key={feature}>{feature}</span>)}<span>사용 위치까지 통로 연결 확인</span>
                </button>
                {proposal.consultationAudit&&<details><summary>가구 구성·조건 확인</summary>
                  <ul className="demo-issues">{proposal.consultationAudit.inventory.map(item=><li key={`${item.type}:${item.name}`}>{item.label} · {item.name} {item.count}개</li>)}</ul>
                  <ul className="demo-issues">{proposal.consultationAudit.checks.map((check,i)=><li key={i}>{check.label}: 요청 {check.expected}개 · 결과 {check.actual}개 · 확인 완료</li>)}</ul>
                </details>}
                {!!proposal.validation.warnings.length && <details><summary>주의사항 {proposal.validation.warnings.length}개</summary><ul className="demo-issues">{proposal.validation.warnings.map(warning=><li key={warning}>{warning}</li>)}</ul></details>}
              </div>)}
              {candidate && <><p className="demo-help">미리보기 중입니다. 적용하면 현재 배치가 자동 저장됩니다.</p><div className="recommendation-actions"><Button className="w-full" onClick={()=>{
                if(consultationReport?.options){
                  const audit=auditConsultationProposal(candidate,consultationReport.options,latestRoom.current);
                  if(!audit.valid){setCandidate(null);setRecommendations(null);setConsultationError(`조건 확인에 실패해 적용하지 않았어요. ${audit.issues.join(' ')}`);return;}
                }
                const next=copyDemoRoom(candidate);changeRoom(next);setAppliedPalette(getLayoutAppliedPreferredColorTone(next));setSelectedId(null);setNotice('선택한 추천안을 적용하고 자동 저장했습니다. 이어서 직접 편집할 수 있습니다.');}}>이 추천안 적용</Button><button className="demo-outline" onClick={()=>{setCandidate(null);setNotice('현재 편집 배치로 돌아왔습니다. 추천안을 다시 눌러 비교할 수 있습니다.');}}>현재 배치로 돌아가기</button></div></>}
            </section>}

        </div>
      </aside>}
      <section ref={stage} className="demo-stage" aria-label="3D 배치 작업 영역">
        <div className="demo-stage-heading"><div><h1>{room.name}</h1><p>{room.width.toFixed(1)} m × {room.depth.toFixed(1)} m · 가구 {displayedRoom.furniture.length}개</p></div><label className="demo-interior"><input type="checkbox" checked={interior} onChange={event => setInterior(event.target.checked)} />내부 보기</label></div>
        <div className="demo-stage-state"><span>{candidate ? '추천 미리보기 · 미적용' : '직접 편집'}</span><span>{roomSource}</span></div>
        <div className="demo-viewer" tabIndex={0} aria-label="가구 직접 이동: 선택 후 방향키 또는 드래그" onKeyDown={event => {
          const direction=({ArrowLeft:{x:-.1,z:0},ArrowRight:{x:.1,z:0},ArrowUp:{x:0,z:-.1},ArrowDown:{x:0,z:.1}} as Record<string,Vector2D>)[event.key];
          if (busy || !direction || !editing || event.target!==event.currentTarget) return;
          event.preventDefault(); const position={x:editing.position.x+direction.x,z:editing.position.z+direction.z}; if(pending) pointPlacement(position);else move(editing.id,position);
        }}><RoomViewer key={`${room.id}-${cameraKey}`} room={displayedRoom} furniture={displayedRoom.furniture} selectedFurnitureId={candidate ? null : selectedId} onSelectFurniture={id => { if (!candidate && !pending) { setSelectedId(id); if (id) setPanelOpen(false); } }} onMoveFurniture={move} onBeginMoveFurniture={() => { moving.current = true; }} onEndMoveFurniture={() => { moving.current = false; persistRoom(latestRoom.current); }} onRotateFurniture={rotate} hideEntranceWalls={interior} alignCameraToEntrance showEditingHelpers={!candidate && !pending} selectOnClick directDrag preferredColorTone={candidate ? getLayoutAppliedPreferredColorTone(candidate) : appliedPalette}><DemoSceneTools room={displayedRoom} pending={pending} selectedId={selectedId} all={showAllClearance} toolbar={candidate || draggingProduct ? undefined : editToolbar} onPoint={pointPlacement} onDrop={commitPlacement} /></RoomViewer></div>
        <div className="demo-clearance-controls"><label><input type="checkbox" checked={showAllClearance} onChange={event => setShowAllClearance(event.target.checked)} />가구 사용 여유 공간 전체 표시</label><span><i className="demo-blue" />여유 확보 <i className="demo-orange" />접근 주의 <i className="demo-red" />충돌·개폐 침범</span></div>
        <p className="demo-clearance-note">파랑: 침범 없음 · 주황: 권장 접근 공간 침범 · 빨강: 본체 충돌·경계 이탈 또는 개폐 공간 침범. 옷장은 가로의 ½, 서랍장은 기존 전면 여유 값으로 근사합니다. 문은 문 폭을 반지름으로 안쪽 90° 열림을 가정합니다. 상품별 개폐 방식·경첩·서랍 인출량은 미확인입니다.</p>

        <div className="demo-viewer-footer"><span>{candidate ? '추천 메뉴에서 미리보기를 적용하거나 현재 배치로 돌아갈 수 있습니다.' : '가구를 선택해 드래그 · 배경을 드래그해 둘러보기'}</span><button className="demo-outline" onClick={() => setCameraKey(key => key + 1)}>중앙 보기</button></div>
        {saveError && <p className="demo-save-error" role="alert">{saveError}</p>}
        <p className="demo-notice" role="status" aria-live="polite">{notice}</p>
      </section>
    </div>
  </main>;
}

function DimensionControl({ label, displayLabel = label, value, base, disabled = false, onChange, onSet }: { label: string; displayLabel?: string; value: number; base: number; disabled?: boolean; onChange: (delta: number) => void; onSet: (value: number) => void }) {
  const [draft, setDraft] = useState<string | null>(null);
  const [error, setError] = useState('');
  const input = useRef<HTMLInputElement>(null);
  const errorId = useId();
  const { min, max } = furnitureDimensionRangeMm(base);
  const mm = Math.round(value * 1000);
  function commit() {
    if (draft === null) return;
    const next = Number(draft);
    if (!/^\d+$/.test(draft.trim()) || !Number.isSafeInteger(next) || next < min || next > max) {
      setError(`${min}~${max} mm의 정수를 입력하세요. 기존 크기를 유지합니다.`);
      setDraft(null);
      return;
    }
    setDraft(null); setError('');
    onSet(next / 1000);
  }
  return <div className="demo-dimension"><span>{displayLabel}</span>
    <button aria-label={`${label} 줄이기`} disabled={disabled || mm <= min} onClick={() => { setError(''); onChange(-.05); }}>−</button>
    <span className="demo-dimension-value"><input ref={input} aria-label={label} aria-invalid={!!error} aria-describedby={error ? errorId : undefined} inputMode="numeric" value={draft ?? mm} disabled={disabled} onFocus={event => { setDraft(String(mm)); event.target.select(); }} onChange={event => { setDraft(event.target.value); setError(''); }} onBlur={commit} onKeyDown={event => {
      event.stopPropagation();
      if (event.key === 'Enter') { event.preventDefault(); input.current?.blur(); }
      if (event.key === 'Escape') { event.preventDefault(); setDraft(null); setError(''); }
    }} /><span>mm</span></span>
    <button aria-label={`${label} 늘리기`} disabled={disabled || mm >= max} onClick={() => { setError(''); onChange(.05); }}>+</button>
    {error && <span id={errorId} className="demo-dimension-error" role="alert">{error}</span>}
  </div>;
}

function RecommendationColourSwatches({schemeId}:{schemeId:unknown}) {
  const scheme=getAutomaticColorScheme(schemeId);
  if(!scheme) return null;
  const colors=[scheme.palette.primary[0],scheme.palette.secondary[0],scheme.palette.accent[0],scheme.palette.wood[0]];
  return <span className="recommendation-colour-swatches" aria-label={`추천 색 조합: ${scheme.label}`}>{colors.map(color=><i key={color} style={{background:color}} />)}</span>;
}
