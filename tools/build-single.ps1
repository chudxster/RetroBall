# Builds RetroBall.html: the whole game in one self-contained HTML5 file (the stylesheet, the menus' font and every
# script inside it), so it runs from that one file with nothing else next to it - opened from a USB stick, Google
# Drive or a download, or served on its own. Run it after changing the game:
#   powershell -ExecutionPolicy Bypass -File tools\build-single.ps1          (or -Out somewhere\else.html)
# The font is Silkscreen (SIL Open Font License, tools\silkscreen-latin.woff2). Only Online play still needs the
# internet (its relay).
param([string]$Out = '')
$root = Split-Path $PSScriptRoot -Parent
$read = { param($path) [IO.File]::ReadAllText((Join-Path $root $path)) }

$html = & $read 'index.html'
$font = [Convert]::ToBase64String([IO.File]::ReadAllBytes((Join-Path $PSScriptRoot 'silkscreen-latin.woff2')))
$fontFace = "@font-face {`n  font-family: 'Silkscreen';`n  font-style: normal;`n  font-weight: 400;`n  font-display: swap;`n  src: url(data:font/woff2;base64,$font) format('woff2');`n}`n"

# The font and the stylesheet, inline (the Google Fonts links go: the font is in the file).
$html = [regex]::Replace($html, '\s*<link rel="preconnect"[^>]*>', '')
$html = [regex]::Replace($html, '\s*<!-- The menus'' font[^>]*-->\s*<link rel="stylesheet" href="https://fonts[^>]*>', '')
$css = & $read 'style.css'
$html = $html.Replace('<link rel="stylesheet" href="style.css">', "<style>`n$fontFace$css</style>")

# Every script, inline, in the same order.
$html = [regex]::Replace($html, '<script src="(src/[^"]+)"></script>', {
  param($m)
  $code = & $read $m.Groups[1].Value
  if ($code -match '</script') { throw "$($m.Groups[1].Value) contains </script, which would end the inline script early" }
  "<script>/* $($m.Groups[1].Value) */`n$code</script>"
})
if ($html -match '<script src=|href="style.css"') { throw 'something was left as a separate file' }

$out = if ($Out) { $Out } else { Join-Path $root 'RetroBall.html' }
[IO.File]::WriteAllText($out, $html, (New-Object Text.UTF8Encoding $false))
"Wrote $out ($([math]::Round((Get-Item $out).Length / 1KB)) KB)"
