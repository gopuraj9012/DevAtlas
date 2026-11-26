"""Modern service topology. Static: service wiring is architecture, not content."""

from datacontracts import CONTRACTS

KIND_LABELS = {"ui": "Client", "api": "API", "worker": "Worker", "gateway": "Gateway", "boundary": "Legacy boundary"}

SERVICES = [
    {"key": "portal", "name": "Customer portal", "kind": "ui", "column": 0, "row": 1, "stack": "React SPA", "description": "Customer-facing ordering site.", "responsibilities": ["Browse and place orders", "Show order status"], "external": False},
    {"key": "gateway", "name": "Identity.Gateway", "kind": "gateway", "column": 1, "row": 1, "stack": "YARP, OpenIddict", "description": "Single entry point; exchanges forms cookies for JWTs and routes to APIs.", "responsibilities": ["Token issue and refresh", "Routing", "Rate limiting"], "external": False},
    {"key": "api", "name": "OrderPlatform.Api", "kind": "api", "column": 2, "row": 0, "stack": "Minimal APIs, MediatR, EF Core 8", "description": "Order commands and queries.", "responsibilities": ["Place and cancel orders", "Order queries", "Publish OrderPlaced"], "external": False},
    {"key": "worker", "name": "OrderPlatform.Worker", "kind": "worker", "column": 3, "row": 1, "stack": "Worker Service, MassTransit", "description": "Consumes order events, reserves stock, syncs legacy tables.", "responsibilities": ["Stock reservation", "Sync bridge", "Publish OrderShipped"], "external": False},
    {"key": "billing", "name": "Billing.Integration", "kind": "boundary", "column": 4, "row": 1, "stack": ".NET Framework 4.8, WCF", "description": "Legacy billing, reached across the boundary.", "responsibilities": ["Invoicing", "Finance file"], "external": True},
]

EDGES = [
    {"from": "portal", "to": "gateway", "channel": "endpoint", "async": False, "labels": ["All /api routes"], "contract": None, "note": "Browser traffic always enters through the gateway.", "external": False},
    {"from": "gateway", "to": "api", "channel": "endpoint", "async": False, "labels": ["POST /orders", "GET /orders/{id}"], "contract": "DC-04", "note": "JWT attached by the gateway.", "external": False},
    {"from": "api", "to": "worker", "channel": "event", "async": True, "labels": ["OrderPlaced"], "contract": "DC-06", "note": "Delivered through the outbox; at-least-once.", "external": False},
    {"from": "worker", "to": "api", "channel": "event", "async": True, "labels": ["StockReserved"], "contract": None, "note": "Updates order availability.", "external": False},
    {"from": "worker", "to": "billing", "channel": "endpoint", "async": False, "labels": ["IInvoiceService.CreateInvoice"], "contract": "DC-05", "note": "Deprecated SOAP call; replaced by OrderShipped.", "external": True},
    {"from": "worker", "to": "billing", "channel": "event", "async": True, "labels": ["OrderShipped"], "contract": "DC-07", "note": "Draft; not consumed in production yet.", "external": True},
]

LIBRARIES = [
    {"name": "ApplicationCore", "used_by": ["OrderPlatform.Api", "OrderPlatform.Worker"], "note": "Domain and application layers shared by API and worker."},
    {"name": "Infrastructure", "used_by": ["OrderPlatform.Api", "OrderPlatform.Worker"], "note": "EF Core, outbox and bus implementations."},
    {"name": "BlazorShared", "used_by": ["Customer portal"], "note": "Shared DTOs for the portal."},
]


def build() -> dict:
    names = {s["key"]: s["name"] for s in SERVICES}
    contract_names = {c["code"]: c["name"] for c in CONTRACTS}
    # merge edges per (from, to, channel) so a pair never draws overlapping arrows
    merged: dict[tuple, dict] = {}
    for e in EDGES:
        key = (e["from"], e["to"], e["channel"])
        if key in merged:
            merged[key]["labels"] += e["labels"]
            continue
        merged[key] = {**e, "labels": list(e["labels"]), "from_name": names[e["from"]], "to_name": names[e["to"]], "contract_name": contract_names.get(e["contract"]) if e["contract"] else None}
    edges = list(merged.values())
    services = [{**s, "kind_label": KIND_LABELS[s["kind"]]} for s in SERVICES]
    internal = [e for e in edges if not e["external"]]
    cited = sorted({e["contract"] for e in edges if e["contract"]})
    return {
        "services": services,
        "edges": edges,
        "libraries": LIBRARIES,
        "summary": {
            "services": sum(1 for s in SERVICES if not s["external"]),
            "edges": len(internal),
            "sync": sum(1 for e in internal if not e["async"]),
            "async": sum(1 for e in internal if e["async"]),
            "external": sum(1 for e in edges if e["external"]),
            "contracts": [{"code": c, "name": contract_names[c]} for c in cited],
        },
        "note": "Curated topology of the modern estate. Project references (libraries) are not network hops and are listed separately.",
    }
