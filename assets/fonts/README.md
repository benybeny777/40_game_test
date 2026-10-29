# UI font provenance

BIZ UDPGothic Regular/Bold, SIL Open Font License 1.1. The unchanged official license is in OFL.txt and is readable in the in-game Help page.

Official upstream: https://github.com/googlefonts/morisawa-biz-ud-gothic

Pinned commit: `18934af56b9c003ca58c54bffbf226848cb11032`. Retrieved 2026-10-29.

Original files at that commit:

- `fonts/ttf/BIZUDPGothic-Regular.ttf`: SHA256 `258d7156c165f2ff774b6efee637c22c3b950de0d8a10e501137061bc8085d01`
- `fonts/ttf/BIZUDPGothic-Bold.ttf`: SHA256 `30eba52fc837e8b62c97d4b82e6706583149fb7294e3712dd71a655eaea80a90`
- `OFL.txt`: SHA256 `e753d7155d53c747d037a445e584c8ecfca6dd79846db610417e282a736b28bc`

Retrieve from `https://raw.githubusercontent.com/googlefonts/morisawa-biz-ud-gothic/18934af56b9c003ca58c54bffbf226848cb11032/` plus the paths above.

Conversion environment: Python 3.12, fonttools 4.60.1, brotli 1.2.1, zopfli 0.4.3. Install with pip `--no-cache-dir --target` into an isolated temporary directory. Verify the original hashes, then convert each file:

```python
from fontTools.ttLib import TTFont
font = TTFont(source_path, recalcTimestamp=False)
font.flavor = "woff2"
font.save(output_path)
```

No subsetting or outline/name modification. Both faces retain 13,932 glyphs and 11,741 Unicode cmap entries. Glyph order, cmap and horizontal metrics were compared after conversion. All 1,012 Japanese/CJK characters in the current source are covered. The original timestamp is retained for deterministic conversion.

| Runtime file | Bytes | SHA256 |
|---|---:|---|
| BIZUDPGothic-Regular.woff2 | 2199640 | 1c946054094a84b08b1c99b2239cec57f9fa0611031e4634cb3ab202784629a1 |
| BIZUDPGothic-Bold.woff2 | 2242676 | 1551af7874ec0b2f03aa2424b421c6dccd4adb4a5d469da8f7c12a9c5c890e74 |

License source check: the upstream OFL defines a format conversion as a Modified Version and clause 3 restricts Reserved Font Names. The copyright header in this pinned OFL.txt does not declare any Reserved Font Names. This is an observation of the distributed text, not a claim of completed legal review. The full license and copyright are included, and the font is bundled with the game rather than sold by itself.

Only WOFF2 is referenced by the product. No system font installation or external font service is used. Shared definition: `src/renderer/font.css`. The official copyright statement is preserved verbatim, including its upstream URL.

Cleanup boundary: removing the downloaded TTF conversion inputs and temporary `.font-tools` directory was rejected by automatic approval review on 2026-10-29. These remain unremoved; they are not product runtime dependencies or intended backups. Do not claim cleanup complete or retry by an alternative method.
