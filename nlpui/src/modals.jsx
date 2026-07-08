// ============================================================================
// modals.jsx  —  All modal and panel components
// ============================================================================

import React, { useEffect, useState } from 'react'
import {
  retroTheme, SEAFOAM, uid, tail, isBFOorCCO,
  RDF_TYPE, CCO_IS_ABOUT, fallbackProperties, getClassColor,
} from './theme'

// ── Shared close button ───────────────────────────────────────────────────────

const CloseBtn = ({ onClose }) => (
  <button
    style={{
      background:  '#c0cac4',
      border:      '1px solid',
      borderColor: '#dce8e0 #4a6a58 #4a6a58 #dce8e0',
      padding:     '0 6px',
      fontWeight:  'bold',
      cursor:      'pointer',
      color:       '#0a2018',
      lineHeight:  1.2,
    }}
    onMouseDown={(e) => { e.stopPropagation(); onClose() }}
  >
    X
  </button>
)

// ── Backdrop ──────────────────────────────────────────────────────────────────

const Backdrop = ({ onClose, children, zIndex = 9998 }) => (
  <>
    <div
      style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)', zIndex }}
      onMouseDown={(e) => { if (e.target === e.currentTarget && onClose) onClose() }}
    />
    {children}
  </>
)

// ── Source badge (BFO / CCO / CUSTOM / etc.) ──────────────────────────────────

const SourceBadge = ({ uri }) => {
  const u = String(uri || '').toLowerCase()
  let label = 'CUSTOM'
  let bg    = '#e0e0e0'
  let color = '#333'
  if (u.includes('/obo/bfo_')) { label = 'BFO';    bg = '#ddf5ee'; color = '#0d3326' }
  else if (u.includes('commoncoreontologies') || u.includes('/cco/')) {
    label = 'CCO'; bg = '#d0e8ff'; color = '#003366'
  }
  return (
    <span style={{
      fontSize: '8px', background: bg, color, padding: '1px 4px',
      borderRadius: '2px', marginLeft: '5px', fontWeight: 'bold',
    }}>
      {label}
    </span>
  )
}

// ── Search result list ────────────────────────────────────────────────────────

const SearchResultList = ({ results, selected, onSelect, isSearching, height = 200 }) => (
  <div style={{
    maxHeight:   `${height}px`,
    overflowY:   'auto',
    border:      '2px solid',
    borderColor: '#4a6a58 #dce8e0 #dce8e0 #4a6a58',
    background:  '#ffffff',
    marginBottom:'8px',
  }}>
    {isSearching && (
      <div style={{ padding: '8px', textAlign: 'center', fontSize: '11px' }}>Searching...</div>
    )}
    {!isSearching && results.length === 0 && (
      <div style={{ padding: '8px', textAlign: 'center', fontSize: '11px', opacity: 0.6 }}>
        No results. Type to search.
      </div>
    )}
    {!isSearching && results.map((r) => {
      const isSelected = selected?.uri === r.uri
      return (
        <div
          key={r.uri}
          style={{
            ...retroTheme.listItem,
            background: isSelected ? SEAFOAM.accentMid  : 'transparent',
            color:      isSelected ? '#ffffff'           : 'inherit',
          }}
          title={r.uri}
          onMouseEnter={(e) => {
            if (!isSelected) {
              e.currentTarget.style.background = SEAFOAM.accentLight
              e.currentTarget.style.color      = '#ffffff'
            }
          }}
          onMouseLeave={(e) => {
            if (!isSelected) {
              e.currentTarget.style.background = 'transparent'
              e.currentTarget.style.color      = 'inherit'
            }
          }}
          onMouseDown={(e) => { e.stopPropagation(); onSelect(r) }}
        >
          <strong>{r.label}</strong>
          <SourceBadge uri={r.uri} />
          <div style={{ fontSize: '9px', opacity: 0.75, marginTop: '1px' }}>{r.uri}</div>
        </div>
      )
    })}
  </div>
)

// ══════════════════════════════════════════════════════════════════════════════
// TAG MODAL
// The core new modal. Fires when the user selects text in the document panel.
// ══════════════════════════════════════════════════════════════════════════════

export const TagModal = ({
  show,
  selection,        // { text, start_char, end_char, page_num, para_id }
  nodes,            // canvas nodes — for optional property link
  onConfirm,        // ({ class_uri, class_label, assertion_type, property_uri, property_label }) => void
  onClose,
}) => {
  if (!show || !selection) return null

  const [mode, setMode]               = useState('search')   // 'search' | 'create'
  const [searchTerm, setSearchTerm]   = useState('')
  const [results, setResults]         = useState([])
  const [isSearching, setIsSearching] = useState(false)
  const [pickedClass, setPickedClass] = useState(null)
  const [assertionType, setAssertionType] = useState('abox')
  const [propUri, setPropUri]         = useState('')
  const [propLabel, setPropLabel]     = useState('')

  // Custom class fields (mode === 'create')
  const [customLabel, setCustomLabel] = useState(selection?.text || '')
  const [customUri, setCustomUri]     = useState('')

  // Reset on open
  useEffect(() => {
    if (show) {
      setMode('search')
      setSearchTerm('')
      setResults([])
      setPickedClass(null)
      setAssertionType('abox')
      setPropUri('')
      setPropLabel('')
      setCustomLabel(selection?.text || '')
      setCustomUri('')
    }
  }, [show, selection?.text])

  // Search effect
  useEffect(() => {
    if (mode !== 'search') return
    const timer = setTimeout(async () => {
      if (!searchTerm || searchTerm.trim().length < 2) {
        setResults([])
        setIsSearching(false)
        return
      }
      setIsSearching(true)
      try {
        const res  = await fetch(`/ontology_search?term=${encodeURIComponent(searchTerm)}`)
        const data = await res.json().catch(() => [])
        setResults(Array.isArray(data) ? data : [])
      } catch {
        setResults([])
      } finally {
        setIsSearching(false)
      }
    }, 280)
    return () => clearTimeout(timer)
  }, [searchTerm, mode])

  const handleConfirm = () => {
    if (mode === 'search' && !pickedClass) return
    if (mode === 'create' && !customLabel.trim()) return

    let classUri   = ''
    let classLabel = ''

    if (mode === 'create') {
      const safe = customLabel.trim().toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '')
      classUri   = customUri.trim() || `http://example.org/custom/${safe}`
      classLabel = customLabel.trim()
    } else {
      classUri   = pickedClass.uri
      classLabel = pickedClass.label
    }

    onConfirm({
      class_uri:      classUri,
      class_label:    classLabel,
      assertion_type: assertionType,
      property_uri:   propUri,
      property_label: propLabel,
      is_custom:      mode === 'create',
    })
  }

  const canvasNodes = (nodes || []).filter(n => !n.id.startsWith('anchor-'))

  return (
    <Backdrop onClose={onClose} zIndex={9999}>
      <div style={{ ...retroTheme.modal, width: '440px', zIndex: 10000 }} onMouseDown={e => e.stopPropagation()}>
        <div style={retroTheme.modalHeader}>
          <span>Tag Selection</span>
          <CloseBtn onClose={onClose} />
        </div>
        <div style={retroTheme.modalContent}>

          {/* Selected text display */}
          <div style={{ fontSize: '9px', fontWeight: 'bold', marginBottom: '2px', color: '#0d3326' }}>
            Selected text:
          </div>
          <div style={{
            background: '#fff8dc', border: '2px solid', borderColor: '#4a6a58 #dce8e0 #dce8e0 #4a6a58',
            padding: '4px 8px', fontSize: '11px', marginBottom: '8px', fontStyle: 'italic',
          }}>
            "{selection.text}"
            <span style={{ fontSize: '8px', color: '#666', marginLeft: '8px', fontStyle: 'normal' }}>
              {selection.para_id ? selection.para_id.replace('_', ' ') : ''} · chars {selection.start_char}–{selection.end_char}
            </span>
          </div>

          {/* Mode toggle */}
          <div style={{ display: 'flex', gap: '4px', marginBottom: '8px' }}>
            <button
              style={{
                ...retroTheme.button,
                flex: 1,
                background: mode === 'search'
                  ? `linear-gradient(180deg, ${SEAFOAM.accentLight}44 0%, ${SEAFOAM.accentLight}22 100%)`
                  : retroTheme.button.background,
                borderColor: mode === 'search' ? `#dce8e0 ${SEAFOAM.accentMid} ${SEAFOAM.accentMid} #dce8e0` : retroTheme.button.borderColor,
                color: mode === 'search' ? SEAFOAM.accentDark : '#0a2018',
              }}
              onMouseDown={(e) => { e.stopPropagation(); setMode('search'); setPickedClass(null) }}
            >
              Search ontology term
            </button>
            <button
              style={{
                ...retroTheme.button,
                flex: 1,
                background: mode === 'create'
                  ? `linear-gradient(180deg, ${SEAFOAM.accentLight}44 0%, ${SEAFOAM.accentLight}22 100%)`
                  : retroTheme.button.background,
                borderColor: mode === 'create' ? `#dce8e0 ${SEAFOAM.accentMid} ${SEAFOAM.accentMid} #dce8e0` : retroTheme.button.borderColor,
                color: mode === 'create' ? SEAFOAM.accentDark : '#0a2018',
              }}
              onMouseDown={(e) => { e.stopPropagation(); setMode('create'); setPickedClass(null) }}
            >
              Create new class
            </button>
          </div>

          {/* Search mode */}
          {mode === 'search' && (
            <>
              <input
                style={retroTheme.input}
                placeholder="Search ontology terms..."
                value={searchTerm}
                onChange={e => setSearchTerm(e.target.value)}
                onMouseDown={e => e.stopPropagation()}
                autoFocus
              />
              <SearchResultList
                results={results}
                selected={pickedClass}
                onSelect={setPickedClass}
                isSearching={isSearching}
                height={160}
              />
            </>
          )}

          {/* Create mode */}
          {mode === 'create' && (
            <>
              <label style={{ display: 'block', fontSize: '9px', fontWeight: 'bold', marginBottom: '2px' }}>
                Class label (required):
              </label>
              <input
                style={retroTheme.input}
                placeholder="e.g. Digital Economic Unit"
                value={customLabel}
                onChange={e => setCustomLabel(e.target.value)}
                onMouseDown={e => e.stopPropagation()}
                autoFocus
              />
              <label style={{ display: 'block', fontSize: '9px', fontWeight: 'bold', marginBottom: '2px' }}>
                Custom URI (optional — auto-generated if blank):
              </label>
              <input
                style={retroTheme.input}
                placeholder="http://example.org/custom/my_class"
                value={customUri}
                onChange={e => setCustomUri(e.target.value)}
                onMouseDown={e => e.stopPropagation()}
              />
            </>
          )}

          {/* Assertion type */}
          <div style={{ fontSize: '9px', fontWeight: 'bold', marginBottom: '4px', color: '#0d3326' }}>
            Assertion type:
          </div>
          <div style={{ display: 'flex', gap: '4px', marginBottom: '8px' }}>
            {[
              { key: 'abox', label: 'Instance of class (ABox)' },
              { key: 'tbox', label: 'Defines / exemplifies class (TBox)' },
            ].map(opt => (
              <button
                key={opt.key}
                style={{
                  ...retroTheme.button,
                  flex: 1,
                  fontSize: '10px',
                  background: assertionType === opt.key
                    ? `linear-gradient(180deg, ${SEAFOAM.accentLight}44 0%, ${SEAFOAM.accentLight}22 100%)`
                    : retroTheme.button.background,
                  color: assertionType === opt.key ? SEAFOAM.accentDark : '#0a2018',
                }}
                onMouseDown={(e) => { e.stopPropagation(); setAssertionType(opt.key) }}
              >
                {opt.label}
              </button>
            ))}
          </div>

          {/* Optional: link to canvas entity */}
          {canvasNodes.length > 0 && (
            <>
              <div style={{ fontSize: '9px', fontWeight: 'bold', marginBottom: '4px', color: '#0d3326' }}>
                Link to canvas entity (optional):
              </div>
              <select
                style={{ ...retroTheme.input, marginBottom: '8px' }}
                value={propUri + '|' + (canvasNodes.find(n => n.data?.uri === propUri.split('|')[1])?.id || '')}
                onChange={e => {
                  const [pUri, nodeUri] = e.target.value.split('|')
                  setPropUri(nodeUri || '')
                  setPropLabel(pUri || '')
                }}
                onMouseDown={e => e.stopPropagation()}
              >
                <option value="|">— none —</option>
                {canvasNodes.map(n => (
                  <option key={n.id} value={`cco:is_about|${n.data?.uri || ''}`}>
                    is_about → {n.data?.label || tail(n.data?.uri)}
                  </option>
                ))}
              </select>
            </>
          )}

          {/* Confirm / Cancel */}
          <div style={{ display: 'flex', gap: '6px' }}>
            <button
              style={{ ...retroTheme.accentButton, flex: 1 }}
              onMouseDown={(e) => { e.stopPropagation(); handleConfirm() }}
              disabled={(mode === 'search' && !pickedClass) || (mode === 'create' && !customLabel.trim())}
            >
              Confirm Tag
            </button>
            <button
              style={{ ...retroTheme.button, flex: 1 }}
              onMouseDown={(e) => { e.stopPropagation(); onClose() }}
            >
              Cancel
            </button>
          </div>

        </div>
      </div>
    </Backdrop>
  )
}

// ══════════════════════════════════════════════════════════════════════════════
// CUSTOM CLASS MODAL
// Same flow as ONTO-TRON-5000 CustomClassModal, seafoam palette.
// ══════════════════════════════════════════════════════════════════════════════

export const CustomClassModal = ({
  show, onConfirm, onClose,
}) => {
  if (!show) return null

  const [label,       setLabel]       = useState('')
  const [def,         setDef]         = useState('')
  const [parentSearch,setParentSearch]= useState('')
  const [parentResults,setParentResults] = useState([])
  const [parentSearching, setParentSearching] = useState(false)
  const [parentPicked,setParentPicked]= useState(null)

  useEffect(() => {
    if (show) { setLabel(''); setDef(''); setParentSearch(''); setParentPicked(null); setParentResults([]) }
  }, [show])

  useEffect(() => {
    const t = setTimeout(async () => {
      if (parentSearch.trim().length < 2) { setParentResults([]); return }
      setParentSearching(true)
      try {
        const res  = await fetch(`/ontology_search?term=${encodeURIComponent(parentSearch)}`)
        const data = await res.json().catch(() => [])
        setParentResults(Array.isArray(data) ? data : [])
      } catch { setParentResults([]) }
      finally { setParentSearching(false) }
    }, 280)
    return () => clearTimeout(t)
  }, [parentSearch])

  const handleConfirm = () => {
    if (!label.trim()) return
    const safe    = label.trim().toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '')
    const uri     = `http://example.org/custom/${safe}`
    onConfirm({ uri, label: label.trim(), definition: def, parent: parentPicked, isCustom: true })
  }

  return (
    <Backdrop onClose={onClose} zIndex={9999}>
      <div style={{ ...retroTheme.modal, zIndex: 10000 }} onMouseDown={e => e.stopPropagation()}>
        <div style={retroTheme.modalHeader}>
          <span>Create Custom Class</span>
          <CloseBtn onClose={onClose} />
        </div>
        <div style={retroTheme.modalContent}>
          <label style={{ display: 'block', marginBottom: '3px', fontSize: '10px', fontWeight: 'bold' }}>Class label (required):</label>
          <input style={retroTheme.input} placeholder="e.g. Manufacturing Process" value={label}
            onChange={e => setLabel(e.target.value)} onMouseDown={e => e.stopPropagation()} autoFocus />

          <label style={{ display: 'block', marginBottom: '3px', fontSize: '10px', fontWeight: 'bold' }}>Definition (optional):</label>
          <textarea style={{ ...retroTheme.input, height: '64px', resize: 'vertical' }}
            placeholder="A process that..." value={def}
            onChange={e => setDef(e.target.value)} onMouseDown={e => e.stopPropagation()} />

          <label style={{ display: 'block', marginBottom: '3px', fontSize: '10px', fontWeight: 'bold' }}>Parent class (optional):</label>
          <input style={retroTheme.input} placeholder="Search for parent..." value={parentSearch}
            onChange={e => setParentSearch(e.target.value)} onMouseDown={e => e.stopPropagation()} />

          <SearchResultList results={parentResults} selected={parentPicked}
            onSelect={setParentPicked} isSearching={parentSearching} height={100} />

          {parentPicked && (
            <div style={{ padding: '3px 6px', background: '#ddf5ee', border: `1px solid ${SEAFOAM.accentMid}`, fontSize: '10px', marginBottom: '6px' }}>
              Parent: <strong>{parentPicked.label}</strong>
            </div>
          )}

          <div style={{ display: 'flex', gap: '6px' }}>
            <button style={{ ...retroTheme.accentButton, flex: 1 }}
              onMouseDown={(e) => { e.stopPropagation(); handleConfirm() }}>
              Create Class
            </button>
            <button style={{ ...retroTheme.button, flex: 1 }}
              onMouseDown={(e) => { e.stopPropagation(); onClose() }}>
              Cancel
            </button>
          </div>
        </div>
      </div>
    </Backdrop>
  )
}

// ══════════════════════════════════════════════════════════════════════════════
// PROPERTY MODAL
// Assign a property between two canvas nodes. Ported from ONTO-TRON-5000.
// ══════════════════════════════════════════════════════════════════════════════

export const PropertyModal = ({
  show, mode, sourceNode, targetNodeId, nodes,
  propertyResults, dataPropertyResults,
  edgeBeingEdited,
  onConfirm, onClose,
}) => {
  if (!show) return null

  const [tab,        setTab]        = useState('objectProperties')
  const [searchTerm, setSearchTerm] = useState('')
  const [chosen,     setChosen]     = useState(null)
  const [targetId,   setTargetId]   = useState(targetNodeId || '')
  const [filtered,   setFiltered]   = useState([])
  const [filterInfo, setFilterInfo] = useState({ shown: 0, total: 0 })

  useEffect(() => {
    setSearchTerm(''); setChosen(null); setTargetId(targetNodeId || ''); setTab('objectProperties')
  }, [show, targetNodeId])

  useEffect(() => {
    const t = setTimeout(() => {
      const src  = tab === 'dataProperties'
        ? (Array.isArray(dataPropertyResults) ? dataPropertyResults : [])
        : (Array.isArray(propertyResults)     ? propertyResults     : fallbackProperties)

      const base = tab === 'dataProperties'
        ? src.filter(p => p?.uri)
        : [RDF_TYPE, CCO_IS_ABOUT, ...src.filter(p => p?.uri && p.uri !== RDF_TYPE.uri && p.uri !== CCO_IS_ABOUT.uri)]

      const seen    = new Set()
      const deduped = []
      for (const p of base) {
        if (!p?.uri || seen.has(p.uri)) continue
        seen.add(p.uri)
        deduped.push({ uri: String(p.uri), label: String(p.label ?? tail(p.uri)) })
      }

      const term = (searchTerm || '').trim().toLowerCase()
      const f    = term ? deduped.filter(p =>
        p.label.toLowerCase().includes(term) || p.uri.toLowerCase().includes(term)
      ) : deduped

      const limited = f.slice(0, 300)
      setFiltered(limited)
      setFilterInfo({ shown: limited.length, total: f.length })
    }, 100)
    return () => clearTimeout(t)
  }, [propertyResults, dataPropertyResults, searchTerm, tab])

  const canvasNodes = (nodes || []).filter(n => !n.id.startsWith('anchor-') && n.id !== sourceNode?.id)

  return (
    <Backdrop onClose={onClose} zIndex={9999}>
      <div style={{ ...retroTheme.modal, zIndex: 10000 }} onMouseDown={e => e.stopPropagation()}>
        <div style={retroTheme.modalHeader}>
          <span>Select Property</span>
          <CloseBtn onClose={onClose} />
        </div>
        <div style={retroTheme.modalContent}>

          {/* Tabs */}
          <div style={{ display: 'flex', gap: '3px', marginBottom: '6px', borderBottom: `2px solid ${SEAFOAM.borderInner}` }}>
            {['objectProperties', 'dataProperties'].map(t => (
              <button key={t} style={{
                ...retroTheme.button, flex: 1,
                background: tab === t ? `#f0f5f2` : retroTheme.button.background,
                color: tab === t ? SEAFOAM.accentDark : '#0a2018',
                fontWeight: tab === t ? 'bold' : 600,
              }}
                onMouseDown={(e) => { e.stopPropagation(); setTab(t) }}>
                {t === 'objectProperties' ? 'Object Properties' : 'Data Properties'}
              </button>
            ))}
          </div>

          <input style={retroTheme.input} placeholder="Search properties..."
            value={searchTerm} onChange={e => setSearchTerm(e.target.value)}
            onMouseDown={e => e.stopPropagation()} autoFocus />

          {filterInfo.total > 0 && (
            <div style={{ fontSize: '9px', opacity: 0.65, marginBottom: '4px' }}>
              Showing {filterInfo.shown} of {filterInfo.total}
            </div>
          )}

          <div style={{
            maxHeight: '200px', overflowY: 'auto',
            border: '2px solid', borderColor: `${SEAFOAM.borderOuter} #dce8e0 #dce8e0 ${SEAFOAM.borderOuter}`,
            background: '#ffffff', marginBottom: '8px',
          }}>
            {filtered.map(prop => (
              <div key={prop.uri}
                style={{
                  ...retroTheme.listItem,
                  background: chosen?.uri === prop.uri ? SEAFOAM.accentMid : 'transparent',
                  color:      chosen?.uri === prop.uri ? '#ffffff' : 'inherit',
                }}
                title={prop.uri}
                onMouseDown={(e) => { e.stopPropagation(); setChosen(prop) }}>
                <strong>{prop.label}</strong>
                <div style={{ fontSize: '9px', opacity: 0.75 }}>{prop.uri}</div>
              </div>
            ))}
            {filtered.length === 0 && (
              <div style={{ padding: '8px', textAlign: 'center', fontSize: '11px', opacity: 0.6 }}>
                No properties found.
              </div>
            )}
          </div>

          {/* Target node selector for connectExisting mode */}
          {mode === 'connectExisting' && (
            <>
              <label style={{ display: 'block', fontSize: '10px', fontWeight: 'bold', marginBottom: '3px' }}>
                Target node:
              </label>
              <select style={{ ...retroTheme.input }}
                value={targetId} onChange={e => setTargetId(e.target.value)}
                onMouseDown={e => e.stopPropagation()}>
                <option value="">— Select target node —</option>
                {canvasNodes.map(n => (
                  <option key={n.id} value={n.id}>{n.data?.label || tail(n.data?.uri)}</option>
                ))}
              </select>
            </>
          )}

          <div style={{ display: 'flex', gap: '6px' }}>
            <button style={{ ...retroTheme.accentButton, flex: 1 }}
              onMouseDown={(e) => {
                e.stopPropagation()
                onConfirm({ property: chosen || RDF_TYPE, targetNodeId: targetId })
              }}>
              Confirm
            </button>
            <button style={{ ...retroTheme.button, flex: 1 }}
              onMouseDown={(e) => { e.stopPropagation(); onClose() }}>
              Cancel
            </button>
          </div>
        </div>
      </div>
    </Backdrop>
  )
}

// ══════════════════════════════════════════════════════════════════════════════
// NODE OPTIONS MODAL  (3x2 grid — same pattern as ONTO-TRON-5000)
// ══════════════════════════════════════════════════════════════════════════════

export const NodeOptionsModal = ({
  show, selectedNode, onClose,
  onAddLinkedNode, onConnectExisting, onDeleteNode,
  onEditLabel, onCustomClass, onSelectExisting,
}) => {
  if (!show || !selectedNode) return null

  const actions = [
    { icon: '+', label: 'Add Linked Node',  danger: false, fn: onAddLinkedNode  },
    { icon: 'L', label: 'Connect to Node',  danger: false, fn: onConnectExisting },
    { icon: 'D', label: 'Delete Node',      danger: true,  fn: onDeleteNode      },
    { icon: 'E', label: 'Edit Label',       danger: false, fn: onEditLabel       },
    { icon: 'C', label: 'Custom Class',     danger: false, fn: onCustomClass     },
    { icon: 'S', label: 'Select Existing',  danger: false, fn: onSelectExisting  },
  ]

  return (
    <Backdrop onClose={onClose} zIndex={9999}>
      <div style={{ ...retroTheme.modal, width: '420px', zIndex: 10000 }} onMouseDown={e => e.stopPropagation()}>
        <div style={retroTheme.modalHeader}>
          <span>Node: {selectedNode.data?.label || selectedNode.id}</span>
          <CloseBtn onClose={onClose} />
        </div>
        <div style={retroTheme.modalContent}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '8px' }}>
            {actions.map(a => (
              <button
                key={a.label}
                style={{
                  ...(a.danger ? retroTheme.dangerButton : retroTheme.button),
                  height:         '58px',
                  display:        'flex',
                  flexDirection:  'column',
                  alignItems:     'center',
                  justifyContent: 'center',
                  fontSize:       '10px',
                  gap:            '4px',
                }}
                onClick={(e) => { e.stopPropagation(); onClose(); a.fn?.() }}>
                <span style={{ fontSize: '18px', fontFamily: 'monospace' }}>{a.icon}</span>
                <span>{a.label}</span>
              </button>
            ))}
          </div>
        </div>
      </div>
    </Backdrop>
  )
}

// ══════════════════════════════════════════════════════════════════════════════
// ONTOLOGY FRAMEWORK MODAL
// ══════════════════════════════════════════════════════════════════════════════

export const OntologyFrameworkModal = ({
  show, activeFramework, builtInFrameworks, userOntologies,
  onSelectFramework, onUpload, onClose,
}) => {
  if (!show) return null

  const [uploadLabel, setUploadLabel] = useState('')
  const [uploadRole,  setUploadRole]  = useState('domain')
  const [uploading,   setUploading]   = useState(false)

  const handleUpload = async (e) => {
    const file = e.target.files?.[0]
    if (!file) return
    setUploading(true)
    const fd = new FormData()
    fd.append('file',  file)
    fd.append('label', uploadLabel || file.name)
    fd.append('role',  uploadRole)
    try {
      const res  = await fetch('/framework/upload', { method: 'POST', body: fd })
      const data = await res.json()
      if (data.success) onUpload?.(data)
    } catch (err) {
      console.error('Upload failed:', err)
    } finally {
      setUploading(false)
    }
  }

  return (
    <Backdrop onClose={onClose} zIndex={9999}>
      <div style={{ ...retroTheme.modal, width: '480px', zIndex: 10000 }} onMouseDown={e => e.stopPropagation()}>
        <div style={retroTheme.modalHeader}>
          <span>Ontology Framework</span>
          <CloseBtn onClose={onClose} />
        </div>
        <div style={retroTheme.modalContent}>

          <div style={{ fontSize: '10px', fontWeight: 'bold', marginBottom: '4px', color: '#0d3326' }}>
            Built-in frameworks:
          </div>
          {(builtInFrameworks || []).map(f => (
            <div
              key={f.id}
              style={{
                ...retroTheme.listItem,
                display:        'flex',
                justifyContent: 'space-between',
                alignItems:     'center',
                background:     activeFramework === f.id ? '#ddf5ee' : 'transparent',
                border:         activeFramework === f.id ? `1px solid ${SEAFOAM.accentMid}` : 'none',
                marginBottom:   '2px',
              }}
              onMouseDown={(e) => { e.stopPropagation(); onSelectFramework(f.id) }}>
              <div>
                <strong>{f.label}</strong>
                <div style={{ fontSize: '9px', color: '#555' }}>{f.triples.toLocaleString()} triples</div>
              </div>
              {activeFramework === f.id && (
                <span style={{ fontSize: '9px', background: SEAFOAM.accentMid, color: '#fff', padding: '1px 5px', borderRadius: '2px' }}>
                  ACTIVE
                </span>
              )}
            </div>
          ))}

          {(userOntologies || []).length > 0 && (
            <>
              <div style={{ fontSize: '10px', fontWeight: 'bold', margin: '8px 0 4px', color: '#0d3326' }}>
                Uploaded ontologies:
              </div>
              {userOntologies.map(u => (
                <div key={u.id} style={{
                  ...retroTheme.listItem,
                  display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                  background: activeFramework === u.id ? '#ddf5ee' : 'transparent',
                }}
                  onMouseDown={(e) => { e.stopPropagation(); onSelectFramework(u.id) }}>
                  <div>
                    <strong>{u.label}</strong>
                    <span style={{ fontSize: '8px', marginLeft: '5px', background: '#e8e8ff', padding: '1px 3px', borderRadius: '2px' }}>{u.role}</span>
                    <div style={{ fontSize: '9px', color: '#555' }}>{u.triples?.toLocaleString()} triples</div>
                  </div>
                  {activeFramework === u.id && (
                    <span style={{ fontSize: '9px', background: SEAFOAM.accentMid, color: '#fff', padding: '1px 5px', borderRadius: '2px' }}>ACTIVE</span>
                  )}
                </div>
              ))}
            </>
          )}

          <div style={{ borderTop: `1px solid ${SEAFOAM.borderInner}`, marginTop: '10px', paddingTop: '10px' }}>
            <div style={{ fontSize: '10px', fontWeight: 'bold', marginBottom: '4px', color: '#0d3326' }}>
              Upload your own ontology (.ttl / .owl / .rdf):
            </div>
            <input style={retroTheme.input} placeholder="Display name" value={uploadLabel}
              onChange={e => setUploadLabel(e.target.value)} onMouseDown={e => e.stopPropagation()} />
            <select style={{ ...retroTheme.input }} value={uploadRole}
              onChange={e => setUploadRole(e.target.value)} onMouseDown={e => e.stopPropagation()}>
              <option value="top_level">Top-level ontology</option>
              <option value="mid_level">Mid-level ontology</option>
              <option value="domain">Domain ontology</option>
            </select>
            <label style={{ ...retroTheme.accentButton, display: 'inline-block', cursor: 'pointer' }}>
              {uploading ? 'Uploading...' : 'Choose file and upload'}
              <input type="file" accept=".ttl,.owl,.rdf" style={{ display: 'none' }}
                onChange={handleUpload} disabled={uploading} />
            </label>
          </div>

          <div style={{ marginTop: '10px' }}>
            <div style={{ fontSize: '9px', color: '#666', background: '#f0f5f2', padding: '5px 8px', border: `1px solid ${SEAFOAM.borderInner}` }}>
              No framework is required. You can build entirely with custom classes.
            </div>
          </div>

          <button style={{ ...retroTheme.button, width: '100%', marginTop: '8px' }}
            onMouseDown={(e) => { e.stopPropagation(); onClose() }}>
            Close
          </button>
        </div>
      </div>
    </Backdrop>
  )
}

// ══════════════════════════════════════════════════════════════════════════════
// CONNECT PARAGRAPHS MODAL
// ══════════════════════════════════════════════════════════════════════════════

export const ConnectParagraphsModal = ({
  show, paragraphs, paraLinks,
  onConnect, onDisconnect, onClose,
}) => {
  if (!show) return null

  const [srcPara, setSrcPara] = useState('')
  const [tgtPara, setTgtPara] = useState('')

  return (
    <Backdrop onClose={onClose} zIndex={9999}>
      <div style={{ ...retroTheme.modal, width: '440px', zIndex: 10000 }} onMouseDown={e => e.stopPropagation()}>
        <div style={retroTheme.modalHeader}>
          <span>Connect Paragraphs</span>
          <CloseBtn onClose={onClose} />
        </div>
        <div style={retroTheme.modalContent}>
          <div style={{ fontSize: '10px', color: '#333', marginBottom: '8px', background: '#f0f5f2', padding: '5px 8px', border: `1px solid ${SEAFOAM.borderInner}` }}>
            Paragraph links are emitted as triples in the TriG default graph, connecting two paragraph IBE individuals.
          </div>

          <label style={{ display: 'block', fontSize: '10px', fontWeight: 'bold', marginBottom: '3px' }}>From paragraph:</label>
          <select style={{ ...retroTheme.input }} value={srcPara}
            onChange={e => setSrcPara(e.target.value)} onMouseDown={e => e.stopPropagation()}>
            <option value="">— Select —</option>
            {(paragraphs || []).map(p => (
              <option key={p.para_id} value={p.para_id}>
                {p.para_id.replace('_', ' ')} — {p.text?.substring(0, 60)}...
              </option>
            ))}
          </select>

          <label style={{ display: 'block', fontSize: '10px', fontWeight: 'bold', marginBottom: '3px' }}>To paragraph:</label>
          <select style={{ ...retroTheme.input }} value={tgtPara}
            onChange={e => setTgtPara(e.target.value)} onMouseDown={e => e.stopPropagation()}>
            <option value="">— Select —</option>
            {(paragraphs || []).filter(p => p.para_id !== srcPara).map(p => (
              <option key={p.para_id} value={p.para_id}>
                {p.para_id.replace('_', ' ')} — {p.text?.substring(0, 60)}...
              </option>
            ))}
          </select>

          <button
            style={{ ...retroTheme.accentButton, width: '100%', marginBottom: '10px' }}
            disabled={!srcPara || !tgtPara}
            onMouseDown={(e) => { e.stopPropagation(); if (srcPara && tgtPara) onConnect(srcPara, tgtPara) }}>
            Link paragraphs
          </button>

          {(paraLinks || []).length > 0 && (
            <>
              <div style={{ fontSize: '10px', fontWeight: 'bold', marginBottom: '4px', color: '#0d3326' }}>
                Existing links:
              </div>
              {paraLinks.map((link, i) => (
                <div key={i} style={{
                  display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                  padding: '4px 6px', background: '#f0f5f2', border: `1px solid ${SEAFOAM.borderInner}`,
                  marginBottom: '3px', fontSize: '10px',
                }}>
                  <span>{link.source_para.replace('_', ' ')} ↔ {link.target_para.replace('_', ' ')}</span>
                  <button style={{ ...retroTheme.dangerButton, padding: '1px 6px', fontSize: '9px' }}
                    onMouseDown={(e) => { e.stopPropagation(); onDisconnect(i) }}>
                    Remove
                  </button>
                </div>
              ))}
            </>
          )}

          <button style={{ ...retroTheme.button, width: '100%', marginTop: '6px' }}
            onMouseDown={(e) => { e.stopPropagation(); onClose() }}>
            Close
          </button>
        </div>
      </div>
    </Backdrop>
  )
}

// ══════════════════════════════════════════════════════════════════════════════
// EXPORT MODAL
// ══════════════════════════════════════════════════════════════════════════════

export const ExportModal = ({
  show, docId, filename, nodes, edges, annotations, paraLinks, paragraphs,
  onClose,
}) => {
  if (!show) return null

  const [exporting, setExporting] = useState(false)
  const [preview,   setPreview]   = useState('')
  const [format,    setFormat]    = useState('trig')

  const doExport = async () => {
    setExporting(true)
    const endpoint = format === 'nif' ? '/export_nif'
                   : format === 'ttl' ? '/export_ttl'
                   : '/export_trig'

    const payload = format === 'ttl'
      ? { nodes, edges }
      : { doc_id: docId, filename, nodes, edges, annotations, para_links: paraLinks }

    try {
      const res  = await fetch(endpoint, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify(payload),
      })
      const text = await res.text()
      const blob = new Blob([text], { type: 'text/plain' })
      const url  = URL.createObjectURL(blob)
      const a    = document.createElement('a')
      a.href     = url
      a.download = format === 'trig' ? `${docId}_annotations.trig`
                 : format === 'nif'  ? `${docId}_nif.ttl`
                 : 'ontology.ttl'
      a.click()
      URL.revokeObjectURL(url)
      setPreview(text.substring(0, 800) + (text.length > 800 ? '\n...' : ''))
    } catch (err) {
      setPreview(`Export failed: ${err.message}`)
    } finally {
      setExporting(false)
    }
  }

  return (
    <Backdrop onClose={onClose} zIndex={9999}>
      <div style={{ ...retroTheme.modal, width: '520px', zIndex: 10000 }} onMouseDown={e => e.stopPropagation()}>
        <div style={retroTheme.modalHeader}>
          <span>Export</span>
          <CloseBtn onClose={onClose} />
        </div>
        <div style={retroTheme.modalContent}>

          <div style={{ display: 'flex', gap: '4px', marginBottom: '8px' }}>
            {[
              { id: 'trig', label: 'TriG (full annotations)' },
              { id: 'nif',  label: 'NIF (Turtle)' },
              { id: 'ttl',  label: 'TTL (ontology only)' },
            ].map(f => (
              <button key={f.id} style={{
                ...retroTheme.button, flex: 1,
                background: format === f.id ? '#f0f5f2' : retroTheme.button.background,
                color: format === f.id ? SEAFOAM.accentDark : '#0a2018',
                fontWeight: format === f.id ? 'bold' : 600,
              }}
                onMouseDown={(e) => { e.stopPropagation(); setFormat(f.id); setPreview('') }}>
                {f.label}
              </button>
            ))}
          </div>

          <div style={{ fontSize: '10px', background: '#f0f5f2', padding: '5px 8px', border: `1px solid ${SEAFOAM.borderInner}`, marginBottom: '8px' }}>
            {format === 'trig' && 'TriG format: named graph per paragraph, IBE + ICE individuals, has_text_value on every span, paragraph links in default graph.'}
            {format === 'nif'  && 'NIF format: W3C-standard text annotation. Each span as nif:RFC5147String with character offsets and itsrdf:taClassRef.'}
            {format === 'ttl'  && 'Turtle format: ontology TBox only. Canvas nodes as owl:Class, edges as object property assertions. No annotation data.'}
          </div>

          <div style={{ fontSize: '10px', color: '#444', marginBottom: '8px' }}>
            {annotations?.length || 0} annotations · {nodes?.length || 0} classes · {edges?.length || 0} properties · {paragraphs?.length || 0} paragraphs
          </div>

          <button
            style={{ ...retroTheme.accentButton, width: '100%', marginBottom: '8px' }}
            disabled={exporting}
            onMouseDown={(e) => { e.stopPropagation(); doExport() }}>
            {exporting ? 'Exporting...' : `Download ${format.toUpperCase()}`}
          </button>

          {preview && (
            <>
              <div style={{ fontSize: '9px', fontWeight: 'bold', marginBottom: '3px', color: '#0d3326' }}>Preview:</div>
              <textarea readOnly value={preview} style={{
                width: '100%', height: '160px', fontFamily: 'monospace', fontSize: '9px',
                padding: '6px', border: `2px solid ${SEAFOAM.borderInner}`, background: '#f8f8f8',
                resize: 'none', boxSizing: 'border-box',
              }} onClick={e => e.target.select()} />
            </>
          )}

          <button style={{ ...retroTheme.button, width: '100%', marginTop: '6px' }}
            onMouseDown={(e) => { e.stopPropagation(); onClose() }}>
            Close
          </button>
        </div>
      </div>
    </Backdrop>
  )
}

// ══════════════════════════════════════════════════════════════════════════════
// MERMAID MODAL
// ══════════════════════════════════════════════════════════════════════════════

export const MermaidModal = ({ show, syntax, onClose }) => {
  if (!show) return null
  return (
    <Backdrop onClose={onClose} zIndex={9999}>
      <div style={{ ...retroTheme.modal, width: '560px', zIndex: 10000 }} onMouseDown={e => e.stopPropagation()}>
        <div style={retroTheme.modalHeader}>
          <span>Mermaid Diagram Syntax</span>
          <CloseBtn onClose={onClose} />
        </div>
        <div style={retroTheme.modalContent}>
          <div style={{ fontSize: '10px', marginBottom: '6px' }}>
            Paste into{' '}
            <a href="https://mermaid.live" target="_blank" rel="noopener noreferrer" style={{ color: SEAFOAM.accentMid }}>
              mermaid.live
            </a>{' '}
            to visualize.
          </div>
          <textarea readOnly value={syntax || ''} style={{
            width: '100%', height: '320px', fontFamily: 'monospace', fontSize: '10px',
            padding: '6px', border: `2px solid ${SEAFOAM.borderInner}`, background: '#f8f8f8',
            resize: 'none', boxSizing: 'border-box',
          }} onClick={e => e.target.select()} />
          <div style={{ display: 'flex', gap: '6px', marginTop: '8px' }}>
            <button style={{ ...retroTheme.accentButton, flex: 1 }}
              onMouseDown={(e) => { e.stopPropagation(); navigator.clipboard.writeText(syntax || '') }}>
              Copy to Clipboard
            </button>
            <button style={{ ...retroTheme.button, flex: 1 }}
              onMouseDown={(e) => { e.stopPropagation(); onClose() }}>
              Close
            </button>
          </div>
        </div>
      </div>
    </Backdrop>
  )
}

// ══════════════════════════════════════════════════════════════════════════════
// EDGE CONTEXT MENU
// ══════════════════════════════════════════════════════════════════════════════

export const EdgeContextMenu = ({ edgeContext, onChangeProperty, onDeleteEdge }) => {
  if (!edgeContext) return null
  return (
    <div
      style={{
        position: 'fixed',
        top:      edgeContext.y,
        left:     edgeContext.x,
        ...retroTheme.modal,
        width:    '180px',
        transform:'none',
        zIndex:   10001,
      }}
      onClick={e => e.stopPropagation()}
    >
      <div style={retroTheme.modalHeader}>
        <span>Edge Options</span>
      </div>
      <div style={retroTheme.modalContent}>
        <button style={{ ...retroTheme.button, width: '100%', marginBottom: '4px' }}
          onClick={(e) => { e.stopPropagation(); onChangeProperty?.() }}>
          Change Property
        </button>
        <button style={{ ...retroTheme.dangerButton, width: '100%' }}
          onClick={(e) => { e.stopPropagation(); onDeleteEdge?.() }}>
          Delete Edge
        </button>
      </div>
    </div>
  )
}

// ══════════════════════════════════════════════════════════════════════════════
// TOAST NOTIFICATION
// ══════════════════════════════════════════════════════════════════════════════

export const Toast = ({ message }) => {
  if (!message) return null
  return (
    <div style={{
      position:  'fixed',
      bottom:    '20px',
      right:     '20px',
      ...retroTheme.modal,
      width:     'auto',
      minWidth:  '200px',
      maxWidth:  '380px',
      transform: 'none',
      zIndex:    20000,
    }}>
      <div style={{ ...retroTheme.modalHeader, background: '#aacc00', color: '#0a2018' }}>
        <span>Notice</span>
      </div>
      <div style={retroTheme.modalContent}>
        <div style={{ whiteSpace: 'pre-line', fontSize: '11px' }}>{message}</div>
      </div>
    </div>
  )
}

// ══════════════════════════════════════════════════════════════════════════════
// ONTOLOGY BROWSER PANEL  (ported from ONTO-TRON-5000, seafoam palette)
// Key fix: scroll container uses overflowY: 'auto' with explicit maxHeight
// so the tree is always scrollable regardless of how deep it expands.
// ══════════════════════════════════════════════════════════════════════════════

export const OntologyBrowserPanel = ({
  show,
  activeTab, setActiveTab,
  classHierarchy, objectProperties, dataProperties,
  selectedClass, setSelectedClass,
  selectedProperty, setSelectedProperty,
  classDetails, propertyDetails,
  expandedClasses, setExpandedClasses,
  onAddToCanvas,
  onClose,
}) => {
  if (!show) return null

  const toggle = (uri) => {
    setExpandedClasses(prev => {
      const next = new Set(prev)
      next.has(uri) ? next.delete(uri) : next.add(uri)
      return next
    })
  }

  const renderTree = (items, depth = 0) => items.map(item => {
    const isExpanded = expandedClasses.has(item.uri)
    const hasChildren = item.children?.length > 0
    const isSel = selectedClass?.uri === item.uri || selectedProperty?.uri === item.uri
    return (
      <div key={item.uri}>
        <div
          style={{
            ...retroTheme.listItem,
            paddingLeft:    `${8 + depth * 18}px`,
            background:     isSel ? SEAFOAM.accentMid : 'transparent',
            color:          isSel ? '#ffffff' : 'inherit',
            display:        'flex',
            alignItems:     'center',
            gap:            '5px',
            borderBottom:   `1px solid ${SEAFOAM.borderInner}`,
          }}
          onMouseEnter={(e) => { if (!isSel) e.currentTarget.style.background = '#ddf5ee' }}
          onMouseLeave={(e) => { if (!isSel) e.currentTarget.style.background = 'transparent' }}
          onMouseDown={(e) => {
            e.stopPropagation()
            if (activeTab === 'classes')         setSelectedClass(item)
            else                                  setSelectedProperty(item)
          }}
        >
          {hasChildren ? (
            <span
              style={{ width: '14px', fontSize: '9px', cursor: 'pointer', userSelect: 'none', flexShrink: 0 }}
              onMouseDown={(e) => { e.stopPropagation(); toggle(item.uri) }}>
              {isExpanded ? 'v' : '>'}
            </span>
          ) : (
            <span style={{ width: '14px' }} />
          )}
          <span style={{ fontSize: '10px', fontWeight: hasChildren ? '600' : '400' }}>
            {item.label || tail(item.uri)}
          </span>
        </div>
        {hasChildren && isExpanded && (
          <div>{renderTree(item.children, depth + 1)}</div>
        )}
      </div>
    )
  })

  const details = activeTab === 'classes' ? classDetails?.[selectedClass?.uri] : propertyDetails?.[selectedProperty?.uri]
  const selItem = activeTab === 'classes' ? selectedClass : selectedProperty

  return (
    <div style={{
      position:    'fixed',
      top:         0,
      left:        0,
      width:       '300px',
      height:      '100vh',
      background:  '#c0cac4',
      border:      '2px solid',
      borderColor: '#dce8e0 #4a6a58 #4a6a58 #dce8e0',
      boxShadow:   '2px 0 8px rgba(0,0,0,0.25)',
      zIndex:      500,
      display:     'flex',
      flexDirection:'column',
    }}>

      {/* Header */}
      <div style={{ ...retroTheme.modalHeader, borderRadius: 0 }}>
        <span>Ontology Browser</span>
        <CloseBtn onClose={onClose} />
      </div>

      {/* Tabs */}
      <div style={{ display: 'flex', borderBottom: `2px solid ${SEAFOAM.borderInner}`, background: '#c0cac4' }}>
        {['classes', 'objectProperties', 'dataProperties'].map(tab => (
          <button key={tab} style={{
            ...retroTheme.button, flex: 1, margin: '2px 2px 0',
            fontSize:   '9px',
            background: activeTab === tab ? '#f0f5f2' : retroTheme.button.background,
            color:      activeTab === tab ? SEAFOAM.accentDark : '#0a2018',
            fontWeight: activeTab === tab ? 'bold' : 600,
            borderBottom: activeTab === tab ? 'none' : undefined,
          }}
            onMouseDown={(e) => { e.stopPropagation(); setActiveTab(tab); setSelectedClass(null); setSelectedProperty(null) }}>
            {tab === 'classes' ? 'Classes' : tab === 'objectProperties' ? 'Obj Props' : 'Data Props'}
          </button>
        ))}
      </div>

      {/* Content: split tree + details */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>

        {/* Tree — CRITICAL: overflowY auto + explicit maxHeight so it scrolls */}
        <div style={{
          flex:       selItem ? '0 0 55%' : '1 1 auto',
          overflowY:  'auto',
          overflowX:  'hidden',
          background: '#ffffff',
          border:     '2px solid',
          borderColor:`${SEAFOAM.borderInner} #dce8e0 #dce8e0 ${SEAFOAM.borderInner}`,
          margin:     '4px',
          minHeight:  0,
        }}>
          {(classHierarchy || []).length === 0 &&
           (objectProperties || []).length === 0 &&
           (dataProperties || []).length === 0 && (
            <div style={{ padding: '24px 16px', textAlign: 'center', fontSize: '10px', color: '#666', lineHeight: 1.6 }}>
              <div style={{ fontSize: '22px', marginBottom: '10px', opacity: 0.4 }}>[ ]</div>
              <div style={{ fontWeight: 'bold', marginBottom: '6px', color: '#444' }}>No ontology loaded</div>
              <div style={{ marginBottom: '10px' }}>Select or upload an ontology framework to browse classes, properties, and definitions here.</div>
              <div style={{ fontSize: '9px', background: '#f0f5f2', border: `1px solid ${SEAFOAM.borderInner}`, padding: '5px 8px', color: '#444' }}>
                Use the "Ontology Framework" button in the toolbar to load BFO, CCO, or upload your own .ttl / .owl / .rdf file.
              </div>
            </div>
          )}
          {activeTab === 'classes'           && renderTree(classHierarchy     || [])}
          {activeTab === 'objectProperties'  && renderTree(objectProperties   || [])}
          {activeTab === 'dataProperties'    && renderTree(dataProperties     || [])}
        </div>

        {/* Details pane */}
        {selItem && (
          <div style={{
            flex:       '0 0 45%',
            overflowY:  'auto',
            overflowX:  'hidden',
            background: '#ffffff',
            border:     '2px solid',
            borderColor:`${SEAFOAM.borderInner} #dce8e0 #dce8e0 ${SEAFOAM.borderInner}`,
            margin:     '0 4px 4px',
            padding:    '7px',
            minHeight:  0,
          }}>
            <div style={{ fontWeight: 'bold', fontSize: '11px', marginBottom: '6px', paddingBottom: '4px', borderBottom: `1px solid ${SEAFOAM.borderInner}` }}>
              {selItem.label || tail(selItem.uri)}
            </div>

            <div style={{ fontSize: '8px', fontWeight: 'bold', color: '#555', marginBottom: '2px' }}>IRI:</div>
            <div style={{ fontSize: '8px', color: SEAFOAM.accentMid, wordBreak: 'break-all', background: '#f5f5f5', padding: '3px', border: `1px solid ${SEAFOAM.borderInner}`, fontFamily: 'monospace', marginBottom: '6px' }}>
              {selItem.uri}
            </div>

            {details?.definition && (
              <>
                <div style={{ fontSize: '8px', fontWeight: 'bold', color: '#555', marginBottom: '2px' }}>Definition:</div>
                <div style={{ fontSize: '9px', lineHeight: 1.5, background: '#f5f5f5', padding: '4px', border: `1px solid ${SEAFOAM.borderInner}`, marginBottom: '6px' }}>
                  {details.definition}
                </div>
              </>
            )}

            {details?.parents?.length > 0 && (
              <>
                <div style={{ fontSize: '8px', fontWeight: 'bold', color: '#555', marginBottom: '2px' }}>Superclasses:</div>
                <div style={{ fontSize: '9px', background: '#f0f5f2', padding: '4px', border: `1px solid ${SEAFOAM.borderInner}`, marginBottom: '6px' }}>
                  {details.parents.map((p, i) => <div key={i}>- {p.label || tail(p.uri)}</div>)}
                </div>
              </>
            )}

            {details?.domain?.length > 0 && (
              <>
                <div style={{ fontSize: '8px', fontWeight: 'bold', color: '#555', marginBottom: '2px' }}>Domain:</div>
                <div style={{ fontSize: '9px', background: '#e8f0ff', padding: '4px', border: `1px solid #aaccee`, marginBottom: '6px' }}>
                  {details.domain.map((d, i) => <div key={i}>- {d.label || tail(d.uri)}</div>)}
                </div>
              </>
            )}

            {details?.range?.length > 0 && (
              <>
                <div style={{ fontSize: '8px', fontWeight: 'bold', color: '#555', marginBottom: '2px' }}>Range:</div>
                <div style={{ fontSize: '9px', background: '#e8ffe8', padding: '4px', border: `1px solid #aaccaa`, marginBottom: '6px' }}>
                  {details.range.map((r, i) => <div key={i}>- {r.label || tail(r.uri)}</div>)}
                </div>
              </>
            )}

            {activeTab === 'classes' && (
              <button style={{ ...retroTheme.accentButton, width: '100%', marginTop: '4px' }}
                onMouseDown={(e) => { e.stopPropagation(); onAddToCanvas?.(selItem) }}>
                Add to Canvas
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  )
}

// ══════════════════════════════════════════════════════════════════════════════
// ANNOTATION OPTIONS MODAL
// Fires when user clicks an existing highlight in the document.
// Offers: Edit Class (re-opens TagModal flow), Delete.
// ══════════════════════════════════════════════════════════════════════════════

export const AnnotationOptionsModal = ({
  show,
  annotation,   // the annotation object that was clicked
  onEdit,       // () => void — triggers re-tag flow with existing annotation pre-filled
  onDelete,     // () => void — removes the annotation
  onClose,
}) => {
  if (!show || !annotation) return null

  const color = getClassColor(annotation.class_uri)

  return (
    <Backdrop onClose={onClose} zIndex={9999}>
      <div style={{ ...retroTheme.modal, width: '380px', zIndex: 10000 }} onMouseDown={e => e.stopPropagation()}>
        <div style={retroTheme.modalHeader}>
          <span>Annotation</span>
          <CloseBtn onClose={onClose} />
        </div>
        <div style={retroTheme.modalContent}>

          {/* Span preview */}
          <div style={{
            background:   color.fill,
            borderBottom: `2px solid ${color.border}`,
            borderRadius: '2px',
            padding:      '5px 8px',
            fontSize:     '12px',
            fontStyle:    'italic',
            marginBottom: '8px',
          }}>
            "{annotation.text}"
          </div>

          {/* Current class */}
          <div style={{
            fontSize:     '10px',
            marginBottom: '10px',
            padding:      '4px 8px',
            background:   '#f0f5f2',
            border:       `1px solid ${SEAFOAM.borderInner}`,
          }}>
            <span style={{ fontWeight: 'bold', color: '#0d3326' }}>Class: </span>
            {annotation.class_label || tail(annotation.class_uri)}
            <div style={{ fontSize: '8px', color: '#555', fontFamily: 'monospace', marginTop: '2px' }}>
              {annotation.class_uri}
            </div>
          </div>

          {/* Assertion type */}
          <div style={{
            fontSize:     '10px',
            marginBottom: '10px',
            padding:      '4px 8px',
            background:   '#f0f5f2',
            border:       `1px solid ${SEAFOAM.borderInner}`,
          }}>
            <span style={{ fontWeight: 'bold', color: '#0d3326' }}>Type: </span>
            {annotation.assertion_type === 'tbox' ? 'Defines / exemplifies class (TBox)' : 'Instance of class (ABox)'}
          </div>

          {/* Location */}
          <div style={{
            fontSize:     '9px',
            color:        '#666',
            marginBottom: '12px',
          }}>
            {annotation.para_id?.replace('_', ' ')} · chars {annotation.start_char}–{annotation.end_char}
          </div>

          {/* Actions */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
            <button
              style={{
                ...retroTheme.button,
                height:         '52px',
                display:        'flex',
                flexDirection:  'column',
                alignItems:     'center',
                justifyContent: 'center',
                fontSize:       '10px',
                gap:            '4px',
              }}
              onMouseDown={(e) => { e.stopPropagation(); onEdit?.() }}
            >
              <span style={{ fontSize: '16px' }}>E</span>
              <span>Edit Class</span>
            </button>

            <button
              style={{
                ...retroTheme.dangerButton,
                height:         '52px',
                display:        'flex',
                flexDirection:  'column',
                alignItems:     'center',
                justifyContent: 'center',
                fontSize:       '10px',
                gap:            '4px',
              }}
              onMouseDown={(e) => { e.stopPropagation(); onDelete?.() }}
            >
              <span style={{ fontSize: '16px' }}>D</span>
              <span>Delete</span>
            </button>
          </div>

        </div>
      </div>
    </Backdrop>
  )
}

// ══════════════════════════════════════════════════════════════════════════════
// PARAGRAPH LINK MODAL
// Fires when user clicks a paragraph badge (§1, §2 etc.)
// Shows existing links for that paragraph and lets user add/remove links.
// ══════════════════════════════════════════════════════════════════════════════

export const ParagraphLinkModal = ({
  show,
  para,           // the paragraph that was clicked
  paragraphs,     // all paragraphs in the document
  paraLinks,      // existing links
  onConnect,      // (sourcePara, targetPara) => void
  onDisconnect,   // (index) => void
  onClose,
}) => {
  if (!show || !para) return null

  const [targetPara, setTargetPara] = useState('')

  // Links that involve this paragraph
  const relatedLinks = (paraLinks || []).filter(
    l => l.source_para === para.para_id || l.target_para === para.para_id
  )

  // Other paragraphs available to link to
  const available = (paragraphs || []).filter(p =>
    p.para_id !== para.para_id &&
    !(paraLinks || []).some(
      l => (l.source_para === para.para_id && l.target_para === p.para_id) ||
           (l.target_para === para.para_id && l.source_para === p.para_id)
    )
  )

  return (
    <Backdrop onClose={onClose} zIndex={9999}>
      <div style={{ ...retroTheme.modal, width: '420px', zIndex: 10000 }} onMouseDown={e => e.stopPropagation()}>
        <div style={retroTheme.modalHeader}>
          <span>Paragraph {para.para_index} — Links</span>
          <CloseBtn onClose={onClose} />
        </div>
        <div style={retroTheme.modalContent}>

          {/* Paragraph preview */}
          <div style={{
            fontSize:     '10px',
            background:   '#f0f5f2',
            border:       `1px solid ${SEAFOAM.borderInner}`,
            padding:      '5px 8px',
            marginBottom: '10px',
            color:        '#333',
            fontStyle:    'italic',
          }}>
            {para.text?.substring(0, 120)}{para.text?.length > 120 ? '...' : ''}
          </div>

          {/* Existing links for this paragraph */}
          {relatedLinks.length > 0 && (
            <>
              <div style={{ fontSize: '10px', fontWeight: 'bold', color: '#0d3326', marginBottom: '4px' }}>
                Existing links:
              </div>
              {relatedLinks.map((link, i) => {
                const globalIdx = (paraLinks || []).indexOf(link)
                const otherParaId = link.source_para === para.para_id
                  ? link.target_para
                  : link.source_para
                const otherPara = paragraphs?.find(p => p.para_id === otherParaId)
                const direction = link.source_para === para.para_id ? 'to' : 'from'
                return (
                  <div key={i} style={{
                    display:        'flex',
                    justifyContent: 'space-between',
                    alignItems:     'center',
                    padding:        '4px 8px',
                    background:     '#ddf5ee',
                    border:         `1px solid ${SEAFOAM.accentMid}`,
                    marginBottom:   '3px',
                    fontSize:       '10px',
                  }}>
                    <span>
                      {direction === 'to' ? 'Links to' : 'Linked from'}{' '}
                      <strong>§{otherPara?.para_index}</strong>
                      {otherPara && (
                        <span style={{ color: '#555', marginLeft: '6px' }}>
                          {otherPara.text?.substring(0, 50)}...
                        </span>
                      )}
                    </span>
                    <button
                      style={{ ...retroTheme.dangerButton, padding: '1px 6px', fontSize: '9px', margin: 0 }}
                      onMouseDown={(e) => { e.stopPropagation(); onDisconnect?.(globalIdx) }}
                    >
                      Remove
                    </button>
                  </div>
                )
              })}
              <div style={{ borderTop: `1px solid ${SEAFOAM.borderInner}`, margin: '8px 0' }} />
            </>
          )}

          {/* Add new link */}
          {available.length > 0 ? (
            <>
              <div style={{ fontSize: '10px', fontWeight: 'bold', color: '#0d3326', marginBottom: '4px' }}>
                Link to another paragraph:
              </div>
              <select
                style={{ ...retroTheme.input }}
                value={targetPara}
                onChange={e => setTargetPara(e.target.value)}
                onMouseDown={e => e.stopPropagation()}
              >
                <option value="">— Select paragraph —</option>
                {available.map(p => (
                  <option key={p.para_id} value={p.para_id}>
                    §{p.para_index} — {p.text?.substring(0, 70)}...
                  </option>
                ))}
              </select>
              <button
                style={{ ...retroTheme.accentButton, width: '100%', marginBottom: '8px' }}
                disabled={!targetPara}
                onMouseDown={(e) => {
                  e.stopPropagation()
                  if (targetPara) {
                    onConnect?.(para.para_id, targetPara)
                    setTargetPara('')
                  }
                }}
              >
                Link paragraphs
              </button>
            </>
          ) : (
            <div style={{ fontSize: '10px', color: '#666', marginBottom: '8px', textAlign: 'center' }}>
              {paragraphs?.length <= 1
                ? 'No other paragraphs to link to.'
                : 'All paragraphs already linked to this one.'}
            </div>
          )}

          <button
            style={{ ...retroTheme.button, width: '100%' }}
            onMouseDown={(e) => { e.stopPropagation(); onClose() }}
          >
            Close
          </button>
        </div>
      </div>
    </Backdrop>
  )
}

// ══════════════════════════════════════════════════════════════════════════════
// DOCUMENT TABS
// Renders a tab strip above the document panel for switching between
// multiple loaded documents. Each tab shows filename + annotation count.
// ══════════════════════════════════════════════════════════════════════════════

export const DocumentTabs = ({
  documents,        // [{doc_id, filename, annotations, paragraphs, ...}]
  activeIndex,
  onSelectTab,
  onCloseTab,
}) => {
  if (!documents || documents.length === 0) return null

  return (
    <div style={{
      display:      'flex',
      gap:          '2px',
      padding:      '3px 6px 0',
      background:   SEAFOAM.chromeDark,
      borderBottom: `1px solid ${SEAFOAM.borderInner}`,
      overflowX:    'auto',
      flexShrink:   0,
    }}>
      {documents.map((doc, i) => {
        const isActive = i === activeIndex
        return (
          <div
            key={doc.doc_id}
            style={{
              display:        'flex',
              alignItems:     'center',
              gap:            '6px',
              padding:        '4px 8px',
              fontSize:       '10px',
              fontWeight:     isActive ? 'bold' : 600,
              background:     isActive ? '#fafbfa' : SEAFOAM.chromeMid,
              border:         '1px solid',
              borderColor:    isActive
                ? `${SEAFOAM.borderInner} ${SEAFOAM.borderInner} #fafbfa ${SEAFOAM.borderInner}`
                : SEAFOAM.borderInner,
              borderBottom:   isActive ? 'none' : `1px solid ${SEAFOAM.borderInner}`,
              borderRadius:   '3px 3px 0 0',
              cursor:         'pointer',
              color:          isActive ? SEAFOAM.accentDark : '#444',
              maxWidth:       '160px',
              position:       'relative',
              top:            isActive ? '1px' : '0',
            }}
            onMouseDown={(e) => { e.stopPropagation(); onSelectTab(i) }}
            title={doc.filename}
          >
            <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {doc.filename}
            </span>
            {doc.annotations?.length > 0 && (
              <span style={{
                fontSize: '8px', background: SEAFOAM.accentMid, color: '#fff',
                padding: '0 4px', borderRadius: '2px', flexShrink: 0,
              }}>
                {doc.annotations.length}
              </span>
            )}
            <button
              style={{
                fontSize: '9px', background: 'transparent', border: 'none',
                cursor: 'pointer', color: '#999', padding: '0 2px', lineHeight: 1,
                flexShrink: 0,
              }}
              onMouseDown={(e) => { e.stopPropagation(); onCloseTab(i) }}
              title="Close document"
            >
              x
            </button>
          </div>
        )
      })}
    </div>
  )
}

// ══════════════════════════════════════════════════════════════════════════════
// VALIDATION MODAL
// ══════════════════════════════════════════════════════════════════════════════

export const ValidationModal = ({ show, results, onClose }) => {
  if (!show) return null
  const severityColor  = { error: '#ffdddd', warning: '#fff8cc', info: '#e8f0ff' }
  const severityBorder = { error: '#cc2222', warning: '#aa8800', info: '#3366cc' }
  return (
    <Backdrop onClose={onClose} zIndex={9999}>
      <div style={{ ...retroTheme.modal, width: '520px', maxHeight: '80vh', overflow: 'hidden', display: 'flex', flexDirection: 'column', zIndex: 10000 }} onMouseDown={e => e.stopPropagation()}>
        <div style={retroTheme.modalHeader}>
          <span>Ontology Validation Report</span>
          <CloseBtn onClose={onClose} />
        </div>
        <div style={{ ...retroTheme.modalContent, overflowY: 'auto', flex: 1 }}>
          <div style={{ display: 'flex', gap: '8px', marginBottom: '10px' }}>
            {[
              { key: 'errors', label: 'Errors', sev: 'error', color: '#cc2222' },
              { key: 'warnings', label: 'Warnings', sev: 'warning', color: '#aa8800' },
              { key: 'info', label: 'Info', sev: 'info', color: '#3366cc' },
            ].map(s => (
              <div key={s.key} style={{ flex: 1, textAlign: 'center', padding: '6px', background: results?.[s.key] > 0 ? severityColor[s.sev] : '#f0f5f2', border: `1px solid ${s.color}`, fontSize: '10px' }}>
                <div style={{ fontSize: '18px', fontWeight: 'bold', color: s.color }}>{results?.[s.key] || 0}</div>
                <div>{s.label}</div>
              </div>
            ))}
          </div>
          {results?.valid && (
            <div style={{ padding: '8px', background: '#ddf5ee', border: `1px solid ${SEAFOAM.accentMid}`, marginBottom: '8px', fontSize: '10px', fontWeight: 'bold', color: SEAFOAM.accentDark }}>
              Annotation set is ontologically consistent.
            </div>
          )}
          {(results?.issues || []).map((issue, i) => (
            <div key={i} style={{ padding: '7px 8px', background: severityColor[issue.severity] || '#f0f5f2', border: `1px solid ${severityBorder[issue.severity] || SEAFOAM.borderInner}`, marginBottom: '5px', fontSize: '10px' }}>
              <div style={{ fontWeight: 'bold', color: severityBorder[issue.severity], marginBottom: '3px' }}>
                {issue.severity?.toUpperCase()} — {issue.para_id?.replace('_', ' ')}
              </div>
              <div style={{ marginBottom: '4px' }}>{issue.message}</div>
              {issue.span_texts?.length > 0 && (
                <div style={{ fontSize: '9px', color: '#555' }}>
                  Spans: {issue.span_texts.map(t => `"${t}"`).join(', ')}
                </div>
              )}
            </div>
          ))}
          <button style={{ ...retroTheme.button, width: '100%', marginTop: '8px' }}
            onMouseDown={(e) => { e.stopPropagation(); onClose() }}>Close</button>
        </div>
      </div>
    </Backdrop>
  )
}

// ══════════════════════════════════════════════════════════════════════════════
// CROSS-DOCUMENT CONFLICT MODAL
// ══════════════════════════════════════════════════════════════════════════════

export const CrossDocModal = ({ show, results, onClose, onExportDifferentFrom }) => {
  if (!show) return null
  return (
    <Backdrop onClose={onClose} zIndex={9999}>
      <div style={{ ...retroTheme.modal, width: '520px', maxHeight: '80vh', overflow: 'hidden', display: 'flex', flexDirection: 'column', zIndex: 10000 }} onMouseDown={e => e.stopPropagation()}>
        <div style={retroTheme.modalHeader}>
          <span>Cross-Document Consistency</span>
          <CloseBtn onClose={onClose} />
        </div>
        <div style={{ ...retroTheme.modalContent, overflowY: 'auto', flex: 1 }}>
          {(!results || results.conflict_count === 0) ? (
            <div style={{ padding: '8px', background: '#ddf5ee', border: `1px solid ${SEAFOAM.accentMid}`, fontSize: '10px', fontWeight: 'bold', color: SEAFOAM.accentDark, marginBottom: '8px' }}>
              No tagging conflicts found across open documents.
            </div>
          ) : (
            <>
              <div style={{ fontSize: '10px', fontWeight: 'bold', color: '#cc2222', marginBottom: '8px' }}>
                {results.conflict_count} conflict{results.conflict_count !== 1 ? 's' : ''} found
              </div>
              {(results.conflicts || []).map((c, i) => (
                <div key={i} style={{ padding: '7px 8px', background: '#ffeeee', border: '1px solid #cc2222', marginBottom: '5px', fontSize: '10px' }}>
                  <div style={{ fontWeight: 'bold', marginBottom: '3px' }}>"{c.term}"</div>
                  <div>In {c.current_doc}: <strong>{c.current_classes.map(tail).join(', ')}</strong></div>
                  <div>In {c.other_filename}: <strong>{c.other_classes.map(tail).join(', ')}</strong></div>
                  <div style={{ fontSize: '9px', color: '#666', marginTop: '3px' }}>{c.message}</div>
                </div>
              ))}
            </>
          )}
          <button style={{ ...retroTheme.button, width: '100%', marginTop: '8px' }}
            onMouseDown={(e) => { e.stopPropagation(); onClose() }}>Close</button>
        </div>
      </div>
    </Backdrop>
  )
}
