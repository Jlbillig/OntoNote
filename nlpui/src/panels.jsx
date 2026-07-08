// ============================================================================
// panels.jsx  —  OntologyCanvas + DocumentPanel
// ============================================================================

import React, {
  forwardRef, useCallback, useEffect, useImperativeHandle,
  useRef, useState, memo,
} from 'react'
import ReactFlow, {
  Background, Controls, MiniMap,
  MarkerType,
  applyEdgeChanges, applyNodeChanges,
  useReactFlow,
} from 'reactflow'
import 'reactflow/dist/style.css'

import {
  retroTheme, SEAFOAM, uid, tail, getClassColor,
  nodeTypes, edgeTypes,
} from './theme'

// ══════════════════════════════════════════════════════════════════════════════
// ONTOLOGY CANVAS
// ══════════════════════════════════════════════════════════════════════════════

export const OntologyCanvas = forwardRef(function OntologyCanvas({
  nodes, edges,
  onNodesChange, onEdgesChange, onConnect,
  onNodeClick, onEdgeContextMenu,
  setNodes, setEdges,
  mode,
  showToast,
}, ref) {

  const canvasRef = useRef(null)
  const { getViewport, fitView } = useReactFlow()

  const safeVP = useCallback(() => {
    try {
      const vp = getViewport?.()
      if (!vp) return { x: 0, y: 0, zoom: 1 }
      return {
        x:    Number.isFinite(Number(vp.x))    ? Number(vp.x)    : 0,
        y:    Number.isFinite(Number(vp.y))    ? Number(vp.y)    : 0,
        zoom: Number.isFinite(Number(vp.zoom)) && Number(vp.zoom) > 0 ? Number(vp.zoom) : 1,
      }
    } catch { return { x: 0, y: 0, zoom: 1 } }
  }, [getViewport])

  useImperativeHandle(ref, () => ({
    addNodeFromClass: (classItem) => {
      const nodeId = uid('node')
      const vp     = safeVP()
      const pos    = {
        x: (200 - vp.x) / vp.zoom + Math.random() * 80,
        y: (200 - vp.y) / vp.zoom + Math.random() * 80,
      }
      const newNode = {
        id:       nodeId,
        type:     'clickable',
        position: pos,
        data: { label: classItem.label || tail(classItem.uri), uri: classItem.uri, __open: () => {} },
        style: { width: 160, height: 52 },
        selectable: true,
      }
      setNodes(prev => [...prev, newNode])
      return nodeId
    },
    fitView: () => fitView?.({ padding: 0.2 }),
  }))

  return (
    <div ref={canvasRef} style={{
      position: 'relative', flex: 1,
      background: 'linear-gradient(180deg, #f0f4f1 0%, #e8eee9 100%)',
      overflow: 'hidden',
    }}>
      <ReactFlow
        nodes={nodes.filter(n => n.position && Number.isFinite(n.position.x) && Number.isFinite(n.position.y))}
        edges={edges}
        nodeTypes={nodeTypes}
        edgeTypes={edgeTypes}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onConnect={onConnect}
        onNodeClick={onNodeClick}
        onNodeDoubleClick={onNodeClick}
        onEdgeContextMenu={onEdgeContextMenu}
        nodesDraggable={mode === 'build'}
        nodesConnectable={mode === 'build'}
        nodesFocusable={true}
        elementsSelectable={true}
        panOnDrag={true}
        panOnScroll={true}
        zoomOnScroll={true}
        zoomOnPinch={true}
        zoomOnDoubleClick={false}
        selectNodesOnDrag={false}
        minZoom={0.2}
        maxZoom={3}
        defaultViewport={{ x: 0, y: 0, zoom: 1 }}
        defaultEdgeOptions={{
          animated: false,
          style: { stroke: SEAFOAM.edgeStroke, strokeWidth: 2.5 },
          markerEnd: { type: MarkerType.ArrowClosed, color: SEAFOAM.edgeStroke, width: 18, height: 18 },
        }}
        fitView
      >
        <Controls style={{ position: 'absolute', left: '10px', bottom: '10px', zIndex: 600 }} />
        <MiniMap
          style={{ position: 'absolute', right: '10px', bottom: '10px', zIndex: 600, width: 100, height: 68 }}
          nodeColor={() => SEAFOAM.nodeBorder}
          maskColor="rgba(0,0,0,0.1)"
        />
        <Background color={SEAFOAM.borderInner} gap={22} size={1} />
      </ReactFlow>
      {mode === 'annotations' && (
        <div style={{ position: 'absolute', inset: 0, background: 'transparent', pointerEvents: 'none', zIndex: 50 }} />
      )}
      <div style={{
        position: 'absolute', bottom: '8px', left: '50%', transform: 'translateX(-50%)',
        fontSize: '9px', color: '#444', background: 'rgba(240,244,241,0.85)',
        padding: '2px 8px', border: `1px solid ${SEAFOAM.borderInner}`, pointerEvents: 'none',
      }}>
        {nodes.length} nodes · {edges.length} edges{mode === 'annotations' ? ' · read-only' : ''}
      </div>
    </div>
  )
})


// ══════════════════════════════════════════════════════════════════════════════
// DOCUMENT PANEL
// Renders paragraphs with: clickable link badges, highlighted annotations
// (click to edit/delete), overlap-blocked text selection, and ghost
// suggestion pills from NLP pre-annotation.
// ══════════════════════════════════════════════════════════════════════════════

export const DocumentPanel = memo(({
  paragraphs,
  annotations,
  paraLinks,
  suggestions,
  onTextSelected,
  onAnnotationClick,
  onParagraphClick,
  onConfirmSuggestion,
  onDismissSuggestion,
  filename,
}) => {

  const bodyRef = useRef(null)

  const handleMouseUp = useCallback(() => {
    const sel = window.getSelection()
    if (!sel || sel.isCollapsed) return
    const selectedText = sel.toString().trim()
    if (!selectedText || selectedText.length < 1) return

    const range  = sel.getRangeAt(0)
    const paraEl = range.startContainer?.parentElement?.closest('[data-para-id]')
    const paraId = paraEl?.dataset?.paraId
    const para   = paragraphs?.find(p => p.para_id === paraId)
    if (!para) return

    const localOffset = para.text.indexOf(selectedText)
    const startChar    = localOffset >= 0 ? para.char_start + localOffset : para.char_start
    const endChar       = startChar + selectedText.length

    // Overlap detection — only block if the new selection fully contains
    // an existing annotation or is fully contained within one.
    // Partial overlaps (shared words between different phrases) are allowed.
    const overlapping = (annotations || []).find(a => {
      if (a.para_id !== paraId) return false
      const fullyContains   = startChar <= a.start_char && endChar >= a.end_char
      const fullyContainedBy= startChar >= a.start_char && endChar <= a.end_char
      return fullyContains || fullyContainedBy
    })
    if (overlapping) { sel.removeAllRanges(); return }

    onTextSelected?.({ text: selectedText, start_char: startChar, end_char: endChar, page_num: para.page_num, para_id: paraId })
    sel.removeAllRanges()
  }, [paragraphs, annotations, onTextSelected])

  if (!paragraphs || paragraphs.length === 0) {
    return (
      <div style={{
        flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center',
        background: '#fafbfa', color: '#666', fontSize: '13px', flexDirection: 'column', gap: '12px',
      }}>
        <div style={{ fontSize: '32px', opacity: 0.4 }}>[ ]</div>
        <div>Load a document to begin annotating</div>
        <div style={{ fontSize: '11px', opacity: 0.6 }}>Accepts PDF or DOCX</div>
      </div>
    )
  }

  return (
    <div
      ref={bodyRef}
      style={{
        flex: 1, overflowY: 'auto', background: '#fafbfa',
        padding: '10px 14px 10px 36px', position: 'relative',
        userSelect: 'text', WebkitUserSelect: 'text',
      }}
      onMouseUp={handleMouseUp}
    >
      {paragraphs.map((para) => {
        const paraAnnotations = (annotations  || []).filter(a => a.para_id === para.para_id)
        const paraSuggestions = (suggestions  || []).filter(s => s.para_id === para.para_id)
        const hasLinks = (paraLinks || []).some(
          l => l.source_para === para.para_id || l.target_para === para.para_id
        )
        return (
          <div key={para.para_id} data-para-id={para.para_id}
            style={{ position: 'relative', marginBottom: '12px' }}>

            {/* Paragraph badge — clickable, opens link manager */}
            <button
              title={hasLinks ? 'Linked — click to manage' : 'Click to link this paragraph'}
              style={{
                position: 'absolute', left: '-32px', top: '1px',
                fontSize: '8px', fontWeight: 'bold', fontFamily: 'inherit',
                color:      hasLinks ? '#ffffff' : SEAFOAM.accentMid,
                background: hasLinks ? SEAFOAM.accentMid : '#ddf5ee',
                border:     `1px solid ${SEAFOAM.accentMid}`,
                padding: '2px 4px', borderRadius: '1px',
                userSelect: 'none', whiteSpace: 'nowrap', cursor: 'pointer', lineHeight: 1,
              }}
              onMouseDown={(e) => { e.preventDefault(); e.stopPropagation() }}
              onClick={(e) => { e.preventDefault(); e.stopPropagation(); onParagraphClick?.(para) }}
            >
              {'§'}{para.para_index}{hasLinks ? '*' : ''}
            </button>

            <AnnotatedParagraph
              para={para}
              annotations={paraAnnotations}
              suggestions={paraSuggestions}
              onAnnotationClick={onAnnotationClick}
              onConfirmSuggestion={onConfirmSuggestion}
              onDismissSuggestion={onDismissSuggestion}
            />
          </div>
        )
      })}
    </div>
  )
})
DocumentPanel.displayName = 'DocumentPanel'


// ── AnnotatedParagraph ────────────────────────────────────────────────────────
// Renders paragraph text with highlighted annotation spans (click → edit/delete)
// plus ghost suggestion pills below the text (click → confirm/dismiss).

const AnnotatedParagraph = memo(({
  para, annotations, suggestions,
  onAnnotationClick, onConfirmSuggestion, onDismissSuggestion,
}) => {

  const SuggestionRow = () => {
    if (!suggestions || suggestions.length === 0) return null
    return (
      <div style={{ marginTop: '4px' }}>
        {suggestions.map(sug => (
          <div key={sug.id} style={{
            display: 'inline-flex', alignItems: 'center', gap: '4px',
            margin: '0 4px 4px 0', padding: '2px 6px',
            background: '#fffbe6', border: '1px dashed #cc9900',
            borderRadius: '3px', fontSize: '10px',
          }}>
            <span style={{ fontStyle: 'italic', color: '#664400' }}>"{sug.text}"</span>
            <span style={{ fontSize: '8px', background: '#fff0cc', padding: '1px 3px', borderRadius: '2px', color: '#664400' }}>
              ? {sug.class_label}
            </span>
            <button
              style={{ fontSize: '8px', background: '#ddf5ee', border: '1px solid #1a5c3c', padding: '0 5px', cursor: 'pointer', color: '#0d3326', borderRadius: '1px' }}
              onClick={(e) => { e.stopPropagation(); onConfirmSuggestion?.(sug) }}>
              Confirm
            </button>
            <button
              style={{ fontSize: '8px', background: '#ffeeee', border: '1px solid #cc2222', padding: '0 5px', cursor: 'pointer', color: '#660000', borderRadius: '1px' }}
              onClick={(e) => { e.stopPropagation(); onDismissSuggestion?.(sug.id) }}>
              Dismiss
            </button>
          </div>
        ))}
      </div>
    )
  }

  if (!annotations || annotations.length === 0) {
    return (
      <div>
        <p style={{ margin: 0, fontSize: '12px', lineHeight: 1.75, color: '#111' }}>{para.text}</p>
        <SuggestionRow />
      </div>
    )
  }

  const sorted   = [...annotations].sort((a, b) => a.start_char - b.start_char)
  const segments = []
  let cursor = para.char_start

  for (const ann of sorted) {
    const localStart = ann.start_char - para.char_start
    const localEnd   = ann.end_char   - para.char_start
    if (localStart < 0 || localEnd > para.text.length) continue
    if (localStart > cursor - para.char_start) {
      segments.push({ type: 'text', content: para.text.slice(cursor - para.char_start, localStart) })
    }
    segments.push({ type: 'highlight', content: para.text.slice(localStart, localEnd), ann })
    cursor = para.char_start + localEnd
  }
  if (cursor - para.char_start < para.text.length) {
    segments.push({ type: 'text', content: para.text.slice(cursor - para.char_start) })
  }

  return (
    <div>
      <p style={{ margin: 0, fontSize: '12px', lineHeight: 1.75, color: '#111' }}>
        {segments.map((seg, i) => {
          if (seg.type === 'text') return <span key={i}>{seg.content}</span>
          const color = getClassColor(seg.ann.class_uri)
          return (
            <mark
              key={i}
              title={`${seg.ann.class_label || tail(seg.ann.class_uri)} · click to edit or delete`}
              style={{
                background: color.fill, borderBottom: `2px solid ${color.border}`,
                borderRadius: '2px', padding: '0 1px', cursor: 'pointer', color: '#111',
              }}
              onMouseDown={(e) => { e.stopPropagation() }}
              onClick={(e) => {
                e.stopPropagation(); e.preventDefault()
                window.getSelection()?.removeAllRanges()
                onAnnotationClick?.(seg.ann)
              }}
            >
              {seg.content}
            </mark>
          )
        })}
      </p>
      <SuggestionRow />
    </div>
  )
})
AnnotatedParagraph.displayName = 'AnnotatedParagraph'
