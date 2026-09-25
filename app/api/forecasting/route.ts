import { NextRequest, NextResponse } from "next/server";
import petaProvinsi from "@/public/data/peta-provinsi.json";
import { inferPulau } from "@/lib/wilayah";
import { PUSAT_WILAYAH } from "@/lib/pusat-wilayah";

// Pemetaan nama provinsi ke pulau
const PROVINSI_PULAU: Record<string, string> = {};
for (const feature of petaProvinsi.features) {
  const nama = feature.properties.nama;
  const pulau = inferPulau(nama);
  if (pulau) PROVINSI_PULAU[nama] = pulau;
}

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);

  // 1. Parse lat, lon, and zoom query parameters strictly using Number.parseFloat()
  const rawLat = Number.parseFloat(searchParams.get("lat") ?? "");
  const rawLon = Number.parseFloat(searchParams.get("lon") ?? "");
  const rawZoom = Number.parseFloat(searchParams.get("zoom") ?? "");

  // 2 & 3. Enforce strict geographic boundaries for Indonesia and safe defaults on NaN / non-finite values
  const safeLat = Number.isNaN(rawLat) || !Number.isFinite(rawLat)
    ? 0.200
    : Math.min(Math.max(rawLat, -15.0), 15.0);
  const safeLon = Number.isNaN(rawLon) || !Number.isFinite(rawLon)
    ? 118.000
    : Math.min(Math.max(rawLon, 90.0), 145.0);
  const safeZoom = Number.isNaN(rawZoom) || !Number.isFinite(rawZoom)
    ? 5.0
    : Math.min(Math.max(rawZoom, 2.0), 18.0);

  const lat = safeLat.toFixed(3);
  const lon = safeLon.toFixed(3);
  // Dua desimal: konsol /peta mengirim zoom pecahan hasil cameraForBounds
  // lapisan Aerosol, dan pembulatan ke satu desimal sudah menggeser Papua.
  const zoom = safeZoom.toFixed(2);
  // Konsol /peta: halamannya tak menggulir, jadi roda tetikus memperbesar
  // peta seperti lapisan Aerosol, bukan diteruskan ke guliran halaman.
  const konsol = searchParams.get("konsol") === "1";
  // Landing karhutla: tombol bentang selayar dipasang di tumpukan zoom iframe
  // — kliknya mengirim BUKA_SELAYAR ke halaman induk lewat postMessage.
  const bentang = searchParams.get("bentang") === "1";
  // ringkas: legendaRingkas aktif (bingkai sempit / panggung dasbor)
  const ringkas = searchParams.get("ringkas") === "1";
  // Tema terang / gelap (disinkronkan dengan tema aktif situs)
  const temaAwal = searchParams.get("tema") === "light" ? "light" : "dark";
  // Kontrol zoom ditaruh di top 16px bila ada tombol bentang selayar di atasnya
  // atau saat mode ringkas aktif tanpa modal selayar. Saat di modal selayar (!bentang && !ringkas),
  // tombol tutup selayar (X) menempati top 16px, sehingga tumpukan zoom mulai di top 80px (sama persis dengan PetaAsap).
  const topControls = bentang || ringkas ? "16px" : "80px";
  // Dibangun di sisi server (bukan backtick bersarang di dalam template skrip)
  // dan disisipkan sebagai anak pertama tumpukan — sama seperti posisi tombol
  // bentang di tumpukan kendali lapisan Aerosol (PetaAsap).
  const tombolBentang = bentang
    ? '<button id="btn-bentang" type="button" aria-label="Buka peta selayar" title="Buka peta selayar"><svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"><path d="M9 4H4v5M15 4h5v5M9 20H4v-5M15 20h5v-5" /></svg></button>'
    : "";

  // Router Windy hanya mengenali zoom bulat di URL — zoom pecahan membuatnya
  // membuang seluruh posisi dan jatuh ke lokasi GeoIP. Pecahannya diterapkan
  // belakangan lewat setView (ZOOM_AWAL di skrip).
  const zoomUrl = Math.round(safeZoom);

  const targetUrl = `https://www.windy.com/-Air-quality-index-aqi?cams,aqi,${lat},${lon},${zoomUrl}`;

  try {
    const resWindy = await fetch(targetUrl, {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        "Accept-Language": "en-US,en;q=0.9",
      },
      cache: "no-store",
    });

    if (!resWindy.ok) {
      return new NextResponse(`Windy upstream error: ${resWindy.statusText}`, { status: 502 });
    }

    const html = await resWindy.text();

    const baseTag = `<base href="https://www.windy.com/">`;

    // 1. Script injected at the VERY TOP of <head> before Windy's scripts execute
    const preInitScript = `
      <script>
        (function() {
          // 0. Spoof document.referrer to bypass iframe unlegal embed check
          try {
            Object.defineProperty(document, 'referrer', {
              get: function() { return 'https://www.windy.com/'; },
              configurable: true
            });
          } catch(e) {}
          try {
            Object.defineProperty(Document.prototype, 'referrer', {
              get: function() { return 'https://www.windy.com/'; },
              configurable: true
            });
          } catch(e) {}

          // 0b. Bungkam telemetri/analitik Windy (/ga/) dan endpoint privat
          // (account.windy.com, capalerts). Endpoint /forecast/fragment/ dibiarkan
          // lolos karena mendukung CORS publik dan menyediakan data weather .now.temperature.
          var _windyBungkam = function(u) {
            try { u = String(u); } catch(e) { return false; }
            return (u.indexOf('node.windy.com') !== -1 && (u.indexOf('/ga/') !== -1 || u.indexOf('/capalerts/') !== -1)) ||
                   (u.indexOf('account.windy.com') !== -1);
          };
          try {
            var _fetchAsli = window.fetch;
            window.fetch = function(input, init) {
              var url = (input && typeof input === 'object' && input.url) ? input.url : input;
              if (_windyBungkam(url)) {
                var urlStr = String(url);
                var isJson = urlStr.indexOf('account.windy.com') !== -1 || urlStr.indexOf('/capalerts/') !== -1;
                return Promise.resolve(new Response(isJson ? '{}' : null, {
                  status: 200,
                  statusText: 'OK',
                  headers: isJson ? { 'Content-Type': 'application/json' } : {}
                }));
              }
              return _fetchAsli.apply(this, arguments);
            };
          } catch(e) {}
          try {
            var _xhrOpen = XMLHttpRequest.prototype.open;
            XMLHttpRequest.prototype.open = function(method, url) {
              this.__windyBungkam = _windyBungkam(url);
              var urlStr = String(url);
              this.__windyIsJson = urlStr.indexOf('account.windy.com') !== -1 || urlStr.indexOf('/capalerts/') !== -1;
              return _xhrOpen.apply(this, arguments);
            };
            var _xhrSend = XMLHttpRequest.prototype.send;
            XMLHttpRequest.prototype.send = function() {
              if (this.__windyBungkam) {
                var diri = this;
                setTimeout(function() {
                  try {
                    Object.defineProperty(diri, 'readyState', { value: 4, writable: false });
                    Object.defineProperty(diri, 'status', { value: 200, writable: false });
                    Object.defineProperty(diri, 'statusText', { value: 'OK', writable: false });
                    var resPayload = diri.__windyIsJson ? '{"alerts":[],"result":"ok"}' : '';
                    Object.defineProperty(diri, 'responseText', { value: resPayload, writable: false });
                    Object.defineProperty(diri, 'response', { value: resPayload, writable: false });
                  } catch(e) {}
                  try { if (typeof diri.onreadystatechange === 'function') diri.onreadystatechange(); } catch(e) {}
                  try { diri.dispatchEvent(new Event('readystatechange')); } catch(e) {}
                  try { diri.dispatchEvent(new Event('load')); } catch(e) {}
                  try { diri.dispatchEvent(new Event('loadend')); } catch(e) {}
                }, 0);
                return;
              }
              return _xhrSend.apply(this, arguments);
            };
          } catch(e) {}
          try {
            if (navigator.sendBeacon) {
              var _beaconAsli = navigator.sendBeacon.bind(navigator);
              navigator.sendBeacon = function(url, data) {
                if (_windyBungkam(url)) return true;
                return _beaconAsli(url, data);
              };
            }
          } catch(e) {}
          // Jaring pengaman: telan sisa rejection "Failed to fetch" di dalam
          // iframe peta (konteks ini hanya Windy + skrip peta kita).
          window.addEventListener('unhandledrejection', function(ev) {
            try {
              var m = ev && ev.reason && (ev.reason.message || String(ev.reason));
              if (m && m.indexOf('Failed to fetch') !== -1) { ev.preventDefault(); }
            } catch(e) {}
          });

          // A. Wrap history methods to prevent cross-origin SecurityError caused by <base href>
          var _docOrigin = window.location.origin;
          var _origReplace = window.history.replaceState;
          window.history.replaceState = function(state, title, url) {
            try {
              if (typeof url === 'string' && !url.startsWith('http://') && !url.startsWith('https://')) {
                url = _docOrigin + (url.startsWith('/') ? url : '/' + url);
              }
              return _origReplace.call(window.history, state, title, url);
            } catch(e) {}
          };
          var _origPush = window.history.pushState;
          window.history.pushState = function(state, title, url) {
            try {
              if (typeof url === 'string' && !url.startsWith('http://') && !url.startsWith('https://')) {
                url = _docOrigin + (url.startsWith('/') ? url : '/' + url);
              }
              return _origPush.call(window.history, state, title, url);
            } catch(e) {}
          };

          // B. Pre-seed URL path & search before router parses window.location
          var targetPath = '/-Air-quality-index-aqi';
          var targetSearch = '?cams,aqi,${lat},${lon},${zoomUrl}';
          try {
            if (!window.location.pathname.includes('Air-quality-index') || !window.location.search.includes('aqi')) {
              window.history.replaceState(null, '', _docOrigin + targetPath + targetSearch);
            }
          } catch(e) {}

          // C. Pre-seed localStorage
          try {
            window.localStorage.setItem('startUpOverlay', JSON.stringify('aqi'));
            window.localStorage.setItem('startUpLastOverlay', JSON.stringify(true));
            window.localStorage.setItem('startUpLastProduct', JSON.stringify('cams'));
            window.localStorage.setItem('product', JSON.stringify('cams'));
            window.localStorage.setItem('overlay', JSON.stringify('aqi'));
          } catch(e) {}

          // D. Hook window.W.broadcast to BLOCK unwanted plugins from ever opening
          window.W = window.W || {};
          var _b = null;
          Object.defineProperty(window.W, 'broadcast', {
            configurable: true,
            enumerable: true,
            get: function() { return _b; },
            set: function(b) {
              _b = b;
              if (b && typeof b.emit === 'function') {
                var origEmit = b.emit;
                var blocked = {
                  'rhpane-top': true,
                  'progress-bar': true,
                  'search-input': true,
                  'startup-weather': true,
                  'startup-promos': true,
                  'startup-articles': true,
                  'startup-live-alerts': true,
                  'startup-pin2hp': true,
                  'onboarding': true,
                  'detail': true,
                  'default-model-selector': true,
                  'picker': true,
                  'picker-mobile': true,
                  'mobile-ui': true,
                  'menu': true,
                  'tools': true,
                  'share': true,
                  'articles': true,
                  'warnings': true
                };
                b.emit = function(event, name) {
                  if (event === 'rqstOpen' && blocked[name]) {
                    return false;
                  }
                  return origEmit.apply(this, arguments);
                };
                b.fire = b.emit;
                b.trigger = b.emit;
              }
            }
          });

          // E. Hook window.W.store safely to seed cams & aqi on boot and prevent desync
          var _s = null;
          Object.defineProperty(window.W, 'store', {
            configurable: true,
            enumerable: true,
            get: function() { return _s; },
            set: function(s) {
              _s = s;
              if (s && typeof s.set === 'function') {
                try {
                  s.set('product', 'cams');
                  s.set('overlay', 'aqi');
                } catch (e) {}

                // Pantau bila product ter-reset kembali ke ecmwf saat overlay adalah aqi:
                // paksa seketika kembali ke cams agar tile AQI tidak 404 / hitam.
                if (typeof s.on === 'function') {
                  try {
                    s.on('product', function(p) {
                      if (p !== 'cams' && s.get('overlay') === 'aqi') {
                        setTimeout(function() {
                          try { s.set('product', 'cams'); } catch (e) {}
                        }, 0);
                      }
                    });
                  } catch (e) {}
                }
              }
            }
          });

          // F. Disable context menu / right click completely
          window.addEventListener('contextmenu', function(e) {
            e.preventDefault();
            e.stopPropagation();
            return false;
          }, true);
          document.addEventListener('contextmenu', function(e) {
            e.preventDefault();
            e.stopPropagation();
            return false;
          }, true);
        })();
      </script>
    `;

    // 2. Custom Styles for Windy + Administrative Polygons & Numbers
    const customStyles = `
      <style>
        /* Suppress context menu */
        #plugin-contextmenu,
        .contextmenu,
        .context-menu,
        #contextmenu,
        .leaflet-contextmenu {
          display: none !important;
          visibility: hidden !important;
          pointer-events: none !important;
          opacity: 0 !important;
        }

        /* A. Suppress all layer menu and sidebar elements */
        [data-plugin="rhpane-top"],
        #plugin-rhpane-top,
        .rhpane__top-icons,
        .rhitem--main-menu,
        .rhpane__overlays-wrapper,
        .rhpane__overlays-levels,
        .more-layers,
        .rhbottom__map-tools,
        .rhbottom__pois-controls,
        .rhbottom__checkboxes,
        .closing-x,
        [data-plugin="progress-bar"],
        #plugin-progress-bar,
        .progress-bar-wrapper,
        .progress-bar-right,
        .pb-calendar,
        .play-pause,
        .progress-bar,
        .timecode,
        #bottom,
        [data-plugin="search-input"],
        #plugin-search-input,
        #search,
        .search,
        [data-plugin="startup-weather"],
        #plugin-startup-weather,
        .plugin-startup-weather,
        .top-banner,
        .rh-banners,
        #banner,
        #plugin-promo,
        .promo-container,
        .plugin-promo,
        #fav-alert-menu,
        #articles,
        #unlegal-embed,
        .unlegal-embed,
        #warnings {
          display: none !important;
          opacity: 0 !important;
          visibility: hidden !important;
          pointer-events: none !important;
          width: 0 !important;
          height: 0 !important;
          max-width: 0 !important;
          max-height: 0 !important;
          overflow: hidden !important;
        }

        /* A2. Elemen KHUSUS MOBILE Windy — hilangkan semuanya:
           - "Unduh Aplikasi" (#open-in-app, data-t=MENU_MOBILE)
           - hamburger merah kanan-bawah + toolbar kanan (home/cari/pin/favorit)
           Sebagian dibuat runtime saat Windy mendeteksi perangkat mobile, jadi
           daftar selectornya dibuat menyeluruh. Legenda AQI (#plugin-rhbottom)
           dan logo tetap ditampilkan oleh aturan di bawah. */
        #open-in-app,
        [data-ref="openInApp"],
        [data-t="MENU_MOBILE"],
        #mobile-ovr-select,
        .mobile-ovr-select,
        [data-ref="mobileOvrSelect"],
        #mobile-calendar,
        #plugin-mobile-calendar,
        #mobile-menu,
        .mobile-menu,
        [data-plugin="mobile-menu"],
        #hamburger,
        .hamburger,
        [data-ref="hamburger"],
        .rhitem__hamburger,
        /* Toolbar TOUCH/TABLET Windy — plugin "mobile-ui" (lazy-load, muncul saat
           Windy mendeteksi perangkat sentuh: home/cari/pin/favorit + hamburger
           merah bulat). Elemen ini BUKAN .rhitem, jadi harus disasar sendiri;
           #plugin-mobile-ui adalah kontainer pluginnya — menyembunyikannya
           menghapus seluruh toolbar sekaligus. Selector diverifikasi dari
           mobile-ui.js Windy v51.1.2. */
        #plugin-mobile-ui,
        .mobile-ui,
        .mobile-ui__icon,
        .mobile-ui__hamburger-icon,
        .mobile-ui__avatar,
        /* Semua tombol toolbar Windy (home / cari / pin / favorit / menu). Di
           mobile mereka dipindah keluar dari .rhpane__top-icons (yang sudah
           disembunyikan), jadi disasar langsung. Legenda AQI & logo BUKAN
           .rhitem, jadi tetap tampil. */
        .rhitem,
        [class*="rhitem--"],
        .rhpane__top-icons,
        .rhpane__overlays,
        .rhpane--mobile,
        .mobile-rhpane,
        .mobile-toolbar,
        #mobile-toolbar,
        .mobile-rh-tools,
        #plugin-picker-mobile {
          display: none !important;
          visibility: hidden !important;
          opacity: 0 !important;
          pointer-events: none !important;
          width: 0 !important;
          height: 0 !important;
        }

        /* B. Transparent rhpane container */
        .rhpane {
          pointer-events: none !important;
          background: transparent !important;
          border: none !important;
          box-shadow: none !important;
        }

        /* C. AQI Indicator on BOTTOM-RIGHT */
        #plugin-rhbottom {
          position: fixed !important;
          bottom: 16px !important;
          right: 20px !important;
          left: auto !important;
          top: auto !important;
          margin: 0 !important;
          width: 320px !important;
          z-index: 1000 !important;
          display: flex !important;
          pointer-events: auto !important;
        }

        .rhbottom__legend {
          display: flex !important;
          pointer-events: auto !important;
          margin: 0 !important;
          width: 320px !important;
          height: 24px !important;
          border-radius: 6px !important;
          overflow: hidden !important;
          box-shadow: 0 4px 16px rgba(0, 0, 0, 0.6) !important;
          border: 1px solid rgba(255, 255, 255, 0.2) !important;
        }

        /* D. Copernicus logo on BOTTOM-LEFT */
        .rhpane,
        .mobiletablethide.rhpane,
        #device-mobile .rhpane,
        #device-tablet .rhpane {
          display: block !important;
          visibility: visible !important;
          opacity: 1 !important;
          pointer-events: none !important;
        }

        .rhpane__bottom-messages {
          position: fixed !important;
          bottom: 16px !important;
          left: 20px !important;
          right: auto !important;
          top: auto !important;
          z-index: 1000 !important;
          margin: 0 !important;
          padding: 0 !important;
          display: flex !important;
          align-items: center !important;
          pointer-events: auto !important;
          transform: none !important;
          width: 115px !important;
          height: auto !important;
        }

        .rhpane__bottom-messages a {
          height: auto !important;
          display: flex !important;
          align-items: center !important;
        }

        .rhpane__bottom-messages img,
        img[src*="copernicus"] {
          width: 115px !important;
          max-width: 115px !important;
          height: auto !important;
          display: block !important;
          filter: drop-shadow(0 2px 8px rgba(0, 0, 0, 0.8)) !important;
          opacity: 0.95 !important;
        }

        /* E. Windy logo placed beside Copernicus */
        #logo-wrapper,
        [class*="on"] #logo-wrapper,
        #device-mobile #logo-wrapper,
        #device-tablet #logo-wrapper,
        body #logo-wrapper {
          display: block !important;
          visibility: visible !important;
          opacity: 1 !important;
          container: none !important;
          border: none !important;
          background: transparent !important;
          width: auto !important;
          height: auto !important;
          pointer-events: none !important;
          z-index: 1000 !important;
        }

        #logo,
        #logo-wrapper #logo,
        [class*="on"] #logo-wrapper #logo,
        #device-mobile #logo,
        #device-tablet #logo {
          position: fixed !important;
          top: auto !important;
          right: auto !important;
          bottom: 16px !important;
          left: 151px !important;
          z-index: 1000 !important;
          transform: scale(0.8) !important;
          transform-origin: bottom left !important;
          pointer-events: auto !important;
          margin: 0 !important;
          padding: 0 !important;
          opacity: 0.95 !important;
          display: flex !important;
          align-items: center !important;
          visibility: visible !important;
          transition: opacity 0.2s ease !important;
        }

        #logo:hover {
          opacity: 1 !important;
        }

        /* E2. Mobile: responsive styles untuk bilah AQI, legenda, dan logo atribusi */
        @media (max-width: 640px) {
          /* #plugin-rhbottom: Bilah AQI penuh dengan jarak 12px di sisi kiri & kanan */
          #plugin-rhbottom {
            width: calc(100% - 24px) !important;
            left: 12px !important;
            right: 12px !important;
            bottom: 12px !important;
            margin: 0 auto !important;
            justify-content: center !important;
          }

          /* .rhbottom__legend: Skala penuh dengan tinggi 22px dan font 10px tanpa meluap */
          .rhbottom__legend {
            width: 100% !important;
            max-width: 100% !important;
            height: 22px !important;
            font-size: 10px !important;
            line-height: 22px !important;
          }

          .rhbottom__legend > *,
          .rhbottom__legend span,
          .rhbottom__legend div,
          .rhbottom__legend p,
          .rhbottom__legend li,
          .rhbottom__legend text {
            font-size: 10px !important;
            line-height: 22px !important;
            white-space: nowrap !important;
          }

          /* Attribution logos (.rhpane / Copernicus & Windy logos):
             Di mobile ditempatkan di atas bilah AQI pada bottom: 44px */
          .rhpane {
            position: fixed !important;
            bottom: 44px !important;
            left: 12px !important;
            right: auto !important;
            top: auto !important;
            transform: scale(0.85) !important;
            transform-origin: bottom left !important;
            pointer-events: none !important;
            z-index: 1002 !important;
          }

          .rhpane__bottom-messages {
            position: fixed !important;
            left: 12px !important;
            bottom: 44px !important;
            right: auto !important;
            top: auto !important;
            width: 115px !important;
            transform: scale(0.85) !important;
            transform-origin: bottom left !important;
            z-index: 1002 !important;
          }

          .rhpane .rhpane__bottom-messages {
            position: relative !important;
            left: 0 !important;
            bottom: 0 !important;
            transform: none !important;
          }

          .rhpane__bottom-messages img,
          img[src*="copernicus"] {
            width: 115px !important;
            max-width: 115px !important;
          }

          #logo,
          #logo-wrapper #logo,
          [class*="on"] #logo-wrapper #logo,
          #device-mobile #logo,
          #device-tablet #logo {
            left: 122px !important;
            right: auto !important;
            bottom: 44px !important;
            top: auto !important;
            transform: scale(0.68) !important;
            transform-origin: bottom left !important;
            z-index: 1002 !important;
          }

          #custom-zoom-controls {
            right: 12px;
            top: ${topControls};
          }
        }

        #contrib {
          display: none !important;
        }

        /* F. Cleanest basemap: Suppress ALL text, city labels, country labels, ocean labels */
        .labels-layer,
        .leaflet-gridlayer-feature,
        [class*="labels-layer"],
        [class*="gridlayer-feature"],
        .country-1, .country-2, .country-3,
        .city-1, .city-2, .city-3,
        [data-temp]::after {
          display: none !important;
          content: none !important;
          visibility: hidden !important;
          opacity: 0 !important;
          width: 0 !important;
          height: 0 !important;
        }

        /* G. Disable click popups and pickers */
        #plugin-detail,
        #plugin-default-model-selector,
        #plugin-station,
        #plugin-nearest-stations,
        #plugin-sounding,
        #plugin-webcams,
        #plugin-airports,
        .plugin-popup,
        .plugin-desktop-bottom,
        .plugin-bottom,
        #picker-dot,
        .picker-dot,
        .picker,
        .location-summary {
          display: none !important;
          visibility: hidden !important;
          pointer-events: none !important;
          opacity: 0 !important;
          height: 0 !important;
          max-height: 0 !important;
          overflow: hidden !important;
        }

        /* H. Full viewport coverage */
        html, body, #map-container, #map, #leaflet-map {
          width: 100vw !important;
          height: 100vh !important;
          margin: 0 !important;
          padding: 0 !important;
          overflow: hidden !important;
          background-color: #000000 !important;
        }

        /* I. Administrative Polygon Styling */
        .leaflet-pane.leaflet-wilayah-pane svg {
          pointer-events: none !important;
        }
        .leaflet-pane.leaflet-wilayah-pane path,
        .provinsi-layer,
        path.provinsi-layer {
          cursor: pointer !important;
          pointer-events: auto !important;
          /* Hanya fill-opacity yang dianimasikan: transisi stroke-width
             menata ulang geometri SVG tiap bingkai dan filter drop-shadow
             memaksa pass render tambahan — keduanya berkedip di Chromium
             saat kursor menyapu poligon di atas kanvas WebGL. */
          transition: fill-opacity 0.2s ease;
        }

        .leaflet-wilayahPane-pane path:hover,
        .leaflet-pane.leaflet-wilayahPane-pane path:hover,
        .provinsi-layer:hover,
        path.provinsi-layer:hover {
          stroke: #ffffff !important;
          stroke-width: 2.5px !important;
          fill: #ffffff !important;
          fill-opacity: 0.20 !important;
        }

        /* J. Number Badges (.peta-angka) inside polygon centroids */
        .peta-angka {
          width: 0 !important;
          height: 0 !important;
          overflow: visible !important;
          pointer-events: none !important;
        }

        .peta-angka__nilai {
          position: absolute !important;
          top: 0 !important;
          left: 0 !important;
          transform: translate(-50%, -50%) !important;
          white-space: nowrap !important;
          font-size: 14px !important;
          font-weight: 700 !important;
          line-height: 1 !important;
          font-variant-numeric: tabular-nums !important;
          color: #fff !important;
          text-shadow:
            0 0 3px rgb(26 25 25 / 0.85),
            1px 1px 0 rgb(26 25 25 / 0.7),
            -1px 1px 0 rgb(26 25 25 / 0.7),
            1px -1px 0 rgb(26 25 25 / 0.7),
            -1px -1px 0 rgb(26 25 25 / 0.7) !important;
          pointer-events: none !important;
        }

        /* K. Fire Incident Markers from Kejadian API */
        .marker-titik-kejadian {
          position: relative;
          width: 24px;
          height: 24px;
          display: flex;
          align-items: center;
          justify-content: center;
          cursor: pointer !important;
          pointer-events: auto !important;
          z-index: 500;
          transition: transform 0.2s cubic-bezier(0.34, 1.56, 0.64, 1);
        }
        .marker-titik-kejadian:hover {
          transform: scale(1.35);
          z-index: 600;
        }
        .marker-titik-kejadian__ping {
          position: absolute;
          inset: -4px;
          border-radius: 9999px;
          background: rgba(239, 68, 68, 0.45);
          animation: denyut-kejadian 2s infinite ease-out;
          pointer-events: none;
        }
        .marker-titik-kejadian__core {
          position: relative;
          width: 22px;
          height: 22px;
          border-radius: 9999px;
          background: linear-gradient(135deg, #f97316 0%, #dc2626 100%);
          border: 2px solid #ffffff;
          box-shadow: 0 2px 8px rgba(0, 0, 0, 0.65), 0 0 10px rgba(249, 115, 22, 0.7);
          display: flex;
          align-items: center;
          justify-content: center;
          color: #fff;
        }
        @keyframes denyut-kejadian {
          0% { transform: scale(0.8); opacity: 0.9; }
          100% { transform: scale(2.2); opacity: 0; }
        }

        .peta-angka--bertumpuk {
          display: none !important;
        }

        /* Tooltip custom styling.
           Tanpa backdrop-filter: tooltip mengikuti kursor di atas kanvas
           WebGL, dan blur yang disampel ulang tiap mousemove berkedip di
           Chromium — latar solid pekat menggantikannya. */
        .leaflet-tooltip.provinsi-tooltip {
          background: rgba(20, 16, 15, 0.94) !important;
          border: 1px solid rgba(255, 255, 255, 0.25) !important;
          color: #ffffff !important;
          border-radius: 8px !important;
          padding: 6px 12px !important;
          font-size: 12px !important;
          font-weight: 600 !important;
          box-shadow: 0 4px 16px rgba(0, 0, 0, 0.6) !important;
          pointer-events: none !important;
        }
        .leaflet-tooltip.provinsi-tooltip::before {
          border-top-color: rgba(20, 16, 15, 0.88) !important;
        }
        html.light .leaflet-tooltip.provinsi-tooltip {
          background: rgba(255, 255, 255, 0.95) !important;
          border: 1px solid rgba(0, 0, 0, 0.1) !important;
          color: #1a1919 !important;
          box-shadow: 0 4px 16px rgba(0, 0, 0, 0.12) !important;
        }
        html.light .leaflet-tooltip.provinsi-tooltip::before {
          border-top-color: rgba(255, 255, 255, 0.95) !important;
        }

        /* Tombol kontrol zoom kustom (Posisi, ukuran, dan glassmorphism seragam dengan PetaAsap) */
        #custom-zoom-controls {
          position: fixed;
          right: 12px;
          top: ${topControls};
          display: flex;
          flex-direction: column;
          align-items: flex-end;
          gap: 8px;
          z-index: 999;
          pointer-events: auto;
        }
        @media (min-width: 640px) {
          #custom-zoom-controls {
            right: 16px;
          }
        }
        #custom-zoom-controls button {
          cursor: pointer;
          display: flex;
          align-items: center;
          justify-content: center;
          border-radius: 12px;
          user-select: none;
          backdrop-filter: blur(12px);
          -webkit-backdrop-filter: blur(12px);
          transition: transform 0.15s ease, background 0.15s ease, color 0.15s ease, border-color 0.15s ease, box-shadow 0.15s ease;
        }
        #custom-zoom-controls button:active {
          transform: scale(0.9);
        }
        #custom-zoom-controls button svg {
          pointer-events: none;
        }

        /* Default / Tema Gelap */
        #custom-zoom-controls button,
        #custom-zoom-controls.tema-dark button {
          background: rgba(20, 16, 15, 0.9);
          border: 1px solid rgba(255, 255, 255, 0.1);
          box-shadow: 0 0 0 1px rgba(255, 255, 255, 0.15), 0 10px 15px -3px rgba(0, 0, 0, 0.1), 0 4px 6px -4px rgba(0, 0, 0, 0.1);
          color: rgba(255, 255, 255, 0.9);
        }
        #custom-zoom-controls button:hover,
        #custom-zoom-controls.tema-dark button:hover {
          background: rgba(255, 255, 255, 0.18);
          color: #ffffff;
        }

        /* Tema Terang (Light Mode) */
        #custom-zoom-controls.tema-light button,
        html.light #custom-zoom-controls button {
          background: rgba(255, 255, 255, 0.92) !important;
          border: 1px solid rgba(0, 0, 0, 0.08) !important;
          box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1), 0 1px 2px rgba(0, 0, 0, 0.06) !important;
          color: #1a1919 !important;
        }
        #custom-zoom-controls.tema-light button:hover,
        html.light #custom-zoom-controls button:hover {
          background: #ffffff !important;
          color: #000000 !important;
        }

        /* Tombol bentang selayar — selalu 36px (h-9 w-9) */
        #btn-bentang {
          width: 36px !important;
          height: 36px !important;
        }
        #btn-bentang svg {
          width: 16px !important;
          height: 16px !important;
        }

        /* Tombol navigasi (+, -, home) — 28px jika ringkas (legendaRingkas), default 36px */
        #btn-zoom-in,
        #btn-zoom-out,
        #btn-zoom-home {
          width: ${ringkas ? "28px" : "36px"} !important;
          height: ${ringkas ? "28px" : "36px"} !important;
        }
        #btn-zoom-in svg,
        #btn-zoom-out svg,
        #btn-zoom-home svg {
          width: ${ringkas ? "13px" : "16px"} !important;
          height: ${ringkas ? "13px" : "16px"} !important;
        }

        /* MOBILE: Pastikan sentuhan pan dan pinch-to-zoom di perangkat sentuh mulus dan responsif */
        @media (pointer: coarse), (max-width: 640px) {
          #map-container, #map, #leaflet-map,
          .leaflet-container, .leaflet-pane, .leaflet-pane canvas {
            touch-action: none !important;
            -webkit-user-select: none !important;
            user-select: none !important;
            -webkit-touch-callout: none !important;
          }
        }
      </style>
    `;

    // 3. Custom Script: Setup Leaflet Administrative Polygons, sync time, and postMessage Bridge
    const geoDataJson = JSON.stringify(petaProvinsi);
    const centroidsJson = JSON.stringify(PUSAT_WILAYAH);
    const pulauJson = JSON.stringify(PROVINSI_PULAU);

    const customScript = `
      <script>
        (function() {
          document.documentElement.classList.add('${temaAwal}');
          const GEO_DATA = ${geoDataJson};
          const CENTROIDS = ${centroidsJson};
          const PROVINSI_PULAU = ${pulauJson};
          const ANGKA_SELA = 4;

          let currentJumlahLaporan = {};
          let geoLayer = null;
          let markersLayer = null;
          let daftarAngka = [];
          let hasSyncedTime = false;
          let mapInitialized = false;
          // Tampilan awal peta: disinkronkan dengan zoom/center asli Windy sampai pengguna berinteraksi
          // Konsol /peta: roda memperbesar peta, dan zoom awalnya pecahan (hasil
          // cameraForBounds lapisan Aerosol) — jangan dibulatkan ke bawah.
          const KONSOL = ${konsol};
          const ZOOM_AWAL = parseFloat('${zoom}');
          let tampilanAwal = { pusat: [parseFloat('${lat}'), parseFloat('${lon}')], zoom: ZOOM_AWAL };
          // Kamera terakhir lapisan Aerosol yang dikirim parent (SET_KAMERA) —
          // bila ada, dipakai menggantikan tampilanAwal saat memosisikan ulang.
          let kameraTarget = null;

          // Selisih zoom dari parent (SKALA_ZOOM) yang menunggu iframe
          // di-resize. Diterapkan di handler resize — sebelum Windy sempat
          // menggambar — atau lewat cadangan waktu bila resize tak datang.
          let deltaTertunda = 0;
          let penundaDelta = null;
          function terapkanDeltaTertunda() {
            clearTimeout(penundaDelta);
            const delta = deltaTertunda;
            deltaTertunda = 0;
            if (!delta || !window.W || !window.W.map || !window.W.map.map) return;
            const m = window.W.map.map;
            try {
              const mml = m._maplibreMap;
              if (mml && typeof mml.resize === 'function') mml.resize();
            } catch (e) {}
            try {
              if (typeof m.invalidateSize === 'function') m.invalidateSize({ animate: false, pan: false });
            } catch (e) {}
            try {
              m.setView(m.getCenter(), m.getZoom() + delta, { animate: false });
            } catch (e) {}
            try {
              const mml = m._maplibreMap;
              if (mml && typeof mml.redraw === 'function') mml.redraw();
            } catch (e) {}
            // Tombol rumah ikut menyesuaikan, tetap memuat Nusantara penuh.
            tampilanAwal = { pusat: tampilanAwal.pusat, zoom: tampilanAwal.zoom + delta };
            if (kameraTarget) kameraTarget = { pusat: kameraTarget.pusat, zoom: kameraTarget.zoom + delta };
          }
          // MapLibre milik Windy me-resize kanvasnya lewat ResizeObserver lalu
          // baru menggambar di frame berikutnya — satu frame basi (zoom lama,
          // kanvas kosong di tepi) sempat tampil saat bingkai konsol berubah.
          // Di konsol pelacakan itu dimatikan dan resize ditangani sinkron di
          // event resize: ubah ukuran, terapkan selisih zoom, gambar ulang —
          // semuanya sebelum browser melukis frame.
          function petaMapLibreWindy() {
            try {
              const m = window.W && window.W.map && window.W.map.map;
              return m && m._maplibreMap ? m._maplibreMap : null;
            } catch (e) { return null; }
          }
          function matikanLacakResize() {
            const mml = petaMapLibreWindy();
            if (mml && mml._trackResize) mml._trackResize = false;
          }
          if (KONSOL) {
            // Dipanggil parent secara SINKRON (iframe ini satu origin) tepat
            // setelah parent melepas ukuran iframe — resize kanvas, geser zoom,
            // dan gambar ulang terjadi di tugas yang sama, sebelum frame dilukis.
            // Event resize di bawah tetap ada untuk resize jendela biasa.
            window.__skalaKonsol = function(delta) {
              matikanLacakResize();
              const mml = petaMapLibreWindy();
              if (typeof delta === 'number' && isFinite(delta) && delta !== 0) {
                deltaTertunda += delta;
                terapkanDeltaTertunda();
              } else {
                try { if (mml) { mml.resize(); mml.redraw(); } } catch (e) {}
              }
            };
            window.addEventListener('resize', function() {
              matikanLacakResize();
              const mml = petaMapLibreWindy();
              try { if (mml) mml.resize(); } catch (e) {}
              if (deltaTertunda) {
                terapkanDeltaTertunda();
              } else {
                try { if (mml) mml.redraw(); } catch (e) {}
              }
            });
          }
          let interaksiPengguna = false;

          function disableMapScrollZoom(map) {
            if (!map) return;
            // Di konsol /peta zoom roda justru dinyalakan — sama seperti lapisan Aerosol.
            const aksi = KONSOL ? 'enable' : 'disable';
            try {
              if (map.scrollWheelZoom && typeof map.scrollWheelZoom[aksi] === 'function') {
                map.scrollWheelZoom[aksi]();
              }
            } catch (e) {}
            try {
              if (map._maplibreMap && map._maplibreMap.scrollZoom && typeof map._maplibreMap.scrollZoom[aksi] === 'function') {
                map._maplibreMap.scrollZoom[aksi]();
              }
            } catch (e) {}
            // Pastikan sentuhan geser (panning) dan cubit (pinch-to-zoom) selalu aktif dan mulus di mobile
            try {
              if (map.dragging && typeof map.dragging.enable === 'function') {
                map.dragging.enable();
              }
            } catch (e) {}
            try {
              if (map.touchZoom && typeof map.touchZoom.enable === 'function') {
                map.touchZoom.enable();
              }
            } catch (e) {}
            try {
              var ml = map._maplibreMap;
              if (ml) {
                if (ml.dragPan && typeof ml.dragPan.enable === 'function') {
                  ml.dragPan.enable();
                }
                if (ml.touchZoomRotate && typeof ml.touchZoomRotate.enable === 'function') {
                  ml.touchZoomRotate.enable();
                } else if (ml.touchZoom && typeof ml.touchZoom.enable === 'function') {
                  ml.touchZoom.enable();
                }
              }
            } catch (e) {}
          }

          function pastikanSentuhMulus() {
            try {
              var m = window.W && window.W.map && window.W.map.map;
              if (!m) return;
              if (m.dragging && typeof m.dragging.enable === 'function' && typeof m.dragging.enabled === 'function' && !m.dragging.enabled()) {
                m.dragging.enable();
              }
              var mml = m._maplibreMap;
              if (mml && mml.dragPan && typeof mml.dragPan.enable === 'function' && typeof mml.dragPan.isEnabled === 'function' && !mml.dragPan.isEnabled()) {
                mml.dragPan.enable();
              }
            } catch (e) {}
          }

          function enforceLatestAQI() {
            try {
              ['detail', 'default-model-selector', 'picker', 'station', 'nearest-stations', 'sounding', 'webcams', 'app-review-dialog', 'onboarding'].forEach(function(name) {
                var p = window.W.plugins && window.W.plugins[name];
                if (p) {
                  p.open = function() { return false; };
                  if (p.isOpen && typeof p.close === 'function') {
                    p.close();
                  }
                }
              });

              if (window.W && window.W.map && window.W.map.map) {
                var m = window.W.map.map;
                disableMapScrollZoom(m);
              }
            } catch (e) {}
          }

          function perbaruiAngka(map) {
            if (!map || !daftarAngka.length) return;

            for (const a of daftarAngka) {
              const el = a.penanda.getElement();
              if (el) el.classList.remove('peta-angka--bertumpuk');
            }

            const kotak = daftarAngka.map((a, urut) => {
              const el = a.penanda.getElement();
              const isi = el ? el.firstElementChild : null;
              const pusat = map.latLngToContainerPoint(a.titik);
              const d = a.kotakDeg;
              const ka = map.latLngToContainerPoint([d[3], d[0]]);
              const kb = map.latLngToContainerPoint([d[1], d[2]]);
              return {
                urut,
                x: pusat.x,
                y: pusat.y,
                w: (isi ? isi.offsetWidth : 0) + ANGKA_SELA,
                h: (isi ? isi.offsetHeight : 0) + ANGKA_SELA,
                luas: Math.abs(kb.x - ka.x) * Math.abs(kb.y - ka.y)
              };
            });

            kotak.sort((a, b) => b.luas - a.luas);
            const ditempatkan = [];
            for (const c of kotak) {
              const bertumpuk = ditempatkan.some(
                t => Math.abs(c.x - t.x) * 2 < c.w + t.w && Math.abs(c.y - t.y) * 2 < c.h + t.h
              );
              if (bertumpuk) {
                const el = daftarAngka[c.urut].penanda.getElement();
                if (el) el.classList.add('peta-angka--bertumpuk');
              } else {
                ditempatkan.push(c);
              }
            }
          }

          function renderAngka(map) {
            if (!map || typeof L === 'undefined') return;
            if (markersLayer) {
              markersLayer.clearLayers();
            } else {
              markersLayer = L.layerGroup([], { pane: 'angkaPane' }).addTo(map);
            }
            daftarAngka = [];

            for (const [nama, info] of Object.entries(CENTROIDS)) {
              const jumlah = currentJumlahLaporan[nama];
              if (typeof jumlah !== 'number') continue;

              const penanda = L.marker([info.titik[1], info.titik[0]], {
                pane: 'angkaPane',
                interactive: false,
                keyboard: false,
                icon: L.divIcon({
                  className: 'peta-angka',
                  iconSize: [0, 0],
                  html: '<span class="peta-angka__nilai" aria-hidden="true">' + jumlah.toLocaleString('id-ID') + '</span>'
                })
              }).addTo(markersLayer);

              daftarAngka.push({
                penanda,
                titik: [info.titik[1], info.titik[0]],
                kotakDeg: info.kotak
              });
            }

            setTimeout(() => perbaruiAngka(map), 50);
          }

          function initAdministrativeMap() {
            if (mapInitialized) return;
            if (!window.W || !window.W.map || !window.W.map.map || typeof L === 'undefined') return;

            const map = window.W.map.map;
            disableMapScrollZoom(map);
            if (KONSOL) matikanLacakResize();
            if (window.W && window.W.store && typeof window.W.store.set === 'function') {
              try {
                window.W.store.set('product', 'cams');
                window.W.store.set('overlay', 'aqi');
              } catch (e) {}
            }
            try {
              map.setView([parseFloat('${lat}'), parseFloat('${lon}')], ZOOM_AWAL);
            } catch (e) {}

            // Windy masih memosisikan ulang peta beberapa saat setelah siap (router + pemulihan posisi).
            // Terapkan ulang kamera yang sama dengan lapisan Aerosol / posisi awal sampai pengunjung menyentuh peta.
            ['pointerdown', 'wheel', 'touchstart', 'keydown'].forEach(function(jenis) {
              window.addEventListener(jenis, function() { interaksiPengguna = true; }, { capture: true, passive: true });
            });
            [400, 1200, 2500, 4500].forEach(function(jeda) {
              setTimeout(function() {
                if (interaksiPengguna) return;
                const k = kameraTarget || tampilanAwal;
                try { map.setView(k.pusat, k.zoom, { animate: false }); } catch (e) {}
              }, jeda);
            });

            // Buat tombol kontrol zoom kustom (+ / − / home).
            // Saat query bentang=1 (dipakai landing karhutla), tombol bentang
            // selayar dipasang sebagai anak pertama — posisi & perannya sama
            // dengan tombol bentang di tumpukan kendali lapisan Aerosol
            // (PetaAsap). Kliknya mengirim BUKA_SELAYAR ke halaman induk;
            // membuka selayar adalah keputusan halaman, bukan iframe.
            if (!document.getElementById('custom-zoom-controls')) {
              const zoomBox = document.createElement('div');
              zoomBox.id = 'custom-zoom-controls';
              zoomBox.className = '${temaAwal === "light" ? "tema-light" : "tema-dark"}';
              zoomBox.innerHTML = '${tombolBentang}' +
                '<button id="btn-zoom-in" type="button" aria-label="Perbesar peta" title="Perbesar peta"><svg viewBox="0 0 24 24" width="${ringkas ? "13" : "16"}" height="${ringkas ? "13" : "16"}" fill="none" stroke="currentColor" stroke-width="2.5"><line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" /></svg></button>' +
                '<button id="btn-zoom-out" type="button" aria-label="Perkecil peta" title="Perkecil peta"><svg viewBox="0 0 24 24" width="${ringkas ? "13" : "16"}" height="${ringkas ? "13" : "16"}" fill="none" stroke="currentColor" stroke-width="2.5"><line x1="5" y1="12" x2="19" y2="12" /></svg></button>' +
                '<button id="btn-zoom-home" type="button" aria-label="Fokus seluruh Nusantara" title="Fokus seluruh Nusantara"><svg viewBox="0 0 24 24" width="${ringkas ? "13" : "16"}" height="${ringkas ? "13" : "16"}" fill="none" stroke="currentColor" stroke-width="2.5"><path d="m3 9 9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" /><polyline points="9 22 9 12 15 12 15 22" /></svg></button>';
              document.body.appendChild(zoomBox);

              document.getElementById('btn-bentang')?.addEventListener('click', function(e) {
                e.stopPropagation();
                if (window.parent && window.parent !== window) {
                  window.parent.postMessage({ type: 'BUKA_SELAYAR' }, '*');
                }
              });

              document.getElementById('btn-zoom-in')?.addEventListener('click', function(e) {
                e.stopPropagation();
                if (window.W && window.W.map && window.W.map.map) window.W.map.map.zoomIn(1);
              });

              document.getElementById('btn-zoom-out')?.addEventListener('click', function(e) {
                e.stopPropagation();
                if (window.W && window.W.map && window.W.map.map) window.W.map.map.zoomOut(1);
              });

              document.getElementById('btn-zoom-home')?.addEventListener('click', function(e) {
                e.stopPropagation();
                if (window.W && window.W.map && window.W.map.map) {
                  const m = window.W.map.map;
                  const k = kameraTarget || tampilanAwal;
                  // Pada Leaflet/MapLibre wrapper Windy, flyTo meneruskan zoom langsung ke MapLibre tanpa -1
                  // (sedangkan getZoom() adalah maplibreZoom + 1). Oleh karena itu zoom dikurangi 1
                  // agar hasil flyTo mengembalikan peta tepat ke zoom target.
                  m.flyTo(k.pusat, k.zoom - 1, { duration: 1.2 });
                }
              });
            }

            // Buat pane khusus untuk wilayah dan angka
            try {
              if (!map.getPane('wilayahPane')) {
                map.createPane('wilayahPane');
                map.getPane('wilayahPane').style.zIndex = '420';
              }
              if (!map.getPane('angkaPane')) {
                map.createPane('angkaPane');
                const p = map.getPane('angkaPane');
                p.style.zIndex = '460';
                p.style.pointerEvents = 'none';
              }
            } catch (e) {}

            // Buat elemen tooltip mengambang khusus
            const tooltipEl = document.createElement('div');
            tooltipEl.id = 'provinsi-tooltip';
            tooltipEl.style.cssText = 'position:fixed;display:none;pointer-events:none;z-index:9999;background:rgba(20,16,15,0.94);border:1px solid rgba(255,255,255,0.25);color:#fff;border-radius:8px;padding:6px 12px;font-size:12px;font-weight:600;box-shadow:0 4px 16px rgba(0,0,0,0.6);font-family:system-ui,-apple-system,sans-serif;';
            document.body.appendChild(tooltipEl);

            // Cegah error internal Leaflet di Windy terkait tooltips
            try {
              if (typeof L !== 'undefined' && L.Layer && L.Layer.prototype) {
                L.Layer.prototype._addTooltipFocusListeners = function() {};
              }
            } catch (e) {}

            // Tambahkan GeoJSON Poligon Provinsi
            geoLayer = L.geoJSON(GEO_DATA, {
              pane: 'wilayahPane',
              className: 'provinsi-layer',
              style: function() {
                return {
                  fillColor: '#ffffff',
                  fillOpacity: 0.04,
                  color: 'rgba(255, 255, 255, 0.70)',
                  weight: 1.5,
                  opacity: 0.95
                };
              },
              onEachFeature: function(feature, layer) {
                const nama = feature.properties.nama;
                const pulau = PROVINSI_PULAU[nama] || null;

                function saatPilih(e) {
                  const orig = e.originalEvent;
                  if (orig && orig.button !== undefined && orig.button !== 0) return;
                  if (orig && typeof orig.stopPropagation === 'function') {
                    orig.stopPropagation();
                  }
                  const asal = orig ? { x: orig.clientX, y: orig.clientY } : { x: window.innerWidth / 2, y: window.innerHeight / 2 };
                  if (tooltipEl) tooltipEl.style.display = 'none';
                  
                  // Kirim ke parent window untuk membuka popup laporan
                  if (window.parent) {
                    window.parent.postMessage({
                      type: 'PILIH_WILAYAH',
                      nama: nama,
                      pulau: pulau,
                      asal: asal
                    }, '*');
                  }
                }

                layer.on('click', saatPilih);
              }
            }).addTo(map);

            function tagAllPaths() {
              if (!geoLayer) return;
              geoLayer.eachLayer(function(l) {
                if (l.feature && l.feature.properties) {
                  const n = l.feature.properties.nama;
                  const p = PROVINSI_PULAU[n] || '';
                  const el = l.getElement ? l.getElement() : l._path;
                  if (el) {
                    el.setAttribute('data-nama', n);
                    el.setAttribute('data-pulau', p);
                    el.style.pointerEvents = 'auto';
                    el.style.cursor = 'pointer';
                  }
                }
              });
            }

            tagAllPaths();
            setTimeout(tagAllPaths, 150);
            setTimeout(tagAllPaths, 600);
            map.on('zoomend moveend resize', tagAllPaths);

            // Document-level capturing click listener guarantees click capture across all browser pointer engines
            document.addEventListener('click', function(e) {
              const path = e.target && e.target.closest ? e.target.closest('path[data-nama], .provinsi-layer') : null;
              if (!path) return;
              const nama = path.getAttribute('data-nama');
              if (!nama) return;
              const pulau = path.getAttribute('data-pulau') || null;

              e.preventDefault();
              e.stopPropagation();

              if (tooltipEl) tooltipEl.style.display = 'none';

              if (window.parent) {
                window.parent.postMessage({
                  type: 'PILIH_WILAYAH',
                  nama: nama,
                  pulau: pulau,
                  asal: { x: e.clientX, y: e.clientY }
                }, '*');
              }
            }, true);

            // Document-level capturing hover listeners for tooltip
            document.addEventListener('mouseover', function(e) {
              const path = e.target && e.target.closest ? e.target.closest('path[data-nama], .provinsi-layer') : null;
              if (!path) return;
              const nama = path.getAttribute('data-nama');
              if (!nama || !tooltipEl) return;

              const jml = currentJumlahLaporan[nama];
              const teksJml = typeof jml === 'number' && jml > 0
                ? '<span style="color:#ef4444;font-weight:700;">' + jml.toLocaleString('id-ID') + ' laporan karhutla</span>'
                : '<span style="color:rgba(255,255,255,0.65);">Tidak ada laporan karhutla</span>';
              tooltipEl.innerHTML = '<div style="font-weight:700;color:#f59e0b;margin-bottom:2px;">' + nama + '</div><div style="font-size:11px;">' + teksJml + '</div>';
              tooltipEl.style.display = 'block';
              tooltipEl.style.left = (e.clientX + 14) + 'px';
              tooltipEl.style.top = (e.clientY + 14) + 'px';
            }, true);

            document.addEventListener('mousemove', function(e) {
              if (tooltipEl && tooltipEl.style.display === 'block') {
                tooltipEl.style.left = (e.clientX + 14) + 'px';
                tooltipEl.style.top = (e.clientY + 14) + 'px';
              }
            }, true);

            document.addEventListener('mouseout', function(e) {
              const fromPath = e.target && e.target.closest ? e.target.closest('path[data-nama], .provinsi-layer') : null;
              if (!fromPath || !tooltipEl) return;
              const toPath = e.relatedTarget && e.relatedTarget.closest ? e.relatedTarget.closest('path[data-nama], .provinsi-layer') : null;
              // Jika kursor masih di dalam polygon provinsi yang sama, jangan sembunyikan tooltip
              if (fromPath === toPath) return;
              tooltipEl.style.display = 'none';
            }, true);

            renderAngka(map);

            map.on('zoomend moveend resize', function() {
              perbaruiAngka(map);
            });

            mapInitialized = true;

            // Pastikan logo Copernicus & logo Windy selalu hadir di DOM dan tampil
            function pastikanSemuaLogo() {
              // Pastikan interaksi sentuh geser/cubit selalu aktif di mobile
              pastikanSentuhMulus();
              // 1. Copernicus: Windy di mobile tidak menyisipkan logo Copernicus (!C di script internalnya)
              var ci = document.querySelector('img[src*="copernicus"]');
              var wsp = document.querySelector('.rhpane__bottom-messages');
              if (!ci) {
                if (!wsp) {
                  wsp = document.createElement('div');
                  wsp.className = 'rhpane__bottom-messages';
                  document.body.appendChild(wsp);
                }
                wsp.innerHTML = '<a href="https://atmosphere.copernicus.eu/" target="_blank" rel="noopener noreferrer" style="display:block;"><img src="https://www.windy.com/img/providers/copernicus-white.svg" alt="Copernicus" style="display:block;" /></a>';
              }

              // Pastikan rantai induk .rhpane__bottom-messages tidak tertutup display:none
              if (wsp) {
                wsp.style.setProperty('display', 'flex', 'important');
                wsp.style.setProperty('visibility', 'visible', 'important');
                wsp.style.setProperty('opacity', '1', 'important');
                var pw = wsp.parentElement;
                if (pw && pw !== document.body) {
                  pw.style.setProperty('display', 'block', 'important');
                  pw.style.setProperty('visibility', 'visible', 'important');
                  pw.style.setProperty('opacity', '1', 'important');
                }
              }

              // 2. Windy Logo: un-hide logo-wrapper & #logo dari aturan .on... dan container query
              var lw = document.getElementById('logo-wrapper');
              if (lw) {
                lw.style.setProperty('display', 'block', 'important');
                lw.style.setProperty('visibility', 'visible', 'important');
                lw.style.setProperty('opacity', '1', 'important');
              }
              var el = document.getElementById('logo');
              if (el) {
                el.style.setProperty('display', 'flex', 'important');
                el.style.setProperty('visibility', 'visible', 'important');
                el.style.setProperty('opacity', '0.95', 'important');
              }
            }

            pastikanSemuaLogo();
            setInterval(pastikanSemuaLogo, 500);

            // Beri tahu parent bahwa map forecasting sudah siap
            if (window.parent) {
              window.parent.postMessage({ type: 'FORECASTING_READY' }, '*');
            }
          }

          // Listener pesan dari parent Next.js
          window.addEventListener('message', function(event) {
            const data = event.data;
            if (!data || typeof data !== 'object') return;

            if (data.type === 'SET_JUMLAH') {
              if (data.jumlahLaporan) {
                currentJumlahLaporan = data.jumlahLaporan;
                if (window.W && window.W.map && window.W.map.map) {
                  renderAngka(window.W.map.map);
                }
              }
            } else if (data.type === 'FOCUS_WILAYAH') {
              const info = CENTROIDS[data.nama];
              if (info && window.W && window.W.map && window.W.map.map) {
                const map = window.W.map.map;
                map.flyTo([info.titik[1], info.titik[0]], 6, { duration: 1.2 });
              }
            } else if (data.type === 'SKALA_ZOOM') {
              // Konsol /peta: bingkai membesar/mengecil (rel dilipat). Parent
              // mengirim selisih zoom = log2(lebar baru / lebar lama) supaya
              // wilayah yang tampil tetap sama — Nusantara ikut membesar.
              // Selisihnya disimpan dulu dan diterapkan pada event resize iframe
              // (parent melepas ukuran iframe sesudah pesan ini) — zoom baru dan
              // ukuran baru tergambar di frame yang sama, tanpa kedipan.
              if (KONSOL && typeof data.delta === 'number' && isFinite(data.delta)) {
                deltaTertunda += data.delta;
                clearTimeout(penundaDelta);
                penundaDelta = setTimeout(terapkanDeltaTertunda, 300);
              }
            } else if (data.type === 'SET_KAMERA') {
              // Samakan kamera dengan lapisan Aerosol / Nusantara saat beralih mode atau masuk selayar.
              // Zoom sudah dalam skala Windy (Aerosol + 1).
              if (isFinite(data.lat) && isFinite(data.lon) && isFinite(data.zoom)) {
                kameraTarget = { pusat: [data.lat, data.lon], zoom: data.zoom };
                tampilanAwal = { pusat: [data.lat, data.lon], zoom: data.zoom };
                if (window.W && window.W.map && window.W.map.map) {
                  try {
                    window.W.map.map.setView(kameraTarget.pusat, kameraTarget.zoom, { animate: false });
                    const mml = window.W.map.map._maplibreMap;
                    if (mml && typeof mml.resize === 'function') mml.resize();
                  } catch (e) {}
                }
              }
            } else if (data.type === 'WINDY_ACTIVE') {
              if (window.W && window.W.store && typeof window.W.store.set === 'function') {
                try {
                  if (window.W.store.get('product') !== 'cams') {
                    window.W.store.set('product', 'cams');
                  }
                  if (window.W.store.get('overlay') !== 'aqi') {
                    window.W.store.set('overlay', 'aqi');
                  }
                } catch(e) {}
              }
              if (window.W && window.W.map && window.W.map.map) {
                try {
                  window.W.map.map.invalidateSize();
                } catch(e) {}
              }
            } else if (data.type === 'SET_TEMA') {
              const zb = document.getElementById('custom-zoom-controls');
              if (zb) {
                zb.classList.remove('tema-light', 'tema-dark');
                zb.classList.add(data.tema === 'light' ? 'tema-light' : 'tema-dark');
              }
              if (data.tema === 'light') {
                document.documentElement.classList.add('light');
                document.documentElement.classList.remove('dark');
              } else {
                document.documentElement.classList.add('dark');
                document.documentElement.classList.remove('light');
              }
            }
          });

          // Intercept click container kosong agar tidak memicu popup bawaan Windy
          document.addEventListener('click', function(e) {
            if (e.target && (
              e.target.closest('.leaflet-wilayahPane-pane') ||
              e.target.closest('.leaflet-angkaPane-pane') ||
              e.target.closest('.provinsi-layer') ||
              e.target.closest('.leaflet-overlay-pane') ||
              e.target.closest('.leaflet-marker-pane') ||
              e.target.closest('.peta-angka') ||
              e.target.closest('#custom-zoom-controls') ||
              e.target.closest('#logo') ||
              e.target.closest('#plugin-rhbottom') ||
              e.target.closest('.rhpane__bottom-messages')
            )) {
              return;
            }
            if (e.target && (e.target.closest('#map-container') || e.target.tagName === 'CANVAS')) {
              e.stopImmediatePropagation();
            }
          }, true);

          // Tangkap event wheel: cegah zoom peta dan teruskan ke parent window agar halaman dapat di-scroll naik/turun
          window.addEventListener('wheel', function(e) {
            // Konsol /peta: biarkan peta Windy menangani roda sendiri (zoom biasa).
            if (KONSOL) return;
            // Jika pengguna menekan Ctrl atau Meta (Cmd), izinkan perbesaran peta
            if (e.ctrlKey || e.metaKey) {
              e.preventDefault();
              e.stopPropagation();
              if (window.W && window.W.map && window.W.map.map) {
                const map = window.W.map.map;
                if (e.deltaY < 0) {
                  map.zoomIn(0.5);
                } else {
                  map.zoomOut(0.5);
                }
              }
              return;
            }

            // Gulir biasa: cegah scrolling peramban bawaan ganda dan teruskan pergerakan scroll ke parent window (Lenis)
            e.preventDefault();
            e.stopPropagation();

            if (window.parent && window.parent !== window) {
              window.parent.postMessage({
                type: 'IFRAME_WHEEL',
                deltaY: e.deltaY,
                deltaX: e.deltaX,
                deltaMode: e.deltaMode
              }, '*');
            }
          }, { capture: true, passive: false });

          function checkAndInit() {
            enforceLatestAQI();
            if (!mapInitialized && window.W && window.W.map && window.W.map.map && typeof L !== 'undefined') {
              initAdministrativeMap();
            }
          }

          if (document.readyState === 'loading') {
            document.addEventListener('DOMContentLoaded', checkAndInit);
          } else {
            checkAndInit();
          }

          let checks = 0;
          const interval = setInterval(() => {
            checkAndInit();
            checks++;
            if (mapInitialized) {
              clearInterval(interval);
            }
          }, 350);
        })();
      </script>
    `;

    let modifiedHtml = html;
    if (modifiedHtml.includes("<head>")) {
      modifiedHtml = modifiedHtml.replace("<head>", `<head>${baseTag}${preInitScript}${customStyles}`);
    } else {
      modifiedHtml = baseTag + preInitScript + customStyles + modifiedHtml;
    }

    if (modifiedHtml.includes("</body>")) {
      modifiedHtml = modifiedHtml.replace("</body>", `${customScript}</body>`);
    } else {
      modifiedHtml += customScript;
    }

    return new Response(modifiedHtml, {
      status: 200,
      headers: {
        "Content-Type": "text/html; charset=UTF-8",
        "Cache-Control": "no-cache, no-store, must-revalidate",
        "X-Frame-Options": "SAMEORIGIN",
        "Content-Security-Policy": "frame-ancestors 'self'",
      },
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return new NextResponse(`Error fetching Windy AQI: ${message}`, { status: 500 });
  }
}
