"""The four Waters divisions, explained in depth for the What is Waters experience.

Built from public sources (see DIVISION_SOURCES). Product names are examples as publicly
listed by Waters, TA Instruments and BD at the time of the combination; brands may change
as the businesses integrate. Shared verbatim by SmartStart and the standalone What is Waters app.
"""

from __future__ import annotations

DIVISION_SOURCES = (
    {"label": "waters.com — Analytical Sciences: LC, MS, columns and informatics", "url": "https://www.waters.com/"},
    {"label": "TA Instruments — thermal analysis, rheology and microcalorimetry", "url": "https://www.tainstruments.com/"},
    {"label": "Wyatt Technology — light scattering, a Waters company since 2023", "url": "https://www.wyatt.com/"},
    {"label": "BD Biosciences — flow cytometry, reagents and single-cell analysis", "url": "https://www.bdbiosciences.com/"},
    {"label": "BD — microbiology, molecular and point-of-care diagnostics", "url": "https://www.bd.com/"},
)

DIVISIONS = (
    {
        "id": "analytical",
        "name": "Analytical Sciences",
        "what": "Liquid chromatography, mass spectrometry, chemistry consumables and the software around them.",
        "heritage": "The original Waters business — the company began with liquid chromatography in 1958.",
        "question": "Which molecules are in this sample, and how much of each?",
        "simple": (
            "Takes a sample apart molecule by molecule, then tells you exactly what each one is "
            "and how much of it there is — with results a regulated lab can trust."
        ),
        "how": (
            "Liquid chromatography (LC) separates a mixture: a liquid pushes the sample through a "
            "packed column and each compound leaves at its own time. Mass spectrometry (MS) then "
            "gives each compound a charge and weighs it by mass-to-charge ratio, identifying it and "
            "measuring how much is present. Columns, sample-preparation products and standards make "
            "results reproducible run after run, and lab software captures every result with an audit trail."
        ),
        "tech": [
            {"name": "UPLC and HPLC systems", "what": "ACQUITY UPLC and Alliance HPLC systems separate compounds; UPLC uses smaller particles at higher pressure for faster, sharper separations."},
            {"name": "Mass spectrometers", "what": "Xevo tandem-quadrupole and time-of-flight systems identify and quantify molecules by their mass."},
            {"name": "Columns and sample prep", "what": "Chromatography columns (for example ACQUITY UPLC BEH and XBridge) and Oasis sample-preparation products — consumables labs use every day."},
            {"name": "Informatics", "what": "Empower chromatography data software and the waters_connect platform turn raw signals into compliant results."},
            {"name": "Light scattering", "what": "Wyatt Technology instruments measure the size and molar mass of proteins, polymers and nanoparticles."},
        ],
        "used": [
            "Medicine quality control and release",
            "Biologics, peptides and oligonucleotides",
            "Food safety and contaminants",
            "Environmental testing such as PFAS in water",
            "Clinical research and toxicology",
        ],
        "example": (
            "Before a batch of tablets is released, a quality-control lab runs samples on an LC system "
            "to confirm the active ingredient is at the right strength and that impurities are below "
            "their limits. The software records every result so it can be audited later."
        ),
    },
    {
        "id": "biosciences",
        "name": "Biosciences",
        "what": "Flow cytometry, reagents and single-cell analysis for studying cells — formerly BD Biosciences.",
        "heritage": "Joined Waters from BD (Becton, Dickinson and Company) in February 2026.",
        "question": "Which cells are in this sample, and what are they doing?",
        "simple": (
            "Looks at cells one at a time — thousands every second — to tell which kinds of cells "
            "are present, how many of each, and what they are doing."
        ),
        "how": (
            "Cells are tagged with fluorescent antibodies that stick to specific markers on or inside "
            "them. A flow cytometer lines the cells up in single file and passes them through lasers. "
            "Detectors read how each cell scatters light (its size and internal complexity) and which "
            "colours it glows (its markers). Software groups cells with the same signature into "
            "populations, and a cell sorter can physically separate the cells you want to keep."
        ),
        "tech": [
            {"name": "Flow cytometers", "what": "Analysers such as BD FACSLyric and BD FACSymphony measure many markers on every cell."},
            {"name": "Cell sorters", "what": "Instruments such as BD FACSAria and BD FACSDiscover S8 separate chosen cells for further study."},
            {"name": "Reagents", "what": "Fluorescently labelled antibodies, including BD Horizon Brilliant dyes, that tag specific cell markers."},
            {"name": "Single-cell multiomics", "what": "BD Rhapsody links individual cells to the genes and proteins they express."},
            {"name": "Analysis software", "what": "FlowJo software for analysing and visualising cytometry data."},
        ],
        "used": [
            "Immunology and vaccine research",
            "Cancer research and blood disorders",
            "Cell and gene therapy",
            "Stem cell and single-cell research",
            "Drug discovery",
        ],
        "example": (
            "A cell-therapy team engineers a patient's immune cells to fight cancer. Before the cells "
            "go back to the patient, flow cytometry checks that the batch contains enough of the right "
            "cell type."
        ),
    },
    {
        "id": "diagnostics",
        "name": "Advanced Diagnostics",
        "what": "Microbiology, molecular and point-of-care testing — formerly BD Diagnostic Solutions.",
        "heritage": "Joined Waters from BD (Becton, Dickinson and Company) in February 2026.",
        "question": "Is this patient infected, with what, and which treatment will work?",
        "simple": (
            "Helps hospital and clinical labs find out quickly whether a patient has an infection, "
            "which organism is causing it, and which medicines will treat it."
        ),
        "how": (
            "Diagnosing an infection means answering three questions. Is something there? Blood "
            "culture watches a sample for signs of microbial growth, and molecular tests use PCR to "
            "detect an organism's DNA or RNA directly. What is it? Identification systems work out "
            "the species. What will treat it? Susceptibility testing exposes the organism to "
            "antibiotics to find which ones stop it growing. Automation moves samples through these "
            "steps so results reach clinicians sooner."
        ),
        "tech": [
            {"name": "Blood culture", "what": "BD BACTEC systems monitor blood samples for microbial growth — a key step in diagnosing bloodstream infections and sepsis."},
            {"name": "Identification and susceptibility", "what": "BD Phoenix identifies bacteria and tests which antibiotics they respond to."},
            {"name": "Molecular testing", "what": "BD MAX and BD COR systems detect pathogens' genetic material using PCR."},
            {"name": "Lab automation", "what": "BD Kiestra automates microbiology lab workflows, from plating to imaging."},
            {"name": "Screening and point of care", "what": "HPV testing (BD Onclarity) for cervical cancer screening, and BD Veritor rapid tests near the patient."},
        ],
        "used": [
            "Sepsis and bloodstream infections",
            "Antimicrobial resistance",
            "Respiratory and sexually transmitted infections",
            "Cervical cancer screening",
            "Gastrointestinal infections",
            "Clinical flow cytometry, such as immunophenotyping and CD4 counts",
        ],
        "example": (
            "A patient arrives with suspected sepsis. Blood culture flags growth, the organism is "
            "identified, and susceptibility testing shows which antibiotic will work — so clinicians "
            "can move from a broad guess to the right treatment."
        ),
    },
    {
        "id": "materials",
        "name": "Materials Sciences",
        "what": "Thermal analysis, rheology, microcalorimetry and mechanical testing — TA Instruments.",
        "heritage": "TA Instruments, based in New Castle, Delaware, has been part of Waters since 1996.",
        "question": "How will this material behave when it's heated, stretched or made to flow?",
        "simple": (
            "Measures how a material behaves — when it's heated, cooled, stretched, squeezed or made "
            "to flow — so products can be designed to perform and last."
        ),
        "how": (
            "Thermal analysis heats or cools a tiny sample under control. Differential scanning "
            "calorimetry (DSC) measures heat flowing in or out, revealing melting, glass transitions "
            "and curing. Thermogravimetric analysis (TGA) tracks weight loss to show composition and "
            "stability. Dynamic mechanical analysis (DMA) measures stiffness as temperature changes. "
            "Rheometers measure how materials flow and deform, from paints to polymer melts. "
            "Microcalorimeters measure the tiny heats of reactions and molecular binding."
        ),
        "tech": [
            {"name": "Thermal analysis", "what": "DSC, TGA, DMA and TMA instruments characterise melting, stability, composition and stiffness."},
            {"name": "Rheology", "what": "Rheometers such as the Discovery Hybrid Rheometer measure viscosity and viscoelasticity."},
            {"name": "Microcalorimetry", "what": "Isothermal titration calorimetry (ITC) and nano DSC measure molecular binding and protein stability."},
            {"name": "Mechanical testing", "what": "ElectroForce instruments test the fatigue and durability of biomaterials and medical devices."},
            {"name": "Thermal properties", "what": "Instruments that measure thermal conductivity and expansion for advanced materials."},
        ],
        "used": [
            "Polymers, plastics and packaging",
            "Batteries and energy materials",
            "Pharmaceutical formulation and stability",
            "Food texture and processing",
            "Coatings, adhesives and composites",
        ],
        "example": (
            "A packaging maker tests a new recycled plastic. DSC shows where it melts and how pure it "
            "is, and rheology shows whether it will flow through the moulding machine without defects."
        ),
    },
)

TOGETHER = (
    "Each division answers a different question about the unseen: Analytical Sciences, which "
    "molecules; Biosciences, which cells; Advanced Diagnostics, which infection; Materials "
    "Sciences, which behaviour. A single new medicine can need all four — LC-MS to characterise "
    "it, flow cytometry to see its effect on cells, diagnostics to guide treatment, and thermal "
    "analysis to keep its formulation stable."
)

# Core technology of the three divisions beyond LC-MS, for the "Inside the chambers" tab.
BEYOND_LCMS = (
    {
        "division": "Biosciences",
        "name": "Flow cytometry",
        "short": "FC",
        "steps": ["Label", "Interrogate", "Classify"],
        "simple": (
            "A checkpoint where every cell walks past a laser one at a time — the way it glows "
            "tells you what kind of cell it is."
        ),
        "deeper": (
            "A sheath fluid focuses the sample into a narrow stream so cells pass the laser one by "
            "one. Forward scatter relates to cell size and side scatter to internal complexity; "
            "fluorochrome-labelled antibodies report specific markers. Overlapping colours are "
            "corrected by compensation or spectral unmixing, and gating groups cells into "
            "populations. Sorters break the stream into droplets and deflect chosen cells with charge."
        ),
    },
    {
        "division": "Advanced Diagnostics",
        "name": "Infection diagnostics",
        "short": "Dx",
        "steps": ["Detect", "Identify", "Treat"],
        "simple": (
            "Find out if an infection is there, name the organism, then work out which medicine "
            "will stop it."
        ),
        "deeper": (
            "Automated blood culture incubates samples and uses sensors to detect the carbon "
            "dioxide that growing microbes produce. Identification uses biochemical reactions to "
            "name the species, and susceptibility testing finds the lowest antibiotic concentration "
            "that stops growth (the MIC). Real-time PCR amplifies a pathogen's DNA or RNA; a "
            "fluorescent signal crossing a threshold means the target is detected."
        ),
    },
    {
        "division": "Materials Sciences",
        "name": "Thermal analysis and rheology",
        "short": "TA",
        "steps": ["Heat", "Deform", "Characterise"],
        "simple": (
            "Warm a material and watch what it does, or push it and measure how it flows — the "
            "results predict how a product will perform."
        ),
        "deeper": (
            "DSC compares heat flow into a sample against a reference while temperature changes; "
            "peaks and steps mark melting, crystallisation and the glass transition. TGA records "
            "mass against temperature to reveal moisture, fillers and decomposition. A rheometer "
            "applies controlled stress or strain and reports viscosity plus the storage (G′) and "
            "loss (G″) moduli — how solid-like or liquid-like a material is."
        ),
    },
)

# Which divisions sit behind each real-world impact area (same order as IMPACT["areas"]).
IMPACT_DIVISIONS = (
    ["Analytical Sciences", "Materials Sciences", "Biosciences"],
    ["Analytical Sciences", "Materials Sciences"],
    ["Advanced Diagnostics", "Biosciences"],
    ["Advanced Diagnostics"],
)

IMPACT_MORE = (
    {"name": "Cell and gene therapy", "what": "Characterising engineered cells and the molecules that make them.", "divisions": ["Biosciences", "Analytical Sciences"]},
    {"name": "Batteries and advanced materials", "what": "Understanding thermal stability, flow and strength of new materials.", "divisions": ["Materials Sciences"]},
    {"name": "Cancer research and screening", "what": "From studying tumour and immune cells to screening for HPV.", "divisions": ["Biosciences", "Advanced Diagnostics"]},
)

# Every product or capability mention is attributed and status-labelled. Nothing here is treated
# as confirmed until validated with Waters stakeholders; flip "status" to "validated" per item.
DIVISION_SOURCE = {
    "analytical": "https://www.waters.com/",
    "biosciences": "https://www.bdbiosciences.com/",
    "diagnostics": "https://www.bd.com/",
    "materials": "https://www.tainstruments.com/",
}
for _d in DIVISIONS:
    _d.setdefault("label_status", "pending")
    for _t in _d["tech"]:
        _t.setdefault("status", "pending")
        _t.setdefault("source", DIVISION_SOURCE[_d["id"]])

# Chapter 03 — the Technology universe. Area names are working labels (see label_status) and
# each area points at its division's content above; visuals are illustrative simulations.
UNIVERSE = {
    "title": "The technology universe",
    "intro": "Four worlds of science. Turn the ring, choose a world and step inside.",
    "legend": {
        "simulation": "Illustrative simulation, not instrument data",
        "labels": "Working area names, pending confirmation",
        "products": "Product details pending validation",
    },
    "areas": [
        {
            "id": "analytical",
            "division": "Analytical Sciences",
            "accent": "cyan",
            "visual": "column",
            "question": "Which molecules are in this sample?",
            "teaser": "Separate a mixture, then weigh every molecule in it.",
            "experience": "available",
            "journeys": [
                {"label": "How LC works", "track": "observe", "kind": "lc", "what": "The LC system part by part: pump, injector, column, detector."},
                {"label": "How MS works", "track": "observe", "kind": "ms", "what": "Ion source, quadrupole and detector, opened up."},
                {"label": "Become the sample", "track": "ride", "kind": "lc", "what": "Choose a molecule and travel through the column yourself."},
                {"label": "Ride the ions", "track": "ride", "kind": "ms", "what": "Ionise, fly through the mass spectrometer, land in the spectrum."},
            ],
        },
        {
            "id": "biosciences",
            "division": "Biosciences",
            "accent": "violet",
            "visual": "flow",
            "question": "Which cells are in this sample, and what are they doing?",
            "teaser": "Cells pass a laser one at a time; the light they give off reveals what they are.",
            "experience": "in-progress",
            "coming": "Label cells, send them past the lasers, and gate the populations yourself.",
        },
        {
            "id": "diagnostics",
            "division": "Advanced Diagnostics",
            "accent": "mint",
            "visual": "culture",
            "question": "Is this patient infected, with what, and what will treat it?",
            "teaser": "Microbes growing in a blood culture slowly light the sensor until the bottle flags positive.",
            "experience": "in-progress",
            "coming": "Follow one patient sample from blood culture to identification and the right antibiotic.",
            "note": "Clinical flow cytometry applications, such as immunophenotyping and CD4 counts, belong here; the technology itself is explained in Biosciences.",
        },
        {
            "id": "materials",
            "division": "Materials Sciences",
            "accent": "blue",
            "visual": "lattice",
            "question": "How will this material behave when it's heated, stretched or made to flow?",
            "teaser": "Heat a crystal: it vibrates harder, then loses its order at the melting point.",
            "experience": "in-progress",
            "coming": "Heat, stretch and shear a material, and read what the instruments see.",
        },
    ],
}
