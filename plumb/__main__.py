"""
python3 -m plumb <command> [args...]

FX-SPEC-002 v1.0 준수 Plumb Track-A stub.
Spec Container(rules/ + tests/contract/ + provenance.yaml)를 검증하고
SyncResult JSON을 stdout에 출력한다.
"""
from __future__ import annotations

import json
import os
import sys
import time
from pathlib import Path
from datetime import datetime, timezone


def _iso_now() -> str:
    return datetime.now(timezone.utc).isoformat()


def _scan_spec_container(spec_dir: Path) -> dict:
    """Spec Container의 rules/, tests/contract/, provenance.yaml 검증."""
    gaps = []
    decisions = []

    rules_dir = spec_dir / "rules"
    tests_dir = spec_dir / "tests" / "contract"
    provenance = spec_dir / "provenance.yaml"

    # specToCode: rules/ 파일 → 구현 코드 매핑 확인
    spec_to_code_matched = 0
    spec_to_code_total = 0
    if rules_dir.exists():
        rule_files = list(rules_dir.glob("*.md")) + list(rules_dir.glob("*.yaml"))
        spec_to_code_total = len(rule_files)
        for f in rule_files:
            content = f.read_text(encoding="utf-8")
            # BL-NNN 패턴이 있으면 명세로 인정
            if "BL-" in content or "condition" in content.lower() or "criteria" in content.lower():
                spec_to_code_matched += 1
                decisions.append({
                    "id": f"d-{f.stem}",
                    "source": "agent",
                    "summary": f"{f.name} 규칙 명세 검증 완료",
                    "status": "approved",
                    "commit": ""
                })
            else:
                gaps.append({
                    "type": "spec_only",
                    "path": str(f.relative_to(spec_dir)),
                    "description": "규칙 파일에 BL/condition/criteria 패턴 없음"
                })
    else:
        gaps.append({
            "type": "spec_only",
            "path": "rules/",
            "description": "rules/ 디렉터리 없음"
        })

    # codeToTest: tests/contract/ 존재 확인
    code_to_test_matched = 0
    code_to_test_total = 1
    if tests_dir.exists() and any(tests_dir.iterdir()):
        code_to_test_matched = 1
    else:
        gaps.append({
            "type": "test_missing",
            "path": "tests/contract/",
            "description": "contract 테스트 없음"
        })

    # specToTest: provenance.yaml 존재 확인
    spec_to_test_matched = 0
    spec_to_test_total = 1
    if provenance.exists():
        spec_to_test_matched = 1
        decisions.append({
            "id": "d-provenance",
            "source": "agent",
            "summary": "provenance.yaml 존재 확인 — 출처 추적 가능",
            "status": "approved",
            "commit": ""
        })
    else:
        gaps.append({
            "type": "spec_only",
            "path": "provenance.yaml",
            "description": "provenance.yaml 없음"
        })

    success = len(gaps) == 0
    return {
        "success": success,
        "triangle": {
            "specToCode": {
                "matched": spec_to_code_matched,
                "total": max(spec_to_code_total, 1),
                "gaps": [g for g in gaps if g["type"] in ("spec_only", "code_only", "drift")]
            },
            "codeToTest": {
                "matched": code_to_test_matched,
                "total": code_to_test_total,
                "gaps": [g for g in gaps if g["type"] == "test_missing"]
            },
            "specToTest": {
                "matched": spec_to_test_matched,
                "total": spec_to_test_total,
                "gaps": []
            }
        },
        "decisions": decisions,
        "errors": []
    }


def cmd_version() -> None:
    print(f"plumb {__import__('plumb').__version__}")


def cmd_review(args: list[str]) -> int:
    spec_dir_arg = args[0] if args else "."
    spec_dir = Path(spec_dir_arg).resolve()

    if not spec_dir.exists():
        result = {
            "success": False,
            "timestamp": _iso_now(),
            "duration": 0,
            "triangle": {
                "specToCode": {"matched": 0, "total": 0, "gaps": []},
                "codeToTest": {"matched": 0, "total": 0, "gaps": []},
                "specToTest": {"matched": 0, "total": 0, "gaps": []}
            },
            "decisions": [],
            "errors": [{"code": "DIR_NOT_FOUND", "message": f"Spec Container 경로 없음: {spec_dir}"}]
        }
        print(json.dumps(result, ensure_ascii=False, indent=2))
        return 1

    start_ms = int(time.time() * 1000)
    scan = _scan_spec_container(spec_dir)
    duration_ms = int(time.time() * 1000) - start_ms

    result = {
        "success": scan["success"],
        "timestamp": _iso_now(),
        "duration": duration_ms,
        "triangle": scan["triangle"],
        "decisions": scan["decisions"],
        "errors": scan["errors"]
    }

    # decisions.jsonl 기록 (CWD 기준 .foundry-x/)
    decisions_dir = Path(".foundry-x")
    decisions_dir.mkdir(exist_ok=True)
    decisions_file = decisions_dir / "decisions.jsonl"
    with decisions_file.open("a", encoding="utf-8") as f:
        for d in scan["decisions"]:
            f.write(json.dumps(d, ensure_ascii=False) + "\n")

    print(json.dumps(result, ensure_ascii=False, indent=2))
    return 0 if scan["success"] else 2


def cmd_status(args: list[str]) -> int:
    return cmd_review(args)


def main() -> None:
    output_format = os.environ.get("PLUMB_OUTPUT_FORMAT", "text")
    argv = sys.argv[1:]

    if not argv or argv[0] in ("-h", "--help"):
        print("usage: python3 -m plumb <command> [args...]")
        print("commands: review, status, --version")
        sys.exit(0)

    if argv[0] == "--version":
        cmd_version()
        sys.exit(0)

    command = argv[0]
    rest = argv[1:]

    if command == "review":
        sys.exit(cmd_review(rest))
    elif command == "status":
        sys.exit(cmd_status(rest))
    else:
        err = {"code": "UNKNOWN_CMD", "message": f"알 수 없는 커맨드: {command}"}
        print(json.dumps({"success": False, "errors": [err]}, ensure_ascii=False))
        sys.exit(1)


if __name__ == "__main__":
    main()
