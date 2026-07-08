// ============================================================================
// App.jsx  —  Root component for the Ontology Annotation Workbench
// ============================================================================

import React, {
  useCallback, useEffect, useMemo, useRef, useState,
} from 'react'
import {
  ReactFlowProvider,
  MarkerType,
  applyNodeChanges,
  applyEdgeChanges,
  addEdge,
} from 'reactflow'
import 'reactflow/dist/style.css'

import {
  retroTheme, SEAFOAM, uid, tail, isBFOorCCO,
  RDF_TYPE, CCO_IS_ABOUT, fallbackProperties,
  getClassColor, resetColorMap,
  nodeTypes, edgeTypes, GlobalStyle,
} from './theme'

import {
  TagModal,
  CustomClassModal,
  PropertyModal,
  NodeOptionsModal,
  OntologyFrameworkModal,
  ConnectParagraphsModal,
  ExportModal,
  MermaidModal,
  EdgeContextMenu,
  Toast,
  OntologyBrowserPanel,
  AnnotationOptionsModal,
  ParagraphLinkModal,
  DocumentTabs,
  CrossDocModal,
  ValidationModal,
} from './modals'

import { OntologyCanvas, DocumentPanel } from './panels'

// ══════════════════════════════════════════════════════════════════════════════
// APP
// ══════════════════════════════════════════════════════════════════════════════

export default function App() {

  // ── Document tabs state ─────────────────────────────────────────────────────
  // Each entry: { doc_id, filename, paragraphs, annotations, para_links }
  // Multiple documents can be open simultaneously; activeDocIndex picks the visible one.
  const [documents,      setDocuments]      = useState([])
  const [activeDocIndex, setActiveDocIndex] = useState(0)
  const [docLoading,     setDocLoading]     = useState(false)
  const [pendingSelection, setPendingSelection] = useState(null)

  const activeDoc = documents[activeDocIndex] || null

  // Derived getters — read from the active tab. Components below use these
  // exactly as before; no call site needs to change.
  const docId      = activeDoc?.doc_id     || ''
  const docName    = activeDoc?.filename   || ''
  const paragraphs = activeDoc?.paragraphs || []
  const annotations= activeDoc?.annotations|| []
  const paraLinks  = activeDoc?.para_links || []

  // Setters that write into the active tab's slot in the documents array.
  // Signature-compatible with useState setters (accepts value or updater fn)
  // so every existing setAnnotations(prev => ...) call keeps working.
  const updateActiveDoc = useCallback((patch) => {
    setDocuments(prev => prev.map((d, i) =>
      i === activeDocIndex ? { ...d, ...(typeof patch === 'function' ? patch(d) : patch) } : d
    ))
  }, [activeDocIndex])

  const setParagraphs = useCallback((val) => {
    updateActiveDoc(d => ({ paragraphs: typeof val === 'function' ? val(d.paragraphs || []) : val }))
  }, [updateActiveDoc])

  const setAnnotations = useCallback((val) => {
    updateActiveDoc(d => ({ annotations: typeof val === 'function' ? val(d.annotations || []) : val }))
  }, [updateActiveDoc])

  const setParaLinks = useCallback((val) => {
    updateActiveDoc(d => ({ para_links: typeof val === 'function' ? val(d.para_links || []) : val }))
  }, [updateActiveDoc])

  // ── Graph state ─────────────────────────────────────────────────────────────
  const [nodes, setNodes] = useState([])
  const [edges, setEdges] = useState([])
  const stableEdges = useMemo(() => edges, [edges])

  // ── Ontology canvas mode ────────────────────────────────────────────────────
  const [canvasMode, setCanvasMode] = useState('build')   // 'build' | 'annotations'

  // ── Property results (loaded on mount) ─────────────────────────────────────
  const [propertyResults,     setPropertyResults]     = useState(fallbackProperties)
  const [dataPropertyResults, setDataPropertyResults] = useState([])

  // ── Framework state ─────────────────────────────────────────────────────────
  const [activeFramework,   setActiveFramework]   = useState('bfo_cco')
  const [builtInFrameworks, setBuiltInFrameworks] = useState([])
  const [userOntologies,    setUserOntologies]    = useState([])

  // ── Browser panel state ─────────────────────────────────────────────────────
  const [showBrowserPanel,    setShowBrowserPanel]    = useState(false)
  const [browserActiveTab,    setBrowserActiveTab]    = useState('classes')
  const [browserClassHierarchy, setBrowserClassHierarchy] = useState([])
  const [browserObjectProps,  setBrowserObjectProps]  = useState([])
  const [browserDataProps,    setBrowserDataProps]    = useState([])
  const [browserSelectedClass,    setBrowserSelectedClass]    = useState(null)
  const [browserSelectedProperty, setBrowserSelectedProperty] = useState(null)
  const [browserExpandedClasses,  setBrowserExpandedClasses]  = useState(new Set())
  const [browserClassDetails,     setBrowserClassDetails]     = useState({})
  const [browserPropertyDetails,  setBrowserPropertyDetails]  = useState({})

  // ── Modal state ─────────────────────────────────────────────────────────────
  const [showTagModal,           setShowTagModal]           = useState(false)
  const [showCustomModal,        setShowCustomModal]        = useState(false)
  const [showPropertyModal,      setShowPropertyModal]      = useState(false)
  const [showNodeOptions,        setShowNodeOptions]        = useState(false)
  const [showFrameworkModal,     setShowFrameworkModal]     = useState(false)
  const [showConnectParasModal,  setShowConnectParasModal]  = useState(false)
  const [showExportModal,        setShowExportModal]        = useState(false)
  const [showMermaidModal,       setShowMermaidModal]       = useState(false)
  const [showAnnotationModal,    setShowAnnotationModal]    = useState(false)
  const [showParaLinkModal,      setShowParaLinkModal]      = useState(false)
  const [activeParagraph,       setActiveParagraph]        = useState(null)
  const [activeAnnotation,      setActiveAnnotation]       = useState(null)   // annotation being viewed/edited

  const [propertyModalMode,      setPropertyModalMode]      = useState(null)
  const [selectedNode,           setSelectedNode]           = useState(null)
  const [selectedTargetNodeId,   setSelectedTargetNodeId]   = useState('')
  const [pendingNodeClass,       setPendingNodeClass]       = useState(null)
  const [edgeContext,            setEdgeContext]            = useState(null)
  const [edgeBeingEdited,        setEdgeBeingEdited]        = useState(null)
  const [chosenProperty,         setChosenProperty]         = useState(null)
  const [mermaidSyntax,          setMermaidSyntax]          = useState('')
  const [toast,                  setToast]                  = useState(null)
  const [suggestions,            setSuggestions]            = useState([])
  const [suggestionsLoading,     setSuggestionsLoading]     = useState(false)
  const [showCrossDocModal,      setShowCrossDocModal]      = useState(false)
  const [crossDocResults,        setCrossDocResults]        = useState(null)
  const [showValidationModal,    setShowValidationModal]    = useState(false)
  const [validationResults,      setValidationResults]      = useState(null)

  // ── Refs ────────────────────────────────────────────────────────────────────
  const latestNodesRef = useRef(nodes)
  const latestEdgesRef = useRef(edges)
  const canvasApiRef   = useRef(null)

  useEffect(() => { latestNodesRef.current = nodes }, [nodes])
  useEffect(() => { latestEdgesRef.current = edges }, [edges])

  // ══════════════════════════════════════════════════════════════════════════
  // TOAST
  // ══════════════════════════════════════════════════════════════════════════

  const showToast = useCallback((msg, duration = 4500) => {
    setToast(msg)
    setTimeout(() => setToast(null), duration)
  }, [])

  // ══════════════════════════════════════════════════════════════════════════
  // ON MOUNT: load properties + framework list
  // ══════════════════════════════════════════════════════════════════════════

  useEffect(() => {
    let alive = true

    const loadProperties = async () => {
      try {
        const [objRes, dataRes] = await Promise.all([
          fetch('/object_properties'),
          fetch('/data_properties'),
        ])
        const objData  = await objRes.json().catch(() => [])
        const dataData = await dataRes.json().catch(() => [])

        const objArr  = Array.isArray(objData)  ? objData  : (objData?.results  || [])
        const dataArr = Array.isArray(dataData) ? dataData : (dataData?.results || [])

        if (alive) {
          const filtered = objArr.filter(p => isBFOorCCO(p?.uri))
          setPropertyResults(filtered.length ? [RDF_TYPE, CCO_IS_ABOUT, ...filtered] : fallbackProperties)
          setDataPropertyResults(dataArr.filter(p => isBFOorCCO(p?.uri)))
        }
      } catch {
        if (alive) setPropertyResults(fallbackProperties)
      }
    }

    const loadFrameworks = async () => {
      try {
        const res  = await fetch('/framework/list')
        const data = await res.json()
        if (alive) {
          setBuiltInFrameworks(data.built_in || [])
          setUserOntologies(data.user || [])
          setActiveFramework(data.active || 'bfo_cco')
        }
      } catch {}
    }

    loadProperties()
    loadFrameworks()
    return () => { alive = false }
  }, [])

  // ══════════════════════════════════════════════════════════════════════════
  // BROWSER PANEL: load hierarchy on open / tab switch
  // ══════════════════════════════════════════════════════════════════════════

  const buildClassTree = useCallback((classes) => {
    const map = new Map()
    classes.forEach(c => map.set(c.uri, { ...c, children: [] }))
    const roots = []
    classes.forEach(c => {
      const node = map.get(c.uri)
      if (c.parent && map.has(c.parent)) map.get(c.parent).children.push(node)
      else roots.push(node)
    })
    const sortByLabel = (a, b) =>
      (a.label || tail(a.uri)).toLowerCase().localeCompare((b.label || tail(b.uri)).toLowerCase())
    const sortTree = (nodes) => {
      nodes.sort(sortByLabel)
      nodes.forEach(n => n.children?.length && sortTree(n.children))
    }
    sortTree(roots)
    return roots
  }, [])

  // Only apply the BFO/CCO URI filter when a built-in framework is active.
  // User-uploaded ontologies show everything in the active graph unfiltered,
  // since their class URIs won't match BFO/CCO patterns.
  const isBuiltInFramework = ['bfo', 'cco', 'bfo_cco', 'none'].includes(activeFramework)

  useEffect(() => {
    if (!showBrowserPanel) return
    if (browserActiveTab === 'classes' && browserClassHierarchy.length === 0) {
      fetch('/classes').then(r => r.json()).then(data => {
        const arr = Array.isArray(data) ? data : []
        const filtered = isBuiltInFramework ? arr.filter(c => isBFOorCCO(c?.uri)) : arr
        setBrowserClassHierarchy(buildClassTree(filtered))
      }).catch(() => {})
    }
    if (browserActiveTab === 'objectProperties' && browserObjectProps.length === 0) {
      fetch('/object_properties').then(r => r.json()).then(data => {
        const arr = Array.isArray(data) ? data : []
        const filtered = isBuiltInFramework ? arr.filter(p => isBFOorCCO(p?.uri)) : arr
        setBrowserObjectProps(buildClassTree(filtered))
      }).catch(() => {})
    }
    if (browserActiveTab === 'dataProperties' && browserDataProps.length === 0) {
      fetch('/data_properties').then(r => r.json()).then(data => {
        const arr = Array.isArray(data) ? data : []
        setBrowserDataProps(buildClassTree(arr))
      }).catch(() => {})
    }
  }, [showBrowserPanel, browserActiveTab, browserClassHierarchy.length, browserObjectProps.length, browserDataProps.length, buildClassTree, isBuiltInFramework])

  // Fetch and cache class/property details for browser panel
  const fetchClassDetails = useCallback(async (uri) => {
    if (browserClassDetails[uri]) return
    try {
      const res  = await fetch(`/class_details?uri=${encodeURIComponent(uri)}`)
      const data = await res.json()
      setBrowserClassDetails(prev => ({ ...prev, [uri]: data }))
    } catch {}
  }, [browserClassDetails])

  const fetchPropertyDetails = useCallback(async (uri) => {
    if (browserPropertyDetails[uri]) return
    try {
      const res  = await fetch(`/property_details?uri=${encodeURIComponent(uri)}`)
      const data = await res.json()
      setBrowserPropertyDetails(prev => ({ ...prev, [uri]: data }))
    } catch {}
  }, [browserPropertyDetails])

  useEffect(() => {
    if (browserSelectedClass?.uri)    fetchClassDetails(browserSelectedClass.uri)
  }, [browserSelectedClass, fetchClassDetails])

  useEffect(() => {
    if (browserSelectedProperty?.uri) fetchPropertyDetails(browserSelectedProperty.uri)
  }, [browserSelectedProperty, fetchPropertyDetails])

  // Persist expanded classes
  useEffect(() => {
    if (browserExpandedClasses.size > 0)
      localStorage.setItem('owb-expanded', JSON.stringify([...browserExpandedClasses]))
  }, [browserExpandedClasses])
  useEffect(() => {
    const stored = localStorage.getItem('owb-expanded')
    if (stored) try { setBrowserExpandedClasses(new Set(JSON.parse(stored))) } catch {}
  }, [])

  // ══════════════════════════════════════════════════════════════════════════
  // NODE CLICK HANDLER + __open patching (same pattern as ONTO-TRON-5000)
  // ══════════════════════════════════════════════════════════════════════════

  const makeOpenForId = useCallback((nodeId) => () => {
    const node = latestNodesRef.current.find(n => n.id === nodeId)
    if (!node) return
    setSelectedNode(node)
    setShowNodeOptions(true)
  }, [])

  // Patch __open and __resize onto every node that doesn't have them
  useEffect(() => {
    let changed = false
    const next = latestNodesRef.current.map(node => {
      const needsOpen   = typeof node.data?.__open   !== 'function'
      const needsResize = typeof node.data?.__resize !== 'function'
      if (!needsOpen && !needsResize) return node
      changed = true
      return {
        ...node,
        data: {
          ...node.data,
          ...(needsOpen   ? { __open:   makeOpenForId(node.id) } : {}),
          ...(needsResize ? { __resize: (id, params) => {
            setNodes(prev => prev.map(n =>
              n.id === id
                ? { ...n, style: { ...n.style, width: params.width, height: params.height } }
                : n
            ))
          }} : {}),
        },
      }
    })
    if (changed) setNodes(next)
  }, [nodes, makeOpenForId])

  const handleNodeClick = useCallback((event, node) => {
    event?.stopPropagation?.()
    setSelectedNode(node)
    setShowNodeOptions(true)
  }, [])

  // ══════════════════════════════════════════════════════════════════════════
  // REACTFLOW CHANGE HANDLERS
  // ══════════════════════════════════════════════════════════════════════════

  const onNodesChange = useCallback(
    changes => setNodes(prev => applyNodeChanges(changes, prev)),
    []
  )

  const onEdgesChange = useCallback(
    changes => setEdges(prev => applyEdgeChanges(changes, prev)),
    []
  )

  const onConnect = useCallback((params) => {
    const srcNode = latestNodesRef.current.find(n => n.id === params.source)
    if (!srcNode || !params.target) return
    setSelectedNode(srcNode)
    setSelectedTargetNodeId(params.target)
    setPropertyModalMode('connectExisting')
    setChosenProperty(null)
    setShowPropertyModal(true)
  }, [])

  const handleEdgeContextMenu = useCallback((event, edge) => {
    event.preventDefault()
    event.stopPropagation()
    setEdgeBeingEdited({ kind: 'rf', edge })
    setEdgeContext({ type: 'rf', id: edge.id, x: event.clientX, y: event.clientY })
  }, [])

  useEffect(() => {
    const close = () => setEdgeContext(null)
    window.addEventListener('click', close)
    return () => window.removeEventListener('click', close)
  }, [])

  // ══════════════════════════════════════════════════════════════════════════
  // EDGE CREATION HELPERS (ported from ONTO-TRON-5000)
  // ══════════════════════════════════════════════════════════════════════════

  const makeEdge = useCallback((source, target, property, options = {}) => {
    const label = String(property?.label || tail(property?.uri) || '(unnamed)')
    let sourceHandle = options.sourceHandle || 'right-source'
    let targetHandle = options.targetHandle || 'left'

    if (options.srcPos && options.tgtPos) {
      const dx = options.tgtPos.x - options.srcPos.x
      const dy = options.tgtPos.y - options.srcPos.y
      if (Math.abs(dx) >= Math.abs(dy)) {
        sourceHandle = dx >= 0 ? 'right-source' : 'left-source'
        targetHandle = dx >= 0 ? 'left' : 'right'
      } else {
        sourceHandle = dy >= 0 ? 'bottom-source' : 'top-source'
        targetHandle = dy >= 0 ? 'top' : 'bottom'
      }
    }

    return {
      id:           options.id || uid('edge'),
      source,
      target,
      type:         'smoothstep',
      sourceHandle,
      targetHandle,
      label,
      animated:     false,
      style:        { stroke: SEAFOAM.edgeStroke, strokeWidth: 2.5 },
      markerEnd:    { type: MarkerType.ArrowClosed, color: SEAFOAM.edgeStroke, width: 18, height: 18 },
      data:         { propertyUri: property?.uri || '', propertyLabel: label, isInferred: !!options.isInferred },
    }
  }, [])

  const safeAddEdge = useCallback((sourceId, targetId, property, options = {}, attempt = 0) => {
    const src = latestNodesRef.current.find(n => n.id === sourceId)
    const tgt = latestNodesRef.current.find(n => n.id === targetId)
    const ready = src && tgt &&
      src.position && Number.isFinite(src.position.x) &&
      tgt.position && Number.isFinite(tgt.position.x)

    if (!ready) {
      if (attempt < 20) setTimeout(() => safeAddEdge(sourceId, targetId, property, options, attempt + 1), 25)
      else showToast('Could not attach edge — try again.')
      return
    }
    const edge = makeEdge(sourceId, targetId, property, {
      srcPos: src.position, tgtPos: tgt.position, ...options,
    })
    setEdges(prev => [...prev, edge])
  }, [makeEdge, showToast])

  // ══════════════════════════════════════════════════════════════════════════
  // NODE CREATION HELPERS
  // ══════════════════════════════════════════════════════════════════════════

  const addStandaloneNode = useCallback((classUri, classLabel, isCustom = false) => {
    const nodeId = uid('node')
    const existingNodes = latestNodesRef.current
    const pos = existingNodes.length > 0
      ? { x: existingNodes[existingNodes.length - 1].position.x + 220, y: existingNodes[existingNodes.length - 1].position.y }
      : { x: 100, y: 100 }
    const newNode = {
      id:       nodeId,
      type:     'clickable',
      position: pos,
      data: {
        label:    classLabel || tail(classUri),
        uri:      classUri,
        isCustom: isCustom || String(classUri).includes('/custom/'),
        __open:   makeOpenForId(nodeId),
      },
      style:      { width: 160, height: 52 },
      selectable: true,
    }
    setNodes(prev => [...prev, newNode])
    return nodeId
  }, [makeOpenForId])

  const addLinkedNode = useCallback((sourceNodeId, classUri, classLabel, property, isCustom = false) => {
    const srcNode = latestNodesRef.current.find(n => n.id === sourceNodeId)
    const nodeId  = uid('node')
    const pos     = srcNode
      ? { x: srcNode.position.x + 240, y: srcNode.position.y }
      : { x: 100, y: 100 }

    const newNode = {
      id:       nodeId,
      type:     'clickable',
      position: pos,
      data: {
        label:    classLabel || tail(classUri),
        uri:      classUri,
        isCustom: isCustom || String(classUri).includes('/custom/'),
        __open:   makeOpenForId(nodeId),
      },
      style:      { width: 160, height: 52 },
      selectable: true,
    }
    setNodes(prev => [...prev, newNode])

    const prop        = property?.uri ? property : RDF_TYPE
    const isInstanceOf= prop.uri === RDF_TYPE.uri
    if (isInstanceOf) safeAddEdge(nodeId, sourceNodeId, prop)
    else              safeAddEdge(sourceNodeId, nodeId, prop)
  }, [makeOpenForId, safeAddEdge])

  // ══════════════════════════════════════════════════════════════════════════
  // GENERATE-FROM-ANNOTATIONS MODE: sync canvas from annotation state
  // ══════════════════════════════════════════════════════════════════════════

  const syncCanvasFromAnnotations = useCallback(() => {
    if (annotations.length === 0) {
      showToast('No annotations to generate from.')
      return
    }

    // Collect unique class URIs used in annotations
    const classMap = new Map()
    annotations.forEach(ann => {
      if (ann.class_uri && !classMap.has(ann.class_uri)) {
        classMap.set(ann.class_uri, {
          uri:      ann.class_uri,
          label:    ann.class_label || tail(ann.class_uri),
          isCustom: ann.is_custom || ann.class_uri.includes('/custom/'),
          spans:    0,
          paras:    new Set(),
        })
      }
      if (ann.class_uri) {
        classMap.get(ann.class_uri).spans++
        classMap.get(ann.class_uri).paras.add(ann.para_id)
      }
    })

    // Build nodes from unique classes
    const newNodes = []
    let col = 0
    for (const [uri, info] of classMap) {
      const nodeId = uid('node')
      newNodes.push({
        id:       nodeId,
        type:     'clickable',
        position: { x: 60 + (col % 3) * 240, y: 60 + Math.floor(col / 3) * 140 },
        data: {
          label:           info.label,
          uri:             info.uri,
          isCustom:        info.isCustom,
          isAutoGenerated: true,
          spanCount:       info.spans,
          paraCount:       info.paras.size,
          __open:          () => {},
        },
        style: { width: 180, height: 60 },
        selectable: true,
      })
      col++
    }

    // Build edges from annotation property_uri fields
    const newEdges = []
    const uriToNodeId = new Map(newNodes.map(n => [n.data.uri, n.id]))

    annotations.forEach(ann => {
      if (ann.property_uri && ann.class_uri && ann.property_uri !== ann.class_uri) {
        const srcId = uriToNodeId.get(ann.class_uri)
        const tgtId = uriToNodeId.get(ann.property_uri)
        if (srcId && tgtId) {
          newEdges.push(makeEdge(srcId, tgtId, {
            uri:   ann.property_uri,
            label: ann.property_label || tail(ann.property_uri),
          }))
        }
      }
    })

    setNodes(newNodes)
    setEdges(newEdges)
    showToast(`Canvas synced: ${newNodes.length} classes from ${annotations.length} annotations`)
  }, [annotations, makeEdge, showToast])

  // ══════════════════════════════════════════════════════════════════════════
  // DOCUMENT UPLOAD
  // ══════════════════════════════════════════════════════════════════════════

  const handleDocumentUpload = useCallback(async (event) => {
    const file = event.target.files?.[0]
    if (!file) return

    setDocLoading(true)
    const fd = new FormData()
    fd.append('file', file)

    try {
      const res  = await fetch('/upload_document', { method: 'POST', body: fd })
      const data = await res.json()

      if (data.error) {
        showToast(`Document error: ${data.error}`)
        return
      }

      // Append as a new tab and switch to it — does NOT replace existing documents
      const newDoc = {
        doc_id:      data.doc_id,
        filename:    data.filename,
        paragraphs:  data.paragraphs || [],
        annotations: [],
        para_links:  [],
      }
      setDocuments(prev => {
        const next = [...prev, newDoc]
        setActiveDocIndex(next.length - 1)
        return next
      })
      showToast(`Loaded ${data.filename} — ${data.paragraph_count} paragraphs`)
    } catch (err) {
      showToast(`Upload failed: ${err.message}`)
    } finally {
      setDocLoading(false)
      event.target.value = ''   // allow re-selecting the same file
    }
  }, [showToast])

  const handleSelectTab = useCallback((index) => {
    setActiveDocIndex(index)
  }, [])

  const handleCloseTab = useCallback((index) => {
    setDocuments(prev => {
      const next = prev.filter((_, i) => i !== index)
      setActiveDocIndex(curIdx => {
        if (next.length === 0) return 0
        if (index < curIdx) return curIdx - 1
        if (index === curIdx) return Math.min(curIdx, next.length - 1)
        return curIdx
      })
      return next
    })
  }, [])

  // ══════════════════════════════════════════════════════════════════════════
  // ANNOTATION: text selected in document panel
  // ══════════════════════════════════════════════════════════════════════════

  const handleTextSelected = useCallback((selection) => {
    setPendingSelection(selection)
    setShowTagModal(true)
  }, [])

  const handleTagConfirm = useCallback(({
    class_uri, class_label, assertion_type, property_uri, property_label, is_custom,
  }) => {
    if (!pendingSelection) return

    const annId = uid('ann')
    const newAnn = {
      id:             annId,
      text:           pendingSelection.text,
      start_char:     pendingSelection.start_char,
      end_char:       pendingSelection.end_char,
      page_num:       pendingSelection.page_num,
      para_id:        pendingSelection.para_id,
      class_uri,
      class_label,
      assertion_type,
      property_uri:   property_uri || '',
      property_label: property_label || '',
      is_custom:      is_custom || false,
    }

    // If editing an existing annotation, replace it in-place; otherwise append
    if (pendingSelection.editing_id) {
      setAnnotations(prev => prev.map(a =>
        a.id === pendingSelection.editing_id
          ? { ...a, class_uri, class_label, assertion_type, property_uri: property_uri || '', property_label: property_label || '', is_custom: is_custom || false }
          : a
      ))
    } else {
      setAnnotations(prev => [...prev, newAnn])
    }

    // If a class was created that doesn't exist on canvas yet, add it
    const alreadyOnCanvas = latestNodesRef.current.some(n => n.data?.uri === class_uri)
    if (!alreadyOnCanvas) {
      addStandaloneNode(class_uri, class_label, is_custom)
    }

    // If in annotations mode, sync immediately
    if (canvasMode === 'annotations') {
      // Defer to let state settle
      setTimeout(() => syncCanvasFromAnnotations(), 50)
    }

    setShowTagModal(false)
    setPendingSelection(null)
  }, [pendingSelection, addStandaloneNode, canvasMode, syncCanvasFromAnnotations])

  // ══════════════════════════════════════════════════════════════════════════
  // PROPERTY MODAL CONFIRM
  // ══════════════════════════════════════════════════════════════════════════

  const handlePropertyConfirm = useCallback(({ property, targetNodeId: tgtId }) => {
    const prop = property || RDF_TYPE

    if (propertyModalMode === 'editEdge' && edgeBeingEdited?.kind === 'rf') {
      const edge = edgeBeingEdited.edge
      setEdges(prev => prev.map(e =>
        e.id === edge.id
          ? { ...e, label: String(prop.label || tail(prop.uri)), data: { ...e.data, propertyUri: prop.uri, propertyLabel: prop.label || tail(prop.uri) } }
          : e
      ))
      setEdgeBeingEdited(null)
    } else if (propertyModalMode === 'connectExisting') {
      const resolvedTarget = tgtId || selectedTargetNodeId
      if (selectedNode?.id && resolvedTarget) {
        safeAddEdge(selectedNode.id, resolvedTarget, prop)
      }
    } else if (propertyModalMode === 'newFromNode' && pendingNodeClass) {
      if (selectedNode?.id) {
        addLinkedNode(selectedNode.id, pendingNodeClass.uri, pendingNodeClass.label, prop, pendingNodeClass.isCustom)
      }
      setPendingNodeClass(null)
    }

    setShowPropertyModal(false)
    setChosenProperty(null)
    setSelectedTargetNodeId('')
    setPropertyModalMode(null)
  }, [
    propertyModalMode, edgeBeingEdited, selectedNode, selectedTargetNodeId,
    pendingNodeClass, safeAddEdge, addLinkedNode,
  ])

  // ══════════════════════════════════════════════════════════════════════════
  // CUSTOM CLASS CONFIRM
  // ══════════════════════════════════════════════════════════════════════════

  const handleCustomClassConfirm = useCallback((cls) => {
    setPendingNodeClass(cls)
    setShowCustomModal(false)
    setPropertyModalMode('newFromNode')
    setChosenProperty(null)
    setTimeout(() => setShowPropertyModal(true), 50)
  }, [])

  // ══════════════════════════════════════════════════════════════════════════
  // NODE OPTIONS ACTIONS
  // ══════════════════════════════════════════════════════════════════════════

  const handleDeleteNode = useCallback(() => {
    if (!selectedNode) return
    if (!window.confirm(`Delete node "${selectedNode.data?.label}"?`)) return
    setEdges(prev => prev.filter(e => e.source !== selectedNode.id && e.target !== selectedNode.id))
    setNodes(prev => prev.filter(n => n.id !== selectedNode.id))
    setSelectedNode(null)
    showToast('Node deleted')
  }, [selectedNode, showToast])

  const handleEditLabel = useCallback(() => {
    if (!selectedNode) return
    const newLabel = window.prompt('Edit label:', selectedNode.data?.label || '')
    if (newLabel != null) {
      setNodes(prev => prev.map(n =>
        n.id === selectedNode.id ? { ...n, data: { ...n.data, label: newLabel } } : n
      ))
      showToast('Label updated')
    }
  }, [selectedNode, showToast])

  // ══════════════════════════════════════════════════════════════════════════
  // FRAMEWORK SELECTION
  // ══════════════════════════════════════════════════════════════════════════

  const handleSelectFramework = useCallback(async (id) => {
    try {
      const res  = await fetch('/framework/set', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ id }),
      })
      const data = await res.json()
      if (data.success) {
        setActiveFramework(id)
        // Reset browser panel caches so the tree refetches under the new framework
        setBrowserClassHierarchy([])
        setBrowserObjectProps([])
        setBrowserDataProps([])
        setBrowserClassDetails({})
        setBrowserPropertyDetails({})

        // Refresh the property lists used by PropertyModal to match the new framework.
        // Only apply the BFO/CCO filter for built-in frameworks — custom/uploaded
        // ontologies show all their properties unfiltered.
        const isBuiltIn = ['bfo', 'cco', 'bfo_cco', 'none'].includes(id)
        try {
          const [objRes, dataRes] = await Promise.all([
            fetch('/object_properties'),
            fetch('/data_properties'),
          ])
          const objArr  = await objRes.json().catch(() => [])
          const dataArr = await dataRes.json().catch(() => [])
          const objFiltered  = isBuiltIn ? objArr.filter(p => isBFOorCCO(p?.uri))  : objArr
          const dataFiltered = isBuiltIn ? dataArr.filter(p => isBFOorCCO(p?.uri)) : dataArr
          setPropertyResults(objFiltered.length ? [RDF_TYPE, CCO_IS_ABOUT, ...objFiltered] : fallbackProperties)
          setDataPropertyResults(dataFiltered)
        } catch {}

        showToast(`Framework set: ${id} (${data.triples?.toLocaleString()} triples)`)
      }
    } catch (err) {
      showToast(`Framework change failed: ${err.message}`)
    }
  }, [showToast])

  const handleFrameworkUpload = useCallback(async (data) => {
    setUserOntologies(prev => [...prev, { id: data.id, label: data.label, role: data.role, triples: data.triples }])
    showToast(`Ontology "${data.label}" uploaded (${data.triples?.toLocaleString()} triples). Select it under Ontology Framework to browse and search it.`)
  }, [showToast])

  // ══════════════════════════════════════════════════════════════════════════
  // BROWSER PANEL "Add to Canvas"
  // ══════════════════════════════════════════════════════════════════════════

  const handleBrowserAddToCanvas = useCallback((classItem) => {
    if (canvasApiRef.current?.addNodeFromClass) {
      canvasApiRef.current.addNodeFromClass(classItem)
      showToast(`Added "${classItem.label}" to canvas`)
    }
  }, [showToast])

  // ══════════════════════════════════════════════════════════════════════════
  // MERMAID EXPORT
  // ══════════════════════════════════════════════════════════════════════════

  const handleGenerateMermaid = useCallback(async () => {
    try {
      const res  = await fetch('/generate_mermaid', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ nodes: latestNodesRef.current, edges: latestEdgesRef.current }),
      })
      const data = await res.json()
      setMermaidSyntax(data.mermaid || '')
      setShowMermaidModal(true)
    } catch (err) {
      showToast(`Mermaid export failed: ${err.message}`)
    }
  }, [showToast])

  // ══════════════════════════════════════════════════════════════════════════
  // ANNOTATION CLICK / EDIT / DELETE
  // ══════════════════════════════════════════════════════════════════════════

  const handleParagraphClick = useCallback((para) => {
    setActiveParagraph(para)
    setShowParaLinkModal(true)
  }, [])

  const handleAnnotationClick = useCallback((ann) => {
    setActiveAnnotation(ann)
    setShowAnnotationModal(true)
  }, [])

  const handleAnnotationDelete = useCallback(() => {
    if (!activeAnnotation) return
    setAnnotations(prev => prev.filter(a => a.id !== activeAnnotation.id))
    setShowAnnotationModal(false)
    setActiveAnnotation(null)
    showToast('Annotation deleted')
  }, [activeAnnotation, showToast])

  const handleAnnotationEdit = useCallback(() => {
    // Close the options modal and re-open the TagModal pre-filled with the existing annotation
    // so the user can pick a new class. On confirm we replace the annotation in-place.
    setShowAnnotationModal(false)
    setPendingSelection({
      text:       activeAnnotation.text,
      start_char: activeAnnotation.start_char,
      end_char:   activeAnnotation.end_char,
      page_num:   activeAnnotation.page_num,
      para_id:    activeAnnotation.para_id,
      editing_id: activeAnnotation.id,   // signals App to replace rather than append
    })
    setShowTagModal(true)
  }, [activeAnnotation])

  // ══════════════════════════════════════════════════════════════════════════
  // CLEAR ALL
  // ══════════════════════════════════════════════════════════════════════════
  // CLEAR ALL
  // ══════════════════════════════════════════════════════════════════════════

  const handleValidate = useCallback(async () => {
    try {
      const res  = await fetch('/validate_annotations', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ annotations, nodes }),
      })
      const data = await res.json()
      setValidationResults(data)
      setShowValidationModal(true)
    } catch (err) { showToast(`Validation failed: ${err.message}`) }
  }, [annotations, nodes, showToast])

  const handleCrossDocCheck = useCallback(() => {
    if (documents.length < 2) {
      showToast('Open at least 2 documents to check cross-document consistency')
      return
    }

    // Build term → class map per document, compare against the active doc
    const current = documents[activeDocIndex]
    const currentMap = {}
    for (const ann of current.annotations || []) {
      const t = (ann.text || '').toLowerCase().trim()
      if (t && ann.class_uri) (currentMap[t] = currentMap[t] || new Set()).add(ann.class_uri)
    }

    const conflicts = []
    documents.forEach((doc, idx) => {
      if (idx === activeDocIndex) return
      const otherMap = {}
      for (const ann of doc.annotations || []) {
        const t = (ann.text || '').toLowerCase().trim()
        if (t && ann.class_uri) (otherMap[t] = otherMap[t] || new Set()).add(ann.class_uri)
      }
      for (const term in currentMap) {
        if (otherMap[term]) {
          const curClasses   = [...currentMap[term]]
          const otherClasses = [...otherMap[term]]
          const differing = curClasses.some(c => !otherClasses.includes(c)) ||
                             otherClasses.some(c => !curClasses.includes(c))
          if (differing) {
            conflicts.push({
              term,
              current_doc: current.filename,
              other_doc:   doc.filename,
              other_filename: doc.filename,
              current_classes: curClasses,
              other_classes:   otherClasses,
              message: `"${term}" tagged as ${curClasses.map(tail).join(', ')} in ${current.filename} but ${otherClasses.map(tail).join(', ')} in ${doc.filename}`,
            })
          }
        }
      }
    })

    setCrossDocResults({ conflict_count: conflicts.length, conflicts, different_from: [] })
    setShowCrossDocModal(true)
  }, [documents, activeDocIndex, showToast])

  const handlePreAnnotate = useCallback(async () => {
    if (!paragraphs.length) { showToast('Load a document first'); return }
    setSuggestionsLoading(true)
    try {
      const res  = await fetch('/pre_annotate', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ paragraphs }),
      })
      const data = await res.json()
      if (data.error) { showToast(data.error); return }
      setSuggestions(data.suggestions || [])
      showToast(`${data.suggestion_count} suggestions generated`)
    } catch (err) { showToast(`Pre-annotation failed: ${err.message}`) }
    finally { setSuggestionsLoading(false) }
  }, [paragraphs, showToast])

  const handleConfirmSuggestion = useCallback((suggestion) => {
    const confirmed = { ...suggestion, confirmed: true, id: uid('ann'), is_suggestion: false }
    setSuggestions(prev => prev.filter(s => s.id !== suggestion.id))
    setAnnotations(prev => [...prev, confirmed])
    const alreadyOnCanvas = latestNodesRef.current.some(n => n.data?.uri === confirmed.class_uri)
    if (!alreadyOnCanvas) addStandaloneNode(confirmed.class_uri, confirmed.class_label, false)
  }, [setAnnotations])

  const handleDismissSuggestion = useCallback((suggestionId) => {
    setSuggestions(prev => prev.filter(s => s.id !== suggestionId))
  }, [])

  const handleClearDocument = useCallback(() => {
    if (!activeDoc) return
    if (!window.confirm(`Close "${activeDoc.filename}" and remove its annotations?`)) return
    handleCloseTab(activeDocIndex)
    showToast('Document closed')
  }, [activeDoc, activeDocIndex, handleCloseTab, showToast])

  const handleClearAll = useCallback(() => {
    if (!window.confirm('Clear all nodes, edges, and annotations?')) return
    setNodes([])
    setEdges([])
    setAnnotations([])
    setParaLinks([])
    resetColorMap()
    showToast('Cleared')
  }, [showToast])

  // ══════════════════════════════════════════════════════════════════════════
  // RENDER
  // ══════════════════════════════════════════════════════════════════════════

  return (
    <div style={{
      height:         '100vh',
      display:        'flex',
      flexDirection:  'column',
      fontFamily:     "Tahoma, 'Segoe UI', Geneva, Verdana, sans-serif",
      background:     SEAFOAM.chrome,
      overflow:       'hidden',
    }}>
      <GlobalStyle />

      {/* ── Title bar ── */}
      <div style={{
        background:      `linear-gradient(90deg, ${SEAFOAM.accentDark} 0%, ${SEAFOAM.accentMid} 100%)`,
        color:           SEAFOAM.accentText,
        padding:         '3px 8px',
        display:         'flex',
        alignItems:      'center',
        justifyContent:  'space-between',
        borderBottom:    `2px solid ${SEAFOAM.borderOuter}`,
        userSelect:      'none',
      }}>
        <span style={{ fontWeight: 'bold', fontSize: '13px', letterSpacing: '0.02em' }}>
          Ontology Annotation Workbench
        </span>
        <span style={{ fontSize: '11px', opacity: 0.85 }}>{new Date().toLocaleString()}</span>
      </div>

      {/* ── Toolbar ── */}
      <div style={{
        padding:      '5px 8px',
        borderBottom: `2px ridge ${SEAFOAM.borderOuter}`,
        display:      'flex',
        gap:          '4px',
        alignItems:   'center',
        background:   SEAFOAM.chromeMid,
        flexWrap:     'wrap',
      }}>
        {/* Load Document */}
        <label style={{ ...retroTheme.button, display: 'inline-flex', alignItems: 'center' }}>
          {docLoading ? 'Loading...' : 'Load Document'}
          <input type="file" accept=".pdf,.docx" style={{ display: 'none' }}
            onChange={handleDocumentUpload} disabled={docLoading} />
        </label>
        {docName && (
          <button style={retroTheme.dangerButton} onClick={handleClearDocument}>
            Close Document
          </button>
        )}

        {/* Ontology Framework */}
        <button style={retroTheme.button}
          onClick={() => setShowFrameworkModal(true)}>
          Ontology Framework
          {activeFramework !== 'bfo_cco' && (
            <span style={{ marginLeft: '4px', fontSize: '9px', background: SEAFOAM.accentMid, color: '#fff', padding: '1px 3px', borderRadius: '2px' }}>
              {activeFramework.toUpperCase()}
            </span>
          )}
        </button>

        {/* Browse */}
        <button style={retroTheme.button}
          onClick={() => setShowBrowserPanel(v => !v)}>
          {showBrowserPanel ? 'Hide Browser' : 'Browse Ontology'}
        </button>

        <div style={{ width: '1px', height: '20px', background: SEAFOAM.borderInner, margin: '0 2px' }} />

        {/* Connect paragraphs */}
        {paragraphs.length > 0 && (
          <button style={retroTheme.button}
            onClick={() => setShowConnectParasModal(true)}>
            Connect Paragraphs
            {paraLinks.length > 0 && (
              <span style={{ marginLeft: '4px', fontSize: '9px', background: SEAFOAM.accentMid, color: '#fff', padding: '1px 3px', borderRadius: '2px' }}>
                {paraLinks.length}
              </span>
            )}
          </button>
        )}

        <div style={{ width: '1px', height: '20px', background: SEAFOAM.borderInner, margin: '0 2px' }} />

        {/* Export */}
        <button style={retroTheme.accentButton}
          onClick={() => setShowExportModal(true)}>
          Export
        </button>
        <button style={retroTheme.button}
          onClick={handleGenerateMermaid}>
          Generate Model
        </button>
        <button style={{ ...retroTheme.button, ...(suggestionsLoading ? { opacity: 0.6 } : {}) }}
          onClick={handlePreAnnotate}
          disabled={!paragraphs.length || suggestionsLoading}
          title="Run NLP pre-annotation (requires spaCy en_core_web_sm)">
          {suggestionsLoading ? 'Annotating...' : 'Pre-Annotate'}
        </button>
        <button style={retroTheme.button}
          onClick={handleValidate}
          disabled={!annotations.length}
          title="Check annotations for ontological inconsistencies">
          Validate
        </button>
        <button style={retroTheme.button}
          onClick={handleCrossDocCheck}
          disabled={documents.length < 2}
          title="Check tagging consistency across open documents">
          Cross-Doc{documents.length > 1 ? ` (${documents.length})` : ''}
        </button>

        {/* Stats */}
        <div style={{ marginLeft: 'auto', fontSize: '10px', color: '#2a4a38', display: 'flex', gap: '8px', alignItems: 'center' }}>
          {docName && <span>{docName}</span>}
          {annotations.length > 0 && <span>{annotations.length} annotations</span>}
          <span>{nodes.length} nodes · {edges.length} edges</span>
        </div>

        {/* Clear */}
        <button style={{ ...retroTheme.dangerButton, marginLeft: '4px' }}
          onClick={handleClearAll}>
          Clear
        </button>
      </div>

      {/* ── Main content: left (ontology editor) + right (document) ── */}
      <div style={{ flex: 1, display: 'flex', overflow: 'hidden' }}>

        {/* LEFT: Ontology Editor */}
        <div style={{
          width:        '48%',
          borderRight:  `2px ridge ${SEAFOAM.borderOuter}`,
          display:      'flex',
          flexDirection:'column',
          background:   SEAFOAM.chrome,
        }}>
          {/* Pane header + mode tabs */}
          <div style={{
            background:      `linear-gradient(90deg, ${SEAFOAM.accentDark} 0%, ${SEAFOAM.accentMid} 100%)`,
            color:           SEAFOAM.accentText,
            padding:         '2px 7px',
            fontSize:        '10px',
            fontWeight:      'bold',
            display:         'flex',
            justifyContent:  'space-between',
            alignItems:      'center',
          }}>
            <span>Ontology Editor</span>
            <div style={{ display: 'flex', gap: '2px' }}>
              {['build', 'annotations'].map(m => (
                <button key={m} style={{
                  ...retroTheme.button,
                  fontSize:   '9px',
                  padding:    '1px 8px',
                  margin:     0,
                  background: canvasMode === m ? '#f0f5f2' : SEAFOAM.chromeDark,
                  color:      canvasMode === m ? SEAFOAM.accentDark : SEAFOAM.accentText,
                  fontWeight: canvasMode === m ? 'bold' : 600,
                  borderBottom: canvasMode === m ? 'none' : undefined,
                }}
                  onMouseDown={() => setCanvasMode(m)}>
                  {m === 'build' ? 'Build' : 'From Annotations'}
                </button>
              ))}
            </div>
          </div>

          {/* Canvas sub-toolbar */}
          <div style={{
            padding:      '3px 6px',
            borderBottom: `1px solid ${SEAFOAM.borderInner}`,
            display:      'flex',
            gap:          '3px',
            background:   SEAFOAM.chromeDark,
            alignItems:   'center',
          }}>
            {canvasMode === 'build' ? (
              <>
                <button style={{ ...retroTheme.button, fontSize: '9px', padding: '2px 8px' }}
                  onClick={() => {
                    setShowCustomModal(true)
                    setSelectedNode(latestNodesRef.current[latestNodesRef.current.length - 1] || null)
                  }}>
                  + Class
                </button>
                <button style={{ ...retroTheme.button, fontSize: '9px', padding: '2px 8px' }}
                  onClick={() => {
                    if (!selectedNode) { showToast('Select a node first to connect from.'); return }
                    setPropertyModalMode('connectExisting')
                    setChosenProperty(null)
                    setSelectedTargetNodeId('')
                    setShowPropertyModal(true)
                  }}>
                  + Property
                </button>
                <button style={{ ...retroTheme.button, fontSize: '9px', padding: '2px 8px', marginLeft: 'auto' }}
                  onClick={() => canvasApiRef.current?.fitView?.()}>
                  Fit View
                </button>
              </>
            ) : (
              <>
                <span style={{ fontSize: '9px', color: '#2a4a38' }}>
                  Auto-generated from {annotations.length} annotations
                </span>
                <button style={{ ...retroTheme.button, fontSize: '9px', padding: '2px 8px', marginLeft: 'auto' }}
                  onClick={syncCanvasFromAnnotations}>
                  Sync
                </button>
                <button style={{ ...retroTheme.button, fontSize: '9px', padding: '2px 8px' }}
                  onClick={() => setCanvasMode('build')}>
                  Promote to Build
                </button>
              </>
            )}
          </div>

          {/* ReactFlow canvas */}
          <ReactFlowProvider>
            <OntologyCanvas
              ref={canvasApiRef}
              nodes={nodes}
              edges={stableEdges}
              onNodesChange={onNodesChange}
              onEdgesChange={onEdgesChange}
              onConnect={onConnect}
              onNodeClick={handleNodeClick}
              onEdgeContextMenu={handleEdgeContextMenu}
              setNodes={setNodes}
              setEdges={setEdges}
              mode={canvasMode}
              annotations={annotations}
              showToast={showToast}
            />
          </ReactFlowProvider>
        </div>

        {/* RIGHT: Document Annotator */}
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', background: '#fafbfa' }}>
          {/* Pane header */}
          <div style={{
            background:  `linear-gradient(90deg, ${SEAFOAM.accentDark} 0%, ${SEAFOAM.accentMid} 100%)`,
            color:       SEAFOAM.accentText,
            padding:     '2px 7px',
            fontSize:    '10px',
            fontWeight:  'bold',
            display:     'flex',
            justifyContent: 'space-between',
            alignItems:  'center',
          }}>
            <span>Document Annotator{docName ? ` — ${docName}` : ''}</span>
            {paragraphs.length > 0 && (
              <span style={{ fontSize: '9px', opacity: 0.8 }}>
                {paragraphs.length} paragraphs · {annotations.length} tagged
              </span>
            )}
          </div>

          {/* Document tabs */}
          <DocumentTabs
            documents={documents}
            activeIndex={activeDocIndex}
            onSelectTab={handleSelectTab}
            onCloseTab={handleCloseTab}
          />

          {/* Document body */}
          <DocumentPanel
            paragraphs={paragraphs}
            annotations={annotations}
            suggestions={suggestions}
            onTextSelected={handleTextSelected}
            onAnnotationClick={handleAnnotationClick}
            onParagraphClick={handleParagraphClick}
            onConfirmSuggestion={handleConfirmSuggestion}
            onDismissSuggestion={handleDismissSuggestion}
            paraLinks={paraLinks}
            filename={docName}
          />

          {/* Annotation color legend */}
          {annotations.length > 0 && (
            <div style={{
              padding:     '4px 10px',
              borderTop:   `1px solid ${SEAFOAM.borderInner}`,
              background:  '#f0f5f2',
              display:     'flex',
              gap:         '8px',
              flexWrap:    'wrap',
            }}>
              {Array.from(new Set(annotations.map(a => a.class_uri))).map(uri => {
                const color = getClassColor(uri)
                const label = annotations.find(a => a.class_uri === uri)?.class_label || tail(uri)
                return (
                  <div key={uri} style={{ display: 'flex', alignItems: 'center', gap: '3px' }}>
                    <span style={{
                      width:        '9px',
                      height:       '9px',
                      borderRadius: '1px',
                      background:   color.fill,
                      border:       `1px solid ${color.border}`,
                      display:      'inline-block',
                      flexShrink:   0,
                    }} />
                    <span style={{ fontSize: '9px', color: '#333' }}>{label}</span>
                  </div>
                )
              })}
            </div>
          )}
        </div>
      </div>

      {/* ── Status bar ── */}
      <div style={{
        background:   SEAFOAM.chrome,
        borderTop:    `2px ridge ${SEAFOAM.borderOuter}`,
        padding:      '2px 10px',
        fontSize:     '9px',
        color:        '#2a4a38',
        display:      'flex',
        justifyContent:'space-between',
      }}>
        <span>
          {annotations.length} spans tagged · {nodes.length} classes · {edges.length} properties ·{' '}
          {paragraphs.length} paragraphs
          {paraLinks.length > 0 ? ` · ${paraLinks.length} para links` : ''}
        </span>
        <span>
          Framework: {activeFramework.toUpperCase()}
          {docName ? ` · ${docName}` : ''}
        </span>
      </div>

      {/* ── Modals ── */}
      <TagModal
        show={showTagModal}
        selection={pendingSelection}
        nodes={nodes}
        onConfirm={handleTagConfirm}
        onClose={() => { setShowTagModal(false); setPendingSelection(null) }}
      />

      <CustomClassModal
        show={showCustomModal}
        onConfirm={handleCustomClassConfirm}
        onClose={() => setShowCustomModal(false)}
      />

      <PropertyModal
        show={showPropertyModal}
        mode={propertyModalMode}
        sourceNode={selectedNode}
        targetNodeId={selectedTargetNodeId}
        nodes={nodes}
        propertyResults={propertyResults}
        dataPropertyResults={dataPropertyResults}
        edgeBeingEdited={edgeBeingEdited}
        onConfirm={handlePropertyConfirm}
        onClose={() => {
          setShowPropertyModal(false)
          setChosenProperty(null)
          setSelectedTargetNodeId('')
          setPropertyModalMode(null)
          setEdgeBeingEdited(null)
        }}
      />

      <NodeOptionsModal
        show={showNodeOptions}
        selectedNode={selectedNode}
        onClose={() => setShowNodeOptions(false)}
        onAddLinkedNode={() => {
          setPropertyModalMode('newFromNode')
          setShowNodeOptions(false)
          setShowCustomModal(true)   // go via custom or class search
        }}
        onConnectExisting={() => {
          setPropertyModalMode('connectExisting')
          setChosenProperty(null)
          setSelectedTargetNodeId('')
          setShowPropertyModal(true)
        }}
        onDeleteNode={handleDeleteNode}
        onEditLabel={handleEditLabel}
        onCustomClass={() => {
          setShowCustomModal(true)
          setPropertyModalMode('newFromNode')
        }}
        onSelectExisting={() => {
          setPropertyModalMode('connectExisting')
          setChosenProperty(null)
          setShowPropertyModal(true)
        }}
      />

      <OntologyFrameworkModal
        show={showFrameworkModal}
        activeFramework={activeFramework}
        builtInFrameworks={builtInFrameworks}
        userOntologies={userOntologies}
        onSelectFramework={handleSelectFramework}
        onUpload={handleFrameworkUpload}
        onClose={() => setShowFrameworkModal(false)}
      />

      <ConnectParagraphsModal
        show={showConnectParasModal}
        paragraphs={paragraphs}
        paraLinks={paraLinks}
        onConnect={(src, tgt) => {
          setParaLinks(prev => {
            if (prev.some(l => l.source_para === src && l.target_para === tgt)) return prev
            return [...prev, { source_para: src, target_para: tgt, property_uri: '' }]
          })
          showToast(`Linked ${src.replace('_', ' ')} ↔ ${tgt.replace('_', ' ')}`)
        }}
        onDisconnect={(i) => setParaLinks(prev => prev.filter((_, idx) => idx !== i))}
        onClose={() => setShowConnectParasModal(false)}
      />

      <ExportModal
        show={showExportModal}
        docId={docId}
        filename={docName}
        nodes={nodes}
        edges={edges}
        annotations={annotations}
        paraLinks={paraLinks}
        paragraphs={paragraphs}
        onClose={() => setShowExportModal(false)}
      />

      <MermaidModal
        show={showMermaidModal}
        syntax={mermaidSyntax}
        onClose={() => setShowMermaidModal(false)}
      />

      <EdgeContextMenu
        edgeContext={edgeContext}
        onChangeProperty={() => {
          setPropertyModalMode('editEdge')
          setShowPropertyModal(true)
          setEdgeContext(null)
        }}
        onDeleteEdge={() => {
          if (edgeBeingEdited?.edge?.id) {
            setEdges(prev => prev.filter(e => e.id !== edgeBeingEdited.edge.id))
            showToast('Edge deleted')
          }
          setEdgeBeingEdited(null)
          setEdgeContext(null)
        }}
      />

      <ValidationModal
        show={showValidationModal}
        results={validationResults}
        onClose={() => setShowValidationModal(false)}
      />

      <CrossDocModal
        show={showCrossDocModal}
        results={crossDocResults}
        onClose={() => setShowCrossDocModal(false)}
        onExportDifferentFrom={() => {}}
      />

      <Toast message={toast} />

      <AnnotationOptionsModal
        show={showAnnotationModal}
        annotation={activeAnnotation}
        onEdit={handleAnnotationEdit}
        onDelete={handleAnnotationDelete}
        onClose={() => { setShowAnnotationModal(false); setActiveAnnotation(null) }}
      />

      <ParagraphLinkModal
        show={showParaLinkModal}
        para={activeParagraph}
        paragraphs={paragraphs}
        paraLinks={paraLinks}
        onConnect={(src, tgt) => {
          setParaLinks(prev => {
            if (prev.some(l => l.source_para === src && l.target_para === tgt)) return prev
            return [...prev, { source_para: src, target_para: tgt, property_uri: '' }]
          })
          showToast(`Paragraphs linked`)
        }}
        onDisconnect={(i) => setParaLinks(prev => prev.filter((_, idx) => idx !== i))}
        onClose={() => { setShowParaLinkModal(false); setActiveParagraph(null) }}
      />

      {/* Ontology Browser Panel — left-side slide-out */}
      <OntologyBrowserPanel
        show={showBrowserPanel}
        activeTab={browserActiveTab}
        setActiveTab={setBrowserActiveTab}
        classHierarchy={browserClassHierarchy}
        objectProperties={browserObjectProps}
        dataProperties={browserDataProps}
        selectedClass={browserSelectedClass}
        setSelectedClass={setBrowserSelectedClass}
        selectedProperty={browserSelectedProperty}
        setSelectedProperty={setBrowserSelectedProperty}
        classDetails={browserClassDetails}
        propertyDetails={browserPropertyDetails}
        expandedClasses={browserExpandedClasses}
        setExpandedClasses={setBrowserExpandedClasses}
        onAddToCanvas={handleBrowserAddToCanvas}
        onClose={() => setShowBrowserPanel(false)}
      />
    </div>
  )
}
