/* ============================================================
   OPUS — Menu lateral (sidebar.js)
   Sistema reduzido a 2 módulos: Nota Fiscal + Boletos e Impressão
   de Pedido. Editar MENU_ITEMS abaixo para adicionar/remover páginas.
   ============================================================ */
(function () {
  "use strict";

  var MENU_ITEMS = [
    { href: "nf-boleto.html", label: "Nota Fiscal + Boletos", icon: '<path d="M6 2h9l5 5v15H6z"/><path d="M9 9h6M9 13h6M9 17h4"/>' },
    { href: "pedido.html", label: "Impressão de Pedido", icon: '<path d="M6 9V2h12v7"/><path d="M6 18H4a2 2 0 01-2-2v-5a2 2 0 012-2h16a2 2 0 012 2v5a2 2 0 01-2 2h-2"/><path d="M6 14h12v8H6z"/>' }
  ];

  var CURRENT = (location.pathname.split("/").pop() || "nf-boleto.html");

  var STYLE = "" +
  ":root{--opus-sidebar-w:220px;}" +
  "@media print{#opus-sidebar,#opus-sidebar-toggle,#opus-sidebar-overlay{display:none!important;}body.opus-has-sidebar{margin-left:0!important;}}" +
  "#opus-sidebar-toggle{position:fixed;top:14px;left:14px;z-index:1201;width:38px;height:38px;border-radius:9px;border:1.5px solid rgba(184,134,74,.3);background:#1A2B4A;color:#B8864A;display:none;align-items:center;justify-content:center;cursor:pointer;box-shadow:0 4px 14px rgba(0,0,0,.25);}" +
  "#opus-sidebar-toggle svg{width:18px;height:18px;}" +
  "#opus-sidebar-overlay{position:fixed;inset:0;background:rgba(0,0,0,.5);z-index:1199;display:none;}" +
  "#opus-sidebar-overlay.open{display:block;}" +
  "#opus-sidebar{position:fixed;top:0;left:0;bottom:0;width:var(--opus-sidebar-w);background:#1A2B4A;z-index:1200;display:flex;flex-direction:column;overflow-y:auto;box-shadow:2px 0 14px rgba(13,31,60,.25);transition:transform .25s ease;font-family:'DM Sans',sans-serif;}" +
  "#opus-sidebar .opus-brand{font-family:'Playfair Display',serif;font-style:italic;font-weight:700;font-size:16px;color:#B8864A;padding:20px 18px 14px;border-bottom:1px solid rgba(184,134,74,.18);}" +
  "#opus-sidebar .opus-close{display:none;position:absolute;top:14px;right:12px;background:transparent;border:none;color:rgba(184,134,74,.7);cursor:pointer;padding:4px;}" +
  "#opus-sidebar .opus-close svg{width:18px;height:18px;}" +
  "#opus-sidebar nav{display:flex;flex-direction:column;padding:10px;gap:3px;}" +
  "#opus-sidebar .opus-link{display:flex;align-items:center;gap:10px;padding:11px 12px;border-radius:9px;color:rgba(255,255,255,.85);text-decoration:none;font-size:12.5px;font-weight:600;}" +
  "#opus-sidebar .opus-link:hover{background:rgba(255,255,255,.06);color:#fff;}" +
  "#opus-sidebar .opus-link.active{background:rgba(184,134,74,.16);color:#B8864A;box-shadow:inset 3px 0 0 #B8864A;}" +
  "#opus-sidebar .opus-link svg{width:16px;height:16px;flex-shrink:0;opacity:.85;}" +
  "body.opus-has-sidebar{margin-left:var(--opus-sidebar-w);transition:margin-left .2s ease;}" +
  "@media (max-width:900px){" +
    "body.opus-has-sidebar{margin-left:0;}" +
    "#opus-sidebar-toggle{display:flex;}" +
    "#opus-sidebar{transform:translateX(-100%);width:min(78vw,260px)!important;}" +
    "#opus-sidebar.open{transform:translateX(0);}" +
    "#opus-sidebar .opus-close{display:block;}" +
  "}";

  function el(tag, attrs, html) {
    var e = document.createElement(tag);
    if (attrs) for (var k in attrs) e.setAttribute(k, attrs[k]);
    if (html !== undefined) e.innerHTML = html;
    return e;
  }

  function build() {
    var styleTag = document.createElement("style");
    styleTag.textContent = STYLE;
    document.head.appendChild(styleTag);

    var toggle = el("button", { id: "opus-sidebar-toggle", type: "button", "aria-label": "Abrir menu" },
      '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><line x1="3" y1="6" x2="21" y2="6"/><line x1="3" y1="12" x2="21" y2="12"/><line x1="3" y1="18" x2="21" y2="18"/></svg>');
    var overlay = el("div", { id: "opus-sidebar-overlay" });

    var sidebar = el("aside", { id: "opus-sidebar" });
    var brand = el("div", { class: "opus-brand" }, "OPUS");
    var closeBtn = el("button", { class: "opus-close", type: "button", "aria-label": "Fechar menu" },
      '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>');
    brand.appendChild(closeBtn);
    sidebar.appendChild(brand);

    var nav = el("nav");
    MENU_ITEMS.forEach(function (item) {
      var isActive = item.href === CURRENT;
      var a = el("a", { class: "opus-link" + (isActive ? " active" : ""), href: item.href },
        '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">' + item.icon + '</svg><span>' + item.label + '</span>');
      nav.appendChild(a);
    });
    sidebar.appendChild(nav);

    document.body.classList.add("opus-has-sidebar");
    document.body.appendChild(overlay);
    document.body.appendChild(sidebar);
    document.body.appendChild(toggle);

    function open() { sidebar.classList.add("open"); overlay.classList.add("open"); }
    function close() { sidebar.classList.remove("open"); overlay.classList.remove("open"); }
    toggle.addEventListener("click", function () { sidebar.classList.contains("open") ? close() : open(); });
    closeBtn.addEventListener("click", close);
    overlay.addEventListener("click", close);
    document.addEventListener("keydown", function (e) { if (e.key === "Escape") close(); });
    nav.addEventListener("click", function (e) { if (e.target.closest("a")) close(); });
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", build);
  } else {
    build();
  }
})();
