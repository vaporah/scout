Add-Type -AssemblyName System.Drawing

$projectRoot = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
$masterPath = Join-Path $projectRoot 'assets\scout-raccoon-master.png'
if (-not (Test-Path -LiteralPath $masterPath)) { throw "Missing logo master: $masterPath" }

$master = [System.Drawing.Bitmap]::new($masterPath)
try {
    $crop = [System.Drawing.Rectangle]::new(85, 105, 1110, 1080)
    foreach ($size in @(16, 32, 48, 128, 256)) {
        $bitmap = [System.Drawing.Bitmap]::new($size, $size, [System.Drawing.Imaging.PixelFormat]::Format32bppArgb)
        $graphics = [System.Drawing.Graphics]::FromImage($bitmap)
        try {
            $graphics.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
            $graphics.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
            $graphics.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::HighQuality
            $graphics.Clear([System.Drawing.Color]::Transparent)
            # The mascot itself is the mark. Keep every packaged size transparent rather
            # than drawing a second app tile behind it; Chromium supplies its own toolbar
            # and store surfaces, and the extra square made the raccoon look tiny.
            $pad = [single]($size * 0.02)
            $dest = [System.Drawing.RectangleF]::new($pad, $pad, [single]($size - 2 * $pad), [single]($size - 2 * $pad))
            $graphics.DrawImage($master, $dest, $crop, [System.Drawing.GraphicsUnit]::Pixel)
            $output = if ($size -eq 256) { Join-Path $projectRoot 'scout-raccoon-logo.png' } else { Join-Path $projectRoot "icon-$size.png" }
            $bitmap.Save($output, [System.Drawing.Imaging.ImageFormat]::Png)
        } finally { $graphics.Dispose(); $bitmap.Dispose() }
    }
} finally { $master.Dispose() }
