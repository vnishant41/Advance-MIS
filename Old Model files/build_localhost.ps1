$base = "c:\Users\admin\Videos\Nishant\Aniygravity\claude mis"
$styles  = Get-Content (Join-Path $base "Styles.html") -Raw -Encoding UTF8
$sidebar = Get-Content (Join-Path $base "Sidebar.html") -Raw -Encoding UTF8
$views   = Get-Content (Join-Path $base "Views.html") -Raw -Encoding UTF8
$scripts = Get-Content (Join-Path $base "Scripts.html") -Raw -Encoding UTF8
$mock    = Get-Content (Join-Path $base "localhost.html") -Raw -Encoding UTF8

# Extract the mock <script> block
$mockScript = ""
if ($mock -match '(?s)(<script>.*?</script>)') {
    $mockScript = $Matches[1]
}

$today = (Get-Date).ToString("yyyy-MM-dd")

$html = @"
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <title>MIS Tracker v8.2 — Local Preview</title>
  <meta name="description" content="Internal Research Operations Platform — built on Google Workspace.">
  $styles
</head>
<body>

  $mockScript

  <!-- ── SPIRAL PRELOADER ──────────────────────────────────────── -->
  <div id="preloader" class="preloader">
    <div class="spiral-wrap">
      <div class="spiral-ring r1"></div>
      <div class="spiral-ring r2"></div>
      <div class="spiral-ring r3"></div>
      <div class="spiral-dot"></div>
    </div>
    <div class="preloader-label">Loading MIS…</div>
  </div>

  <div class="app">

    $sidebar

    <div class="main">

      <div id="topbar">
        <div id="userBadge"></div>
        <div style="display:flex; align-items:center; gap:8px;">
          <div id="windowBadge"></div>
          <button class="theme-toggle" onclick="toggleTheme()" title="Toggle dark/light">🌓</button>
          <div class="user-menu-wrap" id="userMenuWrap">
            <button class="user-menu-btn" id="userMenuBtn" onclick="toggleUserMenu()">
              <span class="user-avatar" id="userMenuAvatar">N</span>
              <span class="chevron">▾</span>
            </button>
            <div class="user-dropdown" id="userDropdown">
              <div class="ud-header">
                <div class="ud-name" id="udName">—</div>
                <div class="ud-role" id="udRole">—</div>
              </div>
              <button class="ud-item" onclick="openProfileModal()">🔑 Change Password</button>
              <div class="ud-divider"></div>
              <button class="ud-item danger" onclick="doLogout()">⏻ Logout</button>
            </div>
          </div>
        </div>
      </div>

      $views

      <div id="toast" class="toast"></div>

      <footer class="app-footer">
        <span class="footer-version">MIS v8.2</span>
        <span class="footer-sep">·</span>
        <span class="footer-credit">by Nishant</span>
      </footer>
    </div>

  </div>

  $scripts

</body>
</html>
"@

[System.IO.File]::WriteAllText((Join-Path $base "localhost.html"), $html, [System.Text.Encoding]::UTF8)
Write-Host "localhost.html built successfully!"
Write-Host "Styles: $($styles.Length) chars"
Write-Host "Sidebar: $($sidebar.Length) chars"
Write-Host "Views: $($views.Length) chars"
Write-Host "Scripts: $($scripts.Length) chars"
Write-Host "Total: $($html.Length) chars"
