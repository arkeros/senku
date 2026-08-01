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
    {{HEAD}}
  </head>
  <body>
    <div id="root"></div>
    {{SCRIPTS}}
  </body>
</html>
