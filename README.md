# OntoNote — Semantic Annotation Workbench

OntoNote is a tool for semantically annotating natural language documents against formal ontologies. Where the ONTO-TRON-5000 builds ontologies from structured CSV data, OntoNote works from the other direction — upload a PDF or Word document, highlight any word or phrase, and tag it to a class from BFO, CCO, or any ontology you provide. Your annotations generate RDF automatically in formats ready for triplestore ingestion, LLM training corpus preparation, and ontology construction from domain literature.

The output is TriG format: one named graph per paragraph, every tagged span encoded as an Information Bearing Entity with its text value and character offsets, typed to the user's chosen class via a BFO-compliant ICE individual. Paragraphs can be linked to each other semantically, and the entire document structure maps to BFO/CCO conventions without manual triple authoring.

No Protege required.

---

## Features

### Document Annotation
- Upload PDF or DOCX documents — multiple documents open simultaneously as tabs
- Highlight any word or phrase to open the Tag Modal
- Search existing ontology terms or create a new custom class on the spot
- Tagged spans appear as color-coded highlights, each color tied to a specific class and consistent across all paragraphs and documents
- Phrase-aware overlap detection — tagging a phrase does not block individual words within it from being tagged in other phrases
- Click any existing highlight to edit its class assignment or delete it

### Paragraph-Level Structure
- Every paragraph gets a clickable `§N` badge — click to open the Paragraph Link Manager
- Paragraph links encode semantic connections between sections as triples in the TriG default graph
- Linked paragraphs show a filled badge with `*` indicator

### Ontology Editor
- Dual-mode canvas: **Build** (freehand — add classes, draw property edges, resize nodes, zoom) and **From Annotations** (canvas auto-generated from tagging work, sync on demand)
- Promote an annotated canvas to Build mode for manual refinement
- Full ontology browser panel: class hierarchy, object properties, and data properties in a Protege-style tree with definitions, IRIs, superclasses, domain, and range
- Starts empty — populates when you load an ontology framework
- Add any class from the browser directly to the canvas

### Ontology Framework
- BFO only, CCO only, BFO+CCO, or no framework — nothing loaded by default
- Upload any `.ttl`, `.owl`, or `.rdf` file and designate it as top-level, mid-level, or domain ontology
- Switching frameworks refreshes the browser, search results, and property dropdowns
- Works identically for BFO/CCO and user-uploaded ontologies (FIBO, IDO, software ontologies, etc.)

### Export
- **TriG** — one named graph per paragraph, IBE + ICE individuals, `cco:has_text_value` on every span automatically, paragraph links in the default graph. Drops directly into GraphDB, Oxigraph, or any triplestore
- **NIF** — W3C Natural Language Interchange Format with RFC5147 character offsets and `itsrdf:taClassRef` per span
- **TTL** — ontology TBox only, no annotations
- **Mermaid** — diagram syntax for the canvas ontology, paste into [mermaid.live](https://mermaid.live/)
- **SPARQL query pack** — downloads a `.sparql` file with 4-5 queries tailored to the actual classes and properties used in the session, ready to run against any triplestore

### Validation and Consistency
- **Ontology validation report** — flags disjoint class conflicts within paragraphs, TBox assertions referencing unknown classes, and custom classes with no parent linkage
- **Cross-document consistency check** — compares tagging across all open document tabs and flags any term tagged as different classes across documents, with an option to export `owl:differentFrom` assertions encoding intentional distinctions

### NLP Pre-Annotation
- One-click NLP pre-annotation via spaCy — runs named entity recognition over the loaded document and generates ghost suggestion pills beneath each paragraph
- Maps spaCy entity types to the closest BFO/CCO class (PERSON → Agent, ORG → Organization, LAW → Directive ICE, DATE → Temporal Region, etc.)
- Confirm to promote a suggestion to a full annotation, dismiss to remove it — every decision stays human-in-the-loop
- Requires `en_core_web_sm` (installed automatically in Docker)

### Session Management
- Save the full annotation session to disk at any point — paragraphs, annotations, paragraph links, canvas state, and active framework all serialized to JSON
- Resume saved sessions from the Sessions modal or load a session file directly

---

## Prerequisites

### Option 1: Docker (Recommended)
- [Docker Desktop](https://www.docker.com/products/docker-desktop) for Mac, Windows, or Linux

### Option 2: Manual Installation
- Python 3.11 or higher
- Node.js 18 or higher
- npm

---

## Installation & Running

### Option 1: Docker (Recommended)

**Clone the repository**
```bash
git clone https://github.com/Jlbillig/OntoNote.git
cd OntoNote
```

**Start the application**
```bash
docker-compose up
```

**Open in browser**
```
http://localhost:5056
```

To rebuild after changes: `docker-compose up --build`

---

### Option 2: Manual Installation

**Clone the repository**
```bash
git clone https://github.com/Jlbillig/OntoNote.git
cd OntoNote
```

**Install Python dependencies**
```bash
pip install flask flask-cors rdflib owlready2 pdfminer.six python-docx
```

**Optional — NLP pre-annotation**
```bash
pip install spacy
python3 -m spacy download en_core_web_sm
```

**Install Node dependencies and build frontend**
```bash
npm install
npm run build
```

**Run the application**
```bash
python3 app.py
```

**Open in browser**
```
http://127.0.0.1:5056
```

---

## Troubleshooting

**Docker Issues**
- Try `docker-compose down` then `docker-compose up --build`
- Check port 5056 is not already in use

**Manual Installation Issues**
- Ensure Python 3.11+ and Node.js 18+ are installed
- If the build fails try `rm -rf node_modules && npm install`
- Make sure `bfo-core.ttl` and `CommonCoreOntologiesMerged.ttl` are present in the root directory

**Ontology Browser Shows Nothing**
- This is expected on first load — no framework is active by default
- Click "Ontology Framework" in the toolbar and select BFO, CCO, or upload your own ontology file

**Pre-Annotation Button Returns Error**
- spaCy is not installed or the model is missing
- Run `pip install spacy && python3 -m spacy download en_core_web_sm`
- In Docker this is handled automatically at build time

**Port already in use**
- Change the port in `app.py` and `docker-compose.yml` from `5056` to any available port

Any further problems please create an issue.

---

## License

MIT
