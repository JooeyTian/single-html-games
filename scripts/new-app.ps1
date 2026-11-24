param(
  [Parameter(Mandatory = $true, Position = 0)]
  [string]$Name
)

# 创建新应用：从 apps/_template 复制一份到 apps/<Name>
$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $PSScriptRoot

if ($Name -notmatch '^[a-z0-9]+(-[a-z0-9]+)*$') {
  Write-Error '应用名只能包含小写字母、数字和连字符（如 my-game），不能以连字符开头或结尾。'
  exit 1
}

$template = Join-Path $root 'apps\_template'
$target = Join-Path $root "apps\$Name"

if (-not (Test-Path $template)) {
  Write-Error "找不到模板文件夹：$template"
  exit 1
}
if (Test-Path $target) {
  Write-Error "应用已存在：$target"
  exit 1
}

Copy-Item -Path $template -Destination $target -Recurse
Write-Host "已创建应用：$target\index.html"
Write-Host '下一步：编辑该文件，并在根目录 index.html 和 README.md 中登记链接。'
