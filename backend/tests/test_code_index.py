"""Deep code map: types, members, call graph, MVC/Razor/Web Forms/JS linking."""
from code_index import build_code_index, parse_cs, to_markdown

FILES = [
    {"path": "Shop/Shop.Web/Controllers/HomeController.cs", "content": '''
using System.Web.Mvc;
using Shop.Services;
namespace Shop.Web.Controllers
{
    public class HomeController : Controller
    {
        private readonly IContactService _contacts;
        public HomeController(IContactService contacts) { _contacts = contacts; }

        public ActionResult Index() { return View(); }

        public ActionResult Contact() { ViewBag.Message = "Contact"; return View(); }

        [HttpPost]
        public ActionResult Contact(ContactForm form)
        {
            if (!ModelState.IsValid) return View(form);
            _contacts.Send(form.Email, form.Message);
            return RedirectToAction("Thanks");
        }

        public ActionResult Thanks() => View("ThankYou");

        public PartialViewResult Summary() { return PartialView("_Summary"); }
    }
}
'''},
    {"path": "Shop/Shop.Web/Controllers/OrdersApiController.cs", "content": '''
using Microsoft.AspNetCore.Mvc;
namespace Shop.Web.Controllers;
[ApiController]
[Route("api/orders")]
public class OrdersApiController : ControllerBase
{
    private readonly Shop.Data.OrderRepository _repo = new Shop.Data.OrderRepository();
    [HttpGet("{id}")]
    public IActionResult Get(int id) { var o = _repo.Find(id); return Ok(o); }
}
'''},
    {"path": "Shop/Shop.Services/ContactService.cs", "content": '''
namespace Shop.Services
{
    public interface IContactService { void Send(string email, string message); }
    public class ContactService : IContactService
    {
        private readonly ContactRepository _repo;
        public ContactService(ContactRepository repo) { _repo = repo; }
        public void Send(string email, string message) { Validate(email); _repo.Save(email, message); }
        private void Validate(string email) { }
    }
}
'''},
    {"path": "Shop/Shop.Data/ContactRepository.cs", "content": '''
namespace Shop.Data
{
    public class ContactRepository
    {
        public string ConnectionString { get; set; }
        public void Save(string email, string message) { }
    }
    public class OrderRepository { public object Find(int id) { return null; } }
}
'''},
    {"path": "Shop/Shop.Web/Models/ContactForm.cs", "content": "namespace Shop.Web.Models { public class ContactForm { public string Email { get; set; } public string Message { get; set; } } }"},
    {"path": "Shop/Shop.Web/Views/_ViewStart.cshtml", "content": '@{ Layout = "~/Views/Shared/_Layout.cshtml"; }'},
    {"path": "Shop/Shop.Web/Views/Shared/_Layout.cshtml", "content": '''<html><body>
<nav>@Html.ActionLink("Contact us", "Contact", "Home")</nav>
@RenderBody()
<script src="~/Scripts/site.js"></script>
</body></html>'''},
    {"path": "Shop/Shop.Web/Views/Home/Contact.cshtml", "content": '''@model Shop.Web.Models.ContactForm
@using (Html.BeginForm("Contact", "Home")) { <button>Send</button> }
@Html.Partial("_Summary")
<script>
  $.ajax({ type: "GET", url: '/Home/Thanks' });
  var u = '@Url.Action("Summary", "Home")';
</script>'''},
    {"path": "Shop/Shop.Web/Views/Home/_Summary.cshtml", "content": "<p>summary</p>"},
    {"path": "Shop/Shop.Web/Views/Home/ThankYou.cshtml", "content": "<p>thanks</p>"},
    {"path": "Shop/Shop.Web/Views/Home/Index.cshtml", "content": '<a asp-controller="Home" asp-action="Contact">Contact</a>'},
    {"path": "Shop/Shop.Web/Scripts/site.js", "content": "fetch('/api/orders/' + id).then(r => r.json());"},
    {"path": "Shop/Shop.Web/Scripts/jquery-3.7.1.min.js", "content": "/* vendor */"},
    {"path": "Shop/Legacy/Default.aspx", "content": '''<%@ Page Language="C#" MasterPageFile="~/Site.Master" CodeBehind="Default.aspx.cs" Inherits="Legacy.Default" %>
<asp:Button ID="btnSave" runat="server" Text="Save" OnClick="btnSave_Click" />
<script>PageMethods.GetData(1, ok);</script>'''},
    {"path": "Shop/Legacy/Site.Master", "content": '<%@ Master Language="C#" CodeBehind="Site.Master.cs" Inherits="Legacy.SiteMaster" %>'},
    {"path": "Shop/Legacy/Default.aspx.cs", "content": '''
using System.Web.Services;
namespace Legacy {
  public partial class Default : System.Web.UI.Page {
    protected void Page_Load(object sender, EventArgs e) { }
    protected void btnSave_Click(object sender, EventArgs e) { var s = new Shop.Services.ContactService(null); s.Send("a", "b"); }
    [WebMethod] public static string GetData(int id) { return ""; }
  }
}'''},
]


def _idx():
    return build_code_index(FILES)


def _type(idx, name):
    return next(t for t in idx["types"] if t["name"] == name)


def _m(t, name, n=0):
    return [m for m in t["members"] if m["name"] == name][n]


def test_parse_types_and_members():
    types = parse_cs("x.cs", FILES[2]["content"])
    assert {t["name"]: t["kind"] for t in types} == {"IContactService": "interface", "ContactService": "class"}
    svc = types[1]
    assert svc["namespace"] == "Shop.Services" and svc["bases"] == ["IContactService"]
    assert [m["name"] for m in svc["members"] if m["kind"] == "method"] == ["Send", "Validate"]


def test_layers():
    idx = _idx()
    layers = {t["name"]: t["layer"] for t in idx["types"]}
    assert layers["HomeController"] == "Controller" and layers["OrdersApiController"] == "Controller"
    assert layers["IContactService"] == "Interface" and layers["ContactService"] == "Service"
    assert layers["ContactRepository"] == "DAL" and layers["ContactForm"] == "Model" and layers["Default"] == "Web Forms page"


def test_call_graph_through_interface_and_fields():
    idx = _idx()
    home = _type(idx, "HomeController")
    post = _m(home, "Contact", 1)
    send_call = next(c for c in post["calls"] if c["label"] == "_contacts.Send()")
    assert send_call["confidence"] == "interface"
    assert "Shop.Services.ContactService.Send(string,string)" in send_call["targets"]
    svc = _type(idx, "ContactService")
    send = _m(svc, "Send")
    assert any(c["label"] == "HomeController.Contact" for c in send["called_by"])
    assert any(c["label"] == "Default.btnSave_Click" for c in send["called_by"])
    assert any("ContactRepository.Save" in t for c in send["calls"] for t in c["targets"])
    assert any(c["label"] == "ContactService.Send" for c in _m(svc, "Validate")["called_by"])
    assert home["dependencies"] == ["Shop.Services.IContactService"]
    assert "Shop.Web.Controllers.HomeController" in _type(idx, "IContactService")["used_by"]


def test_actions_views_and_redirects():
    idx = _idx()
    home = _type(idx, "HomeController")
    get = _m(home, "Contact", 0)
    assert get["is_action"] and get["results"][0]["view"] == "Shop/Shop.Web/Views/Home/Contact.cshtml"
    post = _m(home, "Contact", 1)
    redirect = next(r for r in post["results"] if r["kind"] == "redirect_action")
    assert redirect["targets"] == ["Shop.Web.Controllers.HomeController.Thanks()"]
    assert _m(home, "Thanks")["results"][0]["view"].endswith("Views/Home/ThankYou.cshtml")
    assert _m(home, "Summary")["results"][0]["view"].endswith("Views/Home/_Summary.cshtml")
    assert any(c["kind"] == "redirect" for c in _m(home, "Thanks")["called_by"])


def test_front_end_callers():
    idx = _idx()
    home = _type(idx, "HomeController")
    contact_ui = {(c["ui_kind"], c["view"].rsplit("/", 1)[-1]) for c in _m(home, "Contact", 0)["ui_callers"] + _m(home, "Contact", 1)["ui_callers"]}
    assert ("actionlink", "_Layout.cshtml") in contact_ui
    assert ("form", "Contact.cshtml") in contact_ui
    assert ("tag_helper", "Index.cshtml") in contact_ui
    form_targets = next(ln for v in idx["views"] if v["name"] == "Contact.cshtml" for ln in v["links"] if ln["kind"] == "form")["targets"]
    assert form_targets == ["Shop.Web.Controllers.HomeController.Contact(ContactForm)"]  # form prefers the [HttpPost] overload
    assert any(c["ui_kind"] == "ajax" for c in _m(home, "Thanks")["ui_callers"])
    assert any(c["ui_kind"] == "ajax" for c in _m(home, "Summary")["ui_callers"])
    api = _type(idx, "OrdersApiController")
    assert _m(api, "Get")["http"]["routes"] == ["/api/orders/{id}"]
    assert any(c["ui_kind"] == "fetch" and c["view"].endswith("site.js") for c in _m(api, "Get")["ui_callers"])


def test_layouts_and_partials():
    idx = _idx()
    views = {v["name"]: v for v in idx["views"]}
    assert views["Contact.cshtml"]["layout_resolved"] == "Shop/Shop.Web/Views/Shared/_Layout.cshtml"
    assert views["Contact.cshtml"]["model"] == "Shop.Web.Models.ContactForm"
    assert views["_Summary.cshtml"]["used_as_partial_by"][0]["path"].endswith("Contact.cshtml")
    assert "Shop/Shop.Web/Views/Home/Contact.cshtml" in views["_Layout.cshtml"]["used_as_layout_by"]


def test_web_forms():
    idx = _idx()
    page = _type(idx, "Default")
    assert page["markup"] == "Shop/Legacy/Default.aspx"
    assert any(c["ui_kind"] == "event" for c in _m(page, "btnSave_Click")["ui_callers"])
    assert any(c["ui_kind"] == "lifecycle" for c in _m(page, "Page_Load")["ui_callers"])
    assert any(c["ui_kind"] == "page_method" for c in _m(page, "GetData")["ui_callers"])
    aspx = next(v for v in idx["views"] if v["name"] == "Default.aspx")
    assert aspx["layout_resolved"] == "Shop/Legacy/Site.Master"


def test_stats_and_markdown():
    idx = _idx()
    s = idx["stats"]
    assert s["types"] == 8 and s["actions"] == 6 and s["ajax_calls"] >= 3
    md = to_markdown("Shop", idx)
    assert "### class Shop.Web.Controllers.HomeController" in md and "Front end:" in md and "Called by:" in md
    assert "{ return" not in md  # bodies are never exported


def test_code_map_api(client, maintainer, member):
    from test_code_index import FILES as CODE
    files = CODE + [{"path": "Shop/Shop.sln", "content": "sln"}, {"path": "Shop/Shop.Web/Shop.Web.csproj", "content": '<Project Sdk="Microsoft.NET.Sdk.Web"><PropertyGroup><TargetFramework>net8.0</TargetFramework></PropertyGroup></Project>'}]
    r = client.post("/api/ingest", json={"files": files}, headers=maintainer["headers"])
    assert r.status_code == 200, r.text
    code = r.json()["code"]
    assert code["codebase"] == "shop" and code["actions"] == 6
    h = member["headers"]
    ov = client.get("/api/projects/shop-web/code", headers=h).json()
    assert ov["stats"]["types"] == 8 and any(t["name"] == "HomeController" and t["actions"] == 5 for t in ov["types"])
    t = client.get("/api/projects/shop-web/code/type", params={"id": "Shop.Web.Controllers.HomeController"}, headers=h).json()
    assert any(m["name"] == "Contact" and m["ui_callers"] for m in t["members"])
    v = client.get("/api/projects/shop-web/code/view", params={"path": "Shop/Shop.Web/Views/Home/Contact.cshtml"}, headers=h).json()
    assert v["layout_resolved"].endswith("_Layout.cshtml") and v["rendered_by"]
    hits = client.get("/api/projects/shop-web/code/search", params={"q": "Contact"}, headers=h).json()
    assert any(x["label"] == "HomeController.Contact" for x in hits)
    md = client.get("/api/projects/shop-web/code/export.md", headers=h)
    assert md.status_code == 200 and "attachment" in md.headers["content-disposition"] and "## Controller" in md.text
    assert client.get("/api/projects/atlas-core/code", headers=h).status_code == 404
    art = client.get("/api/articles/shop-code-map", headers=h).json()
    assert "Controllers, actions and views" in art["source_md"]
