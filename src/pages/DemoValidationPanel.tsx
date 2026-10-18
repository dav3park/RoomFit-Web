import type {DemoValidationReport} from './demoValidation';

const labels={collision:'가구 겹침',boundary:'방 경계 이탈',opening:'문·수납 개폐',access:'접근 공간 침범'};
export default function DemoValidationPanel({report,preview,onSelect,selectedId}:{
  report:DemoValidationReport;preview:boolean;onSelect?: (id:string)=>void;selectedId:string|null;
}){
  return <section className="demo-inspector-section" aria-label="배치 검증">
    <h2>배치 검증 <span className="demo-badge">{preview?'추천 미리보기':'현재 배치'}</span></h2>
    <p className="demo-help">{onSelect&&report.items.length?'가구 이름을 누르면 3D 화면에서 해당 가구를 선택합니다.':`${preview?'추천 미리보기':'현재 배치'}의 겹침·방 경계·개폐·접근 공간을 확인합니다.`}</p>
    {!report.items.length&&<p className="demo-help">현재 확인한 범위에서 배치 문제가 발견되지 않았습니다.</p>}
    {(['ERROR','WARNING'] as const).map(severity=>{
      const items=report.items.filter(item=>item.severity===severity);
      return !!items.length&&<section className="demo-validation-group" key={severity} aria-label={severity==='ERROR'?'먼저 해결할 문제':'사용 공간 주의'}>
        <h3>{severity==='ERROR'?'먼저 해결할 문제':'사용 공간 주의'} <span>{items.length}건</span></h3>
        <ul className="demo-validation-items">{items.map(item=><li key={item.key}>
          <span className="demo-badge">{labels[item.kind]}</span>
          <div className="demo-validation-pair">{item.furniture.map((furniture,index)=><span key={furniture.id}>
            {!!index&&<span aria-hidden="true"> · </span>}
            {onSelect?<button type="button" aria-label={`${furniture.label} 선택`} aria-pressed={selectedId===furniture.id} onClick={()=>onSelect(furniture.id)}>{furniture.label}</button>:<strong>{furniture.label}</strong>}
          </span>)}</div>
          {item.messages.map(message=><p key={message}>{message}</p>)}
        </li>)}</ul>
      </section>;
    })}
    <p className="demo-help">문·수납 개폐는 근사치입니다. 실제 개폐 방식과 통로 연결·배치 점수는 이 화면에서 검증하지 않습니다.</p>
  </section>;
}
