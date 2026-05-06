// ─── PRODUCT PRICING CONFIG ───────────────────────────────────────────────────
// Edit prices here. All pages load this file.
// Structure: variants[] holds each dose/option. Special bundle keys per product.
const PRICING = {
  'Adamax':          { variants: [{ dose: '5mg',       price: 79    }] },
  'AHK-CU':          { variants: [{ dose: '10mg',      price: 48    }] },
  'ARA-290':         { variants: [{ dose: '10mg', price: 65 }, { dose: '30mg', price: 89 }] },
  'BPC-157': {
    variants:            [{ dose: '1 vial', price: 65 }],
    bundle2Total:        120,   // 2 vials total
    bundle3PlusPerVial:  50,    // $50/vial floor for 3+
  },
  'BPC-157 / TB-500 Blend': {
    variants:   [{ dose: '10mg/10mg', price: 120 }],
  },
  'Cagrilintide':    { variants: [{ dose: '4.5mg',     price: 75    }] },
  'Cartalax':        { variants: [{ dose: '20mg',      price: 89    }] },
  'CJC-1295':        { variants: [{ dose: 'No DAC 10mg', price: 79 }, { dose: 'w/ DAC 5mg', price: 79 }] },
  'DSIP':            { variants: [{ dose: '10mg',      price: 65    }], bundle2Total: 75  },
  'GHK-CU':          { variants: [{ dose: '100mg',     price: 90    }], bundle2Total: 150 },
  'GLP-1 S':         { variants: [{ dose: '5mg', price: 45 }, { dose: '10mg', price: 70 }, { dose: '20mg', price: 120 }] },
  'GLP-2 T':         { variants: [
    { dose: '5mg',  price: 45  }, { dose: '10mg', price: 85  }, { dose: '15mg', price: 105 },
    { dose: '20mg', price: 120 }, { dose: '25mg', price: 150 }, { dose: '30mg', price: 180 },
    { dose: '40mg', price: 200 }, { dose: '50mg', price: 250 }, { dose: '60mg', price: 270 },
  ]},
  'GLP-3 R': {
    variants: [
      { dose: '12mg', price: 114, bundle3PlusPerVial: 99 },
      { dose: '18mg', price: 144 },
      { dose: '20mg', price: 160 },
      { dose: '24mg', price: 174 },
      { dose: '30mg', price: 200 },
      { dose: '40mg', price: 224 },
      { dose: '48mg', price: 260 },
      { dose: '60mg', price: 280 },
    ],
  },
  'Glow 70 Blend':   { variants: [{ dose: '70mg',      price: 130   }] },
  'Glutathione':     { variants: [{ dose: '1760mg',    price: 85    }] },
  'HHB Hair Skin Nails Amino Blend': { variants: [{ dose: 'Standard', price: 79 }] },
  'IGF-1 LR3':       { variants: [{ dose: '1mg',       price: 89    }] },
  'Ipamorelin':      { variants: [{ dose: '5mg', price: 65 }, { dose: '10mg', price: 79 }] },
  'Kisspeptin':      { variants: [{ dose: '10mg',      price: 75    }] },
  'KLOW 80':         { variants: [{ dose: '80mg',      price: 140   }] },
  'KPV':             { variants: [{ dose: '10mg', price: 65, bundle2Total: 88 }, { dose: '30mg', price: 85 }] },
  'Lipo-C':          { variants: [{ dose: 'Standard',  price: 79    }] },
  'Melanotan I':     { variants: [{ dose: '10mg',      price: 65    }] },
  'Melanotan II':    { variants: [{ dose: '10mg',      price: 65    }] },
  'MOTS-C':          { variants: [{ dose: '10mg', price: 50 }, { dose: '30mg', price: 130 }] },
  'NA Selank Amidate': { variants: [{ dose: '30mg',   price: 120   }], bundle2Total: 234 },
  'NA Semax Amidate':  { variants: [{ dose: '30mg',   price: 120   }] },
  'NAD+':            { variants: [{ dose: '500mg', price: 70 }, { dose: '1000mg', price: 100 }] },
  'Prostamax':       { variants: [{ dose: '20mg',      price: 79    }] },
  'PT-141':          { variants: [{ dose: '10mg',      price: 65    }] },
  'Selank':          { variants: [{ dose: '10mg',      price: 60    }] },
  'Semax':           { variants: [{ dose: '10mg',      price: 60    }] },
  'Sermorelin':      { variants: [{ dose: '10mg',      price: 89    }] },
  'Setmelanotide':   { variants: [{ dose: '10mg',      price: 85    }] },
  'Snap-8':          { variants: [{ dose: '10mg',      price: 50    }] },
  'SS-31':           { variants: [{ dose: '50mg',      price: 119   }] },
  'Survodutide':     { variants: [{ dose: '6mg', price: 85 }, { dose: '12mg', price: 99 }] },
  'TA1 Thymosin Alpha': { variants: [{ dose: '10mg',  price: 70    }], bundle2Total: 98  },
  'TB-500': {
    variants:           [{ dose: '1 vial', price: 75 }],
    bundle2Total:       140,
    bundle3PlusPerVial: 65,
  },
  'Tesamorelin':     { variants: [{ dose: '10mg',      price: 89    }] },
  'VIP Vasoactive Intestinal Peptide': { variants: [{ dose: '5mg', price: 75 }], bundle2Total: 150 },
  'Hospira BAC Water Bacteriostatic':  { variants: [{ dose: 'Standard', price: 25 }], bundle2PlusPerVial: 19.99 },
};

// ─── PROMO CODES ─────────────────────────────────────────────────────────────
const PROMO_CODES = {
  'HUNTER10': 10, 'JESKA10': 10, 'JOSH10': 10, 'BRE10': 10,
  'MOOSE20': 20,  'MOOSE10': 10, 'BRAND10': 10, 'RACHEL10': 10,
};

// ─── SHIPPING RATES ───────────────────────────────────────────────────────────
const SHIP_RATES = { standard: 10, expedited: 25, overnight: 50 };
const FREE_SHIPPING_THRESHOLD = 150;

// ─── CART PRICING LOGIC ───────────────────────────────────────────────────────
// Shared by cart.html and order.html. Do not redefine locally.

function itemEffectiveTotal(item) {
  // BPC-157: tiered pricing — $65 / $120 / $50 per vial for 3+
  if (item.name === 'BPC-157') {
    if (item.qty === 1) return 65;
    if (item.qty === 2) return 120;
    if (item.qty <= 4) return 50 * item.qty;
    return 42 * item.qty;
  }
  // TB-500: tiered pricing — $75 / $140 / $65 per vial for 3+
  if (item.name === 'TB-500') {
    if (item.qty === 1) return 75;
    if (item.qty === 2) return 140;
    if (item.qty <= 4) return 65 * item.qty;
    return 53 * item.qty;
  }
  // Wolverine Blend (BPC-157 / TB-500 Blend): $120 / $110 each for 2 / $100 each for 3+
  if (item.name === 'BPC-157 / TB-500 Blend') {
    if (item.qty === 1) return 120;
    if (item.qty === 2) return 220;
    return 100 * item.qty;
  }
  // Glow 70 Blend: $130 / $125 each for 2 / $120 each for 3+
  if (item.name === 'Glow 70 Blend') {
    if (item.qty === 1) return 130;
    if (item.qty === 2) return 250;
    return 120 * item.qty;
  }
  // KLOW 80: $140 / $135 each for 2 / $130 each for 3+
  if (item.name === 'KLOW 80') {
    if (item.qty === 1) return 140;
    if (item.qty === 2) return 270;
    return 130 * item.qty;
  }
  // GLP-3 R 12mg: $99/vial for 3+
  if (item.name === 'GLP-3 R' && item.dose === '12mg' && item.qty >= 3) {
    return 99 * item.qty;
  }
  // BAC Water: floor at $19.99/vial for 2+
  if (item.name && item.name.indexOf('BAC Water') !== -1 && item.qty >= 2) {
    return 19.99 * item.qty;
  }
  // Bundled products (bundlePrice set at add-to-cart time)
  if (item.bundlePrice) {
    if (item.qty === 1) return item.price;
    var bundlePerVial = item.bundlePrice / 2;
    if (item.qty === 2) return item.bundlePrice;
    var rate3plus = Math.max(0, bundlePerVial - 5);
    return rate3plus * item.qty;
  }
  // Generic non-bundled
  if (item.qty === 1) return item.price;
  if (item.qty === 2) return (item.price - 5) * 2;
  return Math.max(0, item.price - 10) * item.qty;
}

function itemBundleSavings(item) {
  return Math.max(0, (item.price * item.qty) - itemEffectiveTotal(item));
}
