/* ============================================================
   OPUS — Menu lateral compartilhado (sidebar.js)
   Injeta um menu lateral único, responsivo (mobile = gaveta),
   em todas as páginas que incluem este script.
   Edite a lista MENU_ITEMS abaixo para adicionar/remover páginas.
   ============================================================ */
(function () {
  "use strict";

  var MENU_GROUPS = [
    { titulo: "Geral", itens: [
      { href: "index.html", label: "Início", icon: '<path d="M3 9l9-7 9 7v11a2 2 0 01-2 2H5a2 2 0 01-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/>' },
      { href: "calendario.html", label: "Calendário", icon: '<rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/>' }
    ]},
    { titulo: "Produção", itens: [
      { href: "apontamento.html", label: "Produtividade", icon: '<path d="M9 11l3 3L22 4"/><path d="M21 12v7a2 2 0 01-2 2H5a2 2 0 01-2-2V5a2 2 0 012-2h11"/>' },
      { href: "programacao.html", label: "Programação da Produção", icon: '<rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/>' },
      { href: "simulador-producao.html", label: "Simulador de Programação", icon: '<line x1="4" y1="21" x2="4" y2="14"/><line x1="4" y1="10" x2="4" y2="3"/><line x1="12" y1="21" x2="12" y2="12"/><line x1="12" y1="8" x2="12" y2="3"/><line x1="20" y1="21" x2="20" y2="16"/><line x1="20" y1="12" x2="20" y2="3"/>' },
      { href: "fechamento-op.html", label: "Fechamento de OP", icon: '<rect x="3" y="3" width="18" height="18" rx="2"/><path d="M9 9h6M9 12h6M9 15h4"/>' }
    ]},
    { titulo: "Logística & Entregas", itens: [
      { href: "simulador.html", label: "Simulador de Frete", icon: '<path d="M1 3h15v13H1zM16 8h4l3 3v5h-7z"/><circle cx="5.5" cy="18.5" r="2.5"/><circle cx="18.5" cy="18.5" r="2.5"/>' },
      { href: "farol.html", label: "Farol de Entregas", icon: '<line x1="12" y1="2" x2="12" y2="4"/><path d="M9 4h6l1 4H8L9 4z"/><path d="M8 8l-1 8h10l-1-8"/>' },
      { href: "torre.html", label: "Torre de Controle", icon: '<circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="3"/>' },
      { href: "roteirizador.html", label: "Roteirização", icon: '<path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7z"/><circle cx="12" cy="9" r="2.5"/>' },
      { href: "separacao.html", label: "Separação & Carregamento", icon: '<path d="M21 8V5a2 2 0 00-2-2H5a2 2 0 00-2 2v3"/><path d="M3 8h18l-1.5 11a2 2 0 01-2 1.8H6.5a2 2 0 01-2-1.8z"/>' },
      { href: "carregamento.html", label: "Carregamento", icon: '<rect x="1" y="7" width="15" height="10" rx="1"/><path d="M16 10h3l3 3v4h-6z"/><circle cx="5.5" cy="19.5" r="1.6"/><circle cx="17.5" cy="19.5" r="1.6"/>' },
      { href: "despacho.html", label: "Despacho", icon: '<path d="M3 3h11v10H3zM14 8h4l3 3v2h-7z"/><circle cx="6.5" cy="18.5" r="1.8"/><circle cx="17" cy="18.5" r="1.8"/>' },
      { href: "motorista.html", label: "Entregas / Motorista", icon: '<rect x="1" y="7" width="15" height="10" rx="1"/><path d="M16 10h3l3 3v4h-6z"/><circle cx="5.5" cy="19.5" r="1.6"/><circle cx="17.5" cy="19.5" r="1.6"/>' }
    ]},
    { titulo: "Comercial", itens: [
      { href: "carteira.html", label: "Carteira de Pedidos", icon: '<path d="M20 7H4a2 2 0 00-2 2v9a2 2 0 002 2h16a2 2 0 002-2V9a2 2 0 00-2-2z"/><path d="M16 7V5a2 2 0 00-2-2h-4a2 2 0 00-2 2v2"/><line x1="8" y1="12" x2="16" y2="12"/>' },
      { href: "notas-fiscais.html", label: "Notas Fiscais", icon: '<path d="M6 2h9l5 5v15H6z"/><path d="M9 9h6M9 13h6M9 17h4"/>' },
      { href: "anexos.html", label: "Anexos do Pedido", icon: '<path d="M21 8.5l-9 9a4 4 0 01-6-6l9-9a3 3 0 014 4l-8.5 8.5a2 2 0 01-3-3L15 4"/>' },
      { href: "anexo-ar.html", label: "Anexar AR", icon: '<path d="M21 8.5l-9 9a4 4 0 01-6-6l9-9a3 3 0 014 4l-8.5 8.5a2 2 0 01-3-3L15 4"/>' },
      { href: "termos.html", label: "Termos de Transporte", icon: '<path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="9" y1="13" x2="15" y2="13"/><line x1="9" y1="17" x2="15" y2="17"/>' }
    ]},
    { titulo: "Estoque", itens: [
      { href: "estoque.html", label: "Estoque", icon: '<line x1="2" y1="17" x2="18" y2="17"/><path d="M4 17V7h8v10"/><path d="M12 10h4l2 4v3h-6V10z"/><circle cx="6" cy="19.5" r="1.5"/><circle cx="15" cy="19.5" r="1.5"/>' },
      { href: "estoque-omie.html", label: "Estoque OMIE", icon: '<line x1="2" y1="17" x2="18" y2="17"/><path d="M4 17V7h8v10"/><path d="M12 10h4l2 4v3h-6V10z"/>' },
      { href: "comercial.html", label: "Estoque Comercial", icon: '<path d="M3 3h18v4H3zM5 7v13h14V7"/><path d="M9 12h6"/>' }
    ]},
    { titulo: "Conta", itens: [
      { href: "usuarios.html", label: "Usuários", icon: '<path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 00-3-3.87"/><path d="M16 3.13a4 4 0 010 7.75"/>' },
      { href: "trocar-senha.html", label: "Trocar Senha", icon: '<rect x="3" y="11" width="18" height="10" rx="2"/><path d="M7 11V7a5 5 0 0110 0v4"/>' }
    ]}
  ];

  var CURRENT = (location.pathname.split("/").pop() || "index.html");

  var STYLE = "" +
  ":root{--opus-sidebar-w:230px;--opus-sidebar-w-collapsed:64px;--opus-navy:#0d1f3c;--opus-navy2:#0a1728;--opus-gold:#e8c96a;--opus-gold2:#b8902a;}" +
  "#opus-sidebar-toggle{position:fixed;top:12px;left:12px;z-index:1201;width:42px;height:42px;border-radius:10px;border:1px solid rgba(232,201,106,.35);background:var(--opus-navy);color:#e8c96a;display:none;align-items:center;justify-content:center;cursor:pointer;box-shadow:0 4px 16px rgba(0,0,0,.4);}" +
  "#opus-sidebar-toggle svg{width:20px;height:20px;}" +
  "#opus-sidebar-overlay{position:fixed;inset:0;background:rgba(0,0,0,.55);z-index:1199;display:none;}" +
  "#opus-sidebar-overlay.open{display:block;}" +
  "#opus-sidebar{position:fixed;top:0;left:0;bottom:0;width:var(--opus-sidebar-w);background:linear-gradient(180deg,var(--opus-navy) 0%,var(--opus-navy2) 100%);border-right:2px solid var(--opus-gold2);z-index:1200;display:flex;flex-direction:column;overflow-y:auto;overflow-x:hidden;box-shadow:2px 0 16px rgba(13,31,60,.35);transition:transform .25s ease,width .2s ease;}" +
  "#opus-sidebar::-webkit-scrollbar{width:6px;}#opus-sidebar::-webkit-scrollbar-thumb{background:rgba(232,201,106,.3);border-radius:3px;}" +
  "#opus-sidebar .opus-brand{font-family:'Playfair Display',Georgia,serif;font-style:italic;font-weight:700;font-size:16px;color:var(--opus-gold);padding:18px 18px 14px;border-bottom:1px solid rgba(232,201,106,.18);display:flex;flex-direction:column;gap:2px;flex-shrink:0;white-space:nowrap;}" +
  "#opus-sidebar .opus-brand small{font-family:'Inter',sans-serif;font-style:normal;font-size:9px;font-weight:800;letter-spacing:.22em;text-transform:uppercase;color:#fff;}" +
  "#opus-sidebar .opus-brand-logo{display:none;width:30px;height:30px;border-radius:7px;object-fit:cover;margin:0 auto;}" +
  "#opus-sidebar .opus-close{display:none;position:absolute;top:14px;right:12px;background:transparent;border:none;color:#9fb0c9;cursor:pointer;padding:4px;}" +
  "#opus-sidebar .opus-close svg{width:18px;height:18px;}" +
  "#opus-sidebar nav{display:flex;flex-direction:column;padding:8px;gap:2px;}" +
  "#opus-sidebar .opus-group-title{margin:12px 0 4px;padding:0 12px;font-size:9.5px;font-weight:800;letter-spacing:.16em;text-transform:uppercase;text-align:left;color:rgba(232,201,106,.55);white-space:nowrap;}" +
  "#opus-sidebar nav>.opus-group-title:first-child{margin-top:4px;}" +
  "#opus-sidebar .opus-link,#opus-sidebar .opus-link:visited{display:flex;align-items:center;justify-content:flex-start;gap:10px;padding:10px 12px;border-radius:8px;color:rgba(255,255,255,.82)!important;text-decoration:none;font-size:12px;font-weight:700;letter-spacing:.01em;background:transparent;border:none;text-align:left;cursor:pointer;font-family:inherit;white-space:nowrap;line-height:1.25;min-width:0;}" +
  "#opus-sidebar .opus-link span{overflow:hidden;text-overflow:ellipsis;white-space:nowrap;min-width:0;}" +
  "#opus-sidebar .opus-link:hover,#opus-sidebar .opus-link:visited:hover{background:rgba(255,255,255,.07);color:#fff!important;}" +
  "#opus-sidebar .opus-link.active,#opus-sidebar .opus-link.active:visited{background:rgba(184,144,42,.16);color:var(--opus-gold)!important;box-shadow:inset 3px 0 0 var(--opus-gold2);}" +
  "#opus-sidebar .opus-link svg{width:16px;height:16px;flex-shrink:0;opacity:.8;}" +
  "#opus-sidebar .opus-link.active svg{opacity:1;}" +
  "#opus-collapse-toggle{position:absolute;top:16px;right:10px;display:flex;align-items:center;justify-content:center;width:24px;height:24px;padding:0;border-radius:6px;border:none;background:transparent;color:#9fb0c9;cursor:pointer;font-family:inherit;flex-shrink:0;}" +
  "#opus-collapse-toggle:hover{background:rgba(255,255,255,.08);color:#fff;}" +
  "#opus-collapse-toggle svg{width:15px;height:15px;flex-shrink:0;transition:transform .2s ease;}" +
  "body.opus-has-sidebar{margin-left:var(--opus-sidebar-w);width:calc(100% - var(--opus-sidebar-w));transition:margin-left .2s ease,width .2s ease;}" +
  "body.opus-sidebar-collapsed{margin-left:var(--opus-sidebar-w-collapsed);width:calc(100% - var(--opus-sidebar-w-collapsed));}" +
  "#opus-sidebar.opus-collapsed{width:var(--opus-sidebar-w-collapsed);}" +
  "#opus-sidebar.opus-collapsed .opus-brand small,#opus-sidebar.opus-collapsed .opus-brand{font-size:0;padding-left:0;padding-right:0;text-align:center;}" +
  "#opus-sidebar.opus-collapsed .opus-brand-logo{display:block;}" +
  "#opus-sidebar.opus-collapsed .opus-group-title{display:none;}" +
  "#opus-sidebar.opus-collapsed .opus-link{justify-content:center;padding:10px;}" +
  "#opus-sidebar.opus-collapsed .opus-link span{display:none;}" +
  "#opus-sidebar.opus-collapsed #opus-collapse-toggle{right:50%;transform:translateX(50%);top:54px;}" +
  "#opus-sidebar.opus-collapsed #opus-collapse-toggle svg{transform:rotate(180deg);}" +
  "@media (max-width:900px){" +
    "body.opus-has-sidebar{margin-left:0;width:100%;}" +
    "body.opus-sidebar-collapsed{margin-left:0;width:100%;}" +
    "#opus-sidebar-toggle{display:flex;}" +
    "#opus-sidebar{transform:translateX(-100%);width:min(78vw,280px)!important;}" +
    "#opus-sidebar.open{transform:translateX(0);}" +
    "#opus-sidebar .opus-close{display:block;}" +
    "#opus-sidebar.opus-collapsed .opus-brand,#opus-sidebar.opus-collapsed .opus-link{font-size:inherit;}" +
    "#opus-sidebar.opus-collapsed .opus-brand-logo{display:none;}" +
    "#opus-sidebar.opus-collapsed .opus-link{justify-content:flex-start;padding:10px 12px;}" +
    "#opus-sidebar.opus-collapsed .opus-link span{display:inline;}" +
    "#opus-collapse-toggle{display:none;}" +
    "body.opus-has-sidebar{padding-top:56px;}" +
  "}";

  function el(tag, attrs, html) {
    var e = document.createElement(tag);
    if (attrs) for (var k in attrs) e.setAttribute(k, attrs[k]);
    if (html !== undefined) e.innerHTML = html;
    return e;
  }

  function build() {
    // estilo
    var styleTag = document.createElement("style");
    styleTag.id = "opus-sidebar-style";
    styleTag.textContent = STYLE;
    document.head.appendChild(styleTag);

    // botão hamburguer (mobile)
    var toggle = el("button", { id: "opus-sidebar-toggle", type: "button", "aria-label": "Abrir menu" },
      '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><line x1="3" y1="6" x2="21" y2="6"/><line x1="3" y1="12" x2="21" y2="12"/><line x1="3" y1="18" x2="21" y2="18"/></svg>');

    // overlay (mobile)
    var overlay = el("div", { id: "opus-sidebar-overlay" });

    // sidebar
    var sidebar = el("aside", { id: "opus-sidebar" });
    var brand = el("div", { class: "opus-brand" }, '<img class="opus-brand-logo" src="/logo-gmf.png" alt="Grupo MF Paris">Grupo MF Paris<small>OPUS</small>');
    var closeBtn = el("button", { class: "opus-close", type: "button", "aria-label": "Fechar menu" },
      '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>');
    brand.appendChild(closeBtn);
    sidebar.appendChild(brand);

    // recolher/expandir (desktop) — botão minimalista, só a seta, no topo
    var collapseBtn = el("button", { id: "opus-collapse-toggle", type: "button", "aria-label": "Recolher menu" },
      '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="15 18 9 12 15 6"/></svg>');
    sidebar.appendChild(collapseBtn);

    var nav = el("nav");
    MENU_GROUPS.forEach(function (group) {
      var title = el("div", { class: "opus-group-title" }, group.titulo);
      nav.appendChild(title);
      group.itens.forEach(function (item) {
        var isActive = item.href === CURRENT;
        var a = el("a", {
          class: "opus-link" + (isActive ? " active" : ""),
          href: item.href,
          title: item.label
        }, '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">' + item.icon + '</svg><span>' + item.label + '</span>');
        if (isActive) a.setAttribute("aria-current", "page");
        nav.appendChild(a);
      });
    });
    sidebar.appendChild(nav);

    document.body.classList.add("opus-has-sidebar");
    document.body.appendChild(overlay);
    document.body.appendChild(sidebar);
    document.body.appendChild(toggle);

    function open() { sidebar.classList.add("open"); overlay.classList.add("open"); toggle.setAttribute("aria-expanded", "true"); }
    function close() { sidebar.classList.remove("open"); overlay.classList.remove("open"); toggle.setAttribute("aria-expanded", "false"); }

    toggle.addEventListener("click", function () {
      sidebar.classList.contains("open") ? close() : open();
    });
    closeBtn.addEventListener("click", close);
    overlay.addEventListener("click", close);
    document.addEventListener("keydown", function (e) {
      if (e.key === "Escape") close();
    });
    // fecha ao navegar (mobile)
    nav.addEventListener("click", function (e) {
      if (e.target.closest("a")) close();
    });

    // recolher/expandir (desktop), com preferência salva
    function applyCollapsed(collapsed) {
      sidebar.classList.toggle("opus-collapsed", collapsed);
      document.body.classList.toggle("opus-sidebar-collapsed", collapsed);
      collapseBtn.setAttribute("aria-expanded", String(!collapsed));
      collapseBtn.setAttribute("aria-label", collapsed ? "Expandir menu" : "Recolher menu");
      setTimeout(function () {
        window.dispatchEvent(new CustomEvent("opus-sidebar-toggle", { detail: { collapsed: collapsed } }));
      }, 210);
    }
    var savedCollapsed = localStorage.getItem("opus-sidebar-collapsed") === "1";
    applyCollapsed(savedCollapsed);
    collapseBtn.addEventListener("click", function (e) {
      e.stopPropagation();
      var next = !sidebar.classList.contains("opus-collapsed");
      applyCollapsed(next);
      localStorage.setItem("opus-sidebar-collapsed", next ? "1" : "0");
    });

    // desktop: clicar fora do menu expandido recolhe automaticamente
    var isDesktop = window.matchMedia("(min-width:901px)");
    document.addEventListener("click", function (e) {
      if (!isDesktop.matches) return;
      if (sidebar.classList.contains("opus-collapsed")) return;
      if (sidebar.contains(e.target)) return;
      applyCollapsed(true);
      localStorage.setItem("opus-sidebar-collapsed", "1");
    });
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", build);
  } else {
    build();
  }
})();
