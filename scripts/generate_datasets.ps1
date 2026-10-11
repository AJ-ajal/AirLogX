# Generate valid cryptographic dataset for AIRLOG X
$hasher = [System.Security.Cryptography.SHA256]::Create()

function Get-Sha256($str) {
    $bytes = [System.Text.Encoding]::UTF8.GetBytes($str)
    $hash = [System.BitConverter]::ToString($hasher.ComputeHash($bytes)).Replace('-','').ToLower()
    return $hash
}

$rows = @()
$prevHash = "0000000000000000000000000000000000000000000000000000000000000000"

# 25 realistic sensor telemetry rows
$baseAir = @(
    58.2, 60.5, 62.1, 64.0, 68.4, 75.2, 88.6, 112.4, 138.7, 154.2,
    148.9, 132.0, 115.5, 96.3, 85.0, 77.8, 72.4, 69.1, 66.8, 64.5,
    62.0, 60.8, 59.5, 58.9, 58.0
)

$baseTemp = @(
    23.5, 23.6, 23.7, 23.9, 24.1, 24.3, 24.5, 24.8, 25.0, 25.3,
    25.5, 25.4, 25.2, 25.0, 24.8, 24.7, 24.5, 24.4, 24.3, 24.2,
    24.1, 24.0, 23.9, 23.8, 23.7
)

$basePres = @(
    1013.4, 1013.3, 1013.5, 1013.2, 1013.1, 1013.0, 1012.8, 1012.7, 1012.5, 1012.4,
    1012.6, 1012.7, 1012.9, 1013.0, 1013.1, 1013.2, 1013.3, 1013.4, 1013.5, 1013.5,
    1013.6, 1013.7, 1013.6, 1013.5, 1013.4
)

$startTime = [DateTime]::Parse("2026-10-11 14:00:00")

for ($i = 0; $i -lt 25; $i++) {
    $idx = $i + 1
    $curTime = $startTime.AddMinutes($i * 2.5)
    $dStr = $curTime.ToString("yyyy-MM-dd")
    $tStr = $curTime.ToString("HH:mm:ss")
    $air = [string]::Format([System.Globalization.CultureInfo]::InvariantCulture, "{0:0.0}", $baseAir[$i])
    $temp = [string]::Format([System.Globalization.CultureInfo]::InvariantCulture, "{0:0.0}", $baseTemp[$i])
    $pres = [string]::Format([System.Globalization.CultureInfo]::InvariantCulture, "{0:0.0}", $basePres[$i])

    # Hash preimage formula: index,date,time,air_quality,temperature,pressure,prev_hash
    $preimage = "$idx,$dStr,$tStr,$air,$temp,$pres,$prevHash"
    $currHash = Get-Sha256 $preimage

    $rows += [PSCustomObject]@{
        index = $idx
        date = $dStr
        time = $tStr
        air_quality = $air
        temperature = $temp
        pressure = $pres
        prev_hash = $prevHash
        curr_hash = $currHash
    }

    $prevHash = $currHash
}

# 1. Write sample_airlog_data.csv
$csvHeader = "index,date,time,air_quality,temperature,pressure,prev_hash,curr_hash"
$csvLines = @($csvHeader)
foreach ($r in $rows) {
    $csvLines += "$($r.index),$($r.date),$($r.time),$($r.air_quality),$($r.temperature),$($r.pressure),$($r.prev_hash),$($r.curr_hash)"
}
$csvLines | Out-File -FilePath "sample_airlog_data.csv" -Encoding UTF8

# 2. Write tampered_airlog_sample.csv (Row 14 has air_quality altered from 96.3 to 350.0 without recomputing hash)
$tamperedLines = @($csvHeader)
for ($i = 0; $i -lt $rows.Count; $i++) {
    $r = $rows[$i]
    if ($r.index -eq 14) {
        # Alter air quality to simulate unauthorized data injection / tampering
        $tamperedLines += "$($r.index),$($r.date),$($r.time),350.0,$($r.temperature),$($r.pressure),$($r.prev_hash),$($r.curr_hash)"
    } else {
        $tamperedLines += "$($r.index),$($r.date),$($r.time),$($r.air_quality),$($r.temperature),$($r.pressure),$($r.prev_hash),$($r.curr_hash)"
    }
}
$tamperedLines | Out-File -FilePath "tampered_airlog_sample.csv" -Encoding UTF8

# 3. Write js/sample-data.js
$json = $rows | ConvertTo-Json -Depth 4
$jsContent = @"
/**
 * AIRLOG X - Cryptographically Verified Benchmark Sample Dataset
 * Generated for STM32F411CEU6 + MQ-135 + BMP280 + DS3231 Simulation
 * Each record is linked via SHA-256 hash chaining.
 */
const SAMPLE_AIRLOG_RECORDS = $json;

if (typeof module !== 'undefined' && module.exports) {
  module.exports = { SAMPLE_AIRLOG_RECORDS };
}
"@
$jsContent | Out-File -FilePath "js/sample-data.js" -Encoding UTF8

Write-Output "Successfully generated valid CSV, tampered CSV, and js/sample-data.js"
