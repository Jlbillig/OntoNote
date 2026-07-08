// ============================================================================
// theme.js  —  Seafoam dark chrome design system
// Shared by all components. Import from '@/theme'
// ============================================================================

import React, { memo, useCallback } from 'react'
import { Handle, Position, NodeResizer } from 'reactflow'

// ── Color tokens ─────────────────────────────────────────────────────────────

export const SEAFOAM = {
  // Chrome surfaces
  chrome:       '#c0cac4',
  chromeDark:   '#b0beb8',
  chromeMid:    '#ccd4ce',
  chromeLight:  '#d8e0da',

  // Accent — dark seafoam / forest green
  accentDark:   '#0d3326',
  accentMid:    '#1a5c3c',
  accentLight:  '#3d9e76',
  accentText:   '#b8dcc8',   // text on dark accent bars
  accentHover:  '#cce8d8',

  // Borders
  borderOuter:  '#4a6a58',
  borderInner:  '#8aa09a',
  borderLight:  '#dce8e0',

  // Node colors
  nodeBorder:   '#1a5c3c',
  nodeText:     '#0a2018',
  nodeSelected: '#ff6600',
  nodeBg:       '#ffffff',
  nodeSelectedBg: '#fff8e0',

  // Edge / arrow
  edgeStroke:   '#1a5c3c',
  edgeInferred: '#cc4400',

  // Annotation highlight palette (12 distinct, pastels safe on white)
  // Index in this array = color slot assigned to each class
  highlights: [
    { fill: '#c0d8ff', border: '#2255cc' },   // 0  blue
    { fill: '#ffd97a', border: '#997700' },   // 1  amber
    { fill: '#ffcce0', border: '#aa0044' },   // 2  pink
    { fill: '#d4eaff', border: '#336699' },   // 3  sky
    { fill: '#ffe0b2', border: '#cc5500' },   // 4  orange
    { fill: '#e0ccff', border: '#6633aa' },   // 5  lavender
    { fill: '#b8f0d8', border: '#007744' },   // 6  mint
    { fill: '#ffd6d6', border: '#cc2222' },   // 7  red
    { fill: '#fff3b0', border: '#999900' },   // 8  yellow
    { fill: '#cce8ff', border: '#004499' },   // 9  steel
    { fill: '#f5d0e8', border: '#993366' },   // 10 rose
    { fill: '#d0f0e0', border: '#228855' },   // 11 sage
  ],
}

// ── retroTheme object (same API as ONTO-TRON-5000, seafoam palette) ──────────

export const retroTheme = {
  button: {
    background:  `linear-gradient(180deg, #eaf0ec 0%, #d4ddd6 45%, #c4d0c8 50%, #b8c8c0 100%)`,
    border:      '2px solid',
    borderColor: '#e4ece6 #5a7868 #5a7868 #e4ece6',
    padding:     '4px 12px',
    margin:      '2px',
    cursor:      'pointer',
    fontWeight:  600,
    fontFamily:  "Tahoma, 'Segoe UI', Geneva, Verdana, sans-serif",
    fontSize:    '11px',
    color:       '#0a2018',
    userSelect:  'none',
    boxShadow:   'inset -1px -1px 0px rgba(0,0,0,0.2), inset 1px 1px 0px rgba(255,255,255,0.7)',
  },

  dangerButton: {
    background:  'linear-gradient(180deg, #ffdddd 0%, #ffcccc 45%, #ffbbbb 50%, #ffaaaa 100%)',
    border:      '2px solid',
    borderColor: '#ffffff #aa6666 #aa6666 #ffffff',
    padding:     '4px 12px',
    margin:      '2px',
    cursor:      'pointer',
    fontWeight:  600,
    fontFamily:  "Tahoma, 'Segoe UI', Geneva, Verdana, sans-serif",
    fontSize:    '11px',
    color:       '#660000',
    userSelect:  'none',
    boxShadow:   'inset -1px -1px 0px rgba(0,0,0,0.2), inset 1px 1px 0px rgba(255,255,255,0.7)',
  },

  accentButton: {
    background:  `linear-gradient(180deg, #c8eedd 0%, #9ed4bb 100%)`,
    border:      '2px solid',
    borderColor: '#e0fff0 #0d3326 #0d3326 #e0fff0',
    padding:     '4px 12px',
    margin:      '2px',
    cursor:      'pointer',
    fontWeight:  600,
    fontFamily:  "Tahoma, 'Segoe UI', Geneva, Verdana, sans-serif",
    fontSize:    '11px',
    color:       '#0a2018',
    userSelect:  'none',
  },

  modal: {
    position:   'fixed',
    top:        '50%',
    left:       '50%',
    transform:  'translate(-50%, -50%)',
    background: '#c0cac4',
    border:     '2px solid',
    borderColor:'#dce8e0 #4a6a58 #4a6a58 #dce8e0',
    padding:    '2px',
    zIndex:     10000,
    width:      '420px',
    maxWidth:   '90vw',
    boxShadow:  '3px 3px 6px rgba(0,0,0,0.45), inset 1px 1px 0px #dce8e0, inset -1px -1px 0px #6a8a78',
  },

  modalHeader: {
    background:     `linear-gradient(90deg, ${SEAFOAM.accentDark} 0%, ${SEAFOAM.accentMid} 100%)`,
    color:          SEAFOAM.accentText,
    padding:        '3px 7px',
    fontWeight:     'bold',
    fontSize:       '11px',
    fontFamily:     "Tahoma, 'Segoe UI', Geneva, Verdana, sans-serif",
    display:        'flex',
    justifyContent: 'space-between',
    alignItems:     'center',
    userSelect:     'none',
  },

  modalContent: {
    background:   '#c0cac4',
    padding:      '8px',
    border:       '2px solid',
    borderColor:  '#6a8a78 #dce8e0 #dce8e0 #6a8a78',
  },

  input: {
    width:        '100%',
    marginBottom: '6px',
    padding:      '4px',
    border:       '2px solid',
    borderColor:  '#4a6a58 #dce8e0 #dce8e0 #4a6a58',
    fontSize:     '11px',
    fontFamily:   "Tahoma, 'Segoe UI', Geneva, Verdana, sans-serif",
    background:   '#ffffff',
    boxShadow:    'inset 1px 1px 2px rgba(0,0,0,0.15)',
    boxSizing:    'border-box',
  },

  listItem: {
    padding:      '6px 8px',
    borderBottom: '1px solid #8aa09a',
    cursor:       'pointer',
    fontSize:     '11px',
    fontFamily:   "Tahoma, 'Segoe UI', Geneva, Verdana, sans-serif",
  },

  tableHeader: {
    background:  'linear-gradient(180deg, #eaf0ec 0%, #d4ddd6 45%, #c4d0c8 50%, #b8c8c0 100%)',
    border:      '1px solid #7a9a8a',
    padding:     '4px',
    fontWeight:  '600',
    fontSize:    '11px',
    fontFamily:  "Tahoma, 'Segoe UI', Geneva, Verdana, sans-serif",
    textAlign:   'center',
    position:    'sticky',
    top:         0,
    zIndex:      100,
  },

  tableCell: {
    border:     '1px solid #a8c0b0',
    padding:    '3px 6px',
    fontSize:   '11px',
    fontFamily: "Tahoma, 'Segoe UI', Geneva, Verdana, sans-serif",
    background: '#ffffff',
  },
}

// ── Utility functions ─────────────────────────────────────────────────────────

let _counter = 0
export const uid = (prefix = 'id') => {
  const ts  = Date.now().toString(36)
  const rnd = Math.random().toString(36).substring(2, 8)
  return `${prefix}-${++_counter}-${ts}-${rnd}`
}

export const tail = (uri) => {
  if (!uri) return '(unnamed)'
  const parts = String(uri).split(/[#\/]/)
  return parts[parts.length - 1] || '(unnamed)'
}

export const isBFOorCCO = (uri) => {
  if (!uri) return false
  const u = String(uri).toLowerCase()
  return (
    u.includes('/obo/bfo_') ||
    u.includes('commoncoreontologies') ||
    u.includes('/cco/')
  )
}

// ── Well-known property constants ─────────────────────────────────────────────

export const RDF_TYPE = {
  uri:   'http://www.w3.org/1999/02/22-rdf-syntax-ns#type',
  label: 'rdf:type (Instance Of)',
}

export const CCO_IS_ABOUT = {
  uri:   'https://www.commoncoreontologies.org/ont00001808',
  label: 'cco:is_about',
}

export const BFO_PART_OF = {
  uri:   'http://purl.obolibrary.org/obo/BFO_0000176',
  label: 'bfo:continuant_part_of',
}

export const fallbackProperties = [
  RDF_TYPE,
  CCO_IS_ABOUT,
  BFO_PART_OF,
  { uri: 'http://purl.obolibrary.org/obo/BFO_0000051', label: 'bfo:has_part' },
  { uri: 'http://purl.obolibrary.org/obo/BFO_0000050', label: 'bfo:part_of' },
  { uri: 'http://purl.obolibrary.org/obo/RO_0002233',  label: 'ro:has_input' },
  { uri: 'http://purl.obolibrary.org/obo/RO_0002234',  label: 'ro:has_output' },
  { uri: 'https://www.commoncoreontologies.org/ont00001765', label: 'cco:has_text_value' },
  { uri: 'https://www.commoncoreontologies.org/designates',  label: 'cco:designates' },
  { uri: 'https://www.commoncoreontologies.org/has_agent',   label: 'cco:has_agent' },
]

// ── Annotation highlight color assignment ─────────────────────────────────────
// Maps class URI → color slot index. Persists across the session.

const _colorMap = new Map()
let  _nextColor = 0

export const getClassColor = (classUri) => {
  if (!classUri) return SEAFOAM.highlights[0]
  if (!_colorMap.has(classUri)) {
    _colorMap.set(classUri, _nextColor % SEAFOAM.highlights.length)
    _nextColor++
  }
  return SEAFOAM.highlights[_colorMap.get(classUri)]
}

export const resetColorMap = () => {
  _colorMap.clear()
  _nextColor = 0
}

// ── ClickableNode component ───────────────────────────────────────────────────
// Identical interaction model to ONTO-TRON-5000 but with seafoam palette.
// Color swatch in top-left corner reflects annotation highlight color for this class.

export const ClickableNode = memo(({ data, id, selected }) => {
  const handleClick = useCallback((e) => {
    e.stopPropagation()
    e.preventDefault()
    if (typeof data?.__open === 'function') {
      data.__open(e, { id, data })
    }
  }, [data, id])

  const highlightColor = data?.uri ? getClassColor(data.uri) : null

  return (
    <>
      {selected && (
        <NodeResizer
          color={SEAFOAM.nodeSelected}
          isVisible={true}
          minWidth={100}
          minHeight={40}
          onResize={(_, params) => {
            if (typeof data?.__resize === 'function') {
              data.__resize(id, params)
            }
          }}
          handleStyle={{
            width:           10,
            height:          10,
            borderRadius:    2,
            backgroundColor: SEAFOAM.nodeSelected,
            border:          '2px solid white',
          }}
          lineStyle={{
            borderWidth: 2,
            borderColor: SEAFOAM.nodeSelected,
          }}
        />
      )}
      <div
        onMouseDown={handleClick}
        style={{
          border:      selected
            ? `3px solid ${SEAFOAM.nodeSelected}`
            : `2px solid ${SEAFOAM.nodeBorder}`,
          borderRadius: '4px',
          background:  selected ? SEAFOAM.nodeSelectedBg : SEAFOAM.nodeBg,
          width:       '100%',
          height:      '100%',
          display:     'flex',
          alignItems:  'center',
          justifyContent: 'center',
          textAlign:   'center',
          padding:     '8px',
          fontSize:    '11px',
          color:       SEAFOAM.nodeText,
          boxShadow:   selected
            ? `0 0 0 2px rgba(255,102,0,0.3), 2px 2px 5px rgba(0,0,0,0.25)`
            : '2px 2px 4px rgba(0,0,0,0.18)',
          cursor:      'pointer',
          userSelect:  'none',
          position:    'relative',
          pointerEvents: 'all',
        }}
      >
        {/* All 8 handles — same as ONTO-TRON-5000 */}
        {[
          { type: 'target', position: Position.Left,   id: 'left'          },
          { type: 'source', position: Position.Left,   id: 'left-source'   },
          { type: 'target', position: Position.Top,    id: 'top'           },
          { type: 'source', position: Position.Top,    id: 'top-source'    },
          { type: 'target', position: Position.Right,  id: 'right'         },
          { type: 'source', position: Position.Right,  id: 'right-source'  },
          { type: 'target', position: Position.Bottom, id: 'bottom'        },
          { type: 'source', position: Position.Bottom, id: 'bottom-source' },
        ].map(h => (
          <Handle
            key={h.id}
            type={h.type}
            position={h.position}
            id={h.id}
            style={{ width: 7, height: 7, background: SEAFOAM.nodeBorder }}
          />
        ))}

        {/* Annotation color swatch — top-left, shows what highlight color this class uses */}
        {highlightColor && (
          <div style={{
            position:     'absolute',
            top:          '3px',
            left:         '3px',
            width:        '8px',
            height:       '8px',
            borderRadius: '1px',
            background:   highlightColor.fill,
            border:       `1px solid ${highlightColor.border}`,
          }} />
        )}

        <div style={{
          wordWrap:       'break-word',
          overflow:       'hidden',
          width:          '100%',
          height:         '100%',
          display:        'flex',
          flexDirection:  'column',
          alignItems:     'center',
          justifyContent: 'center',
        }}>
          <span>{data.label || tail(data.uri)}</span>
          {data.uri && (
            <span style={{ fontSize: '8px', color: '#4a6a58', fontWeight: 400, marginTop: '2px' }}>
              {tail(data.uri)}
            </span>
          )}
        </div>

        {/* Badges */}
        {data.isCustom && (
          <div style={{
            position:     'absolute',
            top:          '2px',
            right:        '2px',
            background:   '#ffcc00',
            color:        '#000',
            fontSize:     '7px',
            padding:      '1px 3px',
            borderRadius: '2px',
            fontWeight:   'bold',
          }}>
            CUSTOM
          </div>
        )}
        {data.isInferred && (
          <div style={{
            position:     'absolute',
            top:          '2px',
            right:        data.isCustom ? '52px' : '2px',
            background:   '#ff6b6b',
            color:        '#fff',
            fontSize:     '7px',
            padding:      '1px 3px',
            borderRadius: '2px',
            fontWeight:   'bold',
          }}>
            INFERRED
          </div>
        )}
        {data.isAutoGenerated && (
          <div style={{
            position:     'absolute',
            top:          '2px',
            right:        '2px',
            background:   SEAFOAM.accentMid,
            color:        '#fff',
            fontSize:     '7px',
            padding:      '1px 3px',
            borderRadius: '2px',
            fontWeight:   'bold',
          }}>
            AUTO
          </div>
        )}
      </div>
    </>
  )
})
ClickableNode.displayName = 'ClickableNode'

export const nodeTypes = { clickable: ClickableNode }

// ── LabeledEdge component ─────────────────────────────────────────────────────
// Same manual bezier approach as ONTO-TRON-5000 but with seafoam stroke color.

export const LabeledEdge = ({
  id, sourceX, sourceY, targetX, targetY,
  label, markerEnd, style, data,
}) => {
  if (
    !Number.isFinite(sourceX) || !Number.isFinite(sourceY) ||
    !Number.isFinite(targetX) || !Number.isFinite(targetY)
  ) return null

  const isInferred = data?.isInferred
  const strokeColor = isInferred ? SEAFOAM.edgeInferred : SEAFOAM.edgeStroke

  try {
    const path   = `M ${sourceX},${sourceY} C ${sourceX + 50},${sourceY} ${targetX - 50},${targetY} ${targetX},${targetY}`
    const labelX = (sourceX + targetX) / 2
    const labelY = (sourceY + targetY) / 2

    return (
      <>
        <path
          id={id}
          className="react-flow__edge-path"
          d={path}
          style={{
            ...style,
            stroke:          strokeColor,
            strokeWidth:     isInferred ? 2 : 2.5,
            strokeDasharray: isInferred ? '5,4' : 'none',
          }}
          markerEnd={markerEnd}
        />
        {label && (
          <g transform={`translate(${labelX}, ${labelY})`}>
            <rect
              x={-44} y={-12}
              width={88} height={24}
              fill="#ffffff"
              stroke={strokeColor}
              strokeWidth={1.5}
              rx={3}
            />
            <text
              x={0} y={4}
              textAnchor="middle"
              fill={strokeColor}
              fontSize={11}
              fontWeight={700}
              fontFamily="Tahoma, sans-serif"
            >
              {label}
            </text>
          </g>
        )}
      </>
    )
  } catch (err) {
    return null
  }
}

export const edgeTypes = { smoothstep: LabeledEdge }

// ── GlobalStyle component ─────────────────────────────────────────────────────

export const GlobalStyle = () => (
  <style>{`
    .react-flow__attribution { display: none !important; }
    .react-flow__edge, .react-flow__edge-path { transition: none !important; }
    .react-flow__edge-text { pointer-events: all !important; cursor: pointer !important; }
    .react-flow__edge-textbg { pointer-events: all !important; }
    .react-flow__node.selected { outline: none !important; }
    .react-flow__handle { opacity: 0; transition: opacity 0.15s; }
    .react-flow__node:hover .react-flow__handle { opacity: 1; }
  `}</style>
)
