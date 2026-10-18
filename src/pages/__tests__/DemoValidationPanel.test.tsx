import {renderToStaticMarkup} from 'react-dom/server';
import {describe,it,expect,vi} from 'vitest';
import DemoValidationPanel from '../DemoValidationPanel';
import type {DemoValidationReport} from '../demoValidation';
const report:DemoValidationReport={errors:1,warnings:0,items:[{key:'pair',kind:'collision',severity:'ERROR',furniture:[{id:'a',label:'침대'},{id:'b',label:'책장'}],messages:['두 가구의 본체가 겹칩니다.']}]};
describe('placement validation panel',()=>{
 it('presents the named pair once, with separate selection actions',()=>{
  const markup=renderToStaticMarkup(<DemoValidationPanel report={report} preview={false} selectedId={null} onSelect={vi.fn()} />);
  expect(markup).toContain('aria-label="침대 선택"');expect(markup).toContain('aria-label="책장 선택"');
  expect(markup.match(/두 가구의 본체가 겹칩니다/g)).toHaveLength(1);
  expect(markup).toContain('먼저 해결할 문제');expect(markup).not.toContain('aria-label="사용 공간 주의"');
 });
 it('does not expose current-room selection actions in a recommendation preview',()=>{
  const markup=renderToStaticMarkup(<DemoValidationPanel report={report} preview selectedId={null} />);
  expect(markup).toContain('추천 미리보기');expect(markup).not.toContain('<button');
 });
 it('shows a scoped all-clear state without empty problem sections',()=>{
  const empty={...report,errors:0,items:[]};
  const markup=renderToStaticMarkup(<DemoValidationPanel report={empty} preview={false} selectedId={null} onSelect={vi.fn()} />);
  expect(markup).toContain('현재 확인한 범위에서 배치 문제가 발견되지 않았습니다.');expect(markup).not.toContain('먼저 해결할 문제');
 });
});
