# generar-contrasena.ps1 - contrasena aleatoria fuerte para rotar una cuenta de servicio (claude-dev,
# bot, claude-qa) sin que pase por la pantalla, el disco, el historial ni una linea de comandos.
# 1. Genera la contrasena aqui con el generador criptografico del sistema (RandomNumberGenerator),
#    sin sesgo de modulo: minimo una minuscula, una mayuscula, un digito y un simbolo; mezclada.
# 2. La deja SOLO en el portapapeles. No la imprime, no la escribe a disco ni la manda a ningun
#    proceso: solo existe en la memoria de este script y en el portapapeles.
# 3. A los 30 s (o con una tecla antes) vacia el portapapeles, pero solo si todavia contiene esa
#    misma contrasena (si copiaste otra cosa entre tanto, no la toca).
# Solo ASCII, letras, digitos y los simbolos - _ . + = @ : sirve pegada en el portal, en un .env,
# en JSON y en una URL sin escapar nada. No lleva comillas, barra invertida, $, #, espacios ni
# nada que el shell, SQL o el .env interpreten. El minimo de Supabase es de 12 (AUT-04); el
# valor por omision es de 28.
# Limite conocido: el historial del portapapeles de Windows (Win+V) y el portapapeles en la nube
# pueden conservar una copia. Antes de generar, desactivalos o, despues, en Win+V elige
# "Borrar todo".
# Archivo solo ASCII a proposito: PowerShell 5.1 lee los .ps1 sin BOM como ANSI.
#
# Ejemplos (desde la raiz del repo):
#   .\tools\seguridad\generar-contrasena.ps1                  28 caracteres, borrado a los 30 s
#   .\tools\seguridad\generar-contrasena.ps1 -Longitud 40 -Segundos 45
#   .\tools\seguridad\generar-contrasena.ps1 -Probar          solo comprueba el generador: no toca el
#                                                             portapapeles ni muestra ninguna contrasena
# Codigo de salida: 0 bien; 1 uso o fallo (no queda nada en el portapapeles).
[CmdletBinding()]
param(
  [ValidateRange(16, 64)]
  [int]$Longitud = 28,
  [ValidateRange(5, 300)]
  [int]$Segundos = 30,
  [switch]$Probar
)

$ErrorActionPreference = 'Stop'

$minusculas = 'abcdefghijklmnopqrstuvwxyz'
$mayusculas = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'
$digitos = '0123456789'
$simbolos = '-_.+=@'
$todos = $minusculas + $mayusculas + $digitos + $simbolos

$rng = [Security.Cryptography.RandomNumberGenerator]::Create()

# Entero uniforme en 0..($max-1): descarta los bytes que darian sesgo por el modulo.
function Indice-Al-Azar([int]$max) {
  $limite = 256 - (256 % $max)
  $b = New-Object byte[] 1
  while ($true) {
    $rng.GetBytes($b)
    if ([int]$b[0] -lt $limite) { return ([int]$b[0] % $max) }
  }
}

function Un-Caracter([string]$conjunto) { $conjunto[(Indice-Al-Azar $conjunto.Length)] }

function Nueva-Contrasena([int]$n) {
  $c = New-Object 'System.Collections.Generic.List[char]'
  $c.Add((Un-Caracter $minusculas)); $c.Add((Un-Caracter $mayusculas))
  $c.Add((Un-Caracter $digitos)); $c.Add((Un-Caracter $simbolos))
  while ($c.Count -lt $n) { $c.Add((Un-Caracter $todos)) }
  # Fisher-Yates con el mismo generador
  for ($i = $c.Count - 1; $i -gt 0; $i--) {
    $j = Indice-Al-Azar ($i + 1)
    $t = $c[$i]; $c[$i] = $c[$j]; $c[$j] = $t
  }
  -join $c
}

function Cumple([string]$p, [int]$n) {
  ($p.Length -eq $n) -and ($p -cmatch '[a-z]') -and ($p -cmatch '[A-Z]') -and ($p -cmatch '[0-9]') -and
  ($p -cmatch '[-_.+=@]') -and ($p -cmatch '^[A-Za-z0-9_.+=@-]+$')
}

try {
  if ($Probar) {
    # Comprobacion sin salida de valores: forma, ASCII y que no se repita entre generaciones.
    $malas = 0; $vistas = New-Object 'System.Collections.Generic.HashSet[string]'
    for ($k = 0; $k -lt 300; $k++) {
      $p = Nueva-Contrasena $Longitud
      if (-not (Cumple $p $Longitud)) { $malas++ }
      [void]$vistas.Add($p)
    }
    $p = $null
    if ($malas -gt 0 -or $vistas.Count -ne 300) {
      Write-Host "FALLO: $malas contrasenas con forma invalida y $($vistas.Count) distintas de 300." -ForegroundColor Red
      exit 1
    }
    Write-Host "OK: 300 contrasenas de $Longitud caracteres, todas con minuscula, mayuscula, digito y simbolo, solo ASCII y sin repetidas. No se uso el portapapeles." -ForegroundColor Green
    exit 0
  }

  if (-not (Get-Command Set-Clipboard -ErrorAction SilentlyContinue)) {
    Write-Host 'No encuentro Set-Clipboard (PowerShell 5.0 o superior en Windows).' -ForegroundColor Red
    exit 1
  }

  $clave = Nueva-Contrasena $Longitud
  if (-not (Cumple $clave $Longitud)) { throw 'El generador devolvio una contrasena de forma invalida: no se copio nada.' }

  Set-Clipboard -Value $clave
  Write-Host "Contrasena de $Longitud caracteres copiada al portapapeles (no se muestra). Pegala ahora con Ctrl+V." -ForegroundColor Green
  Write-Host "Se borra en $Segundos s; cualquier tecla la borra ya." -ForegroundColor Yellow

  $restante = $Segundos
  while ($restante -gt 0) {
    Start-Sleep -Seconds 1
    $restante--
    try {
      if ($Host.UI.RawUI.KeyAvailable) { [void]$Host.UI.RawUI.ReadKey('NoEcho,IncludeKeyDown'); break }
    } catch { }
  }
}
finally {
  # Vacia el portapapeles solo si todavia tiene la contrasena generada
  if ($clave) {
    try {
      $actual = Get-Clipboard -Raw
      if ($actual -is [string] -and $actual.TrimEnd("`r", "`n") -ceq $clave) {
        Set-Clipboard -Value ' '
        Write-Host 'Portapapeles vaciado.' -ForegroundColor Green
      } else {
        Write-Host 'El portapapeles ya no tenia la contrasena: no se toco.' -ForegroundColor Yellow
      }
    } catch {
      Write-Host 'No pude comprobar el portapapeles: vacialo a mano (Win+V > Borrar todo).' -ForegroundColor Yellow
    }
  }
  $clave = $null
  $actual = $null
  $rng.Dispose()
  [GC]::Collect()
}
