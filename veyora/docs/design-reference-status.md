# Design reference status (honest record)

* `design-reference/index.html` was **not present** in the delivered
  workspace, and no ZIP export was found anywhere in it (checked the
  workspace root recursively on 2026-10-04).
* The Stitch preview link redirects to a Google sign-in page; the Figma link
  requires a Figma account. Neither could be inspected, and neither is
  claimed to have been inspected.
* The directory `design-reference/` is preserved here for the original
  export: if it is re-supplied, drop it in unchanged — the app does not
  depend on it.

Because the assignment brief fully documents the reference's visual identity,
the application reconstructs it from those specifications:

* Palette: background #F7F8F5, surfaces #FFFFFF, text #182521, muted #66756F,
  accent #096C60, sage #E8F1EC, borders #DEE5DF, dark hero #101C19.
* Manrope-style typography, rounded cards, thin borders, restrained shadows.
* Landing headline kept verbatim: "A little less complexity. A lot more care."
* Floating-phone composition with patient/doctor/PM screen previews.
* Branding standardized to **VEYORA** everywhere (no leftover CarePilot text).
* CDN React / runtime Babel / inline demo state replaced by a real build,
  real backend and persistent database, as required.

If the original export is recovered, compare against this build and port any
additional screens/wording that were lost; nothing here blocks that.
