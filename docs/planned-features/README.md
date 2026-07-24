# Planned features

**Status**: Proposals, not yet adopted. Nothing here is built.

Forward-looking plans for capabilities Boxdex may add. Each feature is a **subdirectory with
its own `README.md`** as the entry point; larger features add supporting docs alongside it.

These follow the same posture as [`methodology.md`](../methodology.md) and
[ADR-012](../decisions/012-data-provenance-and-model-limits.md): state what a feature would
compute and where it breaks, first. When a plan is adopted, its durable decisions become
focused Accepted ADRs in [`../decisions/`](../decisions/) (one decision each), and the plan
is executed and then retired.

## Convention

- One directory per feature: `docs/planned-features/<feature>/`.
- Every feature directory has a `README.md` that is the plan's front door.
- Supporting docs (references, model notes, ADR drafts) live beside that README.

## Features

| Feature | Entry | What it is |
|---|---|---|
| Simulation engine | [`simulation/README.md`](./simulation/README.md) | Loudspeaker box+driver and array/spatial simulation, client-side TypeScript with an offline Python oracle. Includes the feature reference, Hornresp model notes, black-box characterization method, and a draft engine ADR. |
| Cutlist & CNC export | [`cutlist/README.md`](./cutlist/README.md) | Material-optimized, CAM-ready cut files (layered DXF + SVG preview) from a chosen enclosure or stack. |
