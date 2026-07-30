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

    def get_label(self) -> str:
        return f"[{self.entity_type.value}] {self.name}"


@dataclass
class KGEdge:
    """A directed relationship between two nodes"""
    source_id: str
    target_id: str
    relationship: RelationshipType
    confidence: float = 1.0  # 0.0 to 1.0
    evidence: str = ""  # Text excerpt supporting this edge
    source_section: str = ""


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

    def detect_missing_links(self) -> list[dict]:
        """Detect nodes with missing expected relationships."""
        findings = []
        for node_id, node in self.nodes.items():
            if node.entity_type == EntityType.DEFINED_TERM:
                outgoing = [e for e in self.edges if e.source_id == node_id]
                if not outgoing:
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


# ── Factory ──────────────────────────────────────────────────

DEFINED_TERM_PATTERNS = [
    r"['\"]?(\w[\w\s]{2,40})['\"]?\s*(?:means|defined as|is defined as|shall mean)\s",
    r"\b([A-Z]{2,10})\b",
    r"(\w[\w\s]{1,30})\s*\(as\s*defined\s*in\s*(?:Section|§)\s*[\d.]+\)",
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

    # Extract defined terms
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
                ))

    # Extract party names
    for pattern in PARTY_PATTERNS:
        for match in re.finditer(pattern, text):
            party_name = match.group(0).strip()
            if not (3 <= len(party_name) <= 80):
                continue
            party_id = f"party:{party_name.lower().replace(' ', '_').replace('.', '')}"
            if party_id not in [n.id for n in kg.nodes.values()]:
                kg.add_node(KGNode(
                    id=party_id, name=party_name,
                    entity_type=EntityType.PARTY, source_document=document_name,
                ))

    # Extract regulatory references
    for body in REGULATORY_BODIES:
        if re.search(rf'\b{re.escape(body)}\b', text, re.IGNORECASE):
            reg_id = f"reg:{body.lower()}"
            if reg_id not in [n.id for n in kg.nodes.values()]:
                kg.add_node(KGNode(
                    id=reg_id, name=body,
                    entity_type=EntityType.REGULATORY_APPROVAL,
                    source_document=document_name,
                ))

    return kg