[CmdletBinding()]
param([Parameter(Mandatory=$true)][string]$Executable,[string]$DshHome)
$ErrorActionPreference='Stop'
if(!$DshHome){$DshHome=$env:DSH_HOME}
if(!$DshHome){$DshHome=Join-Path $env:USERPROFILE '.dsh'}
$exe=Get-Item -LiteralPath $Executable
if($exe.Name -ne 'Oxford.exe' -or $exe.VersionInfo.FileVersion -ne '1.3.1.0'){throw 'Select a trusted Oxford 1.3.1.0 build compiled with the DSH stdio adapter.'}
$cfgDir=Join-Path $DshHome 'toolkit'
[IO.Directory]::CreateDirectory($cfgDir)|Out-Null
$file=Join-Path $cfgDir 'oxford.json'
$cfg=@{protocol=1;executable=$exe.FullName;sha256=(Get-FileHash -LiteralPath $exe.FullName -Algorithm SHA256).Hash}
$temp=Join-Path $cfgDir ('oxford-'+[guid]::NewGuid().ToString('N')+'.tmp')
[IO.File]::WriteAllText($temp,($cfg|ConvertTo-Json),[Text.UTF8Encoding]::new($false))
if([IO.File]::Exists($file)){[IO.File]::Replace($temp,$file,($file+'.bak'))}else{[IO.File]::Move($temp,$file)}
Write-Output 'Bound Oxford to this local DSH home. No instrument or application was opened.'
