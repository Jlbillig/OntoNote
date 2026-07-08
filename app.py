print("[DEBUG] Running app from:", __file__)

from flask import Flask, request, jsonify, send_from_directory, Response
from rdflib import Graph as RDFGraph, Dataset, Namespace as RDFNamespace, RDF, RDFS, OWL, XSD
from rdflib import URIRef, Literal
from flask_cors import CORS
import os
import uuid
import json
import traceback
import tempfile
import types
from owlready2 import *


# ── PDF / DOCX extraction ──────────────────────────────────────────────────────

from pdfminer.high_level import extract_pages
from pdfminer.layout import LTTextBox, LTTextLine, LTChar
import docx


# ── Flask init ─────────────────────────────────────────────────────────────────

app = Flask(__name__, static_folder="static", static_url_path="/static")
CORS(app)
os.makedirs("uploads", exist_ok=True)


# ── Ontology loading ───────────────────────────────────────────────────────────
#
# The base graph always loads BFO + CCO if present.
# Additional ontology files uploaded by the user are stored in `user_graphs`.
# The active search graph is rebuilt when the framework selection changes.

ONTOLOGY_DIR = os.path.dirname(__file__)
BFO_PATH  = os.path.join(ONTOLOGY_DIR, "bfo-core.ttl")
CCO_PATH  = os.path.join(ONTOLOGY_DIR, "CommonCoreOntologiesMerged.ttl")

# base_graphs: keyed by framework id → RDFGraph
base_graphs = {}

def _load_base(key, *paths):
    g = RDFGraph()
    for p in paths:
        if os.path.exists(p):
            try:
                g.parse(p, format="turtle")
                print(f"[INFO] Loaded {p} into framework '{key}'")
            except Exception as e:
                print(f"[WARN] Could not load {p}: {e}")
    return g

base_graphs["none"]    = RDFGraph()                         # no framework
base_graphs["bfo"]     = _load_base("bfo",  BFO_PATH)
base_graphs["cco"]     = _load_base("cco",  CCO_PATH)      # CCO internally imports BFO
base_graphs["bfo_cco"] = _load_base("bfo_cco", BFO_PATH, CCO_PATH)

# user-uploaded ontologies: list of {"id", "label", "graph", "role"}
user_ontologies = []

# active search graph: what the /ontology_search and /classes endpoints query
active_graph = base_graphs["none"]
active_framework = "none"

print(f"[INFO] Default framework 'bfo_cco' loaded — {len(active_graph)} triples")


# ── Namespaces ─────────────────────────────────────────────────────────────────

BFO = RDFNamespace("http://purl.obolibrary.org/obo/BFO_")
CCO = RDFNamespace("http://www.ontologyrepository.com/CommonCoreOntologies/")
NIF = RDFNamespace("http://persistence.uni-leipzig.org/nlp2rdf/ontologies/nif-core#")
NLT = RDFNamespace("http://ontotron-nlp.org/annotation/")  # tool-internal namespace

# CCO has_text_value data property URI (verified from CommonCoreOntologiesMerged.ttl)
CCO_HAS_TEXT_VALUE = URIRef("https://www.commoncoreontologies.org/ont00001765")
# CCO Information Bearing Entity class
CCO_IBE = URIRef("https://www.commoncoreontologies.org/ont00000253")
# BFO Generically Dependent Continuant (parent of ICE)
BFO_GDC = URIRef("http://purl.obolibrary.org/obo/BFO_0000031")


# ── Cache disable ──────────────────────────────────────────────────────────────

@app.after_request
def disable_cache(resp):
    resp.headers["Cache-Control"] = "no-store, no-cache, must-revalidate, max-age=0"
    resp.headers["Pragma"]        = "no-cache"
    resp.headers["Expires"]       = "0"
    return resp


# ── Static serving ─────────────────────────────────────────────────────────────

@app.route("/static/<path:filename>")
def serve_static(filename):
    return send_from_directory("static", filename)

@app.route("/assets/<path:filename>")
def serve_assets(filename):
    return send_from_directory("static/dist/assets", filename)

@app.route("/")
def index():
    return send_from_directory("static/dist", "index.html")


# ══════════════════════════════════════════════════════════════════════════════
# ONTOLOGY FRAMEWORK ENDPOINTS
# ══════════════════════════════════════════════════════════════════════════════

@app.route("/framework/list", methods=["GET"])
def framework_list():
    """Return available built-in frameworks + user-uploaded ontologies."""
    built_in = [
        {"id": "none",    "label": "None (custom only)",      "triples": len(base_graphs["none"])},
        {"id": "bfo",     "label": "BFO only",                "triples": len(base_graphs["bfo"])},
        {"id": "cco",     "label": "CCO (includes BFO)",      "triples": len(base_graphs["cco"])},
        {"id": "bfo_cco", "label": "BFO + CCO (recommended)", "triples": len(base_graphs["bfo_cco"])},
    ]
    user = [
        {"id": u["id"], "label": u["label"], "role": u["role"], "triples": len(u["graph"])}
        for u in user_ontologies
    ]
    return jsonify({
        "built_in": built_in,
        "user": user,
        "active": active_framework
    })


@app.route("/framework/set", methods=["POST"])
def framework_set():
    """Switch the active search graph to a built-in framework or user ontology."""
    global active_graph, active_framework
    data = request.get_json(force=True)
    fid  = data.get("id", "bfo_cco")

    if fid in base_graphs:
        # Optionally merge user ontologies on top
        merged = RDFGraph()
        for t in base_graphs[fid]:
            merged.add(t)
        for u in user_ontologies:
            for t in u["graph"]:
                merged.add(t)
        active_graph     = merged
        active_framework = fid
        print(f"[INFO] Framework set to '{fid}' — {len(active_graph)} triples")
        return jsonify({"success": True, "active": fid, "triples": len(active_graph)})

    # Check user ontologies
    for u in user_ontologies:
        if u["id"] == fid:
            active_graph     = u["graph"]
            active_framework = fid
            print(f"[INFO] Framework set to user ontology '{u['label']}' — {len(active_graph)} triples")
            return jsonify({"success": True, "active": fid, "triples": len(active_graph)})

    return jsonify({"error": f"Unknown framework id: {fid}"}), 400


@app.route("/framework/upload", methods=["POST"])
def framework_upload():
    """
    Upload a user-provided ontology file (.ttl, .owl, .rdf).
    Body: multipart with 'file', 'label', and 'role' (top_level | mid_level | domain).
    """
    global active_graph

    if "file" not in request.files:
        return jsonify({"error": "No file provided"}), 400

    f     = request.files["file"]
    label = request.form.get("label", f.filename)
    role  = request.form.get("role", "domain")

    filename  = f.filename.lower()
    ext_map   = {".ttl": "turtle", ".owl": "xml", ".rdf": "xml"}
    fmt       = next((v for k, v in ext_map.items() if filename.endswith(k)), None)

    if not fmt:
        return jsonify({"error": "Unsupported format. Use .ttl, .owl, or .rdf"}), 400

    tmp = tempfile.NamedTemporaryFile(delete=False, suffix=os.path.splitext(filename)[1])
    f.save(tmp.name)

    try:
        g = RDFGraph()
        g.parse(tmp.name, format=fmt)
        print(f"[INFO] User ontology '{label}' loaded — {len(g)} triples")
    except Exception as e:
        os.unlink(tmp.name)
        return jsonify({"error": f"Failed to parse ontology: {str(e)}"}), 500
    finally:
        try:
            os.unlink(tmp.name)
        except Exception:
            pass

    uid = str(uuid.uuid4())[:8]
    user_ontologies.append({"id": uid, "label": label, "role": role, "graph": g})

    # Merge into active graph immediately
    for triple in g:
        active_graph.add(triple)
    print(f"[INFO] Merged user ontology into active graph — now {len(active_graph)} triples")

    return jsonify({
        "success": True,
        "id": uid,
        "label": label,
        "role": role,
        "triples": len(g)
    })


# ══════════════════════════════════════════════════════════════════════════════
# ONTOLOGY BROWSING ENDPOINTS  (ported from ONTO-TRON-5000, unchanged)
# ══════════════════════════════════════════════════════════════════════════════

@app.route("/classes")
def get_classes():
    classes = []
    for cls in active_graph.subjects(RDF.type, OWL.Class):
        if not isinstance(cls, URIRef):
            continue
        label = next(active_graph.objects(cls, RDFS.label), None)
        parent = next(
            (str(sc) for sc in active_graph.objects(cls, RDFS.subClassOf) if isinstance(sc, URIRef)),
            None
        )
        classes.append({
            "uri":    str(cls),
            "label":  str(label) if label else str(cls).split("/")[-1].split("#")[-1],
            "parent": parent
        })
    return jsonify(classes)


@app.route("/class_details")
def class_details():
    uri = request.args.get("uri")
    if not uri:
        return jsonify({"error": "URI required"}), 400
    try:
        u = URIRef(uri)
        details = {"uri": uri, "label": None, "definition": None,
                   "parents": [], "equivalentClasses": [], "disjointWith": []}

        details["label"] = str(next(active_graph.objects(u, RDFS.label), "")) or None

        defn_preds = [
            URIRef("http://purl.obolibrary.org/obo/IAO_0000115"),
            URIRef("http://www.w3.org/2004/02/skos/core#definition"),
            RDFS.comment,
        ]
        for pred in defn_preds:
            v = next(active_graph.objects(u, pred), None)
            if v:
                details["definition"] = str(v)
                break

        for p in active_graph.objects(u, RDFS.subClassOf):
            if isinstance(p, URIRef):
                lbl = next(active_graph.objects(p, RDFS.label), None)
                details["parents"].append({
                    "uri":   str(p),
                    "label": str(lbl) if lbl else str(p).split("/")[-1].split("#")[-1]
                })

        OWL_eq = URIRef("http://www.w3.org/2002/07/owl#equivalentClass")
        for e in active_graph.objects(u, OWL_eq):
            if isinstance(e, URIRef):
                lbl = next(active_graph.objects(e, RDFS.label), None)
                details["equivalentClasses"].append({
                    "uri":   str(e),
                    "label": str(lbl) if lbl else str(e).split("/")[-1].split("#")[-1]
                })

        OWL_dj = URIRef("http://www.w3.org/2002/07/owl#disjointWith")
        for d in active_graph.objects(u, OWL_dj):
            if isinstance(d, URIRef):
                lbl = next(active_graph.objects(d, RDFS.label), None)
                details["disjointWith"].append({
                    "uri":   str(d),
                    "label": str(lbl) if lbl else str(d).split("/")[-1].split("#")[-1]
                })

        return jsonify(details)
    except Exception as e:
        traceback.print_exc()
        return jsonify({"error": str(e)}), 500


@app.route("/property_details")
def property_details():
    uri = request.args.get("uri")
    if not uri:
        return jsonify({"error": "URI required"}), 400
    try:
        u = URIRef(uri)
        details = {"uri": uri, "label": None, "definition": None,
                   "domain": [], "range": [], "inverse": []}

        details["label"] = str(next(active_graph.objects(u, RDFS.label), "")) or None

        defn_preds = [
            URIRef("http://purl.obolibrary.org/obo/IAO_0000115"),
            URIRef("http://www.w3.org/2004/02/skos/core#definition"),
            RDFS.comment,
        ]
        for pred in defn_preds:
            v = next(active_graph.objects(u, pred), None)
            if v:
                details["definition"] = str(v)
                break

        for d in active_graph.objects(u, RDFS.domain):
            if isinstance(d, URIRef):
                lbl = next(active_graph.objects(d, RDFS.label), None)
                details["domain"].append({
                    "uri":   str(d),
                    "label": str(lbl) if lbl else str(d).split("/")[-1].split("#")[-1]
                })

        for r in active_graph.objects(u, RDFS.range):
            if isinstance(r, URIRef):
                lbl = next(active_graph.objects(r, RDFS.label), None)
                details["range"].append({
                    "uri":   str(r),
                    "label": str(lbl) if lbl else str(r).split("/")[-1].split("#")[-1]
                })

        OWL_inv = URIRef("http://www.w3.org/2002/07/owl#inverseOf")
        for inv in list(active_graph.objects(u, OWL_inv)) + list(active_graph.subjects(OWL_inv, u)):
            if isinstance(inv, URIRef):
                lbl = next(active_graph.objects(inv, RDFS.label), None)
                details["inverse"].append({
                    "uri":   str(inv),
                    "label": str(lbl) if lbl else str(inv).split("/")[-1].split("#")[-1]
                })

        return jsonify(details)
    except Exception as e:
        traceback.print_exc()
        return jsonify({"error": str(e)}), 500


@app.route("/object_properties")
def object_properties():
    props = []
    for prop in active_graph.subjects(RDF.type, OWL.ObjectProperty):
        if not isinstance(prop, URIRef):
            continue
        label  = next(active_graph.objects(prop, RDFS.label), None)
        parent = next(
            (str(sp) for sp in active_graph.objects(prop, RDFS.subPropertyOf) if isinstance(sp, URIRef)),
            None
        )
        props.append({
            "uri":    str(prop),
            "label":  str(label) if label else str(prop).split("/")[-1].split("#")[-1],
            "parent": parent
        })
    return jsonify(props)


@app.route("/data_properties")
def data_properties():
    props = []
    for prop in active_graph.subjects(RDF.type, OWL.DatatypeProperty):
        if not isinstance(prop, URIRef):
            continue
        label  = next(active_graph.objects(prop, RDFS.label), None)
        parent = next(
            (str(sp) for sp in active_graph.objects(prop, RDFS.subPropertyOf) if isinstance(sp, URIRef)),
            None
        )
        domains = [str(d) for d in active_graph.objects(prop, RDFS.domain) if isinstance(d, URIRef)]
        ranges  = [str(r) for r in active_graph.objects(prop, RDFS.range)  if isinstance(r, URIRef)]
        props.append({
            "uri":    str(prop),
            "label":  str(label) if label else str(prop).split("/")[-1].split("#")[-1],
            "parent": parent,
            "domain": domains,
            "range":  ranges
        })
    return jsonify(props)


@app.route("/ontology_search")
def ontology_search():
    term    = request.args.get("term", "").lower().strip()
    results = []
    if len(term) < 2:
        return jsonify(results)
    for s in active_graph.subjects(RDF.type, OWL.Class):
        label = next(active_graph.objects(s, RDFS.label), None)
        if label and term in str(label).lower():
            results.append({"uri": str(s), "label": str(label)})
        if len(results) >= 30:
            break
    return jsonify(results)


@app.route("/validate_property", methods=["POST"])
def validate_property():
    data  = request.get_json(force=True)
    prop  = data.get("property")
    valid = bool(prop)
    return jsonify({"valid": valid}), 200


# ══════════════════════════════════════════════════════════════════════════════
# DOCUMENT PROCESSING ENDPOINT
# ══════════════════════════════════════════════════════════════════════════════

def _extract_pdf_paragraphs(path):
    """
    Extract paragraphs from a PDF with character-level offsets.
    Returns list of {para_id, page_num, text, char_start, char_end, tokens[]}.
    A 'paragraph' is a contiguous LTTextBox (pdfminer's natural unit).
    """
    paragraphs = []
    global_offset = 0
    para_idx = 0

    for page_num, page_layout in enumerate(extract_pages(path), start=1):
        # Collect all text boxes on this page, sorted top-to-bottom
        boxes = sorted(
            [el for el in page_layout if isinstance(el, LTTextBox)],
            key=lambda b: -b.y1   # y1 is top edge; higher y1 = higher on page
        )
        for box in boxes:
            text = box.get_text().strip()
            if not text:
                continue

            char_start = global_offset
            char_end   = global_offset + len(text)

            # Build token list: split on whitespace, track offsets within paragraph
            tokens = []
            cursor = 0
            for word in text.split():
                pos = text.find(word, cursor)
                if pos == -1:
                    continue
                tokens.append({
                    "text":       word,
                    "start_char": global_offset + pos,
                    "end_char":   global_offset + pos + len(word),
                    "page_num":   page_num
                })
                cursor = pos + len(word)

            para_id = f"paragraph_{para_idx + 1}"
            paragraphs.append({
                "para_id":    para_id,
                "para_index": para_idx + 1,
                "page_num":   page_num,
                "text":       text,
                "char_start": char_start,
                "char_end":   char_end,
                "tokens":     tokens
            })

            global_offset = char_end + 1   # +1 for implicit whitespace between paras
            para_idx += 1

    return paragraphs


def _extract_docx_paragraphs(path):
    """
    Extract paragraphs from a DOCX file.
    python-docx gives us clean paragraph boundaries natively.
    Returns list of {para_id, page_num, text, char_start, char_end, tokens[]}.
    DOCX has no native page numbers so we use sequential index.
    """
    doc = docx.Document(path)
    paragraphs = []
    global_offset = 0
    para_idx = 0

    for para in doc.paragraphs:
        text = para.text.strip()
        if not text:
            continue

        char_start = global_offset
        char_end   = global_offset + len(text)

        tokens = []
        cursor = 0
        for word in text.split():
            pos = text.find(word, cursor)
            if pos == -1:
                continue
            tokens.append({
                "text":       word,
                "start_char": global_offset + pos,
                "end_char":   global_offset + pos + len(word),
                "page_num":   1   # DOCX page numbers require python-docx-oxml extensions
            })
            cursor = pos + len(word)

        para_id = f"paragraph_{para_idx + 1}"
        paragraphs.append({
            "para_id":    para_id,
            "para_index": para_idx + 1,
            "page_num":   1,
            "text":       text,
            "char_start": char_start,
            "char_end":   char_end,
            "tokens":     tokens
        })

        global_offset = char_end + 1
        para_idx += 1

    return paragraphs


@app.route("/upload_document", methods=["POST"])
def upload_document():
    """
    Accept a PDF or DOCX file.
    Returns: { doc_id, filename, format, paragraph_count, paragraphs[] }
    Each paragraph: { para_id, para_index, page_num, text, char_start, char_end, tokens[] }
    """
    if "file" not in request.files:
        return jsonify({"error": "No file provided"}), 400

    f        = request.files["file"]
    filename = f.filename.lower()

    if filename.endswith(".pdf"):
        fmt = "pdf"
    elif filename.endswith(".docx"):
        fmt = "docx"
    else:
        return jsonify({"error": "Unsupported format. Use .pdf or .docx"}), 400

    doc_id  = str(uuid.uuid4())[:12]
    save_path = os.path.join("uploads", f"{doc_id}_{f.filename}")
    f.save(save_path)

    try:
        if fmt == "pdf":
            paragraphs = _extract_pdf_paragraphs(save_path)
        else:
            paragraphs = _extract_docx_paragraphs(save_path)

        print(f"[INFO] Document '{f.filename}' → {len(paragraphs)} paragraphs extracted")

        return jsonify({
            "doc_id":          doc_id,
            "filename":        f.filename,
            "format":          fmt,
            "paragraph_count": len(paragraphs),
            "paragraphs":      paragraphs
        })

    except Exception as e:
        traceback.print_exc()
        return jsonify({"error": f"Document extraction failed: {str(e)}"}), 500


# ══════════════════════════════════════════════════════════════════════════════
# EXPORT ENDPOINTS
# ══════════════════════════════════════════════════════════════════════════════

# ── helpers ────────────────────────────────────────────────────────────────────

def _safe_uri(s):
    """Percent-encode spaces and other unsafe chars in a URI string."""
    return s.replace(" ", "_").replace("(", "").replace(")", "").replace("'", "")


def _span_ibe_uri(doc_id, span_id):
    return URIRef(f"http://ontotron-nlp.org/doc/{doc_id}/ibe/{span_id}")


def _span_ice_uri(doc_id, span_id):
    return URIRef(f"http://ontotron-nlp.org/doc/{doc_id}/ice/{span_id}")


def _para_uri(doc_id, para_id):
    return URIRef(f"http://ontotron-nlp.org/doc/{doc_id}/{para_id}")


def _doc_uri(doc_id):
    return URIRef(f"http://ontotron-nlp.org/doc/{doc_id}")


# ── /export_trig ───────────────────────────────────────────────────────────────

@app.route("/export_trig", methods=["POST"])
def export_trig():
    """
    Main annotation export in TriG format.

    Expected payload:
    {
      "doc_id": "...",
      "filename": "...",
      "nodes":   [ {id, label, uri} ],
      "edges":   [ {id, source, target, propertyUri, propertyLabel} ],
      "annotations": [
        {
          "id":             "ann_001",
          "text":           "regulation",
          "start_char":     5,
          "end_char":       15,
          "page_num":       1,
          "para_id":        "paragraph_1",
          "class_uri":      "https://www.commoncoreontologies.org/ont00000965",
          "class_label":    "Directive Information Content Entity",
          "assertion_type": "abox",         # "abox" | "tbox"
          "property_uri":   "",             # optional is_about target URI
          "property_label": ""
        }
      ],
      "para_links": [
        { "source_para": "paragraph_1", "target_para": "paragraph_3", "property_uri": "" }
      ]
    }

    Output structure:
    - Default graph: document IBE, paragraph IBEs, para-para links, ontology TBox
    - Named graph per paragraph: annotation triples for spans in that paragraph
    - Every span IBE gets cco:ont00001765 (has_text_value) automatically
    """
    data        = request.get_json(force=True)
    doc_id      = data.get("doc_id", "doc001")
    filename    = data.get("filename", "document")
    nodes       = data.get("nodes", [])
    edges       = data.get("edges", [])
    annotations = data.get("annotations", [])
    para_links  = data.get("para_links", [])

    ds = Dataset()

    # ── default graph: document + paragraph IBEs ───────────────────────────────
    default_g = ds.default_context

    doc_u = _doc_uri(doc_id)
    default_g.add((doc_u, RDF.type,    CCO_IBE))
    default_g.add((doc_u, RDFS.label,  Literal(filename)))

    # Collect unique paragraph IDs from annotations
    para_ids = sorted(set(a["para_id"] for a in annotations if a.get("para_id")))
    for para_id in para_ids:
        para_u = _para_uri(doc_id, para_id)
        default_g.add((para_u, RDF.type,      CCO_IBE))
        default_g.add((para_u, RDFS.label,    Literal(para_id.replace("_", " ").title())))
        # paragraph is part of document
        default_g.add((para_u,
                        URIRef("http://purl.obolibrary.org/obo/BFO_0000176"),
                        doc_u))

    # ── default graph: paragraph-to-paragraph links ────────────────────────────
    for link in para_links:
        src_u = _para_uri(doc_id, link["source_para"])
        tgt_u = _para_uri(doc_id, link["target_para"])
        prop  = URIRef(link.get("property_uri") or "http://ontotron-nlp.org/relatesTo")
        default_g.add((src_u, prop, tgt_u))

    # ── default graph: ontology TBox from canvas ───────────────────────────────
    for node in nodes:
        if not node.get("uri"):
            continue
        n_uri = URIRef(node["uri"])
        default_g.add((n_uri, RDF.type,    OWL.Class))
        default_g.add((n_uri, RDFS.label,  Literal(node.get("label", ""))))

    for edge in edges:
        src_node = next((n for n in nodes if n["id"] == edge["source"]), None)
        tgt_node = next((n for n in nodes if n["id"] == edge["target"]), None)
        if not src_node or not tgt_node:
            continue
        prop_uri = edge.get("propertyUri", "")
        if not prop_uri:
            continue
        default_g.add((
            URIRef(src_node["uri"]),
            URIRef(prop_uri),
            URIRef(tgt_node["uri"])
        ))

    # ── named graphs: one per paragraph, containing span triples ──────────────
    para_graphs = {}   # para_id → named graph

    for ann in annotations:
        para_id  = ann.get("para_id", "paragraph_unknown")
        span_id  = ann.get("id", str(uuid.uuid4())[:8])
        text     = ann.get("text", "")
        start    = ann.get("start_char", 0)
        end      = ann.get("end_char", 0)
        page     = ann.get("page_num", 1)
        cls_uri  = ann.get("class_uri", "")
        prop_uri = ann.get("property_uri", "")
        a_type   = ann.get("assertion_type", "abox")

        # Get or create named graph for this paragraph
        if para_id not in para_graphs:
            para_u = _para_uri(doc_id, para_id)
            para_graphs[para_id] = ds.graph(para_u)

        pg = para_graphs[para_id]

        # IBE individual (the physical text span as a bearer of information)
        ibe_u = _span_ibe_uri(doc_id, span_id)
        pg.add((ibe_u, RDF.type,      CCO_IBE))
        pg.add((ibe_u, CCO_HAS_TEXT_VALUE, Literal(text, datatype=XSD.string)))   # implicit, always
        pg.add((ibe_u, URIRef("http://persistence.uni-leipzig.org/nlp2rdf/ontologies/nif-core#beginIndex"),
                Literal(start, datatype=XSD.nonNegativeInteger)))
        pg.add((ibe_u, URIRef("http://persistence.uni-leipzig.org/nlp2rdf/ontologies/nif-core#endIndex"),
                Literal(end, datatype=XSD.nonNegativeInteger)))
        pg.add((ibe_u, NLT.pageNum, Literal(page, datatype=XSD.integer)))

        if cls_uri:
            # ICE individual (the abstract information content, typed by the user's assertion)
            ice_u = _span_ice_uri(doc_id, span_id)
            pg.add((ice_u, RDF.type, BFO_GDC))    # GDC is the BFO parent of ICE

            if a_type == "tbox":
                # User is defining/exemplifying the class itself
                pg.add((ice_u, RDF.type, OWL.Class))
                pg.add((ice_u, RDFS.label, Literal(text, datatype=XSD.string)))
                if cls_uri:
                    pg.add((URIRef(cls_uri), OWL.equivalentClass, ice_u))
            else:
                # ABox: this span is an instance of the class
                pg.add((ice_u, RDF.type, URIRef(cls_uri)))

            # Link IBE → ICE via BFO 'concretely manifests' approximation
            # (BFO_0000101 = is carrier of, per BFO 2020)
            pg.add((ibe_u, URIRef("http://purl.obolibrary.org/obo/BFO_0000101"), ice_u))

            # Optional is_about / user-selected property to a canvas entity
            if prop_uri:
                pg.add((ice_u, URIRef(prop_uri), URIRef(cls_uri)))

    # ── serialize ──────────────────────────────────────────────────────────────
    try:
        output = ds.serialize(format="trig")
    except Exception as e:
        traceback.print_exc()
        return jsonify({"error": f"TriG serialization failed: {str(e)}"}), 500

    return Response(
        output,
        status=200,
        mimetype="application/x-trig",
        headers={"Content-Disposition": f'attachment; filename="{doc_id}_annotations.trig"'}
    )


# ── /export_nif ────────────────────────────────────────────────────────────────

@app.route("/export_nif", methods=["POST"])
def export_nif():
    """
    Export annotations in NIF (Natural Language Interchange Format).
    Each span → nif:RFC5147String with beginIndex, endIndex, itsrdf:taClassRef.
    """
    data        = request.get_json(force=True)
    doc_id      = data.get("doc_id", "doc001")
    annotations = data.get("annotations", [])

    ITSRDF = RDFNamespace("https://www.w3.org/2005/11/its/rdf#")
    NIF_NS = RDFNamespace("http://persistence.uni-leipzig.org/nlp2rdf/ontologies/nif-core#")

    g = RDFGraph()
    g.bind("nif",    NIF_NS)
    g.bind("itsrdf", ITSRDF)
    g.bind("xsd",    XSD)

    doc_context_uri = f"http://ontotron-nlp.org/doc/{doc_id}#"

    for ann in annotations:
        span_id   = ann.get("id", str(uuid.uuid4())[:8])
        text      = ann.get("text", "")
        start     = ann.get("start_char", 0)
        end       = ann.get("end_char", 0)
        cls_uri   = ann.get("class_uri", "")

        span_uri = URIRef(f"{doc_context_uri}char={start},{end}")

        g.add((span_uri, RDF.type,              NIF_NS.String))
        g.add((span_uri, RDF.type,              NIF_NS.RFC5147String))
        g.add((span_uri, NIF_NS.anchorOf,       Literal(text, datatype=XSD.string)))
        g.add((span_uri, NIF_NS.beginIndex,     Literal(start, datatype=XSD.nonNegativeInteger)))
        g.add((span_uri, NIF_NS.endIndex,       Literal(end,   datatype=XSD.nonNegativeInteger)))
        g.add((span_uri, CCO_HAS_TEXT_VALUE,    Literal(text, datatype=XSD.string)))

        if cls_uri:
            g.add((span_uri, ITSRDF.taClassRef, URIRef(cls_uri)))

    output = g.serialize(format="turtle")

    return Response(
        output,
        status=200,
        mimetype="text/turtle",
        headers={"Content-Disposition": f'attachment; filename="{doc_id}_nif.ttl"'}
    )


# ── /export_ttl (ontology TBox only) ──────────────────────────────────────────

@app.route("/export_ttl", methods=["POST"])
def export_ttl():
    """
    Export the canvas ontology (TBox only) as Turtle.
    No annotations included.
    """
    data  = request.get_json(force=True)
    nodes = data.get("nodes", [])
    edges = data.get("edges", [])

    g = RDFGraph()
    g.bind("owl",  OWL)
    g.bind("rdfs", RDFS)
    g.bind("rdf",  RDF)
    g.bind("ex",   RDFNamespace("http://example.org/"))

    for node in nodes:
        if not node.get("uri"):
            continue
        n_uri = URIRef(node["uri"])
        g.add((n_uri, RDF.type,   OWL.Class))
        g.add((n_uri, RDFS.label, Literal(node.get("label", ""))))
        if node.get("definition"):
            g.add((n_uri, RDFS.comment, Literal(node["definition"])))
        if node.get("parent_uri"):
            g.add((n_uri, RDFS.subClassOf, URIRef(node["parent_uri"])))

    for edge in edges:
        src_node = next((n for n in nodes if n["id"] == edge["source"]), None)
        tgt_node = next((n for n in nodes if n["id"] == edge["target"]), None)
        if not src_node or not tgt_node or not edge.get("propertyUri"):
            continue
        g.add((
            URIRef(src_node["uri"]),
            URIRef(edge["propertyUri"]),
            URIRef(tgt_node["uri"])
        ))

    output = g.serialize(format="turtle")

    return Response(
        output,
        status=200,
        mimetype="text/turtle",
        headers={"Content-Disposition": "attachment; filename=\"ontology.ttl\""}
    )


# ── /generate_mermaid (canvas only, no CSV) ────────────────────────────────────

@app.route("/generate_mermaid", methods=["POST"])
def generate_mermaid():
    data  = request.get_json(force=True)
    nodes = data.get("nodes", [])
    edges = data.get("edges", [])

    class_counts = {}
    node_ids     = {}
    lines        = ["graph TD"]

    for node in nodes:
        label   = node.get("label", node.get("id", "Unknown"))
        base_id = "".join([c for c in label if c.isalnum()])[:3].upper() or "NOD"
        class_counts[base_id] = class_counts.get(base_id, 0) + 1
        uid     = f"{base_id}{class_counts[base_id]}"
        node_ids[node["id"]] = uid
        lines.append(f'    {uid}["{label}"]')

    for edge in edges:
        src = node_ids.get(edge.get("source", ""))
        tgt = node_ids.get(edge.get("target", ""))
        lbl = edge.get("propertyLabel", edge.get("label", "related_to"))
        if src and tgt:
            lines.append(f"    {src} -->|{lbl}| {tgt}")

    return jsonify({"mermaid": "\n".join(lines), "success": True})


# ══════════════════════════════════════════════════════════════════════════════
# REASONER ENDPOINT  (ported from ONTO-TRON-5000 unchanged)
# ══════════════════════════════════════════════════════════════════════════════

@app.route("/run_reasoner", methods=["POST"])
def run_reasoner():
    try:
        data          = request.get_json(force=True)
        reasoner_type = data.get("reasoner", "hermit").lower()
        nodes         = data.get("nodes", [])
        edges         = data.get("edges", [])

        print(f"[INFO] Running {reasoner_type} reasoner on {len(nodes)} nodes, {len(edges)} edges")

        temp_onto = get_ontology("http://example.org/temp_reasoning.owl")

        with temp_onto:
            node_classes = {}
            for node in nodes:
                node_uri   = node.get("uri", "")
                class_name = node_uri.split("/")[-1].split("#")[-1] or f"Node_{node['id']}"
                try:
                    cls = types.new_class(class_name, (Thing,))
                    node_classes[node["id"]] = cls
                except Exception as e:
                    print(f"[WARN] Could not create class {class_name}: {e}")

            for edge in edges:
                src_id   = edge.get("source")
                tgt_id   = edge.get("target")
                prop_uri = edge.get("propertyUri", "")
                if src_id not in node_classes or tgt_id not in node_classes:
                    continue
                prop_name = prop_uri.split("/")[-1].split("#")[-1] or f"prop_{edge['id']}"
                try:
                    prop = types.new_class(prop_name, (ObjectProperty,))
                    node_classes[src_id].is_a.append(prop.some(node_classes[tgt_id]))
                except Exception as e:
                    print(f"[WARN] Could not create property {prop_name}: {e}")

        try:
            if reasoner_type == "pellet":
                sync_reasoner_pellet(infer_property_values=True, infer_data_property_values=True)
            else:
                sync_reasoner_hermit(infer_property_values=True)
        except Exception as e:
            print(f"[ERROR] Reasoner failed: {e}")
            return jsonify({"error": str(e), "inferred_relationships": [], "inconsistencies": []}), 500

        inferred       = []
        inconsistencies = []

        try:
            for cls in temp_onto.inconsistent_classes():
                inconsistencies.append({"type": "inconsistent_class", "message": f"{cls.name} is inconsistent"})
        except Exception:
            pass

        for node_id, cls in node_classes.items():
            for parent in cls.is_a:
                if parent == Thing or parent in cls.__bases__:
                    continue
                if not hasattr(parent, "name"):
                    continue
                for nid, ncls in node_classes.items():
                    if ncls == parent and nid != node_id:
                        inferred.append({
                            "source":        node_id,
                            "target":        nid,
                            "property":      "is a subclass of",
                            "propertyUri":   "http://www.w3.org/2000/01/rdf-schema#subClassOf",
                            "propertyLabel": "is a subclass of",
                            "type":          "inferred_hierarchy"
                        })

        return jsonify({
            "success":                True,
            "reasoner":               reasoner_type,
            "inferred_relationships": inferred,
            "inconsistencies":        inconsistencies,
            "stats": {
                "nodes_processed":       len(nodes),
                "edges_processed":       len(edges),
                "inferences_found":      len(inferred),
                "inconsistencies_found": len(inconsistencies)
            }
        }), 200

    except Exception as e:
        traceback.print_exc()
        return jsonify({"error": str(e), "inferred_relationships": [], "inconsistencies": []}), 500




# ══════════════════════════════════════════════════════════════════════════════
# FEATURE 1: ONTOLOGY CONSISTENCY VALIDATION
# ══════════════════════════════════════════════════════════════════════════════

@app.route("/validate_annotations", methods=["POST"])
def validate_annotations():
    """
    Check annotation set for ontological inconsistencies:
    - Same span tagged with two disjoint classes
    - TBox assertions that contradict parent hierarchy
    - ABox instances whose class has no parent in the active graph
    Returns list of issues with span IDs and descriptions.
    """
    data        = request.get_json(force=True)
    annotations = data.get("annotations", [])
    nodes       = data.get("nodes", [])
    issues      = []

    # Build disjoint pairs from active graph
    OWL_dj = URIRef("http://www.w3.org/2002/07/owl#disjointWith")
    disjoint_pairs = set()
    for s, _, o in active_graph.triples((None, OWL_dj, None)):
        if isinstance(s, URIRef) and isinstance(o, URIRef):
            disjoint_pairs.add((str(s), str(o)))
            disjoint_pairs.add((str(o), str(s)))

    # Build subclass map
    subclass_map = {}
    for s, _, o in active_graph.triples((None, RDFS.subClassOf, None)):
        if isinstance(s, URIRef) and isinstance(o, URIRef):
            subclass_map.setdefault(str(s), []).append(str(o))

    # Group annotations by paragraph
    para_groups = {}
    for ann in annotations:
        pid = ann.get("para_id", "")
        para_groups.setdefault(pid, []).append(ann)

    # Check 1: disjoint classes used in same paragraph
    for para_id, anns in para_groups.items():
        class_uris = list(set(a["class_uri"] for a in anns if a.get("class_uri")))
        for i, c1 in enumerate(class_uris):
            for c2 in class_uris[i+1:]:
                if (c1, c2) in disjoint_pairs:
                    spans1 = [a["text"] for a in anns if a.get("class_uri") == c1]
                    spans2 = [a["text"] for a in anns if a.get("class_uri") == c2]
                    c1_label = next(active_graph.objects(URIRef(c1), RDFS.label), tail(c1))
                    c2_label = next(active_graph.objects(URIRef(c2), RDFS.label), tail(c2))
                    issues.append({
                        "type":        "disjoint_conflict",
                        "severity":    "error",
                        "para_id":     para_id,
                        "span_texts":  spans1 + spans2,
                        "message":     f"Classes '{c1_label}' and '{c2_label}' are declared disjoint but both used in {para_id.replace('_', ' ')}",
                        "class_uris":  [c1, c2]
                    })

    # Check 2: TBox assertions — class being defined has no known parent
    tbox_anns = [a for a in annotations if a.get("assertion_type") == "tbox"]
    for ann in tbox_anns:
        uri = ann.get("class_uri", "")
        if uri and uri not in subclass_map and not uri.startswith("http://example.org/custom/"):
            # Check if it exists in graph at all
            exists = (URIRef(uri), RDF.type, OWL.Class) in active_graph
            if not exists:
                issues.append({
                    "type":       "unknown_tbox_class",
                    "severity":   "warning",
                    "para_id":    ann.get("para_id", ""),
                    "span_texts": [ann.get("text", "")],
                    "message":    f"TBox span '{ann.get('text','')}' references class not found in active ontology: {tail(uri)}",
                    "class_uris": [uri]
                })

    # Check 3: custom classes with no parent linkage on canvas
    canvas_uris = set(n.get("uri", "") for n in nodes)
    custom_anns = [a for a in annotations if a.get("is_custom") and a.get("class_uri", "").startswith("http://example.org/custom/")]
    orphaned_classes = set()
    for ann in custom_anns:
        uri = ann.get("class_uri", "")
        if uri not in orphaned_classes:
            # Check if any edge in nodes connects this to a non-custom class
            orphaned_classes.add(uri)
            issues.append({
                "type":       "unanchored_custom_class",
                "severity":   "info",
                "para_id":    ann.get("para_id", ""),
                "span_texts": [ann.get("text", "")],
                "message":    f"Custom class '{ann.get('class_label', tail(uri))}' has no parent class assigned. Consider linking it to a BFO/CCO class for compliance.",
                "class_uris": [uri]
            })

    return jsonify({
        "valid":       len([i for i in issues if i["severity"] == "error"]) == 0,
        "issue_count": len(issues),
        "errors":      len([i for i in issues if i["severity"] == "error"]),
        "warnings":    len([i for i in issues if i["severity"] == "warning"]),
        "info":        len([i for i in issues if i["severity"] == "info"]),
        "issues":      issues
    })


# ══════════════════════════════════════════════════════════════════════════════
# FEATURE 2: SPARQL STARTER QUERIES + SHACL SHAPES
# ══════════════════════════════════════════════════════════════════════════════

@app.route("/generate_sparql_pack", methods=["POST"])
def generate_sparql_pack():
    """
    Generate a companion SPARQL query pack tailored to the actual annotations.
    Returns a .sparql file with 4-5 queries specific to classes/properties used.
    """
    data        = request.get_json(force=True)
    doc_id      = data.get("doc_id", "doc001")
    annotations = data.get("annotations", [])
    nodes       = data.get("nodes", [])

    class_uris  = list(set(a["class_uri"] for a in annotations if a.get("class_uri")))
    para_ids    = list(set(a["para_id"]   for a in annotations if a.get("para_id")))

    prefixes = """PREFIX rdf:   <http://www.w3.org/1999/02/22-rdf-syntax-ns#>
PREFIX rdfs:  <http://www.w3.org/2000/01/rdf-schema#>
PREFIX owl:   <http://www.w3.org/2002/07/owl#>
PREFIX cco:   <https://www.commoncoreontologies.org/>
PREFIX obo:   <http://purl.obolibrary.org/obo/>
PREFIX nif:   <http://persistence.uni-leipzig.org/nlp2rdf/ontologies/nif-core#>
PREFIX nlt:   <http://ontonote.org/annotation/>
PREFIX doc:   <http://ontonote.org/doc/{doc_id}/>
""".format(doc_id=doc_id)

    queries = [prefixes]

    # Q1: All tagged spans with their classes
    queries.append("""# Q1: All annotation spans with class assignments
SELECT ?span ?text ?class ?paraGraph WHERE {{
  GRAPH ?paraGraph {{
    ?span_ibe a cco:ont00000253 ;
              cco:ont00001765 ?text .
    ?span_ice a ?class .
    ?span_ibe <http://purl.obolibrary.org/obo/BFO_0000101> ?span_ice .
  }}
  FILTER(STRSTARTS(STR(?paraGraph), "http://ontonote.org/doc/{doc_id}/"))
}}
ORDER BY ?paraGraph ?text
""".format(doc_id=doc_id))

    # Q2: Spans grouped by class
    queries.append("""# Q2: All spans grouped by ontology class
SELECT ?class (GROUP_CONCAT(?text; separator=", ") AS ?spans) (COUNT(?text) AS ?count) WHERE {{
  GRAPH ?g {{
    ?ibe a cco:ont00000253 ;
         cco:ont00001765 ?text .
    ?ice a ?class .
    ?ibe <http://purl.obolibrary.org/obo/BFO_0000101> ?ice .
  }}
}}
GROUP BY ?class
ORDER BY DESC(?count)
""")

    # Q3: Linked paragraphs
    if len(para_ids) > 1:
        queries.append("""# Q3: Paragraph links in the document
SELECT ?para1 ?para2 ?relation WHERE {{
  ?para1 ?relation ?para2 .
  FILTER(STRSTARTS(STR(?para1), "http://ontonote.org/doc/{doc_id}/paragraph"))
  FILTER(STRSTARTS(STR(?para2), "http://ontonote.org/doc/{doc_id}/paragraph"))
  FILTER(?relation != rdf:type)
  FILTER(?relation != <http://purl.obolibrary.org/obo/BFO_0000176>)
}}
""".format(doc_id=doc_id))

    # Q4: Per-class queries for top 3 classes used
    top_classes = {}
    for a in annotations:
        u = a.get("class_uri", "")
        if u:
            top_classes[u] = top_classes.get(u, 0) + 1
    for uri, count in sorted(top_classes.items(), key=lambda x: -x[1])[:3]:
        label = next(active_graph.objects(URIRef(uri), RDFS.label), tail(uri))
        queries.append("""# Q4: All spans tagged as {label}
SELECT ?text ?para WHERE {{
  GRAPH ?para {{
    ?ibe a cco:ont00000253 ;
         cco:ont00001765 ?text .
    ?ice a <{uri}> .
    ?ibe <http://purl.obolibrary.org/obo/BFO_0000101> ?ice .
  }}
}}
ORDER BY ?para
""".format(label=label, uri=uri))

    # Q5: TBox assertions
    tbox = [a for a in annotations if a.get("assertion_type") == "tbox"]
    if tbox:
        queries.append("""# Q5: All TBox (class definition) assertions
SELECT ?text ?class ?para WHERE {{
  GRAPH ?para {{
    ?ibe a cco:ont00000253 ;
         cco:ont00001765 ?text .
    ?ice a owl:Class .
    ?ibe <http://purl.obolibrary.org/obo/BFO_0000101> ?ice .
  }}
}}
""")

    output = "\n# " + "="*60 + "\n".join(queries)

    return Response(
        output,
        status=200,
        mimetype="application/sparql-query",
        headers={"Content-Disposition": f'attachment; filename="{doc_id}_queries.sparql"'}
    )


# ══════════════════════════════════════════════════════════════════════════════
# FEATURE 3: CROSS-DOCUMENT CONSISTENCY CHECK
# ══════════════════════════════════════════════════════════════════════════════

# In-memory store for uploaded document annotation sets
# { doc_id: { "filename": str, "annotations": [...] } }
document_registry = {}

@app.route("/register_document", methods=["POST"])
def register_document():
    """Store a document's annotation set for cross-document comparison."""
    data = request.get_json(force=True)
    doc_id      = data.get("doc_id", "")
    filename    = data.get("filename", "")
    annotations = data.get("annotations", [])
    if not doc_id:
        return jsonify({"error": "doc_id required"}), 400
    document_registry[doc_id] = {"filename": filename, "annotations": annotations}
    return jsonify({"success": True, "registered": doc_id, "total_docs": len(document_registry)})


@app.route("/cross_document_check", methods=["POST"])
def cross_document_check():
    """
    Compare current document's annotations against all registered documents.
    Flags: same term tagged as different classes across documents.
    Returns conflicts and a differentFrom assertion payload for export.
    """
    data        = request.get_json(force=True)
    doc_id      = data.get("doc_id", "")
    annotations = data.get("annotations", [])

    if not document_registry:
        return jsonify({"conflicts": [], "message": "No other documents registered for comparison."})

    # Build term→class map for current doc
    current_map = {}
    for ann in annotations:
        text = ann.get("text", "").lower().strip()
        uri  = ann.get("class_uri", "")
        if text and uri:
            current_map.setdefault(text, set()).add(uri)

    conflicts = []
    different_from = []

    for other_id, other_data in document_registry.items():
        if other_id == doc_id:
            continue
        other_filename = other_data["filename"]
        other_anns     = other_data["annotations"]

        other_map = {}
        for ann in other_anns:
            text = ann.get("text", "").lower().strip()
            uri  = ann.get("class_uri", "")
            if text and uri:
                other_map.setdefault(text, set()).add(uri)

        for term, cur_classes in current_map.items():
            if term in other_map:
                other_classes = other_map[term]
                differing = cur_classes.symmetric_difference(other_classes)
                if differing:
                    conflicts.append({
                        "term":           term,
                        "current_doc":    doc_id,
                        "other_doc":      other_id,
                        "other_filename": other_filename,
                        "current_classes":list(cur_classes),
                        "other_classes":  list(other_classes),
                        "message":        f'"{term}" tagged as {[tail(c) for c in cur_classes]} in current doc but {[tail(c) for c in other_classes]} in {other_filename}'
                    })
                    # Generate OWL differentFrom assertions
                    for c1 in cur_classes:
                        for c2 in other_classes:
                            if c1 != c2:
                                different_from.append({
                                    "subject":   c1,
                                    "predicate": "http://www.w3.org/2002/07/owl#differentFrom",
                                    "object":    c2,
                                    "note":      f'Intentionally distinct uses of "{term}" across {doc_id} and {other_id}'
                                })

    return jsonify({
        "conflict_count":  len(conflicts),
        "conflicts":       conflicts,
        "different_from":  different_from
    })


# ══════════════════════════════════════════════════════════════════════════════
# FEATURE 4: NLP PRE-ANNOTATION (spaCy NER)
# ══════════════════════════════════════════════════════════════════════════════

@app.route("/pre_annotate", methods=["POST"])
def pre_annotate():
    """
    Run spaCy NER over document paragraphs and return suggested annotations.
    Each suggestion includes text, offsets, para_id, and a suggested class URI
    mapped from spaCy entity type to the closest BFO/CCO class.
    """
    data       = request.get_json(force=True)
    paragraphs = data.get("paragraphs", [])

    try:
        import spacy
        try:
            nlp = spacy.load("en_core_web_sm")
        except OSError:
            return jsonify({
                "error": "spaCy model not installed. Run: python3 -m spacy download en_core_web_sm",
                "suggestions": []
            }), 400
    except ImportError:
        return jsonify({
            "error": "spaCy not installed. Run: pip install spacy --break-system-packages",
            "suggestions": []
        }), 400

    # spaCy label → CCO/BFO class URI mapping
    SPACY_TO_ONTO = {
        "PERSON":   ("https://www.commoncoreontologies.org/ont00000233", "Agent"),
        "ORG":      ("https://www.commoncoreontologies.org/ont00000070", "Organization"),
        "GPE":      ("https://www.commoncoreontologies.org/ont00000178", "GeopoliticalEntity"),
        "LOC":      ("https://www.commoncoreontologies.org/ont00000178", "GeopoliticalEntity"),
        "DATE":     ("http://purl.obolibrary.org/obo/BFO_0000038",       "TemporalRegion"),
        "TIME":     ("http://purl.obolibrary.org/obo/BFO_0000038",       "TemporalRegion"),
        "EVENT":    ("http://purl.obolibrary.org/obo/BFO_0000015",       "Process"),
        "LAW":      ("https://www.commoncoreontologies.org/ont00000965",  "DirectiveICE"),
        "PRODUCT":  ("https://www.commoncoreontologies.org/ont00000253",  "InformationBearingEntity"),
        "NORP":     ("https://www.commoncoreontologies.org/ont00000070",  "Organization"),
    }

    suggestions = []
    for para in paragraphs:
        text       = para.get("text", "")
        para_id    = para.get("para_id", "")
        char_start = para.get("char_start", 0)

        doc = nlp(text)
        for ent in doc.ents:
            if ent.label_ not in SPACY_TO_ONTO:
                continue
            class_uri, class_label = SPACY_TO_ONTO[ent.label_]
            suggestions.append({
                "id":             "suggest_" + str(uuid.uuid4())[:8],
                "text":           ent.text,
                "start_char":     char_start + ent.start_char,
                "end_char":       char_start + ent.end_char,
                "para_id":        para_id,
                "class_uri":      class_uri,
                "class_label":    class_label,
                "spacy_label":    ent.label_,
                "assertion_type": "abox",
                "is_suggestion":  True,
                "confirmed":      False,
            })

    return jsonify({
        "suggestion_count": len(suggestions),
        "suggestions":      suggestions
    })


# ══════════════════════════════════════════════════════════════════════════════
# FEATURE 5: SESSION SAVE / RESUME
# ══════════════════════════════════════════════════════════════════════════════

@app.route("/save_session", methods=["POST"])
def save_session():
    """
    Persist the full annotation session to disk as JSON.
    Stored in uploads/{doc_id}_session.json
    """
    data   = request.get_json(force=True)
    doc_id = data.get("doc_id", "")
    if not doc_id:
        return jsonify({"error": "doc_id required"}), 400

    session_path = os.path.join("uploads", f"{doc_id}_session.json")
    try:
        with open(session_path, "w") as f:
            json.dump(data, f, indent=2)
        print(f"[INFO] Session saved: {session_path}")
        return jsonify({"success": True, "path": session_path})
    except Exception as e:
        return jsonify({"error": str(e)}), 500


@app.route("/load_session", methods=["POST"])
def load_session():
    """
    Load a session from an uploaded JSON session file.
    """
    if "file" not in request.files:
        return jsonify({"error": "No file provided"}), 400
    f = request.files["file"]
    try:
        data = json.load(f)
        return jsonify({"success": True, "session": data})
    except Exception as e:
        return jsonify({"error": f"Invalid session file: {str(e)}"}), 400


@app.route("/list_sessions", methods=["GET"])
def list_sessions():
    """List all saved sessions in the uploads directory."""
    sessions = []
    for fname in os.listdir("uploads"):
        if fname.endswith("_session.json"):
            fpath = os.path.join("uploads", fname)
            try:
                with open(fpath) as f:
                    data = json.load(f)
                sessions.append({
                    "doc_id":   data.get("doc_id", ""),
                    "filename": data.get("filename", fname),
                    "annotation_count": len(data.get("annotations", [])),
                    "saved_at": os.path.getmtime(fpath),
                    "file":     fname,
                })
            except Exception:
                pass
    sessions.sort(key=lambda x: x["saved_at"], reverse=True)
    return jsonify(sessions)


# ══════════════════════════════════════════════════════════════════════════════
# ENTRY POINT
# ══════════════════════════════════════════════════════════════════════════════

if __name__ == "__main__":
    app.run(host="0.0.0.0", port=5056, debug=True)
