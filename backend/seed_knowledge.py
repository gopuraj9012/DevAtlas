"""Seeded knowledge for DevAtlas (origin = "SEED").

Everything here is clearly labelled demo content describing a fictional estate:
two legacy .NET Framework 4.8 projects and three modern .NET 8 projects.
Articles are written in the markdown subset from md_blocks.py and converted to
blocks at seed time, so the editor can round-trip them.
"""

SYSTEMS = [
    {
        "key": "legacy",
        "label": "Legacy .NET Framework",
        "framework": ".NET Framework 4.8",
        "summary": "IIS-hosted Web Forms + MVC 5 front end, WCF services, ADO.NET over stored procedures. Still owns billing and the order tables.",
    },
    {
        "key": "modern",
        "label": "Modern .NET",
        "framework": ".NET 8",
        "summary": "Containerised Clean Architecture services: minimal APIs, CQRS with MediatR, EF Core 8, events over the message bus.",
    },
]

PROJECTS = [
    {
        "slug": "atlas-core",
        "name": "Atlas.Core",
        "system": "legacy",
        "framework": ".NET Framework 4.8",
        "description": "The original monolith: Web Forms back office, MVC 5 customer portal and the shared Orders/Customers schema.",
        "stack": ["ASP.NET Web Forms", "MVC 5", "ADO.NET", "SQL Server 2016", "IIS 10"],
        "repo": "git.internal/atlas/atlas-core",
        "owner": "Marta Kowalski",
    },
    {
        "slug": "billing-integration",
        "name": "Billing.Integration",
        "system": "legacy",
        "framework": ".NET Framework 4.8",
        "description": "WCF SOAP service and nightly batch that invoices orders and exchanges files with the finance system.",
        "stack": ["WCF", "Windows Service", "ADO.NET", "SQL Server 2016", "SFTP batch"],
        "repo": "git.internal/atlas/billing-integration",
        "owner": "Dev Raman",
    },
    {
        "slug": "orderplatform-api",
        "name": "OrderPlatform.Api",
        "system": "modern",
        "framework": ".NET 8",
        "description": "Public order API. Minimal API endpoints over MediatR handlers, EF Core 8, publishes OrderPlaced events.",
        "stack": ["ASP.NET Core 8", "Minimal APIs", "MediatR", "EF Core 8", "FluentValidation", "Azure Service Bus"],
        "repo": "git.internal/platform/orderplatform",
        "owner": "Greta Lindqvist",
    },
    {
        "slug": "orderplatform-worker",
        "name": "OrderPlatform.Worker",
        "system": "modern",
        "framework": ".NET 8",
        "description": "Background worker that consumes order events, reserves stock and keeps the legacy order tables in sync.",
        "stack": ["Worker Service", "MassTransit", "EF Core 8", "Polly", "Azure Service Bus"],
        "repo": "git.internal/platform/orderplatform",
        "owner": "Greta Lindqvist",
    },
    {
        "slug": "identity-gateway",
        "name": "Identity.Gateway",
        "system": "modern",
        "framework": ".NET 8",
        "description": "YARP reverse proxy and token service in front of every modern API; bridges legacy forms-auth cookies.",
        "stack": ["YARP", "ASP.NET Core 8", "OpenIddict", "Redis"],
        "repo": "git.internal/platform/identity-gateway",
        "owner": "Sam Okafor",
    },
]

TEAM = [
    {"name": "Greta Lindqvist", "title": "Principal engineer, Order Platform", "role": "maintainer", "systems": ["modern"], "owns": ["OrderPlatform.Api", "OrderPlatform.Worker"], "ask_about": "CQRS handlers, event contracts, EF Core migrations", "email": "greta.l@devatlas.internal"},
    {"name": "Marta Kowalski", "title": "Lead engineer, Atlas.Core", "role": "maintainer", "systems": ["legacy"], "owns": ["Atlas.Core"], "ask_about": "Web Forms lifecycle, shared Orders schema, stored procedures", "email": "marta.k@devatlas.internal"},
    {"name": "Dev Raman", "title": "Senior engineer, Billing", "role": "maintainer", "systems": ["legacy"], "owns": ["Billing.Integration"], "ask_about": "WCF contracts, nightly invoice batch, finance file formats", "email": "dev.r@devatlas.internal"},
    {"name": "Sam Okafor", "title": "Platform engineer, Identity", "role": "owner", "systems": ["modern", "legacy"], "owns": ["Identity.Gateway"], "ask_about": "Tokens, the forms-auth bridge, gateway routes", "email": "sam.o@devatlas.internal"},
    {"name": "Lena Fischer", "title": "Database administrator", "role": "maintainer", "systems": ["legacy", "modern"], "owns": ["Shared SQL schema"], "ask_about": "Any change to a shared table, view or procedure. Ask before you ship.", "email": "lena.f@devatlas.internal"},
    {"name": "Tom Becker", "title": "Engineering manager", "role": "owner", "systems": ["legacy", "modern"], "owns": ["Onboarding path"], "ask_about": "Priorities, access requests, who owns what", "email": "tom.b@devatlas.internal"},
]

# section -> doc_id prefix
SECTIONS = {
    "onboarding": "01",
    "architecture": "02",
    "standards": "03",
    "data": "04",
    "integration": "05",
    "deployment": "06",
    "operations": "07",
}

ARTICLES = [
    {
        "slug": "welcome-to-devatlas",
        "doc_id": "KB-0101",
        "title": "Welcome: how our two systems fit together",
        "section": "onboarding",
        "system": "both",
        "summary": "The one-page map of the estate: what is legacy, what is modern, and where they touch.",
        "tags": ["start-here", "overview"],
        "source_md": """We run two generations of .NET side by side. Atlas.Core and Billing.Integration are .NET Framework 4.8 on IIS. The Order Platform and Identity.Gateway are .NET 8 in containers. Both read and write the same SQL Server order tables, which is why most incidents start at the seam between them.

## The shape of the estate

:::figure Requests and data across both systems
Browser | Identity.Gateway | OrderPlatform.Api | Service Bus | OrderPlatform.Worker | Shared SQL (Orders) | Atlas.Core | Billing.Integration
:::

- New features land in the modern system unless they only touch back-office screens.
- The legacy system still owns invoicing and the Orders/Customers schema.
- Anything that changes a shared table goes through the data contract registry first.

> [warn] The seam is where things break
> A column rename that compiles in .NET 8 can silently break a stored procedure that Atlas.Core calls. Check the contract before touching a shared table.

## Your first week

1. Read this page and the architecture docs for the project you are joining.
2. Work through your project checklist on its project page.
3. Get a local build of both systems running.
4. Pair on one small change on each side of the seam.""",
    },
    {
        "slug": "local-setup-both-systems",
        "doc_id": "KB-0102",
        "title": "Local setup for legacy and modern",
        "section": "onboarding",
        "system": "both",
        "summary": "Tools, access and the exact commands to build each system on a Windows laptop.",
        "tags": ["start-here", "setup"],
        "source_md": """You need Windows for the legacy system. The modern system builds anywhere, but most of the team runs both on the same Windows laptop.

## Tools

| Tool | Legacy | Modern |
|---|---|---|
| IDE | Visual Studio 2022 with ASP.NET workload | Visual Studio 2022 or Rider |
| SDK | .NET Framework 4.8 developer pack | .NET 8 SDK |
| Runtime | IIS Express | Docker Desktop |
| Database | SQL Server Developer 2016+ | Same instance, via user-secrets |

## Legacy build

```powershell build-legacy.ps1
nuget restore Atlas.Core.sln
msbuild Atlas.Core.sln /p:Configuration=Debug
& "C:\\Program Files\\IIS Express\\iisexpress.exe" /site:Atlas.Web
```

## Modern build

```bash build-modern.sh
dotnet restore
dotnet user-secrets set "ConnectionStrings:Orders" "Server=.;Database=Orders;Trusted_Connection=True;TrustServerCertificate=True"
dotnet run --project src/OrderPlatform.Api
```

> [info] Access requests
> Ask Tom Becker for SQL Server read access and the Service Bus dev namespace on your first day; both take a day to approve.""",
    },
    {
        "slug": "atlas-core-layered-architecture",
        "doc_id": "KB-0201",
        "title": "Atlas.Core: layered architecture",
        "section": "architecture",
        "system": "legacy",
        "project": "Atlas.Core",
        "summary": "Pages, business services, data access helpers and the stored procedures underneath them.",
        "tags": ["architecture", "web-forms", "ado.net"],
        "source_md": """Atlas.Core is a classic three-layer monolith. Web Forms pages and MVC 5 controllers call static business services, which call a thin ADO.NET helper that executes stored procedures.

:::figure Atlas.Core layers
Web Forms / MVC 5 | Business services (static) | SqlHelper (ADO.NET) | Stored procedures | Orders DB
:::

## What lives where

- `Atlas.Web` holds pages, controllers and the `Global.asax` startup.
- `Atlas.Business` holds `OrderService`, `CustomerService` and friends. Most are static classes.
- `Atlas.Data` holds `SqlHelper` and DataTable-returning repositories.

> [danger] HttpContext.Current in business code
> Several services read `HttpContext.Current.Session` directly. They cannot run outside a request, so they break in batch jobs and tests. Pass values in as parameters instead.

:::compare Reading an order
The legacy path returns a DataTable; the modern path returns a typed DTO through a handler.
```csharp OrderService.cs
public static DataTable GetOrder(int id)
{
    return SqlHelper.ExecuteDataTable("usp_GetOrder",
        new SqlParameter("@OrderId", id));
}
```
```csharp GetOrderHandler.cs
public async Task<OrderDto?> Handle(GetOrder q, CancellationToken ct) =>
    await _db.Orders.AsNoTracking()
        .Where(o => o.Id == q.Id)
        .Select(o => new OrderDto(o.Id, o.Number, o.Total))
        .FirstOrDefaultAsync(ct);
```
:::""",
    },
    {
        "slug": "orderplatform-clean-architecture",
        "doc_id": "KB-0202",
        "title": "OrderPlatform: Clean Architecture and CQRS",
        "section": "architecture",
        "system": "modern",
        "project": "OrderPlatform.Api",
        "summary": "Domain, Application, Infrastructure and Api projects, and how a request flows through MediatR.",
        "tags": ["architecture", "cqrs", "mediatr", "clean-architecture"],
        "source_md": """The Order Platform follows Clean Architecture. Dependencies point inward: Api depends on Application, Application depends on Domain, and Infrastructure implements Application's interfaces.

:::figure Request flow
Minimal API endpoint | MediatR | Validation behaviour | Handler | EF Core DbContext | Outbox | Service Bus
:::

## Projects

| Project | Responsibility | May reference |
|---|---|---|
| Domain | Entities, value objects, domain events | nothing |
| Application | Commands, queries, handlers, interfaces | Domain |
| Infrastructure | EF Core, Service Bus, external clients | Application |
| Api | Endpoints, auth, composition root | Application, Infrastructure |

## Rules of thumb

- One command or query per use case; handlers stay under 60 lines.
- Validation is a pipeline behaviour, never inside the handler.
- Events are written to the outbox in the same transaction as the change.""",
    },
    {
        "slug": "identity-gateway-auth-bridge",
        "doc_id": "KB-0203",
        "title": "Identity.Gateway and the forms-auth bridge",
        "section": "architecture",
        "system": "modern",
        "project": "Identity.Gateway",
        "summary": "How one sign-in works across a forms-auth cookie and JWT-protected modern APIs.",
        "tags": ["architecture", "auth", "yarp"],
        "source_md": """Users still sign in through Atlas.Core, which issues a forms-authentication cookie. Identity.Gateway sits in front of every modern API, validates that cookie against the shared machine key and exchanges it for a short-lived JWT.

:::figure Sign-in path
Browser | Atlas.Core login | Forms-auth cookie | Identity.Gateway | JWT | OrderPlatform.Api
:::

> [warn] Machine key rotation
> The legacy machineKey and the gateway's validation key must change together. Rotating one alone signs every user out.

- Routes are declared in `yarp.json`; each route names a cluster and an auth policy.
- Tokens live 15 minutes and are refreshed transparently by the gateway.""",
    },
    {
        "slug": "billing-integration-wcf",
        "doc_id": "KB-0204",
        "title": "Billing.Integration: WCF service and nightly batch",
        "section": "architecture",
        "system": "legacy",
        "project": "Billing.Integration",
        "summary": "The SOAP contract finance calls, and the batch that writes invoice files every night.",
        "tags": ["architecture", "wcf", "batch"],
        "source_md": """Billing.Integration has two halves. A WCF service exposes `IInvoiceService` over basicHttpBinding for the finance system, and a Windows Service runs the nightly invoice batch at 01:30.

## The nightly batch

1. Select orders with status `Shipped` and no invoice.
2. Call `usp_CreateInvoice` for each order inside one transaction per order.
3. Write the fixed-width `INV_yyyymmdd.dat` file and upload it over SFTP.

> [danger] The batch reads OrderStatus as an int
> Adding a new status value in the modern system without updating `OrderStatusMap` makes the batch skip orders silently. See data contract DC-01.""",
    },
    {
        "slug": "coding-standards-overview",
        "doc_id": "KB-0301",
        "title": "Coding standards: the short version",
        "section": "standards",
        "system": "both",
        "summary": "The eighteen standards in one page, and which ones the build enforces.",
        "tags": ["standards", "start-here"],
        "source_md": """The full rulebook lives on the Standards page. This is the version to keep in your head.

- Async all the way down. Never call `.Result` or `.Wait()` on a task.
- No SQL built by string concatenation. Parameters, always.
- No `HttpContext.Current` outside the web layer.
- Validate at the edge with a validator, not deep in a handler.
- Log with structured properties, never string interpolation.
- Dispose what you create: `using` for connections, readers and streams.

> [info] Enforced by the build
> CS-001, CS-003 and CS-007 are analyser errors in the modern solution. In the legacy solution they are review checks only.

:::compare Blocking on async
```csharp CustomerController.cs
public ActionResult Details(int id)
{
    var customer = _client.GetCustomerAsync(id).Result; // deadlocks under load
    return View(customer);
}
```
```csharp CustomerEndpoints.cs
app.MapGet("/customers/{id:int}", async (int id, ISender sender, CancellationToken ct) =>
    await sender.Send(new GetCustomer(id), ct) is { } c ? Results.Ok(c) : Results.NotFound());
```
:::""",
    },
    {
        "slug": "validation-pipeline-rules",
        "doc_id": "KB-0302",
        "title": "Validation pipeline rules",
        "section": "standards",
        "system": "both",
        "summary": "Where validation happens in each system, and the three tiers every rule belongs to.",
        "tags": ["validation", "standards"],
        "source_md": """Every validation rule belongs to one of three tiers. Shape rules check a single field. Policy rules check business decisions that may change. Invariants must never be false, whatever the input.

| Tier | Example | Legacy home | Modern home |
|---|---|---|---|
| shape | Email is a valid address | Page validators + `Validate()` in the service | FluentValidation in the pipeline |
| policy | Orders over 10,000 need approval | Business service | Handler, behind a policy interface |
| invariant | Order total equals sum of lines | Stored procedure | Domain entity |

> [warn] Duplicate rules drift
> Several rules exist in both systems. When you change one, search the validation repository for its twin.""",
    },
    {
        "slug": "shared-orders-schema",
        "doc_id": "KB-0401",
        "title": "The shared Orders schema",
        "section": "data",
        "system": "both",
        "summary": "Tables both systems write, who owns each column, and how to change them safely.",
        "tags": ["data", "sql", "contracts"],
        "source_md": """`dbo.Orders`, `dbo.OrderLines` and `dbo.Customers` are written by both Atlas.Core and OrderPlatform.Worker. Atlas.Core owns the schema; the worker owns nothing and must tolerate every column the legacy side adds.

## Change rules

1. Add columns as nullable or with a default. Never rename.
2. Register the change in the data contract registry before the migration runs.
3. Update the stored procedures and the EF Core mapping in the same release window.

```sql add-column.sql
ALTER TABLE dbo.Orders ADD DeliveryWindow nvarchar(32) NULL;
```

> [danger] No EF Core migrations on shared tables
> The modern side maps shared tables with `ExcludeFromMigrations()`. Schema changes ship as reviewed SQL scripts.""",
    },
    {
        "slug": "stored-procedures-guide",
        "doc_id": "KB-0402",
        "title": "Working with stored procedures",
        "section": "data",
        "system": "legacy",
        "project": "Atlas.Core",
        "summary": "Naming, parameters, error handling and how to find who calls a procedure.",
        "tags": ["data", "sql", "stored-procedures"],
        "source_md": """Every legacy data call goes through a stored procedure named `usp_<Verb><Noun>`. Procedures return result sets, never output strings, and raise errors with `THROW` rather than return codes.

- Find callers with a solution-wide search for the procedure name; SqlHelper calls use string literals.
- The Stored procs tab on each legacy project page lists every procedure with its modern replacement.

```sql usp_GetOrder.sql
CREATE OR ALTER PROCEDURE dbo.usp_GetOrder @OrderId int
AS
BEGIN
    SET NOCOUNT ON;
    SELECT o.OrderId, o.OrderNumber, o.Status, o.Total
    FROM dbo.Orders o WHERE o.OrderId = @OrderId;
END
```""",
    },
    {
        "slug": "order-events",
        "doc_id": "KB-0501",
        "title": "Order events on the Service Bus",
        "section": "integration",
        "system": "modern",
        "project": "OrderPlatform.Worker",
        "summary": "Which events exist, who publishes and who consumes them, and the outbox that guarantees delivery.",
        "tags": ["integration", "events", "service-bus"],
        "source_md": """The Order Platform publishes integration events through a transactional outbox. Consumers must be idempotent: every message can arrive more than once.

| Event | Publisher | Consumers |
|---|---|---|
| OrderPlaced | OrderPlatform.Api | OrderPlatform.Worker, Billing.Integration (via bridge) |
| OrderShipped | OrderPlatform.Worker | Billing.Integration (via bridge) |
| StockReserved | OrderPlatform.Worker | OrderPlatform.Api |

> [info] Idempotency key
> Use the message id as the idempotency key and record it in `ProcessedMessages` in the same transaction as the change.""",
    },
    {
        "slug": "legacy-modern-bridge",
        "doc_id": "KB-0502",
        "title": "The legacy to modern sync bridge",
        "section": "integration",
        "system": "both",
        "summary": "How the worker keeps the legacy order tables in step, and what happens when it falls behind.",
        "tags": ["integration", "sync"],
        "source_md": """OrderPlatform.Worker writes every modern order into the shared legacy tables so Atlas.Core screens and the billing batch can see it. It calls the same stored procedures the legacy code uses, so business rules in those procedures still apply.

- Lag is shown on the operations dashboard as `bridge_lag_seconds`.
- If lag exceeds five minutes before 01:30, delay the billing batch rather than invoicing a partial day.""",
    },
    {
        "slug": "deploying-legacy-iis",
        "doc_id": "KB-0601",
        "title": "Deploying the legacy system to IIS",
        "section": "deployment",
        "system": "legacy",
        "summary": "Web Deploy packages, app pool recycling and the rollback you can do in under five minutes.",
        "tags": ["deployment", "iis"],
        "source_md": """Legacy releases go out on Tuesday evenings. The release manager builds a Web Deploy package, takes each server out of the load balancer in turn and deploys it.

1. Build the package from the release branch.
2. Drain server 1, deploy, warm up, return it to the pool.
3. Repeat for server 2.

> [warn] web.config transforms
> Production settings come from `Web.Release.config`. A missing transform deploys debug settings to production.""",
    },
    {
        "slug": "deploying-modern-containers",
        "doc_id": "KB-0602",
        "title": "Deploying the modern platform",
        "section": "deployment",
        "system": "modern",
        "summary": "Pipeline stages, image tags and how a rolling deployment is verified and rolled back.",
        "tags": ["deployment", "containers"],
        "source_md": """Every merge to `main` builds an image tagged with the commit sha. Promotion to production is a pull request that changes the tag in the environment repo.

```bash promote.sh
kubectl set image deployment/orderplatform-api api=registry.internal/orderplatform-api:$SHA
kubectl rollout status deployment/orderplatform-api --timeout=5m
```

- Readiness probes gate traffic; a failed probe stops the rollout.
- Roll back with `kubectl rollout undo` or by reverting the environment PR.""",
    },
    {
        "slug": "incident-runbook",
        "doc_id": "KB-0701",
        "title": "Incident runbook: the first fifteen minutes",
        "section": "operations",
        "system": "both",
        "summary": "Where to look first when orders stop flowing, and who to call.",
        "tags": ["operations", "incidents"],
        "source_md": """Most incidents show up as orders that are visible in one system and missing in the other.

1. Check `bridge_lag_seconds`. If it is climbing, the worker is stuck.
2. Check the dead-letter queue on `orders-events`.
3. Check the IIS app pool on both legacy servers.
4. Page the owner listed on the Team page for the failing project.

> [info] Write it down
> After the incident, add what you learned to this runbook or flag it on the Feedback page.""",
    },
]

GLOSSARY = [
    ("App pool", "legacy", "An IIS worker process boundary. Each legacy site runs in its own pool; recycling it restarts the app.", None, None, ["IIS", "Recycle"]),
    ("ViewState", "legacy", "Hidden form field Web Forms uses to persist control state between postbacks.", None, None, ["Postback"]),
    ("Postback", "legacy", "A Web Forms form submit back to the same page, which replays the page lifecycle.", None, None, ["ViewState"]),
    ("Global.asax", "legacy", "The legacy application entry point: startup, error handling and session events.", None, None, ["Program.cs"]),
    ("SqlHelper", "legacy", "Atlas.Core's static ADO.NET wrapper that executes stored procedures and returns DataTables.", None, None, ["Stored procedure"]),
    ("DataTable", "legacy", "Untyped in-memory table returned by legacy data calls. Columns are read by string name.", None, None, ["DTO"]),
    ("WCF", "legacy", "Windows Communication Foundation. Billing.Integration exposes SOAP services with it.", None, None, ["SOAP"]),
    ("SOAP", "legacy", "XML messaging protocol used by the finance system to call IInvoiceService.", None, None, ["WCF"]),
    ("Forms authentication", "legacy", "Cookie-based sign-in used by Atlas.Core; the gateway exchanges the cookie for a JWT.", None, None, ["JWT", "Machine key"]),
    ("Machine key", "legacy", "Key in web.config that signs forms-auth cookies. Shared with Identity.Gateway.", None, None, ["Forms authentication"]),
    ("Web.config transform", "legacy", "Per-environment XML patch applied to web.config at publish time.", None, None, ["appsettings.json"]),
    ("Web Deploy", "legacy", "MSDeploy packages used to release the legacy sites to IIS.", None, None, ["App pool"]),
    ("Minimal API", "modern", "Endpoint style in ASP.NET Core 8 that maps routes to lambdas without controllers.", None, None, ["Endpoint"]),
    ("MediatR", "modern", "In-process mediator that dispatches commands and queries to their handlers.", None, None, ["CQRS", "Pipeline behaviour"]),
    ("CQRS", "modern", "Command Query Responsibility Segregation: writes and reads are separate request types and handlers.", None, None, ["MediatR"]),
    ("Pipeline behaviour", "modern", "MediatR middleware that wraps every handler; used for validation, logging and transactions.", None, None, ["MediatR", "FluentValidation"]),
    ("FluentValidation", "modern", "Library used for shape validation of commands in the modern system.", None, None, ["Pipeline behaviour"]),
    ("EF Core", "modern", "Entity Framework Core 8, the ORM used by the modern services.", None, None, ["DbContext"]),
    ("DbContext", "modern", "EF Core unit of work and change tracker; one per request.", None, None, ["EF Core"]),
    ("Outbox", "modern", "Table that stores integration events in the same transaction as the change, then relays them to the bus.", None, None, ["Service Bus", "Idempotency"]),
    ("Service Bus", "modern", "Azure Service Bus, the message broker for order events.", None, None, ["Outbox"]),
    ("Idempotency", "modern", "Handling a message twice has the same effect as handling it once.", None, None, ["Outbox"]),
    ("YARP", "modern", "Yet Another Reverse Proxy; Identity.Gateway's routing engine.", None, None, ["Identity.Gateway"]),
    ("Readiness probe", "modern", "Container health check that must pass before a pod receives traffic.", None, None, ["Rolling deployment"]),
    ("Rolling deployment", "modern", "Replacing pods a few at a time so the service never goes fully down.", None, None, ["Readiness probe"]),
    ("User secrets", "modern", "Local development store for connection strings, outside the repository.", None, None, ["appsettings.json"]),
    ("appsettings.json", "modern", "Modern configuration file, layered per environment.", None, None, ["Web.config transform"]),
    ("Program.cs", "modern", "Modern application entry point and composition root.", None, None, ["Global.asax"]),
    ("Stored procedure", "both", "Precompiled SQL routine. The legacy data layer is built on them; the worker reuses several.", "The only way legacy code touches data.", "Called only by the sync bridge; new reads use EF Core.", ["SqlHelper"]),
    ("Data contract", "both", "A documented shared shape (table, view, endpoint, SOAP operation, event or file) with an owner and consumers.", None, None, ["Breaking change"]),
    ("Breaking change", "both", "A change that makes an existing consumer fail: removed field, renamed column, narrowed type.", None, None, ["Data contract"]),
    ("Sync bridge", "both", "The worker path that writes modern orders into the legacy tables.", None, None, ["Outbox", "Stored procedure"]),
    ("DTO", "both", "Data transfer object: a plain typed shape that crosses a boundary.", "Rare; legacy code passes DataTables.", "Records returned by every query handler.", ["DataTable"]),
    ("Validation tier", "both", "Shape, policy or invariant. Decides where a rule lives in each system.", None, None, ["FluentValidation"]),
    ("Order status", "both", "Integer status on dbo.Orders (0 Draft, 1 Placed, 2 Paid, 3 Shipped, 4 Cancelled). Shared by both systems.", "Read as an int by the billing batch.", "Mapped to the OrderStatus enum.", ["Data contract"]),
]

CODING_STANDARDS = [
    ("CS-001", "async", "Async all the way down", "Blocking on tasks deadlocks ASP.NET request threads and starves the pool.", "await the call and make the caller async", "task.Result / task.Wait()"),
    ("CS-002", "data", "Parameterise every SQL statement", "String-built SQL is an injection risk and defeats plan caching.", "SqlParameter or EF Core LINQ", "\"... WHERE Id = \" + id"),
    ("CS-003", "architecture", "No HttpContext.Current outside the web layer", "Business code that reads the request cannot run in jobs or tests.", "Pass values in as parameters", "HttpContext.Current.Session[\"UserId\"]"),
    ("CS-004", "resources", "Dispose connections, readers and streams", "Leaked connections exhaust the pool under load.", "using declarations", "new SqlConnection(...) without using"),
    ("CS-005", "logging", "Structured logging only", "Interpolated messages cannot be queried by property.", "_log.LogInformation(\"Order {OrderId} placed\", id)", "_log.Info($\"Order {id} placed\")"),
    ("CS-006", "errors", "Never swallow exceptions", "Empty catch blocks hide data loss.", "Log and rethrow, or handle a specific exception", "catch { }"),
    ("CS-007", "async", "Pass CancellationToken through", "Requests that are abandoned keep running and holding locks.", "Accept and forward CancellationToken", "Async method without a token"),
    ("CS-008", "validation", "Validate at the edge", "Validation buried in handlers is duplicated and inconsistent.", "Validator in the pipeline", "if checks scattered through handlers"),
    ("CS-009", "di", "Constructor injection, no service locator", "Hidden dependencies make code untestable.", "Inject interfaces through the constructor", "DependencyResolver.Current.GetService"),
    ("CS-010", "data", "Read-only queries use AsNoTracking", "Tracking unused entities wastes memory and CPU.", ".AsNoTracking() on queries", "Tracked queries for reads"),
    ("CS-011", "config", "No secrets in source", "Secrets in config files leak through the repository.", "User secrets locally, Key Vault in production", "Passwords in web.config"),
    ("CS-012", "api", "Return typed results", "Untyped payloads break consumers silently.", "Results.Ok(dto) with a record type", "Returning DataTable or object"),
    ("CS-013", "state", "No static mutable state", "Static fields are shared across requests and threads.", "Scoped services", "static Dictionary caches"),
    ("CS-014", "data", "One DbContext per request", "Shared contexts corrupt change tracking across threads.", "Scoped DbContext from DI", "Singleton DbContext"),
    ("CS-015", "http", "Use IHttpClientFactory", "new HttpClient per call exhausts sockets.", "Typed clients from IHttpClientFactory", "using var c = new HttpClient()"),
    ("CS-016", "errors", "Problem details for API errors", "Ad hoc error shapes are hard for clients to handle.", "Results.Problem / ProblemDetails", "Returning 200 with an error flag"),
    ("CS-017", "naming", "Name async methods with Async", "Callers need to see they must await.", "GetOrderAsync", "GetOrder returning Task"),
    ("CS-018", "security", "Authorise every endpoint", "A forgotten attribute exposes data.", "RequireAuthorization on the route group", "Endpoints with no auth policy"),
]

VALIDATION_LIBRARY = [
    {"rule_id": "VR-001", "name": "Customer email format", "field": "Customer.Email", "tier": "shape", "system": "both", "constraint": "Valid RFC 5322 address, max 254 chars", "pattern": r"^[^@\s]+@[^@\s]+\.[^@\s]+$", "message": "Enter a valid email address.", "severity": "error", "enforced": True, "projects": ["Atlas.Core", "OrderPlatform.Api"], "tags": ["customer", "email"],
     "legacy_impl": {"filename": "CustomerEdit.aspx", "lang": "xml", "code": "<asp:RegularExpressionValidator ControlToValidate=\"txtEmail\"\n    ValidationExpression=\"^[^@\\s]+@[^@\\s]+\\.[^@\\s]+$\"\n    ErrorMessage=\"Enter a valid email address.\" runat=\"server\" />"},
     "modern_impl": {"filename": "CreateCustomerValidator.cs", "lang": "csharp", "code": "RuleFor(x => x.Email)\n    .NotEmpty()\n    .MaximumLength(254)\n    .EmailAddress()\n    .WithMessage(\"Enter a valid email address.\");"}},
    {"rule_id": "VR-002", "name": "Order quantity positive", "field": "OrderLine.Quantity", "tier": "shape", "system": "both", "constraint": "Integer between 1 and 999", "message": "Quantity must be between 1 and 999.", "severity": "error", "enforced": True, "projects": ["Atlas.Core", "OrderPlatform.Api"], "tags": ["order", "quantity"],
     "legacy_impl": {"filename": "OrderService.cs", "lang": "csharp", "code": "if (line.Quantity < 1 || line.Quantity > 999)\n    throw new ArgumentOutOfRangeException(\"Quantity\");"},
     "modern_impl": {"filename": "PlaceOrderValidator.cs", "lang": "csharp", "code": "RuleForEach(x => x.Lines)\n    .ChildRules(l => l.RuleFor(x => x.Quantity).InclusiveBetween(1, 999));"}},
    {"rule_id": "VR-003", "name": "Postcode format", "field": "Address.Postcode", "tier": "shape", "system": "modern", "constraint": "Country-specific pattern, max 10 chars", "message": "Enter a valid postcode.", "severity": "error", "enforced": True, "projects": ["OrderPlatform.Api"], "tags": ["address"]},
    {"rule_id": "VR-004", "name": "Order number format", "field": "Order.OrderNumber", "tier": "shape", "system": "both", "constraint": "ORD- followed by 8 digits", "pattern": r"^ORD-\d{8}$", "message": "Order numbers look like ORD-12345678.", "severity": "error", "enforced": True, "projects": ["Atlas.Core", "OrderPlatform.Api", "Billing.Integration"], "tags": ["order"]},
    {"rule_id": "VR-005", "name": "Currency code", "field": "Order.Currency", "tier": "shape", "system": "both", "constraint": "ISO 4217 three-letter code from the supported list", "message": "Unsupported currency.", "severity": "error", "enforced": True, "projects": ["OrderPlatform.Api", "Billing.Integration"], "tags": ["money"]},
    {"rule_id": "VR-006", "name": "Customer name length", "field": "Customer.Name", "tier": "shape", "system": "both", "constraint": "1 to 160 characters", "message": "Name must be 160 characters or fewer.", "severity": "error", "enforced": True, "projects": ["Atlas.Core", "OrderPlatform.Api"], "tags": ["customer"], "notes": "Column is nvarchar(160); the legacy page allowed 200 until 2023."},
    {"rule_id": "VR-007", "name": "Phone number format", "field": "Customer.Phone", "tier": "shape", "system": "legacy", "constraint": "E.164 format when present", "message": "Use international format, e.g. +4420...", "severity": "warn", "enforced": False, "projects": ["Atlas.Core"], "tags": ["customer"]},
    {"rule_id": "VR-008", "name": "Delivery date in future", "field": "Order.RequestedDelivery", "tier": "shape", "system": "modern", "constraint": "Today or later, at most 90 days ahead", "message": "Choose a delivery date within the next 90 days.", "severity": "error", "enforced": True, "projects": ["OrderPlatform.Api"], "tags": ["order", "dates"]},
    {"rule_id": "VR-009", "name": "Invoice file line length", "field": "InvoiceFile.Line", "tier": "shape", "system": "legacy", "constraint": "Exactly 256 characters, space padded", "message": "Invoice line is not 256 characters.", "severity": "error", "enforced": True, "projects": ["Billing.Integration"], "tags": ["billing", "file"]},
    {"rule_id": "VR-010", "name": "Large orders need approval", "field": "Order.Total", "tier": "policy", "system": "both", "constraint": "Total above 10,000 in base currency requires an approver", "message": "Orders over 10,000 need manager approval.", "severity": "error", "enforced": True, "projects": ["Atlas.Core", "OrderPlatform.Api"], "tags": ["order", "approval"],
     "legacy_impl": {"filename": "OrderService.cs", "lang": "csharp", "code": "if (order.Total > 10000m && order.ApprovedBy == null)\n    return OrderResult.NeedsApproval;"},
     "modern_impl": {"filename": "ApprovalPolicy.cs", "lang": "csharp", "code": "public bool RequiresApproval(Order o) =>\n    o.Total.ToBase(_rates) > _options.Value.ApprovalThreshold;"}},
    {"rule_id": "VR-011", "name": "Credit limit check", "field": "Customer.CreditLimit", "tier": "policy", "system": "legacy", "constraint": "Open balance plus new order must not exceed the credit limit", "message": "This order exceeds the customer's credit limit.", "severity": "error", "enforced": True, "projects": ["Atlas.Core", "Billing.Integration"], "tags": ["customer", "credit"]},
    {"rule_id": "VR-012", "name": "Cancellation window", "field": "Order.Status", "tier": "policy", "system": "modern", "constraint": "Orders can be cancelled until they are Shipped", "message": "Shipped orders cannot be cancelled; raise a return instead.", "severity": "error", "enforced": True, "projects": ["OrderPlatform.Api"], "tags": ["order", "status"]},
    {"rule_id": "VR-013", "name": "Discount ceiling", "field": "OrderLine.Discount", "tier": "policy", "system": "both", "constraint": "Line discount at most 30% without a manager code", "message": "Discounts above 30% need a manager code.", "severity": "warn", "enforced": False, "projects": ["Atlas.Core", "OrderPlatform.Api"], "tags": ["pricing"], "notes": "Legacy and modern disagree on rounding; see feedback board."},
    {"rule_id": "VR-014", "name": "Order total equals line sum", "field": "Order.Total", "tier": "invariant", "system": "both", "constraint": "Total = sum(line qty x price x (1 - discount)) + shipping, rounded to 2 dp", "message": "Order total does not match its lines.", "severity": "error", "enforced": True, "projects": ["Atlas.Core", "OrderPlatform.Api", "OrderPlatform.Worker"], "tags": ["order", "money"],
     "legacy_impl": {"filename": "usp_SaveOrder.sql", "lang": "sql", "code": "IF @Total <> (SELECT SUM(Qty * Price * (1 - Discount)) FROM @Lines) + @Shipping\n    THROW 50010, 'Order total does not match its lines.', 1;"},
     "modern_impl": {"filename": "Order.cs", "lang": "csharp", "code": "public decimal Total => Math.Round(_lines.Sum(l => l.Net) + Shipping, 2);"}},
]

PATH = [
    (1, "Read the estate overview", "Start with how the two systems fit together.", "welcome-to-devatlas", "both"),
    (2, "Request your access", "SQL Server read access and the Service Bus dev namespace.", "local-setup-both-systems", "both"),
    (3, "Build the legacy system", "Restore, build and run Atlas.Core in IIS Express.", "local-setup-both-systems", "legacy"),
    (4, "Build the modern system", "Run OrderPlatform.Api locally against your SQL instance.", "local-setup-both-systems", "modern"),
    (5, "Learn the Atlas.Core layers", "Pages, static services, SqlHelper and procedures.", "atlas-core-layered-architecture", "legacy"),
    (6, "Learn the Order Platform layers", "Clean Architecture, MediatR and the outbox.", "orderplatform-clean-architecture", "modern"),
    (7, "Understand sign-in", "The forms-auth cookie and the gateway JWT.", "identity-gateway-auth-bridge", "both"),
    (8, "Read the coding standards", "The eighteen rules and which ones the build enforces.", "coding-standards-overview", "both"),
    (9, "Learn the validation tiers", "Shape, policy and invariant, and where each lives.", "validation-pipeline-rules", "both"),
    (10, "Study the shared schema", "Who owns which table, and how to change it safely.", "shared-orders-schema", "both"),
    (11, "Trace an order event", "OrderPlaced from API to worker to billing.", "order-events", "modern"),
    (12, "Understand the sync bridge", "How modern orders reach the legacy tables.", "legacy-modern-bridge", "both"),
    (13, "Shadow a legacy release", "Watch a Tuesday IIS deployment.", "deploying-legacy-iis", "legacy"),
    (14, "Ship a modern change", "Promote an image through the pipeline.", "deploying-modern-containers", "modern"),
    (15, "Read the incident runbook", "Know the first fifteen minutes before you need them.", "incident-runbook", "both"),
]
