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
            if ($size -le 128) {
                $background = [System.Drawing.SolidBrush]::new([System.Drawing.Color]::FromArgb(17, 12, 16))
                $border = [System.Drawing.Pen]::new([System.Drawing.Color]::FromArgb(223, 45, 68), [single][Math]::Max(1, $size / 48))
                $radius = [single]($size * 0.2)
                $path = [System.Drawing.Drawing2D.GraphicsPath]::new()
                try {
                    $r = [single]($radius * 2)
                    $s = [single]($size - 1)
                    $path.AddArc(0, 0, $r, $r, 180, 90)
                    $path.AddArc($s - $r, 0, $r, $r, 270, 90)
                    $path.AddArc($s - $r, $s - $r, $r, $r, 0, 90)
                    $path.AddArc(0, $s - $r, $r, $r, 90, 90)
                    $path.CloseFigure()
                    $graphics.FillPath($background, $path)
                    $graphics.DrawPath($border, $path)
                } finally { $path.Dispose(); $background.Dispose(); $border.Dispose() }
            }
            $pad = if ($size -le 128) { [single]($size * 0.055) } else { [single]($size * 0.02) }
            $dest = [System.Drawing.RectangleF]::new($pad, $pad, [single]($size - 2 * $pad), [single]($size - 2 * $pad))
            $graphics.DrawImage($master, $dest, $crop, [System.Drawing.GraphicsUnit]::Pixel)
            $output = if ($size -eq 256) { Join-Path $projectRoot 'scout-raccoon-logo.png' } else { Join-Path $projectRoot "icon-$size.png" }
            $bitmap.Save($output, [System.Drawing.Imaging.ImageFormat]::Png)
        } finally { $graphics.Dispose(); $bitmap.Dispose() }
    }
} finally { $master.Dispose() }
