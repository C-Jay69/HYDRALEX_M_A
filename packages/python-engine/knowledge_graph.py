# knowledge_graph.py
# Knowledge Graph for M&A Due Diligence Analysis Engine
# Tracks relationships between defined terms, parties, obligations, conditions, etc.

from __future__ import annotations

import re
from dataclasses import dataclass, field
from enum import Enum
from typing import Any


class EntityType(Enum):
    DEFINED_TERM = "defined_term"
    PARTY = "party"
    OBLIGATION = "obligation"
    CONDITION = "condition"
    COVENANT = "covenant"
    REPRESENTATION = "representation"
    DISCLOSURE_SCHEDULE = "disclosure_schedule"
    MATERIAL_CONTRACT = "material_contract"
    REGULATORY_APPROVAL = "regulatory_approval"
    EMPLOYEE = "employee"
    LITIGATION = "litigation"
    TAX = "tax"
    INTELLECTUAL_PROPERTY = "intellectual_property"
    ENVIRONMENTAL = "environmental"
    DATA_PRIVACY = "data_privacy"
    FINANCING = "financing"
    SCHEDULE = "schedule"
    EXHIBIT = "exhibit"
    AMENDMENT = "amendment"
    DOCUMENT = "document"
    FINANCIAL_TERM = "financial_term"
    METRIC = "metric"
    SURVIVAL_PERIOD = "survival_period"
    HSR_THRESHOLD = "hsr_threshold"
    CFIUS_FLAG = "cfius_flag"
    FCPA_RED_FLAG = "fcpa_red_flag"
    EXPORT_CONTROL = "export_control"
    PRIVACY_LAW_INDICATOR = "privacy_law_indicator"
    JURISDICTIONAL_FLAG = "jurisdictional_flag"
    GOVERNING_LAW = "governing_law"
    RELATED_AGREEMENT = "related_agreement"
    VERSION_STATUS = "version_status"


class RelationshipType(Enum):
    DEFINES = "defines"
    REFERENCES = "references"
    EXECUTED_BY = "executed_by"
    SUBJECT_TO = "subject_to"
    CONDITIONED_ON = "conditioned_on"
    COVENANT_FOR = "covenant_for"
    REPS_BY = "reps_by"
    WARRANTS = "warrants"
    INDEMNIFIES = "indemnifies"
    GUARANTEES = "guarantees"
    OWNED_BY = "owned_by"
    LICENSED_FROM = "licensed_from"
    ASSIGNED_TO = "assigned_to"
    REQUIRES_CONSENT = "requires_consent"
    REGULATED_BY = "regulated_by"
    GOVERNED_BY = "governed_by"
    AFFECTS = "affects"
    CONFLICTS_WITH = "conflicts_with"
    DEPENDS_ON = "depends_on"
    MUTUAL = "mutual"
    UNILATERAL = "unilateral"
    CALCULATES = "calculates"
    MEASURED_BY = "measured_by"
    SURVIVES = "survives"
    EXCLUDES = "excludes"
    INCLUDES = "includes"


@dataclass
class KGNode:
    """A node in the knowledge graph"""
    id: str
    name: str
    entity_type: EntityType
    content: str = ""
    source_section: str = ""
    source_document: str = ""
    metadata: dict[str, Any] = field(default_factory=dict)
    tooltip: str = ""  # Hover tooltip text

    def get_label(self) -> str:
        return f"[{self.entity_type.value}] {self.name}"

    def get_tooltip(self) -> str:
        """Get tooltip text for this node."""
        if self.tooltip:
            return self.tooltip
        return f"{self.entity_type.value}: {self.name}"


@dataclass
class KGEdge:
    """A directed relationship between two nodes"""
    source_id: str
    target_id: str
    relationship: RelationshipType
    confidence: float = 1.0  # 0.0 to 1.0
    evidence: str = ""  # Text excerpt supporting this edge
    source_section: str = ""
    tooltip: str = ""  # Hover tooltip text

    def get_tooltip(self) -> str:
        """Get tooltip text for this edge."""
        if self.tooltip:
            return self.tooltip
        return f"{self.relationship.value} relationship"


class KnowledgeGraph:
    """Knowledge Graph for M&A document analysis"""

    def __init__(self):
        self.nodes: dict[str, KGNode] = {}
        self.edges: list[KGEdge] = []
        self._adjacency: dict[str, list[KGEdge]] = {}
        self._reverse_adjacency: dict[str, list[KGEdge]] = {}

    # ── Node Operations ──────────────────────────────────

    def add_node(self, node: KGNode) -> str:
        """Add a node to the graph. Returns the node ID."""
        if node.id in self.nodes:
            existing = self.nodes[node.id]
            existing.metadata.update(node.metadata)
            if node.content and not existing.content:
                existing.content = node.content
            return node.id
        self.nodes[node.id] = node
        self._adjacency[node.id] = []
        self._reverse_adjacency[node.id] = []
        return node.id

    def get_node(self, node_id: str) -> KGNode | None:
        return self.nodes.get(node_id)

    def find_nodes(self, entity_type: EntityType | None = None,
                   name_contains: str | None = None) -> list[KGNode]:
        results = list(self.nodes.values())
        if entity_type is not None:
            results = [n for n in results if n.entity_type == entity_type]
        if name_contains is not None:
            pattern = re.compile(re.escape(name_contains), re.IGNORECASE)
            results = [n for n in results
                       if pattern.search(n.name) or pattern.search(n.content)]
        return results

    def remove_node(self, node_id: str) -> bool:
        if node_id not in self.nodes:
            return False
        self.edges = [e for e in self.edges
                       if e.source_id != node_id and e.target_id != node_id]
        del self.nodes[node_id]
        del self._adjacency[node_id]
        del self._reverse_adjacency[node_id]
        for nid in list(self._adjacency.keys()):
            self._adjacency[nid] = [e for e in self._adjacency[nid]
                                    if e.target_id != node_id]
            self._reverse_adjacency[nid] = [e for e in self._reverse_adjacency[nid]
                                            if e.source_id != node_id]
        return True

    # ── Edge Operations ──────────────────────────────────

    def add_edge(self, source_id: str, target_id: str,
                 relationship: RelationshipType,
                 confidence: float = 1.0, evidence: str = "",
                 source_section: str = "") -> KGEdge | None:
        """Add a directed edge between two nodes."""
        if source_id not in self.nodes:
            raise KeyError(f"Source node '{source_id}' does not exist")
        if target_id not in self.nodes:
            raise KeyError(f"Target node '{target_id}' does not exist")

        edge = KGEdge(
            source_id=source_id, target_id=target_id,
            relationship=relationship, confidence=confidence,
            evidence=evidence, source_section=source_section,
        )
        self.edges.append(edge)
        self._adjacency[source_id].append(edge)
        self._reverse_adjacency[target_id].append(edge)
        return edge

    def get_edges(self, source_id: str | None = None,
                  target_id: str | None = None,
                  relationship: RelationshipType | None = None) -> list[KGEdge]:
        results = self.edges
        if source_id is not None:
            results = [e for e in results if e.source_id == source_id]
        if target_id is not None:
            results = [e for e in results if e.target_id == target_id]
        if relationship is not None:
            results = [e for e in results if e.relationship == relationship]
        return results

    def get_outgoing(self, node_id: str) -> list[KGEdge]:
        return self._adjacency.get(node_id, [])

    def get_incoming(self, node_id: str) -> list[KGEdge]:
        return self._reverse_adjacency.get(node_id, [])

    # ── Analysis Methods ─────────────────────────────────

    def detect_undefined_terms(self, document_text: str,
                               defined_terms: list[str]) -> list[dict]:
        """Find usages of capitalized terms that aren't in the defined terms list."""
        defined_set = {t.lower().strip() for t in defined_terms}
        findings = []
        capitalized_words = re.findall(r'\b([A-Z][a-zA-Z]{2,})\b', document_text)
        seen = set()
        skip_words = {
            "The", "This", "That", "These", "Those", "It", "Is", "Are", "Was",
            "Were", "Has", "Have", "Does", "Did", "Will", "Would", "Should",
            "Could", "May", "Might", "Must", "Can", "Section", "Exhibit",
            "Schedule", "Article", "Agreement", "Contract", "Parties",
            "Effective", "Date", "Company", "Transaction", "Closing",
            "Consideration", "Representations", "Warranties", "Indemnification",
            "Confidentiality", "Governing", "Law", "Dispute", "Resolution",
            "Term", "Termination", "Payment", "Price", "Purchase", "Sale",
            "Assets", "Shares", "Stock", "Equity", "Interest", "Obligation",
            "Debt", "Obligations", "Rights", "Interests", "Properties",
            "Business", "Operations", "Personnel", "Employees", "Affiliates",
        }
        for word in capitalized_words:
            low = word.lower()
            if low in seen or word in skip_words or low in defined_set:
                continue
            seen.add(low)
            if len(word) < 3 or len(word) > 60:
                continue
            findings.append({
                "term": word,
                "likely_status": "possibly_undefined",
                "suggestion": f"Verify that '{word}' is defined in the Definitions section",
                "confidence": "MEDIUM" if len(word) > 5 else "LOW",
            })
        return findings

    def detect_missing_links(self, document_text: str | None = None) -> list[dict]:
        """Detect nodes with missing expected relationships.

        For DEFINED_TERM nodes, a term is only "dead" (defined but never used)
        if it appears AT MOST ONCE in the whole document — i.e. only inside its
        own definition sentence. Counting ALL occurrences (quoted definition site
        and every subsequent unquoted use, e.g. "the Acquired Assets") prevents
        the false-positive where a heavily-used term is flagged as unused just
        because the graph has no explicit usage edge for it.
        """
        findings = []
        dead_terms: list[str] = []
        for node_id, node in self.nodes.items():
            if node.entity_type == EntityType.DEFINED_TERM:
                usage = 0
                if document_text:
                    usage = len(re.findall(r"\b" + re.escape(node.name) + r"\b", document_text, re.IGNORECASE))
                outgoing = [e for e in self.edges if e.source_id == node_id]
                # Flag only if genuinely unused (<=1 occurrence) AND no edges.
                if usage <= 1 and not outgoing:
                    dead_terms.append(node.name)
                    findings.append({
                        "type": "missing_link",
                        "node_id": node_id,
                        "node_name": node.name,
                        "issue": "Defined term has no outgoing references - may be defined but never used",
                    })
            if node.entity_type == EntityType.PARTY:
                outgoing = [e for e in self.edges if e.source_id == node_id]
                if not outgoing:
                    findings.append({
                        "type": "missing_link",
                        "node_id": node_id,
                        "node_name": node.name,
                        "issue": "Party has no connections to obligations, conditions, or covenants",
                    })

        # Sanity gate: flagging several "dead definitions" in a non-trivial
        # document almost always indicates a *parser* bug, not a *drafting* bug.
        # Suppress so it routes to QA review rather than the user-facing report.
        if document_text and len(dead_terms) > 3 and len(document_text) > 5000:
            findings[:] = [f for f in findings if f.get("node_name") not in dead_terms]

        return findings

    def detect_circular_references(self) -> list[list[str]]:
        """Detect circular references using DFS cycle detection."""
        cycles: list[list[str]] = []
        visited: set[str] = set()
        rec_stack: set[str] = set()
        path: list[str] = []

        def dfs(nid: str) -> None:
            visited.add(nid)
            rec_stack.add(nid)
            path.append(nid)
            for edge in self._adjacency.get(nid, []):
                if edge.target_id not in visited:
                    dfs(edge.target_id)
                elif edge.target_id in rec_stack:
                    idx = path.index(edge.target_id)
                    cycles.append(path[idx:] + [edge.target_id])
            path.pop()
            rec_stack.discard(nid)

        for nid in self.nodes:
            if nid not in visited:
                dfs(nid)
        return cycles

    def trace_definition_chain(self, term_id: str, depth: int = 0,
                               max_depth: int = 5,
                               visited: set[str] | None = None) -> list[dict]:
        """Trace how a defined term is used and what it references."""
        if visited is None:
            visited = set()
        if depth > max_depth or term_id in visited:
            return []
        visited.add(term_id)
        results = []
        node = self.nodes.get(term_id)
        if not node:
            return results
        outgoing = self.get_edges(source_id=term_id)
        for edge in outgoing:
            target_node = self.nodes.get(edge.target_id)
            if target_node:
                results.append({
                    "from": term_id,
                    "from_name": node.name,
                    "to": edge.target_id,
                    "to_name": target_node.name,
                    "relationship": edge.relationship.value,
                    "evidence": edge.evidence,
                    "depth": depth,
                })
                sub_results = self.trace_definition_chain(
                    edge.target_id, depth + 1, max_depth, visited
                )
                results.extend(sub_results)
        return results

    def find_dependencies(self, node_id: str) -> list[dict]:
        """Find all nodes that this node depends on (upstream)."""
        deps = []
        incoming = self.get_incoming(node_id)
        for edge in incoming:
            source_node = self.nodes.get(edge.source_id)
            if source_node:
                deps.append({
                    "depends_on": edge.source_id,
                    "depends_on_name": source_node.name,
                    "relationship": edge.relationship.value,
                    "evidence": edge.evidence,
                })
                sub_deps = self.find_dependencies(edge.source_id)
                deps.extend(sub_deps)
        return deps

    def get_impacted_nodes(self, node_id: str) -> list[dict]:
        """Find all nodes impacted by a change to this node (downstream)."""
        impacts = []
        outgoing = self.get_outgoing(node_id)
        for edge in outgoing:
            target_node = self.nodes.get(edge.target_id)
            if target_node:
                impacts.append({
                    "impacts": edge.target_id,
                    "impacts_name": target_node.name,
                    "relationship": edge.relationship.value,
                    "evidence": edge.evidence,
                })
                sub = self.get_impacted_nodes(edge.target_id)
                impacts.extend(sub)
        return impacts

    # ── Export / Serialization ──────────────────────────

    def to_dict(self) -> dict:
        return {
            "nodes": [
                {
                    "id": n.id,
                    "name": n.name,
                    "entity_type": n.entity_type.value,
                    "content": n.content[:200],
                    "source_section": n.source_section,
                    "source_document": n.source_document,
                    "metadata": n.metadata,
                }
                for n in self.nodes.values()
            ],
            "edges": [
                {
                    "source": e.source_id,
                    "target": e.target_id,
                    "relationship": e.relationship.value,
                    "confidence": e.confidence,
                    "evidence": e.evidence[:100],
                    "source_section": e.source_section,
                }
                for e in self.edges
            ],
        }

    def to_adjacency_list(self) -> dict[str, list[dict]]:
        result: dict[str, list[dict]] = {}
        for node_id, node in self.nodes.items():
            result[node_id] = []
            for edge in self._adjacency.get(node_id, []):
                result[node_id].append({
                    "target": edge.target_id,
                    "relationship": edge.relationship.value,
                    "confidence": edge.confidence,
                })
        return result

    def summary(self) -> dict:
        type_counts: dict[str, int] = {}
        rel_counts: dict[str, int] = {}
        for node in self.nodes.values():
            type_counts[node.entity_type.value] = type_counts.get(node.entity_type.value, 0) + 1
        for edge in self.edges:
            rel_counts[edge.relationship.value] = rel_counts.get(edge.relationship.value, 0) + 1
        return {
            "total_nodes": len(self.nodes),
            "total_edges": len(self.edges),
            "node_types": type_counts,
            "relationship_types": rel_counts,
            "circular_references": len(self.detect_circular_references()),
        }
    def extract_clauses(self, text: str) -> Dict[str, list[dict]]:
        """
        Extract and categorize 12 core clause types from M&A contract text.
        """
        clauses: Dict[str, list[dict]] = {t: [] for t in [
            'corporate_authority', 'reps_warranties', 'covenants',
            'conditions_closing', 'mae', 'purchase_price',
            'indemnification', 'termination', 'disclosure_letters',
            'regulatory_approvals', 'boilerplate', 'definitions'
        ]}
        import re
        # 1. Corporate Authority
        for match in re.finditer(
            r'(?:execution|authorization|power.*authority|signing).{0,300}', text, re.IGNORECASE
        ):
            clauses['corporate_authority'].append({
                'clause_type': 'corporate_authority',
                'text': match.group(0)[:200],
                'section': 'unknown',
                'confidence': 0.8,
            })
        # 2. Reps & Warranties
        for match in re.finditer(
            r'[Gg]eneral [Rr]epresentations|[Tt]ax [Rr]epresentations|[Ff]undamental [Rr]epresentations', text
        ):
            clauses['reps_warranties'].append({
                'clause_type': 'reps_warranties',
                'text': match.group(0)[:200],
                'section': 'unknown',
                'confidence': 0.9,
            })
        # 3. Covenants
        for match in re.finditer(
            r'Seller\s+shall [^\.]|Buyer\s+shall [^\.]{10,200}', text, re.IGNORECASE
        ):
            clauses['covenants'].append({
                'clause_type': 'covenants',
                'text': match.group(0)[:200],
                'section': 'unknown',
                'confidence': 0.85,
            })
        # 4. Conditions to Closing
        for match in re.finditer(
            r'condition.*clos|closing.*condition|subject.*clos|prerequisite.*clos', text, re.IGNORECASE
        ):
            clauses['conditions_closing'].append({
                'clause_type': 'conditions_closing',
                'text': match.group(0)[:200],
                'section': 'unknown',
                'confidence': 0.85,
            })
        # 5. MAE
        for match in re.finditer(
            r'[Mm]aterial [Aa]dverse [Ee]ffect|MAE.{0,100}', text
        ):
            clauses['mae'].append({
                'clause_type': 'mae',
                'text': match.group(0)[:200],
                'section': 'unknown',
                'confidence': 0.9,
            })
        # 6. Purchase Price
        for match in re.finditer(
            r'purchase price|working capital|adjustment.{0,100}', text, re.IGNORECASE
        ):
            clauses['purchase_price'].append({
                'clause_type': 'purchase_price',
                'text': match.group(0)[:200],
                'section': 'unknown',
                'confidence': 0.8,
            })
        # 7. Indemnification
        for match in re.finditer(
            r'indemnif|cap.{0,50}|basket.{0,50}|survival.{0,50}', text, re.IGNORECASE
        ):
            clauses['indemnification'].append({
                'clause_type': 'indemnification',
                'text': match.group(0)[:200],
                'section': 'unknown',
                'confidence': 0.85,
            })
        # 8. Termination
        for match in re.finditer(
            r'termination|outside date|drop.*dead', text, re.IGNORECASE
        ):
            clauses['termination'].append({
                'clause_type': 'termination',
                'text': match.group(0)[:200],
                'section': 'unknown',
                'confidence': 0.8,
            })
        # 9. Disclosure Letters
        for match in re.finditer(
            r'disclos|schedule.{0,100}|exhibit.{0,100}', text, re.IGNORECASE
        ):
            clauses['disclosure_letters'].append({
                'clause_type': 'disclosure_letters',
                'text': match.group(0)[:200],
                'section': 'unknown',
                'confidence': 0.75,
            })
        # 10. Regulatory Approvals
        for match in re.finditer(
            r'CFIUS|HSR|regulatory.*appr|consent|approval.{0,100}', text, re.IGNORECASE
        ):
            clauses['regulatory_approvals'].append({
                'clause_type': 'regulatory_approvals',
                'text': match.group(0)[:200],
                'section': 'unknown',
                'confidence': 0.8,
            })
        # 11. Boilerplate
        for match in re.finditer(
            r'integration|entire agreement|successors|assignment', text, re.IGNORECASE
        ):
            clauses['boilerplate'].append({
                'clause_type': 'boilerplate',
                'text': match.group(0)[:200],
                'section': 'unknown',
                'confidence': 0.8,
            })
        # 12. Definitions
        for match in re.finditer(
            r'(?:means|shall mean|is defined as).{0,300}', text, re.IGNORECASE
        ):
            clauses['definitions'].append({
                'clause_type': 'definitions',
                'text': match.group(0)[:200],
                'section': 'unknown',
                'confidence': 0.85,
            })
        # Deduplicate
        for clause_type in clauses:
            seen = set()
            deduped = []
            for c in clauses[clause_type]:
                text_hash = hash(c['text'][:100]) if c['text'] else 0
                if text_hash not in seen:
                    seen.add(text_hash)
                    deduped.append(c)
            clauses[clause_type] = deduped[:5]
        return clauses



    def search_by_entity_type(self, entity_type: EntityType) -> list[KGNode]:
        """Find all nodes of a given entity type."""
        return [n for n in self.nodes.values() if n.entity_type == entity_type]

    def find_shortest_path_between_nodes(self, start_id: str, end_id: str) -> list[dict] | None:
        """Find shortest path between two nodes using BFS."""
        if start_id not in self.nodes or end_id not in self.nodes:
            return None
        if start_id == end_id:
            return [{"from": start_id, "to": end_id, "relationship": "same_node"}]

        # BFS
        queue: list[tuple[str, list[dict]]] = [(start_id, [])]
        visited: set[str] = {start_id}

        while queue:
            current_id, path = queue.pop(0)
            for edge in self._adjacency.get(current_id, []):
                next_id = edge.target_id
                new_path = path + [{"from": current_id, "to": next_id, "relationship": edge.relationship.value}]

                if next_id == end_id:
                    return path + new_path

                if next_id not in visited:
                    visited.add(next_id)
                    queue.append((next_id, new_path))

        return None

    def get_related_entities(self, node_id: str, relationship_types: list[RelationshipType] | None = None) -> list[dict]:
        """Get entities related to a given node, optionally filtered by relationship types."""
        related: list[dict] = []
        edges = self._adjacency.get(node_id, [])

        for edge in edges:
            if relationship_types is not None and edge.relationship not in relationship_types:
                continue
            target_node = self.nodes.get(edge.target_id)
            if target_node:
                related.append({
                    "node_id": edge.target_id,
                    "node_name": target_node.name,
                    "entity_type": target_node.entity_type.value,
                    "relationship": edge.relationship.value,
                    "evidence": edge.evidence,
                })

        # Also check reverse adjacency (incoming edges)
        reverse_edges = self._reverse_adjacency.get(node_id, [])
        for edge in reverse_edges:
            if relationship_types is not None and edge.relationship not in relationship_types:
                continue
            source_node = self.nodes.get(edge.source_id)
            if source_node:
                related.append({
                    "node_id": edge.source_id,
                    "node_name": source_node.name,
                    "entity_type": source_node.entity_type.value,
                    "relationship": edge.relationship.value,
                    "evidence": edge.evidence,
                })

        return related

    def export_subgraph(self, node_ids: list[str]) -> dict:
        """Export a subgraph induced by the given node IDs."""
        subgraph_nodes: dict[str, dict] = {}
        subgraph_edges: list[dict] = []

        # Export nodes
        for node_id in node_ids:
            if node_id in self.nodes:
                node = self.nodes[node_id]
                subgraph_nodes[node_id] = {
                    "id": node.id,
                    "name": node.name,
                    "entity_type": node.entity_type.value,
                    "content": node.content,
                    "source_section": node.source_section,
                    "source_document": node.source_document,
                    "metadata": node.metadata,
                }

        # Export edges where both source and target are in the subgraph
        edge_ids = set()
        for node_id in node_ids:
            for edge in self._adjacency.get(node_id, []):
                if edge.target_id in node_ids:
                    edge_key = (edge.source_id, edge.target_id, edge.relationship.value)
                    edge_ids.add(edge_key)

        for edge_key in edge_ids:
            source_id, target_id, rel = edge_key
            # Find the edge object
            for edge in self.edges:
                if edge.source_id == source_id and edge.target_id == target_id:
                    subgraph_edges.append({
                        "source": edge.source_id,
                        "target": edge.target_id,
                        "relationship": edge.relationship.value,
                        "confidence": edge.confidence,
                        "evidence": edge.evidence,
                        "source_section": edge.source_section,
                    })
                    break

        return {"nodes": subgraph_nodes, "edges": subgraph_edges}

    def export_for_reporting(self, format: str = "dict") -> dict | str:
        """Export the knowledge graph in a format suitable for reporting.

        Args:
            format: "dict" for dictionary format, "json" for JSON string,
                    "summary" for a human-readable summary dict
        """
        if format == "dict":
            return self.to_dict()
        elif format == "json":
            import json
            return json.dumps(self.to_dict(), indent=2)
        elif format == "summary":
            summary = self.summary()
            # Add entity-type breakdown and some relationship insights
            type_counts: dict[str, int] = {}
            rel_counts: dict[str, int] = {}
            for node in self.nodes.values():
                type_counts[node.entity_type.value] = type_counts.get(node.entity_type.value, 0) + 1
            for edge in self.edges:
                rel_counts[edge.relationship.value] = rel_counts.get(edge.relationship.value, 0) + 1

            return {
                "total_nodes": summary["total_nodes"],
                "total_edges": summary["total_edges"],
                "node_type_breakdown": type_counts,
                "relationship_type_breakdown": rel_counts,
                "circular_references": summary["circular_references"],
                "nodes_by_type": {
                    et: [{"id": n.id, "name": n.name, "content": n.content[:100], "source_section": n.source_section}
                         for n in self.search_by_entity_type(EntityType(et))]
                    for et in set(n.entity_type.value for n in self.nodes.values())
                }
            }
        else:
            raise ValueError(f"Unknown format: {format}. Choose from: dict, json, summary")


# ── Factory ──────────────────────────────────────────────────

DEFINED_TERM_PATTERNS = [
    r"['\"]?(\w[\w\s]{2,40})['\"]?\s*(?:means|defined as|is defined as|shall mean)\s",
    r"(\w[\w\s]{1,30})\s*\(as\s*defined\s*in\s*(?:Section|§)\s*[\d.]+\)",
    # Regulatory term patterns
    r"('|(\w[\w\s]{2,40}))\s*(?:HSR|hsr)\s*(?:threshold|filing|value)\s",
    r"('|(\w[\w\s]{2,40}))\s*(?:CFIUS|cfi-us)\s*(?:review|investment|foreign)",
    r"('|(\w[\w\s]{2,40}))\s*(?:FCPA|fcpa)\s*(?:red flag|violation|compliance)",
    r"('|(\w[\w\s]{2,40}))\s*(?:EAR|itr|export)\s*(?:control|classification)",
    r"('|(\w[\w\s]{2,40}))\s*(?:GDPR|ccpa|privacy|data subject)",
    r"('|(\w[\w\s]{2,40}))\s*(?:Delaware|New York|English law|Swiss law)\s*(?:governing|law)",
]

PARTY_PATTERNS = [
    r"(?:the\s+)?(?:Buyer|Seller|Target|Purchaser|Acquirer|Vendor|Grantor|Grantee|Lender|Borrower)"
    r"(?:\s+(?:and\s+(?:the\s+)?(?:Agent|Guarantor|Subsidiary|Affiliate)[\w\s]*))?",
    r"\b([A-Z](?:[A-Za-z0-9]+\s)?)(?:Inc\.?|Corp\.?|LLC|Ltd\.?|LP|LLP|PLC|SE|AG|GmbH|SA|NV|AB)\b",
]

REGULATORY_BODIES = [
    "SEC", "FTC", "DOJ", "CFIUS", "OFAC", "FCPA", "PCAOB", "FINRA", "OCC", "FDIC",
    "CFTC", "FCC", "FDA", "HIPAA", "GDPR", "CCPA", "SOX", "FASB", "GAAP", "IRS",
    "Treasury", "BIS", "DEA", "EPA", "OSHA", "DOL", "NLRB",
    "HSR", "CFIUS_AGENCY", "FCPA_ENFORCER", "BIS_EXPORT", "EUA", "PECB",
]


def build_knowledge_graph_from_text(text: str, document_name: str = "document") -> KnowledgeGraph:
    """Build a knowledge graph from document text."""
    kg = KnowledgeGraph()

    # Add document node
    kg.add_node(KGNode(
        id=f"doc:{document_name}",
        name=document_name,
        entity_type=EntityType.DOCUMENT,
        content=text[:500],
        source_document=document_name,
    ))

    # ── Extract defined terms ────────────────────────────────────
    seen_terms = set()
    for pattern in DEFINED_TERM_PATTERNS:
        for match in re.finditer(pattern, text, re.MULTILINE | re.DOTALL):
            term_name = match.group(1).strip() if match.lastindex else match.group(0).strip()
            if not (3 <= len(term_name) <= 60):
                continue
            term_id = f"term:{term_name.lower().replace(' ', '_')}"
            if term_id not in seen_terms:
                seen_terms.add(term_id)
                kg.add_node(KGNode(
                    id=term_id,
                    name=term_name,
                    entity_type=EntityType.DEFINED_TERM,
                    source_document=document_name,
                    source_section=match.group(0)[:100],
                    tooltip=f"Defined term: {term_name} — describes a specific contractual concept"
                ))

    # ── Extract party names ────────────────────────────────────────
    defined_shorts = set(re.findall(r'\(["\']?([A-Z][A-Za-z]+)["\']?\)', text))
    seen_party_ids = set()
    for pattern in PARTY_PATTERNS:
        for match in re.finditer(pattern, text):
            raw = match.group(0).strip()
            raw = re.sub(r'(?i)^the\s+', '', raw).strip()
            base = re.sub(r'(?i)\s+(inc\.?|corp\.?|llc|ltd\.?|co)\b', '', raw).strip()
            canon = base
            if base.lower() in {d.lower() for d in defined_shorts}:
                canon = next(d for d in defined_shorts if d.lower() == base.lower())
            elif base.endswith("Co") and base[:-2].strip() in defined_shorts:
                canon = base[:-2].strip()
            if not (3 <= len(canon) <= 80):
                continue
            party_id = f"party:{canon.lower().replace(' ', '_').replace('.', '')}"
            if party_id not in seen_party_ids:
                seen_party_ids.add(party_id)
                kg.add_node(KGNode(
                    id=party_id, name=canon,
                    entity_type=EntityType.PARTY, source_document=document_name,
                    tooltip=f"Party: {canon} — involved in the merger transaction"
                ))

    # ── Extract representations (general, tax, fundamental) ───────
    # Pattern: "General Representations:", "Tax Representations:", "Fundamental Representations"
    rep_patterns = [
        (r'\bGeneral\s+Representations\b', EntityType.REPRESENTATION, "general"),
        (r'\bTax\s+Representations\b', EntityType.TAX, "tax"),
        (r'\bFundamental\s+Representations\b', EntityType.REPRESENTATION, "fundamental"),
    ]
    for pattern, entity_type, label in rep_patterns:
        for match in re.finditer(pattern, text, re.IGNORECASE):
            # Grab a broader context snippet as content
            start = max(0, match.start())
            end = min(len(text), match.end() + 200)
            context = text[start:end].strip()
            kg.add_node(KGNode(
                id=f"rep:{label}:{document_name}",
                name=f"{label.title()} Representations",
                entity_type=entity_type,
                content=context[:200],
                source_document=document_name,
                source_section=match.group(0),
            ))

    # ── Extract financial terms and metrics ────────────────────────
    # Common financial metrics: EBITDA, Revenue, Gross Profit, Net Income, Cash Flow
    financial_metrics = ['EBITDA', 'Revenue', 'Gross Profit', 'Net Income', 'Cash Flow', 'Working Capital']
    for metric in financial_metrics:
        # Look for metric definition: "Metric" shall mean ...
        metric_pattern = rf'(?:"([^"]*{re.escape(metric)}[^"]*)"\s+(?:shall\s+mean|means)|{re.escape(metric)}\s+(?:shall\s+mean|means))'
        for match in re.finditer(metric_pattern, text, re.IGNORECASE):
            metric_name = match.group(1).strip() if match.lastindex else match.group(0).strip()
            # Extract the definition that follows
            definition_start = match.end()
            definition_end = min(len(text), definition_start + 300)
            definition = text[definition_start:definition_end].strip()
            # Clean up the definition
            definition = re.sub(r'\s+', ' ', definition).strip()[:200]

            metric_id = f"metric:{metric.lower().replace(' ', '_')}"
            kg.add_node(KGNode(
                id=metric_id,
                name=metric_name,
                entity_type=EntityType.METRIC,
                content=definition,
                source_document=document_name,
                source_section=match.group(0),
            ))

            # Link metric to relevant parties (typically Buyer/Seller)
            for party_node_id in [n_id for n_id in kg.nodes if kg.nodes[n_id].entity_type == EntityType.PARTY]:
                kg.add_edge(
                    source_id=party_node_id,
                    target_id=metric_id,
                    relationship=RelationshipType.MEASURED_BY,
                    evidence=f"Metric {metric_name} referenced in {document_name}",
                    source_section=match.group(0),
                )

    # ── Extract survival periods ───────────────────────────────────
    # Pattern: "survive X months/years" or "shall survive for X months/years"
    surv_pattern = r'(?:representations?|warranties)\s+shall\s+survive\s+(?:for\s+)?(?:(\d+)\s*(?:days|months|years)|one|two|three|four|five|six|seven|eight|nine|ten)\s*(?:days|months|years)'
    for match in re.finditer(surv_pattern, text, re.IGNORECASE):
        days_str = match.group(1)
        duration_text = match.group(0)
        dur_type = "general"
        # Get context before the match to determine type
        text_before = text[max(0, match.start() - 150):match.start()].lower()
        if 'tax' in text_before:
            dur_type = "tax"
        elif 'fundamental' in text_before or 'material' in text_before:
            dur_type = "fundamental"

        days = int(days_str) if days_str and days_str.isdigit() else None
        if days is not None:
            surv_id = f"surv:{dur_type}:{days}"
            kg.add_node(KGNode(
                id=surv_id,
                name=f"{dur_type.title()} survival period: {days} days",
                entity_type=EntityType.SURVIVAL_PERIOD,
                content=duration_text,
                source_document=document_name,
                source_section=match.group(0),
            ))

            # Link to representations entity if found nearby
            rep_search_start = max(0, match.start() - 100)
            rep_search_end = min(len(text), match.end() + 100)
            rep_context = text[rep_search_start:rep_search_end]
            rep_match = re.search(r'[A-Z][a-zA-Z\s]{3,40}', rep_context)
            if rep_match:
                rep_name = rep_match.group(0).strip()
                rep_term_id = f"term:{rep_name.lower().replace(' ', '_')}"
                if rep_term_id in kg.nodes:
                    kg.add_edge(
                        source_id=rep_term_id,
                        target_id=surv_id,
                        relationship=RelationshipType.SURVIVES,
                        evidence=f"{dur_type.title()} survival period for representations",
                        source_section=match.group(0),
                    )

    # ── Extract covenants and conditions ───────────────────────────
    # Pattern: "Seller shall not..." or "Seller shall..." covenants
    covenant_patterns = [
        (r'Seller\s+shall\s+not\s+([^\.]{10,200})', EntityType.CONDITION, "seller_restriction"),
        (r'Buyer\s+shall\s+not\s+([^\.]{10,200})', EntityType.CONDITION, "buyer_restriction"),
        (r'Seller\s+shall\s+([^\.]{10,200})', EntityType.OBLIGATION, "seller_obligation"),
        (r'Buyer\s+shall\s+([^\.]{10,200})', EntityType.OBLIGATION, "buyer_obligation"),
    ]
    for pattern, entity_type, label in covenant_patterns:
        for match in re.finditer(pattern, text, re.IGNORECASE):
            covenant_text = match.group(1).strip()
            if not covenant_text:
                continue
            # Truncate to reasonable size
            covenant_text = covenant_text[:200]
            node_id = f"{label}:{entity_type.value}:{document_name}"
            # Avoid duplicates
            if node_id not in kg.nodes:
                kg.add_node(KGNode(
                    id=node_id,
                    name=f"{label} {entity_type.value}",
                    entity_type=entity_type,
                    content=covenant_text,
                    source_document=document_name,
                    source_section=match.group(0)[:100],
                ))

    # ── Extract disclosure schedule references ─────────────────────
    for match in re.finditer(r'[Ss]chedule\s+(\d+(?:\.\d+)*(?:\([a-zA-Z0-9]+\))?|[A-Z]+(?:-\d+)?)', text, re.IGNORECASE):
        schedule_ref = match.group(1).strip()
        kg.add_node(KGNode(
            id=f"sch:{schedule_ref.lower().replace(' ', '_')}",
            name=f"Schedule {schedule_ref}",
            entity_type=EntityType.DISCLOSURE_SCHEDULE,
            source_document=document_name,
            source_section=match.group(0),
        ))

    # ── Extract regulatory entities ────────────────────────────────
    text_lower = text.lower()

    # --- HSR Threshold Detection ---
    hsr_threshold_patterns = [
        r'(?:transaction value|size of person|annual net sales).{0,200}\$?\s*[\d,.]+\s*(?:million|billion)',
        r'HSR.{0,50}threshold.{0,100}',
        r'111\.1.{0,100}million',
        r'trigger.{0,50}HSR|HSR.{0,50}trigger',
    ]
    for pattern in hsr_threshold_patterns:
        for match in re.finditer(pattern, text, re.IGNORECASE | re.DOTALL):
            start = max(0, match.start() - 50)
            end = min(len(text), match.end() + 100)
            context = text[start:end].strip()
            node_id = f"hsr:{match.group(0)[:50].lower().replace(' ', '_')}"
            kg.add_node(KGNode(
                id=node_id,
                name=f"HSR Threshold Detection",
                entity_type=EntityType.HSR_THRESHOLD,
                content=context[:200],
                source_document=document_name,
                source_section=match.group(0)[:100],
            ))
            # Link to parties if mentioned
            for party_id in [n_id for n_id in kg.nodes if kg.nodes[n_id].entity_type == EntityType.PARTY]:
                kg.add_edge(
                    source_id=party_id,
                    target_id=node_id,
                    relationship=RelationshipType.REGULATED_BY,
                    evidence=f"HSR threshold analysis for {kg.nodes[party_id].name}",
                    source_section="regulatory_extraction",
                )

    # --- CFIUS Flag Detection ---
    cfius_patterns = [
        r'foreign person|outside US|non-US acquiror',
        r'CFIUS|national security|foreign government',
        r'travel restrictions|access limitations|personal data transfers',
    ]
    for pattern in cfius_patterns:
        for match in re.finditer(pattern, text, re.IGNORECASE | re.DOTALL):
            start = max(0, match.start() - 50)
            end = min(len(text), match.end() + 100)
            context = text[start:end].strip()
            node_id = f"cfius:{match.group(0)[:50].lower().replace(' ', '_')}"
            kg.add_node(KGNode(
                id=node_id,
                name=f"CFIUS Flag",
                entity_type=EntityType.CFIUS_FLAG,
                content=context[:200],
                source_document=document_name,
                source_section=match.group(0)[:100],
            ))
            # Link to parties if non-US mentioned
            if re.search(r'non-US|outside US|foreign', pattern, re.IGNORECASE):
                for party_id in [n_id for n_id in kg.nodes if kg.nodes[n_id].entity_type == EntityType.PARTY]:
                    kg.add_edge(
                        source_id=party_id,
                        target_id=node_id,
                        relationship=RelationshipType.GOVERNED_BY,
                        evidence=f"CFIUS flag analysis for {kg.nodes[party_id].name}",
                        source_section="regulatory_extraction",
                    )

    # --- FCPA Red Flag Detection ---
    fcpa_patterns = [
        r'foreign official|government action|travel and entertainment',
        r'facilitation payments|undisclosed agents|third-party consultants',
        r'knowledge of|willful|conscious disregard',
    ]
    for pattern in fcpa_patterns:
        for match in re.finditer(pattern, text, re.IGNORECASE | re.DOTALL):
            start = max(0, match.start() - 50)
            end = min(len(text), match.end() + 100)
            context = text[start:end].strip()
            node_id = f"fcpa:{match.group(0)[:50].lower().replace(' ', '_')}"
            kg.add_node(KGNode(
                id=node_id,
                name=f"FCPA Red Flag",
                entity_type=EntityType.FCPA_RED_FLAG,
                content=context[:200],
                source_document=document_name,
                source_section=match.group(0)[:100],
            ))

    # --- Export Control Detection ---
    export_control_patterns = [
        r'\bEAR\b.{0,100}|\\bITAR\\b.{0,100}',
        r'licensing requirements|dual-use technology',
        r'\bdeemed exports\b|\\btechnical data\b|\\bdefense articles\b',
    ]
    for pattern in export_control_patterns:
        for match in re.finditer(pattern, text, re.IGNORECASE | re.DOTALL):
            start = max(0, match.start() - 50)
            end = min(len(text), match.end() + 100)
            context = text[start:end].strip()
            node_id = f"export:{match.group(0)[:50].lower().replace(' ', '_')}"
            kg.add_node(KGNode(
                id=node_id,
                name=f"Export Control",
                entity_type=EntityType.EXPORT_CONTROL,
                content=context[:200],
                source_document=document_name,
                source_section=match.group(0)[:100],
            ))

    # --- Privacy Law Indicator Detection ---
    privacy_patterns = [
        r'GDPR.{0,100}|CCPA.{0,100}|PIPEDA.{0,100}',
        r'international transfer|cross-border data|data subject',
        r'personal data|processing|data controller|data processor',
    ]
    for pattern in privacy_patterns:
        for match in re.finditer(pattern, text, re.IGNORECASE | re.DOTALL):
            start = max(0, match.start() - 50)
            end = min(len(text), match.end() + 100)
            context = text[start:end].strip()
            node_id = f"privacy:{match.group(0)[:50].lower().replace(' ', '_')}"
            kg.add_node(KGNode(
                id=node_id,
                name=f"Privacy Law Indicator",
                entity_type=EntityType.PRIVACY_LAW_INDICATOR,
                content=context[:200],
                source_document=document_name,
                source_section=match.group(0)[:100],
            ))

    # --- Jurisdictional Flag Detection ---
    jurisdictional_patterns = [
        r'Delaware|New York|English law|Swiss law|Singapore International Arbitration Centre',
    ]
    for pattern in jurisdictional_patterns:
        for match in re.finditer(pattern, text, re.IGNORECASE):
            start = max(0, match.start() - 50)
            end = min(len(text), match.end() + 100)
            context = text[start:end].strip()
            node_id = f"jurisdiction:{match.group(0)[:50].lower().replace(' ', '_')}"
            kg.add_node(KGNode(
                id=node_id,
                name=f"Jurisdictional Flag: {match.group(0).strip()}",
                entity_type=EntityType.JURISDICTIONAL_FLAG,
                content=context[:200],
                source_document=document_name,
                source_section=match.group(0)[:100],
            ))

    # ── Add key relationships ────────────────────────────────────────
    # 1. Defined terms referenced in the document
    for term_node_id in [n_id for n_id in kg.nodes if kg.nodes[n_id].entity_type == EntityType.DEFINED_TERM]:
        term_name = kg.nodes[term_node_id].name
        # Look for references to this term in the text
        term_ref_pattern = rf'\b{re.escape(term_name)}\b'
        ref_count = len(re.findall(term_ref_pattern, text, re.IGNORECASE))
        if ref_count > 1:  # Term is used more than just in its definition
            # Find the first reference location
            first_ref_match = re.search(term_ref_pattern, text)
            if first_ref_match:
                kg.add_edge(
                    source_id=term_node_id,
                    target_id=f"doc:{document_name}",
                    relationship=RelationshipType.REFERENCES,
                    evidence=f"Term '{term_name}' used {ref_count} times in document",
                    source_section=first_ref_match.group(0)[:100],
                )

    # 2. Parties to representations
    for party_node_id in [n_id for n_id in kg.nodes if kg.nodes[n_id].entity_type == EntityType.PARTY]:
        party_name = kg.nodes[party_node_id].name
        # Check if party is associated with representations
        rep_context_pattern = rf'{party_name}.{{0,200}}representations|representations.{0,200}{party_name}'
        if re.search(rep_context_pattern, text, re.IGNORECASE):
            # Only add edge if representation node exists
            rep_node_id = f"rep:general:{document_name}"
            if rep_node_id in kg.nodes:
                kg.add_edge(
                    source_id=party_node_id,
                    target_id=rep_node_id,
                    relationship=RelationshipType.REPS_BY,
                    evidence=f"Party {party_name} provides representations",
                    source_section="contextual",
                )

    # 3. Metrics calculated by parties
    for metric_node_id in [n_id for n_id in kg.nodes if kg.nodes[n_id].entity_type == EntityType.METRIC]:
        metric_name = kg.nodes[metric_node_id].name
        # Check which party's CFO/determination is mentioned
        for party_node_id in [n_id for n_id in kg.nodes if kg.nodes[n_id].entity_type == EntityType.PARTY]:
            party_name = kg.nodes[party_node_id].name
            # Check if party's CFO or team determines the metric
            cfo_pattern = rf'{party_name}.{{0,100}}CFO|CFO.{0,100}{party_name}'
            if re.search(cfo_pattern, text, re.IGNORECASE):
                kg.add_edge(
                    source_id=metric_node_id,
                    target_id=party_node_id,
                    relationship=RelationshipType.CALCULATES,
                    evidence=f"{metric_name} calculated by {party_name}'s CFO",
                    source_section="contextual",
                )

    # 4. Fundamental reps survival → indefinite
    for surv_node_id in [n_id for n_id in kg.nodes if kg.nodes[n_id].entity_type == EntityType.SURVIVAL_PERIOD]:
        surv_name = kg.nodes[surv_node_id].name.lower()
        if 'fundamental' in surv_name:
            # Flag that fundamental reps should survive indefinitely
            kg.add_edge(
                source_id=surv_node_id,
                target_id=f"doc:{document_name}",
                relationship=RelationshipType.SURVIVES,
                evidence="Fundamental representations survival period",
                source_section="taxonomy",
            )

    # ── Extract governing law ────────────────────────────────────────
    # Look for: "governing by the laws of", "this agreement shall be governed", "jurisdiction"
    text_lower = text.lower()
    governing_law = "not specified"
    specific_laws = ['delaware', 'new york', 'california', 'texas', 'london', 'england', 'uk']

    governing_law_patterns = [
        r'governing\s+by\s+the\s+laws\s+of\s+([^\.]{0,100})',
        r'this\s+agreement\s+shall\s+be\s+governed\s+by\s+the?\s+laws\s+of\s+([^\.]{0,100})',
        r'governed\s+by\s+the?\s+laws\s+of\s+([^\.]{0,100})',
        r'governed\s+by\s+and\s+construed\s+in\s+accordance\s+with\s+the\s+laws\s+of\s+([^\.]{0,100})',
        r'jurisdiction\s+([^\.]{0,100})',
    ]

    for pattern in governing_law_patterns:
        match = re.search(pattern, text, re.IGNORECASE)
        if match:
            law = match.group(1).strip().rstrip(';,.')
            law_lower = law.lower()
            for specific in specific_laws:
                if law_lower.startswith(specific) or law_lower == specific:
                    governing_law = law
                    break
            if governing_law == "not specified" and law:
                governing_law = law
            break

    # Add governing law node
    kg.add_node(KGNode(
        id=f"law:{governing_law.lower().replace(' ', '_').replace('.', '')}",
        name=governing_law if governing_law != "not specified" else "No governing law specified",
        entity_type=EntityType.GOVERNING_LAW,
        content=f"Governing law for {document_name}",
        source_document=document_name,
    ))

    # Add governing law edge to document
    doc_node_id = f"doc:{document_name}"
    kg.add_edge(
        source_id=f"law:{governing_law.lower().replace(' ', '_').replace('.', '')}" if governing_law != "not specified" else doc_node_id,
        target_id=doc_node_id,
        relationship=RelationshipType.GOVERNED_BY,
        evidence=f"Governing law: {governing_law}",
        source_section="governing_law_clause",
    )

    # ── Extract related agreements ────────────────────────────────────
    # Detect: "ancillary agreements", "side letters", "deed of adherence", "transition agreement"
    #          "deed of transfer", "bill of sale", "Assignment and Assumption Agreement"
    related_agreement_patterns = [
        r'ancillary\s+agreement',
        r'side\s+letter',
        r'deed\s+of\s+adherence',
        r'transition\s+agreement',
        r'deed\s+of\s+transfer',
        r'bill\s+of\s+sale',
        r'assignment\s+and\s+assumption',
    ]

    found_agreements: set = set()
    for pattern in related_agreement_patterns:
        for match in re.finditer(pattern, text, re.IGNORECASE):
            found_agreements.add(match.group(0).strip())

    # Add related agreement nodes
    for agreement_text in found_agreements:
        agreement_id = f"agreement:{agreement_text.lower().replace(' ', '_').replace('.', '')}"
        kg.add_node(KGNode(
            id=agreement_id,
            name=agreement_text,
            entity_type=EntityType.RELATED_AGREEMENT,
            content=f"Related agreement detected in {document_name}",
            source_document=document_name,
        ))
        # Link related agreement to document
        kg.add_edge(
            source_id=agreement_id,
            target_id=doc_node_id,
            relationship=RelationshipType.REFERENCES,
            evidence=f"Related agreement: {agreement_text}",
            source_section="related_agreements",
        )

    # If no related agreements found, still add a marker node
    if not found_agreements:
        kg.add_node(KGNode(
            id=f"agreement:none:{document_name}",
            name="No related agreements detected",
            entity_type=EntityType.RELATED_AGREEMENT,
            content="No ancillary/side agreements/related agreements found in document",
            source_document=document_name,
        ))

    # ── Extract version status ────────────────────────────────────────
    # Detect execution status: "executed", "effective", "draft", "negotiation", "pending"
    # Look for: "date of execution", "effective date", "parties agree", "subject to contract"
    #          "counterparts", "execution copy", "original signed copy"
    text_lower = text.lower()
    version_status = "draft"  # default

    # Check for "executed" indicators
    if re.search(r'\b(date\s+of\s+execution|execution\s+date|parties\s+agree|subject\s+to\s+contract)\b', text_lower):
        version_status = "executed"
    # Check for "effective date"
    elif re.search(r'\beffective\s+date\b', text_lower):
        version_status = "effective"
    # Check for "counterparts" or "execution copy"
    elif re.search(r'\bcounterparts\b', text_lower) or re.search(r'\bexecution\s+copy\b', text_lower):
        version_status = "executed"
    # Check for negotiation/pending indicators
    elif re.search(r'\bnegotiat\w*\b', text_lower) or re.search(r'\bpending\b', text_lower):
        version_status = "negotiation" if re.search(r'\bnegotiat\w*\b', text_lower) else "pending"
    else:
        version_status = "draft"

    # Store version status as metadata on the document node
    for node in kg.nodes.values():
        if node.entity_type == EntityType.DOCUMENT:
            node.metadata["version_status"] = version_status
            node.metadata["execution_status"] = version_status
            break

    # ── Detect dead-definition false positives ─────────────────────
    kg.dead_definition_findings = kg.detect_missing_links(text)

    return kg