import { describe, expect, it } from 'vitest';
import document from '../../../docs/fixtures/workspace-feedback-cases.json';
import { isCanonicalFurnitureType } from '../canonicalFurnitureType';
import { isPreferredColorToneId } from '../preferredColorTone';
import { furnitureDimensionRangeMm } from '../../pages/workspaceDemoState';

interface SemanticFurniture {
  id: string;
  type: string;
  status: string;
  dimensions: { width: number; depth: number; height: number };
  resizeBaseDimensions: { width: number; depth: number; height: number };
}
interface Fixture {
  furniture: SemanticFurniture[];
  lockedFurnitureIds: string[];
  facts: { nearWindowFurnitureIds: string[]; largestByFootprint: Record<string, string[]>; visibleFurnitureOrder: string[] };
}
interface Operation {
  operationId: string;
  type: string;
  targetIds: string[];
  referenceId: string | null;
  parameters: Record<string, unknown>;
  dependsOn: string[];
}
interface SemanticCase {
  id: string;
  category: string;
  stage: string;
  usage: string;
  fixture: string;
  request: string;
  selectedFurnitureId?: string;
  directionFrame?: string;
  screenBasis?: { right: { x: number; z: number }; up: { x: number; z: number } };
  clarificationCaseId?: string;
  clarificationAnswer?: { questionId: string; requiredField: string; value: unknown; text: string; revision: string };
  guard?: Record<string, unknown>;
  expectedEffect?: { llmCalls?: number; status?: string; reasonCode?: string; originalUnchanged: boolean; persisted: boolean };
  expected: {
    decision: string | null;
    operations: Operation[];
    preserve: { targetId: string; fields: string[] }[];
    goals: string[];
    clarification: { code: string; requiredField: string; candidateIds: string[] } | null;
    reasonCode: string | null;
  };
}
const corpus = document as unknown as { fixtures: Record<string, Fixture>; cases: SemanticCase[] };
const geometryFields = ['PRODUCT', 'DIMENSIONS', 'POSITION', 'ORIENTATION'];
const fields = new Set([...geometryFields, 'APPEARANCE']);
const goals = new Set(['IMPROVE_CIRCULATION', 'OPEN_CENTER', 'SEPARATE_WORK_REST']);
const questionCodes = new Set(['AMBIGUOUS_TARGET', 'AMBIGUOUS_REFERENCE', 'AMBIGUOUS_ACTION',
  'AMBIGUOUS_DIRECTION_FRAME', 'AMBIGUOUS_ROTATION', 'AMBIGUOUS_GOAL', 'MISSING_UNIT',
  'MISSING_TARGET', 'MISSING_REFERENCE', 'CONFLICTING_REQUIREMENTS', 'LOCKED_TARGET']);
const mutations: Record<string, string[]> = {
  MOVE: ['POSITION'], ROTATE: ['ORIENTATION'], RESIZE_FURNITURE: ['DIMENSIONS'],
  REPLACE_PRODUCT: ['PRODUCT', 'DIMENSIONS', 'APPEARANCE'],
  SWAP_FURNITURE: ['PRODUCT', 'DIMENSIONS', 'APPEARANCE'],
  ADD_FURNITURE: [], REMOVE_FURNITURE: [...fields], SET_COLOR_TONE: ['APPEARANCE'],
  OPTIMIZE_LAYOUT: [...fields],
};
const parameterKeys: Record<string, string[]> = {
  MOVE: ['relation', 'frame', 'magnitude', 'distanceMm'], ROTATE: ['orientation'],
  RESIZE_FURNITURE: ['widthMm', 'depthMm'],
  REPLACE_PRODUCT: ['furnitureType', 'sizePreference', 'keepPosition', 'keepOrientation'],
  SWAP_FURNITURE: ['furnitureType', 'styleKeywords', 'keepPosition', 'keepOrientation'],
  ADD_FURNITURE: ['furnitureType', 'quantity', 'relation'], REMOVE_FURNITURE: [],
  SET_COLOR_TONE: ['tone'], OPTIMIZE_LAYOUT: ['mode', 'keepTypes', 'keepSizes', 'style'],
};

describe('feedback specification corpus consistency (not LLM accuracy)', () => {
  it('keeps the evidence status explicit and covers interpretation, input and execution independently', () => {
    expect(document.runtimeStatus).toBe('specification-only');
    expect(document.accuracyStatus).toBe('not-evaluated-with-a-real-model');
    expect(new Set(corpus.cases.map(item => item.id)).size).toBe(corpus.cases.length);
    for (const stage of ['interpretation', 'input_guard', 'execution_guard']) {
      expect(corpus.cases.some(item => item.stage === stage)).toBe(true);
    }
    for (const category of ['preservation', 'negation', 'conflict', 'lock', 'direction', 'units',
      'target', 'reference', 'selection', 'colour', 'abstract-goal', 'compound', 'prompt-injection',
      'space-safety', 'state-safety', 'provider-failure']) {
      expect(corpus.cases.some(item => item.category === category), category).toBe(true);
    }
    const examples = corpus.cases.filter(item => item.usage === 'example');
    const evaluation = corpus.cases.filter(item => item.stage === 'interpretation' && item.usage === 'evaluation');
    expect(examples.length).toBeGreaterThan(0);
    expect(evaluation.length).toBeGreaterThan(examples.length);
    expect(evaluation.every(item => !examples.some(example => example.id === item.id))).toBe(true);
  });

  it.each(Object.entries(corpus.fixtures))('uses consistent active IDs, types and spatial facts in %s', (_, fixture) => {
    const active = fixture.furniture.filter(item => item.status !== 'deleted');
    const ids = new Set(active.map(item => item.id));
    expect(new Set(fixture.furniture.map(item => item.id)).size).toBe(fixture.furniture.length);
    for (const item of fixture.furniture) {
      expect(isCanonicalFurnitureType(item.type), item.id).toBe(true);
      expect(Object.values(item.dimensions).every(value => Number.isFinite(value) && value > 0)).toBe(true);
    }
    const references = [...fixture.lockedFurnitureIds, ...fixture.facts.nearWindowFurnitureIds,
      ...fixture.facts.visibleFurnitureOrder, ...Object.values(fixture.facts.largestByFootprint).flat()];
    expect(references.every(id => ids.has(id))).toBe(true);
    for (const [type, largestIds] of Object.entries(fixture.facts.largestByFootprint)) {
      const items = active.filter(item => item.type === type);
      const largestArea = Math.max(...items.map(item => item.dimensions.width * item.dimensions.depth));
      expect(largestIds.every(id => items.some(item => item.id === id
        && item.dimensions.width * item.dimensions.depth === largestArea))).toBe(true);
    }
  });

  it.each(corpus.cases)('has a coherent semantic expectation: $id', item => {
    const fixture = corpus.fixtures[item.fixture];
    expect(fixture, item.fixture).toBeDefined();
    const active = fixture.furniture.filter(furniture => furniture.status !== 'deleted');
    const ids = new Set(active.map(furniture => furniture.id));
    const result = item.expected;
    if (result.decision === null) {
      expect(item.stage).not.toBe('interpretation');
    } else {
      expect(['PLAN', 'CLARIFICATION', 'UNSUPPORTED', 'NO_CHANGE']).toContain(result.decision);
    }
    expect(result.operations.length).toBeLessThanOrEqual(4);
    if (result.decision !== 'PLAN') expect(result.operations).toEqual([]);
    if (result.decision === 'PLAN') expect(result.operations.length).toBeGreaterThan(0);
    if (result.decision === 'CLARIFICATION') {
      expect(result.clarification?.code).toBeTruthy();
      expect(questionCodes.has(result.clarification!.code)).toBe(true);
      expect(result.clarification?.requiredField).toBeTruthy();
    } else expect(result.clarification).toBeNull();
    expect((result.clarification?.candidateIds ?? []).every(id => ids.has(id))).toBe(true);
    expect(result.goals.every(goal => goals.has(goal))).toBe(true);
    for (const preservation of result.preserve) {
      expect(ids.has(preservation.targetId)).toBe(true);
      expect(preservation.fields.length).toBeGreaterThan(0);
      expect(preservation.fields.every(field => fields.has(field))).toBe(true);
    }
    const previous = new Set<string>();
    const suppliedText = `${item.request} ${item.clarificationAnswer?.text ?? ''}`;
    const explicitNumbers = [...suppliedText.matchAll(/(\d+(?:\.\d+)?)\s*(mm|cm|m)\b/g)]
      .map(match => Number(match[1]) * (match[2] === 'm' ? 1000 : match[2] === 'cm' ? 10 : 1));
    for (const op of result.operations) {
      expect(op.type in parameterKeys, op.type).toBe(true);
      expect(previous.has(op.operationId)).toBe(false);
      expect(op.dependsOn.every(id => previous.has(id))).toBe(true);
      previous.add(op.operationId);
      expect(new Set(op.targetIds).size).toBe(op.targetIds.length);
      expect(op.targetIds.every(id => ids.has(id))).toBe(true);
      expect(op.referenceId === null || (ids.has(op.referenceId) && !op.targetIds.includes(op.referenceId))).toBe(true);
      expect(Object.keys(op.parameters).every(key => parameterKeys[op.type].includes(key))).toBe(true);
      if (op.type === 'ADD_FURNITURE') {
        expect(op.targetIds).toEqual([]);
        expect(isCanonicalFurnitureType(op.parameters.furnitureType)).toBe(true);
        expect(op.parameters.quantity).toBe(1);
      } else expect(op.targetIds.length).toBeGreaterThan(0);
      if (['REPLACE_PRODUCT', 'SWAP_FURNITURE'].includes(op.type)) {
        expect(active.find(furniture => furniture.id === op.targetIds[0])?.type).toBe(op.parameters.furnitureType);
        expect(op.parameters.keepPosition).toBe(true);
        expect(op.parameters.keepOrientation).toBe(true);
      }
      if (op.type === 'MOVE') {
        expect(['ROOM', 'REFERENCE', 'SCREEN']).toContain(op.parameters.frame);
        const relative = ['NEXT_TO', 'LEFT_OF', 'RIGHT_OF'].includes(String(op.parameters.relation));
        expect(Boolean(op.referenceId)).toBe(relative);
        if (op.parameters.frame === 'SCREEN') expect(item.screenBasis).toBeDefined();
        if (op.parameters.magnitude !== null) expect(['SMALL', 'MEDIUM', 'LARGE']).toContain(op.parameters.magnitude);
        if (op.parameters.distanceMm !== null) expect(op.parameters.magnitude).toBeNull();
      }
      if (op.type === 'SET_COLOR_TONE') {
        expect(op.parameters.tone === 'auto' || isPreferredColorToneId(op.parameters.tone)).toBe(true);
      }
      for (const key of ['distanceMm', 'widthMm', 'depthMm']) {
        const value = op.parameters[key];
        if (value !== undefined && value !== null) {
          expect(Number.isInteger(value) && Number(value) > 0).toBe(true);
          expect(explicitNumbers).toContain(value);
        }
      }
      if (op.type !== 'OPTIMIZE_LAYOUT') {
        for (const preservation of result.preserve.filter(rule => op.targetIds.includes(rule.targetId))) {
          expect(preservation.fields.some(field => mutations[op.type].includes(field))).toBe(false);
        }
        for (const target of op.targetIds.filter(id => fixture.lockedFurnitureIds.includes(id))) {
          expect(mutations[op.type].some(field => geometryFields.includes(field)), target).toBe(false);
        }
      }
    }
    if (item.stage === 'input_guard') {
      expect(item.expectedEffect?.llmCalls).toBe(0);
      expect(result.decision).toBeNull();
    }
    if (item.stage !== 'interpretation') {
      expect(item.expectedEffect?.originalUnchanged).toBe(true);
      expect(item.expectedEffect?.persisted).toBe(false);
      expect(item.guard?.kind).toBeTruthy();
    }
    if (item.clarificationCaseId) {
      const source = corpus.cases.find(candidate => candidate.id === item.clarificationCaseId)!;
      expect(source?.expected.decision).toBe('CLARIFICATION');
      expect(item.fixture).toBe(source.fixture);
      expect(item.request).toBe(source.request);
      expect(item.clarificationAnswer?.questionId).toBe(`q-${source.id}`);
      expect(item.clarificationAnswer?.requiredField).toBe(source.expected.clarification?.requiredField);
      const candidates = source.expected.clarification!.candidateIds;
      if (candidates.length) {
        expect(candidates.includes(String(item.clarificationAnswer?.value)))
          .toBe(item.expected.reasonCode !== 'INVALID_CLARIFICATION_ANSWER');
      }
    }
  });

  it('makes the out-of-range scenario agree with the current manual correction bounds', () => {
    const scenario = corpus.cases.find(item => item.id === 'resize-outside-range')!;
    const furniture = corpus.fixtures[scenario.fixture].furniture.find(item => item.id === 'desk-a')!;
    expect(furnitureDimensionRangeMm(furniture.resizeBaseDimensions.width)).toEqual({ min: 1020, max: 1380 });
    expect(scenario.guard?.requestedMm).toBeGreaterThan(1380);
    expect(scenario.expectedEffect?.reasonCode).toBe('DIMENSION_OUT_OF_RANGE');
  });
});
