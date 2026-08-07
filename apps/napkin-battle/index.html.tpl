<!doctype html>
<html lang="es">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover" />
    <meta name="description" content="Dos bolígrafos, una servilleta y una mancha de café. Un juego para dos en la misma mesa." />
    <meta name="theme-color" content="#0D211E" />
    <title>Batalla de servilleta</title>
    <!--
      The table colour lives here rather than in a component because it has to
      cover the overscroll area above and below the document, which no element
      inside <body> can reach.
    -->
    <style>
      html,
      body {
        margin: 0;
        padding: 0;
        background-color: #0d211e;
      }
      @media (prefers-reduced-motion: reduce) {
        *,
        *::before,
        *::after {
          animation-duration: 0.001s !important;
          transition-duration: 0.001s !important;
        }
      }
    </style>
    <!--
      Home-screen icons. iOS reads `apple-touch-icon` (a raster PNG — it
      ignores SVG here) and `apple-mobile-web-app-title` for the label under
      it. The manifest covers Android and, since iOS 16.4, Safari too.
      Everything referenced here is generated from icons/icon.svg by
      //devtools/build/icons and shipped as its own image layer.
    -->
    <link rel="icon" href="/favicon.svg" type="image/svg+xml" />
    <link rel="icon" href="/favicon-32.png" sizes="32x32" type="image/png" />
    <link rel="apple-touch-icon" href="/apple-touch-icon.png" />
    <link rel="manifest" href="/manifest.webmanifest" />
    <meta name="apple-mobile-web-app-title" content="Servilleta" />
    <meta name="apple-mobile-web-app-capable" content="yes" />
    <meta name="mobile-web-app-capable" content="yes" />
    <!--
      `black`, not `black-translucent`: translucent lets content slide under
      the clock, and only the bottom inset is accounted for in these layouts.
    -->
    <meta name="apple-mobile-web-app-status-bar-style" content="black" />
    {{HEAD}}
  </head>
  <body>
    <div id="root">{{APP}}</div>
    {{SCRIPTS}}
  </body>
</html>
