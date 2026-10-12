import { generateRecommendations, type RecommendationOptions } from './engine';
import type { RoomLayout } from '../types';
self.onmessage = (event: MessageEvent<{room: RoomLayout; options: RecommendationOptions}>) => {
  try { self.postMessage({result: generateRecommendations(event.data.room,event.data.options)}); }
  catch { self.postMessage({error:'추천 계산에 실패했습니다. 현재 배치는 유지됩니다. 다시 시도해 주세요.'}); }
};
