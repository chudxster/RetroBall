# Headless tests: builds a page per test from the CURRENT index.html (game scripts from ../src, plus lib.js before
# them and the test after them), runs it in headless Edge and reads the results from the page title.
#   powershell -ExecutionPolicy Bypass -File tests\run.ps1            all tests
#   powershell -ExecutionPolicy Bypass -File tests\run.ps1 stats      just the ones whose name has "stats"
param([string]$Only = '')
$ErrorActionPreference = 'Continue' # Edge logs to stderr, which Windows PowerShell would otherwise treat as fatal
$here = $PSScriptRoot
$out = Join-Path $here 'out'
New-Item -ItemType Directory -Force $out | Out-Null
$edge = @("${env:ProgramFiles(x86)}\Microsoft\Edge\Application\msedge.exe", "$env:ProgramFiles\Microsoft\Edge\Application\msedge.exe") | Where-Object { Test-Path $_ } | Select-Object -First 1
if (-not $edge) { throw 'Microsoft Edge not found' }
$url = { param($file) 'file:///' + $file.Replace([string][char]92, '/') }

function Build($test) {
  $html = [IO.File]::ReadAllText((Join-Path $here '..\index.html'))
  $html = $html.Replace('src="src/', 'src="../../src/').Replace('href="style.css"', 'href="../../style.css"')
  $html = $html.Replace('<script src="../../src/config.js"></script>', "<script src=""../lib.js""></script>`n  <script src=""../../src/config.js""></script>")
  $html = $html.Replace('<script src="../../src/main.js"></script>', "<script src=""../../src/main.js""></script>`n  <script src=""../$test""></script>")
  $page = Join-Path $out ($test -replace '\.js$', '.html')
  [IO.File]::WriteAllText($page, $html)
  return $page
}

function Run($page, $query, $dataDir, $budget = 60000) {
  $edgeArgs = @('--headless=new', '--disable-gpu', '--allow-file-access-from-files', "--virtual-time-budget=$budget", '--dump-dom')
  if ($dataDir) { $edgeArgs += "--user-data-dir=$dataDir" }
  $dom = & $edge @edgeArgs ((& $url $page) + $query) 2>$null | Out-String
  if ($dom -match '<title>RES\|([^<]*)') { return $Matches[1] -split '\|' }
  return @('FAIL no results (the page never finished)')
}

$results = @()
$tests = Get-ChildItem $here -Filter '*.test.js' | Where-Object { $_.Name -like "*$Only*" }
foreach ($t in $tests) {
  $page = Build $t.Name
  $lines = switch ($t.Name) {
    'career.test.js' {
      $dataDir = Join-Path $out 'profile'
      if (Test-Path $dataDir) { Remove-Item -Recurse -Force $dataDir }
      (Run $page '?step=a' $dataDir) + (Run $page '?keep&step=b' $dataDir)
    }
    # A host and a guest side by side, on this computer's channel and then through the internet relay (that one
    # needs a connection; its results are marked "(internet)").
    'online.test.js' {
      $inner = & $url $page
      foreach ($net in 'local', 'internet') {
        $outer = Join-Path $out "online-$net.html"
        [IO.File]::WriteAllText($outer, "<!doctype html><title>WAIT</title><script>const r=[];addEventListener('message',(e)=>{if(e.data==='DONE'){if(++window.d===2)document.title='RES|'+r.join('|');}else r.push(e.data);});window.d=0;</script><iframe src=""${inner}?net=${net}#host""></iframe><iframe src=""${inner}?net=${net}#guest""></iframe>")
        Run $outer '' $null 12000 | ForEach-Object { if ($net -eq 'internet') { "$_ (internet)" } else { $_ } }
      }
    }
    'testing-tab.test.js' { Run $page '?dev=1' $null }
    default { Run $page '' $null }
  }
  foreach ($l in $lines) { $results += "$($t.BaseName -replace '\.test$', ''): $l" }
}
$results | ForEach-Object { if ($_ -match ': FAIL') { Write-Host $_ -ForegroundColor Red } else { Write-Host $_ } }
$failed = ($results | Where-Object { $_ -match ': FAIL' }).Count
Write-Host ''
Write-Host "$($results.Count - $failed) passed, $failed failed"
exit [int]($failed -gt 0)
