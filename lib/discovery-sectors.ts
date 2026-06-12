export type DiscoverySectorConfig = {
  id: string;
  name: string;
  theme: string;
  terms: string[];
  catalysts: string[];
  companyEvidenceQueries: string[];
};

export const discoverySectors: DiscoverySectorConfig[] = [
  {
    id: "defense-drone-systems",
    name: "Defense & Drone Systems",
    theme: "Defense & Drone Systems",
    terms: [
      "defense contractor",
      "defence contractor",
      "defense procurement",
      "defence procurement",
      "military contract",
      "army contract",
      "navy contract",
      "air force contract",
      "missile defense",
      "air defense",
      "radar",
      "sensor systems",
      "electronic warfare",
      "munitions",
      "ammunition",
      "artillery",
      "counter-drone",
      "counter drone",
      "C-UAS",
      "anti-drone",
      "drone defense",
      "high energy laser",
      "directed energy",
      "loitering munition",
      "unmanned systems",
      "defense electronics",
      "secure communications",
      "shipbuilding",
      "autonomous defense",
      "military software"
    ],
    catalysts: ["contract", "order", "award", "procurement", "production", "selected", "funding", "backlog", "delivery"],
    companyEvidenceQueries: [
      "defense contract award",
      "military procurement order",
      "missile defense contract",
      "electronic warfare award",
      "radar sensor systems contract",
      "counter-drone contract"
    ]
  },
  {
    id: "pharma-biotech",
    name: "Pharma & Biotech Platforms",
    theme: "Pharma & Biotech Platforms",
    terms: [
      "gene editing",
      "crispr",
      "clinical trial",
      "phase 2",
      "phase 3",
      "fda approval",
      "breakthrough therapy",
      "drug discovery",
      "biomanufacturing",
      "cell therapy",
      "gene therapy",
      "radiopharma",
      "antibody drug conjugate",
      "obesity drug",
      "rare disease drug",
      "platform biotech"
    ],
    catalysts: ["approval", "trial", "data", "partnership", "license", "funding", "milestone"],
    companyEvidenceQueries: [
      "clinical trial data",
      "FDA approval",
      "biotech partnership",
      "phase 2 positive data",
      "phase 3 endpoint",
      "license agreement milestone"
    ]
  },
  {
    id: "energy-generation",
    name: "Energy Generation",
    theme: "Energy Generation",
    terms: [
      "nuclear",
      "small modular reactor",
      "SMR",
      "geothermal",
      "gas turbine",
      "power plant",
      "grid power",
      "baseload",
      "fusion",
      "natural gas generation",
      "power purchase agreement",
      "utility scale power",
      "data center power",
      "hydrogen power"
    ],
    catalysts: ["contract", "permit", "approval", "order", "funding", "partnership", "deployment"],
    companyEvidenceQueries: [
      "power generation contract",
      "energy project approval",
      "grid power order",
      "data center power agreement",
      "small modular reactor approval"
    ]
  },
  {
    id: "energy-storage-grid",
    name: "Energy Storage & Grid",
    theme: "Energy Storage & Grid",
    terms: [
      "battery storage",
      "grid storage",
      "BESS",
      "transformer",
      "grid upgrade",
      "power electronics",
      "lithium battery",
      "long duration storage",
      "inverter",
      "switchgear",
      "high voltage equipment",
      "substation",
      "grid interconnection",
      "battery recycling"
    ],
    catalysts: ["contract", "order", "award", "deployment", "capacity", "partnership", "funding"],
    companyEvidenceQueries: [
      "battery storage contract",
      "grid storage order",
      "grid upgrade award",
      "transformer order",
      "substation contract",
      "power electronics supply agreement"
    ]
  },
  {
    id: "critical-resources-mining",
    name: "Critical Resources & Mining",
    theme: "Critical Resources & Mining",
    terms: [
      "rare earth",
      "lithium",
      "copper",
      "uranium",
      "graphite",
      "nickel",
      "critical minerals",
      "mining permit",
      "offtake",
      "antimony",
      "gallium",
      "germanium",
      "tungsten",
      "magnet materials",
      "mineral processing",
      "domestic mining"
    ],
    catalysts: ["offtake", "permit", "discovery", "funding", "contract", "approval", "production"],
    companyEvidenceQueries: [
      "critical minerals offtake",
      "mining permit approval",
      "resource discovery",
      "rare earth supply agreement",
      "mineral processing funding",
      "uranium production restart"
    ]
  },
  {
    id: "semiconductor-ai-infra",
    name: "Semiconductor & AI Infrastructure",
    theme: "Semiconductor & AI Infrastructure",
    terms: [
      "AI data center",
      "semiconductor equipment",
      "advanced packaging",
      "HBM memory",
      "EUV",
      "foundry",
      "wafer fabrication",
      "AI accelerator",
      "optical interconnect",
      "liquid cooling",
      "semiconductor capacity",
      "chiplet",
      "EDA software",
      "test equipment",
      "metrology",
      "substrate",
      "co-packaged optics",
      "data center networking",
      "power management chip",
      "silicon photonics"
    ],
    catalysts: ["order", "contract", "capacity", "partnership", "supply agreement", "funding", "launch"],
    companyEvidenceQueries: [
      "AI data center order",
      "semiconductor equipment contract",
      "advanced packaging capacity",
      "HBM supply agreement",
      "AI accelerator supply contract",
      "chip equipment order",
      "data center liquid cooling order",
      "optical networking AI data center contract",
      "semiconductor test equipment order",
      "EDA semiconductor design win"
    ]
  },
  {
    id: "advanced-engineering",
    name: "Advanced Engineering",
    theme: "Advanced Engineering",
    terms: [
      "automation",
      "precision manufacturing",
      "industrial robotics",
      "additive manufacturing",
      "sensor",
      "inspection system",
      "factory automation",
      "machine vision",
      "CNC",
      "digital manufacturing",
      "industrial software",
      "quality inspection"
    ],
    catalysts: ["contract", "order", "award", "deployment", "partnership", "production", "cost reduction"],
    companyEvidenceQueries: [
      "industrial automation contract",
      "advanced manufacturing order",
      "factory automation partnership",
      "machine vision contract",
      "additive manufacturing production order"
    ]
  },
  {
    id: "space-satellites",
    name: "Space & Satellites",
    theme: "Space & Satellites",
    terms: [
      "satellite",
      "launch contract",
      "space systems",
      "earth observation",
      "satellite constellation",
      "space defense",
      "orbital",
      "space situational awareness",
      "satellite communications",
      "lunar",
      "hyperspectral",
      "space logistics"
    ],
    catalysts: ["contract", "award", "launch", "selected", "funding", "order", "deployment"],
    companyEvidenceQueries: [
      "satellite contract",
      "space systems award",
      "launch contract",
      "space defense contract",
      "earth observation award"
    ]
  },
  {
    id: "cybersecurity",
    name: "Cybersecurity",
    theme: "Cybersecurity",
    terms: [
      "cybersecurity",
      "zero trust",
      "ransomware",
      "identity security",
      "cloud security",
      "endpoint security",
      "government cyber",
      "secure access service edge",
      "SASE",
      "SIEM",
      "XDR",
      "data security",
      "application security",
      "post quantum cryptography"
    ],
    catalysts: ["contract", "award", "partnership", "selected", "breach", "funding", "platform"],
    companyEvidenceQueries: [
      "cybersecurity contract",
      "government cyber award",
      "zero trust platform",
      "identity security contract",
      "cloud security partnership",
      "post quantum cryptography contract"
    ]
  },
  {
    id: "robotics-automation",
    name: "Robotics & Automation",
    theme: "Robotics & Automation",
    terms: [
      "robotics",
      "humanoid robot",
      "warehouse automation",
      "autonomous robot",
      "surgical robot",
      "robot fleet",
      "industrial robot",
      "AMR",
      "autonomous mobile robot",
      "cobot",
      "robotaxi",
      "machine vision robotics",
      "field robotics",
      "underwater robotics"
    ],
    catalysts: ["contract", "order", "deployment", "partnership", "production", "launch", "funding"],
    companyEvidenceQueries: [
      "robotics contract",
      "automation deployment",
      "robot fleet order",
      "warehouse automation contract",
      "surgical robot approval",
      "autonomous mobile robot order"
    ]
  }
];

export function getDiscoverySector(id: string): DiscoverySectorConfig | null {
  return discoverySectors.find((sector) => sector.id === id) ?? null;
}
