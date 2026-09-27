import canon from "./samples/canon_in_d_macro.tmd?raw";
import landingAtTaoyuan from "./samples/landing-at-taoyuan.tmd?raw";
import legacy from "./samples/legacy.tmd?raw";
import sandiansanye from "./samples/sandiansanye.tmd?raw";
import starter from "./samples/starter.tmd?raw";

export interface TMDSample {
  id: string;
  name: string;
  category: string;
  content: string;
}

export const SAMPLES: TMDSample[] = [
  {
    id: "starter_template",
    name: "《小星星》(入門示範)",
    category: "Template",
    content: starter,
  },
  {
    id: "sandiansanye",
    name: "《三天三夜》",
    category: "Classic Pop / Dance",
    content: sandiansanye,
  },
  {
    id: "canon",
    name: "《D 大調卡農》",
    category: "Classical",
    content: canon,
  },
  {
    id: "landing_at_taoyuan",
    name: "《降落桃園狂想曲》",
    category: "Orchestral / Rhapsody",
    content: landingAtTaoyuan,
  },
  {
    id: "legacy",
    name: "《Legacy》",
    category: "Post-Rock / Ambient",
    content: legacy,
  },
];
