import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import WorkspaceDemo from './WorkspaceDemo';
import { loadManagedFurnitureLayout } from '../config/layoutEditingWorkflow';
import type { RoomLayout } from '../types';

export default function Workspace() {
  const navigate = useNavigate();
  const [room, setRoom] = useState<RoomLayout | null>(null);
  const [error, setError] = useState('');
  const [retry, setRetry] = useState(0);
  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      const raw = localStorage.getItem('roomfit:selectedRoomLayout');
      const backendId = Number(localStorage.getItem('roomfit:backendRoomId'));
      const selected = raw ? JSON.parse(raw) as RoomLayout : null;
      if (!selected || selected.id !== localStorage.getItem('roomfit:selectedRoomId')
        || !Array.isArray(selected.furniture) || !Array.isArray(selected.walls)
        || !Number.isInteger(backendId) || backendId <= 0) {
        if (!cancelled) navigate('/rooms', {replace: true});
        return;
      }
      const restored = await loadManagedFurnitureLayout(selected, backendId);
      const draftRaw = localStorage.getItem(`roomfit:workspaceDraft:${selected.id}`);
      const draft = draftRaw ? JSON.parse(draftRaw) as RoomLayout : null;
      const draftForRoom = draft?.id === selected.id && Array.isArray(draft.furniture) && Array.isArray(draft.walls) ? draft : null;
      if (!cancelled) setRoom(draftForRoom ?? restored ?? selected);
    };
    void load().catch(() => {
      if (!cancelled) setError('선택한 방을 불러오지 못했습니다. 다시 시도해 주세요.');
    });
    return () => { cancelled = true; };
  }, [navigate, retry]);

  async function save(next: RoomLayout) {
    if (localStorage.getItem('roomfit:selectedRoomId') !== next.id) throw new Error('선택한 방이 변경되었습니다. 방을 다시 선택해 주세요.');
    localStorage.setItem(`roomfit:workspaceDraft:${next.id}`, JSON.stringify(next));
    localStorage.setItem('roomfit:selectedRoomLayout', JSON.stringify(next));
    return next;
  }
  if (!room) return <main className="workspace-demo"><header className="demo-header"><a href="/" className="demo-logo">ROOMFIT</a></header><div className="p-8" role={error ? 'alert' : 'status'}>{error || '선택한 공간을 불러오는 중…'}{error && <button className="demo-outline" onClick={() => { setError(''); setRetry(value => value + 1); }}>다시 시도</button>}</div></main>;
  return <WorkspaceDemo service={{
    initialRoom: room,
    onSave: async next => save(next),
    onChooseRoom: async next => { await save(next); navigate('/rooms'); },
  }} />;
}
