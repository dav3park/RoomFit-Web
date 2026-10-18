import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import type { CompiledConsultation } from '../../../recommendation/consultation';
import DesignConsultationPanel from '../DesignConsultationPanel';
import type { useDesignConsultationDraft } from '../useDesignConsultationDraft';

const draft={description:'수납장 필요',images:[],processing:false,pending:false,error:'',confirmed:false,
  analysis:{revision:'r',source:'LLM',summary:'수납장 종류 확인',questions:['옷장과 서랍장 중 어느 것이 필요하십니까?'],requirements:[]},
  preparation:{revision:'r',conditions:[{id:'0',effects:[],unresolved:['종류 확인']}]},
  selections:[{included:true,description:'수납장 종류 확인',source:'USER_TEXT',priority:'REQUIRED',imageIndex:null,evidence:'수납장'}],
} as unknown as ReturnType<typeof useDesignConsultationDraft>;
const render=(value=draft,report:CompiledConsultation|null=null)=>renderToStaticMarkup(<DesignConsultationPanel draft={value} report={report} preparationError="" preparing={false} generating={false} busy={false} onGenerate={vi.fn()} onCancel={vi.fn()} />);
describe('consultation review flow',()=>{
  it('places actionable clarification before the editable condition list',()=>{
    const markup=render();
    expect(markup.indexOf('조건을 더 구체화해 주세요')).toBeGreaterThan(-1);
    expect(markup.indexOf('조건을 더 구체화해 주세요')).toBeLessThan(markup.indexOf('aria-label="해석된 조건"'));
    expect(markup).toContain('해당 조건 수정');
  });
  it('marks recommendation as the current step only after confirmation',()=>{
    const markup=render({...draft,confirmed:true});
    const active=markup.match(/<li[^>]*aria-current="step"[^>]*>([\s\S]*?)<\/li>/)?.[1];
    expect(active).toContain('추천·비교');
    expect((markup.match(/aria-current="step"/g)??[])).toHaveLength(1);
    expect(render()).toMatch(/aria-current="step"[^>]*>[\s\S]*?조건 확인/);
  });
  it('removes resolved questions and keeps the review step active when blocked',()=>{
    const completed={options:null,reflected:['수납장'],omitted:[],blockers:[]};
    expect(render(draft,completed)).not.toContain('조건을 더 구체화해 주세요');
    const blocked=render({...draft,confirmed:true},{...completed,blockers:['수납장 종류 확인']});
    const active=blocked.match(/<li[^>]*aria-current="step"[^>]*>([\s\S]*?)<\/li>/)?.[1];
    expect(active).toContain('조건 확인');
    expect(blocked).toContain('조건을 더 구체화해 주세요');
  });

  it('does not resurrect a resolved question when returning to condition editing',()=>{
    const solved={...draft,confirmed:false,
      preparation:{revision:'new',conditions:[{id:'0',effects:[{kind:'REQUIRE_TYPE',value:'sofa',count:2}],unresolved:[]}]},
      selections:draft.selections.map(item=>({...item,description:'소파 2개',preparedDescription:'소파 2개'})),
    };
    expect(render(solved)).not.toContain('조건을 더 구체화해 주세요');
  });

});
