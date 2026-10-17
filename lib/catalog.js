// Product categories shown on the site. Add a new one here (and in the
// products table's "category" values) if you ever want another group.
const CATEGORIES = [
  { key: 'boq',            en: 'BOQ Templates',          am: 'የመጠን ዝርዝር (BOQ) ቅጾች',   blurb_en: 'Bill of Quantities formats in Excel, ready to fill in.',            blurb_am: 'ለመሙላት ዝግጁ የሆኑ የExcel የመጠን ዝርዝር ቅጾች።' },
  { key: 'cost_breakdown', en: 'Cost Breakdown Sheets',  am: 'የወጪ ትንተና ሉሆች',          blurb_en: 'Unit rate analysis and cost build-up workbooks in Excel.',          blurb_am: 'የዋጋ ትንተና እና የወጪ ስሌት የExcel ሰነዶች።' },
  { key: 'agreement',      en: 'Agreements & Contracts', am: 'ስምምነቶች እና ውሎች',        blurb_en: 'Editable Word agreements for construction work and supply.',        blurb_am: 'ለግንባታ ስራ እና አቅርቦት የሚሆኑ ሊስተካከሉ የሚችሉ የWord ስምምነቶች።' },
  { key: 'other',          en: 'Other Documents',        am: 'ሌሎች ሰነዶች',              blurb_en: 'Other construction documents and forms.',                           blurb_am: 'ሌሎች የግንባታ ሰነዶች እና ቅጾች።' }
];

const BY_KEY = Object.fromEntries(CATEGORIES.map(c => [c.key, c]));

function category(key) { return BY_KEY[key] || BY_KEY.other; }

module.exports = { CATEGORIES, category };
