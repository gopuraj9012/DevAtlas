"""Contract impact graph: legacy SQL/SOAP interfaces -> the services that consume them."""

from datacontracts import CONTRACT_KINDS, owner_system

KIND_LABEL = {k["key"]: k["label"] for k in CONTRACT_KINDS}
RISK_ORDER = {"high": 0, "medium": 1, "low": 2}
IN_SCOPE_KINDS = {"table", "view", "soap"}


def risk_for(contract: dict) -> str:
    consumed = bool(contract.get("consumers"))
    if contract["status"] == "deprecated" or (contract["status"] == "draft" and consumed):
        return "high"
    if any(c.get("breaking") for c in contract.get("changes", [])):
        return "medium"
    return "low"


def build_graph(contracts: list[dict], projects: list[dict]) -> dict:
    by_name = {p["name"].lower(): p for p in projects}
    interfaces, edges = [], []
    services: dict[str, dict] = {}
    for c in contracts:
        if c["kind"] not in IN_SCOPE_KINDS or owner_system(c) not in {"legacy", "both"}:
            continue
        risk = risk_for(c)
        breaking = sum(1 for ch in c.get("changes", []) if ch.get("breaking"))
        consumers = []
        for name in c.get("consumers", []):
            p = by_name.get(name.lower())
            system = p["system"] if p else "unknown"
            consumers.append({"name": name, "system": system, "slug": p["slug"] if p else None})
            services.setdefault(name, {"name": name, "system": system, "slug": p["slug"] if p else None, "interfaces": []})["interfaces"].append(c["code"])
            edges.append({"from": c["code"], "to": name, "system": system, "risk": risk, "breaking": breaking > 0})
        legacy_producers = [n for n in c.get("producers", []) if by_name.get(n.lower(), {}).get("system") == "legacy"]
        interfaces.append({
            "code": c["code"], "name": c["name"], "kind": c["kind"], "kind_label": KIND_LABEL[c["kind"]],
            "status": c["status"], "version": c["version"], "owner": c["owner"], "direction": c["direction"],
            "owner_system": owner_system(c), "producers": c.get("producers", []), "legacy_producers": legacy_producers,
            "consumers": consumers,
            "modern_consumers": sum(1 for x in consumers if x["system"] == "modern"),
            "legacy_consumers": sum(1 for x in consumers if x["system"] == "legacy"),
            "unknown_consumers": sum(1 for x in consumers if x["system"] == "unknown"),
            "breaking_changes": breaking, "risk": risk, "updated": c.get("updated"),
        })
    interfaces.sort(key=lambda i: (RISK_ORDER[i["risk"]], i["code"]))
    svc = sorted(services.values(), key=lambda s: (s["system"], s["name"]))
    return {
        "interfaces": interfaces,
        "services": svc,
        "edges": edges,
        "summary": {
            "interfaces": len(interfaces),
            "services": len(svc),
            "modern_services": sum(1 for s in svc if s["system"] == "modern"),
            "unclassified_services": sum(1 for s in svc if s["system"] == "unknown"),
            "edges": len(edges),
            "high_risk": sum(1 for i in interfaces if i["risk"] == "high"),
            "breaking_changes": sum(i["breaking_changes"] for i in interfaces),
            "sql": sum(1 for i in interfaces if i["kind"] in {"table", "view"}),
            "soap": sum(1 for i in interfaces if i["kind"] == "soap"),
        },
    }
