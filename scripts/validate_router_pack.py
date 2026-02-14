#!/usr/bin/env python3
"""Validate CredVerse router prompt pack completeness, including swarm rules."""

from __future__ import annotations

import argparse
from pathlib import Path
import sys


REQUIRED_FILES = [
    ".github/prompts/agent-router.prompt.md",
    ".github/prompts/README.md",
    ".github/prompts/agent-team.prompt.md",
]

ROLE_PROMPTS = [
    ".github/prompts/product-lead.prompt.md",
    ".github/prompts/ux-lead.prompt.md",
    ".github/prompts/frontend-lead.prompt.md",
    ".github/prompts/mobile-lead.prompt.md",
    ".github/prompts/backend-lead.prompt.md",
    ".github/prompts/data-ml-lead.prompt.md",
    ".github/prompts/security-lead.prompt.md",
    ".github/prompts/qa-lead.prompt.md",
    ".github/prompts/devops-lead.prompt.md",
    ".github/prompts/api-integration-lead.prompt.md",
    ".github/prompts/docs-lead.prompt.md",
    ".github/prompts/compliance-lead.prompt.md",
    ".github/prompts/growth-lead.prompt.md",
    ".github/prompts/support-ops-lead.prompt.md",
    ".github/prompts/release-manager.prompt.md",
]

ROUTER_REQUIRED_SNIPPETS = [
    "Deterministic Routing Algorithm",
    "Role Task Charters",
    "[Invoking:",
    "[Using tools:",
    "Goal -> Plan -> Action -> Observation -> Correction -> Completion",
    "Swarm Collaboration Protocol",
    "[Swarm mode:",
]

ROLE_REQUIRED_SNIPPETS = [
    "Swarm Collaboration:",
    "Dynamic Tool Selection",
    "[Using tools:",
]

AGENT_DOC_REQUIRED_SNIPPETS = [
    "Auto-Select Routing Contract",
    "Role-to-Skill-and-Tool Matrix",
    "Swarm and Inter-Agent Messaging Rules",
]


def read_text(path: Path) -> str:
    return path.read_text(encoding="utf-8", errors="replace")


def find_latest_agent_doc(repo_root: Path) -> Path | None:
    docs_dir = repo_root / "docs" / "agents"
    if not docs_dir.exists():
        return None
    files = sorted([p for p in docs_dir.glob("*.md") if p.is_file()])
    return files[-1] if files else None


def main() -> int:
    parser = argparse.ArgumentParser(
        description="Validate CredVerse router prompt pack"
    )
    parser.add_argument("repo_path", nargs="?", default=".", help="Repository root path")
    args = parser.parse_args()

    repo = Path(args.repo_path).resolve()
    errors: list[str] = []

    for rel in REQUIRED_FILES + ROLE_PROMPTS:
        path = repo / rel
        if not path.exists():
            errors.append(f"Missing file: {rel}")

    router_path = repo / ".github/prompts/agent-router.prompt.md"
    if router_path.exists():
        router_text = read_text(router_path)
        for snippet in ROUTER_REQUIRED_SNIPPETS:
            if snippet not in router_text:
                errors.append(f"Router missing snippet: {snippet}")

    for rel in ROLE_PROMPTS:
        path = repo / rel
        if not path.exists():
            continue
        text = read_text(path)
        for snippet in ROLE_REQUIRED_SNIPPETS:
            if snippet not in text:
                errors.append(f"{rel} missing snippet: {snippet}")

    latest_agent_doc = find_latest_agent_doc(repo)
    if latest_agent_doc is None:
        errors.append("Missing docs/agents/*.md")
    else:
        doc_text = read_text(latest_agent_doc)
        for snippet in AGENT_DOC_REQUIRED_SNIPPETS:
            if snippet not in doc_text:
                errors.append(
                    f"{latest_agent_doc.relative_to(repo)} missing snippet: {snippet}"
                )

    if errors:
        print("Router pack validation FAILED")
        for err in errors:
            print(f"- {err}")
        return 1

    print("Router pack validation PASSED")
    print(f"- Repo: {repo}")
    if latest_agent_doc is not None:
        print(f"- Agent doc: {latest_agent_doc.relative_to(repo)}")
    print(f"- Role prompts checked: {len(ROLE_PROMPTS)}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
