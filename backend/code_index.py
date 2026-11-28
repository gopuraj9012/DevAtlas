"""Deep code map for an imported .NET codebase.

Parses every C# file with tree-sitter and every view / script with targeted
patterns, then links them:

  types      namespaces, classes, interfaces, records, structs, enums, their
             bases, attributes, constructor-injected dependencies, layer
  members    methods, constructors, properties, fields with signatures,
             attributes, HTTP verbs and routes
  calls      outgoing calls per method, resolved through locals, parameters,
             fields, properties, constructor-injected interfaces and
             implementations; the inverse gives "called by"
  results    what a controller action returns: View/PartialView (resolved to the
             .cshtml), RedirectToAction (resolved to the target action), Json...
  views      MVC/.NET Core views, partials, layouts, _ViewStart, Razor Pages,
             Web Forms .aspx/.ascx/.master/.asmx, and JavaScript files: their
             model, layout, partials, links, forms, tag helpers, AJAX/fetch
             calls and Web Forms control events, each resolved to the action
             or code-behind method it reaches
             -> becomes "front-end callers" on the method.

Only names, signatures, line numbers and relationships are produced. Method
bodies and file contents are never part of the output.

Resolution is static and heuristic (no compiler): every resolved edge carries a
confidence of exact | interface | likely | ambiguous so readers can tell.
"""
from __future__ import annotations

import posixpath
import re
from collections import defaultdict
from functools import lru_cache

import tree_sitter_c_sharp as tscs
from tree_sitter import Language, Parser

VIEW_EXT = (".cshtml", ".vbhtml", ".razor", ".aspx", ".ascx", ".master", ".asmx", ".ashx")
JS_EXT = (".js",)
MAX_CALLS_PER_METHOD = 200
MAX_LINKS_PER_VIEW = 300

# Names too common to resolve by name alone (LINQ, collections, BCL, framework)
COMMON_NAMES = {
    "Where", "Select", "SelectMany", "First", "FirstOrDefault", "Single", "SingleOrDefault", "Any", "All", "Count",
    "ToList", "ToArray", "ToDictionary", "OrderBy", "OrderByDescending", "ThenBy", "GroupBy", "Sum", "Max", "Min",
    "Average", "Distinct", "Skip", "Take", "Contains", "Add", "AddRange", "Remove", "Clear", "Get", "Set", "Find",
    "ToString", "Equals", "GetHashCode", "GetType", "Dispose", "Close", "Open", "Read", "Write", "WriteLine",
    "Format", "Join", "Split", "Trim", "Replace", "Substring", "StartsWith", "EndsWith", "IndexOf", "Parse",
    "TryParse", "Invoke", "Execute", "Include", "AsNoTracking", "SaveChanges", "SaveChangesAsync", "ToListAsync",
    "FirstOrDefaultAsync", "SingleOrDefaultAsync", "AnyAsync", "CountAsync", "Wait", "Result", "ConfigureAwait",
    "Log", "LogInformation", "LogError", "LogWarning", "LogDebug", "Info", "Error", "Debug", "Warn", "Fill",
    "ExecuteNonQuery", "ExecuteReader", "ExecuteScalar", "Append", "AppendLine", "Load", "Save", "Update", "Delete",
}
MVC_RESULTS = {
    "View": "view", "PartialView": "partial", "RedirectToAction": "redirect_action", "RedirectToActionPermanent": "redirect_action",
    "RedirectToRoute": "redirect_route", "Redirect": "redirect", "RedirectPermanent": "redirect", "Json": "json",
    "Content": "content", "File": "file", "Ok": "ok", "NotFound": "not_found", "BadRequest": "bad_request",
    "CreatedAtAction": "created_at_action", "NoContent": "no_content", "Unauthorized": "unauthorized", "Forbid": "forbid",
    "Challenge": "challenge", "RedirectToPage": "redirect_page", "Page": "page", "ViewComponent": "view_component",
    "LocalRedirect": "redirect", "StatusCode": "status", "Problem": "problem", "HttpNotFound": "not_found",
}
CONTROLLER_BASES = {"Controller", "ApiController", "ControllerBase", "AsyncController", "ODataController"}
PAGE_BASES = {"Page", "UserControl", "MasterPage", "System.Web.UI.Page", "System.Web.UI.UserControl", "System.Web.UI.MasterPage"}
HTTP_ATTRS = {"HttpGet": "GET", "HttpPost": "POST", "HttpPut": "PUT", "HttpDelete": "DELETE", "HttpPatch": "PATCH", "HttpHead": "HEAD", "HttpOptions": "OPTIONS"}
LAYERS = ["Controller", "Razor page", "Web Forms page", "Service", "BAL", "DAL", "Interface", "Model", "Validation", "Infrastructure", "Other"]


@lru_cache(maxsize=1)
def _parser() -> Parser:
    return Parser(Language(tscs.language()))


# ---------------------------------------------------------------- C# parsing

def _t(node, src: bytes) -> str:
    return src[node.start_byte:node.end_byte].decode("utf-8", "replace") if node is not None else ""


def _type_name(raw: str) -> str:
    """'IRepository<Order>?' -> 'IRepository', 'Shop.Core.OrderDto[]' -> 'OrderDto', 'Task<OrderDto>' -> 'OrderDto'."""
    s = (raw or "").strip().rstrip("?")
    s = re.sub(r"\[\s*,*\s*\]$", "", s)
    m = re.match(r"^(?:[\w.]+\.)?(Task|ValueTask|IEnumerable|List|IList|ICollection|IQueryable|IReadOnlyList|Lazy|Func|ActionResult)<(.+)>$", s)
    if m and m.group(1) in {"Task", "ValueTask", "Lazy"}:
        return _type_name(m.group(2))
    s = re.sub(r"<.*>$", "", s)
    return s.rsplit(".", 1)[-1].strip()


def _strings(args_node, src: bytes) -> list[str | None]:
    """Each argument's string literal value, or None when it is not a plain string."""
    out: list[str | None] = []
    if args_node is None:
        return out
    for a in args_node.named_children:
        if a.type not in ("argument", "attribute_argument"):
            continue
        val = a.named_children[-1] if a.named_children else None
        if val is not None and val.type in ("string_literal", "verbatim_string_literal", "raw_string_literal"):
            inner = [c for c in val.named_children if c.type in ("string_literal_content",)]
            out.append(_t(inner[0], src) if inner else _t(val, src).strip('@"'))
        elif val is not None and val.type == "invocation_expression" and _t(val, src).startswith("nameof("):
            out.append(_t(val, src)[7:-1].rsplit(".", 1)[-1].strip())
        elif val is not None and val.type == "name_colon":
            out.append(None)
        else:
            out.append(None)
    return out


def _attributes(node, src: bytes) -> list[dict]:
    attrs = []
    for al in (c for c in node.children if c.type == "attribute_list"):
        for a in (c for c in al.named_children if c.type == "attribute"):
            name = _t(a.child_by_field_name("name"), src).rsplit(".", 1)[-1]
            name = re.sub(r"Attribute$", "", name)
            arglist = next((c for c in a.named_children if c.type == "attribute_argument_list"), None)
            attrs.append({"name": name, "args": [s for s in _strings(arglist, src) if s is not None]})
    return attrs


def _modifiers(node, src: bytes) -> list[str]:
    return [_t(c, src) for c in node.children if c.type == "modifier"]


def _params(plist, src: bytes) -> list[dict]:
    out = []
    if plist is None:
        return out
    for p in (c for c in plist.named_children if c.type == "parameter"):
        out.append({"name": _t(p.child_by_field_name("name"), src), "type": _t(p.child_by_field_name("type"), src)})
    return out


def _walk(node):
    stack = [node]
    while stack:
        n = stack.pop()
        yield n
        # do not descend into nested type declarations or lambdas' own scopes are fine
        stack.extend(reversed([c for c in n.children if c.type not in ("class_declaration", "interface_declaration", "struct_declaration", "record_declaration")]))


def _body_facts(body, src: bytes) -> dict:
    """Locals, invocations and object creations inside a method/constructor/accessor body."""
    locals_: dict[str, str] = {}
    calls, news = [], []
    if body is None:
        return {"locals": locals_, "calls": calls, "news": news}
    for n in _walk(body):
        if n.type == "variable_declaration":
            tnode = n.child_by_field_name("type")
            tname = _t(tnode, src)
            for d in (c for c in n.named_children if c.type == "variable_declarator"):
                var = _t(d.child_by_field_name("name"), src)
                if tname == "var" or (tnode is not None and tnode.type == "implicit_type"):
                    init = next((c for c in d.named_children if c.type == "object_creation_expression"), None)
                    if init is not None:
                        locals_[var] = _t(init.child_by_field_name("type"), src)
                else:
                    locals_[var] = tname
        elif n.type == "declaration_expression":  # out var x / out T x
            tn, nm = n.child_by_field_name("type"), n.child_by_field_name("name")
            if tn is not None and nm is not None and _t(tn, src) != "var":
                locals_[_t(nm, src)] = _t(tn, src)
        elif n.type == "foreach_statement":
            tn, nm = n.child_by_field_name("type"), n.child_by_field_name("left")
            if tn is not None and nm is not None and _t(tn, src) != "var":
                locals_[_t(nm, src)] = _t(tn, src)
        elif n.type == "object_creation_expression":
            news.append({"type": _t(n.child_by_field_name("type"), src), "line": n.start_point[0] + 1})
        elif n.type == "invocation_expression":
            fn = n.child_by_field_name("function")
            args = n.child_by_field_name("arguments")
            recv_kind, recv, name = "none", "", ""
            if fn is None:
                continue
            if fn.type in ("identifier", "generic_name"):
                name = _t(fn, src).split("<")[0]
            elif fn.type == "member_access_expression":
                name = _t(fn.child_by_field_name("name"), src).split("<")[0]
                ex = fn.child_by_field_name("expression")
                if ex is None:
                    first = fn.children[0] if fn.children else None
                    kw = _t(first, src) if first is not None else ""
                    recv_kind = "this" if kw == "this" else "base" if kw == "base" else "other"
                elif ex.type == "this_expression" or _t(ex, src) == "this":
                    recv_kind = "this"
                elif ex.type == "base_expression" or _t(ex, src) == "base":
                    recv_kind = "base"
                elif ex.type == "identifier":
                    recv_kind, recv = "ident", _t(ex, src)
                elif ex.type == "member_access_expression" and _t(ex, src).startswith("this."):
                    recv_kind, recv = "ident", _t(ex, src)[5:]
                else:
                    recv_kind, recv = "other", _t(ex, src)[:80]
            elif fn.type == "conditional_access_expression":
                recv_kind, recv = "other", _t(fn, src)[:80]
                name = re.split(r"[?.]", _t(fn, src))[-1].split("(")[0]
            else:
                continue
            if not name:
                continue
            calls.append({"name": name, "recv_kind": recv_kind, "recv": recv, "strings": _strings(args, src)[:3],
                          "argc": len([a for a in (args.named_children if args else []) if a.type == "argument"]), "line": n.start_point[0] + 1})
    return {"locals": locals_, "calls": calls, "news": news}


def _namespace_of(node, src: bytes, file_ns: str) -> str:
    parts = []
    p = node.parent
    while p is not None:
        if p.type == "namespace_declaration":
            parts.append(_t(p.child_by_field_name("name"), src))
        p = p.parent
    ns = ".".join(reversed(parts))
    return ".".join(x for x in (file_ns, ns) if x) if file_ns and not ns.startswith(file_ns) else (ns or file_ns)


TYPE_NODES = {"class_declaration": "class", "interface_declaration": "interface", "struct_declaration": "struct",
              "record_declaration": "record", "record_struct_declaration": "record", "enum_declaration": "enum"}


def parse_cs(path: str, text: str) -> list[dict]:
    src = text.lstrip("\ufeff").encode("utf-8", "replace")
    tree = _parser().parse(src)
    root = tree.root_node
    file_ns = ""
    for c in root.named_children:
        if c.type == "file_scoped_namespace_declaration":
            file_ns = _t(c.child_by_field_name("name"), src)
    usings = [_t(c.named_children[-1], src) for c in root.named_children if c.type == "using_directive" and c.named_children]
    out: list[dict] = []

    def visit(node, outer: str | None):
        for c in node.named_children:
            if c.type in TYPE_NODES:
                out.append(_parse_type(c, src, path, file_ns, outer, usings))
                body = c.child_by_field_name("body")
                if body is not None:
                    visit(body, out[-1]["full_name"])
            elif c.type in ("namespace_declaration", "declaration_list", "file_scoped_namespace_declaration"):
                visit(c, outer)
            elif c.type == "namespace_declaration":
                visit(c, outer)

    visit(root, None)
    for c in root.named_children:
        if c.type == "namespace_declaration":
            pass
    return out


def _parse_type(node, src: bytes, path: str, file_ns: str, outer: str | None, usings: list[str]) -> dict:
    kind = TYPE_NODES[node.type]
    name = _t(node.child_by_field_name("name"), src)
    ns = _namespace_of(node, src, file_ns)
    full = f"{outer}.{name}" if outer else (f"{ns}.{name}" if ns else name)
    bases = []
    bl = next((c for c in node.named_children if c.type == "base_list"), None)
    if bl is not None:
        for b in bl.named_children:
            if b.type in ("identifier", "generic_name", "qualified_name", "predefined_type"):
                bases.append(_t(b, src))
            elif b.type == "primary_constructor_base_type":
                bases.append(_t(b.named_children[0], src) if b.named_children else _t(b, src))
    t = {
        "kind": kind, "name": name, "namespace": ns, "full_name": full, "file": path, "line": node.start_point[0] + 1,
        "end_line": node.end_point[0] + 1, "bases": bases, "attributes": _attributes(node, src), "modifiers": _modifiers(node, src),
        "usings": usings, "outer": outer, "members": [], "fields": {}, "primary_params": [],
    }
    # record / class primary constructor parameters become properties and dependencies
    pl = next((c for c in node.named_children if c.type == "parameter_list"), None)
    if pl is not None:
        for p in _params(pl, src):
            t["primary_params"].append(p)
            t["fields"][p["name"]] = p["type"]
            t["fields"][p["name"][:1].lower() + p["name"][1:]] = p["type"]
            if kind == "record":
                t["members"].append({"kind": "property", "name": p["name"], "type": p["type"], "line": t["line"], "modifiers": ["public"], "attributes": [], "accessors": ["get", "init"]})
    body = node.child_by_field_name("body")
    if body is None:
        return t
    if kind == "enum":
        for m in (c for c in body.named_children if c.type == "enum_member_declaration"):
            t["members"].append({"kind": "enum_value", "name": _t(m.child_by_field_name("name"), src), "line": m.start_point[0] + 1, "modifiers": [], "attributes": []})
        return t
    for m in body.named_children:
        mt = m.type
        if mt in ("method_declaration", "constructor_declaration", "destructor_declaration", "operator_declaration", "conversion_operator_declaration"):
            mname = _t(m.child_by_field_name("name"), src) or ("op" if "operator" in mt else name)
            if mt == "constructor_declaration":
                mname = ".ctor"
            body_n = m.child_by_field_name("body")
            if body_n is None:  # expression-bodied: => expr
                body_n = next((c for c in m.named_children if c.type == "arrow_expression_clause"), None)
            ret = _t(m.child_by_field_name("returns") or m.child_by_field_name("type"), src) if mt != "constructor_declaration" else ""
            t["members"].append({
                "kind": "constructor" if mt == "constructor_declaration" else "method", "name": mname,
                "return_type": ret, "params": _params(m.child_by_field_name("parameters"), src),
                "modifiers": _modifiers(m, src), "attributes": _attributes(m, src),
                "line": m.start_point[0] + 1, "end_line": m.end_point[0] + 1, "facts": _body_facts(body_n, src),
            })
        elif mt == "property_declaration":
            pname = _t(m.child_by_field_name("name"), src)
            ptype = _t(m.child_by_field_name("type"), src)
            accessors = []
            acc = m.child_by_field_name("accessors")
            facts = {"locals": {}, "calls": [], "news": []}
            if acc is not None:
                for a in (c for c in acc.named_children if c.type == "accessor_declaration"):
                    kw = next((_t(c, src) for c in a.children if _t(c, src) in ("get", "set", "init")), "get")
                    accessors.append(kw)
                    b = a.child_by_field_name("body") or next((c for c in a.named_children if c.type == "arrow_expression_clause"), None)
                    f = _body_facts(b, src)
                    facts["calls"] += f["calls"]
                    facts["news"] += f["news"]
            arrow = next((c for c in m.named_children if c.type == "arrow_expression_clause"), None)
            if arrow is not None:
                accessors = ["get"]
                f = _body_facts(arrow, src)
                facts["calls"] += f["calls"]
                facts["news"] += f["news"]
            t["fields"][pname] = ptype
            t["members"].append({"kind": "property", "name": pname, "type": ptype, "accessors": accessors, "modifiers": _modifiers(m, src),
                                 "attributes": _attributes(m, src), "line": m.start_point[0] + 1, "facts": facts})
        elif mt in ("field_declaration", "event_field_declaration"):
            vd = next((c for c in m.named_children if c.type == "variable_declaration"), None)
            if vd is None:
                continue
            ftype = _t(vd.child_by_field_name("type"), src)
            for d in (c for c in vd.named_children if c.type == "variable_declarator"):
                fname = _t(d.child_by_field_name("name"), src)
                t["fields"][fname] = ftype
                t["members"].append({"kind": "event" if mt == "event_field_declaration" else "field", "name": fname, "type": ftype,
                                     "modifiers": _modifiers(m, src), "attributes": _attributes(m, src), "line": m.start_point[0] + 1})
    return t


# ---------------------------------------------------------------- layers, ids, routes

def _base_names(t: dict) -> list[str]:
    return [_type_name(b) for b in t["bases"]]


def is_controller(t: dict) -> bool:
    if t["kind"] != "class" or "abstract" in t["modifiers"]:
        return False
    bases = set(_base_names(t))
    return t["name"].endswith("Controller") and (bool(bases & CONTROLLER_BASES) or any(b.endswith("Controller") for b in bases) or not bases)


def classify(t: dict) -> str:
    name, ns, path = t["name"], (t["namespace"] or "").lower(), t["file"].lower()
    bases = set(_base_names(t))
    if t["kind"] == "interface":
        return "Interface"
    if is_controller(t):
        return "Controller"
    if bases & {"PageModel"}:
        return "Razor page"
    if bases & {"Page", "UserControl", "MasterPage"} or re.search(r"\.(aspx|ascx|master|asmx)\.cs$", path) or bases & {"WebService"}:
        return "Web Forms page"
    lname = name.lower()
    if bases & {"DbContext", "IdentityDbContext", "ObjectContext"} or re.search(r"(repository|repo|dal|dao|dataaccess|dbcontext|context|gateway|store)$", lname) \
            or re.search(r"\.(dal|data|dataaccess|repositor(y|ies)|persistence|infrastructure\.data)(\.|$)", ns):
        return "DAL"
    if re.search(r"(manager|bll|bal|logic|business|domainservice)$", lname) or re.search(r"\.(bll|bal|business|businesslogic|domain)(\.|$)", ns):
        return "BAL"
    if re.search(r"(service|handler|provider|client|worker|job|hub|consumer|processor)$", lname) or re.search(r"\.(services?|application|handlers)(\.|$)", ns):
        return "Service"
    if re.search(r"validator$", lname):
        return "Validation"
    if t["kind"] in ("record", "enum", "struct") or re.search(r"(dto|viewmodel|model|entity|request|response|command|query|event|options|settings)$", lname) \
            or re.search(r"\.(models?|entities|dtos?|viewmodels|contracts)(\.|$)", ns):
        return "Model"
    if re.search(r"(middleware|filter|attribute|extensions?|helper|config|startup|program|module|binder|mapper|profile)$", lname) or name in ("Global", "MvcApplication", "BundleConfig", "RouteConfig"):
        return "Infrastructure"
    return "Other"


def member_id(type_full: str, m: dict) -> str:
    if m["kind"] in ("method", "constructor"):
        return f"{type_full}.{m['name']}({','.join(_type_name(p['type']) for p in m.get('params', []))})"
    return f"{type_full}.{m['name']}"


def _attr(m: dict, *names: str) -> dict | None:
    return next((a for a in m.get("attributes", []) if a["name"] in names), None)


def _join_route(prefix: str | None, tmpl: str | None) -> str | None:
    if tmpl is None and prefix is None:
        return None
    if tmpl and tmpl.startswith(("~/", "/")):
        return tmpl.lstrip("~/")
    return "/".join(x.strip("/") for x in (prefix, tmpl) if x)


def _route_regex(tmpl: str) -> re.Pattern:
    segs = [s for s in tmpl.strip("/").split("/") if s]
    parts, optional_tail = [], True
    out = []
    for s in reversed(segs):
        if s.startswith("{"):
            opt = s.endswith("?}") or s.startswith("{*") or optional_tail
            out.append(("[^/]+", opt))
        else:
            optional_tail = False
            out.append((re.escape(s.lower()), False))
    out.reverse()
    rx = ""
    for frag, opt in out:
        rx += f"(?:/{frag})?" if opt else f"/{frag}"
    return re.compile(f"^{rx}/?$")


# ---------------------------------------------------------------- views and scripts

LINK_PATTERNS = [
    ("actionlink", re.compile(r"Html\.ActionLink\(\s*(?:@?\"[^\"]*\"|[^,()]+(?:\([^)]*\))?)\s*,\s*\"(\w+)\"(?:\s*,\s*\"(\w+)\")?")),
    ("url_action", re.compile(r"Url\.Action\(\s*\"(\w+)\"(?:\s*,\s*\"(\w+)\")?")),
    ("form", re.compile(r"(?:Html|Ajax)\.BeginForm\(\s*\"(\w+)\"(?:\s*,\s*\"(\w+)\")?")),
    ("child_action", re.compile(r"Html\.(?:Render)?Action\(\s*\"(\w+)\"(?:\s*,\s*\"(\w+)\")?")),
    ("ajax_actionlink", re.compile(r"Ajax\.ActionLink\(\s*(?:\"[^\"]*\"|[^,]+)\s*,\s*\"(\w+)\"(?:\s*,\s*\"(\w+)\")?")),
]
PARTIAL_PATTERNS = [
    re.compile(r"Html\.(?:Render)?Partial(?:Async)?\(\s*\"([^\"]+)\""),
    re.compile(r"<partial\s+[^>]*name=\"([^\"]+)\""),
]
COMPONENT_RX = re.compile(r"Component\.InvokeAsync\(\s*\"(\w+)\"|<vc:([\w-]+)")
TAG_RX = re.compile(r"<(a|form|button|input)\b([^>]*)>", re.I)
ATTR_RX = re.compile(r"([\w-]+)\s*=\s*\"([^\"]*)\"")
JS_URL_PATTERNS = [
    ("ajax", re.compile(r"\burl\s*:\s*(['\"`])(.*?)\1", re.S)),
    ("ajax", re.compile(r"\$\.(?:get|post|getJSON|ajax)\(\s*(['\"`])(.*?)\1")),
    ("ajax", re.compile(r"\.load\(\s*(['\"`])(.*?)\1")),
    ("fetch", re.compile(r"\bfetch\(\s*(['\"`])(.*?)\1")),
    ("ajax", re.compile(r"\baxios(?:\.\w+)?\(\s*(['\"`])(.*?)\1")),
    ("ajax", re.compile(r"\.open\(\s*['\"]\w+['\"]\s*,\s*(['\"`])(.*?)\1")),
    ("href", re.compile(r"(?:window\.)?location(?:\.href)?\s*=\s*(['\"`])(.*?)\1")),
]
PAGEMETHOD_RX = re.compile(r"PageMethods\.(\w+)\(")
SCRIPT_BLOCK_RX = re.compile(r"<script\b[^>]*>(.*?)</script>", re.S | re.I)
WF_DIRECTIVE_RX = re.compile(r"<%@\s*(Page|Control|Master|WebService|WebHandler)\b(.*?)%>", re.S | re.I)
WF_REGISTER_RX = re.compile(r"<%@\s*Register\b[^%]*?Src=\"([^\"]+)\"", re.S | re.I)
WF_CONTROL_RX = re.compile(r"<((?:asp|uc\w*|\w+):\w+|input|button|form|a|select|div|span)\b([^>]*?\brunat=\"server\"[^>]*?)/?>", re.S | re.I)


def _line_of(text: str, idx: int) -> int:
    return text.count("\n", 0, idx) + 1


def _clean_url(u: str) -> str | None:
    u = u.strip()
    if not u or u.startswith(("#", "javascript:", "mailto:", "tel:", "data:")) or "@Url" in u:
        return None
    u = re.split(r"\$\{|'\s*\+|\"\s*\+|\?|#", u)[0]
    u = re.sub(r"^https?://[^/]+", "", u)
    u = u.lstrip("~")
    if not u.startswith("/") and not re.match(r"^[\w.-]+/", u) and not u.lower().endswith((".aspx", ".asmx", ".ashx")):
        return None
    return "/" + u.strip("/")


def _attrs(s: str) -> dict:
    return {k.lower(): v for k, v in ATTR_RX.findall(s)}


def parse_view(path: str, text: str) -> dict:
    text = text.lstrip("\ufeff")
    lower = path.lower()
    base = posixpath.basename(path)
    v = {"path": path, "name": base, "kind": "view", "model": None, "layout": None, "layout_explicit": False, "partials": [], "components": [],
         "links": [], "events": [], "directive": None, "code_behind": None, "inherits": None, "master": None, "controls": [], "route": None}
    if lower.endswith(JS_EXT):
        v["kind"] = "script"
        _scan_js(text, v, 0)
        v["links"] = v["links"][:MAX_LINKS_PER_VIEW]
        return v
    if lower.endswith((".aspx", ".ascx", ".master", ".asmx", ".ashx")):
        v["kind"] = {".aspx": "webform", ".ascx": "user_control", ".master": "master_page", ".asmx": "web_service", ".ashx": "handler"}[posixpath.splitext(lower)[1]]
        d = WF_DIRECTIVE_RX.search(text)
        if d:
            a = _attrs(d.group(2))
            v["directive"] = d.group(1)
            v["code_behind"] = a.get("codebehind") or a.get("codefile")
            v["inherits"] = a.get("inherits") or a.get("class")
            v["master"] = a.get("masterpagefile")
        v["controls"] = [{"src": s, "line": _line_of(text, m.start())} for m in WF_REGISTER_RX.finditer(text) for s in [m.group(1)]]
        for m in WF_CONTROL_RX.finditer(text):
            a = _attrs(m.group(2))
            cid = a.get("id", "")
            for k, val in a.items():
                if k.startswith("on") and re.fullmatch(r"\w+", val or "") and k not in ("onclientclick",):
                    v["events"].append({"control": cid, "control_type": m.group(1), "event": k, "handler": val, "line": _line_of(text, m.start())})
            if a.get("postbackurl"):
                u = _clean_url(a["postbackurl"])
                if u:
                    v["links"].append({"kind": "postback", "url": u, "line": _line_of(text, m.start()), "text": cid})
        for m in re.finditer(r"<a\b[^>]*href=\"([^\"]+)\"", text, re.I):
            u = _clean_url(m.group(1))
            if u and u.lower().split("?")[0].endswith((".aspx", ".ashx", ".asmx")):
                v["links"].append({"kind": "href", "url": u, "line": _line_of(text, m.start()), "text": ""})
        for m in SCRIPT_BLOCK_RX.finditer(text):
            _scan_js(m.group(1), v, m.start(1), full=text)
        v["links"] = v["links"][:MAX_LINKS_PER_VIEW]
        return v
    # Razor (.cshtml / .vbhtml / .razor)
    if base.lower() == "_viewstart.cshtml":
        v["kind"] = "viewstart"
    elif base.lower() == "_viewimports.cshtml":
        v["kind"] = "viewimports"
    elif base.lower().startswith("_layout") or "/layout" in lower:
        v["kind"] = "layout"
    elif base.startswith("_"):
        v["kind"] = "partial"
    page = re.search(r"^\s*@page(?:\s+\"([^\"]*)\")?", text, re.M)
    if page:
        v["kind"] = "razor_page" if lower.endswith(".cshtml") else "component"
        v["route"] = page.group(1)
    elif lower.endswith(".razor"):
        v["kind"] = "component"
    m = re.search(r"^\s*@model\s+([\w.<>,\[\]? ]+)", text, re.M) or re.search(r"^\s*@inherits\s+[\w.]+<([\w.]+)>", text, re.M)
    if m:
        v["model"] = m.group(1).strip()
    m = re.search(r"\bLayout\s*=\s*(null|\"([^\"]*)\")", text)
    if m:
        v["layout_explicit"] = True
        v["layout"] = None if m.group(1) == "null" else m.group(2)
    for rx in PARTIAL_PATTERNS:
        for pm in rx.finditer(text):
            v["partials"].append({"name": pm.group(1), "line": _line_of(text, pm.start())})
    for cm in COMPONENT_RX.finditer(text):
        v["components"].append({"name": cm.group(1) or cm.group(2), "line": _line_of(text, cm.start())})
    scripts = [(m.start(1), m.end(1)) for m in SCRIPT_BLOCK_RX.finditer(text)]
    in_script = lambda i: any(a <= i < b for a, b in scripts)  # noqa: E731
    for kind, rx in LINK_PATTERNS:
        for lm in rx.finditer(text):
            v["links"].append({"kind": "ajax" if in_script(lm.start()) and kind == "url_action" else kind, "action": lm.group(1),
                               "controller": lm.group(2), "line": _line_of(text, lm.start()), "text": lm.group(0)[:80]})
    for tm in TAG_RX.finditer(text):
        a = _attrs(tm.group(2))
        if "asp-action" in a or "asp-controller" in a:
            v["links"].append({"kind": "form" if tm.group(1).lower() == "form" else "tag_helper", "action": a.get("asp-action") or "Index",
                               "controller": a.get("asp-controller"), "area": a.get("asp-area"), "line": _line_of(text, tm.start()), "text": tm.group(0)[:80]})
        elif "asp-page" in a or "asp-page-handler" in a:
            v["links"].append({"kind": "page_link", "page": a.get("asp-page"), "handler": a.get("asp-page-handler"),
                               "method": "post" if tm.group(1).lower() == "form" or (a.get("method", "").lower() == "post") else "get",
                               "line": _line_of(text, tm.start()), "text": tm.group(0)[:80]})
        elif tm.group(1).lower() == "a" and a.get("href"):
            u = _clean_url(a["href"])
            if u:
                v["links"].append({"kind": "href", "url": u, "line": _line_of(text, tm.start()), "text": tm.group(0)[:80]})
        elif tm.group(1).lower() == "form" and a.get("action"):
            u = _clean_url(a["action"])
            if u:
                v["links"].append({"kind": "form", "url": u, "line": _line_of(text, tm.start()), "text": tm.group(0)[:80]})
    for a, b in scripts:
        _scan_js(text[a:b], v, a, full=text)
    v["links"] = v["links"][:MAX_LINKS_PER_VIEW]
    return v


def _scan_js(js: str, v: dict, offset: int, full: str | None = None) -> None:
    full = full if full is not None else js
    for kind, rx in JS_URL_PATTERNS:
        for m in rx.finditer(js):
            u = _clean_url(m.group(2))
            if u:
                v["links"].append({"kind": kind, "url": u, "line": _line_of(full, offset + m.start()), "text": m.group(0)[:80]})
    for m in PAGEMETHOD_RX.finditer(js):
        v["links"].append({"kind": "page_method", "method": m.group(1), "line": _line_of(full, offset + m.start()), "text": m.group(0)[:80]})


# ---------------------------------------------------------------- building the index

def build_code_index(files: list[dict]) -> dict:
    cs = [f for f in files if f["path"].lower().endswith(".cs")]
    views = [f for f in files if f["path"].lower().endswith(VIEW_EXT + JS_EXT)]
    raw_types: list[dict] = []
    parse_errors = 0
    for f in cs:
        try:
            raw_types.extend(parse_cs(f["path"], f["content"]))
        except Exception:  # pragma: no cover - a single bad file must not stop the import
            parse_errors += 1

    # merge partial classes (code-behind + designer) by full name
    types: dict[str, dict] = {}
    for t in raw_types:
        if t["full_name"] in types:
            cur = types[t["full_name"]]
            cur["members"] += t["members"]
            cur["fields"].update(t["fields"])
            cur["bases"] = list(dict.fromkeys(cur["bases"] + t["bases"]))
            cur["attributes"] += t["attributes"]
            cur.setdefault("files", [cur["file"]]).append(t["file"])
            if t["file"].endswith(".designer.cs") is False and cur["file"].lower().endswith(".designer.cs"):
                cur["file"], cur["line"] = t["file"], t["line"]
        else:
            types[t["full_name"]] = t
    by_name: dict[str, list[dict]] = defaultdict(list)
    for t in types.values():
        by_name[t["name"]].append(t)

    def resolve_type(raw: str, ctx: dict | None = None) -> dict | None:
        name = _type_name(raw)
        cands = by_name.get(name) or []
        if not cands:
            return None
        if len(cands) == 1 or ctx is None:
            return cands[0]
        same = [c for c in cands if c["namespace"] == ctx["namespace"]] or [c for c in cands if c["namespace"] in ctx.get("usings", [])]
        return (same or cands)[0]

    # inheritance
    for t in types.values():
        t["base_types"] = [b["full_name"] for b in (resolve_type(x, t) for x in t["bases"]) if b is not None and b["full_name"] != t["full_name"]]
        t["layer"] = classify(t)
    implemented_by: dict[str, list[str]] = defaultdict(list)
    for t in types.values():
        for b in t["base_types"]:
            implemented_by[b].append(t["full_name"])

    def ancestors(full: str, seen=None) -> list[str]:
        seen = seen or set()
        out = []
        for b in types[full]["base_types"]:
            if b not in seen and b in types:
                seen.add(b)
                out.append(b)
                out += ancestors(b, seen)
        return out

    def descendants(full: str, seen=None) -> list[str]:
        seen = seen or set()
        out = []
        for d in implemented_by.get(full, []):
            if d not in seen:
                seen.add(d)
                out.append(d)
                out += descendants(d, seen)
        return out

    methods_by_type: dict[str, dict[str, list[tuple[str, dict]]]] = defaultdict(lambda: defaultdict(list))
    name_index: dict[str, list[str]] = defaultdict(list)
    for t in types.values():
        for m in t["members"]:
            if m["kind"] in ("method", "constructor", "property"):
                mid = member_id(t["full_name"], m)
                m["id"] = mid
                methods_by_type[t["full_name"]][m["name"]].append((mid, m))
                if m["kind"] == "method":
                    name_index[m["name"]].append(mid)
            else:
                m["id"] = member_id(t["full_name"], m)

    def find_member(full: str, name: str, argc: int | None = None, include_bases: bool = True) -> list[str]:
        for owner in [full] + (ancestors(full) if include_bases else []):
            hits = methods_by_type.get(owner, {}).get(name)
            if hits:
                if argc is not None and len(hits) > 1:
                    exact = [mid for mid, m in hits if len(m.get("params", [])) == argc]
                    if exact:
                        return exact
                return [mid for mid, _ in hits]
        return []

    def impls_of(iface_full: str, name: str, argc: int | None) -> list[str]:
        out = []
        for d in descendants(iface_full):
            if types[d]["kind"] != "interface":
                out += find_member(d, name, argc, include_bases=False)
        return out

    # controllers, actions and routes
    actions: dict[tuple[str, str], list[str]] = defaultdict(list)    # (controller lower, action lower) -> member ids
    routes: list[tuple[re.Pattern, str, str]] = []                     # (regex, member id, template)
    member_owner: dict[str, str] = {}
    for t in types.values():
        for m in t["members"]:
            member_owner[m["id"]] = t["full_name"]
        if t["layer"] != "Controller":
            continue
        ctrl = re.sub(r"Controller$", "", t["name"])
        area = next((a["args"][0] for a in t["attributes"] if a["name"] == "Area" and a["args"]), None)
        if not area:
            am = re.search(r"(?:^|/)areas/([^/]+)/", t["file"].lower())
            area = am.group(1) if am else None
        t["controller"], t["area"] = ctrl, area
        prefix_attr = next((a for a in t["attributes"] if a["name"] in ("Route", "RoutePrefix") and a["args"]), None)
        prefix = prefix_attr["args"][0].replace("[controller]", ctrl) if prefix_attr else None
        is_api = any(a["name"] == "ApiController" for a in t["attributes"]) or "ApiController" in _base_names(t)
        for m in t["members"]:
            if m["kind"] != "method" or "public" not in m["modifiers"] or "static" in m["modifiers"] or _attr(m, "NonAction"):
                continue
            action_name = (_attr(m, "ActionName") or {}).get("args", [m["name"]])[0] if _attr(m, "ActionName") else re.sub(r"Async$", "", m["name"])
            verbs = [HTTP_ATTRS[a["name"]] for a in m["attributes"] if a["name"] in HTTP_ATTRS] + \
                    [v.upper() for a in m["attributes"] if a["name"] == "AcceptVerbs" for v in a["args"]]
            templates = []
            for a in m["attributes"]:
                if (a["name"] in HTTP_ATTRS or a["name"] == "Route") and a["args"]:
                    templates.append(_join_route(prefix, a["args"][0]))
            if not templates and prefix is not None:
                templates.append(_join_route(prefix, None))
            templates = [x.replace("[action]", action_name).replace("[controller]", ctrl) if x else x for x in templates]
            if not templates:
                base_t = f"api/{ctrl}" if is_api else f"{ctrl}/{action_name}"
                if area:
                    base_t = f"{area}/{base_t}"
                templates.append(base_t + "/{id?}")
                if action_name.lower() == "index" and not is_api:
                    templates.append((f"{area}/" if area else "") + ctrl)
                    if ctrl.lower() == "home" and not area:
                        templates.append("")
            m["is_action"] = True
            m["action_name"] = action_name
            m["http"] = {"verbs": verbs, "routes": ["/" + (x or "").strip("/") for x in templates]}  # no verbs = any
            actions[(ctrl.lower(), action_name.lower())].append(m["id"])
            for tmpl in templates:
                routes.append((_route_regex(tmpl or ""), m["id"], "/" + (tmpl or "").strip("/")))

    # Razor Pages models and Web Forms code-behind

    # ---------------- resolve calls
    callers: dict[str, list[dict]] = defaultdict(list)
    unresolved_calls = 0
    resolved_calls = 0
    for t in types.values():
        ctor = next((m for m in t["members"] if m["kind"] == "constructor"), None)
        deps = [p["type"] for p in (ctor or {}).get("params", [])] + [p["type"] for p in t.get("primary_params", [])]
        t["dependencies"] = sorted({r["full_name"] for r in (resolve_type(d, t) for d in deps) if r is not None})
        for m in t["members"]:
            facts = m.pop("facts", None)
            if not facts:
                continue
            scope = dict(t["fields"])
            for owner in ancestors(t["full_name"]):
                for k, v_ in types[owner]["fields"].items():
                    scope.setdefault(k, v_)
            for p in m.get("params", []):
                scope[p["name"]] = p["type"]
            scope.update(facts["locals"])
            out_calls, results, seen = [], [], set()
            for c in facts["calls"]:
                name, kind = c["name"], c["recv_kind"]
                # MVC / Razor Pages results
                if kind in ("none", "this", "base") and name in MVC_RESULTS and (t["layer"] in ("Controller", "Razor page") or t["name"].endswith("Controller")):
                    results.append({"kind": MVC_RESULTS[name], "args": c["strings"], "argc": c["argc"], "line": c["line"]})
                    continue
                targets, conf, via = [], None, None
                if kind in ("none", "this"):
                    targets, conf = find_member(t["full_name"], name, c["argc"]), "exact"
                    if not targets and t["outer"]:
                        targets = find_member(t["outer"], name, c["argc"])
                elif kind == "base":
                    for b in t["base_types"]:
                        targets = find_member(b, name, c["argc"])
                        if targets:
                            break
                    conf = "exact"
                elif kind == "ident":
                    recv = c["recv"]
                    rtype_raw = scope.get(recv)
                    rt = resolve_type(rtype_raw, t) if rtype_raw else (resolve_type(recv, t) if recv[:1].isupper() else None)
                    if rt is not None:
                        targets = find_member(rt["full_name"], name, c["argc"])
                        conf = "exact"
                        if rt["kind"] == "interface" or "abstract" in rt["modifiers"]:
                            impl = impls_of(rt["full_name"], name, c["argc"])
                            if impl:
                                via = targets[0] if targets else None
                                targets = (targets or []) + impl
                                conf = "interface"
                if not targets and name not in COMMON_NAMES and kind != "base":
                    cands = [x for x in name_index.get(name, []) if member_owner.get(x) != t["full_name"] or kind in ("none", "this")]
                    if len(cands) == 1:
                        targets, conf = cands, "likely"
                    elif 1 < len(cands) <= 4:
                        targets, conf = cands, "ambiguous"
                key = (name, tuple(targets) if targets else c["recv"])
                if key in seen:
                    continue
                seen.add(key)
                label = (f"{c['recv']}." if c["recv"] else "") + name + "()"
                if targets:
                    resolved_calls += 1
                    out_calls.append({"label": label, "line": c["line"], "targets": targets[:6], "confidence": conf, "via": via})
                    for tg in targets[:6]:
                        callers[tg].append({"id": m["id"], "label": f"{t['name']}.{m['name']}", "line": c["line"], "confidence": conf, "kind": "call"})
                else:
                    unresolved_calls += 1
                    out_calls.append({"label": label, "line": c["line"], "targets": [], "confidence": "external", "via": None})
            for n in facts["news"]:
                rt = resolve_type(n["type"], t)
                if rt is not None:
                    ctor_ids = find_member(rt["full_name"], ".ctor", include_bases=False)
                    out_calls.append({"label": f"new {_type_name(n['type'])}()", "line": n["line"], "targets": ctor_ids or [rt["full_name"]],
                                      "confidence": "exact", "via": None, "creates": rt["full_name"]})
                    for tg in ctor_ids:
                        callers[tg].append({"id": m["id"], "label": f"{t['name']}.{m['name']}", "line": n["line"], "confidence": "exact", "kind": "new"})
            m["calls"] = out_calls[:MAX_CALLS_PER_METHOD]
            if results:
                m["results"] = results

    # ---------------- views
    parsed_views = [parse_view(f["path"], f["content"]) for f in views]
    by_path = {v["path"].lower(): v for v in parsed_views}

    def find_view(name: str, ctrl: str | None, area: str | None, near: str | None = None) -> str | None:
        n = name.replace("\\", "/")
        if n.startswith(("~/", "/")) or "/" in n:
            n = n.lstrip("~/").lower()
            if not n.endswith((".cshtml", ".vbhtml", ".razor")):
                n += ".cshtml"
            hits = [p for p in by_path if p.endswith(n)]
            return by_path[hits[0]]["path"] if hits else None
        fname = n if n.lower().endswith((".cshtml", ".vbhtml")) else f"{n}.cshtml"
        cands = []
        if near:
            cands.append(posixpath.join(posixpath.dirname(near.lower()), fname.lower()))
        if ctrl:
            cands += [f"areas/{area.lower()}/views/{ctrl.lower()}/{fname.lower()}" if area else None, f"views/{ctrl.lower()}/{fname.lower()}"]
        cands += [f"areas/{area.lower()}/views/shared/{fname.lower()}" if area else None, f"views/shared/{fname.lower()}", f"pages/shared/{fname.lower()}", f"pages/{fname.lower()}"]
        for c in (x for x in cands if x):
            hit = next((p for p in by_path if p == c or p.endswith("/" + c)), None)
            if hit:
                return by_path[hit]["path"]
        return None

    for v in parsed_views:
        v.update({"rendered_by": [], "used_as_layout_by": [], "used_as_partial_by": [], "handled_by": [], "resolved": []})

    def view_controller(path: str) -> tuple[str | None, str | None]:
        m = re.search(r"(?:^|/)(?:areas/([^/]+)/)?views/([^/]+)/[^/]+$", path.lower())
        if not m or m.group(2) == "shared":
            return None, (m.group(1) if m else None)
        return m.group(2), m.group(1)

    # action results -> views and redirects
    for t in types.values():
        if t["layer"] not in ("Controller", "Razor page"):
            continue
        for m in t["members"]:
            for r in m.get("results", []):
                if r["kind"] in ("view", "partial"):
                    first = r["args"][0] if r["args"] else None
                    vname = first if first else (m.get("action_name") or m["name"])
                    path = find_view(vname, t.get("controller"), t.get("area"))
                    r["view"] = path
                    r["target_label"] = vname
                    if path:
                        by_path[path.lower()]["rendered_by"].append({"id": m["id"], "label": f"{t['name']}.{m['name']}", "kind": r["kind"]})
                elif r["kind"] == "redirect_action":
                    act = r["args"][0] if r["args"] else None
                    ctrl = (r["args"][1] if len(r["args"]) > 1 and r["args"][1] else t.get("controller")) or ""
                    r["target_label"] = f"{ctrl}/{act}" if act else ctrl
                    tgts = actions.get((ctrl.lower(), (act or "").lower()), []) if act else []
                    r["targets"] = tgts
                    for tg in tgts:
                        callers[tg].append({"id": m["id"], "label": f"{t['name']}.{m['name']}", "line": r["line"], "confidence": "exact", "kind": "redirect"})
                elif r["kind"] in ("redirect_page", "page"):
                    r["target_label"] = r["args"][0] if r["args"] else "(same page)"
                elif r["kind"] == "created_at_action":
                    act = r["args"][0] if r["args"] else None
                    r["target_label"] = act
                    r["targets"] = actions.get(((t.get("controller") or "").lower(), (act or "").lower()), []) if act else []

    # layouts (explicit or from the nearest _ViewStart), partials, components
    viewstarts = {posixpath.dirname(v["path"].lower()): v for v in parsed_views if v["kind"] == "viewstart"}
    for v in parsed_views:
        if v["kind"] in ("viewstart", "viewimports", "script") or v["path"].lower().endswith((".aspx", ".ascx", ".master", ".asmx", ".ashx")):
            continue
        layout_name, source = (v["layout"], "explicit") if v["layout_explicit"] else (None, None)
        if not v["layout_explicit"] and v["kind"] not in ("partial", "layout", "component"):
            d = posixpath.dirname(v["path"].lower())
            while True:
                vs = viewstarts.get(d)
                if vs and vs["layout"]:
                    layout_name, source = vs["layout"], f"from {vs['path']}"
                    break
                if not d:
                    break
                d = posixpath.dirname(d)
        if layout_name:
            ctrl, area = view_controller(v["path"])
            lp = find_view(layout_name, ctrl, area, near=v["path"])
            v["layout_resolved"] = lp
            v["layout_source"] = source
            v["layout"] = layout_name
            if lp:
                by_path[lp.lower()]["used_as_layout_by"].append(v["path"])
        for p in v["partials"]:
            ctrl, area = view_controller(v["path"])
            pp = find_view(p["name"], ctrl, area, near=v["path"])
            p["resolved"] = pp
            if pp:
                by_path[pp.lower()]["used_as_partial_by"].append({"path": v["path"], "line": p["line"]})

    # Web Forms: page -> code-behind type; control events -> handlers; master pages; user controls
    types_by_full_lower = {k.lower(): t for k, t in types.items()}
    for v in parsed_views:
        if v["inherits"]:
            t = types_by_full_lower.get(v["inherits"].lower()) or (by_name.get(v["inherits"].rsplit(".", 1)[-1]) or [None])[0]
            if t is not None:
                v["code_behind_type"] = t["full_name"]
                t["markup"] = v["path"]
                for e in v["events"]:
                    hs = find_member(t["full_name"], e["handler"])
                    e["targets"] = hs
                    for h in hs:
                        callers[h].append({"id": v["path"], "label": f"{v['name']} {e['control'] or e['control_type']} {e['event']}", "line": e["line"], "confidence": "exact", "kind": "ui", "ui_kind": "event", "view": v["path"]})
                lifecycle = [m for m in t["members"] if m["kind"] == "method" and m["name"] in ("Page_Load", "Page_Init", "Page_PreRender", "Page_PreInit", "OnLoad", "OnInit")]
                for m in lifecycle:
                    callers[m["id"]].append({"id": v["path"], "label": f"{v['name']} page lifecycle", "line": 1, "confidence": "exact", "kind": "ui", "ui_kind": "lifecycle", "view": v["path"]})
        if v["master"]:
            mp = find_view(v["master"].lstrip("~/"), None, None) or next((p for p in by_path if p.endswith(v["master"].lstrip("~/").lower())), None)
            mp = by_path[mp.lower()]["path"] if mp and mp.lower() in by_path else mp
            v["layout"], v["layout_resolved"], v["layout_source"] = v["master"], mp, "MasterPageFile"
            if mp and mp.lower() in by_path:
                by_path[mp.lower()]["used_as_layout_by"].append(v["path"])
        for c in v["controls"]:
            cp = next((p for p in by_path if p.endswith(c["src"].lstrip("~/").lower())), None)
            c["resolved"] = by_path[cp]["path"] if cp else None
            if cp:
                by_path[cp]["used_as_partial_by"].append({"path": v["path"], "line": c["line"]})

    # Razor Pages: page -> PageModel; handlers
    for v in parsed_views:
        if v["kind"] == "razor_page" and v["model"]:
            cands = by_name.get(_type_name(v["model"])) or []
            here = posixpath.dirname(v["path"].lower())
            pm = next((c for c in cands if c["file"].lower() == v["path"].lower() + ".cs"), None)                 or next((c for c in cands if posixpath.dirname(c["file"].lower()) == here), None) or (cands[0] if len(cands) == 1 else None)
            if pm is not None:
                v["code_behind_type"] = pm["full_name"]
                pm["markup"] = v["path"]
                for m in pm["members"]:
                    if m["kind"] == "method" and re.match(r"On(Get|Post|Put|Delete|Patch)", m["name"]):
                        callers[m["id"]].append({"id": v["path"], "label": f"{v['name']} request", "line": 1, "confidence": "likely", "kind": "ui", "ui_kind": "page_handler", "view": v["path"]})

    # links / forms / ajax / fetch / page methods -> actions or handlers
    page_by_route = {}
    for v in parsed_views:
        if v["kind"] == "razor_page":
            rel = re.sub(r"^.*?pages/", "", v["path"].lower())
            page_by_route["/" + re.sub(r"(/index)?\.cshtml$", "", rel)] = v
    unresolved_links = 0
    for v in parsed_views:
        vctrl, varea = view_controller(v["path"])
        for ln in v["links"]:
            targets: list[str] = []
            if ln.get("action") is not None:
                ctrl = ln.get("controller") or vctrl
                if ctrl:
                    targets = actions.get((ctrl.lower(), ln["action"].lower()), [])
                else:
                    cands = [ids for (c, a), ids in actions.items() if a == ln["action"].lower()]
                    targets = cands[0] if len(cands) == 1 else []
                if ln["kind"] == "form" and len(targets) > 1:
                    posts = [x for x in targets if "POST" in (_member(types, x) or {}).get("http", {}).get("verbs", [])]
                    targets = posts or targets
            elif ln.get("url"):
                u = ln["url"].lower()
                if u.split("/")[-1].split(".")[-1] in ("aspx", "ashx", "asmx") or ".aspx/" in u or ".asmx/" in u:
                    pagepath, _, method = u.partition(".aspx/") if ".aspx/" in u else u.partition(".asmx/")
                    ext = ".aspx" if ".aspx/" in u else ".asmx"
                    target_view = next((by_path[p] for p in by_path if p.endswith((pagepath.lstrip("/") + ext) if method else u.lstrip("/"))), None)
                    if target_view is not None:
                        ln["view_target"] = target_view["path"]
                        if method and target_view.get("code_behind_type"):
                            targets = find_member(target_view["code_behind_type"], method.split("/")[0], include_bases=False)
                else:
                    for rx, mid, tmpl in routes:
                        if rx.match(u if u != "/" else "/"):
                            targets.append(mid)
                    if not targets and u in page_by_route:
                        ln["view_target"] = page_by_route[u]["path"]
            elif ln["kind"] == "page_method":
                # PageMethods.X from a Web Forms page calls the static [WebMethod] X on its code-behind
                cb = v.get("code_behind_type")
                cands = find_member(cb, ln["method"], include_bases=False) if cb else []
                if not cands:
                    cands = [x for x in name_index.get(ln["method"], []) if _attr(_member(types, x) or {}, "WebMethod")]
                targets = cands
            elif ln["kind"] == "page_link":
                page = ln.get("page")
                pv = page_by_route.get((page or "").lower().rstrip("/")) if page else (v if v["kind"] == "razor_page" else None)
                if pv is not None:
                    ln["view_target"] = pv["path"]
                    if pv.get("code_behind_type"):
                        h = "On" + ("Post" if ln.get("method") == "post" else "Get") + (ln.get("handler") or "")
                        targets = find_member(pv["code_behind_type"], h, include_bases=False) or find_member(pv["code_behind_type"], h + "Async", include_bases=False)
            ln["targets"] = list(dict.fromkeys(targets))[:6]
            if not ln["targets"] and not ln.get("view_target"):
                unresolved_links += 1
            for tg in ln["targets"]:
                callers[tg].append({"id": v["path"], "label": f"{v['name']} {ln['kind'].replace('_', ' ')}", "line": ln["line"], "confidence": "exact" if ln.get("action") else "likely",
                                    "kind": "ui", "ui_kind": ln["kind"], "view": v["path"]})
                ow = member_owner.get(tg)
                if ow:
                    v["handled_by"].append(tg)
            v["handled_by"] = list(dict.fromkeys(v["handled_by"]))

    # ---------------- assemble output
    used_by: dict[str, set] = defaultdict(set)
    for t in types.values():
        for m in t["members"]:
            for c in m.get("calls", []):
                for tg in c["targets"]:
                    ow = member_owner.get(tg) or (tg if tg in types else None)
                    if ow and ow != t["full_name"]:
                        used_by[ow].add(t["full_name"])
    out_types = []
    for t in types.values():
        members = []
        for m in t["members"]:
            cb = callers.get(m["id"], [])
            uniq = list({(c["id"], c.get("kind"), c["line"]): c for c in cb}.values())
            mm = {k: v_ for k, v_ in m.items() if k not in ("facts",)}
            mm["called_by"] = [c for c in uniq if c["kind"] != "ui"][:200]
            mm["ui_callers"] = [c for c in uniq if c["kind"] == "ui"][:200]
            mm["signature"] = _signature(m)
            members.append(mm)
        out_types.append({
            "id": t["full_name"], "name": t["name"], "kind": t["kind"], "namespace": t["namespace"], "full_name": t["full_name"],
            "file": t["file"], "files": t.get("files", [t["file"]]), "line": t["line"], "layer": t["layer"], "bases": t["bases"],
            "base_types": t["base_types"], "implemented_by": implemented_by.get(t["full_name"], []), "attributes": t["attributes"],
            "modifiers": t["modifiers"], "dependencies": t.get("dependencies", []), "used_by": sorted(used_by.get(t["full_name"], set())),
            "controller": t.get("controller"), "area": t.get("area"), "markup": t.get("markup"), "outer": t["outer"], "members": members,
        })
    out_views = []
    for v in parsed_views:
        out_views.append({k: v_ for k, v_ in v.items()})
    layer_counts = defaultdict(int)
    for t in out_types:
        layer_counts[t["layer"]] += 1
    stats = {
        "files": len(cs), "view_files": len([v for v in parsed_views if v["kind"] != "script"]), "script_files": len([v for v in parsed_views if v["kind"] == "script"]),
        "types": len(out_types), "methods": sum(1 for t in out_types for m in t["members"] if m["kind"] == "method"),
        "properties": sum(1 for t in out_types for m in t["members"] if m["kind"] == "property"),
        "actions": sum(1 for t in out_types for m in t["members"] if m.get("is_action")),
        "calls_resolved": resolved_calls, "calls_external": unresolved_calls,
        "front_end_links": sum(len(v["links"]) for v in parsed_views), "links_unresolved": unresolved_links,
        "ajax_calls": sum(1 for v in parsed_views for ln in v["links"] if ln["kind"] in ("ajax", "fetch", "page_method")),
        "parse_errors": parse_errors, "layers": dict(layer_counts),
    }
    return {"types": out_types, "views": out_views, "stats": stats}


def _member(types: dict, mid: str) -> dict | None:
    owner = mid.split("(")[0].rsplit(".", 1)[0]
    t = types.get(owner)
    if not t:
        return None
    return next((m for m in t["members"] if m.get("id") == mid), None)


def _signature(m: dict) -> str:
    mods = " ".join(x for x in m.get("modifiers", []) if x in ("public", "private", "protected", "internal", "static", "async", "virtual", "override", "abstract"))
    if m["kind"] in ("method", "constructor"):
        params = ", ".join(f"{p['type']} {p['name']}" for p in m.get("params", []))
        name = "constructor" if m["kind"] == "constructor" else m["name"]
        ret = f"{m.get('return_type')} " if m.get("return_type") else ""
        return f"{mods} {ret}{name}({params})".strip()
    if m["kind"] == "property":
        acc = "; ".join(m.get("accessors", []))
        return f"{mods} {m.get('type', '')} {m['name']} {{ {acc}; }}".strip() if acc else f"{mods} {m.get('type', '')} {m['name']}".strip()
    if m["kind"] in ("field", "event"):
        return f"{mods} {m.get('type', '')} {m['name']}".strip()
    return m["name"]


# ---------------------------------------------------------------- deep doc (markdown export)

def to_markdown(name: str, index: dict) -> str:
    s = index["stats"]
    types = sorted(index["types"], key=lambda t: (LAYERS.index(t["layer"]) if t["layer"] in LAYERS else 99, t["namespace"] or "", t["name"]))
    labels = {m["id"]: f"{t['name']}.{m['name']}" for t in index["types"] for m in t["members"]}
    labels.update({t["id"]: t["name"] for t in index["types"]})
    out = [
        f"# {name}: code map", "",
        f"Generated by DevAtlas static analysis. {s['types']} types, {s['methods']} methods, {s['properties']} properties, {s['actions']} actions, "
        f"{s['view_files']} views, {s['script_files']} scripts, {s['ajax_calls']} AJAX/fetch calls.",
        "Edges are resolved without a compiler; each carries a confidence (exact, interface, likely, ambiguous).", "",
        "## Layers", "", "| Layer | Types |", "|---|---|",
    ]
    out += [f"| {k} | {v} |" for k, v in sorted(s["layers"].items(), key=lambda kv: LAYERS.index(kv[0]) if kv[0] in LAYERS else 99)]
    current = None
    for t in types:
        if t["layer"] != current:
            current = t["layer"]
            out += ["", f"## {current}"]
        out += ["", f"### {t['kind']} {t['full_name']}", "", f"- File: `{t['file']}` line {t['line']}"]
        if t["bases"]:
            out.append(f"- Inherits / implements: {', '.join(t['bases'])}")
        if t["implemented_by"]:
            out.append(f"- Implemented / extended by: {', '.join(labels.get(x, x) for x in t['implemented_by'])}")
        if t["dependencies"]:
            out.append(f"- Injected dependencies: {', '.join(labels.get(x, x) for x in t['dependencies'])}")
        if t["used_by"]:
            out.append(f"- Used by: {', '.join(labels.get(x, x) for x in t['used_by'][:30])}")
        if t.get("markup"):
            out.append(f"- Markup: `{t['markup']}`")
        props = [m for m in t["members"] if m["kind"] in ("property", "field") and "private" not in m.get("modifiers", [])]
        if props:
            out += ["", "| Property | Type |", "|---|---|"] + [f"| {m['name']} | `{m.get('type', '')}` |" for m in props]
        for m in (x for x in t["members"] if x["kind"] in ("method", "constructor")):
            out += ["", f"#### {m['name'] if m['kind'] == 'method' else 'constructor'}", "", f"`{m['signature']}`  (line {m['line']})"]
            if m.get("http"):
                out.append(f"- HTTP {', '.join(m['http']['verbs']) or 'any'} {', '.join(m['http']['routes'])}")
            for r in m.get("results", []):
                tgt = r.get("view") or r.get("target_label") or ""
                out.append(f"- Returns {r['kind'].replace('_', ' ')}: {tgt}")
            for c in m.get("ui_callers", []):
                out.append(f"- Front end: {c['label']} (`{c['view']}` line {c['line']})")
            for c in m.get("called_by", []):
                out.append(f"- Called by: {c['label']} (line {c['line']}, {c['confidence']})")
            for c in m.get("calls", []):
                if c["targets"]:
                    out.append(f"- Calls: {', '.join(labels.get(x, x) for x in c['targets'])} (line {c['line']}, {c['confidence']})")
    views = [v for v in index["views"] if v["kind"] not in ("viewimports",)]
    if views:
        out += ["", "## Views, pages and scripts"]
        for v in sorted(views, key=lambda v: v["path"]):
            out += ["", f"### {v['path']}", "", f"- Kind: {v['kind'].replace('_', ' ')}"]
            if v.get("model"):
                out.append(f"- Model: `{v['model']}`")
            if v.get("layout"):
                out.append(f"- Layout: {v.get('layout_resolved') or v['layout']}")
            if v.get("code_behind_type"):
                out.append(f"- Code-behind: {v['code_behind_type']}")
            for r in v.get("rendered_by", []):
                out.append(f"- Rendered by: {r['label']}")
            for p in v.get("partials", []):
                out.append(f"- Partial: {p.get('resolved') or p['name']}")
            for ln in v.get("links", [])[:80]:
                tgt = ", ".join(labels.get(x, x) for x in ln.get("targets", [])) or ln.get("view_target") or "unresolved"
                what = ln.get("url") or (f"{ln.get('controller') or ''}/{ln.get('action') or ''}" if ln.get("action") else ln.get("method") or ln.get("page") or "")
                out.append(f"- {ln['kind'].replace('_', ' ')} {what} (line {ln['line']}) → {tgt}")
            for e in v.get("events", []):
                out.append(f"- Event {e['control']} {e['event']} → {e['handler']}")
    return "\n".join(out) + "\n"
