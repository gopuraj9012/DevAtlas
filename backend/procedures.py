"""Legacy stored procedures paired with their modern replacement path.

Static data, generated per request; no seeding step.
"""

CRIT_ORDER = {"critical": 0, "high": 1, "medium": 2}
STATUS_WEIGHT = {"rewritten": 1.0, "partial": 0.5, "not-started": 0.0}

PROCEDURES = [
    {
        "project_slug": "atlas-core", "name": "usp_SaveOrder", "purpose": "Inserts or updates an order header and its lines, enforcing the total invariant.",
        "criticality": "critical", "status": "partial", "called_by": ["OrderEdit.aspx", "OrderPlatform.Worker (bridge)"],
        "tables": ["dbo.Orders", "dbo.OrderLines"], "contract": "DC-01",
        "parameters": [{"name": "@OrderId", "type": "int", "direction": "inout"}, {"name": "@CustomerId", "type": "int", "direction": "in"}, {"name": "@Lines", "type": "dbo.OrderLineType", "direction": "in"}, {"name": "@Total", "type": "decimal(18,2)", "direction": "in"}],
        "returns": "OrderId",
        "legacy_lang": "sql",
        "legacy_code": "CREATE OR ALTER PROCEDURE dbo.usp_SaveOrder @OrderId int OUTPUT, @CustomerId int, @Lines dbo.OrderLineType READONLY, @Total decimal(18,2)\nAS\nBEGIN\n  IF @Total <> (SELECT SUM(Qty * Price * (1 - Discount)) FROM @Lines)\n    THROW 50010, 'Order total does not match its lines.', 1;\n  -- MERGE into dbo.Orders / dbo.OrderLines ...\nEND",
        "modern": {"service": "OrderPlatform.Api", "entry": "POST /orders", "flow": "PlaceOrder command -> PlaceOrderHandler -> Order.Place -> EF Core -> outbox OrderPlaced", "note": "New orders are written by EF Core; edits from the back office still call the procedure.", "lang": "csharp", "code": "var order = Order.Place(customer, cmd.Lines, _clock.UtcNow);\n_db.Orders.Add(order);\nawait _db.SaveChangesAsync(ct);"},
        "notes": ["The worker still calls this procedure to sync modern orders into legacy tables."],
    },
    {
        "project_slug": "atlas-core", "name": "usp_GetOrder", "purpose": "Returns a single order header by id.",
        "criticality": "high", "status": "rewritten", "called_by": ["OrderDetails.aspx", "OrderController"],
        "tables": ["dbo.Orders"], "contract": "DC-01",
        "parameters": [{"name": "@OrderId", "type": "int", "direction": "in"}], "returns": "Order row",
        "legacy_lang": "sql", "legacy_code": "SELECT OrderId, OrderNumber, Status, Total FROM dbo.Orders WHERE OrderId = @OrderId;",
        "modern": {"service": "OrderPlatform.Api", "entry": "GET /orders/{id}", "flow": "GetOrder query -> handler -> AsNoTracking projection", "note": "Fully replaced for modern callers.", "lang": "csharp", "code": "await _db.Orders.AsNoTracking().Where(o => o.Id == q.Id).Select(o => new OrderDto(o.Id, o.Number, o.Total)).FirstOrDefaultAsync(ct);"},
        "notes": [],
    },
    {
        "project_slug": "atlas-core", "name": "usp_SaveCustomer", "purpose": "Creates or updates a customer and checks email uniqueness.",
        "criticality": "high", "status": "not-started", "called_by": ["CustomerEdit.aspx"],
        "tables": ["dbo.Customers"], "contract": "DC-02",
        "parameters": [{"name": "@CustomerId", "type": "int", "direction": "inout"}, {"name": "@Name", "type": "nvarchar(160)", "direction": "in"}, {"name": "@Email", "type": "nvarchar(254)", "direction": "in"}],
        "returns": "CustomerId",
        "legacy_lang": "sql", "legacy_code": "IF EXISTS (SELECT 1 FROM dbo.Customers WHERE Email = @Email AND CustomerId <> ISNULL(@CustomerId, 0))\n  THROW 50020, 'Email already in use.', 1;",
        "modern": {"service": "None yet", "entry": "Atlas.Core back office only", "flow": "Customers are still created only in Atlas.Core.", "note": "Workaround: the modern platform reads customers through a read model and never writes them.", "lang": "text", "code": "No modern write path."},
        "notes": ["Blocked on deciding who owns the customer master."],
    },
    {
        "project_slug": "atlas-core", "name": "usp_SearchOrders", "purpose": "Back-office order search with optional filters.",
        "criticality": "medium", "status": "partial", "called_by": ["OrderSearch.aspx"],
        "tables": ["dbo.Orders", "dbo.Customers"], "contract": "DC-01",
        "parameters": [{"name": "@Number", "type": "nvarchar(16)", "direction": "in"}, {"name": "@CustomerName", "type": "nvarchar(160)", "direction": "in"}, {"name": "@Status", "type": "tinyint", "direction": "in"}],
        "returns": "Order rows",
        "legacy_lang": "sql", "legacy_code": "SELECT TOP (200) o.* FROM dbo.Orders o JOIN dbo.Customers c ON c.CustomerId = o.CustomerId\nWHERE (@Number IS NULL OR o.OrderNumber = @Number) AND (@Status IS NULL OR o.Status = @Status);",
        "modern": {"service": "OrderPlatform.Api", "entry": "GET /orders?number=&status=", "flow": "SearchOrders query -> handler", "note": "Customer-name search is not ported yet.", "lang": "csharp", "code": "query = query.Where(o => number == null || o.Number == number);"},
        "notes": [],
    },
    {
        "project_slug": "billing-integration", "name": "usp_CreateInvoice", "purpose": "Creates an invoice for a shipped order and returns its number.",
        "criticality": "critical", "status": "not-started", "called_by": ["Nightly invoice batch", "IInvoiceService.CreateInvoice"],
        "tables": ["dbo.Invoices", "dbo.Orders"], "contract": "DC-05",
        "parameters": [{"name": "@OrderId", "type": "int", "direction": "in"}, {"name": "@InvoiceNumber", "type": "char(12)", "direction": "out"}],
        "returns": "InvoiceNumber",
        "legacy_lang": "sql", "legacy_code": "INSERT dbo.Invoices (OrderId, Amount, InvoiceDate) SELECT OrderId, Total, CAST(GETDATE() AS date) FROM dbo.Orders WHERE OrderId = @OrderId AND Status = 3;",
        "modern": {"service": "Billing (planned)", "entry": "OrderShipped event (DC-07)", "flow": "Planned: subscribe to OrderShipped and invoice on shipment.", "note": "Workaround: the worker calls the deprecated SOAP CreateInvoice operation.", "lang": "text", "code": "Not started."},
        "notes": ["Do not change without Dev Raman; finance reconciles against it daily."],
    },
    {
        "project_slug": "billing-integration", "name": "usp_GetUninvoicedOrders", "purpose": "Selects shipped orders with no invoice for the nightly batch.",
        "criticality": "high", "status": "not-started", "called_by": ["Nightly invoice batch"],
        "tables": ["dbo.Orders", "dbo.Invoices"], "contract": "DC-01",
        "parameters": [{"name": "@AsOf", "type": "date", "direction": "in"}], "returns": "Order rows",
        "legacy_lang": "sql", "legacy_code": "SELECT o.OrderId FROM dbo.Orders o LEFT JOIN dbo.Invoices i ON i.OrderId = o.OrderId WHERE o.Status = 3 AND i.InvoiceId IS NULL;",
        "modern": {"service": "Billing (planned)", "entry": "None", "flow": "Becomes unnecessary once invoicing is event-driven.", "note": "Will be removed, not rewritten.", "lang": "text", "code": "Not started."},
        "notes": ["Reads Status as an int: see DC-01 rules."],
    },
    {
        "project_slug": "billing-integration", "name": "usp_MarkInvoicePaid", "purpose": "Marks an invoice paid from the finance payment file.",
        "criticality": "medium", "status": "rewritten", "called_by": ["Payment import job"],
        "tables": ["dbo.Invoices"], "contract": "DC-03",
        "parameters": [{"name": "@InvoiceNumber", "type": "char(12)", "direction": "in"}, {"name": "@PaidOn", "type": "date", "direction": "in"}],
        "returns": "Rows affected",
        "legacy_lang": "sql", "legacy_code": "UPDATE dbo.Invoices SET PaidOn = @PaidOn WHERE InvoiceNumber = @InvoiceNumber;",
        "modern": {"service": "OrderPlatform.Worker", "entry": "PaymentReceived consumer", "flow": "Finance webhook -> PaymentReceived -> handler -> EF Core", "note": "Runs in the worker since 2026.", "lang": "csharp", "code": "invoice.MarkPaid(e.PaidOn);\nawait _db.SaveChangesAsync(ct);"},
        "notes": [],
    },
]


def summary(procs: list[dict]) -> dict:
    total = len(procs)
    weighted = sum(STATUS_WEIGHT[p["status"]] for p in procs)
    return {
        "total": total,
        "critical": sum(1 for p in procs if p["criticality"] == "critical"),
        "rewritten": sum(1 for p in procs if p["status"] == "rewritten"),
        "partial": sum(1 for p in procs if p["status"] == "partial"),
        "not_started": sum(1 for p in procs if p["status"] == "not-started"),
        "coverage_percent": round(weighted / total * 100) if total else 0,
    }


def for_project(project: dict) -> dict:
    head = {"slug": project["slug"], "name": project["name"], "system": project["system"]}
    if project.get("system") != "legacy":
        return {"project": head, "procedures": [], "note": "Stored procedures belong to the legacy side. Modern services use EF Core.", "summary": summary([])}
    procs = sorted((p for p in PROCEDURES if p["project_slug"] == project["slug"]), key=lambda p: (CRIT_ORDER[p["criticality"]], p["name"]))
    note = "Each procedure lists its modern replacement, or the current workaround when none exists." if procs else "No stored procedures are documented for this project yet."
    return {"project": head, "procedures": procs, "note": note, "summary": summary(procs)}
