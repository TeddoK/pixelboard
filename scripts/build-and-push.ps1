param(
  [Parameter(Mandatory = $true)] [string] $User,
  [string] $Tag = "1.1"
)
Set-Location (Join-Path $PSScriptRoot "..")
foreach ($svc in "canvas", "history", "web") {
  docker build -t "$User/pixelboard-${svc}:$Tag" "services/$svc"
  if ($LASTEXITCODE -ne 0) { throw "build of $svc failed" }
  docker push "$User/pixelboard-${svc}:$Tag"
  if ($LASTEXITCODE -ne 0) { throw "push of $svc failed" }
}
