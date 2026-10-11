import { FiRotateCw } from 'react-icons/fi';
import { useEffect, useRef, useState } from 'react';
import CatalogProductPreview from '../components/furniture/variants/CatalogProductPreview';
import { getProductionFurnitureVariantRenderResources } from '../components/furniture/variants/furnitureVariantRouting';
import type { DemoProduct } from './workspaceDemoState';

const { registry, materialPresets } = getProductionFurnitureVariantRenderResources();

export default function DemoFurnitureCard({ product, disabled, onAdd, onDragStart, onDragEnd }: { product: DemoProduct; disabled: boolean; onAdd: () => void; onDragStart: () => void; onDragEnd: () => void }) {
  const card = useRef<HTMLElement>(null);
  const [visible, setVisible] = useState(false);
  const [rotating, setRotating] = useState(false);
  const gesture = useRef({ x: 0, y: 0, dragged: false });

  useEffect(() => {
    const node = card.current;
    if (!node) return;
    const observer = new IntersectionObserver(([entry]) => setVisible(entry.isIntersecting));
    observer.observe(node);
    return () => observer.disconnect();
  }, []);

  return <article ref={card} className="demo-product" draggable={!disabled && !rotating}
    onDragStart={event => {
      const preview = card.current?.querySelector('canvas');
      if (!preview) { event.preventDefault(); return; }
      // Copy only the transparent model pixels, at CSS size rather than device pixel size.
      const dragImage = document.createElement('canvas');
      dragImage.width = preview.clientWidth;
      dragImage.height = preview.clientHeight;
      const context = dragImage.getContext('2d');
      if (!context) { event.preventDefault(); return; }
      context.drawImage(preview, 0, 0, dragImage.width, dragImage.height);
      event.dataTransfer.setDragImage(dragImage, dragImage.width / 2, dragImage.height / 2);
      gesture.current.dragged = true;
      event.dataTransfer.setData('text/plain', product.productId);
      event.dataTransfer.effectAllowed = 'copy';
      onDragStart();
    }} onDragEnd={onDragEnd}
    onPointerDownCapture={event => { gesture.current = { x: event.clientX, y: event.clientY, dragged: false }; }}
    onPointerMoveCapture={event => {
      if (Math.hypot(event.clientX - gesture.current.x, event.clientY - gesture.current.y) > 6) gesture.current.dragged = true;
    }}
    onClick={() => { if (!disabled && !rotating && !gesture.current.dragged) onAdd(); }}
    onKeyDown={event => {
      if (event.target instanceof HTMLElement && event.target.closest('button')) return;
      if (!disabled && ['Enter', ' '].includes(event.key)) { event.preventDefault(); onAdd(); }
    }}>

    <div className="demo-product-preview">
      {visible ? <CatalogProductPreview variantId={product.variantId} registry={registry} materialPresets={materialPresets} interactive allowOrbit={rotating} transparentBackground label={product.label} /> : <span>3D 미리보기</span>}
    </div>
    <button className="demo-preview-rotate" aria-label={`${product.label} 미리보기 회전 모드`} aria-pressed={rotating} title="미리보기 회전 모드" onClick={event => { event.stopPropagation(); setRotating(value => !value); }}><FiRotateCw /></button>
    <button className="demo-product-info" disabled={disabled} aria-label={`${product.label} 배치 선택`} title="이미지나 상품명을 작업 공간으로 끌어 배치" onClick={event => { event.stopPropagation(); if (!disabled) onAdd(); }}>
      <strong>{product.label}</strong>
      <span>W{Math.round(product.dimensions.width * 1000)} D{Math.round(product.dimensions.depth * 1000)} H{Math.round(product.dimensions.height * 1000)}</span>
    </button>
  </article>;
}
