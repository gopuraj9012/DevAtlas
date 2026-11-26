"""Migration coverage, weighted from documented migration status. Invents nothing."""

from datacontracts import CONTRACTS
from procedures import PROCEDURES, STATUS_WEIGHT

STATUS_LABEL = {"rewritten": "Rewritten", "partial": "Partly migrated", "not-started": "Not started"}

# Legacy interfaces with a recorded modern path
INTERFACE_STATUS = {
    "DC-01": ("partial", "Modern reads via EF Core; writes still go through usp_SaveOrder for back-office edits."),
    "DC-02": ("partial", "Read model in place; no modern write path."),
    "DC-03": ("not-started", "View still in draft; platform calls WCF for balances."),
    "DC-05": ("partial", "OrderShipped event drafted as the replacement."),
    "DC-08": ("not-started", "Finance has not moved off the file."),
}

AREAS = [("procedures", "Stored procedures"), ("interfaces", "Legacy interfaces")]


def build(projects: list[dict]) -> dict:
    names = {p["slug"]: p["name"] for p in projects}
    items = []
    for p in PROCEDURES:
        items.append({
            "name": p["name"], "area": "procedures", "project_slug": p["project_slug"], "project": names.get(p["project_slug"], p["project_slug"]),
            "status": p["status"], "status_label": STATUS_LABEL[p["status"]], "weight": STATUS_WEIGHT[p["status"]],
            "percent": round(STATUS_WEIGHT[p["status"]] * 100), "contract": p["contract"], "note": p["modern"]["note"],
            "link": f"/projects/{p['project_slug']}?tab=procedures",
        })
    for c in CONTRACTS:
        if c["code"] not in INTERFACE_STATUS:
            continue
        status, note = INTERFACE_STATUS[c["code"]]
        slug = next((s for s, n in names.items() if n == c["owner"]), None)
        items.append({
            "name": c["name"], "area": "interfaces", "project_slug": slug, "project": c["owner"],
            "status": status, "status_label": STATUS_LABEL[status], "weight": STATUS_WEIGHT[status],
            "percent": round(STATUS_WEIGHT[status] * 100), "contract": c["code"], "note": note,
            "link": f"/contracts?code={c['code']}",
        })
    items.sort(key=lambda i: (i["weight"], i["area"], i["name"]))

    def roll(rows):
        total = len(rows)
        weighted = sum(r["weight"] for r in rows)
        return {
            "total": total,
            "mapped": sum(1 for r in rows if r["status"] == "rewritten"),
            "partial": sum(1 for r in rows if r["status"] == "partial"),
            "not_started": sum(1 for r in rows if r["status"] == "not-started"),
            "weighted": weighted,
            "percent": round(weighted / total * 100) if total else 0,
        }

    by_area = []
    for key, label in AREAS:
        r = roll([i for i in items if i["area"] == key])
        r.pop("weighted")
        by_area.append({"key": key, "label": label, **r})
    by_area.sort(key=lambda a: a["percent"])
    return {
        "overall": roll(items),
        "by_area": by_area,
        "items": items,
        "remaining": [i for i in items if i["status"] != "rewritten"],
        "note": "Rewritten counts as 1, partly migrated as 0.5, not started as 0. The score reflects documented status, not measured code.",
    }
